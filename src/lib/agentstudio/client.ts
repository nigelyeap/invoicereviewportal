import { getEnv } from "@/lib/env";
import { INVOICE_PARSE_MODEL, INVOICE_PARSE_PROMPT } from "./invoiceParsePrompt";
import type { AgentStudioClient, AgentStudioExtractionResult, OcrDocument } from "./types";

/**
 * Live AgentStudio client, OCR-mode transport.
 *
 * HISTORY (kept short deliberately -- see git history / the plan doc for
 * the full narrative if it's ever needed): the portal originally drove
 * AgentStudio's WS dialog transport (segment_code -> REST file-attach ->
 * open a WS -> "question" turn). That path had two separate bugs (a broken
 * `{{variable}}` reference in the flow, and file attachments never actually
 * becoming visible to the WS turn -- "I don't see any attached document"),
 * and even working would only ever have produced freeform chat markdown
 * with zero confidence/validation/bbox data.
 *
 * REPLACED (2026-08-09) with a direct REST call to AgentStudio's
 * `offline_upload_file` endpoint using its undocumented `extra_params: "ocr"`
 * mode. This bypasses the flow graph and the WS session entirely and runs
 * the uploaded file straight through a specified `parse_model` +
 * `parse_prompt` as a raw structured-extraction call -- verified live
 * against this project's own flow_uuid and "API Call" credentials (no
 * separate OCR-only flow, no cross-client credentials needed). The prompt
 * used below (invoiceParsePrompt.ts) is the exact `parse_prompt` already
 * configured on the real flow's "Upload Invoice" node, so this call
 * exercises the SAME OCR behavior AgentStudio already has built in -- the
 * portal is not doing any OCR/LLM work of its own.
 *
 * CONFIRMED, NON-OBVIOUS GOTCHA (re-verified live 2026-08-09, do not
 * "simplify" this away): the poll response's `data.status` and
 * `data.error_msg` are NOT reliable success/failure signals for this mode.
 * A real, complete, correct extraction was observed to come back as
 * `status: 8` with `error_msg: "flow failed"` -- both of which look like a
 * hard failure -- while `data.parse_content` simultaneously held the full,
 * valid, non-empty structured JSON. (`status: 8` / `error_msg` populated
 * appear to be vestiges of the underlying "run the flow" wrapper this OCR
 * sub-feature reuses; the flow graph itself doesn't actually run in this
 * mode, so its own failure bookkeeping doesn't mean what it normally would.)
 * This client therefore keys success/failure on whether `data.parse_content`
 * is present and non-empty, not on `status`/`error_msg` -- see pollUntilDone().
 */
export function createLiveAgentStudioClient(): AgentStudioClient {
  const env = getEnv();
  const restBase = env.AGENTSTUDIO_REST_BASE_URL;
  const flowUuid = env.AGENTSTUDIO_FLOW_UUID;
  const tenantName = env.AGENTSTUDIO_APICALL_TENANT_NAME;

  // Same "API Call" credential set already proven live for the file-upload
  // REST family (see the old doc comment history) -- these three HEADERS
  // (not secret_id/secret_key in the body) are what authenticate this
  // endpoint family too.
  const headers: Record<string, string> = {
    "cybertron-robot-key": env.AGENTSTUDIO_APICALL_ROBOT_KEY,
    "cybertron-robot-token": env.AGENTSTUDIO_APICALL_ROBOT_TOKEN,
    username: env.AGENTSTUDIO_APICALL_USERNAME,
  };

  const POLL_INTERVAL_MS = 3_000;

  async function extractInvoice(params: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    timeoutMs: number;
    onSubmitted?: (externalJobId: string) => void;
  }): Promise<AgentStudioExtractionResult> {
    const fileBuffer = params.fileBuffer;
    // The "Upload Invoice" node's customized_parse_methods only configures
    // two file_format buckets ("pdf" and "Image") -- see
    // invoiceParsePrompt.ts's doc comment for provenance. Map every
    // non-PDF mime type to "Image", matching that node's own bucketing.
    const fileFormat = params.mimeType === "application/pdf" ? "pdf" : "Image";

    const form = new FormData();
    form.append("flow_uuid", flowUuid);
    form.append("tenant_name", tenantName);
    form.append("file_name", params.fileName);
    form.append("extra_params", "ocr");
    form.append("file_format", fileFormat);
    form.append("parse_model", INVOICE_PARSE_MODEL);
    form.append("parse_prompt", INVOICE_PARSE_PROMPT);
    form.append("file", new Blob([new Uint8Array(fileBuffer)], { type: params.mimeType }), params.fileName);

    const submitRes = await fetch(`${restBase}/openapi/v1/chatflow/offline_upload_file/`, {
      method: "POST",
      headers,
      body: form,
    });
    const submitJson = await submitRes.json();
    const externalJobId = submitJson?.data?.id;
    if (submitJson?.code !== "000000" || externalJobId === undefined || externalJobId === null) {
      throw new Error(`offline_upload_file (extra_params=ocr) submit failed: ${JSON.stringify(submitJson)}`);
    }
    const externalJobIdStr = String(externalJobId);

    try {
      params.onSubmitted?.(externalJobIdStr);
    } catch {
      // best-effort observability hook only, must never fail the extraction
    }

    return pollUntilDone({ restBase, headers, externalJobId: externalJobIdStr, timeoutMs: params.timeoutMs, pollIntervalMs: POLL_INTERVAL_MS });
  }

  return { extractInvoice };
}

async function pollUntilDone(params: {
  restBase: string;
  headers: Record<string, string>;
  externalJobId: string;
  timeoutMs: number;
  pollIntervalMs: number;
}): Promise<AgentStudioExtractionResult> {
  const { restBase, headers, externalJobId, timeoutMs, pollIntervalMs } = params;
  const deadline = Date.now() + timeoutMs;
  let lastStatusJson: unknown = null;

  while (Date.now() < deadline) {
    await delay(pollIntervalMs);

    const statusRes = await fetch(
      `${restBase}/openapi/v1/chatflow/get_offline_file_status/?file_id=${encodeURIComponent(externalJobId)}`,
      { method: "GET", headers },
    );
    const statusJson = await statusRes.json();
    lastStatusJson = statusJson;

    if (statusJson?.code !== "000000") {
      // Transient errors on the polling GET itself (not a terminal answer from AgentStudio) -- keep polling.
      continue;
    }

    const rawParseContent = statusJson?.data?.parse_content;
    const parsed = tryParseOcrJson(rawParseContent);
    if (parsed) {
      return { parseContent: parsed, rawResponse: statusJson, externalJobId };
    }

    const errorMsg = statusJson?.data?.error_msg;
    // See file-level doc comment: error_msg alone (without empty parse_content
    // having exhausted the deadline) is NOT trusted as a terminal failure signal
    // for this mode -- a real success has been observed with error_msg set.
    // Just keep polling; the deadline below is the actual failure backstop.
    void errorMsg;
  }

  const lastErrorMsg =
    lastStatusJson && typeof lastStatusJson === "object" && "data" in lastStatusJson
      ? (lastStatusJson as { data?: { error_msg?: string } }).data?.error_msg
      : undefined;
  throw new Error(
    `extractInvoice timed out after ${timeoutMs}ms waiting for a non-empty parse_content ` +
      `(externalJobId=${externalJobId}${lastErrorMsg ? `, last error_msg=${JSON.stringify(lastErrorMsg)}` : ""})`,
  );
}

/**
 * `data.parse_content` has been observed in two shapes:
 *  - `[]` (empty array) while the job is still processing
 *  - a markdown-fenced JSON string (` ```json\n{...}\n``` `) once done
 * Returns the parsed object, or null if there's nothing usable yet.
 */
function tryParseOcrJson(rawParseContent: unknown): OcrDocument | null {
  if (rawParseContent === null || rawParseContent === undefined) return null;
  if (Array.isArray(rawParseContent) && rawParseContent.length === 0) return null;

  let text: string;
  if (typeof rawParseContent === "string") {
    if (rawParseContent.trim() === "") return null;
    text = rawParseContent;
  } else {
    // Already-structured (not the fenced-string shape observed live) -- accept as-is defensively.
    return rawParseContent as OcrDocument;
  }

  const fenceMatch = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  const jsonText = fenceMatch ? fenceMatch[1] : text;

  try {
    return JSON.parse(jsonText) as OcrDocument;
  } catch {
    // Not valid/complete JSON yet (mid-stream partial content) -- treat as "not ready", keep polling.
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { getAgentStudioClient } from "@/lib/agentstudio";
import { getStorageAdapter } from "@/lib/storage";
import * as jobService from "@/server/jobService";
import { logger } from "@/lib/logger";
import type { OcrDocument } from "@/lib/agentstudio/types";

/**
 * Runs the full AgentStudio OCR-mode sequence for one just-created job:
 * mark SUBMITTING, submit the file to offline_upload_file (extra_params=ocr),
 * poll until real parse_content is available, then persist ExtractedField
 * rows via jobService.markSucceeded(). See client.ts for why polling keys
 * off parse_content rather than status/error_msg.
 *
 * HISTORY: this used to be worker/submitExtractionJob.ts, invoked by an
 * always-on worker process (worker/index.ts) polling Postgres in a loop and
 * running on a separate host (Railway), because the AgentStudio call could
 * block for minutes and that didn't fit a traditional short-lived
 * serverless request. That constraint no longer applies here: Vercel's
 * Fluid Compute now defaults to a 300s function duration on every plan
 * (including the free Hobby tier), comfortably above this file's own 205s
 * ceiling below, and Next.js's `after()` (src/app/api/documents/route.ts)
 * lets that work run in the background of the SAME request that created
 * the job, without blocking the upload response. So this now runs in-process
 * inside the Next.js app -- no separate worker, no separate host. See
 * DEPLOYMENT.md for the resulting (much simpler) deploy shape.
 *
 * Never throws -- every failure path resolves to a FAILED/TIMED_OUT job
 * status, since the caller (an `after()` callback) has nothing useful to do
 * with a thrown error; the job's status row in Postgres is the only signal
 * the browser's status polling can see.
 */
export async function runExtractionJob(jobId: string): Promise<void> {
  const job = await jobService.markSubmitting(jobId);
  const document = job.document;

  try {
    const client = await getAgentStudioClient();
    const fileBuffer = await getStorageAdapter().readStoredFile(document.storageKey);

    const result = await client.extractInvoice({
      fileBuffer,
      fileName: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      timeoutMs: EXTRACTION_WALL_CLOCK_CEILING_MS,
      onSubmitted: (externalJobId) => {
        jobService.markProcessing(job.id, { externalJobId }).catch((err) => {
          logger.warn({ jobId: job.id, err }, "markProcessing failed (non-fatal, continuing to poll)");
        });
      },
    });

    await jobService.markSucceeded(job.id, {
      parseContent: result.parseContent,
      rawResponse: result.rawResponse,
    });

    logger.info({ jobId: job.id }, "extraction job succeeded");

    // Best-effort second call, chained after extraction rather than a
    // separate trigger -- see runValidationJob()'s doc comment for why a
    // validation failure/timeout here must never affect the extraction's
    // already-persisted SUCCEEDED status.
    await runValidationJob(job.id, {
      ocrResult: result.parseContent,
      fileBuffer,
      fileName: document.originalFilename,
      mimeType: document.mimeType,
    });
  } catch (rawErr) {
    const err = classifyExtractionError(rawErr);
    if (err instanceof ExtractionTimeoutError) {
      logger.error({ jobId: job.id, message: err.message }, "extraction job timed out");
      await jobService.markTimedOut(job.id, err.message);
    } else {
      logger.error({ jobId: job.id, message: err.message }, "extraction job failed");
      await jobService.markFailed(job.id, err.message);
    }
  }
}

/**
 * Runs invoiceValidatePrompt.ts's validation/review call against the
 * OCR result this same request's runExtractionJob() just produced, and
 * persists the resulting "Table 1-5" Markdown report. Called inline (not via
 * a separate trigger) so it rides the same after() background continuation
 * as extraction -- see VALIDATION_WALL_CLOCK_CEILING_MS below and
 * src/app/api/documents/route.ts's maxDuration for the combined time budget
 * this relies on.
 *
 * Deliberately isolated with its own try/catch, same as runExtractionJob's
 * outer one: extraction has already succeeded and been persisted by the time
 * this runs, and a validation failure/timeout is a lesser, independent
 * problem (no report to show) that must never downgrade or overwrite the
 * job's SUCCEEDED extraction status. Never throws, for the same reason
 * runExtractionJob never does.
 */
async function runValidationJob(
  jobId: string,
  params: { ocrResult: OcrDocument; fileBuffer: Buffer; fileName: string; mimeType: string },
): Promise<void> {
  try {
    const client = await getAgentStudioClient();
    const result = await client.validateInvoice({
      ocrResult: params.ocrResult,
      fileBuffer: params.fileBuffer,
      fileName: params.fileName,
      mimeType: params.mimeType,
      timeoutMs: VALIDATION_WALL_CLOCK_CEILING_MS,
      onSubmitted: (externalJobId) => {
        jobService.markValidationProcessing(jobId, { externalJobId }).catch((err) => {
          logger.warn({ jobId, err }, "markValidationProcessing failed (non-fatal, continuing to poll)");
        });
      },
    });

    await jobService.markValidationSucceeded(jobId, {
      reportMarkdown: result.reportMarkdown,
      rawResponse: result.rawResponse,
    });

    logger.info({ jobId }, "validation job succeeded");
  } catch (rawErr) {
    const err = classifyExtractionError(rawErr);
    if (err instanceof ExtractionTimeoutError) {
      logger.error({ jobId, message: err.message }, "validation job timed out");
      await jobService.markValidationTimedOut(jobId, err.message);
    } else {
      logger.error({ jobId, message: err.message }, "validation job failed");
      await jobService.markValidationFailed(jobId, err.message);
    }
  }
}

/**
 * Wall-clock ceiling for one extraction, deliberately past AgentStudio's
 * known ~180s cap on the offline chatflow channel (OCR-mode reuses the same
 * offline_upload_file family of endpoints). Also the reason the upload
 * route sets `export const maxDuration` above this value -- see
 * src/app/api/documents/route.ts.
 */
export const EXTRACTION_WALL_CLOCK_CEILING_MS = 205_000;

/**
 * Wall-clock ceiling for the validation call that's chained after extraction
 * within the SAME request continuation (see runValidationJob() above) --
 * deliberately smaller than EXTRACTION_WALL_CLOCK_CEILING_MS: it's a single
 * LLM pass over already-extracted JSON (not per-page OCR), spike-observed
 * live to complete in well under a minute, and it has to fit in whatever's
 * left of the request's maxDuration budget after extraction. See
 * src/app/api/documents/route.ts's maxDuration for the combined ceiling this
 * relies on (205s + 80s + startup/response overhead, comfortably under
 * Vercel Fluid Compute's 300s default).
 */
export const VALIDATION_WALL_CLOCK_CEILING_MS = 80_000;

export class ExtractionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionTimeoutError";
  }
}

/**
 * Reclassifies a timeout-flavored Error thrown by
 * AgentStudioClient.extractInvoice() (client.ts's pollUntilDone() throws a
 * plain Error whose message contains "timed out" once its own deadline
 * passes) into ExtractionTimeoutError, so runExtractionJob() can mark the
 * job TIMED_OUT (a known, expected failure mode) rather than lumping it in
 * with FAILED.
 */
function classifyExtractionError(err: unknown): Error {
  if (err instanceof Error && /timed out/i.test(err.message)) {
    return new ExtractionTimeoutError(err.message);
  }
  return err instanceof Error ? err : new Error(String(err));
}

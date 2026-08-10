/**
 * Documents the ACTUAL VERIFIED shape of AgentStudio's OCR-mode response
 * (flow_uuid f115685e-93ab-11f1-a55d-425200622189, `offline_upload_file`
 * with `extra_params: "ocr"`), captured live 2026-08-09 -- see
 * __fixtures__/sampleOcrResult.ts for the full real capture (JSON.parse'd)
 * and invoiceParsePrompt.ts for the prompt that produces this shape.
 *
 * SUPERSEDES the old markdown-answer format this file used to document (WS
 * dialog transport, robot_id 5292) -- see client.ts's file-level doc
 * comment for why that transport was replaced. Unlike that format, this one
 * DOES carry confidence, per-field source page, and pixel-normalized
 * bounding boxes -- computed and returned by AgentStudio itself, not by the
 * portal.
 *
 * Observed shape: a single JSON object (delivered inside a
 * ```json ... ``` markdown fence in `data.parse_content`, stripped by
 * client.ts before parser.ts ever sees it) with these top-level sections:
 * `document`, `supplier`, `parties[]`, `invoice`, `line_items[]`, `totals`,
 * `payment_details`, `approval_information`, `stamps_and_handwriting[]`,
 * `raw_text_by_page[]`, `quality_flags[]`, `critical_low_confidence_fields[]`.
 *
 * Most leaf values use a consistent wrapper:
 *   { value, raw_text, confidence, page, bounding_box, alternatives, uncertainty_reason }
 * `bounding_box` is `[x_min, y_min, x_max, y_max]` normalized to 0-1000, or
 * `null` if unavailable. A field AgentStudio couldn't find at all comes back
 * as a bare `null` in its slot, not a wrapper object with null value.
 *
 * THE ONE FLAGGED ASSUMPTION LEFT: this is still LLM output shaped by a
 * prompt (invoiceParsePrompt.ts), not a schema AgentStudio enforces
 * server-side -- there is no hard contract that every field/nesting level
 * is always present. parser.ts is written to degrade gracefully (a missing
 * section just yields fewer ParsedFields, never a thrown error) for exactly
 * this reason, the same way the old markdown parser did for prose drift.
 *
 * CONFIRMED, NON-OBVIOUS GOTCHA: the enclosing poll response's `data.status`
 * and `data.error_msg` are NOT reliable success/failure signals for this
 * mode -- see client.ts's file-level doc comment. Only `data.parse_content`
 * being present and non-empty means "done".
 *
 * CONFIRMED, REAL GAPS vs. the portal's original FieldCatalogEntry set (not
 * a parsing bug -- the schema itself has no source for these):
 *  - No `due_date` anywhere in `invoice`.
 *  - No per-line-item `unit_price` in `line_items[]` (only `amount`).
 *  - No discrete customer email field (an email may appear inline inside a
 *    party's `address` text, but is not broken out separately).
 * These three legacy catalog keys will always come back zero-confidence
 * "not found" until/unless invoiceParsePrompt.ts's schema is extended.
 */

export const OCR_MODE_FORMAT_NOTES = {
  isStructuredJson: true,
  formatDescription:
    "Single JSON object (markdown-fenced in data.parse_content), matching invoiceParsePrompt.ts's REQUIRED OUTPUT " +
    "shape: document/supplier/parties[]/invoice/line_items[]/totals/payment_details/approval_information/etc, " +
    "each leaf field carrying its own {value, raw_text, confidence, page, bounding_box, alternatives, uncertainty_reason}.",
  hasConfidenceData: true,
  hasValidationData: false, // still portal-computed -- see validationRules.ts (arithmetic + data-type shape checks)
  hasBoundingBoxData: true,
  verifiedAgainst: {
    flowUuid: "f115685e-93ab-11f1-a55d-425200622189",
    capturedAt: "2026-08-09",
    transport: "offline_upload_file (extra_params=ocr)",
  },
} as const;

export { SAMPLE_OCR_RESULT } from "./__fixtures__/sampleOcrResult";

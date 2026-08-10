/**
 * Shared types for the AgentStudio integration adapter.
 *
 * PIVOT (2026-08-09): the portal originally talked to AgentStudio's WS
 * dialog transport, got back freeform markdown, and computed its own
 * confidence/validation heuristically (see git history / the plan doc for
 * that narrative). That transport is gone. The portal now calls
 * AgentStudio's `offline_upload_file` endpoint in its undocumented
 * `extra_params: "ocr"` mode (see client.ts), which runs the invoice
 * straight through the SAME OCR/parse prompt already configured on the
 * "Upload Invoice" node of the real flow (see invoiceParsePrompt.ts) and
 * returns genuinely structured JSON with real per-field confidence scores
 * and real pixel-normalized bounding boxes -- no markdown parsing, no
 * portal-invented confidence, no permanently-null sourceBbox.
 *
 * parser.ts is still the one layer to change if the OCR-mode JSON schema
 * itself is ever revised (e.g. the prompt in invoiceParsePrompt.ts is
 * edited to add/rename fields) -- ParsedField[] is still the shape
 * everything downstream (confidence.ts, mapper.ts) consumes.
 */

export type FieldGroup = "HEADER" | "LINE_ITEM" | "TOTALS";
export type FieldDataType = "STRING" | "NUMBER" | "DATE" | "CURRENCY" | "EMAIL";
export type ValidationStatus = "VALID" | "WARNING" | "INVALID" | "NOT_APPLICABLE";

/** Normalized [x_min, y_min, x_max, y_max] on a 0-1000 scale, per the OCR prompt's contract. */
export type OcrBoundingBox = [number, number, number, number];

/**
 * One "leaf" value in the OCR-mode response -- see the `FIELD FORMAT` /
 * `REQUIRED OUTPUT` sections of invoiceParsePrompt.ts for the authoritative
 * shape. AgentStudio returns `null` in place of this whole object when a
 * field genuinely couldn't be found (not a leaf with null value) -- see
 * OcrLeaf below.
 */
export interface OcrLeafField {
  value: string | number | null;
  raw_text?: string | null;
  confidence?: number | null;
  page?: number | null;
  bounding_box?: OcrBoundingBox | null;
  alternatives?: unknown[];
  uncertainty_reason?: string | null;
}

/** A field slot that AgentStudio may return as a populated leaf or as bare `null`. */
export type OcrLeaf = OcrLeafField | null | undefined;

/** One entry of a grouped line item's `components[]` -- see OcrDocument.line_items. */
export interface OcrLineItemComponent {
  unit?: OcrLeaf;
  model?: OcrLeaf;
  quantity?: OcrLeaf;
  description?: OcrLeaf;
  dimensions?: unknown[];
  source_page?: number | null;
  serial_numbers?: OcrLeafField[];
  component_ocr_confidence?: number;
}

/**
 * The parsed (JSON.parse'd, code-fence-stripped) shape of `parse_content`
 * from the OCR-mode response. Kept loose/partial (most nested shapes are
 * `unknown`/`Record<string, unknown>`) since this is LLM JSON output guided
 * by a prompt, not a machine-enforced schema -- parser.ts is written to
 * degrade gracefully (a missing/reshaped section just yields fewer
 * ParsedFields, never a thrown error) for the same reason the old markdown
 * parser was.
 */
export interface OcrDocument {
  document?: {
    document_type?: OcrLeaf;
    page_count?: number;
    language?: unknown;
    currency?: OcrLeaf;
    overall_ocr_confidence?: number;
  };
  supplier?: {
    name?: OcrLeaf;
    registration_number?: OcrLeaf;
    address?: OcrLeaf;
    telephone?: OcrLeaf;
    fax?: OcrLeaf;
  };
  parties?: Array<{
    name?: OcrLeaf;
    role_as_printed?: OcrLeaf;
    normalized_role?: { value?: string | null; confidence?: number | null } | null;
    address?: OcrLeaf;
  }>;
  invoice?: {
    invoice_number?: OcrLeaf;
    invoice_date?: {
      original?: OcrLeaf;
      normalized_iso?: { value?: string | null; confidence?: number | null } | null;
    } | null;
    location_name?: OcrLeaf;
    location_address?: OcrLeaf;
    purchase_order_number?: OcrLeaf;
    quotation_number?: OcrLeaf;
    payment_terms?: OcrLeaf;
  };
  line_items?: Array<{
    item_number?: OcrLeaf;
    parent_quantity?: OcrLeaf;
    unit?: OcrLeaf;
    description?: OcrLeaf;
    dimensions?: unknown[];
    model?: OcrLeaf;
    serial_numbers?: OcrLeafField[];
    /**
     * Grouped/hierarchical line items (e.g. one "Item" row on the invoice
     * that actually bundles several distinct products) report their own
     * `description`/`model` as a short top-line summary and put the real
     * per-product detail here -- own description, model, serial numbers.
     * Confirmed real, present at 0.95+ confidence on documents whose line
     * items are structured this way (see parser.ts's buildLineItemDescription).
     */
    components?: OcrLineItemComponent[];
    amount?: OcrLeaf & { currency?: string | null };
    source_pages?: number[];
    line_item_ocr_confidence?: number;
  }>;
  totals?: {
    subtotal?: OcrLeaf;
    discount?: OcrLeaf;
    tax?: OcrLeaf;
    grand_total?: OcrLeaf;
    financed_amount?: OcrLeaf;
    amount_label_as_printed?: OcrLeaf;
  };
  payment_details?: {
    payment_instruction?: OcrLeaf;
    beneficiary_name?: OcrLeaf;
    beneficiary_registration_number?: OcrLeaf;
    bank_name?: OcrLeaf;
    bank_registration_number?: OcrLeaf;
    account_number?: OcrLeaf;
  };
  approval_information?: {
    date_paid?: OcrLeaf;
    bank_and_cheque_number?: OcrLeaf;
    payment_amount?: OcrLeaf;
    journal_number?: OcrLeaf;
    prepared_by?: OcrLeaf;
    checked_and_approved_by?: OcrLeaf;
    signatures_detected?: unknown[];
  };
  stamps_and_handwriting?: unknown[];
  raw_text_by_page?: Array<{ page: number; raw_text: string; page_ocr_confidence?: number }>;
  quality_flags?: unknown[];
  critical_low_confidence_fields?: unknown[];
}

/** A field as extracted from the OCR-mode JSON, before catalog/template mapping. */
export interface ParsedField {
  /** Canonical key, e.g. "invoice_number" or "line_item.0.description". */
  key: string;
  /** Canonical subfield key with no index, e.g. "line_item.description". Used to look up FieldCatalogEntry. */
  catalogKey: string;
  label: string;
  value: string;
  /** raw_text as reported by AgentStudio (falls back to the stringified value if raw_text is absent). */
  sourceText: string;
  group: FieldGroup;
  lineItemIndex?: number;
  /** Native AgentStudio OCR confidence (0-1), null if this leaf didn't report one. */
  confidence: number | null;
  /** 1-based source page, null if unknown/not applicable. */
  sourcePage: number | null;
  /** Normalized [x_min,y_min,x_max,y_max] on a 0-1000 scale, null if unknown/not applicable. */
  sourceBbox: OcrBoundingBox | null;
  uncertaintyReason?: string | null;
}

export interface ParseResult {
  fields: ParsedField[];
}

export interface ComputedConfidence {
  score: number; // 0-1
  remark: string;
}

export interface ComputedValidation {
  status: ValidationStatus;
  message: string | null;
}

/** Result of a completed OCR-mode extraction (submit + poll to a terminal, content-bearing state). */
export interface AgentStudioExtractionResult {
  /** The parsed (JSON.parse'd) structured extraction -- see OcrDocument. */
  parseContent: OcrDocument;
  /** Full raw poll response, kept for audit/reprocessing (stored in ExtractionJob.rawResponse). */
  rawResponse: unknown;
  /** AgentStudio's numeric OCR job id (the `file_id` query param for get_offline_file_status), stringified. */
  externalJobId: string;
}

/**
 * The interface both the real (`client.ts`) and mock (`mockClient.ts`)
 * AgentStudio clients implement. Nothing outside src/server/*Service.ts and
 * worker/* should ever import a concrete implementation directly -- always
 * go through getAgentStudioClient() in index.ts.
 */
export interface AgentStudioClient {
  extractInvoice(params: {
    /**
     * Raw file bytes, already fetched from the storage adapter by the
     * caller (worker/submitExtractionJob.ts) -- deliberately not a local
     * disk path, since the storage adapter may be remote (e.g. Vercel
     * Blob) and the worker isn't guaranteed to run on the same host/disk
     * as whatever wrote the file.
     */
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    /** Wall-clock ceiling in ms before the client gives up polling and throws. */
    timeoutMs: number;
    /** Called once the submit call returns a job id, before polling starts -- lets the caller record it for observability on a stuck job. Best-effort; a throwing callback must not fail the extraction. */
    onSubmitted?: (externalJobId: string) => void;
  }): Promise<AgentStudioExtractionResult>;
}

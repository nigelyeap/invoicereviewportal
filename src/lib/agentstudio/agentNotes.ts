import type { OcrDocument } from "./types";

/**
 * Surfaces the genuinely agent-authored prose that already exists in
 * AgentStudio's OCR-mode response but was previously parsed into types.ts
 * and then never read anywhere -- `quality_flags`, `critical_low_confidence_fields`,
 * `stamps_and_handwriting`, and `raw_text_by_page`. These are document-level
 * remarks and the raw per-page OCR text, not per-field extraction data, so
 * they deliberately live outside parser.ts/mapper.ts's ParsedField pipeline.
 *
 * This is "the agent's own report": distinct from ValidationSummary's
 * per-field confidence/validation write-up, which is the portal's own
 * computed synthesis (confidence.ts / validationRules.ts). Both are shown
 * in the "View full report" dialog, clearly separated.
 */

export interface QualityFlagNote {
  page: number | null;
  issue: string;
  severity: string;
  description: string;
}

export interface CriticalLowConfidenceNote {
  fieldPath: string;
  value: string | null;
  confidence: number | null;
  reason: string;
}

export interface StampOrHandwritingNote {
  type: string;
  page: number | null;
  overlapsPrintedText: boolean;
  affectedFields: string[];
  confidence: number | null;
}

export interface RawPageText {
  page: number;
  rawText: string;
  confidence: number | null;
}

export interface AgentNotes {
  qualityFlags: QualityFlagNote[];
  criticalLowConfidenceFields: CriticalLowConfidenceNote[];
  stampsAndHandwriting: StampOrHandwritingNote[];
  rawTextByPage: RawPageText[];
  /** True if AgentStudio flagged anything -- rawTextByPage doesn't count, it's always-available raw material rather than a "note". */
  hasFlaggedNotes: boolean;
}

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Reads the OCR-mode JSON defensively -- same "degrade gracefully, never
 * throw" posture as parser.ts, since this is still LLM output shaped by a
 * prompt (invoiceParsePrompt.ts), not a schema AgentStudio enforces.
 */
export function extractAgentNotes(doc: OcrDocument | null | undefined): AgentNotes {
  const qualityFlags: QualityFlagNote[] = (doc?.quality_flags ?? [])
    .filter((f) => f && (f.description || f.issue))
    .map((f) => ({
      page: f.page ?? null,
      issue: f.issue ?? "other",
      severity: f.severity ?? "low",
      description: f.description ?? "",
    }));

  const criticalLowConfidenceFields: CriticalLowConfidenceNote[] = (doc?.critical_low_confidence_fields ?? [])
    .filter((f) => f && (f.reason || f.field_path))
    .map((f) => ({
      fieldPath: f.field_path ?? "(unknown field)",
      value: stringifyValue(f.value),
      confidence: f.confidence ?? null,
      reason: f.reason ?? "",
    }));

  const stampsAndHandwriting: StampOrHandwritingNote[] = (doc?.stamps_and_handwriting ?? [])
    .filter((s) => s && s.type)
    .map((s) => ({
      type: s.type ?? "unknown",
      page: s.page ?? null,
      overlapsPrintedText: s.overlaps_printed_text ?? false,
      affectedFields: s.affected_fields ?? [],
      confidence: s.confidence ?? null,
    }));

  const rawTextByPage: RawPageText[] = (doc?.raw_text_by_page ?? [])
    .filter((p) => p && p.raw_text && p.raw_text.trim() !== "")
    .map((p) => ({
      page: p.page,
      rawText: p.raw_text,
      confidence: p.page_ocr_confidence ?? null,
    }))
    .sort((a, b) => a.page - b.page);

  return {
    qualityFlags,
    criticalLowConfidenceFields,
    stampsAndHandwriting,
    rawTextByPage,
    hasFlaggedNotes: qualityFlags.length > 0 || criticalLowConfidenceFields.length > 0 || stampsAndHandwriting.length > 0,
  };
}

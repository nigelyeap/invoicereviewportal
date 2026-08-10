import type { ComputedConfidence, FieldDataType, ParsedField } from "./types";

/**
 * Confidence score + human-readable remark for a field.
 *
 * PIVOT (2026-08-09): AgentStudio's OCR-mode response now reports a real
 * per-field confidence score itself (see rawAnswerFormat.ts /
 * __fixtures__/sampleOcrResult.ts) -- this function passes that through
 * directly instead of computing a heuristic. The portal only falls back to
 * a heuristic in the (currently unobserved, but not schema-impossible)
 * case where AgentStudio reports a value with no confidence at all.
 *
 * Priority order:
 *  1. Field wasn't found anywhere in the extraction result -> zero confidence.
 *  2. AgentStudio reported a native confidence for this field -> use it
 *     as-is, remark includes AgentStudio's own `uncertainty_reason` when set.
 *  3. Field present but AgentStudio didn't report a confidence for it ->
 *     fall back to a data-type shape check, same heuristic the old
 *     markdown-era version used for its "shape mismatch" tier.
 */
export function computeFieldConfidence(params: {
  field: ParsedField | null;
  dataType: FieldDataType;
  isRequired: boolean;
}): ComputedConfidence {
  const { field, dataType, isRequired } = params;

  if (!field || !field.value) {
    return {
      score: 0,
      remark: isRequired
        ? "This field is required but was not found anywhere in the extraction result."
        : "This field was not mentioned in the extraction result.",
    };
  }

  if (field.confidence !== null && field.confidence !== undefined) {
    const pct = Math.round(field.confidence * 100);
    const remark = field.uncertaintyReason
      ? `AgentStudio OCR confidence ${pct}%: ${field.uncertaintyReason}`
      : `AgentStudio OCR confidence ${pct}%.`;
    return { score: field.confidence, remark };
  }

  const shapeOk = valueMatchesDataTypeShape(field.value, dataType);
  if (!shapeOk) {
    return {
      score: 0.35,
      remark: `Value was found ("${field.value}") but doesn't look like a valid ${humanizeDataType(dataType)}, and AgentStudio did not report a confidence score for it.`,
    };
  }
  return {
    score: 0.7,
    remark: "Value found and well-formed, but AgentStudio did not report a native confidence score for this field.",
  };
}

export function valueMatchesDataTypeShape(value: string, dataType: FieldDataType): boolean {
  const v = value.trim();
  switch (dataType) {
    case "DATE":
      // Accept common ISO / slash / month-name date shapes rather than one strict format --
      // LLM output date formatting is not guaranteed to be ISO.
      return /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(v) || /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(v);
    case "NUMBER":
      return /^-?[\d,]+(\.\d+)?$/.test(v);
    case "CURRENCY":
      return /^[A-Z]{0,4}\s?-?[\d,]+(\.\d{1,2})?$/.test(v);
    case "EMAIL":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case "STRING":
    default:
      return v.length > 0;
  }
}

function humanizeDataType(dataType: FieldDataType): string {
  switch (dataType) {
    case "DATE":
      return "date";
    case "NUMBER":
      return "number";
    case "CURRENCY":
      return "currency amount";
    case "EMAIL":
      return "email address";
    default:
      return "value";
  }
}

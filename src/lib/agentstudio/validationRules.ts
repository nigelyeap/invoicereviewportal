import type { ComputedValidation, FieldDataType, ParsedField } from "./types";
import { valueMatchesDataTypeShape } from "./confidence";

/**
 * Portal-computed validation (NOT sourced from AgentStudio -- see
 * confidence.ts and rawAnswerFormat.ts for why). Two layers:
 *  1. Per-field data-type shape checks (is it a real date/email/currency).
 *  2. Cross-field invoice arithmetic (line items sum to subtotal; subtotal
 *     + tax = total), which is what actually backs "clearly explain
 *     validation failures" for the totals section.
 */

export function validateDataTypeShape(
  value: string | null | undefined,
  dataType: FieldDataType,
): ComputedValidation {
  if (!value || !value.trim()) {
    return { status: "NOT_APPLICABLE", message: null };
  }
  const ok = valueMatchesDataTypeShape(value, dataType);
  if (ok) {
    return { status: "VALID", message: null };
  }
  return {
    status: "INVALID",
    message: `"${value}" doesn't look like a valid ${humanizeDataType(dataType)}.`,
  };
}

/**
 * Returns arithmetic-check overrides keyed by catalogKey ("subtotal" /
 * "total_amount"). Only present when a check actually fails -- callers
 * should fall back to validateDataTypeShape() for keys not present here.
 */
export function computeArithmeticValidations(fields: ParsedField[]): Record<string, ComputedValidation> {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const lineItemIndices = new Set(
    fields.filter((f) => f.group === "LINE_ITEM" && f.lineItemIndex !== undefined).map((f) => f.lineItemIndex!),
  );

  const lineItemAmounts: number[] = [];
  for (const idx of lineItemIndices) {
    const amt = parseAmount(byKey.get(`line_item.${idx}.amount`)?.value);
    if (amt !== null) lineItemAmounts.push(amt);
  }

  const subtotal = parseAmount(byKey.get("subtotal")?.value);
  const tax = parseAmount(byKey.get("tax_amount")?.value);
  const total = parseAmount(byKey.get("total_amount")?.value);

  const results: Record<string, ComputedValidation> = {};
  const EPSILON = 0.01;

  if (subtotal !== null && lineItemAmounts.length > 0) {
    const sum = round2(lineItemAmounts.reduce((a, b) => a + b, 0));
    if (Math.abs(sum - subtotal) > EPSILON) {
      results["subtotal"] = {
        status: "WARNING",
        message: `Line items sum to ${sum.toFixed(2)}, but Subtotal is ${subtotal.toFixed(2)}.`,
      };
    }
  }

  if (subtotal !== null && tax !== null && total !== null) {
    const expectedTotal = round2(subtotal + tax);
    if (Math.abs(expectedTotal - total) > EPSILON) {
      results["total_amount"] = {
        status: "WARNING",
        message: `Subtotal (${subtotal.toFixed(2)}) + Tax (${tax.toFixed(2)}) = ${expectedTotal.toFixed(2)}, which doesn't match Total Due (${total.toFixed(2)}).`,
      };
    }
  }

  return results;
}

function parseAmount(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

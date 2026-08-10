import { describe, expect, it } from "vitest";
import { parseExtractionResult } from "../parser";
import { computeArithmeticValidations, validateDataTypeShape } from "../validationRules";
import { SAMPLE_OCR_RESULT } from "../__fixtures__/sampleOcrResult";
import type { ParsedField } from "../types";

describe("validateDataTypeShape", () => {
  it("flags a malformed date", () => {
    const result = validateDataTypeShape("not-a-date", "DATE");
    expect(result.status).toBe("INVALID");
  });

  it("accepts an ISO date", () => {
    expect(validateDataTypeShape("2026-07-15", "DATE").status).toBe("VALID");
  });

  it("treats a missing value as not applicable rather than invalid", () => {
    expect(validateDataTypeShape(null, "DATE").status).toBe("NOT_APPLICABLE");
  });
});

describe("computeArithmeticValidations", () => {
  it("finds no mismatches on the real fixture (5000+1500=6500=subtotal; 6500+585=7085=total)", () => {
    const { fields } = parseExtractionResult(SAMPLE_OCR_RESULT);
    const results = computeArithmeticValidations(fields);
    expect(results).toEqual({});
  });

  it("flags a line-item sum mismatch injected into the fixture", () => {
    const { fields } = parseExtractionResult(SAMPLE_OCR_RESULT);
    const tampered: ParsedField[] = fields.map((f) =>
      f.key === "line_item.0.amount" ? { ...f, value: "9999" } : f,
    );
    const results = computeArithmeticValidations(tampered);
    expect(results.subtotal?.status).toBe("WARNING");
    expect(results.subtotal?.message).toContain("11499.00");
  });

  it("flags a subtotal+tax != total mismatch", () => {
    const { fields } = parseExtractionResult(SAMPLE_OCR_RESULT);
    const tampered: ParsedField[] = fields.map((f) =>
      f.key === "total_amount" ? { ...f, value: "9000" } : f,
    );
    const results = computeArithmeticValidations(tampered);
    expect(results.total_amount?.status).toBe("WARNING");
  });
});

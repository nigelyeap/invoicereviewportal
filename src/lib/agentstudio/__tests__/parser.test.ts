import { describe, expect, it } from "vitest";
import { parseExtractionResult } from "../parser";
import { SAMPLE_OCR_RESULT } from "../__fixtures__/sampleOcrResult";
import type { OcrDocument } from "../types";

describe("parseExtractionResult (real captured OCR-mode fixture)", () => {
  const { fields } = parseExtractionResult(SAMPLE_OCR_RESULT);

  const byKey = (key: string) => fields.find((f) => f.key === key);

  it("parses header fields with native confidence", () => {
    expect(byKey("invoice_number")?.value).toBe("INV-2026-0042");
    expect(byKey("invoice_number")?.confidence).toBe(0.99);
    expect(byKey("invoice_date")?.value).toBe("2026-07-15");
    expect(byKey("currency")?.value).toBe("SGD");
  });

  it("has no due_date -- confirmed real schema gap, not a parser bug", () => {
    expect(byKey("due_date")).toBeUndefined();
  });

  it("parses customer (bill_to party) fields from the parties[] array", () => {
    expect(byKey("customer_name")?.value).toBe("Acme Trading Pte Ltd");
    expect(byKey("customer_address")?.value).toBe(
      "21 Marina Boulevard, #05-01\nSingapore 018989\nbilling@acmetrading.com",
    );
  });

  it("has no discrete customer_email -- confirmed real schema gap, email is inline in address text", () => {
    expect(byKey("customer_email")).toBeUndefined();
  });

  it("parses vendor (supplier) fields", () => {
    expect(byKey("vendor_name")?.value).toBe("Dyna Solutions Pte Ltd");
    expect(byKey("vendor_address")?.value).toBe("8 Cross Street, #10-00, Singapore 048424");
  });

  it("parses two line items with description/quantity/amount, carrying bbox + confidence", () => {
    expect(byKey("line_item.0.description")?.value).toBe("AI Platform Subscription - August 2026");
    expect(byKey("line_item.0.quantity")?.value).toBe("1");
    expect(byKey("line_item.0.amount")?.value).toBe("5000");
    expect(byKey("line_item.0.amount")?.sourceBbox).toEqual([744, 409, 810, 423]);
    expect(byKey("line_item.0.amount")?.confidence).toBe(0.99);

    expect(byKey("line_item.1.description")?.value).toBe("Professional Services - Onboarding");
    expect(byKey("line_item.1.quantity")?.value).toBe("10");
    expect(byKey("line_item.1.amount")?.value).toBe("1500");
  });

  it("has no discrete unit_price on line items -- confirmed real schema gap", () => {
    expect(byKey("line_item.0.unit_price")).toBeUndefined();
  });

  it("parses financial summary totals", () => {
    expect(byKey("subtotal")?.value).toBe("6500");
    expect(byKey("tax_amount")?.value).toBe("585");
    expect(byKey("total_amount")?.value).toBe("7085");
  });

  it("assigns correct field groups", () => {
    expect(byKey("invoice_number")?.group).toBe("HEADER");
    expect(byKey("line_item.0.amount")?.group).toBe("LINE_ITEM");
    expect(byKey("total_amount")?.group).toBe("TOTALS");
  });

  it("carries real pixel-normalized bounding boxes through, not permanently null", () => {
    const invoiceNumber = byKey("invoice_number");
    expect(invoiceNumber?.sourceBbox).toEqual([229, 119, 342, 133]);
    expect(invoiceNumber?.sourcePage).toBe(1);
  });

  it("surfaces catch-all fields not in the legacy catalog (e.g. document_type isn't walked, but supplier extras are)", () => {
    // supplier.registration_number is null in the fixture -- confirmed absent, not a bug.
    expect(byKey("supplier.registration_number")).toBeUndefined();
  });

  it("degrades gracefully on an empty/malformed document instead of throwing", () => {
    const empty: OcrDocument = {};
    expect(() => parseExtractionResult(empty)).not.toThrow();
    const result = parseExtractionResult(empty);
    expect(result.fields).toEqual([]);
  });
});

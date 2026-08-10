import { describe, expect, it } from "vitest";
import { buildExtractedFieldRows, type CatalogEntryLike, type TemplateItemLike } from "../mapper";
import { SAMPLE_OCR_RESULT } from "../__fixtures__/sampleOcrResult";
import type { OcrDocument } from "../types";

const CATALOG: CatalogEntryLike[] = [
  { fieldKey: "invoice_number", label: "Invoice Number", dataType: "STRING", fieldGroup: "HEADER", isLineItemField: false },
  { fieldKey: "invoice_date", label: "Invoice Date", dataType: "DATE", fieldGroup: "HEADER", isLineItemField: false },
  { fieldKey: "customer_name", label: "Customer Name", dataType: "STRING", fieldGroup: "HEADER", isLineItemField: false },
  { fieldKey: "subtotal", label: "Subtotal", dataType: "CURRENCY", fieldGroup: "TOTALS", isLineItemField: false },
  { fieldKey: "tax_amount", label: "Tax Amount", dataType: "CURRENCY", fieldGroup: "TOTALS", isLineItemField: false },
  { fieldKey: "total_amount", label: "Total Amount", dataType: "CURRENCY", fieldGroup: "TOTALS", isLineItemField: false },
  { fieldKey: "line_item.description", label: "Description", dataType: "STRING", fieldGroup: "LINE_ITEM", isLineItemField: true },
  { fieldKey: "line_item.amount", label: "Amount", dataType: "CURRENCY", fieldGroup: "LINE_ITEM", isLineItemField: true },
];

describe("buildExtractedFieldRows", () => {
  it("produces rows for catalog fields, plus one row per line item x line-item field", () => {
    const rows = buildExtractedFieldRows({ ocrResult: SAMPLE_OCR_RESULT, catalogEntries: CATALOG });

    const invoiceNumberRow = rows.find((r) => r.fieldKey === "invoice_number");
    expect(invoiceNumberRow?.currentValue).toBe("INV-2026-0042");
    expect(invoiceNumberRow?.validationStatus).toBe("VALID");
    expect(invoiceNumberRow?.confidenceScore).toBe(0.99);
    expect(invoiceNumberRow?.confidenceRemark).toContain("AgentStudio OCR confidence 99%");

    const item0Amount = rows.find((r) => r.fieldKey === "line_item.0.amount");
    expect(item0Amount?.currentValue).toBe("5000");
    expect(item0Amount?.lineItemIndex).toBe(0);
    expect(item0Amount?.sourceBbox).toEqual([744, 409, 810, 423]);

    const item1Desc = rows.find((r) => r.fieldKey === "line_item.1.description");
    expect(item1Desc?.currentValue).toBe("Professional Services - Onboarding");
  });

  it("marks a missing required field with zero confidence", () => {
    const catalogWithMissing: CatalogEntryLike[] = [
      ...CATALOG,
      { fieldKey: "shipping_terms", label: "Shipping Terms", dataType: "STRING", fieldGroup: "HEADER", isLineItemField: false },
    ];
    const template: TemplateItemLike[] = [
      { fieldKey: "shipping_terms", displayOrder: 0, isRequired: true, overrideLabel: null },
    ];
    const rows = buildExtractedFieldRows({ ocrResult: SAMPLE_OCR_RESULT, catalogEntries: catalogWithMissing, template });
    const shippingRow = rows.find((r) => r.fieldKey === "shipping_terms");
    expect(shippingRow?.confidenceScore).toBe(0);
    expect(shippingRow?.confidenceRemark).toContain("required");
  });

  it("applying a template selects only its items and respects displayOrder/overrideLabel", () => {
    const template: TemplateItemLike[] = [
      { fieldKey: "invoice_number", displayOrder: 0, isRequired: true, overrideLabel: "Invoice #" },
    ];
    const rows = buildExtractedFieldRows({ ocrResult: SAMPLE_OCR_RESULT, catalogEntries: CATALOG, template });
    const invoiceNumberRow = rows.find((r) => r.fieldKey === "invoice_number");
    const customerNameRow = rows.find((r) => r.fieldKey === "customer_name");
    expect(invoiceNumberRow?.isSelected).toBe(true);
    expect(invoiceNumberRow?.label).toBe("Invoice #");
    expect(customerNameRow?.isSelected).toBe(false);
  });

  it("surfaces fields the agent produced that aren't in the catalog, unselected", () => {
    const rows = buildExtractedFieldRows({ ocrResult: SAMPLE_OCR_RESULT, catalogEntries: CATALOG });
    const vendorNameRow = rows.find((r) => r.fieldKey === "vendor_name");
    expect(vendorNameRow).toBeDefined();
    expect(vendorNameRow?.isSelected).toBe(false);
    expect(vendorNameRow?.currentValue).toBe("Dyna Solutions Pte Ltd");
  });

  it("flags the arithmetic mismatch on total when tampered", () => {
    const tampered: OcrDocument = {
      ...SAMPLE_OCR_RESULT,
      totals: {
        ...SAMPLE_OCR_RESULT.totals,
        grand_total: { ...SAMPLE_OCR_RESULT.totals!.grand_total!, value: 9000.0 },
      },
    };
    const rows = buildExtractedFieldRows({ ocrResult: tampered, catalogEntries: CATALOG });
    const totalRow = rows.find((r) => r.fieldKey === "total_amount");
    expect(totalRow?.validationStatus).toBe("WARNING");
  });
});

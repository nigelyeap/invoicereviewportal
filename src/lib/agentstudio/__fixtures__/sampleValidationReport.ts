/**
 * Fixture Markdown report matching invoiceValidatePrompt.ts's "Table 1-5"
 * output contract, used by mockClient.ts. Hand-written (not a live capture)
 * to match SAMPLE_OCR_RESULT's synthetic test invoice, since that fixture
 * predates the validation prompt and this is only exercised in mock mode.
 */
export const SAMPLE_VALIDATION_REPORT_MARKDOWN = `# Asset Finance Invoice Review Report
**Analysis Date:** 2026-01-01T00:00:00.000Z

| Field | Value |
| :--- | :--- |
| **Invoice Number** | INV-2026-0001 |
| **Invoice Date** | 01/01/2026 |
| **Supplier** | Sample Supplier Sdn Bhd |
| **Supplier Registration / SSM** | 202601000001 (1234567-A) |
| **Customer / Recipient** | Sample Customer Sdn Bhd |
| **Deliver To** | Sample Site, Kuala Lumpur |
| **Currency** | MYR |
| **Invoice Total** | MYR 1,050.00 |
| **Calculation Check** | 🟢 PASS: Recalculated total is MYR 1,050.00 and matches the invoice total. |
| **Overall Decision** | 🟢 **PASS** |
| **Primary Reason** | All mandatory checks pass and calculations reconcile. |

### Table 2 — Extracted Fields

| Category | Source | Field | Extracted Value | Extraction Confidence | Result | Note |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Document | Page 1 | Document Type | TAX INVOICE | 99% | 🟢 PASS | Document type is appropriate. |
| Invoice | Page 1 | Invoice Number | INV-2026-0001 | 99% | 🟢 PASS | Present in extracted data. |

### Table 3 — Item and Component Breakdown

| # | Item Level | Parent Ref | Description | Qty | Unit Price | Price Source | Discount / Tax | Extracted Amount | Expected Amount | Variance | Confidence | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| P1 | PARENT | NOT_APPLICABLE | Sample line item | 1 | MYR 1,000.00 | EXPLICIT | None | 1,000.00 | 1,000.00 | 0.00 | 98% | 🟢 PASS |
| **Total** | **SUMMARY** | **NOT_APPLICABLE** | **Item Breakdown Total** | **NOT_APPLICABLE** | **NOT_APPLICABLE** | **NOT_APPLICABLE** | **None** | **1,000.00** | **1,000.00** | **0.00** | **NOT_APPLICABLE** | **🟢 PASS** |

### Table 5 — Validation and Final Decision

| Check | Extracted Value | Expected / Formula | Variance | Result | Reason or Required Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Document and Mandatory Fields** | All mandatory fields present. | Required invoice fields must be present. | NOT_APPLICABLE | 🟢 PASS | All mandatory fields are present and valid. |
| **Invoice Total** | 1,050.00 | 1,000.00 + 50.00 tax = 1,050.00 | 0.00 | 🟢 PASS | Recalculated total matches the invoice total. |
| **Overall Decision** | 🟢 **PASS** | All mandatory checks | NOT_APPLICABLE | 🟢 **PASS** | No issues found. |
`;

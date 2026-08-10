import type { OcrDocument } from "../types";

/**
 * Real OCR-mode extraction result captured live from the "Auto Invoice
 * Automation" flow (flow_uuid f115685e-93ab-11f1-a55d-425200622189) via
 * `offline_upload_file` (`extra_params: "ocr"`) on 2026-08-09, in response
 * to the same synthetic test invoice (sample_invoice.pdf) used for the
 * original markdown-era fixture.
 *
 * This is NOT synthetic/hand-written -- it's `JSON.parse()` of the actual
 * `data.parse_content` string from a real, complete `get_offline_file_status`
 * response (code-fence-stripped), used as the ground-truth fixture for
 * parser.ts. All values (company names, amounts, dates) are test data from
 * a synthetic sample document, not any real customer's data.
 *
 * Notable, confirmed-real gaps vs. the old FieldCatalogEntry set (kept as-is
 * rather than papered over -- see parser.ts):
 *  - No `due_date` anywhere in this schema (invoice.* has no such field).
 *  - No per-line-item `unit_price` (line_items[].amount exists; no unit price).
 *  - No discrete customer email field (parties[].address is the only place
 *    an email might appear, inline in the address text).
 */
export const SAMPLE_OCR_RESULT: OcrDocument = {
  document: {
    document_type: {
      value: "INVOICE",
      raw_text: "INVOICE",
      confidence: 0.99,
      page: 1,
      bounding_box: [73, 73, 188, 90],
      alternatives: [],
      uncertainty_reason: null,
    },
    page_count: 1,
    language: [{ value: "en", confidence: 0.99 }],
    currency: {
      value: "SGD",
      raw_text: "SGD",
      confidence: 0.99,
      page: 1,
      bounding_box: [119, 456, 155, 471],
      alternatives: [],
      uncertainty_reason: null,
    },
    overall_ocr_confidence: 0.99,
  },
  supplier: {
    name: {
      value: "Dyna Solutions Pte Ltd",
      raw_text: "Dyna Solutions Pte Ltd",
      confidence: 0.99,
      page: 1,
      bounding_box: [119, 321, 313, 335],
      alternatives: [],
      uncertainty_reason: null,
    },
    registration_number: null,
    address: {
      value: "8 Cross Street, #10-00, Singapore 048424",
      raw_text: "8 Cross Street, #10-00, Singapore 048424",
      confidence: 0.98,
      page: 1,
      bounding_box: [119, 342, 453, 356],
      alternatives: [],
      uncertainty_reason: null,
    },
    telephone: null,
    fax: null,
  },
  parties: [
    {
      name: {
        value: "Acme Trading Pte Ltd",
        raw_text: "Acme Trading Pte Ltd",
        confidence: 0.99,
        page: 1,
        bounding_box: [119, 206, 299, 220],
        alternatives: [],
        uncertainty_reason: null,
      },
      role_as_printed: {
        value: "Bill To:",
        raw_text: "Bill To:",
        confidence: 0.99,
        page: 1,
        bounding_box: [119, 186, 173, 200],
        alternatives: [],
        uncertainty_reason: null,
      },
      normalized_role: { value: "bill_to", confidence: 1.0 },
      address: {
        value: "21 Marina Boulevard, #05-01\nSingapore 018989\nbilling@acmetrading.com",
        raw_text: "21 Marina Boulevard, #05-01\nSingapore 018989\nbilling@acmetrading.com",
        confidence: 0.98,
        page: 1,
        bounding_box: [119, 227, 317, 283],
        alternatives: [],
        uncertainty_reason: null,
      },
    },
  ],
  invoice: {
    invoice_number: {
      value: "INV-2026-0042",
      raw_text: "INV-2026-0042",
      confidence: 0.99,
      page: 1,
      bounding_box: [229, 119, 342, 133],
      alternatives: [],
      uncertainty_reason: null,
    },
    invoice_date: {
      original: {
        value: "2026-07-15",
        raw_text: "2026-07-15",
        confidence: 0.99,
        page: 1,
        bounding_box: [209, 140, 290, 154],
        alternatives: [],
        uncertainty_reason: null,
      },
      normalized_iso: { value: "2026-07-15", confidence: 1.0 },
    },
    location_name: null,
    location_address: null,
    purchase_order_number: null,
    quotation_number: null,
    payment_terms: null,
  },
  line_items: [
    {
      item_number: null,
      parent_quantity: {
        value: 1.0,
        raw_text: "1",
        confidence: 0.99,
        page: 1,
        bounding_box: [472, 409, 480, 423],
        alternatives: [],
        uncertainty_reason: null,
      },
      unit: null,
      description: {
        value: "AI Platform Subscription - August 2026",
        raw_text: "AI Platform Subscription - August 2026",
        confidence: 0.99,
        page: 1,
        bounding_box: [119, 409, 413, 423],
        alternatives: [],
        uncertainty_reason: null,
      },
      dimensions: [],
      model: null,
      serial_numbers: [],
      components: [],
      amount: {
        value: 5000.0,
        raw_text: "5,000.00",
        currency: null,
        confidence: 0.99,
        page: 1,
        bounding_box: [744, 409, 810, 423],
        alternatives: [],
        uncertainty_reason: null,
      },
      source_pages: [1],
      line_item_ocr_confidence: 0.99,
    },
    {
      item_number: null,
      parent_quantity: {
        value: 10.0,
        raw_text: "10",
        confidence: 0.99,
        page: 1,
        bounding_box: [467, 430, 485, 444],
        alternatives: [],
        uncertainty_reason: null,
      },
      unit: null,
      description: {
        value: "Professional Services - Onboarding",
        raw_text: "Professional Services - Onboarding",
        confidence: 0.99,
        page: 1,
        bounding_box: [119, 430, 399, 444],
        alternatives: [],
        uncertainty_reason: null,
      },
      dimensions: [],
      model: null,
      serial_numbers: [],
      components: [],
      amount: {
        value: 1500.0,
        raw_text: "1,500.00",
        currency: null,
        confidence: 0.99,
        page: 1,
        bounding_box: [744, 430, 810, 444],
        alternatives: [],
        uncertainty_reason: null,
      },
      source_pages: [1],
      line_item_ocr_confidence: 0.99,
    },
  ],
  totals: {
    subtotal: {
      value: 6500.0,
      raw_text: "6,500.00",
      confidence: 0.99,
      page: 1,
      bounding_box: [210, 478, 281, 491],
      alternatives: [],
      uncertainty_reason: null,
    },
    discount: null,
    tax: {
      value: 585.0,
      raw_text: "585.00",
      confidence: 0.99,
      page: 1,
      bounding_box: [280, 498, 339, 513],
      alternatives: [],
      uncertainty_reason: null,
    },
    grand_total: {
      value: 7085.0,
      raw_text: "7,085.00",
      confidence: 0.99,
      page: 1,
      bounding_box: [280, 519, 358, 536],
      alternatives: [],
      uncertainty_reason: null,
    },
    financed_amount: null,
    amount_label_as_printed: {
      value: "Total Due",
      raw_text: "Total Due:",
      confidence: 0.99,
      page: 1,
      bounding_box: [119, 519, 206, 536],
      alternatives: [],
      uncertainty_reason: null,
    },
  },
  payment_details: {
    payment_instruction: null,
    beneficiary_name: null,
    beneficiary_registration_number: null,
    bank_name: null,
    bank_registration_number: null,
    account_number: null,
  },
  approval_information: {
    date_paid: null,
    bank_and_cheque_number: null,
    payment_amount: null,
    journal_number: null,
    prepared_by: null,
    checked_and_approved_by: null,
    signatures_detected: [],
  },
  stamps_and_handwriting: [],
  raw_text_by_page: [
    {
      page: 1,
      raw_text:
        "INVOICE\nInvoice Number: INV-2026-0042\nInvoice Date: 2026-07-15\nDue Date: 2026-08-14\nBill To:\nAcme Trading Pte Ltd\n21 Marina Boulevard, #05-01\nSingapore 018989\nbilling@acmetrading.com\nFrom:\nDyna Solutions Pte Ltd\n8 Cross Street, #10-00, Singapore 048424\nDescription\nAI Platform Subscription - August 2026 Qty: 1 Unit Price: 5,000.00 Amount: 5,000.00\nProfessional Services - Onboarding Qty: 10 Unit Price: 150.00 Amount: 1,500.00\nSubtotal: SGD 6,500.00\nTax (9% GST): SGD 585.00\nTotal Due: SGD 7,085.00",
      page_ocr_confidence: 0.99,
    },
  ],
  quality_flags: [],
  critical_low_confidence_fields: [],
};

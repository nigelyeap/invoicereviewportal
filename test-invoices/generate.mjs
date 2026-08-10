import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Hand-rolled multi-invoice PDF generator (no pdf-lib/pdfkit dependency,
// same technique as the earlier /tmp/test-invoice.pdf probe) -- produces a
// handful of realistic, varied sample invoices for manually exercising the
// upload -> review -> export flow of the Invoice Review Portal.
//
// Note: the portal's AgentStudio client is running in MOCK mode locally
// (AGENTSTUDIO_CLIENT_MODE=mock), which always returns the same canned
// extraction result (the "Acme Trading / INV-2026-0042" fixture) regardless
// of what's actually in the uploaded file. So:
//   - invoice-1-acme-trading.pdf is built to match that fixture's text
//     almost verbatim -- upload THIS one to see the source-highlighting
//     feature actually light up correctly for every field.
//   - The other three have realistic, deliberately different vendors/
//     amounts/line items -- good for exercising upload, status polling,
//     manual field editing, template selection, and export, but since the
//     mock extraction result won't textually match them, expect the
//     highlighter to fall back to "approximate location not available" for
//     most fields on those. That fallback path is itself worth seeing once.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// content stream builder ----------------------------------------------------
function buildContentStream(ops) {
  const lines = ["BT"];
  let curFont = null;
  let curSize = null;
  for (const op of ops) {
    if (op.type === "text") {
      if (curFont !== op.font || curSize !== op.size) {
        lines.push(`/${op.font} ${op.size} Tf`);
        curFont = op.font;
        curSize = op.size;
      }
      lines.push(`1 0 0 1 ${op.x} ${op.y} Tm (${esc(op.text)}) Tj`);
    }
  }
  lines.push("ET");
  for (const op of ops) {
    if (op.type === "rule") {
      lines.push(`${op.width} w`);
      lines.push(`${op.x1} ${op.y} m ${op.x2} ${op.y} l S`);
    }
  }
  return lines.join("\n");
}

function buildPdf(ops) {
  const contentStream = buildContentStream(ops);
  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
  );
  objects.push(`<< /Length ${Buffer.byteLength(contentStream, "latin1")} >>\nstream\n${contentStream}\nendstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// invoice layout --------------------------------------------------------
function layoutInvoice({ from, fromAddr, billTo, billAddr, billEmail, invoiceNumber, invoiceDate, dueDate, lineItems, currency, notes }) {
  const ops = [];
  let y = 740;
  const left = 50;
  const right = 562;

  ops.push({ type: "text", font: "F2", size: 22, x: left, y, text: "INVOICE" });
  ops.push({ type: "text", font: "F1", size: 10, x: 420, y: y + 4, text: invoiceNumber });
  y -= 30;
  ops.push({ type: "rule", x1: left, x2: right, y: y + 8, width: 1 });
  y -= 20;

  ops.push({ type: "text", font: "F2", size: 11, x: left, y, text: from });
  y -= 15;
  ops.push({ type: "text", font: "F1", size: 10, x: left, y, text: fromAddr });
  y -= 25;

  ops.push({ type: "text", font: "F2", size: 10, x: left, y, text: "Bill To:" });
  y -= 15;
  ops.push({ type: "text", font: "F2", size: 11, x: left, y, text: billTo });
  y -= 15;
  ops.push({ type: "text", font: "F1", size: 10, x: left, y, text: billAddr });
  y -= 15;
  ops.push({ type: "text", font: "F1", size: 10, x: left, y, text: billEmail });
  y -= 10;

  ops.push({ type: "text", font: "F2", size: 10, x: 400, y: y + 55, text: "Invoice Number:" });
  ops.push({ type: "text", font: "F1", size: 10, x: 490, y: y + 55, text: invoiceNumber });
  ops.push({ type: "text", font: "F2", size: 10, x: 400, y: y + 40, text: "Invoice Date:" });
  ops.push({ type: "text", font: "F1", size: 10, x: 490, y: y + 40, text: invoiceDate });
  ops.push({ type: "text", font: "F2", size: 10, x: 400, y: y + 25, text: "Due Date:" });
  ops.push({ type: "text", font: "F1", size: 10, x: 490, y: y + 25, text: dueDate });

  y -= 30;
  ops.push({ type: "rule", x1: left, x2: right, y: y + 8, width: 1 });
  y -= 18;

  ops.push({ type: "text", font: "F2", size: 10, x: left, y, text: "Description" });
  ops.push({ type: "text", font: "F2", size: 10, x: 350, y, text: "Qty" });
  ops.push({ type: "text", font: "F2", size: 10, x: 400, y, text: "Unit Price" });
  ops.push({ type: "text", font: "F2", size: 10, x: 490, y, text: "Amount" });
  y -= 10;
  ops.push({ type: "rule", x1: left, x2: right, y, width: 0.5 });
  y -= 18;

  const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let subtotal = 0;
  lineItems.forEach((item, idx) => {
    const amount = item.qty * item.unitPrice;
    subtotal += amount;
    ops.push({ type: "text", font: "F1", size: 10, x: left, y, text: `${idx + 1}. ${item.desc}` });
    ops.push({ type: "text", font: "F1", size: 10, x: 350, y, text: String(item.qty) });
    ops.push({ type: "text", font: "F1", size: 10, x: 400, y, text: `${currency} ${money(item.unitPrice)}` });
    ops.push({ type: "text", font: "F1", size: 10, x: 490, y, text: `${currency} ${money(amount)}` });
    y -= 18;
  });

  y -= 6;
  ops.push({ type: "rule", x1: 350, x2: right, y, width: 0.5 });
  y -= 18;

  const taxRate = 0.09;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  ops.push({ type: "text", font: "F1", size: 10, x: 400, y, text: "Subtotal:" });
  ops.push({ type: "text", font: "F1", size: 10, x: 490, y, text: `${currency} ${money(subtotal)}` });
  y -= 16;
  ops.push({ type: "text", font: "F1", size: 10, x: 400, y, text: `Tax (${Math.round(taxRate * 100)}%):` });
  ops.push({ type: "text", font: "F1", size: 10, x: 490, y, text: `${currency} ${money(tax)}` });
  y -= 16;
  ops.push({ type: "text", font: "F2", size: 11, x: 400, y, text: "Total Due:" });
  ops.push({ type: "text", font: "F2", size: 11, x: 490, y, text: `${currency} ${money(total)}` });

  y -= 45;
  ops.push({ type: "rule", x1: left, x2: right, y: y + 8, width: 0.5 });
  y -= 16;
  ops.push({ type: "text", font: "F1", size: 9, x: left, y, text: notes });

  return ops;
}

const invoices = [
  {
    file: "invoice-1-acme-trading.pdf",
    data: {
      from: "Dyna Solutions Pte Ltd",
      fromAddr: "8 Cross Street, #10-00, Singapore 048424",
      billTo: "Acme Trading Pte Ltd",
      billAddr: "21 Marina Boulevard, #05-01, Singapore 018989",
      billEmail: "billing@acmetrading.com",
      invoiceNumber: "INV-2026-0042",
      invoiceDate: "2026-07-15",
      dueDate: "2026-08-14",
      currency: "SGD",
      lineItems: [
        { desc: "AI Platform Subscription - August 2026", qty: 1, unitPrice: 5000.0 },
        { desc: "Professional Services - Onboarding", qty: 10, unitPrice: 150.0 },
      ],
      notes: "Payment due within 30 days of the invoice date. Matches the mock extraction fixture -- best for testing highlighting.",
    },
  },
  {
    file: "invoice-2-globex-manufacturing.pdf",
    data: {
      from: "Meridian Industrial Supply LLC",
      fromAddr: "1400 Harbor Way, Suite 220, Oakland, CA 94607",
      billTo: "Globex Manufacturing Corp",
      billAddr: "77 Foundry Road, Detroit, MI 48201",
      billEmail: "ap@globexmfg.com",
      invoiceNumber: "INV-2026-1187",
      invoiceDate: "2026-06-02",
      dueDate: "2026-07-02",
      currency: "USD",
      lineItems: [
        { desc: "Industrial Steel Brackets (Model SB-40)", qty: 250, unitPrice: 12.5 },
        { desc: "Conveyor Belt Assembly, 6m", qty: 4, unitPrice: 890.0 },
        { desc: "On-site Installation Labor", qty: 16, unitPrice: 95.0 },
      ],
      notes: "Net 30. Late payments subject to 1.5% monthly interest.",
    },
  },
  {
    file: "invoice-3-northwind-logistics.pdf",
    data: {
      from: "Northwind Logistics Pte Ltd",
      fromAddr: "5 Tampines Central, #08-12, Singapore 529541",
      billTo: "Harborview Retail Group",
      billAddr: "150 Orchard Road, #12-01, Singapore 238841",
      billEmail: "finance@harborviewretail.sg",
      invoiceNumber: "INV-2026-0356",
      invoiceDate: "2026-07-28",
      dueDate: "2026-08-27",
      currency: "SGD",
      lineItems: [
        { desc: "Container Freight - SIN to LAX (40ft)", qty: 2, unitPrice: 3200.0 },
        { desc: "Customs Clearance Handling", qty: 1, unitPrice: 450.0 },
        { desc: "Warehouse Storage - July", qty: 30, unitPrice: 18.0 },
        { desc: "Last-mile Delivery", qty: 12, unitPrice: 65.0 },
      ],
      notes: "Please quote invoice number on remittance. Bank details on file.",
    },
  },
  {
    file: "invoice-4-stellar-consulting.pdf",
    data: {
      from: "Stellar Consulting Group",
      fromAddr: "220 Bay Street, Toronto, ON M5J 2W4",
      billTo: "Brightpath Retail Ltd",
      billAddr: "9 King Street West, Toronto, ON M5H 1A1",
      billEmail: "accounts@brightpathretail.ca",
      invoiceNumber: "INV-2026-0098",
      invoiceDate: "2026-08-01",
      dueDate: "2026-08-15",
      currency: "USD",
      lineItems: [{ desc: "Q3 Strategy Advisory - August Retainer", qty: 1, unitPrice: 4200.0 }],
      notes: "Single-line small invoice -- useful for quickly testing edits and export without much clutter.",
    },
  },
];

const outDir = __dirname;
for (const inv of invoices) {
  const ops = layoutInvoice(inv.data);
  const pdf = buildPdf(ops);
  const outPath = path.join(outDir, inv.file);
  fs.writeFileSync(outPath, pdf);
  console.log(`wrote ${outPath} (${pdf.length} bytes)`);
}

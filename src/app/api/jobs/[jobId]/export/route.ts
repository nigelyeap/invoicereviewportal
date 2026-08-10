import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getJobWithDetails } from "@/server/jobService";

/**
 * GET /api/jobs/[jobId]/export -- streams a .xlsx built from authoritative
 * DB state (currentValue/isSelected/displayOrder), per plan section 6. Two
 * sheets: "Invoice Summary" (HEADER + TOTALS fields, one row per field) and
 * "Line Items" (LINE_ITEM fields pivoted, one row per lineItemIndex). Only
 * isSelected fields are included -- this is what makes "agent extracted 10,
 * we only need 5" actually apply to the export, not just the review UI.
 */
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  const job = await getJobWithDetails(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.status !== "SUCCEEDED") {
    return NextResponse.json(
      { error: `Job is not ready to export (status: ${job.status}).` },
      { status: 409 },
    );
  }

  const selectedFields = job.extractedFields.filter((field) => field.isSelected);
  const summaryFields = selectedFields.filter((field) => field.fieldGroup !== "LINE_ITEM");
  const lineItemFields = selectedFields.filter((field) => field.fieldGroup === "LINE_ITEM");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Invoice Extraction Review Portal";
  workbook.created = new Date();

  buildSummarySheet(workbook, summaryFields);
  buildLineItemsSheet(workbook, lineItemFields);

  const buffer = await workbook.xlsx.writeBuffer();

  const baseName = job.document.originalFilename.replace(/\.[^.]+$/, "") || "invoice";
  const filename = `${baseName}-export.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "cache-control": "no-store",
    },
  });
}

type FieldRow = Awaited<ReturnType<typeof getJobWithDetails>> extends { extractedFields: (infer F)[] } | null
  ? F
  : never;

function buildSummarySheet(workbook: ExcelJS.Workbook, fields: FieldRow[]) {
  const sheet = workbook.addWorksheet("Invoice Summary");
  sheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const field of fields) {
    sheet.addRow({
      field: field.overrideLabel ?? field.label,
      value: field.currentValue ?? "",
    });
  }
}

/** Subfield key after the "line_item.<index>." prefix, e.g. "description" for
 *  "line_item.0.description" -- see mapper.ts for how fieldKey is built. */
function lineItemSubfieldKey(fieldKey: string): string {
  return fieldKey.replace(/^line_item\.\d+\./, "");
}

function buildLineItemsSheet(workbook: ExcelJS.Workbook, fields: FieldRow[]) {
  const sheet = workbook.addWorksheet("Line Items");

  // Derive the column set/order from whichever line item has the most
  // fields (fields are pre-sorted by displayOrder/fieldKey from the query),
  // so column order is stable and reflects the fields' own configured order
  // rather than e.g. alphabetical or insertion-order-by-row.
  const byIndex = new Map<number, FieldRow[]>();
  for (const field of fields) {
    if (field.lineItemIndex === null || field.lineItemIndex === undefined) continue;
    const list = byIndex.get(field.lineItemIndex) ?? [];
    list.push(field);
    byIndex.set(field.lineItemIndex, list);
  }

  const columnOrder: string[] = [];
  const columnLabels = new Map<string, string>();
  for (const rowFields of byIndex.values()) {
    for (const field of rowFields) {
      const subKey = lineItemSubfieldKey(field.fieldKey);
      if (!columnLabels.has(subKey)) {
        columnLabels.set(subKey, field.overrideLabel ?? field.label);
        columnOrder.push(subKey);
      }
    }
  }

  sheet.columns = columnOrder.map((subKey) => ({
    header: columnLabels.get(subKey) ?? subKey,
    key: subKey,
    width: 24,
  }));
  sheet.getRow(1).font = { bold: true };

  const sortedIndexes = Array.from(byIndex.keys()).sort((a, b) => a - b);
  for (const index of sortedIndexes) {
    const rowFields = byIndex.get(index) ?? [];
    const rowData: Record<string, string> = {};
    for (const field of rowFields) {
      rowData[lineItemSubfieldKey(field.fieldKey)] = field.currentValue ?? "";
    }
    sheet.addRow(rowData);
  }
}

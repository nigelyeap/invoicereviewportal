/**
 * Seeds FieldCatalogEntry (the master list of fields the flow can produce,
 * matching Pipedrive's "Create Invoice" compulsory fields the portal fills
 * out) plus one default FieldTemplate selecting the common subset.
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CATALOG: {
  fieldKey: string;
  label: string;
  dataType: "STRING" | "NUMBER" | "DATE" | "CURRENCY" | "EMAIL";
  fieldGroup: "HEADER" | "LINE_ITEM" | "TOTALS";
  isLineItemField?: boolean;
  description?: string;
}[] = [
  // HEADER
  { fieldKey: "invoice_number", label: "Invoice Number", dataType: "STRING", fieldGroup: "HEADER" },
  { fieldKey: "invoice_date", label: "Invoice Date", dataType: "DATE", fieldGroup: "HEADER" },
  { fieldKey: "due_date", label: "Due Date", dataType: "DATE", fieldGroup: "HEADER" },
  { fieldKey: "po_number", label: "PO Number", dataType: "STRING", fieldGroup: "HEADER" },
  { fieldKey: "currency", label: "Currency", dataType: "STRING", fieldGroup: "HEADER" },
  { fieldKey: "customer_name", label: "Customer Name", dataType: "STRING", fieldGroup: "HEADER" },
  { fieldKey: "customer_address", label: "Customer Address", dataType: "STRING", fieldGroup: "HEADER" },
  { fieldKey: "customer_email", label: "Customer Email", dataType: "EMAIL", fieldGroup: "HEADER" },
  { fieldKey: "vendor_name", label: "Vendor Name", dataType: "STRING", fieldGroup: "HEADER" },
  { fieldKey: "vendor_address", label: "Vendor Address", dataType: "STRING", fieldGroup: "HEADER" },

  // LINE_ITEM (canonical subfield keys; instances get "line_item.<index>.<subfield>" fieldKeys)
  { fieldKey: "line_item.description", label: "Description", dataType: "STRING", fieldGroup: "LINE_ITEM", isLineItemField: true },
  { fieldKey: "line_item.quantity", label: "Quantity", dataType: "NUMBER", fieldGroup: "LINE_ITEM", isLineItemField: true },
  { fieldKey: "line_item.unit_price", label: "Unit Price", dataType: "CURRENCY", fieldGroup: "LINE_ITEM", isLineItemField: true },
  { fieldKey: "line_item.amount", label: "Amount", dataType: "CURRENCY", fieldGroup: "LINE_ITEM", isLineItemField: true },

  // TOTALS
  { fieldKey: "subtotal", label: "Subtotal", dataType: "CURRENCY", fieldGroup: "TOTALS" },
  { fieldKey: "tax_amount", label: "Tax Amount", dataType: "CURRENCY", fieldGroup: "TOTALS" },
  { fieldKey: "total_amount", label: "Total Amount", dataType: "CURRENCY", fieldGroup: "TOTALS" },
  // Some documents (e.g. hire-purchase-financed invoices) have no
  // subtotal/tax/grand_total at all -- AgentStudio reports the number under
  // `totals.financed_amount` instead. Cataloguing these two explicitly
  // (fieldKey matches the raw "totals.<x>" path parser.ts's catch-all
  // produces) makes them default to selected/exported like the other totals,
  // instead of silently landing as an unselected catch-all row. Deliberately
  // NOT added to DEFAULT_TEMPLATE_ITEMS below -- they're conditional on this
  // invoice type, not a "required" field on ordinary invoices.
  {
    fieldKey: "totals.financed_amount",
    label: "Financed Amount",
    dataType: "CURRENCY",
    fieldGroup: "TOTALS",
    description: "Total financed by a hire-purchase owner/financier, when present instead of a grand_total.",
  },
  {
    fieldKey: "totals.amount_label_as_printed",
    label: "Amount (as printed)",
    dataType: "STRING",
    fieldGroup: "TOTALS",
    description: "The total amount as printed/handwritten on the document, verbatim (e.g. spelled-out or labeled amount).",
  },
];

const DEFAULT_TEMPLATE_ITEMS = [
  "invoice_number",
  "invoice_date",
  "customer_name",
  "customer_address",
  "customer_email",
  "line_item.description",
  "line_item.quantity",
  "line_item.unit_price",
  "line_item.amount",
  "subtotal",
  "tax_amount",
  "total_amount",
];

async function main() {
  for (const entry of CATALOG) {
    await prisma.fieldCatalogEntry.upsert({
      where: { fieldKey: entry.fieldKey },
      create: entry,
      update: entry,
    });
  }
  console.log(`Seeded ${CATALOG.length} FieldCatalogEntry rows.`);

  const defaultTemplate = await prisma.fieldTemplate.upsert({
    where: { name: "Default Invoice Fields" },
    create: {
      name: "Default Invoice Fields",
      description: "Standard compulsory fields for invoice creation (customer, line items, totals).",
      isDefault: true,
    },
    update: {},
  });

  for (let i = 0; i < DEFAULT_TEMPLATE_ITEMS.length; i++) {
    const fieldKey = DEFAULT_TEMPLATE_ITEMS[i];
    await prisma.fieldTemplateItem.upsert({
      where: { fieldTemplateId_fieldKey: { fieldTemplateId: defaultTemplate.id, fieldKey } },
      create: {
        fieldTemplateId: defaultTemplate.id,
        fieldKey,
        displayOrder: i,
        isRequired: true,
      },
      update: { displayOrder: i },
    });
  }
  console.log(`Seeded default FieldTemplate "${defaultTemplate.name}" with ${DEFAULT_TEMPLATE_ITEMS.length} items.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

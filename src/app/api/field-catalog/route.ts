import { NextResponse } from "next/server";
import { z } from "zod";
import { createCatalogEntry, listCatalogEntries } from "@/server/templateService";

/** GET /api/field-catalog -- the master list of fields the flow can produce, used to build templates. */
export async function GET() {
  const entries = await listCatalogEntries();
  return NextResponse.json({ entries });
}

const createCatalogEntrySchema = z.object({
  label: z.string().trim().min(1, "Label is required"),
  // Custom fields are scoped to Header/Totals only and always plain text --
  // line items need a per-instance shape (quantity/unit price/amount) that a
  // single ad-hoc text field can't represent, so that group is excluded here.
  fieldGroup: z.enum(["HEADER", "TOTALS"]),
});

/** POST /api/field-catalog -- add a portal-defined custom field (see templateService.createCatalogEntry). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createCatalogEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await createCatalogEntry(parsed.data);
  return NextResponse.json({ entry }, { status: 201 });
}

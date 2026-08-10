import { NextResponse } from "next/server";
import { listCatalogEntries } from "@/server/templateService";

/** GET /api/field-catalog -- the master list of fields the flow can produce, used to build templates. */
export async function GET() {
  const entries = await listCatalogEntries();
  return NextResponse.json({ entries });
}

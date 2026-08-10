import { NextResponse } from "next/server";
import { z } from "zod";
import { createTemplate, listTemplates } from "@/server/templateService";

const templateItemSchema = z.object({
  fieldKey: z.string().min(1),
  displayOrder: z.number().int(),
  isRequired: z.boolean(),
  overrideLabel: z.string().nullable().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  items: z.array(templateItemSchema),
});

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const template = await createTemplate(parsed.data);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

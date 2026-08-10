import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteTemplate, getTemplateById, updateTemplate } from "@/server/templateService";

const templateItemSchema = z.object({
  fieldKey: z.string().min(1),
  displayOrder: z.number().int(),
  isRequired: z.boolean(),
  overrideLabel: z.string().nullable().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  items: z.array(templateItemSchema).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await context.params;
  const template = await getTemplateById(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PATCH(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const template = await updateTemplate(templateId, parsed.data);
    return NextResponse.json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await context.params;
  try {
    await deleteTemplate(templateId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

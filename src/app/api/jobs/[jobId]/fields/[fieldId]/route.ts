import { NextResponse } from "next/server";
import { z } from "zod";
import { getField, updateFieldSelection, updateFieldValue } from "@/server/fieldService";

/**
 * PATCH /api/jobs/[jobId]/fields/[fieldId] -- the review page's single edit
 * endpoint. Handles both a human value edit (creates a FieldEdit audit row,
 * re-checks shape validation -- see fieldService.updateFieldValue) and
 * selection/ordering/label-override tweaks (fieldService.updateFieldSelection).
 * A request may set `currentValue` and/or any of the selection fields in one
 * call; whichever keys are present get applied.
 */
const patchSchema = z
  .object({
    currentValue: z.string().nullable().optional(),
    isSelected: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
    overrideLabel: z.string().nullable().optional(),
    editedByName: z.string().nullable().optional(),
    editReason: z.string().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Empty patch body." });

export async function PATCH(request: Request, context: { params: Promise<{ jobId: string; fieldId: string }> }) {
  const { jobId, fieldId } = await context.params;

  const existing = await getField(fieldId);
  if (!existing || existing.extractionJobId !== jobId) {
    return NextResponse.json({ error: "Field not found on this job." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentValue, isSelected, displayOrder, overrideLabel, editedByName, editReason } = parsed.data;

  let field = existing;

  if (currentValue !== undefined) {
    field = await updateFieldValue({ fieldId, newValue: currentValue, editedByName, editReason });
  }

  if (isSelected !== undefined || displayOrder !== undefined || overrideLabel !== undefined) {
    field = await updateFieldSelection({ fieldId, isSelected, displayOrder, overrideLabel });
  }

  return NextResponse.json({ field });
}

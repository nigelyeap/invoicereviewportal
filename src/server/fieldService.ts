import { prisma } from "@/lib/db/prisma";
import { validateDataTypeShape } from "@/lib/agentstudio/validationRules";

/**
 * Human-review operations on ExtractedField rows: edits (with audit trail),
 * selection/ordering/label overrides. Route handlers go through this file
 * rather than touching Prisma directly.
 */

export async function getJobFields(jobId: string) {
  return prisma.extractedField.findMany({
    where: { extractionJobId: jobId },
    orderBy: [{ displayOrder: "asc" }, { fieldKey: "asc" }],
  });
}

export async function getField(fieldId: string) {
  return prisma.extractedField.findUnique({ where: { id: fieldId } });
}

/**
 * Human edits a field's value. Creates a FieldEdit audit row and
 * re-checks the data-type shape validation against the new value (the
 * cross-field arithmetic checks aren't re-run here -- they operate over
 * the whole field set and are only recomputed on re-extraction/re-apply;
 * see templateService.applyTemplateToJob).
 */
export async function updateFieldValue(params: {
  fieldId: string;
  newValue: string | null;
  editedByName?: string | null;
  editReason?: string | null;
}) {
  const { fieldId, newValue, editedByName, editReason } = params;
  const field = await prisma.extractedField.findUniqueOrThrow({ where: { id: fieldId } });

  if (field.currentValue === newValue) {
    return field; // no-op: nothing changed, nothing to audit
  }

  const shapeValidation = validateDataTypeShape(newValue, field.dataType);

  const [, updated] = await prisma.$transaction([
    prisma.fieldEdit.create({
      data: {
        extractedFieldId: fieldId,
        previousValue: field.currentValue,
        newValue,
        editedByName: editedByName ?? null,
        editReason: editReason ?? null,
      },
    }),
    prisma.extractedField.update({
      where: { id: fieldId },
      data: {
        currentValue: newValue,
        wasEdited: true,
        validationStatus: shapeValidation.status,
        validationMessage: shapeValidation.message,
      },
    }),
  ]);

  return updated;
}

export async function updateFieldSelection(params: {
  fieldId: string;
  isSelected?: boolean;
  displayOrder?: number;
  overrideLabel?: string | null;
}) {
  const { fieldId, ...rest } = params;
  return prisma.extractedField.update({ where: { id: fieldId }, data: rest });
}

export async function getFieldEditHistory(fieldId: string) {
  return prisma.fieldEdit.findMany({
    where: { extractedFieldId: fieldId },
    orderBy: { editedAt: "desc" },
  });
}

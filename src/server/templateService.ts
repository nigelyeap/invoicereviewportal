import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { buildExtractedFieldRows, type CatalogEntryLike, type TemplateItemLike } from "@/lib/agentstudio/mapper";
import type { OcrDocument } from "@/lib/agentstudio/types";

/**
 * FieldTemplate/FieldTemplateItem CRUD (page 2), plus applying a template
 * to a specific job (page 2 -> page 3 handoff, and the "this job only"
 * picker on page 3 itself -- see plan section 7).
 */

export async function listCatalogEntries() {
  return prisma.fieldCatalogEntry.findMany({
    orderBy: [{ fieldGroup: "asc" }, { fieldKey: "asc" }],
  });
}

export async function listTemplates() {
  return prisma.fieldTemplate.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      items: { orderBy: { displayOrder: "asc" }, include: { fieldCatalogEntry: true } },
    },
  });
}

export async function getTemplateById(id: string) {
  return prisma.fieldTemplate.findUnique({
    where: { id },
    include: {
      items: { orderBy: { displayOrder: "asc" }, include: { fieldCatalogEntry: true } },
    },
  });
}

export interface TemplateItemInput {
  fieldKey: string;
  displayOrder: number;
  isRequired: boolean;
  overrideLabel?: string | null;
}

export async function createTemplate(params: {
  name: string;
  description?: string | null;
  isDefault?: boolean;
  items: TemplateItemInput[];
}) {
  return prisma.$transaction(async (tx) => {
    if (params.isDefault) {
      await tx.fieldTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.fieldTemplate.create({
      data: {
        name: params.name,
        description: params.description ?? null,
        isDefault: params.isDefault ?? false,
        items: { create: params.items },
      },
      include: { items: true },
    });
  });
}

export async function updateTemplate(
  id: string,
  params: { name?: string; description?: string | null; isDefault?: boolean; items?: TemplateItemInput[] },
) {
  return prisma.$transaction(async (tx) => {
    if (params.isDefault) {
      await tx.fieldTemplate.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
    }
    if (params.items) {
      await tx.fieldTemplateItem.deleteMany({ where: { fieldTemplateId: id } });
    }
    return tx.fieldTemplate.update({
      where: { id },
      data: {
        name: params.name,
        description: params.description,
        isDefault: params.isDefault,
        ...(params.items ? { items: { create: params.items } } : {}),
      },
      include: { items: true },
    });
  });
}

export async function deleteTemplate(id: string) {
  await prisma.fieldTemplate.delete({ where: { id } });
}

/**
 * Applies (or clears, if templateId is null) a template to a job.
 *
 * If the job hasn't produced fields yet, this just records the choice --
 * markSucceeded() in jobService picks it up when the extraction lands.
 *
 * If the job already SUCCEEDED, re-runs the mapper against the job's
 * stored raw OCR parse_content with the new template and upserts each
 * resulting row by (extractionJobId, fieldKey), preserving any field a
 * human has already edited (wasEdited=true keeps its currentValue rather
 * than being reset back to the freshly-parsed value).
 */
export async function applyTemplateToJob(jobId: string, templateId: string | null) {
  const job = await prisma.extractionJob.findUniqueOrThrow({ where: { id: jobId } });

  if (templateId) {
    await prisma.fieldTemplate.findUniqueOrThrow({ where: { id: templateId } });
  }

  const updatedJob = await prisma.extractionJob.update({
    where: { id: jobId },
    data: { appliedFieldTemplateId: templateId },
  });

  const rawResponse = job.rawResponse as { parseContent?: OcrDocument } | null;
  if (job.status !== "SUCCEEDED" || !rawResponse?.parseContent) {
    return updatedJob;
  }

  const [catalogEntries, templateItems, existingFields] = await Promise.all([
    prisma.fieldCatalogEntry.findMany(),
    templateId
      ? prisma.fieldTemplateItem.findMany({ where: { fieldTemplateId: templateId } })
      : Promise.resolve([]),
    prisma.extractedField.findMany({ where: { extractionJobId: jobId } }),
  ]);

  const existingByKey = new Map(existingFields.map((f) => [f.fieldKey, f]));

  const rows = buildExtractedFieldRows({
    ocrResult: rawResponse.parseContent,
    catalogEntries: catalogEntries as CatalogEntryLike[],
    template: templateId ? (templateItems as TemplateItemLike[]) : null,
  });

  await prisma.$transaction(
    rows.map((row) => {
      const existing = existingByKey.get(row.fieldKey);
      // Prisma's nullable-Json columns distinguish DB NULL from JSON null;
      // a bare `null` doesn't satisfy the generated input type -- see
      // https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields#null-values
      const sourceBboxInput = row.sourceBbox === null ? Prisma.JsonNull : row.sourceBbox;
      return prisma.extractedField.upsert({
        where: { extractionJobId_fieldKey: { extractionJobId: jobId, fieldKey: row.fieldKey } },
        create: { ...row, extractionJobId: jobId, sourceBbox: sourceBboxInput },
        update: {
          fieldGroup: row.fieldGroup,
          lineItemIndex: row.lineItemIndex,
          label: row.label,
          dataType: row.dataType,
          confidenceScore: row.confidenceScore,
          confidenceRemark: row.confidenceRemark,
          validationStatus: row.validationStatus,
          validationMessage: row.validationMessage,
          isSelected: row.isSelected,
          displayOrder: row.displayOrder,
          overrideLabel: row.overrideLabel,
          originalValue: row.originalValue,
          sourceText: row.sourceText,
          sourcePageNumber: row.sourcePageNumber,
          sourceBbox: sourceBboxInput,
          // Preserve human edits: don't clobber a value the reviewer already changed.
          ...(existing?.wasEdited ? {} : { currentValue: row.currentValue }),
        },
      });
    }),
  );

  return updatedJob;
}

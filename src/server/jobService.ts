import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getStorageAdapter } from "@/lib/storage";
import { buildExtractedFieldRows, type CatalogEntryLike, type TemplateItemLike } from "@/lib/agentstudio/mapper";
import type { OcrDocument } from "@/lib/agentstudio/types";
import { getEnv } from "@/lib/env";

/**
 * Orchestrates Document + ExtractionJob lifecycle. Route handlers AND
 * src/server/extractionRunner.ts both go through this file rather than
 * touching Prisma directly -- see the project-structure rule in the plan
 * doc.
 */

export async function createExtractionJob(params: {
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
  uploadedByName?: string | null;
  fieldTemplateId?: string | null;
}) {
  const { originalFilename, mimeType, buffer, uploadedByName, fieldTemplateId } = params;
  const { storageKey } = await getStorageAdapter().saveUploadedFile({ originalFilename, buffer });

  const document = await prisma.document.create({
    data: {
      originalFilename,
      storageKey,
      mimeType,
      fileSizeBytes: buffer.byteLength,
      uploadedByName: uploadedByName ?? null,
    },
  });

  const job = await prisma.extractionJob.create({
    data: {
      documentId: document.id,
      status: "PENDING",
      flowUuid: getEnv().AGENTSTUDIO_FLOW_UUID || null,
      appliedFieldTemplateId: fieldTemplateId ?? null,
    },
  });

  return { document, job };
}

export async function getJobWithDetails(jobId: string) {
  return prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: {
      document: true,
      appliedFieldTemplate: true,
      extractedFields: {
        orderBy: [{ displayOrder: "asc" }, { fieldKey: "asc" }],
      },
    },
  });
}

/**
 * Flips a job this request already owns (just created via
 * createExtractionJob, in the same request) from PENDING to SUBMITTING.
 *
 * HISTORY: previously there was a separate always-on worker process
 * (worker/index.ts) claiming jobs out of a shared queue via
 * `FOR UPDATE SKIP LOCKED`, since multiple worker instances could race for
 * the same row. That's gone (2026-08-10) -- extraction now runs inline via
 * `after()` in the same request that created the job (see
 * src/server/extractionRunner.ts and src/app/api/documents/route.ts), so
 * there's no queue to race against and no SKIP LOCKED needed. Kept as its
 * own DB write (rather than folding into createExtractionJob) so
 * attemptCount/submittedAt semantics stay identical to the old claim path,
 * in case a job ever needs to be resubmitted.
 */
export async function markSubmitting(jobId: string) {
  return prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: "SUBMITTING",
      attemptCount: { increment: 1 },
      submittedAt: new Date(),
    },
    include: { document: true },
  });
}

/**
 * Records the OCR-mode job id once client.ts's extractInvoice() has
 * submitted the file (before polling completes) -- externalFileId is
 * repurposed here to hold AgentStudio's numeric OCR job id (stringified)
 * rather than a file_uuid from the old WS-era upload flow; externalSegmentCode
 * is unused by this transport and stays null. See client.ts's extractInvoice().
 */
export async function markProcessing(jobId: string, params: { externalJobId: string }) {
  return prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      externalFileId: params.externalJobId,
      startedProcessingAt: new Date(),
    },
  });
}

/**
 * Persists the terminal OCR-mode result: builds ExtractedField rows via the
 * agentstudio mapper (against the full catalog + the job's applied
 * template, if any) and writes them alongside the job's SUCCEEDED status.
 */
export async function markSucceeded(
  jobId: string,
  params: { parseContent: OcrDocument; rawResponse: unknown },
) {
  const job = await prisma.extractionJob.findUniqueOrThrow({ where: { id: jobId } });

  const [catalogEntries, templateItems] = await Promise.all([
    prisma.fieldCatalogEntry.findMany(),
    job.appliedFieldTemplateId
      ? prisma.fieldTemplateItem.findMany({ where: { fieldTemplateId: job.appliedFieldTemplateId } })
      : Promise.resolve([]),
  ]);

  const rows = buildExtractedFieldRows({
    ocrResult: params.parseContent,
    catalogEntries: catalogEntries as CatalogEntryLike[],
    template: templateItems as TemplateItemLike[],
  });

  await prisma.$transaction([
    prisma.extractedField.deleteMany({ where: { extractionJobId: jobId } }),
    prisma.extractedField.createMany({
      data: rows.map((row) => ({
        ...row,
        extractionJobId: jobId,
        // Prisma's nullable-Json columns distinguish DB NULL from JSON null;
        // a bare `null` doesn't satisfy the generated input type -- see
        // https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields#null-values
        sourceBbox: row.sourceBbox === null ? Prisma.JsonNull : row.sourceBbox,
      })),
    }),
    prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        completedAt: new Date(),
        rawResponse: {
          parseContent: params.parseContent as object,
          rawResponse: params.rawResponse as object,
        },
      },
    }),
  ]);

  return getJobWithDetails(jobId);
}

export async function markFailed(jobId: string, errorMessage: string) {
  return prisma.extractionJob.update({
    where: { id: jobId },
    data: { status: "FAILED", errorMessage, completedAt: new Date() },
  });
}

export async function markTimedOut(jobId: string, errorMessage: string) {
  return prisma.extractionJob.update({
    where: { id: jobId },
    data: { status: "TIMED_OUT", errorMessage, completedAt: new Date() },
  });
}

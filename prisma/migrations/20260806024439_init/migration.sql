-- CreateEnum
CREATE TYPE "ExtractionJobStatus" AS ENUM ('PENDING', 'SUBMITTING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "FieldGroup" AS ENUM ('HEADER', 'LINE_ITEM', 'TOTALS');

-- CreateEnum
CREATE TYPE "FieldDataType" AS ENUM ('STRING', 'NUMBER', 'DATE', 'CURRENCY', 'EMAIL');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('VALID', 'WARNING', 'INVALID', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByName" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_pages" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "ocrText" TEXT,
    "ocrTextBlocks" JSONB,

    CONSTRAINT "document_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_jobs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "ExtractionJobStatus" NOT NULL DEFAULT 'PENDING',
    "flowUuid" TEXT,
    "externalFileId" TEXT,
    "externalSegmentCode" TEXT,
    "externalStatusCode" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextPollAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "startedProcessingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "errorMessage" TEXT,
    "appliedFieldTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_fields" (
    "id" TEXT NOT NULL,
    "extractionJobId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldGroup" "FieldGroup" NOT NULL,
    "lineItemIndex" INTEGER,
    "label" TEXT NOT NULL,
    "dataType" "FieldDataType" NOT NULL,
    "originalValue" TEXT,
    "currentValue" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "confidenceRemark" TEXT,
    "sourceText" TEXT,
    "sourcePageNumber" INTEGER,
    "sourceBbox" JSONB,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "validationMessage" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "overrideLabel" TEXT,
    "wasEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_edits" (
    "id" TEXT NOT NULL,
    "extractedFieldId" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedByName" TEXT,
    "editReason" TEXT,

    CONSTRAINT "field_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_catalog_entries" (
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "FieldDataType" NOT NULL,
    "fieldGroup" "FieldGroup" NOT NULL,
    "isLineItemField" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "field_catalog_entries_pkey" PRIMARY KEY ("fieldKey")
);

-- CreateTable
CREATE TABLE "field_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_template_items" (
    "id" TEXT NOT NULL,
    "fieldTemplateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "overrideLabel" TEXT,

    CONSTRAINT "field_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_pages_documentId_pageNumber_key" ON "document_pages"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "extraction_jobs_status_nextPollAt_idx" ON "extraction_jobs"("status", "nextPollAt");

-- CreateIndex
CREATE INDEX "extracted_fields_extractionJobId_idx" ON "extracted_fields"("extractionJobId");

-- CreateIndex
CREATE UNIQUE INDEX "field_templates_name_key" ON "field_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "field_template_items_fieldTemplateId_fieldKey_key" ON "field_template_items"("fieldTemplateId", "fieldKey");

-- AddForeignKey
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_appliedFieldTemplateId_fkey" FOREIGN KEY ("appliedFieldTemplateId") REFERENCES "field_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_extractionJobId_fkey" FOREIGN KEY ("extractionJobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_edits" ADD CONSTRAINT "field_edits_extractedFieldId_fkey" FOREIGN KEY ("extractedFieldId") REFERENCES "extracted_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_template_items" ADD CONSTRAINT "field_template_items_fieldTemplateId_fkey" FOREIGN KEY ("fieldTemplateId") REFERENCES "field_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_template_items" ADD CONSTRAINT "field_template_items_fieldKey_fkey" FOREIGN KEY ("fieldKey") REFERENCES "field_catalog_entries"("fieldKey") ON DELETE RESTRICT ON UPDATE CASCADE;

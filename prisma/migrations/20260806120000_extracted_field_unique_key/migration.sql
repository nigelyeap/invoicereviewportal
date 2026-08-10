-- Add a uniqueness guarantee on (extractionJobId, fieldKey) so upserts in
-- templateService.applyTemplateToJob() can target a single row per field
-- when re-applying a template to an already-SUCCEEDED job.
CREATE UNIQUE INDEX "extracted_fields_extractionJobId_fieldKey_key" ON "extracted_fields"("extractionJobId", "fieldKey");

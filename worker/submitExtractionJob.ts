import { getAgentStudioClient } from "@/lib/agentstudio";
import { getStorageAdapter } from "@/lib/storage";
import * as jobService from "@/server/jobService";
import { EXTRACTION_WALL_CLOCK_CEILING_MS, ExtractionTimeoutError, classifyExtractionError } from "./runExtractionSession";
import { logger } from "./logger";

type ClaimedJob = NonNullable<Awaited<ReturnType<typeof jobService.claimNextPendingJob>>>;

/**
 * Runs the full AgentStudio OCR-mode sequence for one claimed job: submit
 * the file to offline_upload_file (extra_params=ocr), poll until real
 * parse_content is available, then persist ExtractedField rows via
 * jobService.markSucceeded(). See client.ts for why polling keys off
 * parse_content rather than status/error_msg.
 *
 * Never throws -- every failure path resolves to a FAILED/TIMED_OUT job
 * status so the poll loop in index.ts keeps running regardless.
 */
export async function submitExtractionJob(job: ClaimedJob): Promise<void> {
  const client = await getAgentStudioClient();
  const document = job.document;

  try {
    const fileBuffer = await getStorageAdapter().readStoredFile(document.storageKey);

    const result = await client.extractInvoice({
      fileBuffer,
      fileName: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      timeoutMs: EXTRACTION_WALL_CLOCK_CEILING_MS,
      onSubmitted: (externalJobId) => {
        jobService.markProcessing(job.id, { externalJobId }).catch((err) => {
          logger.warn({ jobId: job.id, err }, "markProcessing failed (non-fatal, continuing to poll)");
        });
      },
    });

    await jobService.markSucceeded(job.id, {
      parseContent: result.parseContent,
      rawResponse: result.rawResponse,
    });

    logger.info({ jobId: job.id }, "extraction job succeeded");
  } catch (rawErr) {
    const err = classifyExtractionError(rawErr);
    if (err instanceof ExtractionTimeoutError) {
      logger.error({ jobId: job.id, message: err.message }, "extraction job timed out");
      await jobService.markTimedOut(job.id, err.message);
    } else {
      logger.error({ jobId: job.id, message: err.message }, "extraction job failed");
      await jobService.markFailed(job.id, err.message);
    }
  }
}

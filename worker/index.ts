import { claimNextPendingJob } from "@/server/jobService";
import { submitExtractionJob } from "./submitExtractionJob";
import { logger } from "./logger";

/**
 * DB-claim poll loop -- see plan section 3. No Redis/BullMQ at v1: state
 * lives entirely in Postgres (ExtractionJob.status), so jobs survive
 * worker restarts and multiple worker processes can run safely thanks to
 * `FOR UPDATE SKIP LOCKED` in jobService.claimNextPendingJob().
 */
const POLL_INTERVAL_MS = 3_000;

let shuttingDown = false;

async function tick(): Promise<void> {
  const job = await claimNextPendingJob();
  if (!job) return;
  logger.info({ jobId: job.id, documentId: job.documentId }, "claimed extraction job");
  // Intentionally awaited: v1 processes one job at a time, matching the
  // plan's "single-document-at-a-time volume" assumption.
  await submitExtractionJob(job);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop(): Promise<void> {
  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      logger.error({ err }, "worker tick failed unexpectedly");
    }
    if (!shuttingDown) await sleep(POLL_INTERVAL_MS);
  }
  logger.info("worker loop exited cleanly");
}

process.on("SIGINT", () => {
  logger.info("received SIGINT, shutting down after current tick");
  shuttingDown = true;
});
process.on("SIGTERM", () => {
  logger.info("received SIGTERM, shutting down after current tick");
  shuttingDown = true;
});

logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, "invoice-review-portal worker starting");
loop();

import pino from "pino";

/**
 * Shared server-side logger. Originally worker-only (worker/logger.ts) --
 * promoted to src/lib once extraction moved from a standalone worker
 * process into an in-process `after()` continuation inside the Next.js app
 * (see src/server/extractionRunner.ts), so both the API routes and that
 * background continuation log through the same instance.
 */
export const logger = pino({
  name: "invoice-review-portal",
  level: process.env.LOG_LEVEL ?? "info",
});

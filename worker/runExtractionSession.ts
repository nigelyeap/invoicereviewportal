/**
 * Worker's own wall-clock ceiling, deliberately past AgentStudio's known
 * ~180s cap on the offline chatflow channel. OCR-mode reuses the same
 * offline_upload_file family of endpoints, so the same defensive ceiling
 * applies -- see plan section 3, "Background job processing".
 */
export const EXTRACTION_WALL_CLOCK_CEILING_MS = 205_000;

export class ExtractionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionTimeoutError";
  }
}

/**
 * Reclassifies a timeout-flavored Error thrown by
 * AgentStudioClient.extractInvoice() (client.ts's pollUntilDone() throws a
 * plain Error whose message contains "timed out" once its own deadline
 * passes) into ExtractionTimeoutError, so submitExtractionJob() can mark the
 * job TIMED_OUT (a known, expected failure mode) rather than lumping it in
 * with FAILED.
 *
 * client.ts now owns the actual submit+poll sequence and its own deadline
 * enforcement (OCR-mode is a single blocking call, not a held-open session),
 * so this file no longer orchestrates anything itself -- it's just the
 * error-classification seam between client.ts and submitExtractionJob.ts.
 */
export function classifyExtractionError(err: unknown): Error {
  if (err instanceof Error && /timed out/i.test(err.message)) {
    return new ExtractionTimeoutError(err.message);
  }
  return err instanceof Error ? err : new Error(String(err));
}

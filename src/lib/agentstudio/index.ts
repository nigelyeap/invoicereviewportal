import { getEnv } from "@/lib/env";
import type { AgentStudioClient } from "./types";

export type { AgentStudioClient, AgentStudioExtractionResult, OcrDocument, ParsedField, ParseResult } from "./types";
export { parseExtractionResult } from "./parser";
export { buildExtractedFieldRows } from "./mapper";
export type { CatalogEntryLike, ExtractedFieldRow, TemplateItemLike } from "./mapper";

let cached: AgentStudioClient | null = null;

/**
 * The ONLY way src/server/*Service.ts and worker/* should obtain an
 * AgentStudio client -- never import client.ts or mockClient.ts directly.
 * Env-flag switchable (AGENTSTUDIO_CLIENT_MODE) so the whole pipeline is
 * testable without live credentials.
 *
 * Async because it lazily dynamic-imports the live/mock implementation so
 * `ws` / live-only code paths aren't pulled into environments that only
 * ever run in mock mode. Its one caller (worker/submitExtractionJob.ts) is
 * already async, so this doesn't ripple further.
 */
export async function getAgentStudioClient(): Promise<AgentStudioClient> {
  if (cached) return cached;
  const mode = getEnv().AGENTSTUDIO_CLIENT_MODE;
  if (mode === "live") {
    const { createLiveAgentStudioClient } = await import("./client");
    cached = createLiveAgentStudioClient();
  } else {
    const { createMockAgentStudioClient } = await import("./mockClient");
    cached = createMockAgentStudioClient();
  }
  return cached;
}

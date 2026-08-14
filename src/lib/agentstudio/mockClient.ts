import crypto from "node:crypto";
import type { AgentStudioClient, AgentStudioExtractionResult, AgentStudioValidationResult } from "./types";
import { SAMPLE_OCR_RESULT } from "./__fixtures__/sampleOcrResult";
import { SAMPLE_VALIDATION_REPORT_MARKDOWN } from "./__fixtures__/sampleValidationReport";

/**
 * Fixture-based mock client, used whenever AGENTSTUDIO_CLIENT_MODE=mock
 * (the default). Lets the whole upload -> job -> review -> export pipeline
 * be built and tested without live AgentStudio credentials, matching the
 * real client's async shape (including a small artificial delay and an
 * `onSubmitted` callback fired before "polling" completes) so the
 * PROCESSING status transition is genuinely observable in the UI.
 */
export function createMockAgentStudioClient(): AgentStudioClient {
  async function extractInvoice(params: {
    timeoutMs: number;
    onSubmitted?: (externalJobId: string) => void;
  }): Promise<AgentStudioExtractionResult> {
    const externalJobId = `mock_${crypto.randomBytes(6).toString("base64url")}`;
    try {
      params.onSubmitted?.(externalJobId);
    } catch {
      // best-effort only
    }
    await delay(Math.min(1500, params.timeoutMs));
    return {
      parseContent: SAMPLE_OCR_RESULT,
      rawResponse: { mock: true, externalJobId },
      externalJobId,
    };
  }

  async function validateInvoice(params: {
    timeoutMs: number;
    onSubmitted?: (externalJobId: string) => void;
  }): Promise<AgentStudioValidationResult> {
    const externalJobId = `mock_${crypto.randomBytes(6).toString("base64url")}`;
    try {
      params.onSubmitted?.(externalJobId);
    } catch {
      // best-effort only
    }
    await delay(Math.min(1500, params.timeoutMs));
    return {
      reportMarkdown: SAMPLE_VALIDATION_REPORT_MARKDOWN,
      rawResponse: { mock: true, externalJobId },
      externalJobId,
    };
  }

  return { extractInvoice, validateInvoice };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

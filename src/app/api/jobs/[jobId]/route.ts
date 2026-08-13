import { NextResponse } from "next/server";
import { getJobWithDetails, getAgentNotes } from "@/server/jobService";

/**
 * GET /api/jobs/[jobId] -- status polling target for the upload/status page
 * and review page.
 *
 * Also returns `agentNotes` -- AgentStudio's own document-level remarks
 * (quality flags, low-confidence field explanations, raw per-page OCR text),
 * shown alongside (not in place of) the portal's per-field computed
 * confidence/validation in ValidationSummary's "View full report" dialog.
 * The job's raw `rawResponse` JSON blob (which agentNotes is derived from)
 * is stripped from the response -- it's large (per-field bounding boxes for
 * every leaf) and nothing on the client needs it beyond agentNotes.
 */
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const [job, agentNotes] = await Promise.all([getJobWithDetails(jobId), getAgentNotes(jobId)]);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const { rawResponse: _rawResponse, ...jobWithoutRawResponse } = job;
  return NextResponse.json({ job: jobWithoutRawResponse, agentNotes });
}

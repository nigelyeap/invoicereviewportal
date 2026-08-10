import { NextResponse } from "next/server";
import { getJobWithDetails } from "@/server/jobService";

/** GET /api/jobs/[jobId] -- status polling target for the upload/status page and review page. */
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJobWithDetails(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  return NextResponse.json({ job });
}

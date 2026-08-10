import { NextResponse } from "next/server";
import { z } from "zod";
import { applyTemplateToJob } from "@/server/templateService";
import { getJobWithDetails } from "@/server/jobService";

const applyTemplateSchema = z.object({ templateId: z.string().nullable() });

/**
 * POST /api/jobs/[jobId]/apply-template -- sets (or clears, if templateId
 * is null) the job's appliedFieldTemplateId. If the job already SUCCEEDED,
 * also re-runs the mapper against the stored answer with the new template
 * and upserts the resulting ExtractedField rows (preserving any values a
 * reviewer already edited) -- see templateService.applyTemplateToJob.
 */
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = applyTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await applyTemplateToJob(jobId, parsed.data.templateId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const job = await getJobWithDetails(jobId);
  return NextResponse.json({ job });
}

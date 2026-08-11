import { NextResponse, after } from "next/server";
import { createExtractionJob } from "@/server/jobService";
import { runExtractionJob } from "@/server/extractionRunner";
import { logger } from "@/lib/logger";

const ACCEPTED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * Must exceed EXTRACTION_WALL_CLOCK_CEILING_MS (205s) since the after()
 * continuation below runs the full AgentStudio submit+poll sequence in this
 * same function invocation. Vercel Fluid Compute defaults to 300s max on
 * every plan (including free Hobby), so this fits without needing Pro --
 * see DEPLOYMENT.md.
 */
export const maxDuration = 220;

/**
 * POST /api/documents -- accepts a multipart upload, persists the file via
 * the storage adapter, and creates a PENDING ExtractionJob. Extraction then
 * runs via `after()` in the background of this same request (see
 * src/server/extractionRunner.ts) -- this route responds to the browser
 * immediately, but the AgentStudio call keeps running server-side after the
 * response is sent. This route itself never talks to AgentStudio directly.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25MB limit." }, { status: 400 });
  }
  if (file.type && !ACCEPTED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". Accepted: PDF, PNG, JPEG, WEBP.` },
      { status: 400 },
    );
  }

  const uploadedByNameRaw = formData.get("uploadedByName");
  const uploadedByName = typeof uploadedByNameRaw === "string" && uploadedByNameRaw.trim() ? uploadedByNameRaw.trim() : null;

  const fieldTemplateIdRaw = formData.get("fieldTemplateId");
  const fieldTemplateId = typeof fieldTemplateIdRaw === "string" && fieldTemplateIdRaw.trim() ? fieldTemplateIdRaw.trim() : null;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { document, job } = await createExtractionJob({
    originalFilename: file.name || "upload",
    mimeType: file.type || "application/octet-stream",
    buffer,
    uploadedByName,
    fieldTemplateId,
  });

  // Fire-and-forget from the caller's perspective: the browser gets its
  // 201 immediately, extraction continues below in the background. Defensive
  // try/catch here even though runExtractionJob is documented to never
  // throw -- an after() callback that throws just becomes noisy server logs,
  // nothing user-visible, but there's no reason to risk it.
  after(async () => {
    try {
      await runExtractionJob(job.id);
    } catch (err) {
      logger.error({ jobId: job.id, err }, "unexpected error escaped runExtractionJob");
    }
  });

  return NextResponse.json({ documentId: document.id, jobId: job.id, status: job.status }, { status: 201 });
}

import { NextResponse } from "next/server";
import { createExtractionJob } from "@/server/jobService";

const ACCEPTED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * POST /api/documents -- accepts a multipart upload, persists the file via
 * the storage adapter, and creates a PENDING ExtractionJob. The worker
 * picks it up out-of-band (see worker/index.ts); this route never talks to
 * AgentStudio directly.
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

  return NextResponse.json({ documentId: document.id, jobId: job.id, status: job.status }, { status: 201 });
}

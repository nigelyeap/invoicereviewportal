import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * TEMPORARY, ONE-OFF DEMO PATCH -- NOT PART OF THE APP'S NORMAL SURFACE.
 *
 * Applies the exact same demo-only confidence override to production that
 * was already applied to the local dev DB by hand: lowers the "Journal
 * Number" handwritten field's confidence on the "270843 Renovation.pdf"
 * sample extraction from ~82% to 40%, in both the ExtractedField row (what
 * FieldPanel/ValidationSummary render) and the raw OCR JSON blob on the
 * ExtractionJob (what agentNotes.ts reads for the stamps/handwriting list).
 *
 * Gated by ADMIN_PATCH_SECRET (set only in Vercel production env, never
 * committed) so this can't be triggered by anyone else. Meant to be called
 * once, then this route and the env var are deleted.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_PATCH_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const NEW_CONFIDENCE = 0.4;

  const job = await prisma.extractionJob.findFirst({
    where: {
      status: "SUCCEEDED",
      document: { originalFilename: "270843 Renovation.pdf" },
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, rawResponse: true },
  });

  if (!job) {
    return NextResponse.json({ error: "No matching succeeded job found for '270843 Renovation.pdf'." }, { status: 404 });
  }

  const fieldRow = await prisma.extractedField.findFirst({
    where: { extractionJobId: job.id, fieldKey: "approval_information.journal_number" },
  });

  if (!fieldRow) {
    return NextResponse.json({ error: "No matching ExtractedField row found.", jobId: job.id }, { status: 404 });
  }

  const before = { confidenceScore: fieldRow.confidenceScore, confidenceRemark: fieldRow.confidenceRemark };

  const updatedRow = await prisma.extractedField.update({
    where: { id: fieldRow.id },
    data: {
      confidenceScore: NEW_CONFIDENCE,
      confidenceRemark: "AgentStudio OCR confidence 40%: Value is handwritten and difficult to read reliably.",
    },
  });

  const rawResponse = job.rawResponse as any;
  const parseContent = rawResponse?.parseContent;
  let patchedStamp = false;

  if (parseContent) {
    for (const s of parseContent.stamps_and_handwriting ?? []) {
      if (s.type === "handwritten_note" && s.affected_fields?.includes("approval_information.journal_number")) {
        s.confidence = NEW_CONFIDENCE;
        if (s.text) s.text.confidence = NEW_CONFIDENCE;
        patchedStamp = true;
      }
    }
    if (parseContent.approval_information?.journal_number) {
      parseContent.approval_information.journal_number.confidence = NEW_CONFIDENCE;
    }
    await prisma.extractionJob.update({
      where: { id: job.id },
      data: { rawResponse },
    });
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    fieldRowId: fieldRow.id,
    before,
    after: { confidenceScore: updatedRow.confidenceScore, confidenceRemark: updatedRow.confidenceRemark },
    patchedRawJsonStamp: patchedStamp,
  });
}

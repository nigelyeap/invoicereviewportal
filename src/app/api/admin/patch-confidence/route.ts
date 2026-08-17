import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * TEMPORARY, ONE-OFF DEMO PATCH -- NOT PART OF THE APP'S NORMAL SURFACE.
 *
 * Generic version: overrides a single ExtractedField's confidenceScore (and,
 * if present, the matching entry inside the raw OCR JSON blob) for demo
 * purposes, since production runs its own database separate from local dev
 * and there's no other way to reach it than through the deployed app.
 *
 * Gated by ADMIN_PATCH_SECRET (set only in Vercel production env, never
 * committed). Meant to be called a handful of times for this demo, then
 * this route and the env var are deleted again.
 *
 * POST body: { documentFilename: string, fieldKey: string, newConfidence: number, remark?: string }
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_PATCH_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json();
  const { documentFilename, fieldKey, newConfidence, remark } = body as {
    documentFilename: string;
    fieldKey: string;
    newConfidence: number;
    remark?: string;
  };

  if (!documentFilename || !fieldKey || typeof newConfidence !== "number") {
    return NextResponse.json({ error: "documentFilename, fieldKey, newConfidence are required." }, { status: 400 });
  }

  const job = await prisma.extractionJob.findFirst({
    where: {
      status: "SUCCEEDED",
      document: { originalFilename: documentFilename },
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, rawResponse: true },
  });

  if (!job) {
    return NextResponse.json({ error: `No matching succeeded job found for '${documentFilename}'.` }, { status: 404 });
  }

  const fieldRow = await prisma.extractedField.findFirst({
    where: { extractionJobId: job.id, fieldKey },
  });

  if (!fieldRow) {
    return NextResponse.json({ error: `No ExtractedField row found for fieldKey '${fieldKey}'.`, jobId: job.id }, { status: 404 });
  }

  const before = { confidenceScore: fieldRow.confidenceScore, confidenceRemark: fieldRow.confidenceRemark };

  const defaultRemark = `AgentStudio OCR confidence ${Math.round(newConfidence * 100)}%.`;
  const updatedRow = await prisma.extractedField.update({
    where: { id: fieldRow.id },
    data: {
      confidenceScore: newConfidence,
      confidenceRemark: remark ?? defaultRemark,
    },
  });

  // Best-effort: also patch the matching leaf inside rawResponse.parseContent
  // (dot-path lookup by fieldKey, e.g. "invoice.invoice_number") so the raw
  // JSON stays consistent with the ExtractedField row.
  const rawResponse = job.rawResponse as any;
  const parseContent = rawResponse?.parseContent;
  let patchedRawJson = false;

  if (parseContent) {
    const parts = fieldKey.split(".");
    let cur = parseContent;
    for (let i = 0; i < parts.length - 1 && cur; i++) {
      cur = cur[parts[i]];
    }
    const leafKey = parts[parts.length - 1];
    if (cur && cur[leafKey] && typeof cur[leafKey] === "object" && "confidence" in cur[leafKey]) {
      cur[leafKey].confidence = newConfidence;
      patchedRawJson = true;
      await prisma.extractionJob.update({
        where: { id: job.id },
        data: { rawResponse },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    fieldRowId: fieldRow.id,
    before,
    after: { confidenceScore: updatedRow.confidenceScore, confidenceRemark: updatedRow.confidenceRemark },
    patchedRawJson,
  });
}

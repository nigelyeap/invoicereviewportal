import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter } from "@/lib/storage";

/**
 * GET /api/documents/[documentId]/file -- streams the original uploaded
 * bytes back for the review page's DocumentViewer (react-pdf for PDFs, a
 * plain <img> for images). Always goes through the storage adapter rather
 * than exposing storageKey/disk paths to the client.
 */
export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await context.params;

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await getStorageAdapter().readStoredFile(document.storageKey);
  } catch {
    return NextResponse.json({ error: "Stored file is missing." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": document.mimeType,
      "content-length": String(document.fileSizeBytes),
      "content-disposition": `inline; filename="${encodeURIComponent(document.originalFilename)}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}

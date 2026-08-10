import crypto from "node:crypto";
import path from "node:path";
import { put, head } from "@vercel/blob";
import { getEnv } from "@/lib/env";
import type { StorageAdapter } from "./types";

/**
 * Vercel Blob storage adapter -- used when the web app and the worker run
 * on separate hosts (e.g. web on Vercel, worker on Railway/Fly) and can no
 * longer share a local disk. Both sides talk to Blob over plain HTTPS, so
 * it works identically regardless of which host called it.
 *
 * PRIVACY NOTE: Vercel Blob objects are fetchable by anyone who has the
 * exact URL (there's no private/signed-URL mode at the base tier). This app
 * mitigates that the same way an unguessable S3 key would: storageKey is a
 * random UUID, and the client never sees a raw Blob URL -- it only ever
 * hits this app's own `/api/documents/[documentId]/file` route, which looks
 * the document up in Postgres first. If that's not strong enough isolation
 * for your data (e.g. compliance requirements), swap this adapter for one
 * backed by S3/R2 with presigned GETs instead -- same StorageAdapter shape.
 */
export function createVercelBlobStorageAdapter(): StorageAdapter {
  // On Vercel itself this is auto-injected once a Blob store is connected
  // to the project; on a separate worker host (Railway etc.) it must be set
  // explicitly as an env var, copied from the Vercel Blob dashboard.
  const token = getEnv().BLOB_READ_WRITE_TOKEN || undefined;

  async function saveUploadedFile(params: { originalFilename: string; buffer: Buffer }) {
    const ext = path.extname(params.originalFilename);
    const storageKey = `uploads/${crypto.randomUUID()}${ext}`;
    await put(storageKey, params.buffer, {
      access: "public",
      token,
      addRandomSuffix: false,
    });
    return { storageKey };
  }

  async function readStoredFile(storageKey: string): Promise<Buffer> {
    const meta = await head(storageKey, { token });
    const res = await fetch(meta.downloadUrl);
    if (!res.ok) {
      throw new Error(`Vercel Blob fetch failed for "${storageKey}": ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return { saveUploadedFile, readStoredFile };
}

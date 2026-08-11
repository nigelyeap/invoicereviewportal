import crypto from "node:crypto";
import path from "node:path";
import { put, get } from "@vercel/blob";
import { getEnv } from "@/lib/env";
import type { StorageAdapter } from "./types";

/**
 * Vercel Blob storage adapter -- used on Vercel, where serverless function
 * instances don't share a persistent local disk across invocations (the
 * instance that handles an upload request isn't guaranteed to be the same
 * one whose `after()` continuation later reads the file back, nor the one
 * that serves it later via /api/documents/[id]/file). Talks to Blob over
 * plain HTTPS, so it works identically regardless of which instance calls
 * it.
 *
 * ACCESS MODE: this store is created as "private" (the Vercel dashboard's
 * default for new Blob stores as of @vercel/blob 2.x) -- `access: "private"`
 * here must match. Uploading with `access: "public"` against a private store
 * fails outright ("Cannot use public access on a private store"), which is
 * what originally shipped here and broke the very first live upload. Private
 * blobs aren't fetchable by a bare URL at all (unlike the old public-only
 * behavior this file's comment used to describe) -- reads go through
 * `get()` below with the same read-write token used to write it, which is
 * strictly better isolation: the random-UUID storageKey plus this app's own
 * `/api/documents/[documentId]/file` route (Postgres lookup first) were
 * already the intended access path; this just makes the underlying Blob
 * object itself unreachable without the token too, not just unguessable.
 */
export function createVercelBlobStorageAdapter(): StorageAdapter {
  // Auto-injected by Vercel itself once a Blob store is connected to the
  // project.
  const token = getEnv().BLOB_READ_WRITE_TOKEN || undefined;

  async function saveUploadedFile(params: { originalFilename: string; buffer: Buffer }) {
    const ext = path.extname(params.originalFilename);
    const storageKey = `uploads/${crypto.randomUUID()}${ext}`;
    await put(storageKey, params.buffer, {
      access: "private",
      token,
      addRandomSuffix: false,
    });
    return { storageKey };
  }

  async function readStoredFile(storageKey: string): Promise<Buffer> {
    const result = await get(storageKey, { access: "private", token });
    if (!result?.stream) {
      throw new Error(`Vercel Blob fetch failed for "${storageKey}": not found`);
    }
    const arrayBuffer = await new Response(result.stream).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return { saveUploadedFile, readStoredFile };
}

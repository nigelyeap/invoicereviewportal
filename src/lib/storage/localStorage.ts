import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getEnv } from "@/lib/env";
import type { StorageAdapter } from "./types";

/**
 * Local-disk storage adapter. Only valid when web + worker share a
 * filesystem (single host, or the docker-compose.yml `uploads_data` volume
 * mounted into both containers) -- see vercelBlobStorage.ts for the
 * multi-host-safe alternative (needed once web/worker are split across
 * Vercel + a separate worker host).
 */
async function baseDir(): Promise<string> {
  // turbopackIgnore: LOCAL_STORAGE_DIR is a runtime env var, not a static
  // path -- without this hint Next's build tracer walks the whole project
  // (see next build warning this silences).
  const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), getEnv().LOCAL_STORAGE_DIR);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function createLocalStorageAdapter(): StorageAdapter {
  async function saveUploadedFile(params: { originalFilename: string; buffer: Buffer }) {
    const ext = path.extname(params.originalFilename);
    const storageKey = `${crypto.randomUUID()}${ext}`;
    const absolutePath = path.join(await baseDir(), storageKey);
    await fs.writeFile(absolutePath, params.buffer);
    return { storageKey };
  }

  async function readStoredFile(storageKey: string): Promise<Buffer> {
    const absolutePath = path.join(await baseDir(), storageKey);
    return fs.readFile(absolutePath);
  }

  return { saveUploadedFile, readStoredFile };
}

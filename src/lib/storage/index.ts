import { getEnv } from "@/lib/env";
import type { StorageAdapter } from "./types";
import { createLocalStorageAdapter } from "./localStorage";
import { createVercelBlobStorageAdapter } from "./vercelBlobStorage";

export type { StorageAdapter } from "./types";

let cached: StorageAdapter | null = null;

/**
 * Driver switch, mirroring the AGENTSTUDIO_CLIENT_MODE pattern in
 * src/lib/agentstudio/index.ts. Everything outside this directory should
 * import getStorageAdapter() rather than a concrete adapter directly.
 */
export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;
  const driver = getEnv().STORAGE_DRIVER;
  cached = driver === "vercel-blob" ? createVercelBlobStorageAdapter() : createLocalStorageAdapter();
  return cached;
}

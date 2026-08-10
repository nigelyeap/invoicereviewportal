/**
 * Storage adapter interface -- the swap point between local-disk storage
 * (v1, single-host/Docker-Compose dev) and a remote object-store adapter
 * (needed once web and worker run on separate hosts, e.g. Vercel + a
 * Railway/Fly worker, which don't share a filesystem). See index.ts for the
 * STORAGE_DRIVER-based switch and vercelBlobStorage.ts for the remote impl.
 *
 * Nothing outside this directory (and src/server/*Service.ts / worker/*,
 * which call getStorageAdapter()) should know or care which concrete
 * adapter is active.
 */
export interface StorageAdapter {
  saveUploadedFile(params: { originalFilename: string; buffer: Buffer }): Promise<{ storageKey: string }>;
  readStoredFile(storageKey: string): Promise<Buffer>;
}

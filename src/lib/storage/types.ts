/**
 * Storage adapter interface -- the swap point between local-disk storage
 * (v1, single-host/Docker-Compose dev, or self-hosted Node.js) and a remote
 * object-store adapter (needed on Vercel: serverless function instances
 * don't share a persistent local filesystem across invocations, so the file
 * an upload request writes to disk may not exist by the time the `after()`
 * continuation -- or a later request -- tries to read it back). See index.ts
 * for the STORAGE_DRIVER-based switch and vercelBlobStorage.ts for the
 * remote impl.
 *
 * Nothing outside this directory (and src/server/*.ts, which call
 * getStorageAdapter()) should know or care which concrete adapter is
 * active.
 */
export interface StorageAdapter {
  saveUploadedFile(params: { originalFilename: string; buffer: Buffer }): Promise<{ storageKey: string }>;
  readStoredFile(storageKey: string): Promise<Buffer>;
}

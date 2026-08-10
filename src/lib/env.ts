import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  AGENTSTUDIO_REST_BASE_URL: z.string().default("https://agents.dyna.ai"),
  AGENTSTUDIO_FLOW_UUID: z.string().default(""),

  AGENTSTUDIO_CLIENT_MODE: z.enum(["mock", "live"]).default("mock"),

  // "API Call" publish-platform credentials -- the sole live auth as of the
  // 2026-08-09 OCR-mode pivot (see client.ts's file-level doc comment for
  // the full history). Sent as headers (cybertron-robot-key/-token/username)
  // on both offline_upload_file and get_offline_file_status.
  AGENTSTUDIO_APICALL_ROBOT_KEY: z.string().default(""),
  AGENTSTUDIO_APICALL_ROBOT_TOKEN: z.string().default(""),
  AGENTSTUDIO_APICALL_TENANT_NAME: z.string().default(""),
  AGENTSTUDIO_APICALL_USERNAME: z.string().default(""),

  LOCAL_STORAGE_DIR: z.string().default("./.data/uploads"),

  // Storage adapter switch (src/lib/storage/index.ts). "local" (default)
  // needs web + worker to share a filesystem -- fine for a single host or
  // docker-compose.yml's shared volume, but breaks once they're split
  // across hosts (e.g. Vercel + a separate worker host), which is when
  // "vercel-blob" is needed instead. BLOB_READ_WRITE_TOKEN is auto-injected
  // on Vercel itself once a Blob store is connected to the project; a
  // separate worker host needs it set explicitly (copy from the Vercel
  // Blob dashboard).
  STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Lazily validated process.env. Call at the point of use (route handler /
 * worker entrypoint), not at module top-level, so it doesn't blow up
 * `next build`'s static analysis pass or unrelated unit tests.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables:\n${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

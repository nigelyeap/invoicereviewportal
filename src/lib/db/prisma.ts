import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";

/**
 * Prisma 7's "prisma-client" generator requires an explicit driver adapter
 * at runtime (no more implicit engine-managed connection pooling). Single
 * shared instance across the Next.js dev-server hot-reload boundary, per
 * the standard Next.js + Prisma singleton pattern.
 */
declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

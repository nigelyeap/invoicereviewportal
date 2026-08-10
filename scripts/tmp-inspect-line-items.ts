import { prisma } from "@/lib/db/prisma";

async function main() {
  const job = await prisma.extractionJob.findFirst({
    where: { document: { originalFilename: { contains: "270843 Renovation" } } },
    orderBy: { createdAt: "desc" },
    select: { rawResponse: true },
  });
  if (!job) { console.log("no job"); return; }
  const raw = job.rawResponse as { parseContent?: { line_items?: unknown[] } } | null;
  const items = raw?.parseContent?.line_items ?? [];
  console.log(JSON.stringify(items[0], null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

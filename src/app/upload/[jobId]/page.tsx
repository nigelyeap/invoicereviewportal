"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JobStatusBadge, TERMINAL_JOB_STATUSES } from "@/components/upload/JobStatusBadge";
import { AlertCircle, Check, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface JobResponse {
  job: {
    id: string;
    status: string;
    errorMessage: string | null;
    document: { originalFilename: string };
    createdAt: string;
    completedAt: string | null;
  };
}

async function fetchJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to load job (${res.status})`);
  }
  return res.json();
}

const STEPS = [
  { key: "PENDING", label: "Queued" },
  { key: "SUBMITTING", label: "Submitting" },
  { key: "PROCESSING", label: "Processing" },
  { key: "SUCCEEDED", label: "Ready" },
] as const;

function stepIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  if (idx !== -1) return idx;
  if (status === "FAILED" || status === "TIMED_OUT") return -1;
  return 0;
}

function StatusSteps({ status }: { status: string }) {
  const failed = status === "FAILED" || status === "TIMED_OUT";
  const current = stepIndex(status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, idx) => {
        const done = !failed && idx < current;
        const active = !failed && idx === current;
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-initial">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                  failed && idx <= 0
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : idx + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] whitespace-nowrap",
                  active || done ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn("mx-1.5 mb-4.5 h-px flex-1", done ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function JobStatusPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);

  const { data, error, isPending } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status && TERMINAL_JOB_STATUSES.has(status) ? false : 2000;
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate">
                {data ? data.job.document.originalFilename : "Loading document..."}
              </CardTitle>
              <CardDescription>Extraction status</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading...
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn&apos;t load job</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          )}

          {data && (
            <>
              {data.job.status !== "FAILED" && data.job.status !== "TIMED_OUT" && (
                <StatusSteps status={data.job.status} />
              )}

              <div className="flex items-center gap-3">
                <JobStatusBadge status={data.job.status} />
                {!TERMINAL_JOB_STATUSES.has(data.job.status) && (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    This can take a couple of minutes.
                  </span>
                )}
              </div>

              {data.job.status === "SUCCEEDED" && (
                <Alert>
                  <Check />
                  <AlertTitle>Extraction complete</AlertTitle>
                  <AlertDescription>Fields were extracted and are ready for review.</AlertDescription>
                </Alert>
              )}

              {(data.job.status === "FAILED" || data.job.status === "TIMED_OUT") && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{data.job.status === "TIMED_OUT" ? "Extraction timed out" : "Extraction failed"}</AlertTitle>
                  <AlertDescription>
                    {data.job.errorMessage ?? "Something went wrong during extraction."}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                {data.job.status === "SUCCEEDED" && (
                  <Link href={`/review/${jobId}`} className={buttonVariants({ variant: "default" })}>
                    Review extracted fields
                  </Link>
                )}
                <Link href="/upload" className={buttonVariants({ variant: "outline" })}>
                  Upload another
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

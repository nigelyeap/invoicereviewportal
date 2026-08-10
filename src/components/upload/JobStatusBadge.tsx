import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Queued",
  SUBMITTING: "Submitting",
  PROCESSING: "Processing",
  SUCCEEDED: "Ready",
  FAILED: "Failed",
  TIMED_OUT: "Timed out",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  SUBMITTING: "secondary",
  PROCESSING: "secondary",
  SUCCEEDED: "default",
  FAILED: "destructive",
  TIMED_OUT: "destructive",
};

export function JobStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export const TERMINAL_JOB_STATUSES = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT"]);

"use client";

import { use, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, Download, FileText, LayoutTemplate } from "lucide-react";
import { FieldPanel, type ExtractedFieldRow } from "@/components/review/FieldPanel";
import { ValidationSummary } from "@/components/review/ValidationSummary";
import type { HighlightTarget } from "@/components/review/DocumentViewer";
import type { AgentNotes } from "@/lib/agentstudio/agentNotes";
import { cn } from "@/lib/utils";

// pdfjs touches browser-only globals (DOMMatrix etc) -- never render this
// component during SSR.
const DocumentViewer = dynamic(
  () => import("@/components/review/DocumentViewer").then((m) => m.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center gap-2 rounded-lg border bg-muted/30 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading viewer...
      </div>
    ),
  },
);

interface JobDetail {
  id: string;
  status: string;
  appliedFieldTemplateId: string | null;
  document: { id: string; originalFilename: string; mimeType: string };
  extractedFields: ExtractedFieldRow[];
  validationStatus: "NOT_STARTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  validationReportHtml: string | null;
}

interface TemplateSummary {
  id: string;
  name: string;
}

async function fetchJob(jobId: string): Promise<{ job: JobDetail; agentNotes: AgentNotes | null }> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to load job (${res.status})`);
  return res.json();
}

async function fetchTemplates(): Promise<{ templates: TemplateSummary[] }> {
  const res = await fetch("/api/templates");
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
  return res.json();
}

export default function ReviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const queryClient = useQueryClient();
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId),
    // Extraction (job.status) is already terminal by the time this page is
    // reachable -- see the SUCCEEDED guard below -- but the validation report
    // is a second, slower AgentStudio call chained after it server-side (see
    // extractionRunner.ts) and may still be NOT_STARTED/PROCESSING on first
    // load. Poll until it reaches its own terminal state so the report
    // appears without a manual refresh.
    refetchInterval: (query) => {
      const validationStatus = query.state.data?.job.validationStatus;
      return validationStatus === "PROCESSING" || validationStatus === "NOT_STARTED" ? 3000 : false;
    },
  });
  const templatesQuery = useQuery({ queryKey: ["templates"], queryFn: fetchTemplates });

  const patchField = useMutation({
    mutationFn: async (params: { fieldId: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/jobs/${jobId}/fields/${params.fieldId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params.body),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Failed to save (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
  });

  const applyTemplate = useMutation({
    mutationFn: async (templateId: string | null) => {
      const res = await fetch(`/api/jobs/${jobId}/apply-template`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Failed to apply template (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job", jobId] }),
  });

  if (jobQuery.isPending) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-6 py-16">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading...
        </div>
      </main>
    );
  }

  if (jobQuery.error) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t load job</AlertTitle>
          <AlertDescription>{(jobQuery.error as Error).message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  const job = jobQuery.data!.job;

  if (job.status !== "SUCCEEDED") {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <Alert>
          <AlertCircle />
          <AlertTitle>Not ready for review</AlertTitle>
          <AlertDescription>
            This job is currently {job.status.toLowerCase()}.{" "}
            <Link href={`/upload/${jobId}`} className="underline">
              Check its status
            </Link>
            .
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const selectedFieldCount = job.extractedFields.filter((f) => f.isSelected).length;
  const totalFieldCount = job.extractedFields.length;

  const selectedField = job.extractedFields.find((f) => f.id === selectedFieldId) ?? null;
  const highlight: HighlightTarget | null = selectedField
    ? {
        sourceText: selectedField.sourceText,
        sourcePageNumber: selectedField.sourcePageNumber,
        sourceBbox: selectedField.sourceBbox,
      }
    : null;
  const selectField = (field: ExtractedFieldRow) => setSelectedFieldId(field.id);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border bg-white px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileText className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{job.document.originalFilename}</h1>
            <p className="text-xs text-muted-foreground">
              Click a field to locate it in the document. Edits save automatically.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 py-1.5 pr-2.5 pl-3">
            <LayoutTemplate className="size-4 shrink-0 text-primary" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Field template
              </span>
              <Select
                value={job.appliedFieldTemplateId}
                onValueChange={(value: string | null) => applyTemplate.mutate(value)}
              >
                <SelectTrigger
                  disabled={applyTemplate.isPending}
                  aria-label="Choose which fields to show for this document"
                  className="h-5 border-none bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0"
                >
                  <SelectValue placeholder="All fields (no template)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All fields (no template)</SelectItem>
                  {templatesQuery.data?.templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="ml-1 shrink-0">
              {selectedFieldCount} of {totalFieldCount} fields shown
            </Badge>
          </div>
          <Link
            href={`/api/jobs/${jobId}/export`}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
          >
            <Download className="size-3.5" />
            Export to Excel
          </Link>
        </div>
      </div>

      {applyTemplate.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t apply template</AlertTitle>
          <AlertDescription>{(applyTemplate.error as Error).message}</AlertDescription>
        </Alert>
      )}

      <ValidationSummary
        fields={job.extractedFields}
        agentNotes={jobQuery.data!.agentNotes}
        validationStatus={job.validationStatus}
        validationReportHtml={job.validationReportHtml}
        onSelectField={selectField}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DocumentViewer documentId={job.document.id} mimeType={job.document.mimeType} highlight={highlight} />

        <div className="max-h-[calc(100vh-12rem)] overflow-auto pr-1">
          <FieldPanel
            fields={job.extractedFields}
            selectedFieldId={selectedFieldId}
            onSelectField={selectField}
            onValueChange={(fieldId, newValue) =>
              patchField.mutate({ fieldId, body: { currentValue: newValue || null } })
            }
            onSelectionChange={(fieldId, isSelected) => patchField.mutate({ fieldId, body: { isSelected } })}
          />
        </div>
      </div>
    </main>
  );
}

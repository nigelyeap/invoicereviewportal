"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, FileText, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadResponse {
  documentId: string;
  jobId: string;
  status: string;
}

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadDocument(formData: FormData): Promise<UploadResponse> {
  const res = await fetch("/api/documents", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedByName, setUploadedByName] = useState("");

  const mutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: (data) => {
      router.push(`/upload/${data.jobId}`);
    },
  });

  const acceptFile = useCallback((candidate: File | null | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.includes(candidate.type)) return;
    setFile(candidate);
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.set("file", file);
    if (uploadedByName.trim()) formData.set("uploadedByName", uploadedByName.trim());

    mutation.mutate(formData);
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Upload an invoice</CardTitle>
          <CardDescription>
            Upload a PDF or image invoice. It will be sent to the extraction agent, and you&apos;ll be able to
            review and edit the results next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="file">Invoice file</Label>

              {!file ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    acceptFile(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                    isDragging
                      ? "border-primary bg-accent"
                      : "border-border bg-muted/40 hover:border-muted-foreground/40 hover:bg-muted/60",
                  )}
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <UploadCloud className="size-5" />
                  </span>
                  <p className="text-sm font-medium">Drag and drop your invoice here</p>
                  <p className="text-xs text-muted-foreground">or click to browse -- PDF, PNG, JPEG, or WebP</p>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileText className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove file"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}

              <Input
                id="file"
                name="file"
                type="file"
                ref={fileInputRef}
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0])}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="uploadedByName">Your name (optional)</Label>
              <Input
                id="uploadedByName"
                name="uploadedByName"
                type="text"
                placeholder="e.g. Nigel"
                value={uploadedByName}
                onChange={(e) => setUploadedByName(e.target.value)}
              />
            </div>

            {mutation.isError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Upload failed</AlertTitle>
                <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={!file || mutation.isPending} className="w-full">
              {mutation.isPending ? "Uploading..." : "Upload and start extraction"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutTemplate, ListChecks, Loader2, Trash2 } from "lucide-react";

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  items: { id: string }[];
}

async function fetchTemplates(): Promise<{ templates: TemplateSummary[] }> {
  const res = await fetch("/api/templates");
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
  return res.json();
}

async function deleteTemplateRequest(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Failed to delete template (${res.status})`);
  }
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: ["templates"], queryFn: fetchTemplates });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplateRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Field templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable sets of fields -- which ones matter, which are required, and how they&apos;re labeled.
          </p>
        </div>
        <Link href="/templates/new" className={buttonVariants({ variant: "default" })}>
          New template
        </Link>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading templates...
        </div>
      )}

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <div className="flex flex-col gap-3">
        {data?.templates.map((template) => (
          <Card key={template.id} className="transition-shadow hover:shadow-sm">
            <CardHeader className="flex-row items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <LayoutTemplate className="size-4.5" />
                </span>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {template.name}
                    {template.isDefault && <Badge variant="secondary">Default</Badge>}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <ListChecks className="size-3.5" />
                    {template.items.length} field{template.items.length === 1 ? "" : "s"}
                    {template.description ? ` -- ${template.description}` : ""}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/templates/${template.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Edit
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete template"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`Delete template "${template.name}"?`)) {
                      deleteMutation.mutate(template.id);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}

        {data && data.templates.length === 0 && (
          <Card>
            <CardHeader className="items-center py-8 text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <LayoutTemplate className="size-5" />
              </span>
              <CardTitle className="mt-1">No templates yet</CardTitle>
              <CardDescription>Create one to control which fields show up on the review page.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </main>
  );
}

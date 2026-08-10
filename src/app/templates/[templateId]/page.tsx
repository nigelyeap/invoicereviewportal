"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";

interface CatalogEntry {
  fieldKey: string;
  label: string;
  dataType: string;
  fieldGroup: "HEADER" | "LINE_ITEM" | "TOTALS";
  isLineItemField: boolean;
}

interface TemplateItem {
  fieldKey: string;
  displayOrder: number;
  isRequired: boolean;
  overrideLabel: string | null;
}

interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  items: TemplateItem[];
}

async function fetchCatalog(): Promise<{ entries: CatalogEntry[] }> {
  const res = await fetch("/api/field-catalog");
  if (!res.ok) throw new Error(`Failed to load field catalog (${res.status})`);
  return res.json();
}

async function fetchTemplate(id: string): Promise<{ template: TemplateDetail }> {
  const res = await fetch(`/api/templates/${id}`);
  if (!res.ok) throw new Error(`Failed to load template (${res.status})`);
  return res.json();
}

interface FormState {
  name: string;
  description: string;
  isDefault: boolean;
  items: TemplateItem[];
}

export default function TemplateEditorPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = use(params);
  const isNew = templateId === "new";
  const router = useRouter();

  const catalogQuery = useQuery({ queryKey: ["field-catalog"], queryFn: fetchCatalog });
  const templateQuery = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => fetchTemplate(templateId),
    enabled: !isNew,
  });

  const [form, setForm] = useState<FormState>({ name: "", description: "", isDefault: false, items: [] });
  // Tracks which templateId the form was last hydrated from server data for.
  // Comparing (and updating) this during render -- rather than in a
  // useEffect -- follows React's documented "adjusting state when a prop
  // changes" pattern: https://react.dev/learn/you-might-not-need-an-effect
  // -- it re-renders once before paint instead of committing a stale frame
  // and then cascading into a second render from an effect.
  const [hydratedFor, setHydratedFor] = useState<string | null>(isNew ? templateId : null);

  if (!isNew && templateQuery.data && hydratedFor !== templateId) {
    const t = templateQuery.data.template;
    setForm({
      name: t.name,
      description: t.description ?? "",
      isDefault: t.isDefault,
      items: [...t.items].sort((a, b) => a.displayOrder - b.displayOrder),
    });
    setHydratedFor(templateId);
  }

  const catalogByKey = new Map((catalogQuery.data?.entries ?? []).map((e) => [e.fieldKey, e]));
  const includedKeys = new Set(form.items.map((i) => i.fieldKey));
  const availableEntries = (catalogQuery.data?.entries ?? []).filter((e) => !includedKeys.has(e.fieldKey));

  function addField(fieldKey: string) {
    if (!fieldKey || includedKeys.has(fieldKey)) return;
    setForm((f) => ({
      ...f,
      items: [...f.items, { fieldKey, displayOrder: f.items.length, isRequired: false, overrideLabel: null }],
    }));
  }

  function removeField(fieldKey: string) {
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.fieldKey !== fieldKey) }));
  }

  function moveField(index: number, direction: -1 | 1) {
    setForm((f) => {
      const next = [...f.items];
      const swapWith = index + direction;
      if (swapWith < 0 || swapWith >= next.length) return f;
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return { ...f, items: next };
    });
  }

  function updateItem(fieldKey: string, patch: Partial<TemplateItem>) {
    setForm((f) => ({
      ...f,
      items: f.items.map((i) => (i.fieldKey === fieldKey ? { ...i, ...patch } : i)),
    }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        isDefault: form.isDefault,
        items: form.items.map((item, idx) => ({ ...item, displayOrder: idx })),
      };
      const res = await fetch(isNew ? "/api/templates" : `/api/templates/${templateId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : `Save failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => router.push("/templates"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/templates/${templateId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
    },
    onSuccess: () => router.push("/templates"),
  });

  const loading = catalogQuery.isPending || (!isNew && templateQuery.isPending);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{isNew ? "New template" : "Edit template"}</h1>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading...
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Default Invoice Fields"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDefault"
                  checked={form.isDefault}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, isDefault: checked === true }))}
                />
                <Label htmlFor="isDefault">Use as the default template for new jobs</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fields</CardTitle>
              <CardDescription>Choose which fields are included, mark required ones, and reorder.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {form.items.length === 0 && (
                <p className="text-sm text-muted-foreground">No fields added yet.</p>
              )}

              <div className="flex flex-col gap-2">
                {form.items.map((item, index) => {
                  const catalogEntry = catalogByKey.get(item.fieldKey);
                  return (
                    <div key={item.fieldKey} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex flex-col gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0}
                          onClick={() => moveField(index, -1)}
                          aria-label="Move up"
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === form.items.length - 1}
                          onClick={() => moveField(index, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                      </div>

                      <div className="min-w-40 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{catalogEntry?.label ?? item.fieldKey}</span>
                          <Badge variant="outline">{catalogEntry?.fieldGroup ?? "?"}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{item.fieldKey}</span>
                      </div>

                      <Input
                        placeholder="Override label (optional)"
                        value={item.overrideLabel ?? ""}
                        onChange={(e) => updateItem(item.fieldKey, { overrideLabel: e.target.value || null })}
                        className="w-56"
                      />

                      <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                        <Checkbox
                          checked={item.isRequired}
                          onCheckedChange={(checked) => updateItem(item.fieldKey, { isRequired: checked === true })}
                        />
                        Required
                      </label>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove field"
                        onClick={() => removeField(item.fieldKey)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>

              {availableEntries.length > 0 && (
                <div className="flex flex-col gap-2 border-t pt-4">
                  <Label htmlFor="add-field">Add a field</Label>
                  <select
                    id="add-field"
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value=""
                    onChange={(e) => addField(e.target.value)}
                  >
                    <option value="" disabled>
                      Select a field to add...
                    </option>
                    {(["HEADER", "LINE_ITEM", "TOTALS"] as const).map((group) => {
                      const groupEntries = availableEntries.filter((e) => e.fieldGroup === group);
                      if (groupEntries.length === 0) return null;
                      return (
                        <optgroup key={group} label={group}>
                          {groupEntries.map((e) => (
                            <option key={e.fieldKey} value={e.fieldKey}>
                              {e.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          {saveMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn&apos;t save</AlertTitle>
              <AlertDescription>{(saveMutation.error as Error).message}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.name.trim()}
              >
                {saveMutation.isPending ? "Saving..." : "Save template"}
              </Button>
              <Button variant="outline" onClick={() => router.push("/templates")}>
                Cancel
              </Button>
            </div>
            {!isNew && (
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm(`Delete template "${form.name}"?`)) deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" /> Delete template
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

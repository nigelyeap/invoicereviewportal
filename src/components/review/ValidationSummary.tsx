"use client";

import { AlertTriangle, CheckCircle2, FileText, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ExtractedFieldRow } from "./FieldPanel";

const GROUP_LABEL: Record<ExtractedFieldRow["fieldGroup"], string> = {
  HEADER: "Header",
  LINE_ITEM: "Line items",
  TOTALS: "Totals",
};

/**
 * Every field's validation/confidence writeup, laid out as one continuous
 * readable report rather than the trimmed "issues only" list in the summary
 * card -- this is the "full text" behind the "Validation & analysis" line,
 * opened via the "View full report" button.
 */
function FullReport({ fields }: { fields: ExtractedFieldRow[] }) {
  const groups: ExtractedFieldRow["fieldGroup"][] = ["HEADER", "LINE_ITEM", "TOTALS"];

  return (
    <div className="flex flex-col gap-5 text-sm">
      {groups.map((group) => {
        const groupFields = fields.filter((f) => f.fieldGroup === group);
        if (groupFields.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {GROUP_LABEL[group]}
            </h3>
            <div className="flex flex-col divide-y divide-border rounded-lg border">
              {groupFields.map((f) => (
                <div key={f.id} className="flex flex-col gap-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {f.overrideLabel ?? f.label}
                      {f.lineItemIndex !== null && (
                        <span className="ml-1 font-normal text-muted-foreground">(item {f.lineItemIndex + 1})</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {f.confidenceScore === null ? "confidence n/a" : `${Math.round(f.confidenceScore * 100)}% confidence`}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{f.currentValue || <em>(no value)</em>}</p>
                  <div className="flex items-start gap-1.5 text-xs">
                    {f.validationStatus === "INVALID" ? (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : f.validationStatus === "WARNING" ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    ) : f.validationStatus === "VALID" ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    ) : null}
                    <span>
                      {f.validationMessage ?? f.confidenceRemark ?? "No additional analysis for this field."}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Aggregate view of the per-field validation/confidence data that already
 * exists on each ExtractedField (see validationRules.ts / confidence.ts) but
 * was previously only ever shown inline, one row at a time, in FieldPanel.
 * This surfaces it as its own "how did this extraction go" summary at the
 * top of the review page -- counts, average confidence, and a jump-to-field
 * list of every WARNING/INVALID field (including the cross-field arithmetic
 * checks: line items vs. subtotal, subtotal+tax vs. total). The "View full
 * report" button opens the complete per-field writeup (FullReport above)
 * for every field, not just the ones with issues.
 */
export function ValidationSummary({
  fields,
  onSelectField,
}: {
  fields: ExtractedFieldRow[];
  onSelectField: (field: ExtractedFieldRow) => void;
}) {
  if (fields.length === 0) return null;

  const invalid = fields.filter((f) => f.validationStatus === "INVALID");
  const warning = fields.filter((f) => f.validationStatus === "WARNING");
  const valid = fields.filter((f) => f.validationStatus === "VALID");
  const scored = fields.filter((f) => f.confidenceScore !== null);
  const avgConfidence =
    scored.length > 0 ? scored.reduce((sum, f) => sum + (f.confidenceScore ?? 0), 0) / scored.length : null;
  const issues = [...invalid, ...warning];
  const allClear = issues.length === 0;

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border px-5 py-4",
        allClear ? "border-primary/25 bg-primary/5" : "border-amber-300 bg-amber-50",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {allClear ? (
            <CheckCircle2 className="size-4.5 shrink-0 text-primary" />
          ) : (
            <AlertTriangle className="size-4.5 shrink-0 text-amber-600" />
          )}
          <h2 className="text-sm font-semibold">
            {allClear
              ? "Validation & analysis -- no issues found"
              : `Validation & analysis -- ${issues.length} issue${issues.length === 1 ? "" : "s"} found`}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-primary" />
            {valid.length} valid
          </span>
          {warning.length > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="size-3.5 text-amber-600" />
              {warning.length} warning{warning.length === 1 ? "" : "s"}
            </span>
          )}
          {invalid.length > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="size-3.5 text-destructive" />
              {invalid.length} invalid
            </span>
          )}
          {avgConfidence !== null && <span>avg. confidence {Math.round(avgConfidence * 100)}%</span>}
          <Dialog>
            <DialogTrigger
              render={
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                  <FileText className="size-3.5" />
                  View full report
                </Button>
              }
            />
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
              <DialogHeader className="border-b px-6 pt-6 pb-4">
                <DialogTitle>Validation & analysis -- full report</DialogTitle>
                <DialogDescription>
                  Confidence and validation notes for every extracted field, not just the ones with issues.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto px-6 pb-6">
                <FullReport fields={fields} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-black/5 pt-3">
          {issues.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelectField(f)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-black/5"
              >
                {f.validationStatus === "INVALID" ? (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                )}
                <span>
                  <span className="font-medium">{f.overrideLabel ?? f.label}:</span>{" "}
                  <span className="text-muted-foreground">{f.validationMessage ?? "Needs review."}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

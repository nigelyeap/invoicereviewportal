"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractedFieldRow } from "./FieldPanel";

/**
 * Aggregate view of the per-field validation/confidence data that already
 * exists on each ExtractedField (see validationRules.ts / confidence.ts) but
 * was previously only ever shown inline, one row at a time, in FieldPanel.
 * This surfaces it as its own "how did this extraction go" summary at the
 * top of the review page -- counts, average confidence, and a jump-to-field
 * list of every WARNING/INVALID field (including the cross-field arithmetic
 * checks: line items vs. subtotal, subtotal+tax vs. total).
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

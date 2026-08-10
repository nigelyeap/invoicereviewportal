"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";

export interface ExtractedFieldRow {
  id: string;
  fieldKey: string;
  fieldGroup: "HEADER" | "LINE_ITEM" | "TOTALS";
  lineItemIndex: number | null;
  label: string;
  dataType: string;
  originalValue: string | null;
  currentValue: string | null;
  confidenceScore: number | null;
  confidenceRemark: string | null;
  sourceText: string | null;
  sourcePageNumber: number | null;
  /** Real pixel-normalized [x_min,y_min,x_max,y_max] (0-1000 scale) from AgentStudio's OCR-mode response, null if not reported for this field. */
  sourceBbox: [number, number, number, number] | null;
  validationStatus: "VALID" | "WARNING" | "INVALID" | "NOT_APPLICABLE";
  validationMessage: string | null;
  isSelected: boolean;
  displayOrder: number;
  overrideLabel: string | null;
  wasEdited: boolean;
}

const GROUP_LABEL: Record<ExtractedFieldRow["fieldGroup"], string> = {
  HEADER: "Header",
  LINE_ITEM: "Line items",
  TOTALS: "Totals",
};

function confidenceVariant(score: number | null): "default" | "secondary" | "destructive" | "outline" {
  if (score === null) return "outline";
  if (score >= 0.7) return "default";
  if (score >= 0.4) return "secondary";
  return "destructive";
}

function ValidationIcon({ status }: { status: ExtractedFieldRow["validationStatus"] }) {
  switch (status) {
    case "VALID":
      return <CheckCircle2 className="size-3.5 text-primary" />;
    case "WARNING":
      return <AlertTriangle className="size-3.5 text-amber-600" />;
    case "INVALID":
      return <XCircle className="size-3.5 text-destructive" />;
    default:
      return <MinusCircle className="size-3.5 text-muted-foreground" />;
  }
}

function FieldRow({
  field,
  isActive,
  onSelect,
  onValueChange,
  onSelectionChange,
}: {
  field: ExtractedFieldRow;
  isActive: boolean;
  onSelect: () => void;
  onValueChange: (newValue: string) => void;
  onSelectionChange: (isSelected: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftValue, setDraftValue] = useState(field.currentValue ?? "");

  // Keep the draft in sync if the field's server value changes out from
  // under us (e.g. template reapply), but not while the input has focus.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraftValue(field.currentValue ?? "");
    }
  }, [field.currentValue]);

  const commit = () => {
    if (draftValue !== (field.currentValue ?? "")) onValueChange(draftValue);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 transition-colors",
        isActive ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Checkbox
            checked={field.isSelected}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={(checked) => onSelectionChange(checked === true)}
          />
          <span className="truncate text-sm font-medium">{field.overrideLabel ?? field.label}</span>
          {field.wasEdited && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Edited
            </Badge>
          )}
        </div>
        <Badge variant={confidenceVariant(field.confidenceScore)} className="shrink-0">
          {field.confidenceScore === null ? "n/a" : `${Math.round(field.confidenceScore * 100)}%`}
        </Badge>
      </div>

      <Input
        ref={inputRef}
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={field.validationStatus === "INVALID" ? "border-destructive" : undefined}
      />

      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ValidationIcon status={field.validationStatus} />
        <span>
          {field.validationStatus !== "NOT_APPLICABLE" && field.validationMessage
            ? field.validationMessage
            : field.confidenceRemark ?? null}
        </span>
      </div>
    </div>
  );
}

export function FieldPanel({
  fields,
  selectedFieldId,
  onSelectField,
  onValueChange,
  onSelectionChange,
}: {
  fields: ExtractedFieldRow[];
  selectedFieldId: string | null;
  onSelectField: (field: ExtractedFieldRow) => void;
  onValueChange: (fieldId: string, newValue: string) => void;
  onSelectionChange: (fieldId: string, isSelected: boolean) => void;
}) {
  const groups: ExtractedFieldRow["fieldGroup"][] = ["HEADER", "LINE_ITEM", "TOTALS"];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const groupFields = fields.filter((f) => f.fieldGroup === group);
        if (groupFields.length === 0) return null;

        if (group !== "LINE_ITEM") {
          return (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {GROUP_LABEL[group]}
              </h3>
              <div className="flex flex-col gap-2">
                {groupFields.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    isActive={field.id === selectedFieldId}
                    onSelect={() => onSelectField(field)}
                    onValueChange={(v) => onValueChange(field.id, v)}
                    onSelectionChange={(v) => onSelectionChange(field.id, v)}
                  />
                ))}
              </div>
            </div>
          );
        }

        const byLineItem = new Map<number, ExtractedFieldRow[]>();
        for (const field of groupFields) {
          const idx = field.lineItemIndex ?? 0;
          if (!byLineItem.has(idx)) byLineItem.set(idx, []);
          byLineItem.get(idx)!.push(field);
        }

        return (
          <div key={group} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{GROUP_LABEL[group]}</h3>
            {[...byLineItem.entries()]
              .sort(([a], [b]) => a - b)
              .map(([lineItemIndex, lineFields]) => (
                <div key={lineItemIndex} className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
                  <span className="text-xs font-medium text-muted-foreground">Item {lineItemIndex + 1}</span>
                  {lineFields.map((field) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      isActive={field.id === selectedFieldId}
                      onSelect={() => onSelectField(field)}
                      onValueChange={(v) => onValueChange(field.id, v)}
                      onSelectionChange={(v) => onSelectionChange(field.id, v)}
                    />
                  ))}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

import { parseExtractionResult } from "./parser";
import { computeFieldConfidence } from "./confidence";
import { computeArithmeticValidations, validateDataTypeShape } from "./validationRules";
import type { FieldDataType, FieldGroup, OcrBoundingBox, OcrDocument, ParsedField, ValidationStatus } from "./types";

/** Lightweight, decoupled-from-Prisma shape so this file is unit-testable without a live DB. */
export interface CatalogEntryLike {
  fieldKey: string;
  label: string;
  dataType: FieldDataType;
  fieldGroup: FieldGroup;
  isLineItemField: boolean;
}

export interface TemplateItemLike {
  fieldKey: string;
  displayOrder: number;
  isRequired: boolean;
  overrideLabel: string | null;
}

/** One row ready to be passed to `prisma.extractedField.create` (extractionJobId supplied by the caller). */
export interface ExtractedFieldRow {
  fieldKey: string;
  fieldGroup: FieldGroup;
  lineItemIndex: number | null;
  label: string;
  dataType: FieldDataType;
  originalValue: string | null;
  currentValue: string | null;
  confidenceScore: number;
  confidenceRemark: string;
  sourceText: string | null;
  sourcePageNumber: number | null;
  sourceBbox: OcrBoundingBox | null;
  validationStatus: ValidationStatus;
  validationMessage: string | null;
  isSelected: boolean;
  displayOrder: number;
  overrideLabel: string | null;
}

/**
 * Turns AgentStudio's OCR-mode structured JSON into DB-ready ExtractedField
 * rows, combining the parsed values (now carrying AgentStudio's own
 * confidence + page + bounding box -- see confidence.ts) with (optionally)
 * a FieldTemplate's selection/ordering. Cross-field arithmetic/data-type
 * validation is still portal-computed (validationRules.ts) -- AgentStudio's
 * OCR mode doesn't validate, only extracts.
 *
 * Any parsed field whose catalogKey isn't in `catalogEntries` still
 * produces a row (dataType inferred as STRING, unselected by default) so
 * nothing the agent extracted is silently dropped -- it's just not part of
 * the known/expected set yet. This now also applies to extra per-line-item
 * fields (e.g. `model`, `serial_numbers`) that the old markdown-era mapper
 * used to skip entirely.
 */
export function buildExtractedFieldRows(params: {
  ocrResult: OcrDocument;
  catalogEntries: CatalogEntryLike[];
  template?: TemplateItemLike[] | null;
}): ExtractedFieldRow[] {
  const { ocrResult, catalogEntries, template } = params;
  const { fields: parsedFields } = parseExtractionResult(ocrResult);
  const arithmeticOverrides = computeArithmeticValidations(parsedFields);

  const catalogByKey = new Map(catalogEntries.map((c) => [c.fieldKey, c]));
  const templateByKey = new Map((template ?? []).map((t) => [t.fieldKey, t]));
  const hasTemplate = !!template && template.length > 0;

  const parsedByKey = new Map(parsedFields.map((f) => [f.key, f]));
  const lineItemIndices = [
    ...new Set(parsedFields.filter((f) => f.lineItemIndex !== undefined).map((f) => f.lineItemIndex!)),
  ].sort((a, b) => a - b);

  const rows: ExtractedFieldRow[] = [];
  let fallbackDisplayOrder = 10_000; // fields not in any catalog/template sort after known ones

  const pushRow = (
    fieldKey: string,
    catalogKey: string,
    parsed: ParsedField | null,
    catalogEntry: CatalogEntryLike | undefined,
    lineItemIndex: number | null,
  ) => {
    const dataType = catalogEntry?.dataType ?? "STRING";
    const fieldGroup = catalogEntry?.fieldGroup ?? parsed?.group ?? "HEADER";
    const label = catalogEntry?.label ?? parsed?.label ?? fieldKey;
    const isLineItem = fieldGroup === "LINE_ITEM";

    const templateItem = templateByKey.get(catalogKey);
    const isRequired = templateItem?.isRequired ?? false;

    const confidence = computeFieldConfidence({ field: parsed, dataType, isRequired });

    const arithmeticOverride = arithmeticOverrides[catalogKey];
    const shapeValidation = validateDataTypeShape(parsed?.value ?? null, dataType);
    const validation = arithmeticOverride ?? shapeValidation;

    // Selection: if a template was supplied, only its items are pre-selected;
    // otherwise everything the catalog knows about defaults to selected, and
    // anything outside the catalog defaults to unselected (surfaced, not required).
    const isSelected = hasTemplate ? templateByKey.has(catalogKey) : catalogEntry !== undefined;
    const displayOrder = templateItem?.displayOrder ?? (catalogEntry ? fallbackDisplayOrder++ : fallbackDisplayOrder++);

    rows.push({
      fieldKey,
      fieldGroup,
      lineItemIndex: isLineItem ? lineItemIndex : null,
      label: templateItem?.overrideLabel ?? label,
      dataType,
      originalValue: parsed?.value ?? null,
      currentValue: parsed?.value ?? null,
      confidenceScore: confidence.score,
      confidenceRemark: confidence.remark,
      sourceText: parsed?.sourceText ?? null,
      sourcePageNumber: parsed?.sourcePage ?? null,
      sourceBbox: parsed?.sourceBbox ?? null,
      validationStatus: validation.status,
      validationMessage: validation.message,
      isSelected,
      displayOrder,
      overrideLabel: templateItem?.overrideLabel ?? null,
    });
  };

  // Header + totals: one row per non-line-item catalog entry.
  for (const entry of catalogEntries) {
    if (entry.isLineItemField) continue;
    const parsed = parsedByKey.get(entry.fieldKey) ?? null;
    pushRow(entry.fieldKey, entry.fieldKey, parsed, entry, null);
  }

  // Line items: one row per (line-item catalog entry x observed line item index).
  const lineItemCatalogEntries = catalogEntries.filter((e) => e.isLineItemField);
  for (const idx of lineItemIndices) {
    for (const entry of lineItemCatalogEntries) {
      const fieldKey = `line_item.${idx}.${entry.fieldKey.replace(/^line_item\./, "")}`;
      const parsed = parsedByKey.get(fieldKey) ?? null;
      pushRow(fieldKey, entry.fieldKey, parsed, entry, idx);
    }
  }

  // Anything the agent produced that isn't in the catalog at all -- still
  // surfaced, not silently dropped. This now includes extra per-line-item
  // fields too (e.g. `line_item.2.model`), which the old markdown-era
  // mapper used to skip outright.
  const alreadyPushed = new Set(rows.map((r) => r.fieldKey));
  for (const parsed of parsedFields) {
    if (alreadyPushed.has(parsed.key)) continue;
    if (catalogByKey.has(parsed.catalogKey)) continue;
    pushRow(parsed.key, parsed.catalogKey, parsed, undefined, parsed.lineItemIndex ?? null);
    alreadyPushed.add(parsed.key);
  }

  return rows;
}

import type { FieldGroup, OcrDocument, OcrLeaf, OcrLeafField, OcrLineItemComponent, ParseResult, ParsedField } from "./types";

/**
 * Turns the OCR-mode JSON (see types.ts's OcrDocument, produced by
 * client.ts's extractInvoice()) into flat ParsedField[].
 *
 * THE ONE FUNCTION TO REWRITE if invoiceParsePrompt.ts's schema is ever
 * revised -- everything downstream (confidence.ts, mapper.ts) consumes
 * ParsedField[] and doesn't care how it was produced.
 *
 * Two passes:
 *  1. Canonical mapping -- the handful of fields that line up with the
 *     existing FieldCatalogEntry set (invoice_number, customer_name, etc.),
 *     kept under their original catalogKeys so seed.ts / the UI / the Excel
 *     export don't need to change.
 *  2. Generic catch-all -- walks the rest of the document for any other
 *     "leaf" field (matching OcrLeafField's shape) and surfaces it under a
 *     synthetic dot-path key, so nothing AgentStudio extracted is silently
 *     dropped just because it isn't in the catalog yet (e.g. line item
 *     `model`/`serial_numbers`, `payment_details.*`, extra parties beyond
 *     the first). These show up in the review UI as unselected/uncatalogued
 *     rows, same as the old markdown parser's "unmatched" fields did.
 *
 * Deliberately tolerant of a missing/reshaped section (a field just doesn't
 * get produced -- degrades to "not found" downstream, never throws) since
 * this is LLM JSON output guided by a prompt, not a schema AgentStudio
 * enforces server-side.
 *
 * KNOWN, CONFIRMED-REAL GAPS (not a bug in this parser -- the OCR schema
 * itself doesn't emit these): `due_date` and per-line-item `unit_price` have
 * no source in the current schema, so those two legacy catalog keys will
 * always come back unmatched (zero confidence, "not found") until/unless
 * invoiceParsePrompt.ts's schema is extended to include them.
 *
 * GROUPED LINE ITEMS: some documents' `line_items[]` are hierarchical -- one
 * "Item" row on the invoice bundles several distinct products, each with its
 * own description/model/serial numbers under `item.components[]`, while
 * `item.description` itself is only a short top-line summary. Pass 1 folds
 * each component's detail into the canonical `line_item.<idx>.description`
 * (see buildLineItemDescription) so the fixed 4-column line-item export
 * still shows the full picture instead of one vague summary line; Pass 2's
 * catch-all separately surfaces every component field individually (as
 * `line_item.<idx>.components.<n>.*`) for full audit-trail visibility in the
 * review UI, even though those synthetic keys aren't in the catalog.
 */
export function parseExtractionResult(doc: OcrDocument): ParseResult {
  const fields: ParsedField[] = [];
  const seenKeys = new Set<string>();

  const push = (field: ParsedField) => {
    fields.push(field);
    seenKeys.add(field.key);
  };

  // --- Pass 1: canonical mapping onto the existing FieldCatalogEntry keys ---

  pushIfPresent(push, "invoice_number", "invoice_number", "Invoice Number", "HEADER", doc.invoice?.invoice_number);
  pushIfPresent(push, "po_number", "po_number", "PO Number", "HEADER", doc.invoice?.purchase_order_number);
  pushIfPresent(push, "currency", "currency", "Currency", "HEADER", doc.document?.currency);
  pushIfPresent(push, "vendor_name", "vendor_name", "Vendor Name", "HEADER", doc.supplier?.name);
  pushIfPresent(push, "vendor_address", "vendor_address", "Vendor Address", "HEADER", doc.supplier?.address);

  // invoice_date is split across original (has page/bbox/raw_text) and
  // normalized_iso (has the clean ISO value + its own confidence) -- prefer
  // the normalized value, but carry source location from `original`.
  const dateOriginal = doc.invoice?.invoice_date?.original;
  const dateIso = doc.invoice?.invoice_date?.normalized_iso;
  if (dateIso?.value || dateOriginal?.value) {
    push({
      key: "invoice_date",
      catalogKey: "invoice_date",
      label: "Invoice Date",
      value: stringifyValue(dateIso?.value ?? dateOriginal?.value ?? null),
      sourceText: dateOriginal?.raw_text ?? stringifyValue(dateOriginal?.value ?? dateIso?.value ?? null),
      group: "HEADER",
      confidence: dateIso?.confidence ?? dateOriginal?.confidence ?? null,
      sourcePage: dateOriginal?.page ?? null,
      sourceBbox: dateOriginal?.bounding_box ?? null,
      uncertaintyReason: dateOriginal?.uncertainty_reason ?? null,
    });
  }

  // Customer = the first party AgentStudio normalized as bill_to/customer/owner,
  // falling back to the first party at all if none match (still better than nothing).
  const parties = doc.parties ?? [];
  const customerParty =
    parties.find((p) => ["bill_to", "customer", "owner"].includes(p.normalized_role?.value ?? "")) ?? parties[0];
  if (customerParty) {
    pushIfPresent(push, "customer_name", "customer_name", "Customer Name", "HEADER", customerParty.name);
    pushIfPresent(push, "customer_address", "customer_address", "Customer Address", "HEADER", customerParty.address);
  }
  // No discrete customer_email source in this schema (see file doc comment) --
  // deliberately not synthesized here; it surfaces as "not found" downstream.

  pushIfPresent(push, "subtotal", "subtotal", "Subtotal", "TOTALS", doc.totals?.subtotal);
  pushIfPresent(push, "tax_amount", "tax_amount", "Tax Amount", "TOTALS", doc.totals?.tax);
  pushIfPresent(push, "total_amount", "total_amount", "Total Amount", "TOTALS", doc.totals?.grand_total);

  const lineItems = doc.line_items ?? [];
  lineItems.forEach((item, idx) => {
    const description = buildLineItemDescription(item.description, item.components ?? []);
    pushLineItemIfPresent(push, idx, "description", "Description", description);
    pushLineItemIfPresent(push, idx, "quantity", "Quantity", item.parent_quantity);
    pushLineItemIfPresent(push, idx, "amount", "Amount", item.amount);
    // No discrete unit_price source in this schema (see file doc comment).
  });

  // --- Pass 2: generic catch-all over everything else, so nothing extracted is silently dropped ---

  const extraRoots: Array<{ node: unknown; pathPrefix: string; group: FieldGroup; lineItemIndex?: number }> = [
    { node: doc.supplier, pathPrefix: "supplier", group: "HEADER" },
    { node: doc.invoice, pathPrefix: "invoice", group: "HEADER" },
    { node: doc.totals, pathPrefix: "totals", group: "TOTALS" },
    { node: doc.payment_details, pathPrefix: "payment_details", group: "HEADER" },
    { node: doc.approval_information, pathPrefix: "approval_information", group: "HEADER" },
  ];
  parties.forEach((party, idx) => {
    extraRoots.push({ node: party, pathPrefix: `party.${idx}`, group: "HEADER" });
  });
  lineItems.forEach((item, idx) => {
    // model/unit/item_number are single-level fields; components/dimensions/
    // serial_numbers are nested arrays -- walkLeaves recurses into all of
    // them the same way, and the relative-path key below keeps each
    // component's fields distinct instead of colliding on a shared key.
    extraRoots.push({
      node: {
        model: item.model,
        unit: item.unit,
        item_number: item.item_number,
        components: item.components,
        dimensions: item.dimensions,
        serial_numbers: item.serial_numbers,
      },
      pathPrefix: `line_items.${idx}`,
      group: "LINE_ITEM",
      lineItemIndex: idx,
    });
  });

  for (const { node, pathPrefix, group, lineItemIndex } of extraRoots) {
    walkLeaves(node, pathPrefix, (path, leaf) => {
      if (seenKeys.has(path)) return; // already captured canonically above
      // Relative to this root's own prefix, e.g. "components.1.description"
      // for a line item, or just "registration_number" for doc.supplier.
      // Using the full relative path (not just the last segment) avoids
      // every component's same-named fields (e.g. two components each
      // having a "description") colliding under one synthetic key.
      const relativePath = path.slice(pathPrefix.length + 1);
      push({
        key: lineItemIndex !== undefined ? `line_item.${lineItemIndex}.${relativePath}` : path,
        catalogKey: lineItemIndex !== undefined ? `line_item.${relativePath}` : path,
        label: lineItemIndex !== undefined ? humanizePath(relativePath) : humanize(path.split(".").pop() ?? path),
        value: stringifyValue(leaf.value),
        sourceText: leaf.raw_text ?? stringifyValue(leaf.value),
        group,
        lineItemIndex,
        confidence: leaf.confidence ?? null,
        sourcePage: leaf.page ?? null,
        sourceBbox: leaf.bounding_box ?? null,
        uncertaintyReason: leaf.uncertainty_reason ?? null,
      });
    });
  }

  return { fields };
}

function pushIfPresent(
  push: (f: ParsedField) => void,
  key: string,
  catalogKey: string,
  label: string,
  group: FieldGroup,
  leaf: OcrLeaf,
) {
  if (!leaf || leaf.value === null || leaf.value === undefined) return;
  push({
    key,
    catalogKey,
    label,
    value: stringifyValue(leaf.value),
    sourceText: leaf.raw_text ?? stringifyValue(leaf.value),
    group,
    confidence: leaf.confidence ?? null,
    sourcePage: leaf.page ?? null,
    sourceBbox: leaf.bounding_box ?? null,
    uncertaintyReason: leaf.uncertainty_reason ?? null,
  });
}

function pushLineItemIfPresent(
  push: (f: ParsedField) => void,
  idx: number,
  subKey: string,
  label: string,
  leaf: OcrLeaf,
) {
  if (!leaf || leaf.value === null || leaf.value === undefined) return;
  push({
    key: `line_item.${idx}.${subKey}`,
    catalogKey: `line_item.${subKey}`,
    label,
    value: stringifyValue(leaf.value),
    sourceText: leaf.raw_text ?? stringifyValue(leaf.value),
    group: "LINE_ITEM",
    lineItemIndex: idx,
    confidence: leaf.confidence ?? null,
    sourcePage: leaf.page ?? null,
    sourceBbox: leaf.bounding_box ?? null,
    uncertaintyReason: leaf.uncertainty_reason ?? null,
  });
}

/**
 * Folds a grouped line item's `components[]` (each with its own
 * description/model/serial numbers) into one multi-line description, so a
 * bundled "Item" row still exports its full detail through the single fixed
 * `line_item.<idx>.description` column. Falls through unchanged when there
 * are no components (the common flat-line-item case).
 */
function buildLineItemDescription(itemDescription: OcrLeaf, components: OcrLineItemComponent[]): OcrLeaf {
  if (components.length === 0) return itemDescription;

  const lines = components.map((component, i) => {
    const desc = component.description?.value ?? `Component ${i + 1}`;
    const model = component.model?.value ? ` (Model: ${component.model.value})` : "";
    const serials = (component.serial_numbers ?? [])
      .map((s) => s?.value)
      .filter((v): v is string | number => v !== null && v !== undefined);
    const serialText = serials.length > 0 ? ` [Serial: ${serials.join(", ")}]` : "";
    return `- ${desc}${model}${serialText}`;
  });

  const headline = itemDescription?.value ? `${itemDescription.value}\n` : "";
  const combinedText = `${headline}${lines.join("\n")}`;

  // Keep the group-level description's own source location/confidence when
  // AgentStudio reported one; otherwise fall back to the first component
  // that has one, so a group with no top-line description still surfaces
  // with *some* source location rather than none.
  const fallback = components.find((c) => c.description)?.description ?? null;
  const base = itemDescription ?? fallback;

  return {
    value: combinedText,
    raw_text: combinedText,
    confidence: base?.confidence ?? null,
    page: base?.page ?? null,
    bounding_box: base?.bounding_box ?? null,
    uncertainty_reason: base?.uncertainty_reason ?? null,
  };
}

/** True if `node` matches OcrLeafField's shape closely enough to treat as a leaf (has a `value` key). */
function isLeafShape(node: unknown): node is OcrLeafField {
  return typeof node === "object" && node !== null && !Array.isArray(node) && "value" in node;
}

/** Recursively walks an object/array, calling `onLeaf(dotPath, leaf)` for every leaf-shaped node found. Skips null slots (== "not found") and non-leaf primitives. */
function walkLeaves(node: unknown, path: string, onLeaf: (path: string, leaf: OcrLeafField) => void) {
  if (node === null || node === undefined) return;
  if (isLeafShape(node)) {
    onLeaf(path, node);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, idx) => walkLeaves(item, `${path}.${idx}`, onLeaf));
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walkLeaves(v, `${path}.${k}`, onLeaf);
    }
  }
  // scalar primitives with no wrapping leaf shape (e.g. a bare number/string) -- nothing to attach confidence/bbox to, skip.
}

function stringifyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function humanize(slug: string): string {
  return slug
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Humanizes a dotted relative path like "components.1.serial_numbers.0"
 * into "Component 2 Serial Number 1" -- numeric segments (array indices)
 * are folded into the preceding word (singularized, 1-indexed) instead of
 * showing up as raw digits.
 */
function humanizePath(relativePath: string): string {
  const parts = relativePath.split(".");
  const words: string[] = [];
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const prev = words.pop();
      const num = Number(part) + 1;
      words.push(prev ? `${singularize(prev)} ${num}` : `Item ${num}`);
      continue;
    }
    words.push(humanize(part));
  }
  return words.join(" ");
}

function singularize(word: string): string {
  return word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

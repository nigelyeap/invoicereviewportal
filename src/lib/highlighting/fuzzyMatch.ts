import Fuse from "fuse.js";
import type { PageTextLine } from "./textLayerIndex";

export interface HighlightBox {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** fuse.js score: 0 = perfect match, 1 = no match at all. 0 for boxes derived directly from a real sourceBbox (see boxFromNormalizedBbox). */
  score: number;
}

/**
 * PIVOT (2026-08-09): AgentStudio's OCR-mode response now reports a real
 * per-field bounding box (see ExtractedField.sourceBbox / parser.ts), as
 * `[x_min, y_min, x_max, y_max]` normalized to a 0-1000 scale against the
 * full page image. This converts one directly into the same viewport-pixel
 * space textLayerIndex.ts's fuzzy-matched boxes live in (top-left origin,
 * y increasing downward -- matches both the page image's coordinate system
 * and the CSS absolute-position overlay in DocumentViewer.tsx), so the two
 * box sources are drop-in interchangeable for rendering.
 *
 * This is the authoritative/preferred path whenever a field has a real
 * bbox for the current page -- findBestTextMatch's fuzzy match is now only
 * a fallback for fields AgentStudio didn't report a bbox for.
 */
export function boxFromNormalizedBbox(
  bbox: readonly [number, number, number, number],
  pageNumber: number,
  pageWidthPx: number,
  pageHeightPx: number,
): HighlightBox {
  const [xMin, yMin, xMax, yMax] = bbox;
  return {
    pageNumber,
    x: (xMin / 1000) * pageWidthPx,
    y: (yMin / 1000) * pageHeightPx,
    width: ((xMax - xMin) / 1000) * pageWidthPx,
    height: ((yMax - yMin) / 1000) * pageHeightPx,
    score: 0,
  };
}

/** Above this, the match is considered too weak to show -- see plan section 5's
 *  "approximate location not available" fallback affordance. Enforced
 *  explicitly below (see findBestTextMatch), not just via fuse.js's own
 *  `threshold` option -- that option bounds candidate generation, not the
 *  final reported score, so it doesn't reliably cap results on its own. */
const MATCH_THRESHOLD = 0.45;

/**
 * fuse.js's own internal search `threshold` (looser than MATCH_THRESHOLD):
 * this only governs which candidates its bitap search is willing to
 * consider at all, so it's kept generous to avoid under-generating
 * candidates -- the real quality gate is MATCH_THRESHOLD, applied
 * explicitly to whatever score comes back.
 */
const FUSE_SEARCH_THRESHOLD = 0.6;

/**
 * FALLBACK PATH ONLY as of the OCR-mode pivot -- see boxFromNormalizedBbox
 * above, which is now used whenever a field has a real sourceBbox for the
 * current page. This function still matters for the fields OCR-mode didn't
 * report a bbox for (e.g. a field only caught by parser.ts's generic
 * catch-all, or one whose leaf genuinely omitted bounding_box).
 *
 * Historical note from the markdown-chat era this was originally written
 * against: `ExtractedField.sourceText` used to be the *raw* markdown bullet
 * line the field was parsed from (e.g. `"- **Invoice Number**: INV-..."`).
 * Real invoice documents obviously don't contain that markdown scaffolding,
 * so matching the raw line word-for-word against the page's plain text
 * layer systematically under-scored otherwise-correct matches (verified
 * empirically: the same "Company: Acme Trading Pte Ltd" bullet against a
 * page line reading just "Acme Trading Pte Ltd" scored ~0.55-0.6 raw --
 * worse than MATCH_THRESHOLD
 * -- purely from markdown/label noise, not any real content mismatch).
 * Strips list markers and bold markers only; deliberately does not attempt
 * heavier NLP cleanup.
 */
function stripMarkdownNoise(line: string): string {
  return line
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .trim();
}

/**
 * A markdown bullet is very often `Label: value` (`"Invoice Number: INV-..."`,
 * `"Address: 21 Marina Boulevard..."`). The label half rarely appears
 * verbatim in the source document (which has its own label wording, or
 * none at all), so it's pure noise for matching purposes. Returns the
 * substring after the first colon as a second, shorter candidate query --
 * often a much cleaner match against the actual document text.
 */
function valuePartAfterColon(line: string): string | null {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const value = line.slice(idx + 1).trim();
  return value.length >= 2 ? value : null;
}

/**
 * Fuzzy-matches an ExtractedField's sourceText against the page's text-line
 * index (see textLayerIndex.ts) and returns the best-matching line's box,
 * or null if nothing clears the similarity threshold. Tries both the full
 * (markdown-stripped) line and its value-after-colon half where present,
 * keeping whichever scores best -- see stripMarkdownNoise/valuePartAfterColon.
 */
export function findBestTextMatch(query: string | null | undefined, lines: PageTextLine[]): HighlightBox | null {
  const trimmed = query?.trim();
  if (!trimmed || trimmed.length < 2 || lines.length === 0) return null;

  const normalized = stripMarkdownNoise(trimmed);
  const candidateQueries = [normalized, valuePartAfterColon(normalized)].filter(
    (q): q is string => !!q && q.length >= 2,
  );
  if (candidateQueries.length === 0) return null;

  const fuse = new Fuse(lines, {
    keys: ["text"],
    includeScore: true,
    threshold: FUSE_SEARCH_THRESHOLD,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  let best: { item: PageTextLine; score: number } | null = null;
  for (const candidateQuery of candidateQueries) {
    const [result] = fuse.search(candidateQuery);
    if (!result) continue;
    const score = result.score ?? 1;
    if (best === null || score < best.score) {
      best = { item: result.item, score };
    }
  }

  if (!best || best.score > MATCH_THRESHOLD) return null;

  return {
    pageNumber: best.item.pageNumber,
    x: best.item.x,
    y: best.item.y,
    width: best.item.width,
    height: best.item.height,
    score: best.score,
  };
}

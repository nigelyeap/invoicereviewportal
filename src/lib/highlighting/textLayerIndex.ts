/**
 * Builds a per-page "text line" index from pdf.js text content, used to
 * fuzzy-match an ExtractedField's sourceText back into the original PDF
 * for highlighting (see plan section 5 -- there is no bbox from
 * AgentStudio, so this is our own independent text layer).
 *
 * Deliberately has ZERO runtime dependency on pdfjs-dist itself (only
 * structural types below) so it can be unit-tested in plain Node/vitest
 * without pulling in pdfjs-dist's browser-only globals (DOMMatrix etc,
 * which aren't available outside a real browser). The actual pdfjs-dist
 * TextItem/PageViewport objects satisfy these shapes at the call site
 * (see components/review/DocumentViewer.tsx).
 */

/** Subset of pdf.js's PageViewport that we actually need. */
export interface ViewportLike {
  /** The 6-number [a,b,c,d,e,f] PDF-space -> viewport-pixel-space transform. */
  transform: number[];
  /** Uniform scale factor the viewport was built with (assumes no page rotation). */
  scale: number;
}

/** Subset of pdf.js's TextItem that we actually need. */
export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface ItemBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageTextLine extends ItemBox {
  pageNumber: number;
  text: string;
}

/**
 * Composes two pdf.js-style 2D affine transforms ([a,b,c,d,e,f]), matching
 * pdf.js's own `Util.transform(m1, m2)` (m2 applied first, then m1). Kept
 * as a local, dependency-free reimplementation rather than importing
 * pdfjs-dist's Util for the reason in the file-level doc comment above.
 */
export function composeTransforms(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Converts one text item's PDF-space transform into viewport pixel space,
 * the same way pdf.js's own text-layer builder does. Assumes an unrotated
 * page (holds for the vast majority of real invoices) -- on a rotated page
 * the box will be a rough approximation rather than exact.
 */
export function computeItemBox(item: Pick<TextItemLike, "transform" | "width">, viewport: ViewportLike): ItemBox {
  const tx = composeTransforms(viewport.transform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const width = Math.abs(item.width * viewport.scale);
  return {
    x: tx[4],
    y: tx[5] - fontHeight,
    width,
    height: fontHeight,
  };
}

function unionBox(a: ItemBox, b: ItemBox): ItemBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Groups one page's text items into lines using pdf.js's own `hasEOL` flag
 * (far more reliable than re-deriving line breaks from y-coordinates), and
 * unions each line's item boxes into one bounding box per line. Only
 * matches at line granularity -- a sourceText that truly spans multiple
 * lines (e.g. a wrapped address) highlights just its best-matching line,
 * a deliberate v1 simplification.
 */
export function buildPageLines(pageNumber: number, items: TextItemLike[], viewport: ViewportLike): PageTextLine[] {
  const lines: PageTextLine[] = [];
  let text = "";
  let box: ItemBox | null = null;

  const flush = () => {
    if (text.trim() && box) {
      lines.push({ pageNumber, text: text.trim(), ...box });
    }
    text = "";
    box = null;
  };

  for (const item of items) {
    if (item.str) {
      const itemBox = computeItemBox(item, viewport);
      text += (text && !text.endsWith(" ") ? " " : "") + item.str;
      box = box ? unionBox(box, itemBox) : itemBox;
    }
    if (item.hasEOL) flush();
  }
  flush();

  return lines;
}

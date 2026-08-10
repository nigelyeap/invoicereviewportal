import { describe, expect, it } from "vitest";
import { boxFromNormalizedBbox, findBestTextMatch } from "../fuzzyMatch";
import type { PageTextLine } from "../textLayerIndex";

const LINES: PageTextLine[] = [
  { pageNumber: 1, text: "Invoice Number: INV-2026-0042", x: 50, y: 80, width: 200, height: 12 },
  { pageNumber: 1, text: "Invoice Date: 2026-07-15", x: 50, y: 100, width: 180, height: 12 },
  { pageNumber: 2, text: "Bill To: Acme Corp", x: 40, y: 60, width: 150, height: 12 },
];

describe("findBestTextMatch", () => {
  it("returns null for empty/null/whitespace/too-short queries", () => {
    expect(findBestTextMatch(null, LINES)).toBeNull();
    expect(findBestTextMatch(undefined, LINES)).toBeNull();
    expect(findBestTextMatch("  ", LINES)).toBeNull();
    expect(findBestTextMatch("a", LINES)).toBeNull();
  });

  it("returns null when there are no lines to search", () => {
    expect(findBestTextMatch("Invoice Number", [])).toBeNull();
  });

  it("finds the best matching line for an exact substring", () => {
    const result = findBestTextMatch("INV-2026-0042", LINES);
    expect(result).not.toBeNull();
    expect(result?.pageNumber).toBe(1);
    expect(result?.x).toBe(50);
    expect(result?.y).toBe(80);
    expect(result?.score).toBeLessThan(0.1);
  });

  it("tolerates minor differences (fuzzy, not exact match)", () => {
    const result = findBestTextMatch("Invoice Numbr INV-2026-0042", LINES);
    expect(result).not.toBeNull();
    expect(result?.pageNumber).toBe(1);
    expect(result?.y).toBe(80);
  });

  it("returns null when nothing clears the similarity threshold", () => {
    const result = findBestTextMatch("completely unrelated gibberish xyz123", LINES);
    expect(result).toBeNull();
  });

  it("picks the correct line across pages", () => {
    const result = findBestTextMatch("Acme Corp", LINES);
    expect(result?.pageNumber).toBe(2);
  });

  // Regression coverage for the markdown-noise fix: ExtractedField.sourceText
  // is the raw parser.ts bullet line (list marker + bold markers + a
  // "Label:" prefix the source document doesn't actually contain), which
  // previously scored too poorly to ever clear MATCH_THRESHOLD against
  // realistic short document lines -- see findBestTextMatch's doc comment.
  describe("markdown-noise sourceText (real ExtractedField shape)", () => {
    const DOC_LINES: PageTextLine[] = [
      { pageNumber: 1, text: "INV-2026-0042", x: 50, y: 80, width: 90, height: 12 },
      { pageNumber: 1, text: "Acme Trading Pte Ltd", x: 50, y: 100, width: 140, height: 12 },
      { pageNumber: 1, text: "21 Marina Boulevard, #05-01, Singapore 018989", x: 50, y: 120, width: 220, height: 12 },
    ];

    it("strips list/bold markers and matches a bare value line via the label prefix", () => {
      const result = findBestTextMatch("- **Invoice Number**: INV-2026-0042", DOC_LINES);
      expect(result?.y).toBe(80);
    });

    it("falls back to the value-after-colon half when the full line scores too poorly", () => {
      const result = findBestTextMatch("- Company: Acme Trading Pte Ltd", DOC_LINES);
      expect(result?.y).toBe(100);
    });

    it("matches a numbered line-item bullet's value half", () => {
      const result = findBestTextMatch(
        "- Address: 21 Marina Boulevard, #05-01, Singapore 018989",
        DOC_LINES,
      );
      expect(result?.y).toBe(120);
    });

    it("still rejects unrelated text even after stripping/splitting", () => {
      const result = findBestTextMatch("- Company: a completely unrelated gibberish sentence", DOC_LINES);
      expect(result).toBeNull();
    });
  });
});

describe("boxFromNormalizedBbox (real AgentStudio OCR-mode sourceBbox)", () => {
  it("converts a 0-1000-normalized bbox into viewport pixel space using the page's rendered dimensions", () => {
    // A box covering the left half of the top quarter of an 800x1000px rendered page.
    const box = boxFromNormalizedBbox([0, 0, 500, 250], 1, 800, 1000);
    expect(box).toEqual({ pageNumber: 1, x: 0, y: 0, width: 400, height: 250, score: 0 });
  });

  it("handles a bbox not anchored at the origin", () => {
    // Real captured fixture value: invoice_number's bbox on a page rendered at 1000x1294px-equivalent scale.
    const box = boxFromNormalizedBbox([229, 119, 342, 133], 1, 1000, 1000);
    expect(box.x).toBeCloseTo(229);
    expect(box.y).toBeCloseTo(119);
    expect(box.width).toBeCloseTo(113);
    expect(box.height).toBeCloseTo(14);
    expect(box.score).toBe(0);
  });

  it("carries through the given page number", () => {
    const box = boxFromNormalizedBbox([0, 0, 100, 100], 3, 500, 500);
    expect(box.pageNumber).toBe(3);
  });
});

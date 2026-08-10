import { describe, expect, it } from "vitest";
import { buildPageLines, composeTransforms, computeItemBox } from "../textLayerIndex";
import type { TextItemLike, ViewportLike } from "../textLayerIndex";

// Identity-ish viewport: pdf.js viewports for an unrotated, unscaled page at
// scale 1 look like [scale, 0, 0, -scale, offsetX, pageHeight] (y-flip).
const VIEWPORT: ViewportLike = { transform: [1, 0, 0, -1, 0, 792], scale: 1 };

function item(str: string, x: number, y: number, width: number, hasEOL = false): TextItemLike {
  return {
    str,
    // pdf.js text item transforms are [fontSize, 0, 0, fontSize, x, y] for
    // unrotated glyphs, with y as the text baseline in PDF space.
    transform: [10, 0, 0, 10, x, y],
    width,
    height: 10,
    hasEOL,
  };
}

describe("composeTransforms", () => {
  it("is associative-consistent with manual 2x2 + translation composition", () => {
    const m1 = [2, 0, 0, 2, 5, 5];
    const m2 = [1, 0, 0, 1, 1, 1];
    // m1 applied to m2: scale m2's linear part by m1, then translate by m1's translation
    // combined with m1's linear part applied to m2's translation.
    expect(composeTransforms(m1, m2)).toEqual([2, 0, 0, 2, 2 * 1 + 5, 2 * 1 + 5]);
  });

  it("composing with the identity matrix returns the other matrix unchanged", () => {
    const identity = [1, 0, 0, 1, 0, 0];
    const m = [3, 0, 0, 4, 7, 9];
    expect(composeTransforms(identity, m)).toEqual(m);
  });
});

describe("computeItemBox", () => {
  it("flips y into viewport space and derives font height from the composed transform", () => {
    const box = computeItemBox(item("Invoice", 50, 700, 40), VIEWPORT);
    // viewport transform [1,0,0,-1,0,792] composed with item transform [10,0,0,10,50,700]:
    // tx = [10, 0, 0, -10, 50, 792-700] = [10,0,0,-10,50,92]
    expect(box.x).toBeCloseTo(50);
    expect(box.y).toBeCloseTo(92 - 10); // tx[5] - fontHeight
    expect(box.height).toBeCloseTo(10);
    expect(box.width).toBeCloseTo(40);
  });
});

describe("buildPageLines", () => {
  it("groups items into one line per hasEOL boundary and unions their boxes", () => {
    const items: TextItemLike[] = [
      item("Invoice", 50, 700, 40),
      item("Number:", 95, 700, 45, true),
      item("INV-2026-0042", 50, 680, 90, true),
    ];

    const lines = buildPageLines(1, items, VIEWPORT);

    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Invoice Number:");
    expect(lines[0].pageNumber).toBe(1);
    // union of x in [50,95] widths [40,45] -> right edge = max(50+40, 95+45) = 140
    expect(lines[0].x).toBeCloseTo(50);
    expect(lines[0].width).toBeCloseTo(90);

    expect(lines[1].text).toBe("INV-2026-0042");
  });

  it("flushes a trailing line even without a final hasEOL", () => {
    const items: TextItemLike[] = [item("Total", 10, 10, 20)];
    const lines = buildPageLines(2, items, VIEWPORT);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Total");
  });

  it("skips empty/whitespace-only items and drops blank flushed lines", () => {
    const items: TextItemLike[] = [item("", 0, 0, 0, true), item("   ", 0, 0, 0, true)];
    const lines = buildPageLines(1, items, VIEWPORT);
    expect(lines).toHaveLength(0);
  });
});

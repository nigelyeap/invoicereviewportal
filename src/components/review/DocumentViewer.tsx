"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { DocumentProps, TextItem, TextMarkedContent } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";
import { buildPageLines } from "@/lib/highlighting/textLayerIndex";
import type { PageTextLine, TextItemLike, ViewportLike } from "@/lib/highlighting/textLayerIndex";
import { boxFromNormalizedBbox, findBestTextMatch } from "@/lib/highlighting/fuzzyMatch";

/**
 * Loaded once per client bundle. Served locally (not CDN) -- copied from
 * react-pdf's *own bundled* pdfjs-dist build output into public/, NOT the
 * top-level pdfjs-dist dependency: react-pdf pins its own nested pdfjs-dist
 * version (5.x at the time of writing) which can differ from the top-level
 * one (6.x) declared in package.json, and pdf.js hard-fails on a
 * main-thread/worker API version mismatch. If `npm install` ever bumps
 * react-pdf, re-copy from
 * node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs
 * (or wherever it resolves after dedup) rather than from the top-level
 * pdfjs-dist package.
 */
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Fixed render scale so the same-scale text-line index (built from the same
 *  loaded pdf proxy) lines up pixel-for-pixel with the rendered <Page>. */
const RENDER_SCALE = 1.5;

export interface HighlightTarget {
  sourceText: string | null;
  sourcePageNumber: number | null;
  /** Real pixel-normalized [x_min,y_min,x_max,y_max] (0-1000 scale) from AgentStudio's OCR-mode response, when reported for this field -- see boxFromNormalizedBbox. Preferred over fuzzy-matching sourceText when present. */
  sourceBbox: [number, number, number, number] | null;
}

interface PageGeometry {
  viewport: ViewportLike;
  items: TextItemLike[];
  width: number;
  height: number;
}

function toTextItemLikes(items: (TextItem | TextMarkedContent)[]): TextItemLike[] {
  return items.filter((item): item is TextItem => "str" in item);
}

/**
 * Derived (not imported directly) from react-pdf's own callback prop type --
 * react-pdf bundles its own private copy of pdfjs-dist, structurally
 * incompatible with the top-level pdfjs-dist dependency's types even though
 * both are nominally "pdfjs-dist", so importing PDFDocumentProxy directly
 * doesn't type-check against onLoadSuccess's actual parameter.
 */
type LoadedPdf = Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0];

/**
 * Split view's left pane. PDFs get highlighting via pdf.js's text layer
 * (fuzzy-match fallback) plus real sourceBbox when AgentStudio reports one.
 * Images get sourceBbox-only highlighting -- AgentStudio's OCR mode reports
 * real bounding boxes for image invoices too (not just PDFs), so as of the
 * OCR-mode pivot there's no reason to render them plainly. There's just no
 * text-layer fuzzy-match fallback for images (no pdf.js text layer exists
 * for a raster image), so a field without a bbox simply shows the "not
 * available" notice instead of a fuzzy-matched guess.
 */
export function DocumentViewer({
  documentId,
  mimeType,
  highlight,
}: {
  documentId: string;
  mimeType: string;
  highlight: HighlightTarget | null;
}) {
  const fileUrl = `/api/documents/${documentId}/file`;

  if (mimeType.startsWith("image/")) {
    return <ImageViewer fileUrl={fileUrl} highlight={highlight} />;
  }

  return <PdfViewer fileUrl={fileUrl} highlight={highlight} />;
}

function ImageViewer({ fileUrl, highlight }: { fileUrl: string; highlight: HighlightTarget | null }) {
  const imgRef = useRef<HTMLImageElement>(null);
  // Rendered (CSS pixel, post max-w-full scaledown) size of the <img> --
  // sourceBbox's 0-1000 normalization is against the full page image, but
  // the overlay div needs to be positioned in the same coordinate space the
  // browser actually laid the image out in, not its natural pixel size.
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const measure = () => setImgSize({ width: el.clientWidth, height: el.clientHeight });
    if (el.complete) measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Images only ever have one "page" -- pageNumber 1 -- for the purposes of
  // AgentStudio's OCR-mode bbox reporting.
  const highlightBox = useMemo(() => {
    if (!highlight?.sourceBbox || !imgSize) return null;
    return boxFromNormalizedBbox(highlight.sourceBbox, 1, imgSize.width, imgSize.height);
  }, [highlight, imgSize]);

  // No fuzzy-match fallback exists for images (see file-level doc comment),
  // so "has source text but no bbox" is the only not-available case here.
  const showNoMatchNotice = !!highlight?.sourceText?.trim() && !highlight?.sourceBbox && !!imgSize;

  return (
    <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-auto rounded-lg border bg-muted/30 p-4">
      {showNoMatchNotice && (
        <p className="rounded-md border border-dashed border-muted-foreground/40 bg-background px-3 py-2 text-sm text-muted-foreground">
          Approximate location not available for this field -- AgentStudio didn&apos;t report a bounding box for it.
        </p>
      )}
      <div className="relative mx-auto inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={fileUrl}
          alt="Uploaded document"
          className="h-fit max-w-full"
          onLoad={() => {
            const el = imgRef.current;
            if (el) setImgSize({ width: el.clientWidth, height: el.clientHeight });
          }}
        />
        {highlightBox && (
          <div
            className="pointer-events-none absolute rounded-sm bg-yellow-300/50 ring-2 ring-yellow-500"
            style={{
              left: highlightBox.x,
              top: highlightBox.y,
              width: highlightBox.width,
              height: highlightBox.height,
            }}
          />
        )}
      </div>
    </div>
  );
}

function PdfViewer({ fileUrl, highlight }: { fileUrl: string; highlight: HighlightTarget | null }) {
  const [numPages, setNumPages] = useState(0);
  const [pageGeometry, setPageGeometry] = useState<Record<number, PageGeometry>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const onDocumentLoadSuccess = useCallback((pdf: LoadedPdf) => {
    setNumPages(pdf.numPages);
  }, []);

  const setPageViewport = useCallback((pageNumber: number, viewport: ViewportLike, width: number, height: number) => {
    setPageGeometry((prev) => ({
      ...prev,
      [pageNumber]: { viewport, width, height, items: prev[pageNumber]?.items ?? [] },
    }));
  }, []);

  const setPageItems = useCallback((pageNumber: number, items: TextItemLike[]) => {
    setPageGeometry((prev) => {
      const existing = prev[pageNumber];
      if (!existing) return prev;
      return { ...prev, [pageNumber]: { ...existing, items } };
    });
  }, []);

  // Rebuilt only when page geometry changes, not on every highlight change --
  // the text-line index is independent of which field (if any) is selected.
  const linesByPage = useMemo(() => {
    const result: Record<number, PageTextLine[]> = {};
    for (const [pageNumberStr, geometry] of Object.entries(pageGeometry)) {
      if (geometry.items.length === 0) continue;
      result[Number(pageNumberStr)] = buildPageLines(Number(pageNumberStr), geometry.items, geometry.viewport);
    }
    return result;
  }, [pageGeometry]);

  // Prefer a real sourceBbox (AgentStudio OCR-mode) when present -- it only
  // needs the target page's rendered pixel dimensions (available as soon as
  // that <Page>'s onLoadSuccess fires), not the async text-line index, and
  // it's authoritative rather than a similarity guess. Falls back to
  // fuzzy-matching sourceText against the text layer for fields without one.
  const highlightBox = useMemo(() => {
    const bbox = highlight?.sourceBbox;
    const bboxPage = highlight?.sourcePageNumber;
    if (bbox && bboxPage) {
      const geometry = pageGeometry[bboxPage];
      if (geometry) {
        return boxFromNormalizedBbox(bbox, bboxPage, geometry.width, geometry.height);
      }
      return null; // page geometry not loaded yet -- searchReady below gates the "not available" notice
    }

    const trimmed = highlight?.sourceText?.trim();
    if (!trimmed) return null;
    const candidateLines = highlight?.sourcePageNumber
      ? (linesByPage[highlight.sourcePageNumber] ?? [])
      : Object.values(linesByPage).flat();
    return findBestTextMatch(trimmed, candidateLines);
  }, [highlight, linesByPage, pageGeometry]);

  // Whether we have enough data loaded yet to say a highlight target
  // definitively has no match, vs. still waiting on async page data:
  //  - bbox path only needs the target page's geometry (sync with render).
  //  - fuzzy-match path needs the text-line index (async, onGetTextSuccess).
  // Avoids a false-negative "not available" flash while pages are still loading.
  const searchReady = useMemo(() => {
    if (numPages === 0) return false;
    if (highlight?.sourceBbox && highlight?.sourcePageNumber) {
      return !!pageGeometry[highlight.sourcePageNumber];
    }
    if (highlight?.sourcePageNumber) return !!linesByPage[highlight.sourcePageNumber];
    return Object.keys(linesByPage).length >= numPages;
  }, [highlight, linesByPage, pageGeometry, numPages]);

  // See plan section 5: if nothing clears the fuzzy-match similarity
  // threshold, show an explicit affordance rather than silently showing no
  // highlight at all (which reads as "did my click even register?").
  const showNoMatchNotice = !!highlight?.sourceText?.trim() && searchReady && !highlightBox;

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  return (
    <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-4 overflow-auto rounded-lg border bg-muted/30 p-4">
      {showNoMatchNotice && (
        <p className="rounded-md border border-dashed border-muted-foreground/40 bg-background px-3 py-2 text-sm text-muted-foreground">
          Approximate location not available for this field -- its source text couldn&apos;t be confidently matched
          in the document.
        </p>
      )}
      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={(err) => setLoadError(err.message)}
        loading={
          <div className="flex items-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading document...
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => {
          const geometry = pageGeometry[pageNumber];
          return (
            <div
              key={pageNumber}
              className="relative mx-auto shadow-sm"
              style={geometry ? { width: geometry.width, height: geometry.height } : undefined}
            >
              <Page
                pageNumber={pageNumber}
                scale={RENDER_SCALE}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                  const viewport = page.getViewport({ scale: RENDER_SCALE });
                  setPageViewport(
                    pageNumber,
                    { transform: viewport.transform, scale: viewport.scale },
                    viewport.width,
                    viewport.height,
                  );
                }}
                onGetTextSuccess={(textContent) => setPageItems(pageNumber, toTextItemLikes(textContent.items))}
              />
              {highlightBox && highlightBox.pageNumber === pageNumber && (
                <div
                  className="pointer-events-none absolute rounded-sm bg-yellow-300/50 ring-2 ring-yellow-500"
                  style={{
                    left: highlightBox.x,
                    top: highlightBox.y,
                    width: highlightBox.width,
                    height: highlightBox.height,
                  }}
                />
              )}
            </div>
          );
        })}
      </Document>
    </div>
  );
}

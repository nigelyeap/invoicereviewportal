import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Renders AgentStudioValidationResult.reportMarkdown (the "Table 1-5" Asset
 * Finance Invoice Review Report -- see invoiceValidatePrompt.ts) to sanitized
 * HTML for display in ValidationSummary.tsx's full-report dialog. The report
 * is plain agent-authored Markdown (headings, a GFM pipe table per section,
 * bold, the 🟢/🟡/🔴 status emoji as literal text) -- `marked` handles GFM
 * tables out of the box, and sanitize-html strips anything beyond that
 * baseline (script tags, event handler attributes, etc) since this text
 * ultimately comes from an LLM response, not a trusted source.
 *
 * Uses `sanitize-html` rather than DOMPurify: DOMPurify's jsdom dependency
 * (via isomorphic-dompurify) fails to load in Vercel's serverless bundle
 * (ERR_REQUIRE_ESM on a jsdom transitive dep) even though it works fine in
 * local `next dev`. sanitize-html has no DOM/jsdom dependency.
 */
export function renderValidationReportHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false, gfm: true });
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "p", "strong", "em", "ul", "ol", "li", "br", "hr",
      "table", "thead", "tbody", "tr", "th", "td", "a", "code", "pre",
    ],
    allowedAttributes: {
      th: ["align"],
      td: ["align"],
      a: ["href"],
    },
  });
}

import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Renders AgentStudioValidationResult.reportMarkdown (the "Table 1-5" Asset
 * Finance Invoice Review Report -- see invoiceValidatePrompt.ts) to sanitized
 * HTML for display in ValidationSummary.tsx's full-report dialog. The report
 * is plain agent-authored Markdown (headings, a GFM pipe table per section,
 * bold, the 🟢/🟡/🔴 status emoji as literal text) -- `marked` handles GFM
 * tables out of the box, and DOMPurify strips anything beyond that baseline
 * (script tags, event handler attributes, etc) since this text ultimately
 * comes from an LLM response, not a trusted source.
 */
export function renderValidationReportHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false, gfm: true });
  return DOMPurify.sanitize(rawHtml);
}

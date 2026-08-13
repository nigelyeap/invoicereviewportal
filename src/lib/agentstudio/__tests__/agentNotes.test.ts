import { describe, expect, it } from "vitest";
import { extractAgentNotes } from "../agentNotes";
import { SAMPLE_OCR_RESULT } from "../__fixtures__/sampleOcrResult";
import type { OcrDocument } from "../types";

describe("extractAgentNotes", () => {
  it("degrades gracefully on null/undefined input", () => {
    expect(extractAgentNotes(null)).toEqual({
      qualityFlags: [],
      criticalLowConfidenceFields: [],
      stampsAndHandwriting: [],
      rawTextByPage: [],
      hasFlaggedNotes: false,
    });
    expect(extractAgentNotes(undefined)).toEqual({
      qualityFlags: [],
      criticalLowConfidenceFields: [],
      stampsAndHandwriting: [],
      rawTextByPage: [],
      hasFlaggedNotes: false,
    });
  });

  it("finds no flagged notes on the clean fixture, but does surface its raw OCR text", () => {
    const notes = extractAgentNotes(SAMPLE_OCR_RESULT);
    expect(notes.hasFlaggedNotes).toBe(false);
    expect(notes.qualityFlags).toEqual([]);
    expect(notes.criticalLowConfidenceFields).toEqual([]);
    expect(notes.rawTextByPage).toHaveLength(1);
    expect(notes.rawTextByPage[0].rawText).toContain("Invoice Number: INV-2026-0042");
  });

  it("extracts quality flags, low-confidence field reasons, and stamps/handwriting -- real shape captured live 2026-08-09", () => {
    const doc: OcrDocument = {
      ...SAMPLE_OCR_RESULT,
      quality_flags: [
        { page: 1, issue: "stamp_overlap", severity: "low", description: "Company stamp slightly overlaps amount for line item 3." },
        { page: 2, issue: "handwriting", severity: "medium", description: "Page contains a handwritten approval block." },
      ],
      critical_low_confidence_fields: [
        {
          field_path: "approval_information.bank_and_cheque_number",
          value: "PBB AMBSC",
          confidence: 0.65,
          reason: "Value is handwritten and part of the text is ambiguous.",
        },
      ],
      stamps_and_handwriting: [
        { type: "company_stamp", page: 1, overlaps_printed_text: true, affected_fields: ["line_item.2.amount"], confidence: 0.8 },
      ],
    };

    const notes = extractAgentNotes(doc);
    expect(notes.hasFlaggedNotes).toBe(true);
    expect(notes.qualityFlags).toHaveLength(2);
    expect(notes.qualityFlags[0]).toEqual({
      page: 1,
      issue: "stamp_overlap",
      severity: "low",
      description: "Company stamp slightly overlaps amount for line item 3.",
    });
    expect(notes.criticalLowConfidenceFields).toEqual([
      {
        fieldPath: "approval_information.bank_and_cheque_number",
        value: "PBB AMBSC",
        confidence: 0.65,
        reason: "Value is handwritten and part of the text is ambiguous.",
      },
    ]);
    expect(notes.stampsAndHandwriting).toEqual([
      { type: "company_stamp", page: 1, overlapsPrintedText: true, affectedFields: ["line_item.2.amount"], confidence: 0.8 },
    ]);
  });

  it("filters out empty/malformed entries rather than crashing on them", () => {
    const doc: OcrDocument = {
      ...SAMPLE_OCR_RESULT,
      // @ts-expect-error -- deliberately malformed, mirroring degrade-gracefully posture for LLM-shaped output
      quality_flags: [{ page: 1 }, null, { issue: "blur", severity: "low", description: "Slightly blurry." }],
      raw_text_by_page: [
        { page: 2, raw_text: "  ", page_ocr_confidence: 0.5 }, // blank -- should be dropped
        { page: 1, raw_text: "Real text", page_ocr_confidence: 0.9 },
      ],
    };

    const notes = extractAgentNotes(doc);
    expect(notes.qualityFlags).toHaveLength(1);
    expect(notes.qualityFlags[0].issue).toBe("blur");
    expect(notes.rawTextByPage).toEqual([{ page: 1, rawText: "Real text", confidence: 0.9 }]);
  });
});

import { CV_MIN_TEXT_LENGTH_FOR_PARSING } from "@lamarkerja/shared";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export { CV_MIN_TEXT_LENGTH_FOR_PARSING };

/**
 * Membersihkan dan menormalkan teks hasil ekstraksi dokumen:
 * - Menghilangkan null byte (\u0000) dan karakter kontrol yang merusak PostgreSQL/JSON.
 * - Menormalkan carriage return (\r\n / \r -> \n).
 * - Menghilangkan spasi horizontal berlebih dan baris kosong beruntun.
 */
export function normalizeExtractedText(raw: string): string {
  if (!raw) return "";

  const cleanChars = raw
    .replace(/\u0000/g, "")
    // Hapus karakter kontrol ASCII non-cetak kecuali tab (0x09) dan newline (0x0A)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\r\n|\r/g, "\n");

  const lines = cleanChars.split("\n");
  const normalizedLines: string[] = [];
  let consecutiveEmptyLines = 0;

  for (const line of lines) {
    const trimmed = line.replace(/[ \t]+/g, " ").trim();
    if (trimmed.length === 0) {
      consecutiveEmptyLines++;
      if (consecutiveEmptyLines <= 1) {
        normalizedLines.push("");
      }
    } else {
      consecutiveEmptyLines = 0;
      normalizedLines.push(trimmed);
    }
  }

  return normalizedLines.join("\n").trim();
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings: string[] = [];

    for (const item of content.items) {
      if ("str" in item && typeof item.str === "string") {
        strings.push(item.str);
      }
    }

    pageTexts.push(strings.join(" "));
  }

  return pageTexts.join("\n\n");
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export type CvExtractionResult = {
  rawLength: number;
  normalizedText: string;
  isScanOrEmpty: boolean;
  status: "extracted" | "skipped";
};

export async function extractCvText(
  buffer: Buffer,
  extension: "pdf" | "docx",
): Promise<CvExtractionResult> {
  let rawText = "";

  if (extension === "pdf") {
    rawText = await extractTextFromPdf(buffer);
  } else {
    rawText = await extractTextFromDocx(buffer);
  }

  const normalizedText = normalizeExtractedText(rawText);
  const isScanOrEmpty = normalizedText.length < CV_MIN_TEXT_LENGTH_FOR_PARSING;

  return {
    rawLength: rawText.length,
    normalizedText,
    isScanOrEmpty,
    status: isScanOrEmpty ? "skipped" : "extracted",
  };
}

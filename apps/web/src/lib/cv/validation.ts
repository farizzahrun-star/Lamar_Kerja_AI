import {
  CV_ALLOWED_MIME_TYPES,
  CV_MAX_SIZE_BYTES,
  type CvMimeType,
} from "@lamarkerja/shared";
import { createHash } from "node:crypto";
import path from "node:path";

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"

export type DetectedCvType = {
  mime: CvMimeType;
  extension: "pdf" | "docx";
};

/**
 * Memeriksa magic bytes awal dan struktur dasar untuk memastikan berkas benar-benar
 * PDF atau DOCX (OpenXML ZIP), bukan sekadar ekstensi atau MIME yang dipalsukan.
 */
export function detectCvBufferType(buffer: Buffer): DetectedCvType | null {
  if (buffer.length < 5) return null;

  if (buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return { mime: "application/pdf", extension: "pdf" };
  }

  if (buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    // DOCX adalah arsip ZIP yang memuat entri XML WordprocessingML
    const raw = buffer.toString("latin1");
    if (raw.includes("word/") || raw.includes("[Content_Types].xml")) {
      return {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: "docx",
      };
    }
  }

  return null;
}

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sanitizeFilename(filename: string | null | undefined): string {
  if (!filename) return "cv-dokumen";
  const base = path.basename(filename).trim();
  // Hilangkan karakter kontrol dan batasi panjang
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").slice(0, 180);
  return cleaned || "cv-dokumen";
}

export type CvBufferValidationResult =
  | {
      ok: true;
      mime: CvMimeType;
      extension: "pdf" | "docx";
      sizeBytes: number;
      sha256: string;
      filename: string;
    }
  | {
      ok: false;
      code: "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE";
      message: string;
    };

export function validateCvBuffer(
  buffer: Buffer,
  declaredFilename?: string | null,
): CvBufferValidationResult {
  if (buffer.length === 0) {
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: "Berkas CV kosong.",
    };
  }

  if (buffer.length > CV_MAX_SIZE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Ukuran berkas melebihi batas maksimal ${CV_MAX_SIZE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const detected = detectCvBufferType(buffer);
  if (!detected || !CV_ALLOWED_MIME_TYPES.includes(detected.mime)) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "Format berkas tidak didukung. Harap unggah dokumen PDF atau DOCX yang valid.",
    };
  }

  return {
    ok: true,
    mime: detected.mime,
    extension: detected.extension,
    sizeBytes: buffer.length,
    sha256: computeSha256(buffer),
    filename: sanitizeFilename(declaredFilename),
  };
}

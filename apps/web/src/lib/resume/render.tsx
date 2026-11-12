import { renderToBuffer } from "@react-pdf/renderer";
import type { ResumeTemplate } from "@lamarkerja/shared";
import { inflateSync } from "node:zlib";
import React from "react";

import type { ProfileBundle, ResumeSnapshot } from "@/lib/profile-types";

import { ResumeDocument } from "./templates";

export function buildResumeSnapshot(
  bundle: ProfileBundle,
  email: string | null,
  generatedAt: string = new Date().toISOString(),
): ResumeSnapshot {
  return {
    generatedAt,
    email,
    profile: bundle.profile,
    educations: bundle.educations,
    experiences: bundle.experiences,
    skills: bundle.skills,
    certifications: bundle.certifications,
    languages: bundle.languages,
  };
}

export async function renderResumePdf(
  snapshot: ResumeSnapshot,
  template: ResumeTemplate,
): Promise<Buffer> {
  return renderToBuffer(<ResumeDocument snapshot={snapshot} template={template} />);
}

function decodeHexToken(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const bytes = Buffer.from(clean, "hex");
  return bytes.toString("latin1");
}

function decodeLiteralToken(literal: string): string {
  return literal
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

/**
 * Mengekstrak teks terbaca dari buffer PDF yang dihasilkan `@react-pdf/renderer`
 * (PDFKit + standard font). Dipakai untuk memverifikasi bahwa konten profil
 * benar-benar masuk ke halaman PDF hasil render.
 */
export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string {
  const raw = pdfBuffer.toString("latin1");
  const chunks: string[] = [];

  // Sertakan metadata tidak terkompresi (mis. /Title (...))
  for (const match of raw.matchAll(/\/(?:Title|Author|Subject)\s*\(([^)]*)\)/g)) {
    if (match[1]) chunks.push(decodeLiteralToken(match[1]));
  }

  let cursor = 0;
  while (cursor < raw.length) {
    const streamIndex = raw.indexOf("stream", cursor);
    if (streamIndex === -1) break;
    const endIndex = raw.indexOf("endstream", streamIndex);
    if (endIndex === -1) break;

    let dataStart = streamIndex + "stream".length;
    if (raw[dataStart] === "\r" && raw[dataStart + 1] === "\n") {
      dataStart += 2;
    } else if (raw[dataStart] === "\n" || raw[dataStart] === "\r") {
      dataStart += 1;
    }

    let dataEnd = endIndex;
    if (raw[dataEnd - 2] === "\r" && raw[dataEnd - 1] === "\n") {
      dataEnd -= 2;
    } else if (raw[dataEnd - 1] === "\n" || raw[dataEnd - 1] === "\r") {
      dataEnd -= 1;
    }

    const slice = pdfBuffer.subarray(dataStart, dataEnd);
    try {
      const inflated = inflateSync(slice).toString("latin1");
      const lineParts: string[] = [];

      for (const token of inflated.matchAll(/<([0-9A-Fa-f]+)>|\((?:\\.|[^\\)])*\)/g)) {
        if (token[1]) {
          lineParts.push(decodeHexToken(token[1]));
        } else {
          lineParts.push(decodeLiteralToken(token[0].slice(1, -1)));
        }
      }

      if (lineParts.length > 0) {
        chunks.push(lineParts.join(""));
      }
    } catch {
      // Bukan stream FlateDecode murni, lewati.
    }

    cursor = endIndex + "endstream".length;
  }

  return chunks.join("\n");
}

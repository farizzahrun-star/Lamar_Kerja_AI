import { describe, expect, it } from "vitest";

import { buildResumeSnapshot, renderResumePdf } from "@/lib/resume/render";

import {
  CV_MIN_TEXT_LENGTH_FOR_PARSING,
  extractCvText,
  normalizeExtractedText,
} from "./extraction";

describe("normalizeExtractedText", () => {
  it("membersihkan null bytes dan merapikan spasi serta baris kosong berulang", () => {
    const dirty = "Halo\u0000 Dunia\r\n\r\n\r\nPengalaman  kerja    banyak.\x07\n\nSelesai.";
    const clean = normalizeExtractedText(dirty);

    expect(clean).not.toContain("\u0000");
    expect(clean).not.toContain("\x07");
    expect(clean).not.toContain("\r");
    expect(clean).toContain("Halo Dunia\n\nPengalaman kerja banyak.\n\nSelesai.");
  });
});

describe("extractCvText", () => {
  it("mengekstrak teks dari PDF dan menandai extracted bila teks >= 50 karakter", async () => {
    const snapshot = buildResumeSnapshot(
      {
        profile: {
          user_id: "00000000-0000-0000-0000-000000000001",
          full_name: "Ahmad Fauzi",
          headline: "Software Engineer berpengalaman dalam Node.js dan TypeScript",
          summary: "Fokus pada arsitektur sistem backend terdistribusi dan basis data relasional.",
          phone: "081234567890",
          address: "Jakarta, Indonesia",
          birth_date: null,
          linkedin_url: null,
          portfolio_url: null,
          expected_salary: null,
          availability: null,
          onboarding_step: "identity",
          onboarding_completed_at: null,
          created_at: "2026-11-12T00:00:00.000Z",
          updated_at: "2026-11-12T00:00:00.000Z",
        },
        educations: [],
        experiences: [],
        skills: [],
        certifications: [],
        languages: [],
      },
      "ahmad@example.com",
    );

    const pdfBuffer = await renderResumePdf(snapshot, "A");
    const result = await extractCvText(pdfBuffer, "pdf");

    expect(result.status).toBe("extracted");
    expect(result.isScanOrEmpty).toBe(false);
    expect(result.normalizedText.length).toBeGreaterThanOrEqual(CV_MIN_TEXT_LENGTH_FOR_PARSING);
    expect(result.normalizedText).toContain("Ahmad Fauzi");
    expect(result.normalizedText).toContain("Software Engineer");
  });

  it("menandai skipped (deteksi scan/teks kosong) bila teks < 50 karakter", async () => {
    const emptySnapshot = buildResumeSnapshot(
      {
        profile: {
          user_id: "00000000-0000-0000-0000-000000000001",
          full_name: "X",
          headline: null,
          summary: null,
          phone: null,
          address: null,
          birth_date: null,
          linkedin_url: null,
          portfolio_url: null,
          expected_salary: null,
          availability: null,
          onboarding_step: "identity",
          onboarding_completed_at: null,
          created_at: "2026-11-12T00:00:00.000Z",
          updated_at: "2026-11-12T00:00:00.000Z",
        },
        educations: [],
        experiences: [],
        skills: [],
        certifications: [],
        languages: [],
      },
      null,
    );

    const pdfBuffer = await renderResumePdf(emptySnapshot, "A");
    const result = await extractCvText(pdfBuffer, "pdf");

    // PDF dari profil kosong hanya memuat "X" dan pesan singkat default
    expect(result.normalizedText.length).toBeLessThan(CV_MIN_TEXT_LENGTH_FOR_PARSING);
    expect(result.status).toBe("skipped");
    expect(result.isScanOrEmpty).toBe(true);
  });
});

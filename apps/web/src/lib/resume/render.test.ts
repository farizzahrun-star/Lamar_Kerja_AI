import { describe, expect, it } from "vitest";

import type { ProfileBundle } from "@/lib/profile-types";

import { buildResumeSnapshot, extractTextFromPdfBuffer, renderResumePdf } from "./render";

function makeEmptyBundle(): ProfileBundle {
  return {
    profile: {
      user_id: "00000000-0000-0000-0000-000000000001",
      full_name: null,
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
  };
}

function makeFullBundle(): ProfileBundle {
  const base = makeEmptyBundle();
  return {
    profile: {
      ...base.profile,
      full_name: "Rina Pratama",
      headline: "Full Stack Engineer",
      summary: "Membangun layanan web reliabel dengan TypeScript dan Postgres.",
      phone: "081298765432",
      address: "Bandung, Jawa Barat",
      linkedin_url: "https://linkedin.com/in/rina-pratama",
      portfolio_url: "https://rina.example.com",
      availability: "Siap dalam 2 minggu",
    },
    educations: [
      {
        id: "10000000-0000-0000-0000-000000000001",
        profile_id: base.profile.user_id,
        level: "S1",
        institution: "Universitas Padjadjaran",
        major: "Teknik Informatika",
        gpa: 3.82,
        start_year: 2018,
        end_year: 2022,
        created_at: "2026-11-12T00:00:00.000Z",
        updated_at: "2026-11-12T00:00:00.000Z",
      },
    ],
    experiences: [
      {
        id: "20000000-0000-0000-0000-000000000001",
        profile_id: base.profile.user_id,
        company: "PT Nusantara Digital",
        title: "Senior Backend Engineer",
        employment_type: "full_time",
        start_date: "2022-08-01",
        end_date: null,
        is_current: true,
        description: "Memimpin layanan pembayaran.",
        created_at: "2026-11-12T00:00:00.000Z",
        updated_at: "2026-11-12T00:00:00.000Z",
        points: [
          {
            id: "30000000-0000-0000-0000-000000000001",
            content: "Menurunkan latensi p95 API dari 420ms menjadi 110ms.",
            sort_order: 0,
          },
        ],
      },
    ],
    skills: [
      {
        id: "40000000-0000-0000-0000-000000000001",
        profile_id: base.profile.user_id,
        name: "TypeScript",
        level: "advanced",
        years: 4,
        created_at: "2026-11-12T00:00:00.000Z",
        updated_at: "2026-11-12T00:00:00.000Z",
      },
    ],
    certifications: [
      {
        id: "50000000-0000-0000-0000-000000000001",
        profile_id: base.profile.user_id,
        name: "AWS Solutions Architect",
        issuer: "Amazon Web Services",
        year: 2025,
        credential_url: "https://aws.amazon.com/verify",
        created_at: "2026-11-12T00:00:00.000Z",
        updated_at: "2026-11-12T00:00:00.000Z",
      },
    ],
    languages: [
      {
        id: "60000000-0000-0000-0000-000000000001",
        profile_id: base.profile.user_id,
        name: "Bahasa Inggris",
        proficiency: "Fasih",
        created_at: "2026-11-12T00:00:00.000Z",
        updated_at: "2026-11-12T00:00:00.000Z",
      },
    ],
  };
}

describe("renderResumePdf", () => {
  it("merender profil kosong tanpa gagal pada Template A dan B", async () => {
    const snapshot = buildResumeSnapshot(makeEmptyBundle(), null);

    for (const template of ["A", "B"] as const) {
      const pdf = await renderResumePdf(snapshot, template);
      expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(500);

      const text = extractTextFromPdfBuffer(pdf);
      expect(text).toContain("Kandidat");
      expect(text).toContain("Profil belum memiliki rincian tambahan.");
    }
  });

  it("merender profil parsial dan menyembunyikan bagian yang kosong", async () => {
    const full = makeFullBundle();
    const partialSnapshot = buildResumeSnapshot(
      {
        ...full,
        experiences: [],
        certifications: [],
        languages: [],
      },
      "rina@example.com",
    );

    const pdfA = await renderResumePdf(partialSnapshot, "A");
    const textA = extractTextFromPdfBuffer(pdfA);

    expect(textA).toContain("Rina Pratama");
    expect(textA).toContain("Universitas Padjadjaran");
    expect(textA).toContain("TypeScript");
    expect(textA).toContain("PENDIDIKAN");
    expect(textA).not.toContain("SERTIFIKASI");
    expect(textA).not.toContain("PT Nusantara Digital");
  });

  it("merender profil lengkap dan membedakan urutan fokus Template A vs B", async () => {
    const snapshot = buildResumeSnapshot(makeFullBundle(), "rina@example.com");

    const pdfA = await renderResumePdf(snapshot, "A");
    const textA = extractTextFromPdfBuffer(pdfA);

    expect(textA).toContain("Rina Pratama");
    expect(textA).toContain("Universitas Padjadjaran");
    expect(textA).toContain("PT Nusantara Digital");
    expect(textA).toContain("Menurunkan latensi p95 API dari 420ms menjadi 110ms.");
    expect(textA).toContain("SERTIFIKASI");
    expect(textA).toContain("AWS Solutions Architect");
    expect(textA).toContain("Bahasa Inggris (Fasih)");
    expect(textA.indexOf("PENDIDIKAN")).toBeGreaterThan(-1);
    expect(textA.indexOf("PENGALAMAN & MAGANG")).toBeGreaterThan(-1);
    expect(textA.indexOf("PENDIDIKAN")).toBeLessThan(textA.indexOf("PENGALAMAN & MAGANG"));

    const pdfB = await renderResumePdf(snapshot, "B");
    const textB = extractTextFromPdfBuffer(pdfB);

    expect(textB).toContain("Rina Pratama");
    expect(textB).toContain("Siap dalam 2 minggu");
    expect(textB).toContain("PT Nusantara Digital");
    expect(textB).toContain("Menurunkan latensi p95 API dari 420ms menjadi 110ms.");
    expect(textB).toContain("Universitas Padjadjaran");
    expect(textB.indexOf("PENGALAMAN KERJA")).toBeGreaterThan(-1);
    expect(textB.indexOf("PENDIDIKAN")).toBeGreaterThan(-1);
    expect(textB.indexOf("PENGALAMAN KERJA")).toBeLessThan(textB.indexOf("PENDIDIKAN"));
  });
});

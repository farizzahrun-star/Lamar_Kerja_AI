import { describe, expect, it } from "vitest";

import {
  certificationSchema,
  createResumeSchema,
  educationSchema,
  experienceSchema,
  identityPatchSchema,
  identitySchema,
  languageSchema,
  skillSchema,
} from "./schemas";

describe("identitySchema", () => {
  it("mengubah string kosong menjadi null", () => {
    const result = identitySchema.parse({
      full_name: "  Siti Aminah ",
      headline: "",
      summary: "",
      phone: "",
      address: "",
      birth_date: "",
      linkedin_url: "",
      portfolio_url: "",
      expected_salary: "",
      availability: "",
    });

    expect(result.full_name).toBe("Siti Aminah");
    expect(result.headline).toBeNull();
    expect(result.birth_date).toBeNull();
    expect(result.expected_salary).toBeNull();
  });

  it("menolak URL yang tidak valid", () => {
    const result = identitySchema.safeParse({
      full_name: "Siti",
      linkedin_url: "bukan-url",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["linkedin_url"]);
  });

  it("menolak tanggal lahir di masa depan", () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const result = identitySchema.safeParse({
      full_name: "Siti",
      birth_date: future.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/masa depan/);
  });

  it("menerima angka dari string form", () => {
    const result = identitySchema.parse({
      full_name: "Siti",
      expected_salary: "7500000",
    });

    expect(result.expected_salary).toBe(7_500_000);
  });

  it("patch kosong ditolak", () => {
    expect(identityPatchSchema.safeParse({}).success).toBe(false);
    expect(identityPatchSchema.safeParse({ headline: "Backend Engineer" }).success).toBe(true);
  });
});

describe("educationSchema", () => {
  const base = { level: "S1", institution: "Universitas Contoh" };

  it("menerima data valid dan mengosongkan level kosong", () => {
    const result = educationSchema.parse({
      ...base,
      level: "",
      gpa: "3.45",
      start_year: "2018",
      end_year: "2022",
    });

    expect(result.level).toBeNull();
    expect(result.gpa).toBe(3.45);
    expect(result.start_year).toBe(2018);
  });

  it("menolak GPA di luar 0-4", () => {
    expect(educationSchema.safeParse({ ...base, gpa: 4.2 }).success).toBe(false);
  });

  it("menolak tahun selesai sebelum tahun mulai", () => {
    const result = educationSchema.safeParse({ ...base, start_year: 2020, end_year: 2018 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["end_year"]);
  });
});

describe("experienceSchema", () => {
  const base = { company: "PT Contoh", title: "Software Engineer" };

  it("menerima poin dan mengubah string kosong menjadi null", () => {
    const result = experienceSchema.parse({
      ...base,
      start_date: "2022-01-01",
      end_date: "",
      is_current: true,
      description: "",
      points: ["Membangun API", "Menulis test"],
    });

    expect(result.end_date).toBeNull();
    expect(result.points).toHaveLength(2);
    expect(result.description).toBeNull();
  });

  it("menolak pekerjaan saat ini dengan tanggal selesai", () => {
    const result = experienceSchema.safeParse({ ...base, is_current: true, end_date: "2023-01-01" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["end_date"]);
  });

  it("menolak lebih dari 20 poin", () => {
    const result = experienceSchema.safeParse({
      ...base,
      points: Array.from({ length: 21 }, (_, index) => `Poin ${index}`),
    });

    expect(result.success).toBe(false);
  });
});

describe("schema sederhana", () => {
  it("skill menerima tahun desimal dan menolak nama kosong", () => {
    expect(skillSchema.parse({ name: "TypeScript", years: "2.5" }).years).toBe(2.5);
    expect(skillSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("sertifikasi menolak URL kredensial yang salah", () => {
    const result = certificationSchema.safeParse({
      name: "AWS",
      credential_url: "aws.example",
    });

    expect(result.success).toBe(false);
  });

  it("bahasa menerima proficiency opsional", () => {
    const result = languageSchema.parse({ name: "Inggris", proficiency: "" });

    expect(result.proficiency).toBeNull();
  });

  it("createResumeSchema hanya menerima template A atau B", () => {
    expect(createResumeSchema.parse({ template: "A" }).template).toBe("A");
    expect(createResumeSchema.parse({ template: "B" }).template).toBe("B");
    expect(createResumeSchema.safeParse({ template: "C" }).success).toBe(false);
  });
});

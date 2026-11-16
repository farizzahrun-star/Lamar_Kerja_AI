/**
 * Fixture sintetis untuk dev/demo dan pengujian deterministik.
 *
 * Seluruh nama, perusahaan, dan kontak di sini murni rekaan — tidak boleh
 * memakai data kandidat atau perusahaan nyata.
 */

export const SYNTHETIC_USER = {
  email: "demo.kandidat@lamarkerja.local",
  password: "DemoPassword123!",
  fullName: "Nadia Pratama",
} as const;

export const SYNTHETIC_PROFILE = {
  full_name: "Nadia Pratama",
  headline: "Backend Software Engineer",
  summary:
    "Software engineer dengan 4 tahun pengalaman merancang API dan layanan terdistribusi memakai TypeScript, Go, dan PostgreSQL.",
  phone: "+62 811-0000-1234",
  address: "Bandung, Indonesia",
  birth_date: "1998-05-14",
  linkedin_url: "https://linkedin.com/in/nadia-pratama-sintetis",
  portfolio_url: "https://nadia-sintetis.example.com",
  expected_salary: 18_000_000,
  availability: "2 minggu notice",
} as const;

export const SYNTHETIC_EDUCATIONS = [
  {
    level: "S1" as const,
    institution: "Universitas Sintetis Nusantara",
    major: "Teknik Informatika",
    gpa: 3.68,
    start_year: 2016,
    end_year: 2020,
  },
] as const;

export const SYNTHETIC_EXPERIENCES = [
  {
    company: "PT Awan Sintetis Indonesia",
    title: "Backend Software Engineer",
    employment_type: "full_time" as const,
    start_date: "2022-02-01",
    end_date: null,
    is_current: true,
    description: "Mengelola layanan pembayaran dan integrasi mitra.",
    points: [
      "Merancang antrean pemrosesan transaksi asinkron hingga 50 ribu job per hari",
      "Menurunkan latensi kuartil ke-95 endpoint checkout dari 480 ms menjadi 190 ms",
    ],
  },
  {
    company: "Studio Kode Fiktif",
    title: "Junior Software Engineer",
    employment_type: "full_time" as const,
    start_date: "2020-08-01",
    end_date: "2022-01-01",
    is_current: false,
    description: null,
    points: ["Membangun layanan autentikasi dan pelaporan internal berbasis REST"],
  },
] as const;

export const SYNTHETIC_SKILLS = [
  { name: "TypeScript", level: "advanced" as const, years: 4 },
  { name: "PostgreSQL", level: "advanced" as const, years: 4 },
  { name: "Go", level: "intermediate" as const, years: 2 },
  { name: "Docker", level: "intermediate" as const, years: 3 },
] as const;

export const SYNTHETIC_CERTIFICATIONS = [
  {
    name: "Cloud Architecture Associate (Sintetis)",
    issuer: "Lembaga Sertifikasi Contoh",
    year: 2024,
    credential_url: "https://sertifikat.example.com/sintetis-001",
  },
] as const;

export const SYNTHETIC_LANGUAGES = [
  { name: "Bahasa Indonesia", proficiency: "Penutur asli" },
  { name: "Bahasa Inggris", proficiency: "Profesional" },
] as const;

export const SYNTHETIC_CV_TEXT = `Nadia Pratama
Backend Software Engineer | Bandung, Indonesia
nadia.pratama@example.com | +62 811-0000-1234
https://linkedin.com/in/nadia-pratama-sintetis | https://nadia-sintetis.example.com

RINGKASAN
Software engineer dengan 4 tahun pengalaman merancang API dan layanan terdistribusi memakai TypeScript, Go, dan PostgreSQL.

PENGALAMAN KERJA
PT Awan Sintetis Indonesia - Backend Software Engineer
Februari 2022 - Sekarang
- Merancang antrean pemrosesan transaksi asinkron hingga 50 ribu job per hari
- Menurunkan latensi kuartil ke-95 endpoint checkout dari 480 ms menjadi 190 ms

Studio Kode Fiktif - Junior Software Engineer
Agustus 2020 - Januari 2022
- Membangun layanan autentikasi dan pelaporan internal berbasis REST

PENDIDIKAN
Universitas Sintetis Nusantara - S1 Teknik Informatika (IPK 3.68)
2016 - 2020

KEAHLIAN
TypeScript, PostgreSQL, Go, Docker, Redis`;

export const SYNTHETIC_PENDING_SUGGESTIONS = [
  {
    section: "skills" as const,
    field_path: "skills[0]",
    value_json: { name: "Redis", level: "intermediate" },
    confidence: 0.91,
    source_snippet: "TypeScript, PostgreSQL, Go, Docker, Redis",
  },
] as const;

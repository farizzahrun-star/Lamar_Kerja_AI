/**
 * Fixture sintetis untuk dev/demo dan pengujian deterministik.
 *
 * Seluruh nama, perusahaan, dan kontak di sini murni rekaan — tidak boleh
 * memakai data kandidat atau perusahaan nyata.
 */

import type { ApplyChannel, JobPlatform, WorkMode } from "@lamarkerja/shared";

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

export const SYNTHETIC_USER_INTEREST_SLUGS = [
  "backend-developer",
  "fullstack-developer",
  "devops-engineer",
] as const;

export interface SyntheticJobFixture {
  external_id: string;
  platform: JobPlatform;
  apply_channel: ApplyChannel;
  title: string;
  company: string;
  location: string;
  work_mode: WorkMode;
  salary_min: number | null;
  salary_max: number | null;
  url: string;
  description: string;
  includeH2?: boolean;
}

export const SYNTHETIC_JOBS: readonly SyntheticJobFixture[] = [
  {
    external_id: "seed-glints-001",
    platform: "glints",
    apply_channel: "email",
    title: "Senior Backend Developer (TypeScript & PostgreSQL)",
    company: "PT Awan Sintetis Nusantara",
    location: "Jakarta Selatan",
    work_mode: "hybrid",
    salary_min: 16_000_000,
    salary_max: 24_000_000,
    url: "https://glints.example.com/jobs/seed-glints-001",
    description:
      "Membangun layanan API berskala tinggi dengan TypeScript, Node.js, dan PostgreSQL. Kirim CV terbaru Anda ke careers@awan-sintetis.example.com dengan subjek Backend.",
    includeH2: true,
  },
  {
    external_id: "seed-jobstreet-002",
    platform: "jobstreet",
    apply_channel: "easy_apply",
    title: "Backend Developer (Go / Node.js)",
    company: "PT Logistik Fiktif Indonesia",
    location: "Bandung",
    work_mode: "hybrid",
    salary_min: 14_000_000,
    salary_max: 19_000_000,
    url: "https://jobstreet.example.com/jobs/seed-jobstreet-002",
    description:
      "Merancang sistem pelacakan pengiriman dan queue berbasis PostgreSQL serta Docker. Pengalaman optimasi query sangat diutamakan.",
    includeH2: true,
  },
  {
    external_id: "seed-linkedin-003",
    platform: "linkedin",
    apply_channel: "easy_apply",
    title: "Fullstack Developer (Next.js & TypeScript)",
    company: "Studio Produk Contoh",
    location: "Remote Indonesia",
    work_mode: "remote",
    salary_min: 15_000_000,
    salary_max: 21_000_000,
    url: "https://linkedin.example.com/jobs/seed-linkedin-003",
    description:
      "Mengembangkan aplikasi web Next.js App Router, Tailwind CSS, dan backend PostgreSQL untuk tim internal.",
  },
  {
    external_id: "seed-glints-004",
    platform: "glints",
    apply_channel: "email",
    title: "DevOps Engineer (Docker & Linux)",
    company: "PT Infrastruktur Contoh",
    location: "Jakarta Pusat",
    work_mode: "onsite",
    salary_min: 15_000_000,
    salary_max: 22_000_000,
    url: "https://glints.example.com/jobs/seed-glints-004",
    description:
      "Mengelola container Docker, reverse proxy Caddy, dan otomasi backup terenkripsi. Hubungi talent@infrastruktur-contoh.example.com.",
  },
  {
    external_id: "seed-manual-005",
    platform: "manual",
    apply_channel: "email",
    title: "Backend API Engineer",
    company: "PT FinTek Simulasi",
    location: "Jakarta Selatan",
    work_mode: "hybrid",
    salary_min: 17_000_000,
    salary_max: 23_000_000,
    url: "https://karir.fintek-simulasi.example.com/backend-api",
    description:
      "Bertanggung jawab pada reliability endpoint checkout dan antrean transaksi asinkron. Lamaran dapat dikirim ke recruitment@fintek-simulasi.example.com.",
  },
  {
    external_id: "seed-jobstreet-006",
    platform: "jobstreet",
    apply_channel: "portal",
    title: "Fullstack Software Engineer",
    company: "PT Edukasi Digital Fiktif",
    location: "Yogyakarta",
    work_mode: "remote",
    salary_min: 12_000_000,
    salary_max: 17_000_000,
    url: "https://jobstreet.example.com/jobs/seed-jobstreet-006",
    description:
      "Membangun platform pembelajaran interaktif memakai React, TypeScript, dan Postgres.",
  },
  {
    external_id: "seed-glints-007",
    platform: "glints",
    apply_channel: "link",
    title: "Platform & Backend Engineer",
    company: "PT Ritel Awan Contoh",
    location: "Surabaya",
    work_mode: "onsite",
    salary_min: 13_000_000,
    salary_max: 18_000_000,
    url: "https://glints.example.com/jobs/seed-glints-007",
    description:
      "Mengembangkan integrasi inventori dan API layanan mitra dengan Go dan PostgreSQL.",
  },
  {
    external_id: "seed-linkedin-008",
    platform: "linkedin",
    apply_channel: "link",
    title: "UI/UX Designer",
    company: "Agensi Desain Contoh",
    location: "Jakarta",
    work_mode: "hybrid",
    salary_min: 10_000_000,
    salary_max: 14_000_000,
    url: "https://linkedin.example.com/jobs/seed-linkedin-008",
    description:
      "Merancang sistem desain Figma, riset pengguna, dan prototipe interaktif produk web.",
  },
  {
    external_id: "seed-jobstreet-009",
    platform: "jobstreet",
    apply_channel: "portal",
    title: "Finance & Accounting Analyst",
    company: "PT Niaga Sejahtera Fiktif",
    location: "Jakarta Barat",
    work_mode: "onsite",
    salary_min: 9_000_000,
    salary_max: 13_000_000,
    url: "https://jobstreet.example.com/jobs/seed-jobstreet-009",
    description:
      "Menyusun laporan keuangan bulanan, rekonsiliasi pajak, dan kontrol anggaran operasional.",
  },
];

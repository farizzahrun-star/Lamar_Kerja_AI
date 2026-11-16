import type { CvParseSection } from "@lamarkerja/shared";

import { CV_PARSE_PROMPT_VERSION, SECTION_JSON_SCHEMAS } from "./sections";

export { CV_PARSE_PROMPT_VERSION };

export interface SectionPrompt {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export const CV_MAX_PROMPT_CHARS = 12_000;

const COMMON_RULES = [
  "Anda adalah mesin ekstraksi data CV. Tugas Anda hanya menyalin informasi yang TERTULIS EKSPLISIT pada teks CV.",
  "Jangan pernah mengarang, menebak, menerjemahkan, atau menambahkan informasi yang tidak ada di teks.",
  "Setiap item WAJIB menyertakan `source_snippet`: kutipan persis (verbatim) dari teks CV yang menjadi dasar item tersebut, maksimal 400 karakter.",
  "`confidence` adalah angka 0 sampai 1 yang mencerminkan seberapa yakin Anda bahwa nilai itu benar dan lengkap.",
  "Jawab HANYA dengan JSON sesuai schema. Tanpa penjelasan, tanpa markdown, tanpa pagar kode.",
];

const SECTION_INSTRUCTIONS: Record<CvParseSection, string[]> = {
  identity: [
    "Ekstrak identitas kandidat: `full_name` (nama lengkap), `headline` (jabatan/profesi saat ini), `summary` (ringkasan profil maksimal 2000 karakter), `phone` (nomor telepon), `address` (kota/negara), `linkedin_url` (URL LinkedIn lengkap), `portfolio_url` (URL portofolio/GitHub/website).",
    "Gunakan `field` sesuai daftar enum. Lewati field yang tidak ada di teks; jangan mengisi string kosong.",
    "Maksimal satu item per `field`. Jika ada beberapa nilai untuk field yang sama, pilih yang paling jelas dan lengkap.",
    "Untuk `linkedin_url` dan `portfolio_url`, sertakan URL utuh (mulai dengan https://) bila tertulis.",
  ],
  experiences: [
    "Ekstrak setiap pengalaman kerja/magang/freelance sebagai satu item.",
    "`start_date` dan `end_date` memakai format `YYYY-MM` (contoh `2021-03`). Jika hanya tahun yang tertulis, pakai `YYYY`. Jika tidak ada, isi null.",
    "`is_current` bernilai true HANYA bila teks menyatakan pekerjaan berlangsung sampai sekarang (mis. \"Present\", \"Sekarang\", \"Current\") atau tidak mencantumkan tanggal selesai sama sekali.",
    "Bila tanggal selesai tertulis (contoh \"Februari 2021\"), isi `end_date` dan set `is_current` ke false.",
    "`employment_type` hanya diisi bila tertulis eksplisit (full_time, part_time, contract, internship, freelance). Selain itu null.",
    "`points` berisi daftar pencapaian/tanggung jawab singkat (maksimal 20 poin, tiap poin maksimal 300 karakter).",
    "`description` opsional, ringkasan peran maksimal 2000 karakter. Jangan menduplikasi isi `points`.",
  ],
  educations: [
    "Ekstrak setiap riwayat pendidikan sebagai satu item.",
    "`level` hanya diisi bila dapat disimpulkan jelas dari teks: SMA, SMK, D3, S1, S2, atau S3. Selain itu null.",
    "`start_year` dan `end_year` berupa angka tahun 4 digit (contoh 2018). Jika tidak tertulis, null.",
    "`gpa` berupa angka 0-4 (skala IPK). Jika teks memakai skala lain, null.",
    "`major` adalah jurusan/program studi.",
  ],
  skills: [
    "Ekstrak keterampilan teknis maupun non-teknis yang tertulis eksplisit (bahasa pemrograman, framework, tools, bahasa asing, soft skill).",
    "`name` maksimal 60 karakter dan berupa nama skill saja tanpa penjelasan tambahan.",
    "`level` hanya diisi bila teks menyebut tingkat kemampuan (beginner, intermediate, advanced). Selain itu null.",
    "Jangan mengulang skill yang sama; gabungkan menjadi satu item.",
  ],
};

/**
 * Memotong teks CV pada batas baris agar prompt tidak melebihi konteks model.
 */
export function truncateCvText(text: string, maxChars = CV_MAX_PROMPT_CHARS): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastNewline = sliced.lastIndexOf("\n");
  return (lastNewline > maxChars * 0.6 ? sliced.slice(0, lastNewline) : sliced).trim();
}

export function buildSectionPrompt(section: CvParseSection, cvText: string): SectionPrompt {
  const schema = SECTION_JSON_SCHEMAS[section] as unknown as Record<string, unknown>;

  return {
    system: [...COMMON_RULES, `Bagian yang diekstrak: ${section}.`].join("\n"),
    user: [
      ...SECTION_INSTRUCTIONS[section],
      "",
      "Schema JSON keluaran:",
      JSON.stringify(schema),
      "",
      "Teks CV (mungkin terpotong):",
      '"""',
      truncateCvText(cvText),
      '"""',
    ].join("\n"),
    schema,
  };
}

/**
 * Prompt perbaikan setelah keluaran pertama gagal validasi zod. Model diminta
 * memperbaiki JSON-nya tanpa menambah informasi baru.
 */
export function buildRepairPrompt(
  section: CvParseSection,
  cvText: string,
  invalidOutput: string,
  errorSummary: string,
): SectionPrompt {
  const base = buildSectionPrompt(section, cvText);

  return {
    system: base.system,
    user: [
      base.user,
      "",
      "Keluaran sebelumnya TIDAK VALID terhadap schema.",
      `Kesalahan: ${errorSummary.slice(0, 1200)}`,
      "Keluaran sebelumnya:",
      '"""',
      invalidOutput.slice(0, 6000),
      '"""',
      "",
      "Perbaiki JSON tersebut agar valid sesuai schema. Jangan menambahkan informasi baru di luar teks CV.",
    ].join("\n"),
    schema: base.schema,
  };
}

# Lamar Kerja AI

Aplikasi web otomasi proses melamar pekerjaan secara aman, transparan, dan
terkendali: mengumpulkan lowongan publik (scraping guest di Local Runner),
mencocokkan profil kandidat, menyiapkan draft CV, cover letter, dan jawaban form,
serta mengirimkan lamaran via email (Gmail API) atau portal apply (Playwright di
Local Runner).

Sistem dirancang untuk tim internal 2 orang (target ~10 pengguna dalam 3 bulan),
tanpa biaya infrastruktur ($0), berjalan di Oracle Always Free VM + laptop tim,
dan **data CV kandidat tidak pernah dikirim ke penyedia AI komersial**.

## Prinsip Utama

1. **Manusia adalah otoritas akhir.** Tidak ada lamaran yang dikirim tanpa
   persetujuan pengguna. Default `PORTAL_AUTO_SUBMIT=false`.
2. **Template-first, rules-first, AI-last.** Sistem berjalan 100% tanpa LLM.
   AI (Ollama lokal CPU-only) bersifat opsional hanya untuk menghasilkan teks.
3. **Data kandidat tidak keluar ke pihak ketiga.** Tidak ada API key AI
   komersial. Kredensial akun platform (LinkedIn, Glints, dll.) **tidak pernah
   disimpan di server**.
4. **Scraping guest bertanggung jawab.** Berjalan di Local Runner (IP
   residensial tim), maks 10 lowongan/platform/hari, jeda acak 20-45 detik,
   berhenti jika ada login wall/CAPTCHA.
5. **Audit log lengkap.** Setiap aksi scraping, draft, persetujuan, dan
   pengiriman dicatat secara transparan.

## Alur Kerja 4 Tahap

```text
+-------------------------------------------------------------+
| Tahap 1: Pengumpulan Lowongan                               |
| Local Runner (Playwright guest) -> maks 10 lowongan/platform|
| + Sumber manual (URL, teks, CSV)                            |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Tahap 2: Pemilihan & Review oleh Pengguna                   |
| Matching rules-based (skor 0-100) -> Pengguna memilih       |
| lowongan yang ingin dilamar (maks 10/hari)                  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Tahap 3: Pembuatan Draft & Persiapan Berkas                 |
| Template CV PDF + Cover letter (template / LLM lokal)       |
| + Jawaban form dari portal_answers -> Review & Approve      |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Tahap 4: Pengiriman Lamaran                                 |
| - Jalur A (Email): Worker kirim via Gmail API               |
| - Jalur B (Portal): Local Runner isi form (berhenti         |
|   sebelum Submit secara default)                            |
+-------------------------------------------------------------+
```

Detail lengkap alur ada di [docs/workflow.md](docs/workflow.md).

## Struktur Repository

```text
apps/
  web/           Dashboard, interface Next.js 15, dan API internal
  runner/        Local Runner (Playwright) untuk scraping guest & portal apply

workers/
  discovery/     Ingest lowongan, deduplikasi, dan pembuatan snapshot H-1
  generator/     Analisis lowongan, penyiapan draft, dan jawaban form
  sender/        Pengiriman email (Gmail API) dan sinkronisasi reply

packages/
  ai/            Adapter Ollama lokal (CPU-only, opsional)
  matching/      Rules-based matching profil-lowongan (40/25/15/10/10)
  pdf/           Renderer CV PDF (@react-pdf/renderer)
  email/         Adapter Gmail API (OAuth)
  db/            Schema database Drizzle ORM, migration, dan client

prompts/         Prompt AI versioned
docs/            Dokumentasi lengkap pengembangan
infrastructure/  Docker Compose, Caddy, dan script backup
```

## Dokumentasi

- [Alur kerja 4 tahap](docs/workflow.md) — Panduan alur utama dari scraping hingga kirim
- [Arsitektur sistem](docs/architecture.md) — Komponen, model data, dan pipeline
- [Sumber lowongan & scraping](docs/sources.md) — Aturan scraping guest, batas, dan adapter
- [Panduan setup & Local Runner](docs/setup.md) — Menjalankan web, worker, runner, dan deploy
- [Roadmap pengembangan](docs/roadmap.md) — Rencana bertahap Phase 0 sampai Phase 7
- [Kebijakan privasi data](docs/privacy.md) — Aturan perlindungan data kandidat
- [Log keputusan arsitektur (ADR)](docs/decisions.md) — ADR-001 hingga ADR-023
- [Panduan onboarding tim](docs/team-onboarding.md) — Checklist hari pertama dan aturan akses
- [Panduan evaluasi model](docs/evaluation.md) — Pengukuran kualitas matching dan draft
- [Panduan training model AI](docs/ai-training.md) — Eksperimen model lokal (Phase 7)

## Urutan Fase Pengembangan

1. **Phase 0: Fondasi** — Scaffold monorepo, PostgreSQL, schema awal, dan autentikasi.
2. **Phase 1: Profil dan CV** — Onboarding profil kandidat lengkap dan generator CV PDF.
3. **Phase 2: Tahap 1 & 2 (Scraping Guest & Pemilihan)** — Local Runner Playwright (10/platform/hari), ingest H-1, dan antrean pilihan user.
4. **Phase 3: Matching** — Rules-based matching (skor 0-100 dengan bobot 40/25/15/10/10).
5. **Phase 4: Tahap 3 (Antrean Persiapan)** — Template draft, `portal_answers`, dan alur review/approval.
6. **Phase 5: Tahap 4a (Email HR)** — Pengiriman email via Gmail API setelah approval.
7. **Phase 6: Tahap 4b (Portal & Easy Apply)** — Local Runner mengisi form portal dan berhenti sebelum Submit.
8. **Phase 7: Peningkatan Opsional** — Ollama lokal untuk draft enrichment, eval set, dan sumber tambahan.

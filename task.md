# Task Board — Lamar Kerja AI

Papan progres implementasi. Sumber kebenaran fitur tetap ada di
[`docs/roadmap.md`](docs/roadmap.md); dokumen ini memecahnya menjadi milestone
yang bisa dicentang.

**Legenda:** `[ ]` belum · `[x]` selesai · `[!]` terblokir (lihat catatan)

**Status saat ini:** Phase 1 dimulai dari M0 (fondasi). Batch 1 = M0 + M1 + M2.
Batch 2 = M3 + M4.

---

## Phase 0 — Fondasi

Target: aplikasi bisa dijalankan lokal dengan database dan autentikasi.

### M0 — Bootstrap & Fondasi (Batch 1)

**Workspace & tooling**
- [x] Pin `pnpm@10` (`packageManager`); `corepack enable` gagal di Windows (EPERM), jadi pnpm dipasang ke `%LOCALAPPDATA%\pnpm`
- [x] `.nvmrc` Node 22
- [x] Root `package.json` + `pnpm-workspace.yaml`
- [x] `tsconfig.base.json` (strict)
- [x] ESLint 9 flat config + Prettier
- [x] Vitest config + satu smoke test
- [x] `.env.example` lengkap (tanpa secret)
- [x] `.gitignore` mencakup `data/`, `.env`, artefak build

**Aplikasi web**
- [x] Scaffold Next.js 15 (App Router, TypeScript strict, standalone output)
- [x] Tailwind v4 + halaman dasar
- [x] Layout dashboard + navigasi dasar
- [x] `/api/health` + logger JSON (redaksi PII)
- [x] Halaman error/404

**Auth Supabase**
- [x] Tidak membuat `lib/supabase/client.ts`: auth berjalan lewat Server Actions, browser client belum diperlukan
- [x] `lib/supabase/server.ts` (`@supabase/ssr`, cookie session)
- [x] `lib/supabase/admin.ts` (`createAdminClient`, server-only)
- [x] `middleware.ts` refresh session + guard route
- [x] `/login`, `/register`, logout
- [x] Auto-create `profiles` saat user baru (`handle_new_user` trigger)

**Database**
- [x] `migrations/0001_phase1_schema.sql` (seluruh tabel Phase 1 + enum + index)
- [x] Trigger `updated_at`
- [x] RLS aktif + policy untuk semua tabel
- [x] Migration diterapkan ke project Supabase (`phase1_schema`)
- [x] Generate tipe `packages/db/src/types.ts`

**Dokumentasi**
- [x] Commit ADR-026 (Supabase)
- [x] Sinkronkan `architecture.md` & `setup.md` (hapus PostgreSQL self-host/Auth.js)
- [x] Catatan pemroses data Supabase di `privacy.md`

**Verifikasi M0**
- [x] `pnpm dev` jalan dan `/login` → `/dashboard` berfungsi (diuji lewat browser: register → onboarding → dashboard → logout → login)
- [x] `pnpm lint` hijau
- [x] `pnpm typecheck` hijau
- [x] `pnpm test` hijau
- [x] Tidak ada secret yang ter-commit

**Catatan M0**
- `output: "standalone"` otomatis aktif di Linux; di Windows dimatikan agar
  tracing symlink tidak gagal (EPERM). Paksa dengan `NEXT_OUTPUT=standalone`.
- RLS diverifikasi dengan dua akun: masing-masing hanya melihat satu baris
  `profiles` miliknya dan 0 baris milik user lain.
- Worker baru berupa kerangka (`readConfig`, daftar job); loop `cv.parse`
  menyusul di M3.

---

## Phase 1 — Profil dan CV

Target: user bisa mengisi data diri, mengunggah CV lama (opsional), dan
mengunduh CV PDF tanpa bergantung pada AI.

### M1 — Profil & Onboarding (Batch 1)

**Schema & validasi**
- [ ] Schema zod profil (identitas)
- [ ] Schema zod pendidikan
- [ ] Schema zod pengalaman + bullet
- [ ] Schema zod skill, sertifikasi, bahasa
- [ ] Unit test validator

**API**
- [ ] `GET/PATCH /api/profile`
- [ ] CRUD `/api/profile/educations`
- [ ] CRUD `/api/profile/experiences` (+ `experience_points`)
- [ ] CRUD `/api/profile/skills`
- [ ] CRUD `/api/profile/certifications`
- [ ] CRUD `/api/profile/languages`
- [ ] Error mapping zod → field

**UI**
- [ ] Wizard `/onboarding` per bagian
- [ ] Autosave debounce + indikator tersimpan
- [ ] Progress step (`profiles.onboarding_step`)
- [ ] Halaman `/profile` (view + edit)
- [ ] Editor bullet pengalaman (tambah/hapus/urutkan)
- [ ] Uji RLS lintas user

### M2 — CV PDF (Batch 1)

- [ ] Template A — fresh graduate
- [ ] Template B — berpengalaman
- [ ] Renderer `@react-pdf/renderer` (A4, tanpa Chromium)
- [ ] `POST /api/resumes` + versioning
- [ ] `GET /api/resumes/:id/file` (inline/attachment + ownership)
- [ ] Halaman `/profile/cv` (pilih template, preview, download, riwayat)
- [ ] Test render profil kosong/parsial/lengkap
- [ ] Verifikasi isi teks PDF hasil render

### M3 — Upload CV, Consent, Parsing (Batch 2)

**Consent**
- [ ] UI checkbox consent terpisah dari ToS
- [ ] `POST /api/consent` + `DELETE /api/consent/cv_ai_processing`
- [ ] Helper `requireConsent` → `403 CONSENT_REQUIRED`
- [ ] Revoke: batalkan run, hapus suggestions, jadwalkan hapus file

**Upload**
- [ ] `POST /api/cv/upload` (PDF/DOCX ≤ 10 MB, magic bytes, sha256)
- [ ] Penyimpanan `CV_STORAGE_DIR/<user_id>/<uuid>`
- [ ] Ekstraksi teks `pdfjs-dist` (PDF) + `mammoth` (DOCX)
- [ ] Normalisasi teks + deteksi PDF scan (`skipped`)

**Worker `cv.parse`**
- [ ] Worker polling `cv_parse_runs` via secret key
- [ ] Klien Ollama (`think:false`, JSON Schema, timeout 180s)
- [ ] Prompt versioned per bagian (identity/experiences/educations/skills)
- [ ] Validasi zod + repair 1×
- [ ] `confidence` + `source_snippet` (grounding check)
- [ ] Circuit breaker 3 gagal/5 menit → jeda 10 menit

**Review**
- [ ] Halaman review diff per field
- [ ] Accept/reject per field, per bagian, dan semua
- [ ] Merge ke profil (dedupe pengalaman/skill)
- [ ] Tidak ada jalur otomatis model → `profiles`

**Fallback**
- [ ] Ollama offline/timeout/JSON invalid → `failed` + form manual
- [ ] `AI_ENABLED=false` → parsing dilewati

### M4 — Cleanup & Hardening (Batch 2)

- [ ] Worker `cv.cleanup` (file > 30 hari)
- [ ] Rate limit upload
- [ ] Path traversal guard
- [ ] Audit log (consent, upload, accept suggestion)
- [ ] Seed script fixture sintetis
- [ ] Update `setup.md`, `architecture.md`, `team-onboarding.md`, README

**Verifikasi Phase 1**
- [ ] Register/login/logout + session persist
- [ ] Onboarding autosave bertahan setelah reload
- [ ] CV A/B preview & download, versioning benar
- [ ] Upload tanpa consent → 403
- [ ] PDF scan → `skipped` tanpa memanggil Ollama
- [ ] Ollama mati → `failed`, form manual tetap jalan
- [ ] `cv.cleanup` menghapus file kedaluwarsa
- [ ] Log bebas PII

---

## Phase 2 — Scraping Guest & Pemilihan Lowongan

### M2.1 — Local Runner & Ingest
- [ ] `apps/runner`: bootstrap, config, token runner
- [ ] Endpoint `/api/runner/tasks`, `/api/runner/jobs`, `/api/runner/tasks/:id/result`
- [ ] Worker `runner.plan` + `jobs.ingest` (normalisasi, dedupe, snapshot)
- [ ] Adapter Playwright guest: Glints
- [ ] Adapter Playwright guest: Jobstreet
- [ ] Adapter Playwright guest: LinkedIn (halaman publik)
- [ ] Fixture test per adapter
- [ ] Kuota 10/platform/hari + jeda acak + deteksi blokir
- [ ] `collector_runs` + halaman status runner
- [ ] Deteksi `apply_channel` + ekstraksi email HR
- [ ] Cadangan manual: URL, teks, CSV

### M2.2 — Minat & Dashboard
- [ ] Master `interests`, `user_interests`, `user_platforms`
- [ ] API & halaman jobs (list, filter, detail)
- [ ] Banner snapshot H-1 + fallback
- [ ] Status per platform
- [ ] `POST /api/applications` (status `queued`)
- [ ] Batas harian antrean + pencegahan lamaran ganda

---

## Phase 3 — Matching

- [ ] Rules engine bobot 40/25/15/10/10
- [ ] Skill dictionary
- [ ] Ekstraksi requirement dari deskripsi lowongan
- [ ] `breakdown_json` per komponen
- [ ] Worker `matching.compute` setelah ingest
- [ ] UI skor + alasan (matched/missing)
- [ ] Unit test tiap komponen skor

---

## Phase 4 — Antrean Persiapan

- [ ] Worker `application.prepare` berurutan + retry
- [ ] CV khusus lowongan (pilih & urutkan data)
- [ ] Template cover letter (5 varian)
- [ ] Subject/body email + pesan reach-out HR
- [ ] UI `portal_answers` (gaji, relokasi, notice period)
- [ ] Pencocokan pertanyaan form → jawaban tersimpan
- [ ] Pertanyaan tak terjawab → `needs_user`
- [ ] Editor draft + `review_before_send` + halaman review
- [ ] Audit trail perubahan draft/status

---

## Phase 5 — Email HR

- [ ] OAuth Gmail + token terenkripsi
- [ ] Worker `email.send` + jeda acak + lampiran CV
- [ ] Batas email harian + kill switch
- [ ] Simpan message ID + `tracking_events`
- [ ] `inbox.sync` (deteksi balasan)
- [ ] Halaman riwayat lamaran

---

## Phase 6 — Portal, Easy Apply & CV Parsing v2

### M6.1 — Portal & Easy Apply
- [ ] `runner_tasks` + handler `portal.apply`
- [ ] Profil browser per user + login manual + `session_status`
- [ ] Adapter Glints
- [ ] Adapter Jobstreet
- [ ] Adapter LinkedIn Easy Apply
- [ ] Unggah CV via signed URL berumur pendek
- [ ] Default berhenti sebelum Submit
- [ ] CAPTCHA/verifikasi → `needs_user`
- [ ] `runner.watchdog`
- [ ] Mode "hanya link"

### M6.2 — CV Parsing v2
- [ ] Section-wise chunking + `num_ctx` efisien
- [ ] `confidence` + `source_snippet` di UI review
- [ ] Prompt/Modelfile tuning + eval F1
- [ ] Review diff per field + bulk accept/reject
- [ ] (Opsional) LoRA/QLoRA jika baseline mentok

---

## Phase 7 — Peningkatan Opsional

- [ ] Toggle `AI_ENABLED` per environment + kill switch
- [ ] Eval set & harness `tests/eval` (draf + CV)
- [ ] Perbandingan template vs LLM
- [ ] Adapter Glassdoor (best effort)
- [ ] ATS publik (Greenhouse, Lever, Ashby, Workable)
- [ ] pgvector semantic matching
- [ ] Fine-tune embedding
- [ ] Dashboard statistik + export data lamaran

### Prasyarat Training Model
- [ ] Eval set 50–100 contoh terkunci
- [ ] Baseline prompt + `qwen3:4b` terukur (F1, hallucination, latency p95)
- [ ] Dataset ≥ 300 contoh, anonim, consent `ai_training_opt_in`
- [ ] Bukti prompt/Modelfile tidak lagi cukup
- [ ] Rencana rollback + model champion tersedia

---

## Backlog Teknis Lintas Phase

- [ ] CI: lint + typecheck + test per PR
- [ ] Backup & uji restore database
- [ ] Monitoring uptime + alert
- [ ] Rate limiting global
- [ ] Audit keamanan RLS (Supabase advisors)
- [x] Dokumentasi pemroses data pihak ketiga (Supabase)

---

## Log Progres

| Tanggal | Milestone | Catatan |
|---|---|---|
| 2026-11-12 | M0 | Task board dibuat; implementasi fondasi dimulai |
| 2026-11-12 | M0 | Scaffold workspace, web, auth Supabase, migration `0001_phase1_schema`, tipe DB, logger PII. Verifikasi: lint/typecheck/test/build hijau, alur daftar→dashboard→logout→login diuji lewat browser, RLS diuji dengan dua akun. Docs (ADR-026, architecture, setup, privacy) disinkronkan. |

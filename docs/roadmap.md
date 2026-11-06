# Roadmap Pengembangan

Alur produk mengikuti [workflow.md](workflow.md): scraping harian (1), pemilihan
user (2), antrean persiapan (3), eksekusi pengiriman (4).

## Prinsip Roadmap

- Setiap fase harus menghasilkan sesuatu yang bisa dipakai, bukan hanya
  infrastruktur.
- Fitur inti tidak boleh bergantung pada LLM. AI ditambahkan setelah alur utama
  stabil.
- Scraping selalu guest, volume rendah, dan dijalankan di Local Runner.
- Tidak ada penyimpanan password atau cookie platform di server.
- Pengiriman portal berhenti sebelum Submit secara default.

## Phase 0: Fondasi

Target: aplikasi bisa dijalankan lokal dengan database dan autentikasi.

- Scaffold monorepo (Next.js 15 + TypeScript) termasuk `apps/runner` kosong.
- Konfigurasi lint, format, dan TypeScript strict.
- `docker-compose` untuk PostgreSQL + web (dev).
- Schema database fase 1 dan migration awal (termasuk role `app` dan
  `analytics_ro`).
- Auth: register, login, logout, session.
- Layout dashboard dan navigasi dasar.
- `.env.example` lengkap.
- Observability dasar (log terstruktur, health check).

## Phase 1: Profil dan CV

Target: user bisa mengisi data diri, mengunggah CV lama (opsional), dan
mengunduh CV PDF tanpa bergantung pada AI.

- Onboarding wizard per bagian dengan autosave.
- CRUD profil: data pribadi, pendidikan, pengalaman, skill, sertifikasi, bahasa.
- Validasi zod di API dan form.
- Template CV A (fresh graduate) dan B (berpengalaman).
- Renderer `@react-pdf/renderer`, preview, dan download.
- Versioning resume (`resumes.version`).
- Unit test untuk validator dan renderer.
- **Upload CV lama (opsional):** PDF/DOCX maks 10 MB, disimpan di
  `/data/cv/<user_id>/<uuid>` dengan retensi 30 hari.
- **CV parsing Phase 1 (opsional, butuh consent):** ekstraksi teks
  (`pdfjs-dist`, `mammoth`) lalu job `cv.parse` ke Ollama `qwen3:4b`; hasil
  masuk `cv_parse_suggestions` dan wajib di-review user sebelum masuk profil.
- **Consent flow:** checkbox terpisah, terversi (`CV_AI_CONSENT_VERSION`),
  dicek server-side (403 bila tidak ada), dapat dicabut.
- **Fallback manual penuh:** Ollama down/timeout/JSON invalid → user diarahkan
  ke form manual tanpa blokir; PDF scan ditandai `skipped`.
- Worker `cv.cleanup` harian untuk menghapus file CV > 30 hari.

## Phase 2: Tahap 1 dan 2 - Scraping Guest dan Pemilihan

Target: lowongan dari Glints, Jobstreet, dan LinkedIn tampil di dashboard dan
bisa diantrekan.

**Runner dan ingest**

- `apps/runner`: bootstrap, konfigurasi, token runner, task scheduler OS.
- Endpoint `/api/runner/tasks`, `/api/runner/jobs`, `/api/runner/tasks/:id/result`.
- Worker `runner.plan` dan `jobs.ingest` (normalisasi, dedupe, snapshot).
- Adapter Playwright guest: **Glints**, **Jobstreet**, **LinkedIn** (halaman
  pencarian publik). Fixture test untuk masing-masing.
- Pembatas: kuota 10/platform/hari, jeda acak, deteksi blokir, sekuensial.
- `collector_runs` dan halaman status runner.
- Deteksi `apply_channel` dan ekstraksi email HR dari deskripsi.
- Cadangan manual: URL, teks, dan CSV.

**Minat dan dashboard**

- Master `interests`, `user_interests`, dan `user_platforms`.
- API dan halaman jobs: list, filter, detail, banner snapshot H-1 + fallback,
  status per platform.
- Pemilihan lowongan dan `POST /api/applications` (status `queued`).
- Batas harian antrean dan pencegahan lamaran ganda.

## Phase 3: Matching

Target: setiap lowongan punya skor yang bisa dijelaskan.

- Rules engine dengan bobot 40/25/15/10/10.
- Skill dictionary dan ekstraksi requirement dari deskripsi lowongan.
- `breakdown_json` per komponen skor.
- Worker `matching.compute` setelah ingest.
- UI menampilkan skor dan alasan (matched/missing).
- Unit test untuk setiap komponen skor.

## Phase 4: Tahap 3 - Antrean Persiapan

Target: lowongan yang diantrekan otomatis menjadi paket lamaran `ready`.

- Worker `application.prepare` berurutan dengan retry.
- CV khusus lowongan (pilih dan urutkan data profil).
- Template cover letter (5 varian), subject/body email, pesan reach-out HR.
- `portal_answers`: UI pengisian jawaban form (gaji, relokasi, notice period).
- Pencocokan pertanyaan form dengan `portal_answers`; sisanya `needs_user`.
- Editor draft, pengaturan `review_before_send`, dan halaman review.
- Audit trail setiap perubahan draft dan status.

## Phase 5: Tahap 4a - Email HR

Target: lamaran ber-email HR terkirim otomatis dan statusnya terlacak.

- OAuth Gmail dan penyimpanan token terenkripsi.
- Worker `email.send` dengan jeda acak dan lampiran CV PDF.
- Batas email harian dan kill switch pengiriman.
- Penyimpanan message ID, `tracking_events`, dan `inbox.sync` (deteksi balasan).
- Halaman riwayat lamaran.

## Phase 6: Portal, Easy Apply, dan Peningkatan CV Parsing

Target: Local Runner mengisi form portal dan berhenti sebelum Submit, serta
akurasi parsing CV ditingkatkan.

**Portal & Easy Apply**

- `runner_tasks` dan handler `portal.apply` di Runner.
- Profil browser per user; alur login manual satu kali dan pemeriksaan
  `session_status`.
- Pengisi form per platform: Glints, Jobstreet, LinkedIn Easy Apply.
- Unggah CV via URL bertanda tangan berumur pendek.
- Mode default berhenti sebelum Submit; `PORTAL_AUTO_SUBMIT` opsional per user.
- Penanganan CAPTCHA, verifikasi, dan pertanyaan tak dikenal (`needs_user`).
- `runner.watchdog` untuk tugas menggantung.
- Mode "hanya link" untuk lowongan tanpa adapter.

**Peningkatan CV Parsing (v2)**

- Section-wise chunking dengan prompt terpisah per bagian dan `num_ctx` efisien.
- `confidence` dan `source_snippet` per saran agar user mudah memverifikasi.
- Prompt/Modelfile tuning + evaluasi F1 ekstraksi field (lihat
  [evaluation.md](evaluation.md)).
- Review UI yang menampilkan diff per field dan bulk accept/reject.
- (Opsional) LoRA/QLoRA hanya jika baseline prompt terbukti tidak cukup.

## Phase 7: Peningkatan Opsional

Target: kualitas dan cakupan, tanpa mengubah arsitektur inti.

- Toggle `AI_ENABLED` per environment dan kill switch AI.
- Eval set dan harness di `tests/eval` (lihat [evaluation.md](evaluation.md)).
- Perbandingan kualitas teks template vs LLM.
- Adapter Glassdoor (best effort) dan situs lain.
- ATS publik (Greenhouse, Lever, Ashby, Workable) via HTTP.
- pgvector untuk semantic matching.
- Fine-tune embedding (lihat [ai-training.md](ai-training.md)).
- Dashboard statistik dan export data lamaran.

### Prasyarat Sebelum Training Model

Training LLM baru (LoRA/QLoRA) dipertimbangkan hanya jika seluruh syarat berikut
terpenuhi:

- [ ] Eval set 50-100 contoh sudah ada dan versi-nya terkunci.
- [ ] Baseline prompt + `qwen3:4b` dan template sudah diukur (F1 per field,
      hallucination rate, latency p95).
- [ ] Dataset minimal 300 contoh berkualitas, sudah dianonimisasi, dan memiliki
      consent `ai_training_opt_in`.
- [ ] Ada bukti bahwa perbaikan prompt/Modelfile tidak lagi cukup.
- [ ] Ada rencana rollback dan model champion tetap tersedia.

Jika salah satu belum terpenuhi, jangan mulai training.

## Definition of Done MVP

- [ ] User bisa daftar, mengisi profil, dan mengunduh CV PDF tanpa AI.
- [ ] User dapat mengunggah CV lama dan memilih parsing otomatis (opt-in) atau
      input manual; tanpa consent API parsing menolak (403).
- [ ] Saran hasil parsing wajib di-review user sebelum masuk profil.
- [ ] File CV unggahan terhapus otomatis setelah 30 hari (`cv.cleanup`).
- [ ] Ollama offline tidak memblokir onboarding: form manual dan draf template
      tetap bekerja.
- [ ] Local Runner mengambil lowongan guest dari Glints, Jobstreet, dan LinkedIn
      sesuai kuota dan jeda yang ditetapkan.
- [ ] Platform yang terblokir tercatat dan tidak menghentikan platform lain.
- [ ] User melihat lowongan snapshot H-1 sesuai minat, dengan fallback jelas.
- [ ] Setiap lowongan punya skor, alasan skor, dan channel apply.
- [ ] User dapat mengantrekan lowongan dan antrean menjadi `ready` otomatis.
- [ ] Lamaran email HR terkirim via Gmail setelah antrean berjalan.
- [ ] Lamaran portal terisi otomatis dan berhenti sebelum Submit.
- [ ] Pertanyaan sensitif tidak pernah dijawab LLM; sumbernya `portal_answers`.
- [ ] Semua perubahan status tercatat di `tracking_events` dan `audit_log`.
- [ ] `AI_ENABLED=false` tidak memunculkan error apa pun.
- [ ] Server tidak menyimpan password atau cookie platform.
- [ ] Backup harian terenkripsi dan sudah diuji restore.
- [ ] Tidak ada secret di repository; `.env.example` lengkap.
- [ ] Migration berhasil dari database kosong.

## Batas MVP yang Tidak Termasuk

- Scraping dengan akun login, CAPTCHA solver, atau rotasi proxy.
- Menyimpan password atau cookie platform di server.
- Auto-submit portal sebagai perilaku default.
- Mengirim pesan reach-out di dalam platform secara otomatis (disiapkan saja,
  dikirim manual).
- Auto-send email tanpa antrean yang dipilih user.
- Multi-tenant, billing, dan langganan.
- Aplikasi mobile native.
- Self-learning dari data rahasia tanpa kontrol.
- Pengirim email masal atau kampanye spam.
- Menjawab interview atau negosiasi sepenuhnya tanpa review.

## Estimasi

| Fase | Estimasi |
|---|---|
| Phase 0 | 1-2 hari |
| Phase 1 | 3-4 hari |
| Phase 2 | 5-7 hari |
| Phase 3 | 2-3 hari |
| Phase 4 | 3-4 hari |
| Phase 5 | 2-3 hari |
| Phase 6 | 4-6 hari |
| Phase 7 | bertahap |

Total MVP realistis untuk dua orang: sekitar 4-5 minggu. Phase 2 dan Phase 6
paling berisiko karena bergantung pada struktur halaman platform.

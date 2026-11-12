# Arsitektur Sistem

Alur produk 4 tahap dijelaskan di [workflow.md](workflow.md). Dokumen ini
menjelaskan komponen teknis yang menjalankannya.

## Ringkasan Keputusan

| Aspek | Keputusan |
|---|---|
| Model produk | Proyek personal, tim internal (2 orang), target 10 user dalam 3 bulan |
| Hosting server | Satu Oracle Cloud Always Free VM (Ampere A1 ARM, **4 OCPU / 24 GB RAM**) |
| Scraping & isi form portal | **Local Runner** di laptop/PC anggota tim (IP residensial) |
| Browser automation | Playwright deterministik; agent browser hanya untuk authoring adapter |
| Mode scraping | Guest (tanpa login), maks 10 lowongan/platform/hari, jeda acak |
| Frontend + API | Next.js 15 App Router + TypeScript (standalone output) |
| Database | Supabase Postgres terkelola (ADR-026); akses lewat API + RLS |
| Queue | Tabel antrean di Postgres, di-polling worker; pg-boss menyusul saat butuh throughput tinggi |
| AI | Ollama `qwen3:4b` CPU-only (Docker container internal); parsing CV opsional (butuh persetujuan/consent) & draf teks; fallback manual/template jika down |
| PDF | `@react-pdf/renderer` (tanpa Chromium di VM) |
| Pengiriman | Email HR via Gmail API; portal via Local Runner |
| Privasi | Data kandidat tidak dikirim ke provider AI pihak ketiga |
| Biaya | $0/bulan |

## Prinsip Arsitektur

1. **Template-first, rules-first, AI-last.** Seluruh fitur inti berjalan dengan
   `AI_ENABLED=false` atau ketika Ollama sedang offline/down. AI berfungsi
   sebagai akselerator (ekstraksi saran profil dan variasi teks lamaran), bukan
   fondasi wajib.
2. **LLM tidak pernah mengirim apa pun.** Pengiriman dilakukan adapter: Gmail
   API (email) dan Playwright di Local Runner (portal).
3. **Data kandidat tidak keluar ke provider AI pihak ketiga.** Inferensi AI
   hanya melalui Ollama lokal di dalam jaringan privat Docker internal VM.
   Pemrosesan CV/profil oleh Ollama wajib didahului persetujuan (consent)
   eksplisit dari user. Penyimpanan data memakai Supabase sebagai pemroses data
   (ADR-026); tidak ada data yang dikirim ke layanan AI komersial.
4. **Scraping dan interaksi portal berjalan di Local Runner**, bukan di VM, agar
   memakai IP residensial dan sesi login tidak pernah meninggalkan perangkat
   user.
5. **Server tidak menyimpan password atau cookie platform.**
6. **Lowongan disajikan sebagai snapshot harian.** User yang login hari ini
   melihat data hari sebelumnya (H-1).
7. **Pekerjaan berat asynchronous dijalankan worker.** Phase 1 memakai tabel
   antrean di Postgres yang di-polling worker; pg-boss ditambahkan saat job
   membutuhkan retry terjadwal dan volume tinggi.
8. **Manusia tetap otoritas akhir.** User memilih lowongan (tahap 2), meninjau
   saran parsing CV sebelum masuk profil, dapat me-review draf, dan menekan
   Submit pada portal secara default.

## Gambaran Besar

```text
  Laptop/PC anggota tim (IP rumah/kantor)
  +----------------------------------------------+
  |  Local Runner (Node + Playwright)            |
  |   - Tahap 1: scraping guest                  |
  |   - Tahap 4b: isi form portal                |
  |   - Profil browser lokal (login manual user) |
  +----------------------+-----------------------+
                         |  pull tugas / kirim hasil (HTTPS + token)
                         v
              Cloudflare Tunnel (HTTPS, tanpa membuka port)
                         |
  +----------------------v------------------------------------+
  |      Oracle Free VM - Ampere A1 (4 OCPU / 24 GB RAM)      |
  |                                                           |
  |  [web]     Next.js        UI + Route Handlers + Auth      |
  |  [worker]  Node           cv.parse & job lain (polling)   |
  |  [ollama]  qwen3:4b       container internal (port 11434) |
  |  [caddy]   reverse proxy  internal                        |
  |  /data     /data/cv (retensi 30 hr), /data/resumes        |
  +-------------+----------------------------+-----------------+
                |                            |
    HTTPS: Auth + Postgres (RLS)             | outbound: Gmail API
                v                            v
        Supabase (managed)               Gmail API
```

## Komponen

### Web (Next.js)

- Autentikasi dan session (Supabase Auth via `@supabase/ssr`, cookie httpOnly).
- Onboarding: data diri, CV, interest, platform, koneksi Gmail.
- Dashboard lowongan snapshot H-1 dengan skor dan channel apply.
- Pemilihan lowongan dan antrean apply (tahap 2).
- Review draft, status antrean, riwayat lamaran.
- Endpoint khusus Local Runner (`/api/runner/*`).
- Halaman admin ringan: status runner, `collector_runs`, kill switch.

### Worker (Node)

| Handler | Tugas | Pemicu |
|---|---|---|
| `jobs.ingest` | Normalisasi, dedupe, simpan job + snapshot, deteksi channel | Runner mengirim hasil |
| `matching.compute` | Hitung skor semua user aktif terhadap snapshot | Setelah ingest |
| `runner.plan` | Menyusun rencana pencarian harian untuk Runner | Harian |
| `cv.parse` | Ekstraksi teks CV unggahan via Ollama per bagian menjadi saran profil | User mengunggah CV + consent |
| `cv.cleanup` | Hapus file CV mentah yang telah berusia > 30 hari | Harian |
| `application.prepare` | Membuat CV khusus lowongan dan teks lamaran | Antrean `queued` |
| `email.send` | Kirim via Gmail API dengan jeda acak | Aplikasi `ready` channel email |
| `inbox.sync` | Deteksi balasan | Berkala |
| `runner.watchdog` | Tandai runner mati, kembalikan tugas portal yang menggantung | Berkala |

Worker berjalan sebagai proses Node terpisah dan memakai secret key Supabase
(bypass RLS) untuk membaca serta menulis tabel antrean. Phase 1 memakai polling
`cv_parse_runs`; pg-boss ditambahkan saat job membutuhkan retry terjadwal dan
volume tinggi. Worker memakai retry dengan backoff, idempotency key per task,
dan dead-letter queue.

### Local Runner

Proses Node mandiri yang dijalankan di laptop/PC anggota tim.

| Tugas | Keterangan |
|---|---|
| `scrape.daily` | Tahap 1. Mengambil rencana dari VM, scraping guest per platform, kirim hasil |
| `portal.apply` | Tahap 4b. Mengisi form portal memakai profil browser lokal user |

Karakteristik:

- **Pull-based.** Runner yang menghubungi VM (`GET /api/runner/tasks`), bukan
  sebaliknya. Tidak ada port terbuka di laptop.
- **Autentikasi runner.** Token per runner (`RUNNER_TOKEN`), disimpan hash di
  database, dapat dicabut.
- **Profil browser terpisah**: `profile-guest` (tanpa login, untuk scraping) dan
  `profile-<user>` (login manual user, untuk portal). Profil guest tidak pernah
  berisi sesi login.
- **Penjadwalan.** Task scheduler OS (Windows Task Scheduler / cron) menjalankan
  `pnpm runner:daily` sekali sehari. Jika laptop mati, run hari itu terlewat dan
  UI memakai fallback snapshot.
- **Pembatas.** Kuota harian, jeda acak, berhenti saat blokir, satu browser
  sekuensial.
- Kode berada di `apps/runner` (lihat struktur repository di
  [setup.md](setup.md)).

Detail alur ada di [workflow.md](workflow.md) dan aturan sumber di
[sources.md](sources.md).

### Supabase Postgres

- Sumber kebenaran tunggal ada di Supabase Postgres (project terkelola).
- Autentikasi user berada di schema `auth` (Supabase Auth); data aplikasi di
  schema `public`.
- RLS aktif pada semua tabel `public`. User hanya dapat membaca dan mengubah
  barisnya sendiri; operasi lintas user (worker, upload CV, audit log) memakai
  secret key di server.
- `pgcrypto` tersedia untuk enkripsi kolom sensitif; `pgvector` untuk semantic
  matching (fase lanjutan).
- Migration berupa SQL di `migrations/`, diterapkan lewat Supabase MCP / CLI,
  bukan `drizzle-kit`.

### Ollama (Service AI Internal)

- Berjalan sebagai container Docker resmi (`ollama/ollama:latest`) di dalam
  jaringan internal yang sama dengan web dan worker.
- Model default: `qwen3:4b` (quantized `Q4_K_M`), parameter `num_ctx=8192`.
- Digunakan untuk:
  1. `cv.parse`: mengekstrak informasi profil dari CV lama user menjadi format
     JSON terstruktur (hanya dengan consent aktif).
  2. `application.prepare`: menyusun teks cover letter, draf email, dan pesan
     reach-out HR.
- **Batasan Resource Container:**
  - `cpus: "1.5"` dan `mem_limit: 5g` agar tidak mengganggu Next.js dan Postgres.
  - `OLLAMA_NUM_PARALLEL: 1` untuk eksekusi sekuensial hemat CPU.
  - Mode thinking dimatikan (`/no_think`) pada task ekstraksi untuk efisiensi latensi.
- **Prinsip Fallback Penuh:**
  - Jika container Ollama tidak merespons, timeout (>180 detik), atau
    menghasilkan format tidak valid:
    - Pada `cv.parse`: status ditandai `failed`, UI menampilkan notifikasi ramah,
      dan mengarahkan user untuk mengisi form profil secara manual.
    - Pada `application.prepare`: sistem langsung beralih ke generator draf
      berbasis template tanpa menimbulkan error ke pengguna.

### Penyimpanan File

- Direktori `/data/cv` di VM: menyimpan file CV mentah yang diunggah user
  (`uploaded_cvs`), dihapus otomatis setelah 30 hari.
- Direktori `/data/resumes` di VM: menyimpan file PDF CV hasil render template
  internal (`@react-pdf/renderer`) untuk dikirim ke perusahaan.
- Runner mengunduh PDF CV dari VM saat `portal.apply` melalui URL bertanda
  tangan berumur pendek (15 menit), lalu menghapus salinan lokalnya setelah
  selesai.

## Model Data

```text
auth.users          id, email, encrypted_password, created_at (dikelola Supabase Auth)
user_consents       id, user_id, kind(privacy|cv_ai_processing|ai_training_opt_in),
                    version, accepted_at, revoked_at, user_agent_hash
profiles            user_id, full_name, phone, address, birth_date, headline, summary,
                    linkedin_url, portfolio_url, expected_salary, availability,
                    onboarding_step, onboarding_completed_at
educations          profile_id, level, institution, major, gpa, start_year, end_year
experiences         profile_id, company, title, employment_type, start_date,
                    end_date, is_current, description
experience_points   experience_id, content, sort_order
skills              profile_id, name, level, years
certifications      profile_id, name, issuer, year, credential_url
languages           profile_id, name, proficiency

uploaded_cvs        id, user_id, file_path, original_filename, mime, size_bytes,
                    sha256, text_content, status(uploaded|extracted|skipped),
                    created_at, delete_after
cv_parse_runs       id, uploaded_cv_id, user_id, section(identity|experiences|
                    educations|skills), model, consent_version,
                    status(pending|running|parsed|failed|skipped),
                    duration_ms, output_json, error_code, attempts,
                    created_at, started_at, finished_at
cv_parse_suggestions id, parse_run_id, user_id, section, field_path,
                    value_json, confidence, source_snippet,
                    status(pending|accepted|rejected), decided_at

interests           id, slug, label
user_interests      user_id, interest_id
user_platforms      user_id, platform, enabled, session_status
                    (none|logged_in|expired), last_checked_at
portal_answers      user_id, key, question_pattern, answer, updated_at
                    (mis. expected_salary, relocation, notice_period)
user_settings       user_id, review_before_send, portal_auto_submit,
                    apply_daily_limit

job_sources         id, platform, type(guest_scrape|feed|api|manual), name,
                    config_json, enabled
jobs                id, source_id, external_id, title, company, location,
                    work_mode, salary_min, salary_max, description, url,
                    posted_at, first_seen_at, last_seen_at, raw_hash
job_urls            job_id, platform, url, apply_channel
                    (email|easy_apply|portal|link)
job_contacts        job_id, hr_email, source(description|manual)
job_snapshots       id, job_id, snapshot_date, UNIQUE(job_id, snapshot_date)
job_requirements    job_id, skill, requirement_type(must|nice), weight
collector_runs      id, runner_id, platform, run_date, started_at, finished_at,
                    found, new, skipped_known, blocked, error_count, last_error
runners             id, user_id, name, token_hash, last_seen_at, revoked_at

matches             user_id, job_id, score, breakdown_json, computed_at
resumes             id, user_id, version, application_id(nullable), data_json,
                    pdf_path, template, created_at
applications        id, user_id, job_id, channel, status, match_score,
                    resume_id, draft_id, recipient_email, last_error,
                    queued_at, ready_at, sent_at, replied_at
drafts              id, application_id, source(template|llm), subject, body,
                    cover_letter, reach_out_message, form_answers_json,
                    model, prompt_version, edited_by_user
runner_tasks        id, runner_id, application_id, type(portal.apply),
                    status, payload_json, result_json, claimed_at, finished_at
email_accounts      user_id, provider, access_token_enc, refresh_token_enc,
                    expires_at
tracking_events     application_id, event_type, payload_json, created_at
audit_log           actor_id, action, entity, entity_id, meta_json, ip, created_at
```

Catatan desain:

- `uploaded_cvs` adalah file CV mentah yang diunggah user (sumber ekstraksi),
  sedangkan `resumes` adalah CV PDF yang digenerate sistem menggunakan template.
- `cv_parse_suggestions` menampung usulan field hasil parsing LLM. Data profil
  hanya terupdate jika user menyetujui (accept/merge) saran tersebut.
- `user_consents` mencatat riwayat persetujuan eksplisit user untuk pemrosesan AI.
- `jobs` adalah master lowongan; `job_snapshots` mencatat lowongan yang terlihat
  pada tanggal tertentu (dasar logic H-1).
- Satu lowongan dapat punya beberapa `job_urls` dari platform berbeda; channel
  terbaik dipilih saat antrean dibuat.
- `portal_answers` menyimpan jawaban pertanyaan form yang sensitif. LLM tidak
  boleh menebak nilainya.
- `user_platforms.session_status` hanya status (tidak ada cookie/password).
  Runner yang memeriksa dan melaporkannya.
- `matches` dihitung terhadap snapshot, bukan query realtime.
- `drafts.source` mencatat asal teks (template atau LLM).

## Pipeline Onboarding & CV Parsing (Opsional)

Pipeline ini dijalankan saat user baru mendaftar atau ingin memperbarui profil
menggunakan berkas CV lama:

```text
User buka Onboarding / Edit Profil
   |
   +--> Jalur A (Manual): User langsung mengisi form wizard per bagian
   |
   +--> Jalur B (Unggah CV + Parsing AI Internal):
        1. User mengunggah file CV (PDF/DOCX maks 10MB)
        2. User mencentang persetujuan pemrosesan AI (user_consents dicatat)
        3. Server menyimpan file ke /data/cv/<user_id>/<uuid> (retensi 30 hari)
        4. Ekstraksi teks lokal berbasis kode:
             - pdfjs-dist untuk PDF
             - mammoth untuk DOCX
             - jika tidak ada layer teks (scan image) -> status 'skipped',
               notifikasi: "PDF hasil scan, silakan isi data diri manual"
        5. Insert baris `cv_parse_runs` (status `pending`); worker polling
           mengambilnya lewat secret key Supabase
        6. Worker cv.parse memanggil Ollama qwen3:4b di container:
             - Prompt terstruktur per bagian (identity, experiences,
               educations, skills) dengan parameter /no_think & format json
             - Validasi skema output menggunakan zod
        7. Simpan hasil parsing ke cv_parse_suggestions (status = 'pending')
        8. User membuka halaman Review Profil:
             - Menampilkan diff: data saat ini vs saran ekstraksi AI
             - User memilih: "Terima Semua", "Terima Per Bagian", atau "Tolak"
        9. Hanya saran yang di-accept yang disimpan ke tabel profiles,
           educations, experiences, dan skills.
```

### Mekanisme Circuit Breaker & Fallback CV Parsing

| Kondisi | Respon Sistem |
|---|---|
| Ollama container offline / healthcheck gagal | Service worker menandai job `failed`; UI memberitahu: "Layanan ekstraksi otomatis sedang offline, silakan isi form secara manual." Form manual langsung aktif. |
| Timeout inferensi (> 180 detik) | Worker retry 1 kali. Jika tetap timeout, tandai `failed` dan arahkan ke form manual. |
| Output LLM bukan JSON valid | Retry 1 kali dengan prompt perbaikan. Jika gagal, tandai `failed` dan fallback ke input manual. |
| PDF scan (teks < 50 karakter) | Ditandai `skipped` tanpa memanggil LLM untuk menghemat resource CPU. |
| User mencabut consent | Job dibatalkan, suggestions dihapus, file CV dijadwalkan hapus. |
| Error beruntun (3 kali dalam 5 menit) | Circuit breaker aktif: job `cv.parse` berikutnya ditunda 10 menit untuk mencegah lonjakan CPU. |

## Pipeline Tahap 1 - Ingest Lowongan

```text
Runner (harian, guest)
   |  GET /api/runner/tasks   -> rencana pencarian + kuota
   |  scraping Playwright, jeda acak, berhenti saat blokir
   |  POST /api/runner/jobs   -> batch RawJob + ringkasan run
   v
VM: jobs.ingest
   |  validasi zod, bersihkan HTML, normalisasi
   |  dedupe: (platform, external_id) -> url kanonik -> raw_hash
   |  upsert jobs, job_urls, job_contacts (email HR dari deskripsi)
   |  insert job_snapshots(snapshot_date = tanggal ambil)
   |  tentukan apply_channel
   v
matching.compute untuk semua user aktif
```

Jika Runner tidak berjalan, `job_sources` bertipe `manual` (URL/teks/CSV) tetap
dapat dipakai sebagai cadangan.

### Logic H-1

```text
GET /api/jobs
  target = today - 1
  rows   = job_snapshots WHERE snapshot_date = target
           AND job cocok dengan user_interests user
  jika kosong:
     pakai snapshot_date terakhir yang tersedia
  response menyertakan meta:
     { snapshotDate, isFallback, lastRunAt, platformStatus }
```

`platformStatus` menampilkan platform mana yang terblokir atau tidak berjalan
pada run terakhir, sehingga user paham kenapa lowongan platform tertentu sedikit.

## Pipeline Tahap 2 - Antrean

```text
User centang lowongan -> POST /api/applications
   |  cek: belum pernah dilamar, batas harian, channel tersedia
   v
applications(status = queued, channel = terbaik)
   |
   v
enqueue application.prepare
```

## Pipeline Tahap 3 - Persiapan

```text
application.prepare (satu per satu)
   |  status = preparing
   |
   +-- CV: pilih template, urutkan skill/pengalaman paling relevan
   |        -> render PDF -> resumes(application_id)
   |
   +-- Teks: AI_ENABLED=false -> template
   |         AI_ENABLED=true  -> Ollama -> validasi zod -> fallback template
   |         menghasilkan cover_letter, subject/body email,
   |         reach_out_message, form_answers_json
   |
   +-- Form portal: cocokkan pertanyaan dengan portal_answers
   |         pertanyaan tanpa jawaban -> needs_user
   v
status = ready | needs_user
```

CV khusus lowongan hanya memilih dan mengurutkan data profil. Tidak ada fakta
baru yang ditulis.

### Kontrak teks

```ts
type DraftResult = {
  subject: string
  body: string
  cover_letter: string
  reach_out_message: string
  form_answers: Record<string, string>
  matching_points: string[]
  missing_requirements: string[]
  facts_to_verify: string[]
  source: 'template' | 'llm'
  model?: string
}
```

Pertanyaan sensitif (gaji, relokasi, masa notice, tahun pengalaman spesifik)
selalu bersumber dari `portal_answers`, tidak dari LLM.

## Pipeline Tahap 4 - Eksekusi

### Email HR

```text
applications(channel = email, status = ready, review selesai jika diaktifkan)
   |  email.send dijadwalkan, jeda acak 3-10 menit antar email
   |  Gmail API (akun user), lampiran CV PDF
   |  simpan message ID -> status sent
   v
inbox.sync -> deteksi balasan -> status replied
```

### Portal / Easy Apply

```text
applications(channel = easy_apply | portal, status = ready)
   |  worker membuat runner_tasks(type = portal.apply)
   v
Runner menarik tugas (GET /api/runner/tasks)
   |  unduh CV via URL bertanda tangan
   |  buka lowongan dengan profil browser lokal user
   |  isi field dari profil + form_answers
   |  mode default: berhenti sebelum Submit (needs_user = menunggu klik user)
   |  mode auto (PORTAL_AUTO_SUBMIT=true): Submit hanya jika semua field terisi
   |  POST /api/runner/tasks/:id/result  (sent | needs_user | failed)
   v
worker memperbarui applications + tracking_events
```

Jika Runner tidak mengambil tugas dalam 24 jam, `runner.watchdog` menandai
`needs_user` dengan pesan "Runner tidak aktif".

## Pipeline Matching (Rules)

```text
40%  Skill wajib
25%  Pengalaman relevan
15%  Lokasi dan preferensi kerja
10%  Pendidikan
10%  Industri atau bidang perusahaan
```

`breakdown_json` menyimpan alasan setiap komponen agar UI dapat menjelaskannya.
Skor adalah ranking awal, bukan keputusan otomatis.

## Keamanan

- Session dikelola Supabase Auth; cookie di-set lewat `@supabase/ssr`
  (`httpOnly`, `secure`, `sameSite=lax`).
- Password di-hash dan disimpan oleh Supabase Auth, bukan oleh aplikasi.
- Token OAuth Gmail dienkripsi at-rest (`pgcrypto`); kunci di env.
- **Token runner** disimpan sebagai hash, dapat dicabut, dibatasi pada endpoint
  `/api/runner/*` saja.
- Endpoint runner dibatasi rate limit dan hanya menerima payload tervalidasi zod.
- Data hasil scraping diperlakukan sebagai **untrusted input**: HTML
  dibersihkan, teks lowongan tidak boleh mengubah instruksi LLM.
- Server tidak menyimpan password atau cookie platform; sesi login hanya ada di
  profil browser lokal Runner.
- Profil browser Runner berada di disk perangkat user; disarankan enkripsi disk.
- Rate limit pada login, persiapan antrean, dan pengiriman email.
- Kill switch global untuk scraping, email, dan portal.
- Semua perubahan status masuk `tracking_events` dan `audit_log`.
- Log tidak memuat isi CV, token, atau alamat email lengkap.
- Data di Supabase dilindungi RLS per user; secret key hanya ada di server dan
  tidak pernah dikirim ke browser.

Detail ada di [privacy.md](privacy.md).

## Deployment

VM (Docker Compose di Oracle Cloud Always Free 4 OCPU / 24 GB RAM):

```text
  - web       (Next.js standalone, port 3000 internal)
  - worker    (Node, cv.parse polling)
  - ollama    (ollama/ollama:latest, qwen3:4b, port 11434 internal, cpus: 1.5, mem_limit: 5g)
  - caddy     (reverse proxy internal)

Cloudflare Tunnel -> caddy -> web
web/worker -> Supabase (Auth + Postgres, HTTPS)
```

Database, autentikasi, dan backup tidak lagi berjalan di VM; ketiganya menjadi
tanggung jawab Supabase (ADR-026).

Alokasi Resource di VM (24 GB RAM / 4 OCPU):

| Service | Alokasi RAM | Alokasi CPU | Catatan |
|---|---|---|---|
| Next.js Web | 1 - 2 GB | 0.5 OCPU | Standalone build |
| Worker (Node) | 1 - 2 GB | 0.5 OCPU | Ingest, matching, cv.parse, dispatch |
| Ollama Container | 4 - 5 GB | 1.5 OCPU | qwen3:4b Q4_K_M, concurrency 1 |
| OS & Swap Buffer | sisa RAM | 1.0 OCPU | Ruang bebas sistem, caching I/O |

Supabase free tier menangani database, autentikasi, dan backup di luar VM;
kuota gratisnya membatasi koneksi dan dapat di-pause saat idle.

Laptop/PC anggota tim:

```text
  - Local Runner (pnpm runner:daily, dijadwalkan OS)
  - Chromium Playwright + profil browser lokal
```

Langkah lengkap ada di [setup.md](setup.md).

## Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Kapasitas Oracle Free ARM habis saat signup | Coba beberapa region; sementara jalankan lokal + Cloudflare Tunnel |
| Akun Oracle di-reclaim karena idle | Monitoring ringan + script utilitas reguler + backup otomatis |
| Ollama memakan CPU tinggi saat inferensi | Docker pinning `cpus: "1.5"`, `OLLAMA_NUM_PARALLEL=1`, queue background |
| Ollama offline / kehabisan memori | Healthcheck Docker otomatis restart; fallback instan ke input manual / template |
| IP rumah terkena CAPTCHA/blokir | Volume rendah (10/platform/hari), jeda acak manusia, berhenti saat blokir |
| Struktur halaman platform berubah | Fixture test, alert success rate < 80% |
| Laptop runner mati | Fallback snapshot H-1 terakhir + watchdog + CSV/URL manual |
| Auto-submit portal salah isi | Default berhenti sebelum Submit; pertanyaan sensitif dari `portal_answers` |
| Sesi login platform dicurigai | Satu lamaran sekaligus, jeda acak, login manual oleh user |
| Hasil scraping memuat instruksi berbahaya | Treat as untrusted; sanitasi; LLM tidak punya tool |
| Data CV mentah tersimpan terlalu lama | Kebijakan retensi 30 hari + cron job `cv.cleanup` harian |
| Data CV sensitif bocor ke pihak ketiga | Dilarang memakai API komersial; Ollama internal di container localhost |
| Supabase free tier di-pause saat idle | Worker menangani kegagalan koneksi dengan retry; monitoring uptime + rencana upgrade |

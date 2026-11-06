# Arsitektur Sistem

Alur produk 4 tahap dijelaskan di [workflow.md](workflow.md). Dokumen ini
menjelaskan komponen teknis yang menjalankannya.

## Ringkasan Keputusan

| Aspek | Keputusan |
|---|---|
| Model produk | Proyek personal, tim internal (2 orang), target 10 user dalam 3 bulan |
| Hosting server | Satu Oracle Cloud Always Free VM (ARM, 2 OCPU / 12 GB) |
| Scraping & isi form portal | **Local Runner** di laptop/PC anggota tim (IP residensial) |
| Browser automation | Playwright deterministik; agent browser hanya untuk authoring adapter |
| Mode scraping | Guest (tanpa login), maks 10 lowongan/platform/hari, jeda acak |
| Frontend + API | Next.js 15 App Router + TypeScript (standalone output) |
| Database | PostgreSQL 16 self-host di VM |
| Queue | pg-boss (berbasis PostgreSQL, tanpa Redis) |
| AI | Ollama `qwen3:4b` CPU-only, **opsional**; hanya menyusun teks |
| PDF | `@react-pdf/renderer` (tanpa Chromium di VM) |
| Pengiriman | Email HR via Gmail API; portal via Local Runner |
| Privasi | Data kandidat tidak dikirim ke provider AI pihak ketiga |
| Biaya | $0/bulan |

## Prinsip Arsitektur

1. **Template-first, rules-first, AI-last.** Seluruh fitur inti berjalan dengan
   `AI_ENABLED=false`. LLM hanya menyusun teks lamaran.
2. **LLM tidak pernah mengirim apa pun.** Pengiriman dilakukan adapter: Gmail
   API (email) dan Playwright di Local Runner (portal).
3. **Data kandidat tidak keluar ke provider AI.** Inferensi hanya lewat Ollama
   lokal.
4. **Scraping dan interaksi portal berjalan di Local Runner**, bukan di VM, agar
   memakai IP residensial dan sesi login tidak pernah meninggalkan perangkat
   user.
5. **Server tidak menyimpan password atau cookie platform.**
6. **Lowongan disajikan sebagai snapshot harian.** User yang login hari ini
   melihat data hari sebelumnya (H-1).
7. **Semua pekerjaan berat asynchronous** lewat queue.
8. **Manusia tetap otoritas akhir.** User memilih lowongan (tahap 2), dapat
   me-review draft, dan menekan Submit pada portal secara default.

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
  +----------------------v-----------------------+
  |          Oracle Free VM - 2 OCPU / 12 GB     |
  |                                              |
  |  [web]     Next.js        UI + Route Handlers|
  |  [worker]  Node + pg-boss ingest, matching,  |
  |                           prepare, email     |
  |  [db]      PostgreSQL 16  data + queue       |
  |  [ollama]  qwen3:4b (opsional)               |
  |  [caddy]   reverse proxy internal            |
  |  /data     PDF, backup                       |
  +----------------------+-----------------------+
                         |
                  outbound: Gmail API
```

## Komponen

### Web (Next.js)

- Autentikasi dan session.
- Onboarding: data diri, CV, interest, platform, koneksi Gmail.
- Dashboard lowongan snapshot H-1 dengan skor dan channel apply.
- Pemilihan lowongan dan antrean apply (tahap 2).
- Review draft, status antrean, riwayat lamaran.
- Endpoint khusus Local Runner (`/api/runner/*`).
- Halaman admin ringan: status runner, `collector_runs`, kill switch.

### Worker (Node + pg-boss)

| Handler | Tugas | Pemicu |
|---|---|---|
| `jobs.ingest` | Normalisasi, dedupe, simpan job + snapshot, deteksi channel | Runner mengirim hasil |
| `matching.compute` | Hitung skor semua user aktif terhadap snapshot | Setelah ingest |
| `runner.plan` | Menyusun rencana pencarian harian untuk Runner | Harian |
| `application.prepare` | Membuat CV khusus lowongan dan teks lamaran | Antrean `queued` |
| `email.send` | Kirim via Gmail API dengan jeda acak | Aplikasi `ready` channel email |
| `inbox.sync` | Deteksi balasan | Berkala |
| `runner.watchdog` | Tandai runner mati, kembalikan tugas portal yang menggantung | Berkala |

Worker memakai retry dengan backoff, idempotency key per task, dan dead-letter
queue dari pg-boss.

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

### PostgreSQL

- Sumber kebenaran tunggal.
- `pgcrypto` untuk enkripsi kolom sensitif.
- `pgvector` untuk semantic matching (fase lanjutan).
- Schema `pgboss` untuk queue.

### Ollama (opsional)

- Model default `qwen3:4b`, `num_ctx=8192`.
- Dipakai hanya di `application.prepare` untuk menyusun teks.
- Tidak pernah memilih lowongan, menentukan skor, atau menekan tombol.
- Gagal/lambat/JSON tidak valid -> fallback template tanpa error ke user.

### Penyimpanan File

Direktori `/data` di VM untuk PDF CV dan lampiran. Metadata di PostgreSQL.
Backup harian dienkripsi lalu dikirim ke object storage gratis.

Runner mengunduh PDF CV dari VM saat `portal.apply` melalui URL bertanda tangan
berumur pendek, lalu menghapus salinan lokalnya setelah selesai.

## Model Data

```text
users               id, email, password_hash, name, role, created_at
profiles            user_id, phone, address, birth_date, headline, summary,
                    linkedin_url, portfolio_url, expected_salary, availability
educations          profile_id, level, institution, major, gpa, start_year, end_year
experiences         profile_id, company, title, employment_type, start_date,
                    end_date, is_current, description
experience_points   experience_id, content, sort_order
skills              profile_id, name, level, years
certifications      profile_id, name, issuer, year, credential_url
languages           profile_id, name, proficiency

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

- Session cookie `httpOnly`, `secure`, `sameSite=lax`.
- Password di-hash argon2id.
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
- Database hanya listen di localhost.

Detail ada di [privacy.md](privacy.md).

## Deployment

VM (Docker Compose):

```text
  - web       (Next.js standalone)
  - worker    (node)
  - db        (postgres:16 + pgvector)
  - ollama    (opsional, profil "ai")
  - caddy     (reverse proxy)

Cloudflare Tunnel -> caddy -> web
```

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
| Akun Oracle di-reclaim karena idle | Monitoring ringan + backup otomatis |
| VM 12 GB tidak cukup saat user bertambah | Pisahkan worker/Ollama ke mesin lain |
| Ollama CPU lambat | Queue + fallback template instan |
| IP rumah terkena CAPTCHA/blokir | Volume rendah, jeda manusia, berhenti saat blokir, fallback snapshot |
| Struktur halaman platform berubah | Fixture test, alert success rate < 80% |
| Laptop runner mati | Fallback snapshot terakhir + watchdog + CSV/URL manual |
| Auto-submit portal salah isi | Default berhenti sebelum Submit; pertanyaan sensitif dari `portal_answers` |
| Sesi login platform dicurigai | Satu lamaran sekaligus, jeda acak, login manual oleh user |
| Hasil scraping memuat instruksi berbahaya | Treat as untrusted; sanitasi; LLM tidak punya tool |
| Data CV sensitif | Enkripsi kolom sensitif, backup terenkripsi, akses DB lokal |

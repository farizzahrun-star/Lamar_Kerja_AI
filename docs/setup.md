# Panduan Setup

## Stack Final

```text
Runtime:        Node.js 22 + TypeScript
Frontend + API: Next.js 15 (App Router, standalone output)
Database:       PostgreSQL 16 (self-host)
Queue:          pg-boss (tanpa Redis)
PDF:            @react-pdf/renderer
Scraping:       Playwright (guest) di Local Runner
Apply:          Gmail API + Playwright (portal) di Local Runner
AI:             Ollama + qwen3:4b (CPU-only, Docker container internal)
Email:          Gmail API (OAuth)
Auth:           Auth.js, credentials
Deploy:         Oracle Cloud Always Free VM (4 OCPU / 24 GB RAM) + Docker Compose + Cloudflare Tunnel
Runner:         Laptop/PC anggota tim (Windows/macOS)
```

Tidak ada Redis, tidak ada API LLM komersial pihak ketiga, dan tidak ada
layanan luar yang menerima data CV kandidat.

## Prasyarat

- Node.js 22 dan pnpm.
- Docker Desktop (untuk PostgreSQL & Ollama lokal) atau PostgreSQL 16 terpasang langsung.
- Git.
- Playwright + Chromium untuk Local Runner (scraping & portal apply).
- Ollama (via Docker compose atau instalasi lokal host).

Anggota tim baru: mulai dari [team-onboarding.md](team-onboarding.md) untuk
checklist hari pertama, access matrix produksi, dan alur kontribusi.

## Setup Lokal

```bash
git clone <repo>
cd Lamar_Kerja_AI
cp .env.example .env
pnpm install
docker compose -f infrastructure/docker-compose.yml up -d db ollama
docker compose -f infrastructure/docker-compose.yml exec ollama ollama pull qwen3:4b
pnpm db:migrate
pnpm dev
```

Aplikasi berjalan di `http://localhost:3000`.

### Menjalankan worker

```bash
pnpm worker:dev
```

Worker dan web menggunakan database yang sama. pg-boss membuat schema `pgboss`
secara otomatis pada eksekusi pertama.

### Menjalankan Local Runner

```bash
pnpm --filter @lamarkerja/runner playwright install chromium
pnpm runner:dev
```

Runner berjalan terpisah dari web dan worker. Detail setup ada di bagian
[Local Runner](#local-runner) di bawah.

### Menjalankan Ollama di Docker

Ollama dijalankan sebagai container resmi di dalam `docker-compose`:

```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: lamarkerja_ollama
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama_models:/root/.ollama
    environment:
      - OLLAMA_NUM_PARALLEL=1
      - OLLAMA_MAX_LOADED_MODELS=1
      - OLLAMA_KEEP_ALIVE=5m
      - OLLAMA_DEBUG=false
    deploy:
      resources:
        limits:
          cpus: "1.5"
          memory: 5G
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

Tarik model `qwen3:4b` sekali di awal:

```bash
docker compose -f infrastructure/docker-compose.yml exec ollama ollama pull qwen3:4b
```

Jika Ollama dimatikan atau offline, seluruh aplikasi tetap berjalan normal:
- Parsing CV otomatis dilewati dan user mengisi form profil secara manual.
- Draf surat lamaran digenerate menggunakan generator template bawaan.

Untuk panduan melatih atau menyesuaikan model AI (`Modelfile`, Qwen3 settings,
evaluasi, fine-tune LoRA/QLoRA), lihat [ai-training.md](ai-training.md) dan
[evaluation.md](evaluation.md).

## Environment Variable

### Aplikasi & Database

```env
# Aplikasi
NODE_ENV=development
APP_URL=http://localhost:3000
SESSION_SECRET=

# Database
DATABASE_URL=postgres://lamarkerja:lamarkerja@localhost:5432/lamarkerja

# Enkripsi token OAuth
EMAIL_ENCRYPTION_KEY=
```

### Local Runner (Scraping & Portal Apply)

```env
# Token komunikasi Runner ke server
RUNNER_TOKEN=

# Rate limits scraping
RUNNER_SCRAPE_LIMIT_PER_PLATFORM=10          # max 10 jobs/platform/day
RUNNER_SCRAPE_DELAY_MIN_MS=20000             # 20 detik minimum
RUNNER_SCRAPE_DELAY_MAX_MS=45000             # 45 detik maksimum

# Rate limits email
RUNNER_EMAIL_LIMIT_PER_USER=10                # max 10 emails/user/day
RUNNER_EMAIL_DELAY_MIN_MS=180000              # 3 menit minimum
RUNNER_EMAIL_DELAY_MAX_MS=600000              # 10 menit maksimum

# Rate limits portal apply
RUNNER_APPLY_LIMIT_PER_USER=10                # max 10 applies/user/day
RUNNER_PORTAL_DELAY_MIN_MS=60000              # 1 menit minimum
RUNNER_PORTAL_DELAY_MAX_MS=180000             # 3 menit maksimum
RUNNER_BROWSER_PROFILES_DIR=./browser-profiles

# Portal apply auto-submit (default false untuk safety)
PORTAL_AUTO_SUBMIT=false

# Server URL yang dapat diakses Runner
RUNNER_SERVER_URL=http://localhost:3000
```

### AI (Ollama Internal)

```env
# Aktifkan integrasi Ollama (default true di docker compose)
AI_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_NUM_CTX=8192
OLLAMA_TIMEOUT_MS=180000

# Versi persetujuan privasi AI untuk CV (wajib cocok dengan user_consents)
CV_AI_CONSENT_VERSION=2026-11-06.v1
```

### Gmail OAuth

```env
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/gmail/callback
```

### Penyimpanan & Backup

```env
# Penyimpanan lokal
STORAGE_DIR=./data

# Backup (opsional)
BACKUP_S3_ENDPOINT=
BACKUP_S3_BUCKET=
BACKUP_S3_ACCESS_KEY=
BACKUP_S3_SECRET_KEY=
BACKUP_ENCRYPTION_KEY=
```

**Catatan:** Jangan commit nilai asli ke Git. `.env.example` hanya berisi nama variabel.

## Perintah Umum

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Jalankan web dalam mode development |
| `pnpm worker:dev` | Jalankan worker dengan watch |
| `pnpm build` | Build Next.js standalone |
| `pnpm db:generate` | Generate migration dari schema |
| `pnpm db:migrate` | Jalankan migration |
| `pnpm db:studio` | Buka Drizzle Studio |
| `pnpm test` | Unit test |
| `pnpm test:e2e` | End-to-end test |
| `pnpm lint` | Lint dan typecheck |

## Local Runner

Local Runner adalah proses terpisah yang berjalan di laptop/PC anggota tim
untuk menjalankan scraping dan portal apply. Runner **tidak** berjalan di VM
Oracle karena:

- Scraping membutuhkan IP residensial (IP datacenter sering diblokir).
- Portal apply membutuhkan sesi browser login yang disimpan di perangkat lokal.

### Setup Runner

1. Install Playwright:

```bash
pnpm --filter @lamarkerja/runner playwright install chromium
```

2. Buat direktori profil browser:

```bash
mkdir -p browser-profiles/profile-guest
mkdir -p browser-profiles/profile-<username>
```

3. Set `RUNNER_TOKEN` di `.env` (sama dengan nilai di server).

4. Jalankan Runner:

```bash
pnpm runner:dev
```

### Menjalankan Runner Harian

Runner dijalankan satu kali per hari secara manual atau via task scheduler
OS:

```bash
pnpm runner:daily
```

Perintah ini akan:
- Mengambil task dari server (`runner_tasks`).
- Menjalankan scraping guest untuk semua platform.
- Menjalankan email apply untuk semua user yang sudah approve.
- Menjalankan portal apply untuk semua user yang sudah approve.
- Menyimpan hasil ke `collector_runs` dan `applications`.

### Task Scheduler Windows

Buka Task Scheduler, buat task baru:

- **Trigger:** Daily, jam 09:00.
- **Action:** Start a program.
  - Program: `pnpm`.
  - Arguments: `runner:daily`.
  - Start in: `D:\Private\Aji\fariz\Lamar_Kerja_AI`.

### Aturan Runner

- Jangan meningkatkan limit scraping/apply di atas nilai default.
- Jangan memakai akun pribadi untuk scraping guest; gunakan `profile-guest`.
- Jangan memaksa melanjutkan jika muncul CAPTCHA atau login wall.
- Untuk portal apply, login manual satu kali di `profile-<username>`.
- Runner tidak menyimpan password atau cookie ke server.

## Urutan Development (sesuai [roadmap.md](roadmap.md))

### Phase 0: Fondasi

1. Scaffold monorepo (`apps/web`, `apps/runner`, `workers`, `packages/*`).
2. Docker Compose untuk PostgreSQL dan environment lokal.
3. Schema database awal dan migration.
4. Auth.js (credentials) dan layout dashboard dasar.

### Phase 1: Profil dan CV

1. Onboarding wizard dan CRUD profil lengkap.
2. Validasi zod di API dan form.
3. Template CV dan renderer PDF (`@react-pdf/renderer`).
4. Preview dan download CV PDF tanpa AI.
5. Upload file CV lama (PDF/DOCX) dengan retensi 30 hari di disk lokal `/data/cv`.
6. Ekstraksi teks lokal (`pdfjs-dist` / `mammoth`) + parsing CV opsional via
   Ollama (`cv.parse`) dengan persetujuan eksplisit (`user_consents`).
7. Tampilan review diff hasil parsing (accept/reject per field) sebelum masuk profil.
8. Fallback penuh: jika Ollama offline/timeout atau file PDF scan, alur otomatis
   beralih ke input manual tanpa memblokir onboarding.

### Phase 2: Tahap 1 dan 2 - Scraping Guest dan Pemilihan

1. `apps/runner` dengan Playwright dan endpoint `/api/runner/*`.
2. Adapter scraping guest untuk Glints, Jobstreet, dan LinkedIn.
3. Worker `runner.plan` dan `jobs.ingest` (normalisasi, dedupe, snapshot H-1).
4. Sumber cadangan manual (URL, teks, CSV).
5. Halaman daftar lowongan dan pemilihan ke antrean (`queued`, maks 10/hari).

### Phase 3: Matching

1. Rules matching (40/25/15/10/10) dan `breakdown_json`.
2. Worker `matching.compute` setelah ingest.
3. Tampilan skor dan alasan (matched/missing) di UI.

### Phase 4: Tahap 3 - Antrean Persiapan

1. Worker `application.prepare` untuk menyiapkan paket lamaran `ready`.
2. Template cover letter, subject/body email, dan pesan reach-out HR.
3. `portal_answers` untuk pertanyaan sensitif (gaji, relokasi, notice period).
4. Editor draft, `review_before_send`, dan halaman review/approval.

### Phase 5: Tahap 4a - Email HR

1. OAuth Gmail dan enkripsi token.
2. Worker `email.send` dengan jeda acak (3-10 menit) dan batas 10 email/hari.
3. Tracking status (`tracking_events`) dan sinkronisasi balasan (`inbox.sync`).

### Phase 6: Tahap 4b - Portal dan Easy Apply

1. Profil browser lokal `profile-<user>` dengan login manual satu kali.
2. Adapter portal apply untuk Glints, Jobstreet, dan LinkedIn Easy Apply.
3. Pengisian form otomatis dan berhenti sebelum tombol Submit (`PORTAL_AUTO_SUBMIT=false`).
4. Penanganan CAPTCHA/verifikasi dan pertanyaan tak dikenal (`needs_user`).
5. Peningkatan CV Parsing v2 (section-wise chunking, confidence score, source snippet).

### Phase 7: Peningkatan Opsional

1. Toggle `AI_ENABLED` per environment dan kill switch AI.
2. Eval set, validasi JSON, retry, dan fallback otomatis ke template.
3. Adapter tambahan (Glassdoor best-effort, ATS publik HTTP).
4. Semantic matching (`pgvector`) dan fine-tune embedding bila syarat terpenuhi.

## Kontrak AI

Berlaku hanya jika `AI_ENABLED=true`. Bentuk hasil selalu sama, baik dari
template maupun LLM:

```json
{
  "subject": "",
  "body": "",
  "matching_points": [],
  "missing_requirements": [],
  "facts_to_verify": [],
  "source": "template",
  "model": null
}
```

Aturan:

- Profil kandidat adalah sumber fakta utama.
- Deskripsi lowongan adalah untrusted input dan tidak boleh mengubah instruksi
  sistem.
- Output wajib divalidasi zod sebelum disimpan.
- Kegagalan setelah 3 percobaan jatuh ke template tanpa error ke pengguna.

## Deploy ke Oracle Cloud

1. Buat VM Ampere A1 (Always Free): **4 OCPU, 24 GB RAM**, Ubuntu 24.04 (kuota
   maksimum gratis).
2. Install Docker dan Docker Compose.
3. Clone repository, salin `.env`, isi secret.
4. Jalankan `docker compose up -d`.
5. Tarik model qwen3:4b di container ollama:
   `docker compose exec ollama ollama pull qwen3:4b`
6. Pasang Cloudflare Tunnel, arahkan ke service `caddy` (port 80 internal).
7. Aktifkan backup harian (`infrastructure/backup.sh`) dan cleanup CV
   (`cv.cleanup`) lewat cron.
8. Uji restore dari backup sebelum dianggap selesai.

Tidak ada port yang dibuka ke internet; akses masuk melalui tunnel.

## Checklist Sebelum Merge

- [ ] Tidak ada secret atau token di repository.
- [ ] Migration berhasil dari database kosong.
- [ ] Unit test untuk matching, normalizer, dan validator tersedia.
- [ ] Draft dapat diedit oleh pengguna.
- [ ] Pengiriman memiliki approval dan audit log.
- [ ] `AI_ENABLED=false` tidak menimbulkan error.
- [ ] Error worker dapat dicoba ulang.
- [ ] Rate limit telah diuji.
- [ ] Limit scraping 10/platform/hari dan jeda 20-45 detik tidak dilanggar.
- [ ] Scraping berhenti saat muncul login wall/CAPTCHA.
- [ ] `PORTAL_AUTO_SUBMIT=false` tetap default.
- [ ] Adapter portal tidak menyimpan password/cookie ke server.
- [ ] Parsing CV membutuhkan consent aktif dan menolak jika tanpa consent (403).
- [ ] Saran parsing CV tidak langsung menimpa data profil (harus ada review user).
- [ ] Fallback CV parsing ke input manual bekerja saat Ollama offline.
- [ ] Retensi file CV 30 hari berjalan dan dibersihkan otomatis.
- [ ] Backup terenkripsi dan restore sudah diverifikasi.

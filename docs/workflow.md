# Alur Kerja 4 Tahap

Dokumen ini adalah acuan utama alur produk. Dokumen lain (arsitektur, sumber,
roadmap, privasi) mengikuti alur di sini.

## Ringkasan

```text
TAHAP 1 - Scraping Harian (otomatis, guest)
  Local Runner + Playwright, mode guest, maks 10 lowongan/platform/hari
  -> simpan ke database sebagai snapshot harian
  -> hitung kecocokan dengan CV dan interest

TAHAP 2 - Pemilihan oleh User
  User login -> lihat lowongan snapshot H-1 yang cocok
  -> centang lowongan -> "Masukkan ke Antrean Apply"

TAHAP 3 - Antrean Persiapan (otomatis di background)
  Worker + template/LLM lokal memproses antrean satu per satu
  -> CV PDF yang relevan, cover letter, pesan reach-out HR, jawaban form
  -> status "Siap Dikirim"

TAHAP 4 - Eksekusi Pengiriman
  a. Email HR  -> dikirim otomatis via Gmail API sesuai jadwal antrean
  b. Portal    -> Local Runner membuka lowongan di browser lokal user,
                  mengisi form + melampirkan CV, berhenti di tombol Submit
                  (auto-submit opsional untuk form standar)
```

Sebelum tahap 1, setiap user menyelesaikan onboarding satu kali:

```text
Register/login -> isi data diri (format lamaran kerja) -> CV otomatis
-> pilih interest role -> pilih platform yang diikuti
-> (opsional) hubungkan Gmail -> (opsional) login manual platform di Local Runner
```

## Prinsip yang Tidak Berubah

1. **LLM tidak pernah "mengirim" lamaran.** LLM hanya menghasilkan teks. Yang
   mengirim adalah adapter: Gmail API untuk email, Playwright untuk portal.
2. **Scraping tidak memakai akun.** Tahap 1 berjalan sebagai guest. Akun pribadi
   tidak pernah dipakai untuk mengumpulkan lowongan.
3. **Password platform tidak disimpan di server.** Sesi login platform hanya ada
   di profil browser lokal milik user di Local Runner.
4. **Data kandidat tidak dikirim ke provider AI.** LLM yang dipakai adalah
   Ollama lokal. Jika mati, sistem jatuh ke template.
5. **Isi CV hanya dari data user.** Penyesuaian CV per lowongan berupa memilih
   dan mengurutkan data yang sudah ada, bukan menulis fakta baru.

## Komponen yang Terlibat

| Komponen | Lokasi | Peran |
|---|---|---|
| Web | VM Oracle | UI, API, onboarding, daftar lowongan, antrean |
| Worker | VM Oracle | Ingest, matching, persiapan antrean, kirim email |
| PostgreSQL | VM Oracle | Data, snapshot, antrean (pg-boss) |
| Ollama (opsional) | VM Oracle | Menyusun teks lamaran |
| **Local Runner** | Laptop/PC anggota tim | Scraping guest (tahap 1) dan isi form portal (tahap 4b) |

Local Runner berjalan di jaringan rumah/kantor (IP residensial), bukan di VM,
karena IP datacenter seperti Oracle hampir selalu diarahkan ke halaman login
atau CAPTCHA oleh LinkedIn, Jobstreet, dan Glassdoor.

Local Runner **menarik** tugas dari VM (pull) melalui Cloudflare Tunnel dengan
token. Tidak ada port yang dibuka di laptop.

---

## Tahap 1 - Scraping Harian (Guest)

### Tujuan

Mengumpulkan lowongan baru setiap hari dari LinkedIn, Glints, Jobstreet,
Glassdoor, dan situs lain tanpa login, dengan pola akses yang menyerupai
manusia.

### Aturan Akses

| Aturan | Nilai default |
|---|---|
| Mode | Guest (tanpa login, tanpa cookie akun) |
| Batas | 10 lowongan baru per platform per hari |
| Jeda antar halaman | Acak 20-45 detik |
| Browser | Satu Chromium, sekuensial, tidak paralel |
| Jam jalan | Sekali sehari, default 19:00 WIB (saat laptop menyala) |
| Saat muncul login wall/CAPTCHA | Berhenti untuk platform itu, catat `blocked`, lanjut platform berikutnya |
| CAPTCHA solver / rotasi proxy | Tidak dipakai |

### Alur

```text
1. Runner meminta tugas: GET /api/runner/tasks
2. VM mengembalikan rencana pencarian per platform:
     kata kunci dari user_interests + lokasi dari profil
     kuota 10 per platform, dibagi rata antar interest
3. Untuk setiap platform:
     buka halaman pencarian publik
     ambil kartu lowongan -> buka detail satu per satu
     lewati lowongan yang sudah dikenal (raw_hash / external_id)
     berhenti saat kuota tercapai atau terblokir
4. Runner mengirim hasil: POST /api/runner/jobs
5. Worker VM:
     normalisasi -> dedupe -> upsert jobs
     insert job_snapshots(snapshot_date = tanggal pengambilan)
     deteksi channel apply (email HR / portal / easy apply)
     enqueue matching.compute
6. Runner melaporkan ringkasan: collector_runs (found, new, blocked, error)
```

### Ekspektasi Per Platform

| Platform | Prioritas | Ekspektasi mode guest |
|---|---|---|
| Glints | 1 | Paling stabil; detail lowongan umumnya terbuka |
| Jobstreet | 2 | Umumnya terbuka dari IP residensial |
| LinkedIn | 3 | Halaman pencarian publik terbatas; sering authwall setelah beberapa halaman |
| Glassdoor | 4 | Best effort; hampir selalu meminta login |
| Situs/ATS lain | 5 | Ditambahkan per adapter |

Detail aturan dan status setiap platform ada di [sources.md](sources.md).

### Snapshot H-1

- `snapshot_date` = tanggal lowongan dikumpulkan.
- User yang login pada tanggal `D` melihat snapshot `D-1`.
- Jika snapshot `D-1` kosong (laptop mati, semua platform terblokir), tampilkan
  snapshot terakhir yang tersedia dengan banner: "Lowongan per 4 Nov 2026".

### Output Tahap 1

- Lowongan baru di `jobs` dan `job_snapshots`.
- `collector_runs` per platform per hari.
- `matches` per user untuk snapshot tersebut.

---

## Tahap 2 - Pemilihan oleh User

### Tujuan

User memilih lowongan mana yang ingin dilamar. Ini adalah titik persetujuan
manusia yang utama.

### Alur

```text
1. User login -> dashboard "Lowongan Hari Ini" (snapshot H-1)
2. Daftar diurutkan berdasarkan skor kecocokan + filter interest
3. Setiap kartu menampilkan:
     judul, perusahaan, lokasi, platform, skor, alasan skor
     channel apply: Email HR / Portal / Easy Apply / Hanya link
4. User mencentang lowongan -> "Masukkan ke Antrean Apply"
5. Sistem membuat applications(status = queued) untuk setiap lowongan
```

### Aturan

- Lowongan yang sudah pernah dilamar user ditandai dan tidak bisa diantrekan
  dua kali.
- User dapat membatalkan antrean selama status belum `sending`.
- Batas antrean per user per hari: 10 (dapat diatur).

---

## Tahap 3 - Antrean Persiapan

### Tujuan

Menyiapkan semua bahan lamaran secara otomatis tanpa user menunggu.

### Alur

```text
untuk setiap applications(status = queued), satu per satu:
  status -> preparing
  1. CV:
       pilih template (A/B) dan urutkan skill/pengalaman paling relevan
       render PDF -> resumes (versi khusus lowongan)
  2. Teks (template default, Ollama opsional):
       cover letter
       subject + body email HR (jika channel email)
       pesan reach-out singkat untuk HR/recruiter
       jawaban pertanyaan umum form portal (dari portal_answers user)
  3. Validasi:
       schema zod, cek fakta terhadap profil
       pertanyaan form yang tidak punya jawaban tersimpan -> tandai needs_user
  status -> ready (atau needs_user)
```

### Aturan

- LLM hanya dipakai di tahap ini, dan hanya Ollama lokal.
- Jika Ollama mati/timeout 3x, teks dibuat dari template (`drafts.source =
  template`).
- Pertanyaan sensitif (ekspektasi gaji, kesediaan relokasi, tahun pengalaman
  spesifik) **tidak boleh ditebak** LLM. Jawaban diambil dari `portal_answers`
  milik user; jika belum ada, status menjadi `needs_user`.
- Pengaturan user `review_before_send` (default aktif): jika aktif, user melihat
  draft sebelum tahap 4 berjalan.

---

## Tahap 4 - Eksekusi Pengiriman

Lowongan `ready` dikirim sesuai channel-nya.

### 4a. Email HR (otomatis)

```text
applications(channel = email, status = ready)
  -> email.send dijadwalkan dengan jeda acak 3-10 menit antar email
  -> kirim via Gmail API dari akun user sendiri (CV PDF sebagai lampiran)
  -> simpan message ID -> status sent
  -> inbox.sync mendeteksi balasan -> status replied
```

Aturan:

- Hanya ke email HR yang tercantum publik pada lowongan.
- Maksimal 10 email lamaran per user per hari.
- Kill switch global untuk menghentikan semua pengiriman.

### 4b. Portal / Easy Apply (Local Runner)

```text
applications(channel = portal, status = ready)
  -> Runner menarik tugas portal.apply
  -> buka lowongan dengan profil browser lokal user (sudah login manual)
  -> isi field dari profil + portal_answers, lampirkan CV PDF
  -> mode default: berhenti sebelum Submit, user menekan Submit
  -> mode auto: tekan Submit hanya jika semua field terisi dari data tersimpan
  -> laporkan hasil: sent / needs_user / failed
```

Aturan:

- Login platform dilakukan **manual oleh user** satu kali di profil browser
  Local Runner. Server tidak pernah menerima password atau cookie.
- `PORTAL_AUTO_SUBMIT=false` secara default. Auto-submit hanya untuk form yang
  semua pertanyaannya sudah punya jawaban tersimpan.
- Satu lamaran portal sekaligus, jeda acak 1-3 menit antar lamaran.
- Jika muncul CAPTCHA, verifikasi, atau pertanyaan tak dikenal: berhenti,
  status `needs_user`.
- Pesan reach-out ke HR di dalam platform (misalnya pesan LinkedIn) **disiapkan**
  oleh sistem, tetapi dikirim manual oleh user.

### 4c. Hanya Link

Lowongan tanpa email HR dan tanpa adapter portal: sistem menyediakan paket
lamaran (CV, cover letter, pesan reach-out) dan tombol "Buka lowongan". User
melamar manual, lalu menandai status `sent`.

---

## Status Lamaran

```text
queued -> preparing -> ready -> sending -> sent -> replied
                    \-> needs_user -> ready
                              any -> failed | cancelled
```

| Status | Arti |
|---|---|
| `queued` | Dipilih user, menunggu persiapan |
| `preparing` | Worker sedang membuat CV dan teks |
| `needs_user` | Butuh input user (jawaban form, review, CAPTCHA) |
| `ready` | Siap dikirim |
| `sending` | Sedang dikirim (email atau portal) |
| `sent` | Terkirim |
| `replied` | Ada balasan dari perusahaan |
| `failed` | Gagal setelah retry; detail di `last_error` |
| `cancelled` | Dibatalkan user |

Setiap perubahan status dicatat di `tracking_events` dan `audit_log`.

## Batas Harian Default

| Batas | Nilai | Variabel |
|---|---|---|
| Lowongan baru per platform per hari | 10 | `SCRAPE_DAILY_LIMIT_PER_PLATFORM` |
| Jeda halaman scraping | 20-45 detik | `SCRAPE_DELAY_MIN_MS`, `SCRAPE_DELAY_MAX_MS` |
| Antrean per user per hari | 10 | `APPLY_DAILY_LIMIT_PER_USER` |
| Email per user per hari | 10 | `EMAIL_DAILY_LIMIT_PER_USER` |
| Jeda antar email | 3-10 menit | `EMAIL_DELAY_MIN_MS`, `EMAIL_DELAY_MAX_MS` |
| Jeda antar lamaran portal | 1-3 menit | `PORTAL_DELAY_MIN_MS`, `PORTAL_DELAY_MAX_MS` |

## Risiko yang Diterima

Aplikasi ini hanya dipakai tim internal. Risiko berikut diterima secara sadar:

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Scraping guest melanggar ketentuan platform | IP rumah terkena CAPTCHA/blokir sementara | Volume sangat rendah, jeda manusia, berhenti saat terblokir |
| Struktur halaman berubah | Adapter gagal | Fixture test, alert jika success rate < 80% |
| Laptop runner mati | Tidak ada snapshot hari itu | Fallback ke snapshot terakhir |
| Auto-submit portal salah isi | Lamaran buruk terkirim | Default berhenti sebelum Submit |
| Pola isi form terdeteksi otomatis | Akun platform diminta verifikasi | Satu lamaran sekaligus, jeda manusia, auto-submit dimatikan default |

Akun pribadi tidak terlibat di tahap 1, sehingga risiko ban akun hanya relevan
di tahap 4b dan dikendalikan oleh user.

# Kebijakan Privasi Data

## Prinsip

Data kandidat adalah data pribadi yang sensitif. Sistem ini dirancang agar data
tersebut **tidak pernah dikirim ke provider AI pihak ketiga**.

Interpretasi yang dipakai proyek ini:

> Data boleh diproses di server milik sendiri (VM Oracle yang dikelola pemilik
> proyek), tetapi tidak boleh dikirim ke layanan AI komersial seperti OpenAI,
> Google Gemini, Anthropic, OpenRouter, Hugging Face Inference, atau Cloudflare
> Workers AI.

Konsekuensinya:

- Tidak ada API key LLM komersial di `.env`.
- Satu-satunya jalur inferensi adalah Ollama di VM yang sama.
- Jika Ollama dimatikan, fitur inti tetap berjalan tanpa mengirim data ke mana
  pun.

## Di Mana Data Disimpan

| Data | Lokasi | Enkripsi |
|---|---|---|
| Profil, pendidikan, pengalaman, skill | PostgreSQL di VM | At-rest disk (LUKS opsional) |
| CV PDF | Direktori `/data` di VM | At-rest disk |
| Token OAuth Gmail | PostgreSQL, kolom terenkripsi | `pgcrypto` + `EMAIL_ENCRYPTION_KEY` |
| Password | PostgreSQL, hash | argon2id |
| Jawaban form sensitif (`portal_answers`) | PostgreSQL di VM | At-rest disk |
| Status sesi platform (`user_platforms.session_status`) | PostgreSQL di VM | Tanpa kredensial |
| Profil browser platform (`profile-guest`, `profile-<user>`) | Laptop/PC anggota tim | Tidak pernah dikirim ke server |
| Password/cookie platform | **Tidak disimpan** | — |
| Backup | Object storage pribadi | Terenkripsi sebelum upload |

### Data di Local Runner

Local Runner berjalan di perangkat anggota tim, bukan di VM. Hal ini membawa
konsekuensi privasi sebagai berikut:

- Profil browser (`browser-profiles/profile-guest` dan
  `browser-profiles/profile-<user>`) berisi cookie/session platform dan
  **hanya berada di perangkat lokal**. Server tidak pernah menerima file ini.
- Password platform **tidak pernah** diketik ke sistem ini; user login manual
  di browser lokal satu kali. Setelah itu, session disimpan oleh browser.
- Runner hanya mengirim hasil scraping (data lowongan publik) dan status task
  ke server. Data kandidat tidak dikirim ke situs lowongan saat scraping guest.

## Apa yang Keluar dari Server

Sistem hanya melakukan koneksi keluar untuk hal berikut:

| Tujuan | Data yang dikirim | Alasan |
|---|---|---|
| Sumber lowongan (ATS feed, API resmi) | Hanya request pencarian lowongan | Mengambil data lowongan publik |
| Gmail API | Isi email lamaran yang sudah disetujui user | Mengirim email dari akun user sendiri |
| Object storage backup | Dump database terenkripsi | Disaster recovery |
| Cloudflare Tunnel | Traffic HTTPS aplikasi | Akses masuk tanpa membuka port |
| Situs lowongan via Runner (scraping guest) | Request halaman publik, tanpa data user | Mengambil data lowongan publik |
| Situs lowongan via Runner (portal apply) | Data form lamaran + CV yang diunggah | Melamar atas nama user, setelah approval |
| Server ke Runner | Task, URL lowongan, signed URL CV | Menjalankan scraping/apply |

Tidak ada data kandidat yang dikirim ke penyedia inferensi AI. Saat scraping
guest, situs lowongan tidak menerima profil, CV, atau data pribadi pengguna.
Saat portal apply, CV dan data form memang dikirim ke situs lowongan karena
itulah tujuan melamar.

## Pengecualian yang Harus Dipahami

- **Oracle Cloud** adalah penyedia infrastruktur. Data berada di disk VM yang
  disewa dari Oracle. Ini diterima sebagai konsekuensi interpretasi yang dipakai.
- **Gmail API** menerima isi email lamaran karena fungsinya memang mengirim
  email. Ini hanya terjadi setelah user menekan approve.
- **Situs lowongan** menerima request pencarian guest, bukan data user. Saat
  portal apply, situs menerima data lamaran karena user memilih untuk melamar
  ke lowongan tersebut.
- **Situs lowongan dapat mencatat IP residensial** Runner. Blokir/CAPTCHA
  berdampak pada IP tersebut, bukan pada akun pribadi, karena scraping berjalan
  tanpa login.
- **Signed URL CV** dapat diakses siapa pun yang memiliki URL tersebut selama
  masa berlaku. URL dibuat singkat (misalnya 15 menit) dan hanya dikirim ke
  Runner saat task apply berjalan.

## Portal Apply dan CV

Saat menjalankan portal apply (Tahap 4b di [workflow.md](workflow.md)):

- Runner membuka halaman lamaran dengan profil browser milik user.
- CV diambil dari signed URL yang dibuat server saat task berjalan.
- CV dan jawaban form dikirim ke situs lowongan hanya setelah user menyetujui
  lamaran tersebut.
- Default `PORTAL_AUTO_SUBMIT=false`: Runner berhenti sebelum tombol Submit,
  sehingga user dapat memeriksa isi form lebih dulu.
- Jika muncul CAPTCHA atau verifikasi, task berhenti dan status menjadi
  `needs_user`; tidak ada upaya melewati verifikasi.

## Enkripsi dan Akses

- Database hanya listen di localhost dan tidak diekspos ke internet.
- Token OAuth dienkripsi at-rest dengan kunci yang disimpan di environment,
  bukan di database.
- Akses SSH memakai key, bukan password.
- Log tidak memuat isi CV, token, atau alamat email lengkap.
- `.env` tidak pernah di-commit.
- **Password dan cookie platform tidak disimpan di server.** Hanya
  `user_platforms.session_status` (`none|logged_in|expired`) yang disimpan.
- Profil browser Runner berada di perangkat lokal dan tidak di-backup ke VM.
- Signed URL CV memakai masa berlaku singkat dan tidak dapat diakses publik
  tanpa URL tersebut.
- `RUNNER_TOKEN` hanya memberi akses ke endpoint task Runner, bukan ke database
  secara langsung, dan dapat dicabut dengan mengganti nilainya.

## Retensi dan Penghapusan

- Data profil disimpan selama akun aktif.
- User dapat menghapus akun; proses ini menghapus profil, CV, draft, dan token
  OAuth, lalu menandai lamaran sebagai terhapus.
- Backup disimpan maksimal 30 hari, lalu dihapus otomatis.
- Log audit disimpan 90 hari untuk kebutuhan debugging, tanpa isi dokumen.

## Kepatuhan

Proyek ini berskala personal (target 10 user). Meski demikian, prinsip UU PDP
Indonesia tetap dijadikan acuan:

- Ada dasar pemrosesan yang jelas (persetujuan user saat onboarding).
- Data dikumpulkan seperlunya (data diri format lamaran kerja).
- Ada mekanisme penghapusan data.
- Tidak ada transfer data pribadi ke pihak ketiga untuk tujuan komersial.

Dokumen ini bukan nasihat hukum. Jika proyek berubah menjadi layanan komersial,
kebijakan ini harus ditinjau ulang.

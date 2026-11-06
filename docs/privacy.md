# Kebijakan Privasi Data

## Prinsip

Data kandidat adalah data pribadi yang sensitif. Sistem ini dirancang dengan
prinsip perlindungan data yang ketat:

1. **Tidak ada transfer data ke penyedia AI komersial pihak ketiga.** Tidak ada
   data profil, CV, surat lamaran, atau jawaban form yang dikirim ke OpenAI,
   Google Gemini, Anthropic, OpenRouter, Hugging Face Inference, atau Cloudflare
   Workers AI.
2. **Pemrosesan AI bersifat internal dan berbasis persetujuan (consent).**
   Satu-satunya mesin AI adalah Ollama (`qwen3:4b`) yang berjalan di dalam
   container Docker di Oracle Cloud Always Free VM milik sendiri (4 OCPU /
   24 GB RAM). Pemrosesan data CV/profil oleh Ollama hanya dapat berjalan jika
   user secara aktif memberikan persetujuan (opt-in).
3. **User memegang kendali penuh.** User dapat memilih input manual tanpa AI,
   mencabut persetujuan AI kapan saja, meninjau setiap saran hasil parsing
   sebelum masuk ke profil, dan menghapus seluruh datanya.
4. **Kredensial akun platform tidak pernah disimpan di server.** Scraping
   berjalan dalam mode guest tanpa akun, dan sesi login portal hanya berada di
   laptop pengguna pada Local Runner.

## Persetujuan Eksplisit Pemrosesan AI (Consent)

Sebelum fitur parsing CV atau pemrosesan AI profil dijalankan, user wajib
memberikan persetujuan eksplisit melalui antarmuka web.

### Teks Persetujuan Pengguna

Teks persetujuan yang ditampilkan kepada pengguna pada saat upload CV dan
tersimpan versinya di `user_consents`:

> "Saya menyetujui file CV dan profil saya diproses oleh model AI internal
> (Ollama `qwen3:4b`) yang berjalan di server proyek ini untuk membantu
> ekstraksi data profil dan pembuatan draf lamaran.
> 
> Saya memahami bahwa data saya **tidak pernah dikirim ke pihak ketiga seperti
> OpenAI, Google, Anthropic, atau penyedia AI eksternal lainnya**.
> 
> Pemrosesan ini bersifat opsional. Jika saya tidak menyetujui, saya tetap dapat
> mengisi profil secara manual dan menggunakan draf berbasis template. Saya
> berhak mencabut persetujuan ini kapan saja melalui menu Pengaturan, dan
> pencabutan akan menghapus seluruh data draf/saran hasil pemrosesan AI."

### Aturan Teknis Persetujuan

- **Opt-in murni:** Checkbox persetujuan default dalam keadaan kosong (tidak
  tercentang).
- **Tersimpan dan terversi:** Persetujuan disimpan di tabel `user_consents`
  dengan `kind = 'cv_ai_processing'`, versi persetujuan (misal
  `CV_AI_CONSENT_VERSION=2026-11-06.v1`), waktu `accepted_at`, dan hash
  user-agent saat persetujuan diberikan.
- **Pengecekan di sisi server:** API backend (`/api/cv/parse`) memverifikasi
  apakah user memiliki rekaman persetujuan aktif dengan versi terkini sebelum
  membuat task di antrean `pg-boss`. Jika tidak ada atau versi lama, request
  ditolak dengan status HTTP `403 Forbidden`.
- **Pencabutan persetujuan:** Jika user mencabut persetujuan, sistem mengubah
  `revoked_at`, membatalkan antrean parsing yang sedang berjalan, menghapus
  riwayat run di `cv_parse_runs`, dan menghapus seluruh catatan di
  `cv_parse_suggestions`.

## Di Mana Data Disimpan

| Data | Lokasi | Retensi | Enkripsi / Keamanan |
|---|---|---|---|
| Profil, pendidikan, pengalaman, skill | PostgreSQL di VM | Selama akun aktif | At-rest disk; akses dibatasi localhost |
| CV Asli yang diunggah (`uploaded_cvs`) | Direktori `/data/cv` di VM | Maksimal **30 hari** (`delete_after`), lalu dihapus permanen | At-rest disk; nama file UUID acak |
| Saran hasil parsing (`cv_parse_suggestions`) | PostgreSQL di VM | Dihapus setelah di-review atau maksimal 30 hari | At-rest disk; cascade delete bila consent dicabut |
| Catatan persetujuan (`user_consents`) | PostgreSQL di VM | Selama akun aktif | Log audit kepatuhan |
| CV PDF hasil render (`resumes`) | Direktori `/data/resumes` di VM | Selama lamaran aktif | At-rest disk; render dari template internal |
| Token OAuth Gmail | PostgreSQL di VM | Selama akun terhubung | `pgcrypto` + `EMAIL_ENCRYPTION_KEY` |
| Password user | PostgreSQL di VM | Selama akun aktif | Hash argon2id |
| Jawaban form sensitif (`portal_answers`) | PostgreSQL di VM | Selama akun aktif | At-rest disk; tidak boleh ditebak LLM |
| Status sesi platform (`user_platforms.session_status`) | PostgreSQL di VM | Selama akun aktif | Tanpa kredensial (hanya `none/logged_in/expired`) |
| Profil browser platform (`profile-guest`, `profile-<user>`) | Laptop/PC anggota tim (Local Runner) | Lokal di perangkat | Tidak pernah dikirim ke server |
| Password & cookie platform | **Tidak pernah disimpan** | — | — |
| Backup database | Object storage pribadi | Maksimal 30 hari | Terenkripsi dengan AES/GPG sebelum upload |

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
- **Redaksi log AI & dokumen:** Log aplikasi dan container **dilarang** mencatat
  teks mentah isi CV, prompt lengkap yang memuat profil, atau completion mentah
  LLM. Log hanya mencatat ID task, jumlah karakter input/output, model yang
  digunakan, durasi inferensi, dan status keberhasilan/kode error.
- Variabel `OLLAMA_DEBUG=false` untuk mencegah log internal Ollama mencatat body
  prompt ke file log container.
- `.env` tidak pernah di-commit ke repositori.
- **Password dan cookie platform tidak disimpan di server.** Hanya
  `user_platforms.session_status` (`none|logged_in|expired`) yang disimpan.
- Profil browser Runner berada di perangkat lokal dan tidak di-backup ke VM.
- Signed URL CV memakai masa berlaku singkat (misal 15 menit) dan tidak dapat
  diakses publik tanpa token tanda tangan tersebut.
- `RUNNER_TOKEN` hanya memberi akses ke endpoint task Runner, bukan ke database
  secara langsung, dan dapat dicabut dengan mengganti nilainya.

## Retensi dan Penghapusan

- **File CV unggahan (`uploaded_cvs`):** Disimpan di direktori lokal VM
  `/data/cv` dan dijadwalkan untuk dihapus secara permanen setelah **30 hari**
  atau segera setelah user menyelesaikan onboarding/review profil awal.
- **Saran parsing (`cv_parse_suggestions`):** Dihapus otomatis saat user selesai
  melakukan review/merge, atau setelah 30 hari jika belum disentuh.
- **Data profil terstruktur:** Disimpan selama akun aktif untuk mempermudah
  pembuatan CV dan pencocokan lowongan berulang.
- **Pencabutan persetujuan AI:** Menghapus seluruh riwayat parsing dan file CV
  mentah terkait tanpa menghapus akun atau profil manual.
- **Penghapusan akun:** User dapat menghapus akun kapan saja. Proses ini
  menghapus akun user, profil, pendidikan, pengalaman, skill, file CV asli,
  CV PDF hasil render, draf lamaran, dan token OAuth, serta menandai riwayat
  lamaran sebagai terhapus.
- **Backup database:** Disimpan maksimal 30 hari di penyimpanan terenkripsi,
  lalu dihapus otomatis oleh script rotasi backup.
- **Log audit:** Disimpan selama 90 hari untuk kebutuhan troubleshooting dan
  investigasi insiden keamanan, tanpa memuat isi dokumen pribadi.

## Kepatuhan

Proyek ini berskala personal (target 10 user). Meski demikian, prinsip UU PDP
Indonesia tetap dijadikan acuan:

- Ada dasar pemrosesan yang jelas (persetujuan user saat onboarding).
- Data dikumpulkan seperlunya (data diri format lamaran kerja).
- Ada mekanisme penghapusan data.
- Tidak ada transfer data pribadi ke pihak ketiga untuk tujuan komersial.

Dokumen ini bukan nasihat hukum. Jika proyek berubah menjadi layanan komersial,
kebijakan ini harus ditinjau ulang.

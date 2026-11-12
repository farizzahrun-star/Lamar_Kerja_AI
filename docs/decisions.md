# Log Keputusan Arsitektur (ADR)

Setiap keputusan besar dicatat di sini agar alasan dan konsekuensinya tidak
hilang. Format ringkas: konteks, keputusan, konsekuensi.

Tanggal awal pencatatan: 6 November 2026.

---

## ADR-001: Satu VM untuk seluruh layanan

**Status:** Diterima (Diperbarui oleh ADR-024)

**Konteks:** Target 10 user dalam 3 bulan, tanpa GPU, dan harus gratis. Dengan
diaktifkannya Ollama `qwen3:4b` untuk parsing CV opsional dan draft lamaran,
kebutuhan memori dan CPU bertambah.

**Keputusan:** Web, worker, PostgreSQL, dan Ollama berjalan di satu Oracle Cloud
Always Free VM (Ampere A1 ARM, **4 OCPU / 24 GB RAM** — kuota maksimum Always
Free).

**Konsekuensi:**

- Biaya tetap $0 dan satu titik backup.
- Alokasi resource: Next.js (~1-2 GB, 0.5 OCPU), PostgreSQL (~3-4 GB, 0.5 OCPU),
  Ollama `qwen3:4b` (~4-5 GB, 1.5 OCPU), sisanya untuk OS, worker, dan buffer.
- Tidak ada horizontal scaling; cukup untuk beban 10 user dengan antrean
  sekuensial (`OLLAMA_NUM_PARALLEL=1`).
- Jika user bertambah, worker dan Ollama dapat dipindah ke mesin terpisah tanpa
  mengubah kode aplikasi (hanya `OLLAMA_BASE_URL` dan antrean).

---

## ADR-002: Next.js full-stack, bukan FastAPI atau NestJS terpisah

**Status:** Diterima

**Konteks:** `setup.md` sebelumnya membuka pilihan FastAPI atau NestJS. Proyek
dikerjakan solo dan belum ada kode backend.

**Keputusan:** Gunakan Next.js 15 App Router untuk UI dan Route Handlers.

**Konsekuensi:**

- Satu bahasa, satu build, satu deploy.
- Tidak ada duplikasi model dan validasi di dua codebase.
- Jika nanti butuh Python untuk scraping atau ML khusus, worker dapat dipisah
  sebagai service terpisah.

---

## ADR-003: PostgreSQL self-host, bukan database terkelola

**Status:** Digantikan oleh ADR-026

**Konteks:** Supabase/Neon gratis menidurkan instance dan menyimpan data di
infrastruktur pihak lain.

**Keputusan:** PostgreSQL 16 berjalan sebagai container di VM yang sama.

**Konsekuensi:**

- Data tidak meninggalkan VM yang dikelola sendiri.
- Backup dan upgrade menjadi tanggung jawab sendiri.
- Butuh disiplin operasional (backup harian, uji restore).

---

## ADR-004: pg-boss, bukan Redis + BullMQ

**Status:** Diterima

**Konteks:** Redis gratis (Upstash) memiliki batas 10.000 command/hari yang cepat
habis oleh BullMQ.

**Keputusan:** Gunakan pg-boss yang memakai PostgreSQL sebagai backend queue.

**Konsekuensi:**

- Satu dependency lebih sedikit.
- Throughput lebih rendah dari Redis, tetapi jauh lebih dari cukup untuk 10 user.
- Schema `pgboss` dikelola otomatis oleh library.

---

## ADR-005: Template-first, rules-first, AI-last

**Status:** Diterima (Diperbarui oleh ADR-024)

**Konteks:** Data kandidat tidak boleh keluar ke provider AI eksternal, dan
tidak ada GPU.

**Keputusan:** Seluruh fitur inti harus tetap berjalan saat `AI_ENABLED=false`
atau ketika Ollama sedang mati/down. LLM (Ollama lokal `qwen3:4b`) hanya
dipakai sebagai akselerator opsional untuk (1) mengekstrak saran profil dari CV
yang diunggah user setelah consent eksplisit, dan (2) menyusun variasi teks
lamaran.

**Konsekuensi:**

- AI tidak pernah menjadi hard dependency pada build, migration, test, maupun
  alur utama onboarding/melamar.
- Jika Ollama down, CV parsing dilewati dan user mengisi profil secara manual;
  pembuatan draft jatuh ke template.
- Kualitas dasar tetap konsisten dan bisa dijelaskan.

---

## ADR-006: CV selalu dihasilkan dari template

**Status:** Diterima

**Konteks:** `README.md` melarang AI mengarang pengalaman, pendidikan, atau
sertifikasi.

**Keputusan:** CV akhir yang dikirim ke perusahaan (`resumes`) selalu dirender
dari data profil terstruktur yang sudah diverifikasi user dengan
`@react-pdf/renderer`. LLM tidak pernah menyusun dokumen CV akhir; pada fitur
CV parsing (ADR-024), LLM hanya mengekstrak **saran field** dari file CV lama
(`uploaded_cvs`) yang wajib di-review user sebelum masuk ke profil.

**Konsekuensi:**

- Nol risiko halusinasi pada dokumen CV yang dikirim tanpa sepengetahuan user.
- Pemisahan tegas antara `uploaded_cvs` (file sumber untuk parsing) dan
  `resumes` (PDF hasil render template).
- Desain CV ditentukan oleh template, bukan prompt.
- Penambahan varian template tidak memerlukan perubahan model AI.

---

## ADR-007: Skor kecocokan memakai rules, bukan LLM

**Status:** Diterima

**Konteks:** Bobot 40/25/15/10/10 sudah didefinisikan di arsitektur awal.

**Keputusan:** Hitung skor secara deterministik; LLM tidak menentukan skor.

**Konsekuensi:**

- Skor dapat diaudit dan dijelaskan ke user.
- Hasil konsisten untuk input yang sama.
- Ekstraksi requirement dari deskripsi lowongan dapat memakai LLM nanti, tetapi
  perhitungan akhir tetap rules.

---

## ADR-008: Ollama CPU-only sebagai service internal dengan fallback penuh

**Status:** Diterima (Diperbarui oleh ADR-024)

**Konteks:** Tidak ada GPU lokal. Model 4B pada CPU ARM (4 OCPU) mampu
mengekstrak JSON singkat dan menghasilkan draft pendek dengan kecepatan
5-15 token/detik.

**Keputusan:** Gunakan `qwen3:4b` (quantized `Q4_K_M`) melalui container Docker
`ollama` di VM yang sama, dijalankan lewat queue `pg-boss` dengan
`OLLAMA_NUM_PARALLEL=1`. Service `ollama` dipasang secara standar di
`docker-compose`, tetapi fitur pemanggilnya (CV parsing & draft LLM) tetap
memiliki fallback penuh jika service mati atau `AI_ENABLED=false`.

**Konsekuensi:**

- Satu task ekstraksi atau draft memakan waktu puluhan detik hingga birkaç
  menit; ini dapat diterima karena berjalan asynchronous di background.
- Butuh `num_ctx=8192` dan pematikan mode thinking (`/no_think`) untuk tugas
  ekstraksi agar latensi CPU terjaga.
- Kegagalan Ollama tidak boleh menghentikan alur user: CV parsing jatuh ke
  input manual, dan pembuatan draft jatuh ke template.

---

## ADR-009: Interpretasi privasi - boleh di VM sendiri dengan persetujuan

**Status:** Diterima (Diperbarui oleh ADR-025)

**Konteks:** Ada tiga kemungkinan interpretasi "data CV tidak keluar ke
provider", serta kebutuhan memproses CV dan profil menggunakan model AI tanpa
melanggar privasi kandidat.

**Keputusan:** Data kandidat (CV dan profil) boleh diproses oleh model AI
**hanya jika** model tersebut berjalan di infrastruktur yang dikelola sendiri
(Ollama di VM Oracle proyek) **dan** user telah memberikan persetujuan (consent)
eksplisit terlebih dahulu. Data tidak boleh dikirim ke layanan AI komersial
pihak ketiga mana pun.

**Konsekuensi:**

- Gemini, OpenAI, Anthropic, OpenRouter, Cloudflare Workers AI, dan Hugging Face
  Inference tetap dilarang untuk data kandidat.
- Pemrosesan oleh Ollama internal wajib didahului consent yang tercatat
  (`user_consents`) dan dapat dicabut kapan saja.
- Detail ada di [privacy.md](privacy.md).

---

## ADR-010: Tidak melakukan scraping situs lowongan besar

**Status:** Digantikan oleh ADR-019

**Konteks:** LinkedIn, Jobstreet, Glassdoor, dan Glints melarang scraping dan
memakai anti-bot agresif.

**Keputusan:** MVP hanya memakai URL manual, teks manual, CSV, dan ATS feed
resmi.

**Konsekuensi:**

- Cakupan lowongan lebih sempit, tetapi stabil dan tidak melanggar ketentuan.
- Scraping dapat ditinjau ulang sebagai proyek terpisah dengan review legal.
- Detail ada di [sources.md](sources.md).

**Pembaruan:** ADR-019 mengizinkan scraping guest dengan batasan ketat (maks
10/platform/hari, jeda acak 20-45 detik, berhenti saat login wall/CAPTCHA),
berjalan di Local Runner dengan IP residensial tim.

---

## ADR-011: Lowongan disajikan sebagai snapshot H-1

**Status:** Diterima

**Konteks:** Permintaan produk: user yang login hari ini melihat lowongan hasil
scraping kemarin.

**Keputusan:** Worker discovery berjalan 02:00 WIB dan menulis `job_snapshots`
dengan `snapshot_date`. API membaca snapshot H-1, dengan fallback ke snapshot
terakhir yang tersedia.

**Konsekuensi:**

- Ada jeda satu hari yang harus dikomunikasikan lewat banner di UI.
- Riwayat "apa yang dilihat user pada tanggal X" tersimpan.
- User baru yang belum punya snapshot H-1 tetap mendapat data lewat fallback.

---

## ADR-012: PDF memakai @react-pdf/renderer

**Status:** Diterima

**Konteks:** Playwright membutuhkan Chromium (~300 MB RAM per instance) yang
memakan RAM VM yang juga dipakai PostgreSQL dan Ollama.

**Keputusan:** Render CV sebagai React PDF tanpa browser.

**Konsekuensi:**

- Ringan dan cepat, cocok untuk VM kecil.
- Layout dibatasi oleh primitif React PDF, bukan CSS penuh.
- Template perlu diuji secara visual setiap kali berubah.

---

## ADR-013: Gmail sebagai provider email pertama

**Status:** Diterima

**Konteks:** Perlu satu provider untuk MVP.

**Keputusan:** Gmail API dengan OAuth. Outlook ditunda.

**Konsekuensi:**

- Hanya user dengan akun Gmail yang bisa memakai fitur kirim.
- Token disimpan terenkripsi; password tidak pernah disimpan.
- Adapter email dibuat generik agar Outlook dapat ditambahkan nanti.

---

## ADR-014: Autentikasi credentials saja

**Status:** Digantikan oleh ADR-026

**Konteks:** Skala personal dan invite-only; OAuth login menambah kompleksitas
tanpa manfaat besar.

**Keputusan:** Auth.js dengan email dan password (argon2id). OAuth hanya dipakai
untuk Gmail, bukan untuk login.

**Konsekuensi:**

- Perlu alur reset password.
- Tidak ada ketergantungan pada identity provider eksternal.

---

## ADR-015: Produk personal, tanpa billing

**Status:** Diterima

**Konteks:** Proyek ini bukan produk komersial.

**Keputusan:** Tidak ada multi-tenant, langganan, atau pembayaran. Akses dibatasi
undangan.

**Konsekuensi:**

- Skema tidak perlu `tenant_id` atau tabel billing.
- Jika berubah menjadi komersial, keputusan hosting dan privasi harus ditinjau
  ulang (termasuk larangan komersial pada free tier tertentu).

---

## ADR-016: Target 10 user aktif dalam 3 bulan

**Status:** Diterima

**Keputusan:** Optimalkan untuk kesederhanaan, bukan skala.

**Konsekuensi:**

- Satu VM dan CPU inference dianggap cukup.
- Tidak ada load balancer, caching layer, atau read replica.
- Keputusan ini menjadi pemicu untuk meninjau ulang arsitektur jika terlampaui.

---

## ADR-017: Training model ditunda sampai ada eval set

**Status:** Diterima

**Konteks:** Tidak ada GPU lokal, inference berjalan di CPU, dan volume data
masih kecil. Training tanpa alat ukur berisiko menurunkan kualitas tanpa
disadari.

**Keputusan:** Training LLM (LoRA/QLoRA) tidak dikerjakan sampai eval set,
baseline, dan dataset minimal tersedia. Urutan prioritas: prompt dan template,
lalu RAG, lalu fine-tune embedding, baru fine-tune LLM.

**Konsekuensi:**

- Phase 7 menetapkan gate prasyarat sebelum training dimulai.
- Eval set menjadi artefak wajib, bukan opsional.
- Fine-tune embedding didahulukan karena dampaknya lebih besar pada matching.
- Detail ada di [ai-training.md](ai-training.md) dan
  [evaluation.md](evaluation.md).

---

## ADR-018: Aturan akses produksi untuk tim dua orang

**Status:** Diterima

**Konteks:** Tim hanya terdiri dari dua orang dan keduanya memiliki akses ke VM
produksi. Tanpa aturan eksplisit, risiko kesalahan operasional dan kebocoran
data meningkat.

**Keputusan:**

- Setiap orang memakai SSH key pribadi; tidak ada akun bersama.
- Database produksi memakai role `app` dan `analytics_ro` (read-only, view
  teredaksi).
- Migration produksi hanya setelah backup dan konfirmasi pemilik.
- Perubahan secret dan penghapusan data user hanya oleh pemilik.
- Dilarang menyalin database produksi ke perangkat lokal.
- Data produksi tidak boleh dipakai untuk training tanpa persetujuan pemilik
  data.

**Konsekuensi:**

- Perlu view teredaksi dan dua role database sejak migration awal.
- Proses deploy dan migrasi menjadi sedikit lebih lambat, tetapi dapat diaudit.
- Access matrix dan prosedur insiden didokumentasikan di
  [team-onboarding.md](team-onboarding.md).

---

## ADR-019: Scraping guest via Playwright di Local Runner

**Status:** Diterima

**Konteks:** Alur produk membutuhkan cakupan lowongan luas dari LinkedIn,
Glints, Jobstreet, Glassdoor. Alternatif manual (URL, teks, CSV) terlalu
ringan. MVP dipakai internal 2 orang, sehingga risiko terbatas.

**Keputusan:**

- Scraping menggunakan Playwright mode guest (tanpa login, tanpa cookie akun).
- Kode scraping dijalankan di Local Runner (laptop/PC anggota tim), bukan VM,
  agar memakai IP residensial.
- Batas 10 lowongan baru per platform per hari, jeda acak 20-45 detik, sekuensial.
- Berhenti saat muncul login wall/CAPTCHA; tidak dipaksa lanjut.
- Tidak ada CAPTCHA solver atau rotasi proxy.
- Tidak ada penyimpanan password atau cookie platform di server.

**Konsekuensi:**

- Scraping dapat memakai alur guest, tetapi LinkedIn/Glassdoor sering
  terbatas/terblokir dari IP datacenter. Dari IP residensial lebih stabil.
- Risiko IP rumah terkena blokir/CAPTCHA diterima; dampak hanya pada hari itu,
  tidak pada akun pribadi karena tidak login sama sekali.
- Struktur halaman platform yang berubah memerlukan update adapter dan test
  fixture.
- Detail di [sources.md](sources.md) dan alur di [workflow.md](workflow.md).

---

## ADR-020: Tidak menyimpan kredensial platform

**Status:** Diterima

**Konteks:** Untuk portal apply (LinkedIn Easy Apply, Glints, Jobstreet), sistem
harus dalam keadaan login agar bisa menekan tombol Apply. Risiko keamanan
meningkat jika password atau cookie disimpan di server.

**Keputusan:**

- Server tidak menyimpan password atau cookie platform.
- Local Runner menyimpan profil browser per user: `profile-guest` (untuk
  scraping) dan `profile-<user>` (untuk portal).
- Profil `profile-<user>` diisi login manual satu kali oleh user; session
  tersimpan di perangkat user, tidak dikirim ke server.
- Server hanya menyimpan `user_platforms.session_status`
  (`none|logged_in|expired`) yang dicek oleh Runner.
- Jika session expired, Runner berhenti dan menunggu user login ulang manual.

**Konsekuensi:**

- Penggunaan akun pribadi aman karena tidak ada bot yang login otomatis.
- Risiko akun terdeteksi bot hanya muncul jika user memakai session login
  dengan pola penggunaan yang tidak wajar (banyak lamaran dalam waktu singkat,
  tidak ada jeda manusia).
- Untuk penggunaan 10 lamaran/hari, risiko ini rendah dan dikendalikan oleh
  user.
- Detail di [workflow.md](workflow.md) bagian Tahap 4b.

---

## ADR-021: LLM hanya menghasilkan teks dan ekstraksi terstruktur

**Status:** Diterima (Diperbarui oleh ADR-024)

**Konteks:** Kebingungan umum: apakah LLM bisa "mengirim" lamaran atau langsung
mengubah profil kandidat. LLM hanya menghasilkan output teks/JSON; yang
mengubah profil adalah persetujuan user, dan yang mengirim lamaran adalah
adapter (Gmail API, Playwright).

**Keputusan:**

- LLM hanya dipanggil di dua titik:
  1. `cv.parse` (opsional, butuh consent): mengekstrak teks CV lama menjadi
     saran field JSON (`cv_parse_suggestions`) yang harus di-review user.
  2. `application.prepare` (opsional): menyusun teks cover letter, subject/body
     email, pesan reach-out HR, dan jawaban form non-sensitif.
- Adapter `email.send` dan `portal.apply` tidak memakai LLM.
- LLM tidak memilih lowongan, tidak menentukan skor matching akhir, tidak
  menimpa tabel `profiles` tanpa review, dan tidak menekan tombol apa pun.
- Output LLM wajib melewati validasi zod; pertanyaan sensitif selalu diambil
  dari `portal_answers`, bukan LLM.
- Jika LLM gagal/timeout/down: `cv.parse` mengarahkan user ke input manual, dan
  `application.prepare` jatuh ke template instan tanpa error ke user.

**Konsekuensi:**

- Arsitektur pemisahan jelas: LLM sebagai alat ekstraksi/writing, manusia
  sebagai verifikator, adapter sebagai alat sending.
- Ollama CPU-only cukup karena semua pemanggilan berjalan via queue.
- LLM lokal (Ollama) mencegah data CV dikirim ke provider komersial.

---

## ADR-022: Portal apply berhenti sebelum Submit

**Status:** Diterima

**Konteks:** Form portal berbeda-beda setiap perusahaan. LLM menebak jawaban
sensitif (gaji, relokasi, masa notice) berisiko memberikan jawaban yang
merugikan user.

**Keputusan:**

- Default `PORTAL_AUTO_SUBMIT=false`.
- Local Runner mengisi form, lalu berhenti di tombol terakhir. User menekan
  Submit.
- `PORTAL_AUTO_SUBMIT=true` hanya untuk form yang semua pertanyaannya sudah
  punya jawaban di `portal_answers` dan tidak ada pertanyaan baru yang tidak
  dikenal.
- Pertanyaan sensitif (ekspektasi gaji, kesediaan relokasi, tahun pengalaman
  spesifik) diambil 100% dari `portal_answers`, tidak dari LLM.
- Jika muncul CAPTCHA atau verifikasi, antrean dihentikan dan status jadi
  `needs_user`.

**Konsekuensi:**

- User tetap sebagai otoritas akhir untuk lamaran.
- Risiko lamaran buruk karena jawaban LLM tidak mungkin terjadi.
- Auto-submit tidak membuat sistem lebih cepat; justru menambah risiko.
- User dapat review draft dan menyetujui sebelum antrean dikirim ke Runner.

---

## ADR-023: Browser Use/agent hanya untuk authoring adapter

**Status:** Diterima

**Konteks:** Agent browser (Browser Use, LangChain Agents) sering dipakai untuk
menemukan selector dan navigasi otomatis. Apakah agent bisa dipakai di runtime?

**Keputusan:**

- Agent browser **tidak dipakai di runtime**. Agent boleh dipakai saat
  development untuk menjelajahi halaman baru dan membantu menemukan selector,
  lalu hasilnya ditulis ulang sebagai adapter Playwright deterministik.
- Adapter runtime hanya memakai selector tetap (id/class CSS) dan navigasi
  sekuensial, bukan pemutusan langkah otomatis.
- Ekstraksi HTML ke JSON boleh memakai LLM lokal karena data lowongan publik
  tidak mengandung data kandidat.

**Konsekuensi:**

- Adapter lebih stabil dan mudah diuji dengan fixture HTML.
- Tidak ada black-box agent yang bisa memutuskan sesuatu di luar kontrol
  (misalnya: klik tombol tidak terduga, isi form dengan pola yang berubah).
- Perubahan halaman platform hanya perlu update selector, bukan logika agent.
- Testing memakai fixture HTML tersimpan, tidak memanggil situs asli.

---

## ADR-024: Parsing CV opsional via Ollama self-host (`qwen3:4b`)

**Status:** Diterima

**Konteks:** Mengisi seluruh riwayat pengalaman, pendidikan, dan skill secara
manual saat onboarding memakan waktu. Kebijakan privasi memperbolehkan data CV
dan profil diproses oleh AI selama model berjalan di server internal milik
proyek (tanpa pihak ketiga) dan didahului persetujuan user.

**Keputusan:**

- Sediakan fitur **CV Parsing opsional** menggunakan Ollama `qwen3:4b` yang
  berjalan di Docker container pada Oracle VM yang sama (shared 4 OCPU / 24 GB
  RAM bersama Next.js dan PostgreSQL).
- Saat onboarding atau edit profil, user dapat memilih:
  1. Isi profil secara manual,
  2. Unggah CV (PDF/DOCX) hanya sebagai arsip, atau
  3. Unggah CV & jalankan parsing otomatis (membutuhkan centang consent).
- Alur teknis: ekstraksi teks di sisi aplikasi (`pdfjs-dist` untuk PDF,
  `mammoth` untuk DOCX) -> simpan di `uploaded_cvs` -> antrekan job `cv.parse`
  di `pg-boss` -> panggil Ollama per bagian (`identity`, `experiences`,
  `educations`, `skills`) dengan output JSON tervalidasi zod -> simpan sebagai
  saran di `cv_parse_suggestions`.
- Hasil parsing **tidak pernah langsung menimpa** tabel profil utama; user
  wajib melakukan review (terima/edit/tolak per bagian).
- **Fallback:** Jika Ollama down, timeout, atau gagal validasi JSON setelah
  retry, sistem mengubah status run menjadi `failed`/`skipped` dan langsung
  mengarahkan user ke form input manual tanpa memblokir onboarding.
- **Penyimpanan file CV:** Disimpan di disk lokal VM (`/data/cv`) dengan
  kebijakan retensi otomatis dihapus setelah **30 hari** (`delete_after`).
- **Pentahapan:** Versi dasar masuk di **Phase 1** (ekstraksi teks + parsing
  JSON dasar + review + fallback manual) dan ditingkatkan di **Phase 6**
  (section-wise chunking, confidence score, source snippet, dan peningkatan
  akurasi lewat prompt/Modelfile/LoRA).

**Konsekuensi:**

- Onboarding jauh lebih cepat bagi user yang sudah memiliki CV PDF/DOCX, tetap
  $0 biaya API, dan data tidak pernah keluar dari VM proyek.
- Container `ollama` dibatasi (`cpus: "1.5"`, `mem_limit: 5g`,
  `OLLAMA_NUM_PARALLEL=1`) agar tidak mengganggu latensi Next.js dan PostgreSQL.
- PDF hasil scan tanpa lapisan teks (image-only) ditandai `skipped` di Phase 1
  dan diarahkan ke input manual (OCR tidak masuk scope Phase 1).

---

## ADR-025: Persetujuan eksplisit (consent) sebelum pemrosesan data CV oleh AI

**Status:** Diterima

**Konteks:** Walaupun Ollama berjalan di server internal dan bukan pihak ketiga,
pemrosesan CV dan profil oleh model AI maupun penggunaan data untuk evaluasi/
training membutuhkan dasar persetujuan yang jelas dan dapat diaudit.

**Keputusan:**

- Sebelum job `cv.parse` atau pemrosesan AI atas profil dijalankan, user wajib
  memberikan persetujuan eksplisit (opt-in, checkbox terpisah dari syarat
  layanan umum).
- Persetujuan disimpan di tabel `user_consents` dengan kolom `kind`
  (`privacy` | `cv_ai_processing` | `ai_training_opt_in`), `version`
  (mis. `2026-11-06.v1`), `accepted_at`, dan `revoked_at`.
- Endpoint API parsing memeriksa keberadaan consent aktif dengan versi terbaru
  secara server-side; tanpa consent, API menolak dengan `403`.
- User dapat mencabut consent kapan saja dari halaman pengaturan; pencabutan
  menghentikan antrean parsing, menghapus `cv_parse_runs`,
  `cv_parse_suggestions`, serta menghapus file di `/data/cv` bila diminta.
- Penggunaan data CV/profil untuk pembuatan eval set atau training LoRA
  memerlukan consent terpisah (`ai_training_opt_in`) **dan** proses anonimisasi
  PII sesuai [ai-training.md](ai-training.md).

**Konsekuensi:**

- Jejak audit privasi jelas untuk setiap pemrosesan AI.
- Perubahan kebijakan privasi cukup menaikkan `CV_AI_CONSENT_VERSION` sehingga
  user diminta menyetujui ulang sebelum memakai fitur AI.
- User yang menolak consent tetap dapat memakai seluruh fitur inti aplikasi
  melalui input manual dan template.

---

## ADR-026: Supabase untuk autentikasi dan database

**Status:** Diterima (Menggantikan ADR-003 dan ADR-014)

**Konteks:** ADR-003 menolak database terkelola karena instance gratis sering
ditidurkan dan data disimpan di infrastruktur pihak lain, sedangkan ADR-014
memilih Auth.js dengan kredensial. Proyek kemudian memakai Supabase sebagai
backend terkelola: server MCP Supabase sudah terhubung, `@supabase/server`
dipasang di `apps/web`, dan kredensial proyek tersedia sebagai environment
variable.

**Keputusan:**

- **Autentikasi** memakai Supabase Auth, bukan Auth.js credentials. Server
  memverifikasi JWT lewat JWKS (`SUPABASE_JWKS_URL`) memakai `@supabase/server`
  (`withSupabase`, `verifyAuth`), sehingga Route Handlers dan Server Actions
  tidak perlu memvalidasi token sendiri.
- **Database** aplikasi berjalan di Supabase Postgres, bukan container
  PostgreSQL di VM. `pgcrypto` dan `pgvector` tetap dipakai; queue tetap
  `pg-boss` karena hanya butuh PostgreSQL (ADR-004 tidak berubah).
- **Kredensial:**
  - `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` boleh dipakai klien sisi user.
  - `SUPABASE_SECRET_KEY` hanya untuk server (Route Handlers, Server Actions,
    worker) dan tidak boleh dikirim ke browser.
  - Nilai disimpan di `.env` (root, untuk worker/runner) dan `apps/web/.env.local`
    (dimuat Next.js). Keduanya di-ignore oleh Git.
- **Migration** dikelola lewat Supabase MCP / Supabase CLI, bukan `drizzle-kit`
  ke database lokal.
- ADR-003 dan ADR-014 berstatus digantikan oleh keputusan ini.

**Konsekuensi:**

- Backup, upgrade, dan ketersediaan database tidak lagi tanggung jawab sendiri,
  tetapi data kandidat kini berada di infrastruktur pihak ketiga. Ini harus
  ditinjau terhadap [privacy.md](privacy.md) dan ADR-025 (consent), karena
  ADR-009 secara eksplisit membatasi pemrosesan data pada infrastruktur yang
  dikelola sendiri.
- ADR-001 hanya berlaku sebagian: VM tetap menjalankan web, worker, dan Ollama;
  database keluar dari VM dan alokasi resource 24 GB berubah.
- ADR-018 (role `app`/`analytics_ro`, larangan menyalin database produksi) perlu
  disesuaikan dengan model akses Supabase (RLS, service role, dashboard).
- Free tier Supabase memiliki batas koneksi dan dapat di-pause saat idle. Alur
  snapshot H-1 (ADR-011) dan worker `pg-boss` bergantung pada database yang
  selalu hidup, sehingga perlu monitoring dan rencana upgrade.
- `setup.md` dan `architecture.md` masih mendeskripsikan PostgreSQL self-host
  dan Auth.js. Keduanya perlu pembaruan terpisah agar tidak menyesatkan.

**Catatan implementasi:**

- Paket `@supabase/server@^1.9.2` terpasang di `apps/web`.
- Skill `supabase` dan `supabase-server` tersedia untuk panduan penulisan kode
  server-side.
- Migration `migrations/0001_phase1_schema.sql` sudah diterapkan ke project
  `ktdpqfqxdnlyryvsdwnh` (migration `phase1_schema`); tipe database digenerate ke
  `packages/db/src/types.ts`.
- Phase 1 menjalankan `cv.parse` lewat worker yang **polling** tabel
  `cv_parse_runs` memakai secret key, bukan `pg-boss`. `pg-boss` tetap rencana
  saat worker membutuhkan retry terjadwal atau koneksi Postgres langsung; ini
  tidak mengubah ADR-004, hanya menunda pemakaiannya.
- Storage file (CV mentah dan PDF hasil render) tetap di disk VM, bukan Supabase
  Storage.

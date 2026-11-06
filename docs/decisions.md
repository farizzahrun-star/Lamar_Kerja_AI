# Log Keputusan Arsitektur (ADR)

Setiap keputusan besar dicatat di sini agar alasan dan konsekuensinya tidak
hilang. Format ringkas: konteks, keputusan, konsekuensi.

Tanggal awal pencatatan: 6 November 2026.

---

## ADR-001: Satu VM untuk seluruh layanan

**Status:** Diterima

**Konteks:** Target 10 user dalam 3 bulan, tanpa GPU, dan harus gratis.

**Keputusan:** Web, worker, PostgreSQL, dan Ollama berjalan di satu Oracle Cloud
Always Free VM (ARM, 2 OCPU / 12 GB RAM).

**Konsekuensi:**

- Biaya $0 dan satu titik backup.
- Tidak ada horizontal scaling; cukup untuk beban saat ini.
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

**Status:** Diterima

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

**Status:** Diterima

**Konteks:** Data kandidat tidak boleh keluar ke provider AI, dan tidak ada GPU.

**Keputusan:** Seluruh fitur inti harus berjalan dengan `AI_ENABLED=false`.

**Konsekuensi:**

- AI tidak pernah menjadi dependency pada build, migration, atau test.
- Kualitas dasar lebih konsisten dan bisa dijelaskan.
- LLM hanya menambah variasi pada draft, bukan menggantikan logika inti.

---

## ADR-006: CV selalu dihasilkan dari template

**Status:** Diterima

**Konteks:** `README.md` melarang AI mengarang pengalaman, pendidikan, atau
sertifikasi.

**Keputusan:** CV dirender dari data terstruktur dengan `@react-pdf/renderer`.
LLM tidak pernah menyusun isi CV.

**Konsekuensi:**

- Nol risiko halusinasi pada dokumen utama.
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

## ADR-008: Ollama CPU-only dan opsional

**Status:** Diterima

**Konteks:** Tidak ada GPU lokal. Model 4B pada CPU mampu menghasilkan draft
pendek dengan kecepatan 3-10 token/detik.

**Keputusan:** Gunakan `qwen3:4b` melalui Ollama, dijalankan lewat queue,
dinonaktifkan secara default.

**Konsekuensi:**

- Satu draft memakan waktu puluhan detik; ini dapat diterima karena async.
- Butuh `num_ctx=8192` agar deskripsi lowongan tidak terpotong.
- Kegagalan Ollama tidak boleh terlihat oleh user; sistem jatuh ke template.

---

## ADR-009: Interpretasi privasi - boleh di VM sendiri

**Status:** Diterima

**Konteks:** Ada tiga kemungkinan interpretasi "data CV tidak keluar ke
provider".

**Keputusan:** Data boleh diproses di VM yang dikelola sendiri (Oracle), tetapi
tidak boleh dikirim ke layanan AI komersial mana pun.

**Konsekuensi:**

- Gemini, OpenRouter, Cloudflare Workers AI, dan Hugging Face Inference tidak
  dipakai untuk data kandidat.
- Oracle Cloud diterima sebagai penyedia infrastruktur.
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
berat untuk VM 12 GB.

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

**Status:** Diterima

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

## ADR-021: LLM hanya menghasilkan teks

**Status:** Diterima

**Konteks:** Kebingungan umum: apakah LLM bisa "mengirim" lamaran. LLM hanya
bisa menghasilkan teks; yang mengirim adalah adapter (Gmail API, Playwright).

**Keputusan:**

- LLM hanya dipanggil oleh `application.prepare` untuk menyusun teks:
  cover letter, subject/body email, pesan reach-out HR, jawaban form.
- Adapter `email.send` dan `portal.apply` tidak memakai LLM.
- LLM tidak memilih lowongan, tidak menentukan skor matching, tidak menekan
  tombol apa pun.
- Teks hasil LLM dievaluasi dulu: validasi zod, cek fakta terhadap profil,
  pertanyaan sensitif dari `portal_answers`, bukan LLM.
- Jika LLM gagal/timeout: fallback template instan, tidak error ke user.

**Konsekuensi:**

- Arsitektur pemisahan jelas: LLM sebagai alat writing, adapter sebagai alat
  sending.
- Ollama CPU-only cukup; inference 1-2 menit per draft tidak memblokir UI.
- Pilot error LLM tidak mengganggu antrean; fallback otomatis.
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

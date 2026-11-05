# Arsitektur Sistem

## Gambaran Besar

Sistem terdiri dari frontend dashboard, REST API, worker queue, database, penyimpanan dokumen, layanan AI, dan provider email.

```text
Pengguna
   |
   v
Web Dashboard
   |
   v
REST API  ----> PostgreSQL
   |             |
   |             +--> File Storage
   |
   +-----------> Redis Queue
                    |
                    v
              Background Workers
                    |
                    +--> AI Provider
                    +--> Email Provider
                    +--> PDF Generator
                    +--> Job Sources
```

## Komponen

### Web Dashboard

Tanggung jawab utama:

- Autentikasi pengguna.
- Manajemen profil dan CV.
- Pengaturan preferensi pekerjaan.
- Daftar lowongan dan skor kecocokan.
- Review draft CV dan email.
- Tombol approval dan pengiriman.
- Status dan riwayat lamaran.

### REST API

Gunakan FastAPI atau NestJS untuk:

- CRUD profil, resume, lowongan, dan aplikasi.
- Endpoint workflow review dan approval.
- Integrasi OAuth Gmail atau Microsoft Graph.
- Pembuatan job untuk queue.
- Pengambilan status job dan tracking aplikasi.
- Pengaturan keamanan dan audit log.

### PostgreSQL

Gunakan PostgreSQL sebagai sumber kebenaran untuk data terstruktur.

Entitas awal:

```text
users
profiles
resumes
jobs
job_matches
applications
drafts
email_messages
tracking_events
oauth_connections
```

Usulkan field utama untuk `applications`:

```text
id
user_id
job_id
status
match_score
resume_version_id
draft_id
recipient_email
approved_at
sent_at
created_at
updated_at
```

### Redis Queue

Gunakan Redis dan worker queue untuk operasi yang lama:

- Sinkronisasi lowongan.
- Analisis kecocokan.
- Generate draft.
- Konversi CV ke PDF.
- Pengiriman email.
- Jadwal follow-up.
- Sinkronisasi inbox.

Worker disarankan memanfaatkan retry, idempotency key, dan dead-letter queue.

### File Storage

Gunakan S3-compatible storage untuk:

- CV asli kandidat.
- PDF CV yang sudah disesuaikan.
- Surat lamaran.
- Template dokumen.
- Lampiran email.

Metadata file tetap disimpan di PostgreSQL. Jangan memperlakukan object storage sebagai database.

## Pipeline AI

```text
Input Profil
Input CV
Deskripsi Lowongan
       |
       v
Ekstraksi informasi terstruktur
       |
       v
Pencocokan skill dan pengalaman
       |
       v
Generator draft CV dan email
       |
       v
Fact check terhadap data kandidat
       |
       v
Draft JSON untuk review manusia
```

Contoh bobot kecocokan awal:

```text
40%  Skill wajib
25%  Pengalaman relevan
15%  Lokasi dan preferensi kerja
10%  Pendidikan
10%  Industri atau bidang perusahaan
```

Skor hanya sebagai ranking awal. Keputusan kandidat tetap menjadi otoritas akhir.

## Integrasi Email

Gunakan Gmail API atau Microsoft Graph API dengan OAuth.

```text
Connect account
    |
    v
Generate draft
    |
    v
User review
    |
    v
Approve and send
    |
    v
Save message ID
    |
    v
Track reply
```

Jangan menyimpan password email. Jangan mengaktifkan auto-send pada versi awal.

## Sumber Lowongan

Gunakan API resmi bila tersedia. Alternatif awal:

- URL lowongan yang dimasukkan pengguna.
- Teks lowongan hasil copy/paste.
- Import CSV.
- Feed atau API lowongan yang tersedia.
- Integrasi browser yang hanya mengekstrak halaman yang diizinkan.

Hindari scraping agresif dan hormati robots.txt serta ketentuan situs.

## Keamanan dan Compliance

- Simpan access token OAuth terenkripsi.
- Gunakan scope OAuth seminimal mungkin.
- Semua draft dan pengiriman memiliki audit trail.
- Terapkan rate limit pada email dan pencarian lowongan.
- Redaksi data sensitif dari log dan observability.
- Pastikan URL callback OAuth tervalidasi.
- Jangan mempersingkat atau menyembunyikan link penerima.
- Berikan kill switch untuk menghentikan seluruh queue pengiriman.
- Tambahkan manual approval pada awal produk.

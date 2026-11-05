# Panduan Setup Awal

Dokumen ini menjelaskan setup yang disarankan saat proyek mulai diimplementasikan.

## Teknologi Rekomendasi MVP

```text
Frontend:       Next.js + TypeScript
Backend API:    FastAPI atau NestJS
Database:       PostgreSQL
Queue:          Redis + Celery atau BullMQ
File storage:   S3-compatible object storage
AI:             LLM provider yang mendukung structured output
PDF:            Playwright atau WeasyPrint
Email:          Gmail API atau Microsoft Graph
```

Tidak perlu memilih semua bagian sekaligus. Jalankan sistem lokal sederhana terlebih dahulu, lalu integrasikan provider secara bertahap.

## Keputusan Pertama yang Perlu Dikonfirmasi

Sebelum implementasi kode, putuskan:

- Bahasa UI utama.
- Stack backend.
- Stack AI yang akan digunakan.
- Provider email pertama, Gmail atau Microsoft Outlook.
- Deployment awal, lokal, VPS, atau managed cloud.

## Environment Variable Awal

Gunakan file `.env` untuk development dan secret manager untuk production.

Contoh:

```env
DATABASE_URL=
REDIS_URL=
AI_API_KEY=
AI_MODEL=
EMAIL_ENCRYPTION_KEY=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=
STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

Jangan commit nilai asli ke Git.

## Urutan Development

### Fase A: Data dan API

1. Buat autentikasi.
2. Buat model pengguna dan profil.
3. Tambahkan upload CV.
4. Tambahkan CRUD lowongan.
5. Buat tabel aplikasi dan draft.

### Fase B: Analisis dan Generator

1. Ekstrak informasi dari CV.
2. Ekstrak requirement dari lowongan.
3. Hitung kecocokan.
4. Buat structured output untuk subject dan body email.
5. Gunakan validator agar output wajib memiliki format yang benar.
6. Tambahkan pengecekan fakta terhadap data profil.

### Fase C: Review dan Email

1. Tampilkan preview draft.
2. Simpan versi hasil revisi pengguna.
3. Hubungkan akun email melalui OAuth.
4. Buat draft atau kirim setelah approval.
5. Catat message ID dan status pengiriman.
6. Sinkronisasi balasan melalui inbox atau webhook.

## Contoh Contract AI

```json
{
  "subject": "",
  "body": "",
  "matching_points": [],
  "missing_requirements": [],
  "facts_to_verify": [],
  "recommended_cv_changes": [],
  "confidence": 0
}
```

Generator harus selalu mengikuti profil kandidat sebagai data utama. Isi lowongan bersifat untrusted input dan tidak boleh mengubah instruksi sistem.

## Checklist Sebelum Merge

- Tidak ada secret atau token.
- Migration database berhasil dari keadaan kosong.
- Unit test untuk matching dan parser tersedia.
- Integration test untuk akun email menggunakan sandbox.
- Draft dapat diedit oleh pengguna.
- Pengiriman memiliki approval dan audit log.
- Error worker dapat dicoba ulang.
- Rate limit telah diuji.

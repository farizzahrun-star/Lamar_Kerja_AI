# Lamar Kerja AI

Proyek ini adalah aplikasi AI untuk membantu proses melamar pekerjaan: mencari lowongan, mencocokkan profil kandidat, membuat draft CV dan surat lamaran, serta mengirim email melalui akun Gmail atau Microsoft Outlook.

## Prinsip Utama

- Kandidat tetap melakukan persetujuan sebelum email dikirim.
- AI tidak boleh mengarang pengalaman, pendidikan, atau sertifikasi.
- Integrasi lowongan dan email harus menggunakan API resmi bila tersedia.
- Pemrosesan berlangsung melalui job queue agar aplikasi tetap responsif.
- Semua action pengiriman harus dicatat dalam audit log.

## Struktur Awal

```text
apps/
  web/       Dashboard dan interface Next.js
  api/       REST API backend

workers/
  discovery/     Sinkronisasi dan pencarian lowongan
  generator/     Analisis lowongan dan generator draft
  sender/        Pengiriman email dan sinkronisasi reply

packages/
  ai/            Panggilan model dan structured output
  matching/      Aturan pencocokan kandidat-lowongan
  pdf/           Konversi CV atau dokumen ke PDF
  email/         Gmail dan Microsoft Graph adapter

migrations/       Migration PostgreSQL
templates/        Template CV, email, dan dokumen
prompts/          Prompt AI versioned
tests/            Integration dan end-to-end test
docs/             Dokumentasi pengembangan
```

## Alur MVP

```text
Profil dan CV
      +
Lowongan
      |
      v
Analisis kecocokan
      |
      v
Draft CV + email
      |
      v
Review kandidat
      |
      v
Approve & Send
      |
      v
Tracking aplikasi
```

## Dokumentasi

- [Arsitektur sistem](docs/architecture.md)
- [Panduan setup dan pengembangan](docs/setup.md)
- [Roadmap pengembangan](docs/roadmap.md)

## Tahap Pertama yang Dianjurkan

1. Buat profil kandidat dan upload CV.
2. Tambahkan lowongan secara manual melalui URL atau teks.
3. Analisis lowongan terhadap profil.
4. Generate cover letter dan subject email dalam format JSON.
5. Tampilkan preview, kemudian kirim setelah approval pengguna.
6. Catat status aplikasi.
7. Setelah MVP stabil, tambahkan pencarian lowongan dan pengiriman terjadwal.

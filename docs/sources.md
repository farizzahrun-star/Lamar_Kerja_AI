# Sumber Lowongan

## Posisi Proyek

Prioritas proyek adalah **cakupan lowongan** dari LinkedIn, Glints, Jobstreet,
Glassdoor, dan situs lain, dengan biaya **$0**. Karena itu sumber utama adalah
**scraping guest** menggunakan Playwright yang dijalankan oleh Local Runner.

Keputusan ini menggantikan posisi sebelumnya ("scraping tidak termasuk MVP").
Alasan perubahan dicatat di [decisions.md](decisions.md) (ADR-019).

Alur lengkap ada di [workflow.md](workflow.md) bagian Tahap 1.

## Aturan Scraping

### Wajib

1. **Guest saja.** Tidak memakai akun, cookie akun, atau sesi login.
2. **Volume rendah.** Maksimal 10 lowongan baru per platform per hari.
3. **Jeda manusia.** Acak 20-45 detik antar halaman.
4. **Sekuensial.** Satu browser, satu tab aktif, tidak paralel.
5. **Berhenti saat diblokir.** Login wall, CAPTCHA, atau HTTP 403/429 berarti
   platform tersebut dihentikan untuk hari itu.
6. **Hanya data lowongan.** Tidak mengambil profil orang, foto, atau data
   pribadi rekruter selain email HR yang dicantumkan pada lowongan.
7. **Dijalankan dari IP residensial** (Local Runner di laptop/PC), bukan dari
   VM Oracle.
8. **Kill switch per platform** melalui `job_sources.enabled`.

### Dilarang

- CAPTCHA solver.
- Rotasi proxy atau proxy residensial berbayar.
- Memakai akun pribadi atau akun palsu untuk scraping.
- Menyamarkan diri untuk menembus proteksi setelah diblokir.
- Menaikkan volume di atas batas tanpa ADR baru.

### Risiko yang Diterima

Ketentuan layanan platform-platform ini umumnya melarang pengambilan data
otomatis. Proyek ini menerima risikonya karena hanya dipakai tim internal dengan
volume sangat rendah. Dampak terburuk yang diharapkan pada tahap 1 adalah IP
rumah terkena CAPTCHA atau blokir sementara, **bukan** ban akun, karena tidak
ada akun yang dipakai.

Jika aplikasi dibuka untuk publik atau dikomersialkan, keputusan ini wajib
ditinjau ulang.

## Status Per Platform

| Platform | Prioritas | Mode | Ekspektasi | Status |
|---|---|---|---|---|
| Glints | 1 | Guest | Stabil; detail lowongan umumnya terbuka | Rencana Phase 2 |
| Jobstreet | 2 | Guest | Umumnya terbuka dari IP residensial | Rencana Phase 2 |
| LinkedIn | 3 | Guest (halaman pencarian publik) | Terbatas; sering authwall setelah beberapa halaman | Rencana Phase 2 |
| Glassdoor | 4 | Guest | Best effort; hampir selalu meminta login | Rencana Phase 7 |
| ATS publik (Greenhouse, Lever, Ashby, Workable) | 5 | HTTP JSON | Stabil, tanpa browser | Rencana Phase 7 |
| URL manual / teks / CSV | - | Manual | Selalu tersedia sebagai cadangan | Rencana Phase 2 |

## Struktur Adapter

Setiap platform memiliki satu adapter di Local Runner:

```text
runner/src/adapters/
  glints.ts
  jobstreet.ts
  linkedin.ts
  glassdoor.ts
```

Kontrak adapter:

```ts
interface SourceAdapter {
  platform: 'glints' | 'jobstreet' | 'linkedin' | 'glassdoor' | string
  search(page: Page, plan: SearchPlan): AsyncIterable<JobCard>
  detail(page: Page, card: JobCard): Promise<RawJob>
  isBlocked(page: Page): Promise<boolean>
}
```

Aturan pengembangan adapter:

- Navigasi dan pengambilan data memakai Playwright **deterministik** (selector
  tetap), bukan agent yang memutuskan langkah sendiri.
- Unit test memakai fixture HTML tersimpan, tidak memanggil situs asli.
- Setiap adapter wajib mengimplementasikan `isBlocked`.
- Simpan HTML mentah lowongan untuk debug selama 7 hari, lalu hapus.

### Peran Browser Use / Agent

Agent browser (misalnya Browser Use) **tidak dipakai saat runtime**. Agent boleh
dipakai saat development untuk menjelajah halaman baru dan membantu menemukan
selector, lalu hasilnya ditulis ulang sebagai adapter Playwright deterministik.

Ekstraksi HTML menjadi JSON boleh memakai LLM lokal jika selector tidak cukup,
karena data lowongan publik tidak mengandung data kandidat.

## Rencana Pencarian

VM menyusun rencana untuk Local Runner setiap hari:

```json
{
  "date": "2026-11-06",
  "platforms": [
    {
      "platform": "glints",
      "limit": 10,
      "queries": [
        { "keyword": "frontend developer", "location": "Jakarta" },
        { "keyword": "react developer", "location": "Remote" }
      ]
    }
  ]
}
```

- Kata kunci berasal dari gabungan `user_interests` seluruh user tim.
- Kuota 10 dibagi rata antar kata kunci.
- Lowongan yang sudah dikenal (`external_id` atau `raw_hash`) dilewati dan tidak
  dihitung dalam kuota.

## Deteksi Channel Apply

Saat ingest, worker menentukan cara melamar:

| Channel | Kondisi | Tahap 4 |
|---|---|---|
| `email` | Deskripsi mencantumkan email HR/rekrutmen | Gmail API otomatis |
| `easy_apply` | Tombol apply internal platform (LinkedIn Easy Apply, Glints, Jobstreet Quick Apply) | Local Runner isi form |
| `portal` | Mengarah ke ATS/portal perusahaan dengan adapter tersedia | Local Runner isi form |
| `link` | Selain di atas | Paket lamaran + user melamar manual |

Satu lowongan bisa punya lebih dari satu channel; urutan preferensi:
`email` -> `easy_apply` -> `portal` -> `link`.

## Format CSV Import

Cadangan manual saat runner tidak berjalan.

Kolom minimal:

```csv
title,company,location,work_mode,description,url,posted_at
```

Kolom opsional:

```csv
salary_min,salary_max,external_id,source_name,hr_email
```

Aturan:

- Baris tanpa `title` atau `company` ditolak dan dilaporkan.
- `url` dipakai untuk dedupe jika ada.
- Jika `url` kosong, `raw_hash` dihitung dari title + company + location.

## Dedupe

```text
raw_hash = sha256(lower(trim(title)) + lower(trim(company)) + lower(trim(location)))
```

- Prioritas identitas: `(platform, external_id)` -> `url` kanonik -> `raw_hash`.
- Lowongan yang sama dari platform berbeda digabung; semua URL disimpan agar
  channel apply terbaik bisa dipilih.
- Lowongan yang ditemukan lagi hanya memperbarui `last_seen_at`.

## Monitoring

Setiap run dicatat di `collector_runs`:

```text
platform, run_date, started_at, finished_at,
found, new, skipped_known, blocked(bool), error_count, last_error
```

Alert (ditampilkan di dashboard admin):

- Platform terblokir 3 hari berturut-turut.
- Success rate adapter < 80% selama 3 hari.
- Tidak ada run sama sekali dalam 48 jam (runner mati).

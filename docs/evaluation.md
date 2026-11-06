# Panduan Evaluasi Model

Dokumen ini menjelaskan cara mengukur kualitas draft dan model AI. Evaluasi
harus dilakukan **sebelum** training, **saat** membandingkan model, dan
**setiap kali** mengubah prompt atau template.

## Mengapa Evaluasi Dulu

Tanpa eval set, perubahan model hanya berdasarkan kesan. Masalah yang sering
muncul:

- Model baru terasa lebih enak dibaca, tetapi mengarang satu pengalaman.
- JSON lebih rapi, tetapi requirement penting tidak disebut.
- Kualitas naik di satu jenis lowongan, turun di jenis lain.

Eval set yang kecil tetapi konsisten lebih berguna daripada penilaian subjektif.

## Dataset Evaluasi

### Ukuran

| Tahap | Jumlah contoh |
|---|---|
| Smoke test saat development | 10 |
| Evaluasi rutin | 50 |
| Evaluasi sebelum rilis model | 100 |

### Komposisi

Dataset harus mencakup variasi:

- Fresh graduate dan berpengalaman.
- Lowongan teknis dan non-teknis.
- Requirement yang terpenuhi sebagian.
- Lowongan dengan deskripsi sangat panjang.
- Lowongan dengan bahasa campuran Indonesia-Inggris.
- Kasus di mana kandidat **tidak** memenuhi syarat utama.

### Format

Satu file JSONL per kasus:

```jsonl
{"id":"case-001","profile_id":"synthetic-01","job_id":"job-042","expected":{"must_mention":["typescript","react"],"must_not_claim":["gelar S2","pengalaman 5 tahun"],"must_report_missing":["kubernetes"]}}
```

Aturan:

- `profile_id` dan `job_id` merujuk ke fixture, bukan data produksi.
- `must_mention` adalah fakta yang wajib muncul.
- `must_not_claim` adalah hal yang dilarang muncul (uji halusinasi).
- `must_report_missing` menguji kejujuran model soal kekurangan.

## Metrik

### 1. Schema Validity

Persentase output yang lolos validasi zod tanpa perbaikan.

```text
target: 100%
minimum: 98%
```

Jika di bawah minimum, perbaiki prompt atau gunakan structured output yang lebih
ketat.

### 2. Factuality

Jumlah klaim yang tidak didukung data profil. Ini metrik terpenting.

```text
target: 0 halusinasi
minimum: 0 halusinasi
```

Satu klaim palsu tentang pengalaman, pendidikan, atau sertifikasi menggugurkan
model, sebaik apa pun metrik lainnya.

Cara mengukur:

1. Ekstrak semua klaim faktual dari draft.
2. Cocokkan dengan data profil dan lowongan.
3. Tandai klaim yang tidak punya sumber.

### 3. Requirement Coverage

Persentase requirement utama lowongan yang disebut atau dijawab di draft.

```text
target: >= 80%
```

### 4. Missing Detection

Persentase requirement yang tidak dipenuhi dan **dilaporkan** dengan benar di
`missing_requirements`.

```text
target: >= 90%
```

Model yang menyembunyikan kekurangan lebih berbahaya daripada model yang jujur.

### 5. Relevance

Apakah `matching_points` benar-benar relevan dengan lowongan, bukan pujian umum.
Dinilai manusia dengan skala 1-5.

### 6. Latency

| Metrik | Target CPU | Target GPU |
|---|---|---|
| p50 generate | < 90 detik | < 10 detik |
| p95 generate | < 180 detik | < 20 detik |
| Timeout rate | < 2% | < 1% |

Karena draft dibuat lewat queue, latency tidak memblokir UI. Tetap catat agar
tidak memburuk diam-diam.

### 7. Human Preference

Perbandingan buta antara dua output (template vs LLM, atau model lama vs baru).
Penilai tidak tahu mana yang dihasilkan model mana.

## Rubrik Penilaian Manusia

Gunakan skala 1-5 untuk setiap aspek:

| Skor | Relevansi | Nada | Kejujuran |
|---|---|---|---|
| 5 | Sangat spesifik ke lowongan | Profesional dan natural | Semua kekurangan dilaporkan |
| 4 | Sebagian besar spesifik | Baik, sedikit kaku | Kekurangan utama dilaporkan |
| 3 | Umum tetapi masih relevan | Dapat diterima | Sebagian kekurangan terlewat |
| 2 | Terlalu umum | Terasa template | Menyembunyikan kekurangan |
| 1 | Tidak relevan | Tidak profesional | Menyesatkan |

Setiap penilaian wajib disertai alasan singkat. Tanpa alasan, skor tidak dipakai.

## Harness Evaluasi

Struktur yang disarankan:

```text
tests/eval/
  dataset/
    draft-cases.jsonl
    fixtures/
      profiles/*.json
      jobs/*.json
  run.ts              # menjalankan semua kasus
  metrics.ts          # menghitung metrik
  report.ts           # menulis CSV + ringkasan
  results/            # output per run (gitignored)
```

Alur `run.ts`:

```text
untuk setiap kasus:
  1. muat fixture profil dan lowongan
  2. jalankan generator (template atau LLM)
  3. validasi schema
  4. hitung metrik otomatis
  5. simpan output mentah + hasil

setelah semua kasus:
  1. agregasi metrik
  2. tulis CSV
  3. bandingkan dengan baseline
  4. cetak lulus/tidak lulus gate
```

Contoh perintah:

```bash
pnpm eval --dataset tests/eval/dataset/draft-cases.jsonl \
          --model qwen3:4b \
          --out tests/eval/results/2026-11-06-qwen3-4b
```

Output CSV minimal:

```csv
case_id,schema_valid,factuality_violations,coverage,missing_detected,latency_ms,human_score,notes
case-001,true,0,0.85,1.0,74210,4,"nada baik, satu requirement terlewat"
```

## Gate Kualitas

Model atau prompt baru hanya boleh dipakai jika:

- [ ] Schema validity >= 98%.
- [ ] Factuality violations = 0.
- [ ] Requirement coverage >= 80%.
- [ ] Missing detection >= 90%.
- [ ] Tidak ada regresi lebih dari 5% pada metrik lain dibanding baseline.
- [ ] Human preference tidak lebih buruk dari baseline.
- [ ] Timeout rate < 2%.

Jika salah satu gagal, jangan deploy. Perbaiki prompt, data, atau model.

## Regresi dan Riwayat

Setiap run menyimpan metadata:

```json
{
  "run_id": "2026-11-06-qwen3-4b",
  "model": "qwen3:4b",
  "prompt_version": "2026-11-01",
  "dataset_version": "draft-cases-v1",
  "template_version": "cv-b-3",
  "metrics": { "schema_validity": 0.99, "factuality_violations": 0 },
  "git_commit": "abc1234"
}
```

Simpan hasil di `tests/eval/results/` (tidak di-commit kecuali ringkasan).
Ringkasan per rilis dicatat di changelog internal.

## Evaluasi Non-LLM

Jangan lupakan komponen yang tidak memakai model:

| Komponen | Cara evaluasi |
|---|---|
| Template CV | Render 20 profil fixture, cek layout dan data hilang |
| Rules matching | Bandingkan skor dengan penilaian manual 20 lowongan |
| Normalizer lowongan | Uji dengan 30 HTML/CSV contoh |
| Snapshot H-1 | Uji fallback saat snapshot kosong atau worker gagal |

## Biaya dan Waktu

| Aktivitas | Waktu |
|---|---|
| Smoke test 10 kasus di CPU | 5-10 menit |
| Evaluasi 50 kasus di CPU | 30-60 menit |
| Evaluasi 50 kasus di GPU | 5-10 menit |
| Penilaian manusia 50 output | 2-3 jam |

## Checklist Sebelum Menyatakan Model "Lebih Baik"

- [ ] Dataset evaluasi tidak berubah sejak baseline diukur.
- [ ] Baseline dijalankan ulang pada environment yang sama.
- [ ] Semua metrik otomatis dihitung, bukan diperkirakan.
- [ ] Penilaian manusia dilakukan buta.
- [ ] Hasil disimpan dengan versi model, prompt, dan commit.
- [ ] Keputusan deploy dan alasan dicatat.

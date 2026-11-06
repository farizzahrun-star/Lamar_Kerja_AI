# Panduan Evaluasi Model

Dokumen ini menjelaskan cara mengukur kualitas **draf lamaran** dan **ekstraksi
CV** dari model AI. Evaluasi harus dilakukan **sebelum** training, **saat**
membandingkan model, dan **setiap kali** mengubah prompt, schema, atau template.

## Mengapa Evaluasi Dulu

Tanpa eval set, perubahan model hanya berdasarkan kesan. Masalah yang sering
muncul:

- Model baru terasa lebih enak dibaca, tetapi mengarang satu pengalaman.
- JSON lebih rapi, tetapi requirement penting tidak disebut.
- Kualitas naik di satu jenis lowongan, turun di jenis lain.
- Ekstraksi CV terlihat benar, tetapi satu tanggal atau GPA dikarang.

Eval set yang kecil tetapi konsisten lebih berguna daripada penilaian subjektif.

## Dua Task yang Dievaluasi

| Task | Input | Output | Metrik utama |
|---|---|---|---|
| `application.prepare` (draf) | Profil + lowongan | JSON teks lamaran | Factuality, coverage, missing detection |
| `cv.parse` (ekstraksi) | Teks CV per bagian | JSON field profil | Field-level F1, hallucination rate, schema validity |

Keduanya punya dataset dan gate terpisah. Jangan menggabungkan hasilnya menjadi
satu skor tunggal.

## Dataset Evaluasi

### Ukuran

| Tahap | Draf | CV parsing |
|---|---|---|
| Smoke test saat development | 10 | 10 CV (40 bagian) |
| Evaluasi rutin | 50 | 50 CV (200 bagian) |
| Evaluasi sebelum rilis model | 100 | 100 CV (400 bagian) |

### Komposisi

Dataset draf harus mencakup variasi:

- Fresh graduate dan berpengalaman.
- Lowongan teknis dan non-teknis.
- Requirement yang terpenuhi sebagian.
- Lowongan dengan deskripsi sangat panjang.
- Lowongan dengan bahasa campuran Indonesia-Inggris.
- Kasus di mana kandidat **tidak** memenuhi syarat utama.

Dataset CV parsing harus mencakup variasi:

- CV 1 kolom dan 2 kolom/tabel (uji kualitas ekstraksi teks).
- CV bahasa Indonesia, Inggris, dan campuran.
- CV fresh graduate (organisasi/magang) dan > 5 tahun (banyak bullet).
- CV dengan tanggal ambigu ("2021 - sekarang", hanya tahun).
- CV tanpa GPA, tanpa skill level, tanpa email/telepon.
- CV hasil scan tanpa layer teks (harus `skipped`, bukan dipaksakan).

### Format

**Task draf** — satu file JSONL per kasus:

```jsonl
{"id":"case-001","profile_id":"synthetic-01","job_id":"job-042","expected":{"must_mention":["typescript","react"],"must_not_claim":["gelar S2","pengalaman 5 tahun"],"must_report_missing":["kubernetes"]}}
```

**Task CV parsing** — satu baris per CV/bagian, dengan ground truth field-level:

```jsonl
{"id":"cv-001-experiences","section":"experiences","cv_fixture":"cv-001.txt","expected":{"experiences":[{"company":"[PERUSAHAAN]","title":"Software Engineer","employment_type":"full_time","start_date":"2022-01","end_date":null,"is_current":true}]}}
```

Aturan:

- `profile_id`, `job_id`, dan `cv_fixture` merujuk ke fixture, bukan data
  produksi.
- `must_mention` adalah fakta yang wajib muncul.
- `must_not_claim` adalah hal yang dilarang muncul (uji halusinasi).
- `must_report_missing` menguji kejujuran model soal kekurangan.
- Ground truth CV parsing harus punya `source_span` (posisi teks asli) agar
  hallucination bisa dihitung otomatis.

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

## Evaluasi CV Parsing (`cv.parse`)

### Definisi "Benar" per Field

| Field | Aturan pencocokan |
|---|---|
| String (nama, judul, kota) | Normalisasi lowercase/trim/hapus tanda baca, lalu exact |
| Perusahaan/institusi | Fuzzy token overlap ≥ 0.85 (atau Levenshtein) |
| Tanggal | Sama setelah normalisasi `YYYY-MM`; toleransi ±1 bulan untuk `end_date` |
| `is_current` | Exact boolean |
| GPA | Toleransi ±0.05 |
| Skill | Kamus sinonim (`js`=`javascript`, `node`=`node.js`) |
| Multi-value (points) | Hitung per item, bukan per array |

### Metrik Wajib

| Metrik | Definisi | Minimum | Target |
|---|---|---|---|
| `schema_validity` | Output lolos zod tanpa repair / total | 98% | ≥ 99.5% |
| `field_precision` | Field benar / field diprediksi | 0.85 | ≥ 0.92 |
| `field_recall` | Field benar / field di ground truth | 0.80 | ≥ 0.90 |
| `field_f1` | Harmonic mean P/R per section | 0.82 | ≥ 0.91 |
| `hallucination_rate` | Field tanpa dukungan `source_snippet` valid / total field | ≤ 2% | ≤ 0.5% |
| `omission_rate` | Field ground truth yang tidak diekstrak | ≤ 15% | ≤ 8% |
| `latency_p95` | Parse penuh 4 bagian di CPU 4 OCPU | ≤ 180 s | ≤ 120 s |
| `skip_correctness` | PDF scan ditandai `skipped` (bukan failed/hallucinated) | 100% | 100% |
| `consent_enforcement` | Request tanpa consent ditolak 403 | 100% | 100% |

### Hallucination Rate (metrik terpenting)

Satu field dianggap halusinasi jika:

1. `source_snippet` tidak ditemukan sebagai substring pada teks CV yang sudah
   dinormalisasi, **atau**
2. Field tidak ada di ground truth dan tidak punya dukungan teks.

```text
hallucination_rate = field_tanpa_dukungan / total_field_diprediksi
```

Target Phase 1 ≤ 2%, Phase 6 ≤ 0.5%. Model dengan F1 tinggi tetapi
hallucination > 2% **tidak boleh** dipromosikan.

### Per-Section Reporting

Laporkan F1 per bagian, bukan hanya agregat:

| Section | Yang diuji |
|---|---|
| `identity` | Nama, headline, kontak, link |
| `experiences` | Perusahaan, jabatan, tanggal, bullet |
| `educations` | Institusi, jenjang, jurusan, GPA, tahun |
| `skills` | Nama skill, deduplikasi sinonim |

Section dengan F1 terendah menjadi prioritas prompt/dataset berikutnya.

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
    cv-cases.jsonl
    fixtures/
      profiles/*.json
      jobs/*.json
      cvs/*.txt            # teks CV yang sudah diekstrak + anonimisasi
  run.ts              # menjalankan semua kasus
  metrics.ts          # menghitung metrik (draf + CV)
  report.ts           # menulis CSV + ringkasan
  results/            # output per run (gitignored)
```

Alur `run.ts`:

```text
untuk setiap kasus:
  1. muat fixture profil dan lowongan (atau teks CV per bagian)
  2. jalankan generator (template, LLM, atau cv.parse)
  3. validasi schema (zod)
  4. hitung metrik otomatis (termasuk field-level match untuk CV)
  5. simpan output mentah + hasil

setelah semua kasus:
  1. agregasi metrik (global + per section)
  2. tulis CSV
  3. bandingkan dengan baseline
  4. cetak lulus/tidak lulus gate
```

Contoh perintah:

```bash
pnpm eval --task draft --dataset tests/eval/dataset/draft-cases.jsonl \
          --model qwen3:4b \
          --out tests/eval/results/2026-11-06-qwen3-4b

pnpm eval --task cv --dataset tests/eval/dataset/cv-cases.jsonl \
          --model qwen3:4b \
          --out tests/eval/results/2026-11-06-cv-qwen3-4b
```

Output CSV minimal (draf):

```csv
case_id,schema_valid,factuality_violations,coverage,missing_detected,latency_ms,human_score,notes
case-001,true,0,0.85,1.0,74210,4,"nada baik, satu requirement terlewat"
```

Output CSV minimal (CV parsing):

```csv
case_id,section,schema_valid,precision,recall,f1,hallucinations,omissions,latency_ms,notes
cv-001,experiences,true,0.91,0.84,0.87,0,1,38200,"satu tanggal low-confidence"
```

## Gate Kualitas

Model atau prompt baru hanya boleh dipakai jika **gate sesuai task** terpenuhi.

**Gate task draf:**

- [ ] Schema validity >= 98%.
- [ ] Factuality violations = 0.
- [ ] Requirement coverage >= 80%.
- [ ] Missing detection >= 90%.
- [ ] Tidak ada regresi lebih dari 5% pada metrik lain dibanding baseline.
- [ ] Human preference tidak lebih buruk dari baseline.
- [ ] Timeout rate < 2%.

**Gate task CV parsing:**

- [ ] Schema validity >= 99%.
- [ ] `field_f1` naik ≥ 5 poin absolut dibanding champion.
- [ ] `hallucination_rate` tidak lebih buruk dan ≤ 1%.
- [ ] `omission_rate` tidak lebih buruk.
- [ ] `latency_p95` ≤ 1.3x champion pada CPU 4 OCPU.
- [ ] `skip_correctness` = 100% (PDF scan tidak dipaksakan).
- [ ] `consent_enforcement` = 100%.

Jika salah satu gagal, jangan deploy. Perbaiki prompt, data, atau model.

## Regresi dan Riwayat

Setiap run menyimpan metadata:

```json
{
  "run_id": "2026-11-06-cv-qwen3-4b",
  "task": "cv.parse",
  "model": "qwen3:4b",
  "prompt_version": "2026-11-06",
  "dataset_version": "cv-cases-v1",
  "schema_version": "cv-extract-v1",
  "metrics": { "schema_validity": 0.99, "field_f1": 0.86, "hallucination_rate": 0.012 },
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
| Consent gate | Request `cv.parse` tanpa consent harus 403; versi lama harus 403 |
| Retensi CV | File `delete_after` lewat 30 hari harus terhapus oleh `cv.cleanup` |

## Biaya dan Waktu

| Aktivitas | Waktu |
|---|---|
| Smoke test 10 kasus draf di CPU | 5-10 menit |
| Evaluasi 50 kasus draf di CPU | 30-60 menit |
| Evaluasi 50 CV (200 bagian) di CPU | 40-90 menit |
| Evaluasi 50 kasus di GPU | 5-10 menit |
| Penilaian manusia 50 output | 2-3 jam |

## Checklist Sebelum Menyatakan Model "Lebih Baik"

- [ ] Dataset evaluasi tidak berubah sejak baseline diukur.
- [ ] Baseline dijalankan ulang pada environment yang sama (CPU 4 OCPU).
- [ ] Semua metrik otomatis dihitung, bukan diperkirakan.
- [ ] Metrik CV dilaporkan per section, bukan hanya agregat.
- [ ] Penilaian manusia dilakukan buta.
- [ ] Hasil disimpan dengan versi model, prompt, schema, dan commit.
- [ ] Keputusan deploy dan alasan dicatat.

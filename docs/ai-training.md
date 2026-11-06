# Panduan Training Model AI

Dokumen ini menjelaskan cara menyesuaikan dan (jika benar-benar perlu) melatih
model AI proyek ini, khususnya `qwen3:4b` untuk **ekstraksi CV** dan **draf
lamaran**. Isinya mencakup batas privasi, metrik evaluasi, urutan optimasi, dan
runbook 7 hari.

Baca bersama:

- [evaluation.md](evaluation.md) — harness dan ambang kelulusan model.
- [privacy.md](privacy.md) — aturan consent dan retensi data.
- [architecture.md](architecture.md) — pipeline `cv.parse` dan service Ollama.
- [decisions.md](decisions.md) — ADR-024 (CV parsing) dan ADR-025 (consent).

## Ringkasan

Untuk 10 user dengan inference CPU-only, **training bukan prioritas**. Seluruh
alur inti berjalan tanpa LLM, dan `qwen3:4b` tanpa fine-tune sudah cukup untuk
Phase 1. Training hanya masuk akal setelah baseline prompt terbukti mentok.

Urutan eskalasi yang benar (jangan melompat):

```text
0. Rules + template murni                       (sudah ada)   <- fondasi
1. Prompt + schema JSON + few-shot               (jam)        <- mulai di sini
2. Modelfile (temperature, num_ctx, /no_think)   (jam)
3. Section-wise chunking + repair loop           (hari)
4. Confidence + review gate (turunkan error)     (hari)
5. Retrieval / RAG                               (hari)
6. Fine-tune embedding                           (hari)       <- dampak besar
7. Fine-tune LLM LoRA/QLoRA                      (minggu)     <- perlu eval set
8. Pretraining dari nol                          (tidak)      <- tidak akan dipakai
```

Aturan penting:

- **Jangan fine-tune tanpa eval set.** Tanpa itu tidak ada cara membuktikan
  model baru lebih baik.
- **Fine-tune bukan cara menambah pengetahuan.** Untuk data lowongan/perusahaan,
  gunakan RAG.
- **Fine-tune mengubah gaya dan kepatuhan format**, bukan fakta. Fakta tetap
  berasal dari CV dan database profil.
- **Output ekstraksi bukan kebenaran.** Semua saran wajib lewat review user
  (ADR-024); model tidak pernah menulis langsung ke `profiles`.

## Dua Task AI

| Aspek | `cv.parse` (ekstraksi) | `application.prepare` (draf) |
|---|---|---|
| Input | Teks CV (hasil `pdfjs-dist`/`mammoth`) | Profil + lowongan + `portal_answers` |
| Output | JSON field profil (`cv_parse_suggestions`) | JSON teks lamaran (`drafts`) |
| Determinisme | Tinggi (temperature 0) | Sedang (temperature 0.3-0.5) |
| Metrik utama | Field-level F1, hallucination rate | Factuality, coverage, human preference |
| Dampak kegagalan | User isi manual | Fallback template |
| Phase | 1 (dasar), 6 (v2) | 4 (template), opsional LLM |

Keduanya berbagi model yang sama (`qwen3:4b`), tetapi **dataset, prompt, dan
ambang evaluasinya dipisah**. Jangan mencampur task dalam satu dataset tanpa
penanda task di system prompt.

## Runtime qwen3:4b di CPU

Konfigurasi inference yang dipakai (lihat [setup.md](setup.md)):

| Parameter | Nilai | Alasan |
|---|---|---|
| Model | `qwen3:4b` Q4_K_M | ~2.5 GB RAM, muat di container 5 GB |
| `num_ctx` | `8192` | Cukup untuk 1 bagian CV + instruksi |
| `num_predict` | `1024` (per bagian) | Cegah generasi liar |
| `temperature` | `0` (ekstraksi) / `0.3` (draf) | Determinisme vs variasi |
| `top_p` | `0.9` | — |
| `OLLAMA_NUM_PARALLEL` | `1` | Hemat CPU, eksekusi sekuensial |
| `OLLAMA_KEEP_ALIVE` | `5m` | Hindari load ulang model tiap job |
| `think` | `false` | Wajib untuk task ekstraksi |

### Mode thinking Qwen3 wajib dimatikan

Qwen3 punya *thinking mode* yang menghasilkan blok `...` sebelum jawaban.
Di CPU ARM ini bisa menambah 2-4x latensi tanpa manfaat untuk ekstraksi.

Cara mematikan (pakai salah satu, utamakan API):

1. **API Ollama** — kirim `"think": false` pada request `/api/chat`.
2. **Prompt** — awali instruksi dengan `/no_think` untuk model versi lama.
3. **Modelfile** — tidak ada parameter resmi `think`; jangan mengandalkannya.

Verifikasi: output tidak boleh mengandung `...` atau teks reasoning. Jika masih
muncul, naikkan versi Ollama dan pastikan `think: false` benar-benar terkirim.

### Structured output

Gunakan `format` berisi JSON Schema pada request Ollama (bukan sekadar
`format: "json"`). Ini menurunkan `schema_validity` failure secara drastis.

```json
{
  "model": "qwen3:4b",
  "think": false,
  "format": { "type": "object", "properties": { "...": {} } },
  "options": { "temperature": 0, "num_ctx": 8192, "num_predict": 1024 }
}
```

Validasi tetap dilakukan dengan **zod** di aplikasi. Schema constraint di Ollama
bukan pengganti validasi server.

## Task 1: Ekstraksi CV (`cv.parse`)

### Pipeline

```text
upload (PDF/DOCX <= 10 MB)
  -> ekstraksi teks lokal (pdfjs-dist / mammoth)
  -> normalisasi (hapus header/footer berulang, rapikan whitespace)
  -> jika teks < 50 karakter: status skipped (PDF scan, tanpa LLM)
  -> potong per bagian (identity, experiences, educations, skills)
  -> 4 panggilan Ollama terpisah (num_ctx 8192, think=false, format=schema)
  -> validasi zod per bagian
  -> repair 1x jika invalid, lalu failed
  -> simpan ke cv_parse_suggestions (status pending, confidence, source_snippet)
  -> review user -> accept -> merge ke profiles/educations/experiences/skills
```

Alasan section-wise, bukan satu prompt besar:

- `num_ctx` kecil dan konsisten, tidak terpotong pada CV panjang.
- Satu bagian gagal tidak menggagalkan seluruh parsing.
- Prompt per bagian lebih mudah dievaluasi (F1 per section).
- Beban CPU lebih merata; bisa di-retry tanpa mengulang semuanya.

### Target Schema

Phase 1 (wajib): `identity`, `experiences`, `educations`, `skills`.
Phase 6 (tambahan): `certifications`, `languages`, `projects`.

```json
{
  "identity": {
    "full_name": "string|null",
    "headline": "string|null",
    "email": "string|null",
    "phone": "string|null",
    "city": "string|null",
    "links": ["string"]
  },
  "experiences": [
    {
      "company": "string",
      "title": "string",
      "employment_type": "full_time|part_time|contract|internship|freelance|null",
      "start_date": "YYYY-MM|null",
      "end_date": "YYYY-MM|null",
      "is_current": "boolean",
      "points": ["string"]
    }
  ],
  "educations": [
    {
      "institution": "string",
      "level": "SMA|D3|S1|S2|S3|null",
      "major": "string|null",
      "gpa": "number|null",
      "start_year": "integer|null",
      "end_year": "integer|null"
    }
  ],
  "skills": [
    { "name": "string", "level": "beginner|intermediate|advanced|null", "years": "number|null" }
  ]
}
```

Aturan ekstraksi yang harus ada di prompt:

- **Hanya kutip fakta yang tertulis di CV.** Jangan menyimpulkan, jangan
  mengarang tanggal, jabatan, atau angka GPA.
- Jika tidak yakin, isi `null`/array kosong, **jangan menebak**.
- Normalisasi tanggal ke `YYYY-MM`; jika hanya tahun, gunakan `YYYY-01` dan
  tandai confidence lebih rendah.
- `is_current = true` hanya jika CV menyebut "present/sekarang/saat ini".
- Nama skill disimpan apa adanya (jangan diterjemahkan).
- Output **hanya JSON**, tanpa markdown fence dan tanpa penjelasan.

### Confidence dan `source_snippet`

Untuk setiap saran field, simpan:

- `confidence` (0-1): keyakinan model, diturunkan dari prompt + aturan.
- `source_snippet`: potongan teks CV asli yang mendukung field tersebut.

Gunakan `source_snippet` untuk:

1. Verifikasi otomatis: snippet harus substring dari teks CV yang sudah
   dinormalisasi. Jika tidak, tandai `ungrounded` dan paksa confidence ≤ 0.3.
2. UI review: sorot bagian CV sumber sehingga user cepat memverifikasi.

Field tanpa snippet yang valid **tidak boleh** auto-terisi; minimal butuh klik
user.

### Prompt per bagian (contoh)

```text
/no_think
Anda mengekstrak data dari SATU bagian CV. Output hanya JSON sesuai schema.
Jangan menambah fakta yang tidak tertulis. Gunakan null bila ragu.

BAGIAN: experiences
SCHEMA: { ... JSON schema ... }

TEKS CV:
"""
{chunk}
"""
```

Gunakan pesan `system` yang sama untuk semua bagian, dan ganti `BAGIAN` +
`SCHEMA` + `TEKS CV`. Ini menjaga cache prompt dan konsistensi gaya.

### Retry dan repair loop

```text
attempt 1 -> parse JSON -> zod valid? ya: simpan
                          tidak: attempt 2 (repair)
attempt 2 -> kirim error zod + output sebelumnya, minta JSON yang benar
             valid? ya: simpan | tidak: status failed
```

Batas 2 attempt per bagian. Retry berlebihan di CPU hanya menambah antrean.
Kegagalan akhir **tidak** boleh memblokir user: `failed` → arahkan ke form
manual.

## Task 2: Draf Lamaran (`application.prepare`)

Bagian ini tetap seperti desain lama, dengan tambahan catatan:

- System prompt melarang klaim di luar profil dan mewajibkan `facts_to_verify`.
- Pertanyaan sensitif (gaji, relokasi, notice period) **selalu** dari
  `portal_answers`, bukan model.
- Output JSON: `subject`, `body`, `cover_letter`, `reach_out_message`,
  `form_answers`, `matching_points`, `missing_requirements`, `facts_to_verify`.
- Fallback template instan jika gagal/timeout.

## Dataset

### Sumber Data yang Diizinkan

| Sumber | Boleh? | Catatan |
|---|---|---|
| CV sintetis buatan sendiri | Ya | Pilihan default untuk ekstraksi |
| CV produksi dengan `ai_training_opt_in` | Ya | Wajib anonimisasi + audit |
| Data publik berlisensi jelas | Ya | Cek lisensi per dataset |
| CV/profil produksi tanpa consent | **Tidak** | Melanggar ADR-025 |
| Data dari provider AI komersial | **Tidak** | Melanggar prinsip proyek |
| Hasil scraping berisi data pribadi | **Tidak** | Bukan sumber training |

Consent `ai_training_opt_in` **terpisah** dari `cv_ai_processing`: user boleh
setuju CV-nya diparsing tanpa setuju datanya dipakai training.

### Anonimisasi

Sebelum masuk dataset, hapus atau ganti:

- Nama orang, perusahaan nyata, sekolah/kampus.
- Email, telepon, alamat, tautan LinkedIn/portfolio.
- Nama rekruter dan kontak internal.
- Foto, NIK, NPWP, nomor rekening, dan kombinasi unik lain.

Placeholder konsisten: `[NAMA]`, `[PERUSAHAAN]`, `[KOTA]`, `[EMAIL]`,
`[KAMPUS]`.

Untuk task ekstraksi, **pasangan input-output harus dianonimisasi dengan
pemetaan yang sama**. Jika input memakai `[PERUSAHAAN]`, output juga harus
`[PERUSAHAAN]` — jika tidak, model belajar mengembalikan placeholder yang salah.

### Format JSONL

Task ekstraksi (satu baris per bagian CV, bukan per CV penuh):

```jsonl
{"task":"cv_extract_experiences","messages":[{"role":"system","content":"Anda mengekstrak data dari SATU bagian CV. Output hanya JSON sesuai schema. Jangan menambah fakta. Gunakan null bila ragu."},{"role":"user","content":"BAGIAN: experiences\nSCHEMA: {...}\nTEKS CV:\n\"\"\"...\"\"\""},{"role":"assistant","content":"{\"experiences\":[{\"company\":\"[PERUSAHAAN]\",\"title\":\"Software Engineer\",\"employment_type\":\"full_time\",\"start_date\":\"2022-01\",\"end_date\":null,\"is_current\":true,\"points\":[\"...\"]}]}"}]}
```

Task draf (format lama tetap valid):

```jsonl
{"task":"draft","messages":[{"role":"system","content":"Anda adalah asisten penulisan lamaran kerja. Gunakan hanya fakta pada profil."},{"role":"user","content":"Profil: ...\nLowongan: ...\nBuat draft lamaran."},{"role":"assistant","content":"{\"subject\":\"...\",\"body\":\"...\",\"matching_points\":[],\"missing_requirements\":[],\"facts_to_verify\":[]}"}]}
```

Aturan:

- Satu baris = satu contoh, `task` wajib ada.
- Output assistant harus JSON valid sesuai schema.
- Jangan mencampur task tanpa penanda.
- Simpan versi: `dataset-cv-v1.jsonl`, `dataset-draft-v1.jsonl`.

### Pembagian Data

Jangan split acak. Pisahkan berdasarkan:

- **User / CV sumber**: satu CV tidak boleh muncul di train dan test.
- **Template CV**: CV hasil generate template yang sama jangan tersebar.
- **Waktu**: data lebih lama untuk train, terbaru untuk test.
- **Keluarga lowongan** (untuk task draf).

```text
Train      80%
Validation 10%
Test       10%   <- tidak dilihat sampai evaluasi akhir
```

### Komposisi Dataset Ekstraksi

Minimal 300 contoh **per bagian** (bukan 300 CV):

| Kategori | Proporsi | Catatan |
|---|---|---|
| Fresh graduate | 25% | Pengalaman organisasi/magang |
| Berpengalaman 1-5 tahun | 40% | Multi-company |
| Berpengalaman > 5 tahun | 20% | CV panjang, banyak bullet |
| CV berbahasa Indonesia | 50% | — |
| CV campuran ID/EN | 30% | Umum di Indonesia |
| CV berbahasa Inggris | 20% | — |
| CV "berantakan" (2 kolom, tabel) | 15% | Uji ketahanan ekstraksi teks |

Sertakan **contoh negatif** (field tidak ada di CV) agar model belajar
mengembalikan `null`/array kosong, bukan mengarang.

### Kualitas Lebih Penting dari Jumlah

300 contoh konsisten lebih baik daripada 3.000 yang saling bertentangan. Audit
manual 20 sampel acak sebelum training:

- Apakah faktanya benar-benar ada di input?
- Apakah format JSON valid dan sesuai schema?
- Apakah `null` dipakai saat data tidak ada?
- Apakah ada PII yang terlewat?
- Apakah anonimisasi input dan output konsisten?

## Baseline dan Metrik

### Baseline Ladder (ukur berurutan, jangan lompat)

| Kode | Baseline | Tujuan |
|---|---|---|
| A | Rules/regex + parser deterministik | Batas bawah, tanpa AI |
| B | `qwen3:4b` zero-shot, satu prompt besar | Baseline model mentah |
| C | + section-wise prompt | Efek chunking |
| D | + structured output + `think:false` | Efek kontrol decoding |
| E | + few-shot + repair loop + confidence gate | Target Phase 1 |
| F | + LoRA/QLoRA | Hanya jika E mentok |

Setiap kenaikan harus diukur pada eval set yang **sama dan terkunci**. Jika D
tidak lebih baik dari C, jangan lanjut ke F.

### Metrik Ekstraksi (wajib)

| Metrik | Definisi | Target Phase 1 | Target Phase 6 |
|---|---|---|---|
| `schema_validity` | Output lolos zod / total | ≥ 98% | ≥ 99.5% |
| `field_precision` | Field benar / field diprediksi | ≥ 0.85 | ≥ 0.92 |
| `field_recall` | Field benar / field di ground truth | ≥ 0.80 | ≥ 0.90 |
| `field_f1` | Harmonic mean P/R per field | ≥ 0.82 | ≥ 0.91 |
| `hallucination_rate` | Field tanpa dukungan snippet / total field | ≤ 2% | ≤ 0.5% |
| `omission_rate` | Field ground truth yang hilang | ≤ 15% | ≤ 8% |
| `latency_p95` | Waktu parse penuh (4 bagian) | ≤ 180 s | ≤ 120 s |
| `consent_block_rate` | Request tanpa consent yang ditolak 403 | 100% | 100% |

Definisi "benar":

- String: normalisasi (lowercase, trim, hapus tanda baca) lalu exact match.
- Nama perusahaan/institusi: fuzzy match token overlap ≥ 0.85.
- Tanggal: sama setelah normalisasi `YYYY-MM`; toleransi 1 bulan untuk
  `end_date` yang ambigu.
- Skill: cocokkan dari kamus sinonim (`js` = `javascript`, `node` = `node.js`).
- GPA: toleransi ±0.05.

### Metrik Draf (wajib)

- `schema_validity`, `factuality` (klaim tak didukung = 0), `requirement_coverage`,
  `missing_detection`, `human_preference`, `latency_p95`.

Detail harness dan cara menjalankan ada di [evaluation.md](evaluation.md).

### Gate Promosi Model

Model baru (prompt/Modelfile/LoRA) hanya boleh jadi champion jika **semua**:

- [ ] `field_f1` naik ≥ 5 poin absolut dibanding champion.
- [ ] `hallucination_rate` tidak lebih buruk (dan ≤ 1%).
- [ ] `schema_validity` ≥ 99%.
- [ ] `latency_p95` ≤ 1.3x champion pada CPU setara VM.
- [ ] Tidak ada regresi pada task draf (jika model dipakai bersama).
- [ ] Rollback teruji (`OLLAMA_MODEL` bisa dikembalikan).

## Optimasi Sebelum LoRA

Lakukan berurutan; sebagian besar perbaikan berhenti di sini.

### 1. Prompt dan schema

- Satu bagian per panggilan, bukan seluruh CV.
- Instruksi eksplisit "jangan menebak", "null jika ragu".
- Sertakan 2-3 few-shot contoh pendek (termasuk contoh negatif).
- Minta output tanpa markdown fence.

### 2. Modelfile

```dockerfile
FROM qwen3:4b
PARAMETER num_ctx 8192
PARAMETER temperature 0
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.05
PARAMETER num_predict 1024
SYSTEM "Anda adalah mesin ekstraksi data CV. Output hanya JSON valid sesuai schema. Jangan menambah fakta yang tidak tertulis. Gunakan null bila ragu."
```

```bash
ollama create lamar-cv:q4 -f Modelfile
```

Lalu set `OLLAMA_MODEL_EXTRACT=lamar-cv:q4` (pisahkan dari model draf jika
system prompt-nya berbeda).

### 3. Structured output + repair loop

- Kirim JSON Schema di `format`.
- Validasi zod, repair 1x, lalu `failed`.
- Simpan `error_code` untuk analisis (bukan isi CV).

### 4. Confidence gate

- Turunkan `confidence` jika `source_snippet` tidak ditemukan di teks CV.
- Field confidence < 0.5 tampil sebagai "perlu dicek" dan tidak auto-select.

### 5. Section-aware preprocessing

- Hapus header/footer berulang dan nomor halaman.
- Deteksi kolom ganda sederhana (gabungkan baris berdasarkan posisi x jika
  metadata PDF tersedia); jika tidak, fallback ke urutan teks.
- Batasi chunk per bagian (~3.000 token) dan potong di batas bullet, bukan di
  tengah kalimat.

## Fine-tune LoRA/QLoRA

Hanya jika gate di atas membuktikan baseline E mentok.

### Memilih Tool

| Tool | Kelebihan | Kekurangan |
|---|---|---|
| Unsloth | Cepat, hemat VRAM, cocok pemula | Dukungan model terbatas |
| LLaMA-Factory | Banyak format dataset, UI tersedia | Konfigurasi lebih banyak |
| Axolotl | Fleksibel, komunitas besar | Kurva belajar curam |

Untuk proyek ini, Unsloth atau LLaMA-Factory sudah cukup.

### Kebutuhan VRAM

| Model | Metode | VRAM minimum |
|---|---|---|
| 4B | QLoRA 4-bit | 8-10 GB |
| 7-8B | QLoRA 4-bit | 12-16 GB |
| 14B | QLoRA 4-bit | 20-24 GB |
| 8B | LoRA 16-bit | 24 GB+ |

### Hyperparameter Awal (ekstraksi)

```text
LoRA rank (r)        : 16
LoRA alpha           : 32
LoRA dropout         : 0.05
Learning rate        : 1e-4   (lebih rendah dari task draf)
Epochs               : 2-3
Batch size (effective): 8-16 (gradient accumulation)
Max sequence length  : 4096
Scheduler            : cosine
Warmup ratio         : 0.03
Loss                 : completion-only (mask token prompt)
```

Catatan khusus ekstraksi:

- **Mask prompt**: loss hanya pada token output JSON. Tanpa ini model belajar
  menyalin prompt.
- **Jangan oversample task draf** saat tujuan utama ekstraksi; campur maksimal
  20% agar tidak menggeser distribusi.
- **Kunci schema** selama training. Perubahan schema = dataset baru = eval baru.
- Simpan `chat_template` Qwen3 apa adanya; jangan menambah token khusus.

### Contoh Alur dengan LLaMA-Factory

```bash
python -m venv .venv && source .venv/bin/activate
pip install llamafactory

# data/dataset_info.json
# { "lamar_cv": { "file_name": "dataset-cv-v1.jsonl" },
#   "lamar_draft": { "file_name": "dataset-draft-v1.jsonl" } }

llamafactory-cli train configs/qwen3-4b-cv-qlora.yaml
```

```yaml
model_name_or_path: Qwen/Qwen3-4B
stage: sft
do_train: true
finetuning_type: lora
lora_rank: 16
lora_alpha: 32
lora_dropout: 0.05
dataset: lamar_cv
template: qwen
cutoff_len: 4096
learning_rate: 1.0e-4
num_train_epochs: 3
per_device_train_batch_size: 2
gradient_accumulation_steps: 8
lr_scheduler_type: cosine
warmup_ratio: 0.03
output_dir: outputs/qwen3-4b-cv-lamar
```

### Memantau Training

- Loss harus turun stabil; naik → turunkan learning rate.
- Evaluasi validation setiap epoch, bukan hanya di akhir.
- Hentikan saat validation loss naik (overfitting).
- Simpan checkpoint terbaik, bukan terakhir.

## Export ke GGUF dan Ollama

```bash
# 1. Merge adapter
python scripts/merge_lora.py \
  --base Qwen/Qwen3-4B \
  --adapter outputs/qwen3-4b-cv-lamar \
  --output merged/qwen3-4b-cv-lamar

# 2. Konversi ke GGUF
python llama.cpp/convert_hf_to_gguf.py merged/qwen3-4b-cv-lamar \
  --outfile qwen3-4b-cv-lamar.f16.gguf

# 3. Quantize Q4_K_M (target RAM container 5 GB)
./llama.cpp/build/bin/llama-quantize \
  qwen3-4b-cv-lamar.f16.gguf qwen3-4b-cv-lamar.Q4_K_M.gguf Q4_K_M

# 4. Daftarkan di Ollama
cat > Modelfile <<'EOF'
FROM ./qwen3-4b-cv-lamar.Q4_K_M.gguf
PARAMETER num_ctx 8192
PARAMETER temperature 0
PARAMETER num_predict 1024
SYSTEM "Anda adalah mesin ekstraksi data CV. Output hanya JSON valid sesuai schema. Jangan menambah fakta. Gunakan null bila ragu."
EOF

ollama create lamar-cv:q4 -f Modelfile
```

Set `OLLAMA_MODEL_EXTRACT=lamar-cv:q4` di environment. Verifikasi dengan eval
set **di CPU kelas VM** (4 OCPU), bukan di GPU, karena latency adalah gate.

## Deploy Champion/Challenger

```text
1. Simpan model lama sebagai champion (tag terpisah).
2. Jalankan model baru sebagai challenger di environment non-produksi.
3. Jalankan eval set yang sama pada keduanya.
4. Bandingkan F1, hallucination, schema validity, dan latency p95.
5. Aktifkan hanya jika melewati seluruh gate.
6. Rollback = ubah OLLAMA_MODEL_EXTRACT kembali.
```

Jangan pernah mengganti model produksi langsung tanpa eval yang terdokumentasi.

## Fine-tune Embedding

Untuk matching, fine-tune embedding biasanya memberi dampak lebih besar daripada
fine-tune LLM.

- Model dasar: `bge-m3` (multilingual) atau `multilingual-e5-small` (CPU-friendly).
- Data: pasangan (profil, lowongan) dengan label relevan/tidak relevan.
- Label dari perilaku user: lamaran yang dikirim = positif.
- Loss: triplet atau contrastive.
- Konversi ke ONNX agar tetap cepat di CPU.

Jalankan fine-tune embedding **sebelum** mempertimbangkan fine-tune LLM.

## Privasi Training

Aturan ini berlaku untuk semua anggota tim, termasuk pemegang akses VM produksi:

1. Data CV/profil produksi **tidak boleh** dipakai untuk training tanpa consent
   `ai_training_opt_in` yang tercatat di `user_consents`.
2. Anonimisasi wajib dilakukan **di VM**, sebelum data meninggalkan
   infrastruktur. Data mentah tidak boleh diunggah ke GPU sewa.
3. Dataset training disimpan di penyimpanan proyek, bukan laptop pribadi.
4. Hapus dataset sementara di GPU sewa setelah training (termasuk cache HF).
5. Catat asal-usul dataset: tanggal, sumber, jumlah, siapa yang mengkurasi.
6. Jangan menyalin isi CV ke issue, chat, atau log. Gunakan ID dan statistik.
7. Pencabutan consent `ai_training_opt_in` harus menghapus sampel user tersebut
   dari dataset aktif pada rebuild berikutnya.

Detail kebijakan ada di [privacy.md](privacy.md).

## Runbook 7 Hari (Training Cycle)

Dipakai hanya setelah baseline E terbukti mentok. Satu orang cukup.

### Hari 1 — Kunci eval set dan baseline

- [ ] Bekukan 100 CV uji (test set) + ground truth field-level.
- [ ] Jalankan baseline A (rules) dan B (zero-shot) → catat F1, hallucination,
      schema validity, latency.
- [ ] Simpan hasil di `tests/eval/results/<tanggal>-baseline.json`.

### Hari 2 — Prompt + Modelfile + section-wise

- [ ] Implementasi prompt per bagian dan `think:false`.
- [ ] Coba structured output (JSON Schema).
- [ ] Ukur baseline C dan D pada eval set.

### Hari 3 — Few-shot + repair + confidence

- [ ] Tambah 2-3 few-shot (termasuk contoh negatif).
- [ ] Implementasi repair loop 1x dan confidence gate berbasis `source_snippet`.
- [ ] Ukur baseline E. Jika sudah lewat gate Phase 1, **stop** — tidak perlu
      LoRA.

### Hari 4 — Kurasi dataset

- [ ] Kumpulkan 300+ contoh per bagian (sintetis + consented/anonymized).
- [ ] Samakan pemetaan anonimisasi input-output.
- [ ] Split by CV source, bukan acak (80/10/10).

### Hari 5 — Audit dataset + training

- [ ] Audit manual 20 sampel (fakta, schema, null, PII).
- [ ] Token length check (`cutoff_len` 4096, potong di batas bullet).
- [ ] Jalankan QLoRA di GPU sewa (1-3 jam untuk 4B).
- [ ] Simpan log training dan checkpoint terbaik.

### Hari 6 — Export + evaluasi di CPU

- [ ] Merge LoRA → GGUF → quantize Q4_K_M.
- [ ] Daftarkan sebagai `lamar-cv:q4` (challenger).
- [ ] Jalankan eval set penuh **di CPU 4 OCPU** (bukan GPU).
- [ ] Bandingkan semua metrik dengan champion.

### Hari 7 — Keputusan + dokumentasi

- [ ] Terapkan gate promosi. Lulus → promote; gagal → simpan sebagai eksperimen.
- [ ] Dokumentasikan hasil, keputusan, dan alasan di `docs/evaluation.md` atau
      catatan rilis.
- [ ] Pastikan rollback teruji dan dataset sementara dihapus.
- [ ] Update `OLLAMA_MODEL_EXTRACT` hanya jika lulus gate.

## Estimasi Biaya dan Waktu

| Tahap | Waktu | Biaya |
|---|---|---|
| Eval set 100 CV + ground truth | 2-3 hari | $0 |
| Prompt/Modelfile/section-wise | 1 hari | $0 |
| Kurasi dataset 300+/bagian | 2-3 hari | $0 |
| Training 4B QLoRA | 1-3 jam | ~$1-3 (GPU sewa) |
| Export + quantize | 30 menit | ~$0,5 |
| Evaluasi di CPU | 1 hari | $0 |
| Training 8B QLoRA | 3-6 jam | ~$3-8 |

Total realistis satu siklus: **sekitar 1 minggu**, dengan sebagian besar waktu di
kurasi data dan evaluasi, bukan training.

## Checklist Sebelum Training

- [ ] Baseline A-E sudah diukur dan terdokumentasi.
- [ ] Eval set 100 CV terkunci dan disetujui.
- [ ] Gate Phase 1 tidak terpenuhi oleh baseline E (bukti perbaikan prompt
      mentok).
- [ ] Dataset ≥ 300 contoh/bagian, dianonimisasi, consent `ai_training_opt_in`
      tercatat.
- [ ] Split by CV source/user, bukan acak.
- [ ] Format JSONL valid, `task` ada, output sesuai schema.
- [ ] Audit manual 20 sampel selesai (fakta, schema, null, PII).
- [ ] GPU sewa siap; rencana hapus dataset setelah training.
- [ ] Rencana rollback dan model champion jelas.

## Anti-pattern

| Anti-pattern | Kenapa salah |
|---|---|
| Fine-tune untuk "menambah pengetahuan lowongan" | Gunakan RAG; fine-tune bukan basis data |
| Training tanpa eval set | Tidak ada dasar membandingkan |
| Mencampur task tanpa penanda | Model bingung, metrik tidak valid |
| Mengandalkan `format: "json"` saja | Schema bisa lolos JSON tapi salah bentuk |
| Membiarkan thinking mode aktif | Latensi CPU naik 2-4x tanpa manfaat |
| Menilai model di GPU | Latency produksi di CPU tidak terwakili |
| Mengganti model produksi langsung | Tidak ada rollback, risiko regresi |
| Memakai CV produksi tanpa consent | Melanggar ADR-025 dan privasi |
| Dataset mentah diunggah ke GPU sewa | Data pribadi keluar dari infrastruktur |

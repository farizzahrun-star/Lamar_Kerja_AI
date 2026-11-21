# Todolist Training AI (cv.parse)

Target: QLoRA `Qwen3-4B` untuk ekstraksi CV, dilatih di **Google Colab (GPU T4
gratis)**, dievaluasi di **CPU lokal**. Acuan: [docs/ai-training.md](../docs/ai-training.md),
[docs/evaluation.md](../docs/evaluation.md).

## Status sekarang

| Komponen | File | Status |
|---|---|---|
| Schema + prompt (sumber tunggal) | `schema.py` | ✅ 7 bagian, selftest lulus |
| Generator dataset sintetis | `data/gen_synthetic.py` | ✅ 2800 contoh v3 (400 CV, 80/10/10 per CV) |
| Dataset v3 | `data/dataset-cv-v3-*.jsonl` | ✅ train 2240 / val 280 / test 280 baris |
| Trainer QLoRA untuk Colab | `train_colab.py` | ✅ siap, **belum dijalankan** |
| Harness evaluasi (F1, halusinasi, latency) | `eval/score.py` | ✅ selftest lulus, 7/7 bagian F1=1.0 pada oracle |
| Tes CV pribadi (PDF/DOCX/TXT) | `eval/try_cv.py` | ✅ sudah dijalankan pada CV asli, 0 `ungrounded` |
| Anti-karang metadata | `schema.enforce_grounding()` | ✅ employment_type/level/years dihapus bila tak tertulis |
| Baseline penuh A–E | `results/` | ⬜ **belum** (ada mini 20 baris dari schema v1, tidak sebanding) |
| Training di Colab | `outputs/adapter` | ⬜ belum |
| Export GGUF + daftar Ollama | `outputs/gguf` | ⬜ belum |

Progres: **Task 1 akurasi sudah bagus, ketahanan pipeline belum; Task 2 belum mulai.**
Dataset v2 dan v1 sudah dihapus dari kerja (masih ada di git). Schema berubah =
dataset baru + eval baru, jadi angka lama tidak dipakai.

> Doc melarang fine-tune tanpa baseline penuh. Sebelum Colab, jalankan baseline
> di `dataset-cv-v3-test.jsonl`. Kalau sudah lolos gate Phase 1 di CV nyata juga,
> **stop — tidak perlu LoRA** (sesuai doc).

## Peta status — Task 1 `cv.parse` (docs/ai-training.md)

| Tahap pipeline di doc | Status | Yang masih kurang |
|---|---|---|
| Upload PDF/DOCX ≤ 10 MB | 🟡 | hanya lewat script tes, belum lewat aplikasi |
| Ekstraksi teks lokal | 🟡 | `pypdf`/`zipfile` di `try_cv.py`; `packages/pdf` masih kosong |
| Normalisasi (header/footer berulang) | 🟡 | baru rapikan spasi & tanggal |
| Teks < 50 char → `skipped` | ✅ | ada di `try_cv.py` |
| Potong per bagian (chunking) | ❌ | seluruh CV dikirim ke tiap bagian (aman < 8000 token) |
| 7 panggilan Ollama `think:false` + `format` schema | ✅ | `temperature:0`, `num_ctx:8192` |
| Validasi zod | ❌ | belum di aplikasi |
| Repair 1x lalu `failed` | ❌ | belum ada |
| `confidence` + `source_snippet` per field | 🟡 | `ungrounded` dicek, tapi tidak disimpan per field |
| Simpan `cv_parse_suggestions` (pending) | ❌ | belum ada DB/API |
| Review user → merge ke `profiles` | ❌ | belum ada UI (ADR-024) |
| Eval gate F1/halusinasi/latency | 🟡 | harness ada, baseline penuh belum dijalankan |
Urutan perbaikan sesuai doc: **baseline dulu → repair loop → confidence/snippet →
chunking → LoRA kalau mentok.**

## Peta status — Task 2 `application.prepare` (draf lamaran)

**0%.** Belum ada dataset, prompt, harness, atau fallback template.
Doc menyebut ini **opsional** (Phase 4, template dulu). Yang harus dibuat nanti:

| Kebutuhan | Status |
|---|---|
| Template + fallback instan | ⬜ |
| `dataset-draft-v1.jsonl` (terpisah dari dataset CV) | ⬜ |
| System prompt: dilarang klaim di luar profil, wajib `facts_to_verify` | ⬜ |
| Pertanyaan sensitif dari `portal_answers`, bukan model | ⬜ |
| Metrik factuality / coverage / missing detection | ⬜ |
Jangan kerjakan ini sebelum Task 1 stabil.

## Schema v3 — tambahan terakhir

| Perubahan | Detail |
|---|---|
| `projects` | tesis/riset/publikasi: `name`, `role`, `organization`, `start_date`, `end_date`, `outcome`, `points[]` |
| `languages` | `name`, `proficiency` (native/fluent/professional_working/intermediate/basic) |
| `enforce_grounding()` | `employment_type` dihapus kecuali ada kata kerja di sekitar nama perusahaan; `level`/`years` dihapus kecuali tertulis di baris skill; `issuer` dibersihkan dari "by " |
| Prompt | ambil semua blok skill termasuk tools; bahasa asing ke `languages` |
Dataset: 7 bagian × 320 contoh train per bagian. Waktu parse naik jadi ~7 panggilan
(~60 detik di Colab GPU, ~3 menit di CPU Mac). Gate latency masih jauh di bawah 180 detik.

## Hasil konkrit yang diharapkan — tes pada CV "Fariz Zahrun Nada"

Jalankan (file PDF ada di `results/`, sudah tidak di-track git):

```bash
python3 Training/eval/try_cv.py "Training/results/Fariz Zahrun Nada_CV(ENG).pdf" \
  --model qwen3:4b --out Training/results/cek-ulang.json
```

Tabel di terminal dan isi file JSON harus seperti ini:

| Bagian | Jumlah field | Yang harus benar | Tanda ada masalah |
|---|---|---|---|
| `identity` | 7 | `full_name`, email, telepon, kota, LinkedIn, `headline`, `summary` | `summary` kosong |
| `experiences` | 5 item | `PT Perkebunan` = `internship`, sisanya `null`; tanggal `YYYY-MM` | ada `full_time` di Brand Manager |
| `educations` | 1 item | S1 Agroecotechnology, GPA 3.67, 2022–2026 | GPA hilang |
| `skills` | ≥ 9 item | semua `level:null`, `years:null` (CV tidak menulis level) | muncul `advanced` / `years:1` |
| `certifications` | 3 item | IELTS, Microsoft Office, Bootcamp; issuer "Digital Skola" (tanpa "by") | issuer salah / nama hilang |
| `projects` | 1 item | judul tesis drought index + 4 bullet + `outcome` memuat "Jurnal Lahan Suboptimal (2026)" | bullet tesis hilang |
| `languages` | 2 item | Bahasa Indonesia `native`, English `professional_working` | bahasa masuk ke `skills` |
| Ringkasan | — | `ungrounded 0`, tidak ada baris `!` atau `~` | ada baris `!` (karangan) atau `~` (format) |
Kalau ada `!`: field itu tidak bisa ditunjukkan di PDF → jangan dipakai. Kalau ada `~`: tanggal tidak bisa dinormalisasi → laporkan teks aslinya.
Arti angka: `field_f1` 0.82 ≈ 82 dari 100 field terbaca benar; `hallucination_rate` 0.02 ≈ maksimal 2 field karangan dari 100; `schema_validity` 0.98 ≈ 98 dari 100 output JSON bentuknya benar.

## Langkah 0 — Ukur baseline penuh di CPU (~45 menit)

Ollama hidup, `qwen3:4b` sudah ada.

```bash
cd /Users/macbookpro/Documents/GitHub/Lamar_Kerja_AI
python3 Training/eval/score.py predict \
  --ref Training/data/dataset-cv-v3-test.jsonl \
  --model qwen3:4b --out Training/results/pred-v3-base.jsonl
python3 Training/eval/score.py score \
  --ref Training/data/dataset-cv-v3-test.jsonl \
  --pred Training/results/pred-v3-base.jsonl \
  --out Training/results/2026-11-21-baseline-B-v3.json
```

Yang diharapkan: file `*-baseline-B-v3.json` berisi `schema_validity`, `field_f1`,
`hallucination_rate`, `omission_rate`, `latency_p95`, dan `gates` (true/false).
- [ ] Jalankan sampai selesai (280 baris × 7 bagian).
- [ ] Catat angka `overall` dan isi tabel gate di bawah.
- [ ] Ulangi tes CV asli dengan 5-10 CV lain; kalau F1 jauh lebih rendah dari
      angka sintetis, data sintetis terlalu mudah.

Gate Phase 1 (dari doc):

| Gate | Ambang | Baseline v3 | Challenger |
|---|---|---|---|
| `field_f1` | ≥ 0.82 (dan naik ≥ 0.05 untuk LoRA) | ⬜ | ⬜ |
| `hallucination_rate` | ≤ 1% untuk promosi | ⬜ | ⬜ |
| `schema_validity` | ≥ 99% | ⬜ | ⬜ |
| `latency_p95` | ≤ 180 s per CV, ≤ 1.3x champion | ⬜ | ⬜ |

## Langkah 1 — Smoke run Colab (30 menit)

Jalankan di laptop dulu: `git add -A Training && git commit -m "..." && git push origin dev/training`.
Lalu di Colab:

```python
!git clone -b dev/training https://github.com/farizzahrun-star/Lamar_Kerja_AI.git
%cd Lamar_Kerja_AI/Training
!pip install -q unsloth
!python train_colab.py --stage train --limit 20 --epochs 1
```

- [ ] VRAM terpakai < 14 GB, `eval_loss` turun.
- [ ] Simpan checkpoint ke Drive; sesi Colab gratis sering putus.

## Langkah 2 — Training penuh (30-60 menit)

- [ ] `!python train_colab.py --stage train` (2240 contoh v3, 3 epoch, r=16, lr=1e-4)
- [ ] `!python train_colab.py --stage export` → `outputs/merged`
- [ ] `!python train_colab.py --stage gguf` → `outputs/gguf/*.Q4_K_M.gguf` + `Modelfile`
- [ ] Unduh GGUF + Modelfile, lalu di laptop: `ollama create lamar-cv:q4 -f Modelfile`
**Jangan jalankan ini kalau gate baseline sudah lolos di CV nyata** — doc bilang berhenti.

## Langkah 3 — Eval challenger & keputusan

- [ ] `score.py predict --model lamar-cv:q4` pada test set yang sama.
- [ ] Isi tabel gate. Lulus → promote; gagal → simpan eksperimen.
- [ ] Rollback = kembalikan `OLLAMA_MODEL_EXTRACT` ke champion.

## Risiko

| Risiko | Mitigasi |
|---|---|
| Data sintetis terlalu mudah | tambah 5-10 CV nyata (anonim) ke test set |
| Model mengarang level/years/employment_type | `enforce_grounding()` (sudah), lalu few-shot kalau masih |
| Colab putus | adapter disimpan tiap epoch + salin ke Drive |
| Versi Unsloth berubah | pin versi / fallback transformers+peft |
| PII | hasil dan PDF ada di `results/` (gitignored), hapus setelah selesai |

## Urutan kerja berikutnya

1. Commit + push v3, jalankan tes CV asli sekali lagi di Colab → cek tabel "Hasil konkrit".
2. Baseline penuh 280 baris v3 → angka gate.
3. Kalau F1 CV nyata masih ≥ 0.82: **stop**, tidak perlu LoRA. Kalau < 0.82,
   lanjut Colab smoke run → training → eval challenger.
4. Task 2 (draf lamaran) baru dibuka setelah Task 1 stabil.

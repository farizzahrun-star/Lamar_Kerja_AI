# Todolist Training AI (cv.parse)

Target: QLoRA `Qwen3-4B` untuk ekstraksi CV, dilatih di **Google Colab (GPU T4
gratis)**, dievaluasi di **CPU lokal**. Acuan: [docs/ai-training.md](../docs/ai-training.md),
[docs/evaluation.md](../docs/evaluation.md).

## Status sekarang

| Komponen | File | Status |
|---|---|---|
| Schema + prompt (sumber tunggal) | `schema.py` | ✅ jalan (`python schema.py`) |
| Generator dataset sintetis | `data/gen_synthetic.py` | ✅ 1600 contoh (400 CV, 80/10/10 per CV) |
| Trainer QLoRA untuk Colab | `train_colab.py` | ✅ siap, **belum dijalankan** |
| Harness evaluasi (F1, halusinasi, latency) | `eval/score.py` | ✅ jalan (`--selftest` lulus) |
| Tes CV pribadi (PDF/DOCX/TXT) | `eval/try_cv.py` | ✅ jalan (`--selftest` lulus) |
| Dataset v1 | `data/dataset-cv-v1-*.jsonl` | ✅ train 1280 / val 160 / test 160 baris |
| Baseline terukur (A–E) | `Training/results/` | 🟡 mini 20/160 baris |
| Training di Colab | `outputs/adapter` | ⬜ belum |
| Export GGUF + daftar Ollama | `outputs/gguf` | ⬜ belum |

Progres kasar: **infrastruktur 100%, eksekusi 0%**. Sisanya kerja menjalankan,
bukan menulis kode baru.

> Catatan doc: fine-tune hanya sah kalau baseline E mentok. Dataset v1 sekarang
> **sintetis murni** — cukup untuk eksperimen, belum untuk promosi model. Jangan
> lewati Langkah 1 di bawah; tanpa angka baseline, hasil LoRA tidak bisa dibuktikan.

## Langkah 0 — Tes CV sendiri (10 menit)

Tanpa ground truth, jadi penilaian manual. Script menandai field yang tidak
didukung teks CV (`ungrounded` = kandidat halusinasi).

```bash
python3 -m pip install --user pypdf   # sekali saja, untuk PDF
python3 Training/eval/try_cv.py ~/Documents/cv-saya.pdf --model qwen3:4b
```

Hasil di `Training/results/try-<nama>.json` (gitignored). Yang dicek manual:
`ungrounded` harus 0, field kosong harus `null`/`[]`, tanggal `YYYY-MM`,
`is_current` sesuai CV. Latency wajar 10-30 detik per bagian di CPU.

- [ ] Jalankan pada 1 CV sendiri, catat field yang salah.
- [ ] Kalau `ungrounded` > 0, perbaiki prompt (`schema.py`), bukan modelnya.

## Langkah 1 — Ukur baseline di CPU lokal (0 biaya, ~1-2 jam)

Ollama harus hidup, model sudah ada (`ollama list` → `qwen3:4b`).

```bash
cd /Users/macbookpro/Documents/GitHub/Lamar_Kerja_AI

# B = qwen3:4b zero-shot, sesuai prompt produksi
python3 Training/eval/score.py predict \
  --ref Training/data/dataset-cv-v1-test.jsonl \
  --model qwen3:4b --out Training/results/pred-qwen3-base.jsonl

python3 Training/eval/score.py score \
  --ref Training/data/dataset-cv-v1-test.jsonl \
  --pred Training/results/pred-qwen3-base.jsonl \
  --out Training/results/2026-11-20-baseline-B.json
```

Ini juga sekaligus smoke test dataset: kalau `schema_validity` < 90% di sini,
masalahnya prompt/schema, bukan model.

- [ ] Simpan hasil baseline B.
- [ ] Catat F1, hallucination, latency p95 di tabel progres di bawah.

## Temuan awal (mini, 20/160 baris — bukan baseline resmi)

`qwen3:4b` zero-shot + prompt section-wise + `format` schema, 20 baris test set:

| Metrik | Nilai | Gate Phase 1 | Status |
|---|---|---|---|
| `schema_validity` | 1.0 | ≥ 0.98 | lulus |
| `field_f1` | 0.8596 | ≥ 0.82 | lulus (di data sintetis) |
| `hallucination_rate` | 0.0043 | ≤ 0.02 | lulus |
| `omission_rate` | 0.1211 | ≤ 0.15 | lulus |
| `latency` p50 / p95 | 10,1 s / 23,8 s per bagian | ≤ 180 s per CV | lulus |

F1 per bagian: identity 1.00, skills 0.98, educations 0.81, experiences 0.78.
Titik lemah: `experiences` (banyak item + urutan).

Implikasi penting: **baseline zero-shot sudah melewati gate di eval sintetis**.
Dua kemungkinan, dan keduanya harus diuji sebelum training:

1. Data sintetis terlalu mudah (template, bukan CV berantakan nyata) → LoRA akan
   "lulus" tanpa manfaat nyata.
2. Task memang sudah cukup dengan prompt + structured output → sesuai doc,
   **jangan fine-tune**.

Perbaikan prompt yang sudah dilakukan: `schema.py` kini memerintahkan menyalin
placeholder apa adanya. Tanpa itu model mengubah `[NAMA]` jadi `null` dan
`[KAMPUS]` jadi `KAMPUS` (kehilangan bracket) — terlihat saat tes, sudah diperbaiki.

Langkah wajib sebelum Colab: jalankan baseline penuh 160 baris **dan** tambahkan
5-10 CV nyata (punyamu, dianonimisasi) ke test set. Kalau F1 di CV nyata turun di
bawah 0.82, barulah LoRA punya alasan.

## Langkah 2 — Smoke run Colab (30 menit)

Buka https://colab.research.google.com → Runtime → Change runtime type → **T4 GPU**.

```python
# Cell 1
!nvidia-smi
!pip install -q unsloth
```

```python
# Cell 2
!git clone https://github.com/farizzahrun-star/Lamar_Kerja_AI.git
%cd Lamar_Kerja_AI/Training
```

```python
# Cell 3 — 20 contoh dulu, pastikan tidak OOM dan loss turun
!python train_colab.py --stage train --limit 20 --epochs 1
```

Cek: VRAM terpakai < 14 GB, `eval_loss` tercetak. Kalau Unsloth error karena versi
berubah, itu risiko paling umum — fallback: `pip install unsloth==<versi terakhir
yang jalan>` atau ganti ke transformers+peft (tanya saya, jangan dikerjakan
manual).

## Langkah 3 — Training penuh (~30-60 menit di T4)

- [ ] `!python train_colab.py --stage train` (1600 contoh, 3 epoch, r=16, lr=1e-4)
- [ ] Simpan `outputs/adapter` ke Google Drive (Colab gratis sering putus):
      `from google.colab import drive; drive.mount('/content/drive')` lalu
      `!cp -r outputs /content/drive/MyDrive/lamar-training/`
- [ ] Cek kurva loss: turun stabil, `eval_loss` tidak naik di epoch terakhir.

## Langkah 4 — Export & jalankan sebagai challenger (1 jam)

- [ ] `!python train_colab.py --stage export` → `outputs/merged`
- [ ] `!python train_colab.py --stage gguf` → `outputs/gguf/*.Q4_K_M.gguf` + `Modelfile`
- [ ] Unduh 2 file itu ke laptop.
- [ ] Daftarkan tanpa menyentuh model produksi:

```bash
cd ~/Downloads   # folder berisi gguf + Modelfile
ollama create lamar-cv:q4 -f Modelfile
ollama run lamar-cv:q4 "BAGIAN: skills ..."
```

## Langkah 5 — Eval challenger di CPU, lalu gate

```bash
cd /Users/macbookpro/Documents/GitHub/Lamar_Kerja_AI
python3 Training/eval/score.py predict \
  --ref Training/data/dataset-cv-v1-test.jsonl \
  --model lamar-cv:q4 --out Training/results/pred-lamar-cv-q4.jsonl
python3 Training/eval/score.py score \
  --ref Training/data/dataset-cv-v1-test.jsonl \
  --pred Training/results/pred-lamar-cv-q4.jsonl \
  --out Training/results/2026-11-21-challenger-q4.json
```

Gate promosi (dari doc, semua wajib):

| Gate | Ambang | Baseline B | Challenger |
|---|---|---|---|
| `field_f1` | ≥ 0.82 dan naik ≥ 0.05 dari baseline | ⬜ | ⬜ |
| `hallucination_rate` | ≤ 1% | ⬜ | ⬜ |
| `schema_validity` | ≥ 99% | ⬜ | ⬜ |
| `latency_p95` | ≤ 1.3x baseline | ⬜ | ⬜ |

- [ ] Isi tabel di atas dengan angka nyata.
- [ ] Lulus → `OLLAMA_MODEL_EXTRACT=lamar-cv:q4`. Gagal → simpan sebagai eksperimen,
      perbaiki **data/prompt**, bukan menambah epoch.

## Langkah 6 — Data nyata (setelah gate pertama)

Dataset sintetis mengajarkan pola template, bukan kekacauan CV asli. Sebelum
dipakai produksi:

- [ ] Ganti 30-50% dataset dengan CV `ai_training_opt_in` yang dianonimisasi
      **di VM**, bukan di laptop (ADR-025).
- [ ] Audit manual 20 sampel: fakta ada di input, `null` dipakai saat kosong,
      tidak ada PII, anonimisasi input-output konsisten.
- [ ] Tambah contoh "berantakan" nyata: 2 kolom, tabel, hasil scan (`skipped`).
- [ ] Kunci test set; jangan pernah dilatih ulang dengan test set.

## Risiko yang sudah diketahui

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Dataset sintetis = template | F1 bagus di eval sintetis, jatuh di CV nyata | Langkah 6, split by CV source |
| Colab free disconnect | Training hilang di tengah | simpan adapter ke Drive tiap epoch, `save_strategy="epoch"` sudah aktif |
| Versi Unsloth berubah | Cell install gagal | pin versi, atau fallback transformers+peft |
| T4 float16, bukan bf16 | loss lebih tidak stabil | lr 1e-4 (sudah), cek loss naik → stop |
| Matching evaluasi per index | false negative saat urutan item berubah | baca `per_section`, bukan cuma `overall` |

## Urutan kerja berikutnya (3 item teratas)

1. Langkah 0 (CV sendiri) + Langkah 1 penuh (160 baris) → angka baseline B resmi.
2. Tambah 5-10 CV nyata ke test set; kalau F1 CV nyata masih ≥ 0.82, **stop** —
   tidak perlu LoRA (sesuai doc). Kalau < 0.82, lanjut.
3. Baru Langkah 2 (Colab smoke run) → training penuh → export.

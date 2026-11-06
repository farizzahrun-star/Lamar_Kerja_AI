# Panduan Training Model AI

Dokumen ini menjelaskan cara melatih atau menyesuaikan model AI untuk proyek ini,
kapan hal itu layak dilakukan, dan batasan privasi yang tidak boleh dilanggar.

## Ringkasan

Untuk 10 user dengan inference CPU-only, **training bukan prioritas**. Sistem
sudah berjalan penuh tanpa LLM. Training hanya masuk akal setelah ada bukti
bahwa template dan prompt biasa tidak cukup.

Urutan eskalasi yang benar:

```text
1. Prompt engineering + Modelfile        (jam)      <- mulai di sini
2. Template + rules                      (hari)     <- fondasi yang sudah ada
3. Retrieval (RAG)                       (hari)
4. Fine-tune embedding                   (hari)     <- paling berdampak
5. Fine-tune LLM (LoRA/QLoRA)            (minggu)   <- hanya jika ada eval set
6. Pretraining dari nol                  (tidak)    <- tidak akan pernah dipakai
```

Aturan penting:

- **Jangan fine-tune tanpa eval set.** Tanpa itu, tidak ada cara mengukur apakah
  model baru lebih baik.
- **Fine-tune bukan cara menambah pengetahuan.** Untuk data lowongan atau
  perusahaan, gunakan RAG.
- **Fine-tune mengubah gaya dan kepatuhan format**, bukan fakta. Fakta tetap
  berasal dari database profil.

## Kapan Training Layak

| Kondisi | Aksi yang disarankan |
|---|---|
| Draft terasa kaku atau tidak sesuai nada | Perbaiki prompt dan template dulu |
| Model sering menghasilkan JSON tidak valid | Perbaiki schema, few-shot, atau ganti model |
| Butuh gaya bahasa konsisten khas perusahaan | LoRA layak dicoba |
| Matching terasa lemah | Fine-tune embedding, bukan LLM |
| Butuh pengetahuan tentang lowongan/perusahaan | RAG, bukan fine-tune |
| Dataset < 300 contoh berkualitas | Jangan training; perbaiki data dan prompt |
| Tidak ada eval set | Jangan training; buat eval set dulu |

## Prasyarat

1. **Eval set** berisi 50-100 contoh dengan jawaban ideal. Lihat
   [evaluation.md](evaluation.md).
2. **Dataset** minimal 300 contoh berkualitas, idealnya 1.000.
3. **Baseline** yang terdokumentasi: hasil template dan model saat ini pada eval
   set yang sama.
4. **GPU sewa** untuk proses training. Inference tetap di CPU.
5. **Persetujuan data** jika memakai data pengguna nyata.

## Dataset

### Sumber Data yang Diizinkan

| Sumber | Boleh? | Catatan |
|---|---|---|
| Data sintetis yang dibuat sendiri | Ya | Pilihan default |
| Draft template yang diedit user, dengan persetujuan | Ya | Perlu consent eksplisit |
| Data publik dengan lisensi jelas | Ya | Cek lisensi per dataset |
| CV/profil produksi tanpa persetujuan | **Tidak** | Melanggar kebijakan privasi |
| Data dari provider AI komersial | **Tidak** | Melanggar prinsip proyek |

### Anonimisasi

Sebelum masuk dataset, hapus atau ganti:

- Nama orang, nama perusahaan nyata, dan nama sekolah.
- Email, nomor telepon, alamat, dan tautan profil.
- Nama rekruter dan kontak internal.
- Kombinasi unik yang bisa mengidentifikasi seseorang.

Gunakan placeholder konsisten: `[NAMA]`, `[PERUSAHAAN]`, `[KOTA]`, `[EMAIL]`.

### Format JSONL

Satu baris berisi satu contoh percakapan:

```jsonl
{"messages":[{"role":"system","content":"Anda adalah asisten penulisan lamaran kerja. Gunakan hanya fakta pada profil."},{"role":"user","content":"Profil: ...\nLowongan: ...\nBuat draft lamaran."},{"role":"assistant","content":"{\"subject\":\"...\",\"body\":\"...\",\"matching_points\":[],\"missing_requirements\":[],\"facts_to_verify\":[]}"}]}
```

Aturan:

- Output assistant harus JSON valid sesuai kontrak di
  [setup.md](setup.md#kontrak-ai).
- Jangan mencampur beberapa task (ekstraksi, draft, matching) dalam satu dataset
  tanpa penanda task di system prompt.
- Simpan versi dataset dengan tanggal, misalnya `dataset-draft-v1.jsonl`.

### Pembagian Data

Jangan split secara acak. Pisahkan berdasarkan:

- **User**: data satu user tidak boleh muncul di train dan test sekaligus.
- **Keluarga lowongan**: satu posisi serupa jangan tersebar di kedua split.
- **Waktu**: gunakan data lebih lama untuk train, data terbaru untuk test.

Komposisi yang disarankan:

```text
Train      80%
Validation 10%
Test       10%   <- tidak dilihat sampai evaluasi akhir
```

### Kualitas Lebih Penting dari Jumlah

300 contoh yang konsisten lebih baik daripada 3.000 contoh yang saling
bertentangan. Sebelum training, lakukan audit manual pada 20 sampel acak:

- Apakah faktanya benar?
- Apakah format JSON valid?
- Apakah nadanya sesuai?
- Apakah ada PII yang terlewat?

## Baseline dan Metrik

Sebelum training, catat performa baseline:

```text
Baseline A: template murni
Baseline B: qwen3:4b tanpa fine-tune
```

Metrik lengkap dan harness ada di [evaluation.md](evaluation.md). Ringkasnya:

- `schema_validity`: persentase output yang lolos validasi zod.
- `factuality`: jumlah klaim yang tidak didukung profil (target 0).
- `requirement_coverage`: berapa requirement lowongan yang disebut.
- `missing_detection`: apakah requirement yang tidak dipenuhi ikut dilaporkan.
- `human_preference`: penilaian buta antara dua output.

## Fine-tune LoRA/QLoRA

### Memilih Tool

| Tool | Kelebihan | Kekurangan |
|---|---|---|
| Unsloth | Cepat, hemat VRAM, cocok untuk pemula | Dukungan model terbatas |
| LLaMA-Factory | Banyak format dataset, UI tersedia | Konfigurasi lebih banyak |
| Axolotl | Fleksibel, komunitas besar | Kurva belajar lebih curam |

Untuk proyek ini, Unsloth atau LLaMA-Factory sudah cukup.

### Kebutuhan VRAM

| Model | Metode | VRAM minimum |
|---|---|---|
| 4B | QLoRA 4-bit | 8-10 GB |
| 7-8B | QLoRA 4-bit | 12-16 GB |
| 14B | QLoRA 4-bit | 20-24 GB |
| 8B | LoRA 16-bit | 24 GB+ |

### Hyperparameter Awal

```text
LoRA rank (r)        : 16
LoRA alpha           : 32
LoRA dropout         : 0.05
Learning rate        : 2e-4
Epochs               : 2-3
Batch size (effective): 8-16 (gradient accumulation)
Max sequence length  : 4096
Scheduler            : cosine
Warmup ratio         : 0.03
```

Mulai dari nilai ini, lalu bandingkan dengan eval set. Jangan mengubah banyak
parameter sekaligus.

### Contoh Alur dengan LLaMA-Factory

```bash
# 1. Siapkan environment di GPU sewa
python -m venv .venv && source .venv/bin/activate
pip install llamafactory

# 2. Daftarkan dataset di data/dataset_info.json
#    { "lamar_draft": { "file_name": "dataset-draft-v1.jsonl" } }

# 3. Jalankan training QLoRA
llamafactory-cli train configs/qwen3-4b-qlora.yaml
```

Isi `configs/qwen3-4b-qlora.yaml` yang perlu diperhatikan:

```yaml
model_name_or_path: Qwen/Qwen3-4B
stage: sft
do_train: true
finetuning_type: lora
lora_rank: 16
lora_alpha: 32
lora_dropout: 0.05
dataset: lamar_draft
template: qwen
cutoff_len: 4096
learning_rate: 2.0e-4
num_train_epochs: 3
per_device_train_batch_size: 2
gradient_accumulation_steps: 8
output_dir: outputs/qwen3-4b-lamar
```

### Memantau Training

- Loss harus turun stabil. Jika naik, turunkan learning rate.
- Evaluasi pada validation set setiap epoch, bukan hanya di akhir.
- Hentikan jika validation loss mulai naik (overfitting).
- Simpan checkpoint terbaik, bukan yang terakhir.

## Export ke GGUF dan Ollama

```bash
# 1. Merge adapter ke base model
python scripts/merge_lora.py \
  --base Qwen/Qwen3-4B \
  --adapter outputs/qwen3-4b-lamar \
  --output merged/qwen3-4b-lamar

# 2. Konversi ke GGUF
python llama.cpp/convert_hf_to_gguf.py merged/qwen3-4b-lamar \
  --outfile qwen3-4b-lamar.f16.gguf

# 3. Quantize
./llama.cpp/build/bin/llama-quantize \
  qwen3-4b-lamar.f16.gguf qwen3-4b-lamar.Q4_K_M.gguf Q4_K_M

# 4. Buat model di Ollama
cat > Modelfile <<'EOF'
FROM ./qwen3-4b-lamar.Q4_K_M.gguf
PARAMETER num_ctx 8192
PARAMETER temperature 0.3
SYSTEM "Anda adalah asisten penulisan lamaran kerja. Gunakan hanya fakta pada profil."
EOF

ollama create lamar-draft:q4 -f Modelfile
```

Setelah itu ubah `OLLAMA_MODEL=lamar-draft:q4` di environment.

## Deploy Champion/Challenger

Jangan langsung mengganti model produksi.

```text
1. Simpan model lama sebagai champion.
2. Jalankan model baru sebagai challenger di environment non-produksi.
3. Jalankan eval set yang sama pada keduanya.
4. Bandingkan hasil dan latency.
5. Aktifkan model baru hanya jika melewati gate di evaluation.md.
6. Simpan jalur rollback: cukup ubah OLLAMA_MODEL kembali.
```

## Fine-tune Embedding

Untuk matching, fine-tune embedding biasanya memberi dampak lebih besar daripada
fine-tune LLM.

- Model dasar: `bge-m3` (multilingual) atau `multilingual-e5-small` (CPU-friendly).
- Data: pasangan (profil, lowongan) dengan label relevan/tidak relevan.
- Label bisa berasal dari hasil user: lamaran yang dikirim = positif.
- Loss: triplet atau contrastive.
- Setelah fine-tune, konversi ke ONNX agar tetap cepat di CPU.

Jalankan fine-tune embedding **sebelum** mempertimbangkan fine-tune LLM.

## Privasi Training

Aturan ini berlaku untuk semua anggota tim, termasuk yang punya akses VM
produksi:

1. Data CV/profil produksi **tidak boleh** dipakai untuk training tanpa
   persetujuan tertulis dari pemilik data.
2. Data tidak boleh diunggah ke GPU sewa dalam bentuk mentah. Anonimisasi dulu,
   atau gunakan data sintetis.
3. Dataset training disimpan di penyimpanan proyek, bukan di laptop pribadi.
4. Hapus dataset sementara di GPU sewa setelah training selesai.
5. Catat asal-usul setiap dataset (tanggal, sumber, siapa yang mengkurasi).

Detail kebijakan ada di [privacy.md](privacy.md).

## Estimasi Biaya dan Waktu

| Tahap | Waktu | Biaya |
|---|---|---|
| Membuat eval set | 1-2 hari | $0 |
| Mengkurasi dataset 500 contoh | 2-3 hari | $0 |
| Training 4B QLoRA | 1-3 jam | ~$1-3 (GPU sewa) |
| Export + quantize | 30 menit | ~$0,5 |
| Evaluasi | 1 hari | $0 |
| Training 8B QLoRA | 3-6 jam | ~$3-8 |

Total realistis untuk satu siklus: **sekitar 1 minggu**, dengan sebagian besar
waktu di kurasi data, bukan di training.

## Checklist Sebelum Training

- [ ] Eval set 50-100 contoh sudah ada dan disetujui.
- [ ] Baseline template dan model lama sudah tercatat.
- [ ] Dataset minimal 300 contoh, sudah dianonimisasi.
- [ ] Split by user dan job family, bukan acak.
- [ ] Format JSONL valid dan output sesuai schema.
- [ ] Audit manual 20 sampel sudah dilakukan.
- [ ] GPU sewa sudah disiapkan dan dataset dihapus setelah selesai.
- [ ] Rencana rollback jelas.

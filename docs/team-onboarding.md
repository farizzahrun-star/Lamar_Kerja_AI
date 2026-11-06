# Panduan Onboarding Tim

Dokumen ini untuk anggota tim yang baru bergabung. Targetnya: dalam 1-2 hari
sudah bisa menjalankan aplikasi, memahami arsitektur, menemukan kode, dan
bereksperimen tanpa membahayakan data produksi.

Tim proyek ini terdiri dari dua orang: pemilik proyek dan satu kolaborator.
Keduanya memiliki akses ke VM produksi, sehingga aturan akses di dokumen ini
bersifat wajib, bukan saran.

## 1. Peta Dokumentasi

Baca dengan urutan ini:

| Urutan | Dokumen | Tujuan |
|---|---|---|
| 1 | [README.md](../README.md) | Gambaran produk dan prinsip |
| 2 | [workflow.md](workflow.md) | Alur 4 tahap: scraping, pilih, draft, kirim |
| 3 | [architecture.md](architecture.md) | Komponen, alur, dan model data |
| 4 | [decisions.md](decisions.md) | Alasan di balik keputusan teknis |
| 5 | [privacy.md](privacy.md) | Aturan data yang tidak boleh dilanggar |
| 6 | [sources.md](sources.md) | Aturan scraping guest dan adapter platform |
| 7 | [setup.md](setup.md) | Cara menjalankan, Local Runner, dan deploy |
| 8 | [roadmap.md](roadmap.md) | Urutan fase pengembangan (Phase 0-7) |
| 9 | [evaluation.md](evaluation.md) | Cara mengukur kualitas |
| 10 | [ai-training.md](ai-training.md) | Cara training, jika diperlukan (Phase 7) |

## 2. Mental Model Arsitektur

```text
VM Oracle (Always Free, 2 OCPU / 12 GB)
  web       Next.js  -> UI + API + endpoint Runner
  worker    pg-boss  -> matching, prepare draft, email
  db        Postgres -> data + queue + pgvector
  ollama    opsional -> draft enhancement (CPU)

Laptop/PC Tim (IP residensial)
  runner    Playwright -> scraping guest (Stage 1) + portal apply (Stage 4b)

Akses masuk lewat Cloudflare Tunnel. Tidak ada port terbuka.
```

Prinsip yang harus selalu diingat:

1. **Template-first, rules-first, AI-last.** Fitur inti jalan tanpa LLM; LLM hanya menghasilkan teks, tidak pernah mengirim lamaran.
2. **Data kandidat tidak keluar ke provider AI.** Tidak ada API LLM komersial.
3. **Lowongan adalah snapshot H-1**, dikumpulkan lewat scraping guest oleh Local Runner (maks 10/platform/hari).
4. **Tidak menyimpan password/cookie platform di server.** Login portal dilakukan manual di profil browser lokal.
5. **Manusia adalah otoritas akhir.** Email butuh approve; portal apply berhenti sebelum tombol Submit secara default (`PORTAL_AUTO_SUBMIT=false`).

## 3. Hari Pertama: Checklist 30 Menit

Prasyarat: Node.js 22, pnpm, Docker, Git.

```bash
git clone <repo>
cd Lamar_Kerja_AI
cp .env.example .env
pnpm install
docker compose -f infrastructure/docker-compose.yml up -d db
pnpm db:migrate
pnpm db:seed          # data contoh, bukan data produksi
pnpm dev              # http://localhost:3000
pnpm worker:dev       # terminal terpisah
```

Verifikasi:

- [ ] Bisa register dan login.
- [ ] Bisa mengisi profil dan mengunduh CV PDF.
- [ ] Bisa melihat daftar lowongan contoh.
- [ ] Bisa membuat draft lamaran.
- [ ] `AI_ENABLED=false` dan tidak ada error.
- [ ] Worker berjalan dan memproses satu task contoh.

> Catatan: sebagian perintah di atas baru tersedia setelah Phase 0 selesai.
> Jika perintah belum ada, tanyakan status implementasi ke pemilik proyek.

## 4. Struktur Repo: Mau Ubah X, Buka Y

| Ingin mengubah | Buka |
|---|---|
| Halaman onboarding | `apps/web/src/app/(app)/onboarding` |
| Layout dashboard | `apps/web/src/app/(app)` |
| API profil | `apps/web/src/app/api/profile` |
| API Runner (claim/report task) | `apps/web/src/app/api/runner` |
| Local Runner (Playwright) | `apps/runner/src` |
| Adapter scraping guest | `apps/runner/src/scrapers` |
| Adapter portal apply | `apps/runner/src/portals` |
| Template CV | `packages/pdf/templates` |
| Renderer PDF | `packages/pdf` |
| Skor kecocokan | `packages/matching` |
| Worker discovery / ingest | `workers/src/discovery` |
| Worker draft (`application.prepare`) | `workers/src/generator` |
| Worker email (`email.send`) | `workers/src/sender` |
| Schema database | `packages/db/schema` |
| Migration | `packages/db/migrations` |
| Prompt | `prompts/` |
| Konstanta bersama | `packages/shared` |
| Deploy | `infrastructure/` |

## 5. Eksplorasi Codebase

Gunakan codebase-memory MCP sebelum `grep`. Alurnya:

```text
search_graph      -> temukan simbol
trace_path        -> lihat siapa memanggil / dipanggil
get_code_snippet  -> baca implementasi
query_graph       -> pola multi-hop
get_architecture  -> gambaran umum
check_index_coverage -> pastikan tidak ada bagian yang terlewat
```

Tingkat keyakinan:

| Tier | Kapan dipakai |
|---|---|
| Scout | Pencarian cepat, hasil masih provisional |
| Verify | Default; klaim didukung snippet dan trace |
| Auditor | Klaim menyeluruh, butuh pagination dan kedua arah trace |

Aturan:

- Sebelum menyatakan "tidak ada kode untuk X", jalankan
  `check_index_coverage` dan sebutkan hasilnya.
- Untuk string literal, pesan error, atau file konfigurasi, gunakan `grep`.
- Jangan mengandalkan ingatan; baca snippet sebelum mengubah.

Contoh query:

```text
"Di mana skor kecocokan dihitung?"
  -> search_graph(name_pattern=".*score.*")

"Siapa yang memanggil handler discovery?"
  -> trace_path(function_name="discovery.run", direction="inbound")

"Tampilkan isi normalizeJob"
  -> get_code_snippet(qualified_name="workers/src/discovery.normalizeJob")

"Semua tempat yang menulis ke job_snapshots"
  -> query_graph(cypher="...")
```

## 6. Eksplorasi Produk

Gunakan data seed, bukan data produksi.

Alur wajib yang harus dicoba:

```text
register -> onboarding -> generate CV -> pilih minat
-> lihat jobs -> buka detail -> buat draft -> edit -> approve
```

Hal yang perlu diperiksa saat eksplorasi:

- Apakah banner snapshot menampilkan tanggal yang benar?
- Apa yang terjadi jika snapshot H-1 kosong?
- Apakah skor bisa dijelaskan lewat breakdown?
- Apakah draft bisa diedit sebelum dikirim?
- Apakah status lamaran berubah di riwayat?

## 7. Eksplorasi AI

AI bersifat opsional. Untuk bereksperimen:

```bash
ollama pull qwen3:4b
ollama serve
```

Lalu set:

```env
AI_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

Yang bisa dibandingkan:

- Draft template vs draft LLM untuk lowongan yang sama.
- Pengaruh `num_ctx` terhadap deskripsi lowongan panjang.
- Perilaku saat Ollama dimatikan di tengah proses (harus fallback, bukan error).

Gunakan [evaluation.md](evaluation.md) untuk menilai, jangan hanya mengandalkan
kesan.

## 8. Eksplorasi Sumber Lowongan & Local Runner

Aturan scraping dan apply dijelaskan di [sources.md](sources.md) dan
[workflow.md](workflow.md). Poin utama:

- Scraping hanya dijalankan oleh **Local Runner** di laptop tim, bukan VM.
- Gunakan mode **guest** (tanpa login, tanpa cookie akun pribadi) untuk
  scraping.
- Batas keras: **maks 10 lowongan baru per platform per hari**, jeda 20-45 detik.
- Jika platform menampilkan login wall atau CAPTCHA: **berhenti**, jangan paksa.
- Dilarang bypass anti-bot, dilarang rotasi proxy, dilarang simpan password ke
  server.

Saat menambah adapter scraping baru di `apps/runner/src/scrapers`:

1. Buat adapter yang mengimplementasikan interface `ScraperAdapter`.
2. Gunakan fixture HTML tersimpan untuk unit test, jangan panggil live network.
3. Pastikan output dinormalisasi ke kontrak `DiscoveredJob` / schema `jobs`.
4. Simpan status run di `collector_runs`.
5. Dokumentasikan status dan batas platform di [sources.md](sources.md).

Saat menambah adapter portal apply di `apps/runner/src/portals`:

1. Implementasikan interface `PortalAdapter`.
2. Gunakan profil `profile-<user>` (login manual oleh user di perangkat lokal).
3. Isi pertanyaan sensitif hanya dari `portal_answers`, bukan tebakan LLM.
4. Berhenti sebelum tombol Submit (`PORTAL_AUTO_SUBMIT=false` default).
5. Jika ada verifikasi/CAPTCHA, set status task `needs_user`.

## 9. Akses Produksi

### Access Matrix

| Aktivitas | Pemilik | Kolaborator |
|---|---|---|
| Baca kode & buat PR | Ya | Ya |
| Merge ke `main` | Ya | Ya, setelah review |
| Deploy ke VM | Ya | Ya, dengan checklist |
| Migration produksi | Ya | Setelah backup + konfirmasi pemilik |
| Akses isi tabel profil/CV | Ya | Hanya lewat view teredaksi |
| Ubah secret / `.env` produksi | Ya | Tidak |
| Hapus data user | Ya | Tidak |
| Restore backup | Ya | Ya, dalam insiden |

### Aturan Wajib

1. **SSH key pribadi.** Tidak ada akun atau key yang dipakai bersama.
2. **Dua role database**: `app` untuk aplikasi, `analytics_ro` read-only untuk
   eksplorasi. Jangan memakai superuser untuk pekerjaan sehari-hari.
3. **Dilarang `pg_dump` database produksi ke laptop.** Untuk eksperimen gunakan
   seed atau data sintetis.
4. **Log tidak boleh memuat PII.** Periksa sebelum menambah logging baru.
5. **Migration produksi**: backup -> jalankan -> verifikasi -> lanjut. Jangan
   pernah menjalankan migration tanpa backup.
6. **Deploy lewat `docker compose`** dengan tag commit, bukan edit manual di
   server.
7. **Perubahan `.env` produksi dicatat**: tanggal, variabel, alasan.
8. **Data produksi tidak untuk training** tanpa persetujuan pemilik data.

### Insiden

```text
1. Hentikan proses yang bermasalah (kill switch queue bila perlu).
2. Catat waktu, gejala, dan perubahan terakhir.
3. Pulihkan dari backup jika data terdampak.
4. Verifikasi dengan alur wajib (login -> CV -> jobs -> draft).
5. Tulis catatan singkat: penyebab, perbaikan, pencegahan.
```

## 10. Alur Kontribusi

```text
1. Buat branch: feat/..., fix/..., docs/...
2. Commit kecil dan jelas.
3. Buka PR dengan deskripsi: apa, mengapa, cara uji.
4. Review oleh orang lain. Jika tidak memungkinkan, gunakan self-review checklist.
5. Pastikan CI lulus: lint, typecheck, test.
6. Merge dan deploy.
```

Review checklist:

- [ ] Tidak ada secret atau data produksi di diff.
- [ ] Migration reversible atau punya rencana rollback.
- [ ] `AI_ENABLED=false` tetap bekerja.
- [ ] Test baru mencakup perubahan.
- [ ] Dokumentasi diperbarui jika perilaku berubah.

Kapan menulis ADR baru di [decisions.md](decisions.md):

- Mengubah arsitektur, hosting, atau privasi.
- Menambah dependency besar.
- Mengubah cara data disimpan atau dikirim.

Tidak perlu ADR untuk perbaikan bug atau perubahan UI kecil.

## 11. Learning Path 2 Minggu

| Hari | Fokus |
|---|---|
| 1 | Setup lokal, jalankan web dan worker, coba alur wajib |
| 2 | Baca workflow + arsitektur + decisions + privacy |
| 3 | Eksplorasi kode dengan codebase-memory |
| 4 | Ubah satu hal kecil di UI profil dan buka PR |
| 5 | Pelajari schema database (`packages/db/schema`) dan migration |
| 6 | Pelajari Local Runner (`apps/runner`) dan adapter scraping guest |
| 7 | Pelajari normalizer, dedupe, dan worker discovery |
| 8 | Pelajari rules matching dan breakdown skor (Phase 3) |
| 9 | Pelajari template CV dan renderer PDF (`packages/pdf`) |
| 10 | Pelajari draft generator, `portal_answers`, dan alur review (Phase 4) |
| 11 | Pelajari adapter email (Gmail API) dan tracking (Phase 5) |
| 12 | Pelajari adapter portal apply Playwright (Phase 6) |
| 13 | Jalankan eval set dan eksplorasi Ollama CPU-only (Phase 7, opsional) |
| 14 | Ambil satu task mandiri dari [roadmap.md](roadmap.md) |

## 12. FAQ dan Troubleshooting

**Database tidak bisa connect.**
Pastikan container `db` berjalan dan `DATABASE_URL` sesuai.

**Worker tidak memproses task.**
Cek `pnpm worker:dev` berjalan, koneksi database sama, dan schema `pgboss` ada.

**Draft lama atau tidak muncul.**
Periksa `AI_ENABLED`. Jika `true` tetapi Ollama mati, sistem harus fallback ke
template; kalau tidak, itu bug.

**Lowongan kosong.**
Cek `job_snapshots` untuk tanggal H-1, lalu cek `lastRunAt` di response API.

**CV PDF rusak.**
Pastikan data profil lengkap dan template yang dipilih tersedia.

**Tidak yakin harus mengubah apa.**
Mulai dari [roadmap.md](roadmap.md), pilih task di fase yang sedang berjalan.

# Panduan Deploy VM Oracle Cloud (Ampere A1)

Dokumen ini melengkapi [docs/setup.md](../docs/setup.md) dan [docs/architecture.md](../docs/architecture.md) dengan konfigurasi Compose siap pakai di folder `infrastructure/`.

## Prasyarat VM
- Compute Instance **Oracle Always Free**: `VM.Standard.A1.Flex` (**4 OCPU / 24 GB RAM**, Ubuntu 24.04 ARM64).
- Security List VCN: cukup buka port **22 (SSH)**; port 80/443 tidak dibuka karena akses publik masuk melalui **Cloudflare Tunnel**.
- Docker Engine + Docker Compose plugin terpasang.
- Seluruh migration SQL di `migrations/` (`0001`, `0002`, `0003`) sudah diterapkan ke Supabase.

## Langkah Deploy Pertama Kali

```bash
# 1. Siapkan direktori data persisten (UID 1000 cocok dengan user `node` di container)
sudo mkdir -p /data/cv /data/resumes
sudo chown -R $USER:$USER /data

# 2. Clone repo & isi .env
git clone <URL_REPO> /opt/lamar-kerja-ai
cd /opt/lamar-kerja-ai
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
# SUPABASE_JWKS_URL, APP_URL, ADMIN_EMAILS, REGISTRATION_ENABLED=false,
# CLOUDFLARE_TUNNEL_TOKEN (dari Cloudflare Zero Trust)

# 3. Build & jalankan stack (web, worker, ollama, caddy + cloudflared jika token terisi)
chmod +x infrastructure/scripts/deploy.sh infrastructure/scripts/backup-supabase.sh
./infrastructure/scripts/deploy.sh

# 4. Tarik model AI internal qwen3:4b satu kali
docker compose -f infrastructure/docker-compose.yml exec ollama ollama pull qwen3:4b
```

## Konfigurasi Cloudflare Tunnel
Pada **Cloudflare Zero Trust → Networks → Tunnels → Public Hostname**:
- **Hostname:** `lamar.domainanda.com` (sesuai `APP_URL`)
- **Service:** `HTTP` → `caddy:80`

Setelah aktif, tambahkan `https://lamar.domainanda.com` (dan `https://lamar.domainanda.com/auth/callback`) pada **Supabase Dashboard → Authentication → URL Configuration**.

## Uji Backup & Restore
```bash
# Buat backup terenkripsi
./infrastructure/scripts/backup-supabase.sh

# Uji dekripsi ke file SQL sementara (jangan jalankan ke produksi!)
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY \
  -in /var/backups/lamarkerja/lamarkerja-<STAMP>.sql.gz.enc | gunzip > /tmp/restore-check.sql
```

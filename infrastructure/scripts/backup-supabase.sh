#!/usr/bin/env bash
set -euo pipefail

# Ekspor database Supabase terenkripsi AES-256 (retensi lokal 30 hari).
# Jalankan lewat cron harian di VM setelah mengisi SUPABASE_DB_URL & BACKUP_ENCRYPTION_KEY di .env.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lamarkerja}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL wajib diisi untuk pg_dump}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY wajib diisi untuk enkripsi backup}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/lamarkerja-${STAMP}.sql.gz.enc"

pg_dump --no-owner --no-privileges "$SUPABASE_DB_URL" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_KEY -out "$OUT_FILE"

chmod 600 "$OUT_FILE"
find "$BACKUP_DIR" -type f -name 'lamarkerja-*.sql.gz.enc' -mtime +30 -delete

echo "Backup terenkripsi tersimpan: $OUT_FILE"

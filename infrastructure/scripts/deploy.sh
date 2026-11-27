#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infrastructure/docker-compose.yml"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "File .env tidak ditemukan di $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DATA_ROOT="${DATA_DIR:-/data}"
mkdir -p "$DATA_ROOT/cv" "$DATA_ROOT/resumes"

COMPOSE_ARGS=(-f "$COMPOSE_FILE" --env-file "$ENV_FILE")
if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  COMPOSE_ARGS+=(--profile tunnel)
fi

cd "$ROOT_DIR"
docker compose "${COMPOSE_ARGS[@]}" build
docker compose "${COMPOSE_ARGS[@]}" up -d

echo "Menunggu healthcheck web di http://127.0.0.1:8080/api/health ..."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "Web sehat dan siap melayani trafik."
    exit 0
  fi
  sleep 2
done

echo "Healthcheck web gagal setelah 60 detik." >&2
docker compose "${COMPOSE_ARGS[@]}" logs --tail=60 web
exit 1

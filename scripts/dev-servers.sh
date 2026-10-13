#!/bin/bash
# Démarre toute la stack LOGIQUALI en local : Postgres 55432, Laravel :8000, Vite :5173.
# Usage : bash scripts/dev-servers.sh        (relançable sans doublons)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="/tmp/opencode"
mkdir -p "$LOGDIR"

up() { ss -ltn 2>/dev/null | grep -qE ":$1\\b"; }

# 1. Postgres (data dir dédié, port 55432)
if up 55432; then
  echo "[pg] déjà en écoute sur 55432"
else
  echo "[pg] démarrage…"
  /usr/lib/postgresql/16/bin/pg_ctl -D /home/beg2/.pgdata-logiquali-55432 \
    -l "$LOGDIR/pg-55432.log" \
    -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp" start
fi

# 2. Laravel (détaché, log fichier — ne jamais piper vers head)
if up 8000; then
  echo "[api] déjà en écoute sur 8000"
else
  echo "[api] démarrage…"
  cd "$ROOT/backend" && nohup php artisan serve --host=127.0.0.1 --port=8000 \
    > "$LOGDIR/artisan-8000.log" 2>&1 &
  sleep 4
fi

# 3. Vite (détaché, log fichier)
if up 5173; then
  echo "[front] déjà en écoute sur 5173"
else
  echo "[front] démarrage…"
  cd "$ROOT" && nohup npm run dev -- --port 5173 --host 127.0.0.1 \
    > "$LOGDIR/vite-5173.log" 2>&1 &
  sleep 10
fi

echo "--- vérification ---"
curl -s -o /dev/null -w "front :5173 -> %{http_code}\n" http://127.0.0.1:5173/ -m 8 || true
curl -s -o /dev/null -w "api   :8000 -> %{http_code} (401 = garde auth OK)\n" http://127.0.0.1:8000/api/v1/auth/me -m 8 || true

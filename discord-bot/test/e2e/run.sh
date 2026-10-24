#!/usr/bin/env bash
# Starts PostgREST against a test database and runs the bot's end-to-end check.
# Usage: POSTGREST_BIN=/path/to/postgrest PGRST_DB_URI=postgresql://... \
#        PGHOST=... PGPORT=... PGUSER=... PGDATABASE=... discord-bot/test/e2e/run.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
port="${POSTGREST_PORT:-3999}"
log="$(mktemp)"

PGRST_DB_URI="${PGRST_DB_URI:?Set PGRST_DB_URI}" \
PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=service_role \
PGRST_SERVER_PORT="$port" \
PGRST_DB_CHANNEL_ENABLED=false \
  "${POSTGREST_BIN:?Set POSTGREST_BIN}" >"$log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true; rm -f "$log"' EXIT

for _ in $(seq 1 100); do
  if curl -sf "http://localhost:$port/" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$pid" 2>/dev/null; then cat "$log"; exit 1; fi
  sleep 0.1
done

POSTGREST_URL="http://localhost:$port" node "$here/run.mjs" || { echo "--- PostgREST log"; cat "$log"; exit 1; }

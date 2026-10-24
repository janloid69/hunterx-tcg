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

# Wait up to a minute for PostgREST to load the schema.
ready=false
for _ in $(seq 1 300); do
  if curl -sf "http://localhost:$port/" >/dev/null 2>&1; then ready=true; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then echo "::error title=PostgREST::PostgREST stopped"; cat "$log"; exit 1; fi
  sleep 0.2
done
if [ "$ready" != true ]; then echo "::error title=PostgREST::PostgREST didn't start within a minute"; cat "$log"; exit 1; fi

POSTGREST_URL="http://localhost:$port" node "$here/run.mjs" || { echo "--- PostgREST log"; cat "$log"; exit 1; }

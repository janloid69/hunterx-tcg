#!/usr/bin/env bash
# Runs the schema checks against a throwaway local Postgres server.
# Usage: supabase/tests/run_local.sh   (needs Postgres 15+ binaries on PATH or in /usr/lib/postgresql)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
export PATH="${bin:+$bin:}$PATH"

data="$(mktemp -d)"
port=55432
cleanup() { pg_ctl -D "$data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$data"; }
trap cleanup EXIT

initdb -D "$data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$data" -o "-p $port -k $data" -l "$data/log" start >/dev/null

run() { psql -h "$data" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

run -f "$here/00_stub_supabase.sql"
for migration in "$root"/supabase/migrations/*.sql; do
  run -f "$migration"
done

# Card sync rows must fit the tables (runs in a transaction that rolls back).
if command -v node >/dev/null 2>&1; then
  DATABASE_URL="postgresql://postgres@localhost:$port/postgres?host=$data" \
    node --test "$root"/scripts/sync-cards/test/*.test.mjs
fi

run -f "$here/10_schema_test.sql"

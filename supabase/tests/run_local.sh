#!/usr/bin/env bash
# Runs the schema checks against a throwaway local Postgres server, twice:
# once like a Supabase project with "Automatically expose new tables" off,
# and once with it on. Both must pass.
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

run() { local db="$1"; shift; psql -h "$data" -p "$port" -U postgres -d "$db" -v ON_ERROR_STOP=1 -q "$@"; }

for mode in strict exposed; do
  echo "== Checks with 'Automatically expose new tables' $([ "$mode" = exposed ] && echo on || echo off)"
  createdb -h "$data" -p "$port" -U postgres "hx_$mode"
  run "hx_$mode" -f "$here/00_stub_supabase.sql"
  if [ "$mode" = exposed ]; then run "hx_$mode" -f "$here/01_expose_new_tables.sql"; fi
  for migration in "$root"/supabase/migrations/*.sql; do
    run "hx_$mode" -f "$migration"
  done

  # Card sync rows must fit the tables (runs in a transaction that rolls back).
  if command -v node >/dev/null 2>&1; then
    DATABASE_URL="postgresql://postgres@localhost:$port/hx_$mode?host=$data" \
      node --test "$root"/scripts/sync-cards/test/*.test.mjs
  fi

  run "hx_$mode" -f "$here/10_schema_test.sql"
done

#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the SQL tests.
# Usage: supabase/tests/run-local.sh   (needs psql and a local Postgres server)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
db="bunkie_test_$$"

createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT

run() { psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }

run -f "$here/shim.sql"
for f in "$root"/migrations/*.sql; do
  case "$f" in *_platform.sql) continue ;; esac   # storage + cron need a real Supabase project
  run -f "$f"
done
run -f "$root/seed.sql"

status=0
for t in "$here"/*.test.sql; do
  if run -f "$t" >/dev/null; then echo "PASS $(basename "$t")"; else echo "FAIL $(basename "$t")"; status=1; fi
done
exit $status

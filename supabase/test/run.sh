#!/usr/bin/env bash
# Applies the migrations to a scratch database and runs the SQL tests.
# Usage: supabase/test/run.sh [psql connection args]
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=(psql -v ON_ERROR_STOP=1 -q "$@")
DB="firstpass_test_$$"
"${PSQL[@]}" -d postgres -c "create database $DB"
trap '"${PSQL[@]}" -d postgres -c "drop database $DB" >/dev/null' EXIT
"${PSQL[@]}" -d "$DB" -c "create extension if not exists pgcrypto" -f test/harness.sql
for f in migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
for f in test/*.test.sql; do echo "== $f"; "${PSQL[@]}" -d "$DB" -f "$f"; done
echo "db tests passed"

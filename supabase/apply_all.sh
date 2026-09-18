#!/usr/bin/env bash
# Concatenate every Supabase migration in timestamp order into one file
# (supabase/apply_all.sql) suitable for the Supabase Dashboard SQL editor.
#
# Usage:
#   ./supabase/apply_all.sh          # writes supabase/apply_all.sql
#   psql "$DATABASE_URL" -f supabase/apply_all.sql   # or apply directly
set -euo pipefail
cd "$(dirname "$0")/migrations"

out="../apply_all.sql"
: > "$out"
n=0
for f in $(ls *.sql | sort); do
  echo "-- ══════════════════════════════════════════════════════════" >> "$out"
  echo "-- MIGRATION: $f" >> "$out"
  echo "-- ══════════════════════════════════════════════════════════" >> "$out"
  cat "$f" >> "$out"
  printf '\n\n' >> "$out"
  n=$((n + 1))
done

echo "Wrote $n migrations -> $out"
echo "Apply via Supabase Dashboard → SQL Editor, or:"
echo "  psql \"\$SUPABASE_DB_URL\" -f supabase/apply_all.sql"

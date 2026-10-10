#!/usr/bin/env bash
set -euo pipefail

backup_file="${1:-}"
if [[ -z "$backup_file" || ! -f "$backup_file" ]]; then
  echo 'Uso: scripts/test-database-restore.sh caminho/para/database.dump' >&2
  exit 1
fi

backup_file_absolute="$(cd "$(dirname "$backup_file")" && pwd)/$(basename "$backup_file")"
backup_directory="$(dirname "$backup_file_absolute")"
manifest_file="$backup_directory/manifest.json"
restore_database="gsa_restore_test_$(date -u +%Y%m%d%H%M%S)_$RANDOM"
restore_schemas="${RESTORE_TEST_SCHEMAS:-public,supabase_migrations}"
IFS=',' read -r -a schema_names <<< "$restore_schemas"
restore_args=()
for schema_name in "${schema_names[@]}"; do
  schema_name="${schema_name//[[:space:]]/}"
  [[ -n "$schema_name" ]] || continue
  [[ "$schema_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || {
    echo "Schema inválido em RESTORE_TEST_SCHEMAS: $schema_name" >&2
    exit 1
  }
  restore_args+=(--schema="$schema_name")
done

if [[ "${#restore_args[@]}" -eq 0 ]]; then
  echo 'RESTORE_TEST_SCHEMAS não contém schemas válidos.' >&2
  exit 1
fi

server_major=""
if [[ -f "$manifest_file" ]] && command -v node >/dev/null 2>&1; then
  server_major="$(node --input-type=module - "$manifest_file" <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(String(manifest.server_major || ''));
NODE
)"
fi

# A recuperação é exercitada em PostgreSQL puro, fora da plataforma Supabase.
# Restauramos pre-data + data para comprovar que o dump é legível e que os
# registros podem ser recuperados. Objetos post-data (RLS, policies, triggers,
# FKs e integrações com auth/storage) são validados separadamente no banco real
# pelo inventário de produção e não são portáveis para um PostgreSQL vazio.
restore_sections=(pre-data data)

bootstrap_sql=$(cat <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SQL
)

validation_sql=$(cat <<'SQL'
DO $$
DECLARE
  v_tables integer;
  v_functions integer;
  v_migrations integer;
BEGIN
  SELECT count(*) INTO v_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  SELECT count(*) INTO v_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public';

  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'Histórico de migrations ausente na restauração';
  END IF;

  SELECT count(*) INTO v_migrations
  FROM supabase_migrations.schema_migrations;

  IF v_tables = 0 THEN
    RAISE EXCEPTION 'Restauração não contém tabelas públicas';
  END IF;

  IF v_functions = 0 THEN
    RAISE EXCEPTION 'Restauração não contém funções públicas';
  END IF;

  IF v_migrations = 0 THEN
    RAISE EXCEPTION 'Restauração não contém registros do histórico de migrations';
  END IF;

  IF to_regprocedure('extensions.uuid_generate_v4()') IS NULL THEN
    RAISE EXCEPTION 'Extensão uuid-ossp ausente na restauração descartável';
  END IF;
END $$;

SELECT 'DATABASE_RESTORE_TEST_OK' AS result;
SQL
)

if [[ "$server_major" =~ ^[0-9]+$ ]] && command -v docker >/dev/null 2>&1; then
  container_name="gsa-restore-pg${server_major}-${GITHUB_RUN_ID:-local}-$RANDOM"
  restore_password="gsa_restore_${RANDOM}_${RANDOM}"
  cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  docker run -d \
    --name "$container_name" \
    -e POSTGRES_PASSWORD="$restore_password" \
    "postgres:${server_major}" >/dev/null

  ready=false
  for attempt in $(seq 1 60); do
    if docker exec "$container_name" pg_isready -U postgres >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 2
  done
  [[ "$ready" == true ]] || {
    echo "PostgreSQL $server_major descartável não ficou pronto." >&2
    exit 1
  }

  docker cp "$backup_file_absolute" "$container_name:/tmp/database.dump" >/dev/null
  docker exec -e PGPASSWORD="$restore_password" "$container_name" \
    createdb -U postgres "$restore_database"

  printf '%s\n' "$bootstrap_sql" | docker exec -i \
    -e PGPASSWORD="$restore_password" \
    "$container_name" \
    psql --username=postgres --dbname="$restore_database" -v ON_ERROR_STOP=1

  for section in "${restore_sections[@]}"; do
    docker exec \
      -e PGPASSWORD="$restore_password" \
      -e PGOPTIONS='-c check_function_bodies=off' \
      "$container_name" \
      pg_restore \
        --exit-on-error \
        --no-owner \
        --no-acl \
        --section="$section" \
        "${restore_args[@]}" \
        --username=postgres \
        --dbname="$restore_database" \
        /tmp/database.dump
  done

  printf '%s\n' "$validation_sql" | docker exec -i \
    -e PGPASSWORD="$restore_password" \
    "$container_name" \
    psql --username=postgres --dbname="$restore_database" -v ON_ERROR_STOP=1
else
  for command_name in createdb dropdb pg_restore psql; do
    command -v "$command_name" >/dev/null 2>&1 || {
      echo "$command_name não está instalado." >&2
      exit 1
    }
  done

  cleanup() {
    dropdb --if-exists "$restore_database" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  createdb "$restore_database"
  printf '%s\n' "$bootstrap_sql" | psql --dbname="$restore_database" -v ON_ERROR_STOP=1

  for section in "${restore_sections[@]}"; do
    PGOPTIONS='-c check_function_bodies=off' pg_restore \
      --exit-on-error \
      --no-owner \
      --no-acl \
      --section="$section" \
      "${restore_args[@]}" \
      --dbname="$restore_database" \
      "$backup_file_absolute"
  done

  printf '%s\n' "$validation_sql" | psql --dbname="$restore_database" -v ON_ERROR_STOP=1
fi

printf 'DATABASE_RESTORE_TEST_OK=%s\n' "$restore_database"
printf 'DATABASE_RESTORE_MODE=pre-data+data\n'

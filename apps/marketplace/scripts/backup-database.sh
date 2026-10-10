#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL deve estar configurada em um secret seguro.}"

output_root="${1:-backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${output_root%/}/database-${timestamp}"
mkdir -p "$backup_dir"
backup_dir_absolute="$(cd "$backup_dir" && pwd)"
umask 077

for required_command in node psql pg_dump sha256sum; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "$required_command não está instalado." >&2
    exit 1
  }
done

connection_file="$backup_dir_absolute/.database-connection.json"
docker_env_file="$backup_dir_absolute/.database-docker.env"
cleanup_sensitive_files() {
  rm -f "$connection_file" "$docker_env_file"
}
trap cleanup_sensitive_files EXIT

node --input-type=module > "$connection_file" <<'NODE'
const parsed = new URL(process.env.SUPABASE_DB_URL);
const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
const connection = {
  host: parsed.hostname,
  port: parsed.port || '5432',
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database,
};
for (const [key, value] of Object.entries(connection)) {
  if (!value) throw new Error(`Campo obrigatório ausente na conexão: ${key}`);
}
process.stdout.write(JSON.stringify(connection));
NODE
chmod 600 "$connection_file"

read_connection_field() {
  local field="$1"
  node --input-type=module - "$connection_file" "$field" <<'NODE'
import fs from 'node:fs';
const [, , filePath, field] = process.argv;
const connection = JSON.parse(fs.readFileSync(filePath, 'utf8'));
process.stdout.write(String(connection[field] ?? ''));
NODE
}

db_host="$(read_connection_field host)"
db_port="$(read_connection_field port)"
db_user="$(read_connection_field user)"
db_password="$(read_connection_field password)"
db_name="$(read_connection_field database)"

server_version_num="$(
  PGPASSWORD="$db_password" \
  PGSSLMODE=require \
  PGCONNECT_TIMEOUT=30 \
  psql -h "$db_host" -p "$db_port" -U "$db_user" -d "$db_name" \
    -Atc 'SHOW server_version_num'
)"
[[ "$server_version_num" =~ ^[0-9]+$ ]] || {
  echo 'Não foi possível identificar a versão do PostgreSQL de produção.' >&2
  exit 1
}
server_major="$((server_version_num / 10000))"

client_version="$(pg_dump --version | sed -E 's/^pg_dump \(PostgreSQL\) ([0-9]+).*/\1/')"
[[ "$client_version" =~ ^[0-9]+$ ]] || {
  echo 'Não foi possível identificar a versão local do pg_dump.' >&2
  exit 1
}
client_major="$client_version"

custom_file="$backup_dir_absolute/database.dump"
schema_file="$backup_dir_absolute/schema.sql"
manifest_file="$backup_dir_absolute/manifest.json"
client_source="local"

run_local_pg_dump() {
  PGPASSWORD="$db_password" \
  PGSSLMODE=require \
  PGCONNECT_TIMEOUT=30 \
  pg_dump \
    -h "$db_host" \
    -p "$db_port" \
    -U "$db_user" \
    -d "$db_name" \
    "$@"
}

run_docker_pg_dump() {
  command -v docker >/dev/null 2>&1 || {
    echo "O pg_dump local é $client_major, o servidor é $server_major e o Docker não está disponível." >&2
    exit 1
  }

  printf 'PGPASSWORD=%s\nPGSSLMODE=require\nPGCONNECT_TIMEOUT=30\n' "$db_password" > "$docker_env_file"
  chmod 600 "$docker_env_file"

  docker run --rm \
    --user "$(id -u):$(id -g)" \
    --env-file "$docker_env_file" \
    --volume "$backup_dir_absolute:/backup" \
    "postgres:${server_major}" \
    pg_dump \
      -h "$db_host" \
      -p "$db_port" \
      -U "$db_user" \
      -d "$db_name" \
      "$@"
}

if (( client_major >= server_major )); then
  run_local_pg_dump \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --file="$custom_file"

  run_local_pg_dump \
    --schema-only \
    --no-owner \
    --no-acl \
    --file="$schema_file"
else
  client_source="docker-postgres-${server_major}"
  run_docker_pg_dump \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --file=/backup/database.dump

  run_docker_pg_dump \
    --schema-only \
    --no-owner \
    --no-acl \
    --file=/backup/schema.sql
fi

cleanup_sensitive_files
trap - EXIT

custom_sha="$(sha256sum "$custom_file" | awk '{print $1}')"
schema_sha="$(sha256sum "$schema_file" | awk '{print $1}')"
custom_size="$(wc -c < "$custom_file" | tr -d ' ')"
schema_size="$(wc -c < "$schema_file" | tr -d ' ')"

cat > "$manifest_file" <<JSON
{
  "created_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "format": "postgresql-custom",
  "server_major": $server_major,
  "client_source": "$client_source",
  "database_file": "database.dump",
  "database_sha256": "$custom_sha",
  "database_bytes": $custom_size,
  "schema_file": "schema.sql",
  "schema_sha256": "$schema_sha",
  "schema_bytes": $schema_size
}
JSON

printf 'DATABASE_BACKUP_OK=%s\n' "$backup_dir"

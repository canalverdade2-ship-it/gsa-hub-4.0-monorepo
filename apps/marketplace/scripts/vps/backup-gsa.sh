#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_root="/var/backups/gsa"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/$stamp"
mkdir -p "$target"

export PGPASSFILE=/etc/gsa-backup/pgpass
pg_dump -h 127.0.0.1 -p 5433 -U supabase_admin -d gsahub \
  --format=custom --compress=9 --no-owner --no-acl \
  --file="$target/gsahub.dump"
pg_restore --list "$target/gsahub.dump" >/dev/null

docker exec evo-postgres sh -c 'pg_dumpall -U "$POSTGRES_USER"' \
  | gzip -9 > "$target/evolution.sql.gz"
gzip -t "$target/evolution.sql.gz"

tar --xattrs --acls -C /var/lib/docker/volumes/n8n_data/_data \
  -czf "$target/n8n-data.tar.gz" .
tar -tzf "$target/n8n-data.tar.gz" >/dev/null

sha256sum "$target"/* > "$target/SHA256SUMS"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +
printf 'GSA_BACKUP_OK=%s\n' "$target"

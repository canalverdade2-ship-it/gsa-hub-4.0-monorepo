#!/usr/bin/env bash
set -euo pipefail
ARCHIVE="${1:?arquivo de release obrigatório}"
ROOT="${GSA_HUB_ROOT:-/var/www/gsa-hub}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$ROOT/backups/releases/$STAMP-${GITHUB_SHA:-manual}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$BACKUP" "$ROOT/backups/releases"
# Backup completo da versão atualmente publicada antes de qualquer alteração.
sudo tar -czf "$BACKUP/current-release.tgz" -C "$ROOT" dist/gsa3-supabase -C /var/www/gsa-hub-staging .
tar -xzf "$ARCHIVE" -C "$STAGE"
sudo rsync -a --delete "$STAGE/public-site/dist/" /var/www/gsa-hub-staging/
sudo rsync -a --delete "$STAGE/admin-supabase/dist/" "$ROOT/dist/gsa3-supabase/"
printf 'release=%s\nbackup=%s\n' "${GITHUB_SHA:-manual}" "$BACKUP"
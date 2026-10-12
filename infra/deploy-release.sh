#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ARCHIVE="${1:?release archive required}"
ROOT="/var/www/gsa-hub"
: "${GITHUB_SHA:?commit SHA required}"
BACKUP="$ROOT/backups/releases/$(date -u +%Y%m%dT%H%M%SZ)-$GITHUB_SHA"
STAGE="$(mktemp -d)"
publishing=0
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
tar -xzf "$ARCHIVE" -C "$STAGE"
for app in public-site admin-supabase client-supabase marketplace; do
  test -s "$STAGE/$app/dist/index.html"
done
sudo install -d -m 700 "$BACKUP"
# Restore only release/configuration on failure; never overwrite live database data.
rollback() {
  local status=$?
  trap - ERR
  if (( publishing )); then
    echo 'Publication failed; restoring previous frontends and Nginx configuration.' >&2
    sudo rsync -a --delete "$BACKUP/frontends/public-site/" /var/www/gsa-hub-staging/
    for app in gsa3-supabase client-supabase marketplace; do
      if sudo test -d "$BACKUP/frontends/$app"; then
        sudo rsync -a --delete "$BACKUP/frontends/$app/" "$ROOT/dist/$app/"
      fi
    done
    sudo cp -a "$BACKUP/nginx.conf" /etc/nginx/nginx.conf
    sudo nginx -t && sudo systemctl reload nginx
  fi
  exit "$status"
}
trap rollback ERR
sudo mkdir -p "$BACKUP/frontends/public-site"
sudo rsync -a /var/www/gsa-hub-staging/ "$BACKUP/frontends/public-site/"
for app in gsa3-supabase client-supabase marketplace; do
  if sudo test -d "$ROOT/dist/$app"; then
    sudo mkdir -p "$BACKUP/frontends/$app"
    sudo rsync -a "$ROOT/dist/$app/" "$BACKUP/frontends/$app/"
  fi
done
sudo cp -a /etc/nginx/nginx.conf "$BACKUP/nginx.conf"
sudo tar -czf "$BACKUP/configuration.tgz" /etc/nginx /etc/gsa-backup
sudo env PGPASSFILE=/etc/gsa-backup/pgpass pg_dump -h 127.0.0.1 -p 5433 -U supabase_admin -d gsahub --format=custom --file="$BACKUP/database.dump"
sudo pg_restore --list "$BACKUP/database.dump" >/dev/null
sudo tar -czf "$BACKUP/storage.tgz" -C /var/lib/gsa-storage .
sudo tar -tzf "$BACKUP/storage.tgz" >/dev/null
sudo tar -tzf "$BACKUP/configuration.tgz" >/dev/null
sudo sh -c 'cd "$1" && sha256sum database.dump storage.tgz configuration.tgz > SHA256SUMS && sha256sum -c SHA256SUMS' sh "$BACKUP"
sudo env PGPASSFILE=/etc/gsa-backup/pgpass psql -h 127.0.0.1 -p 5433 -U supabase_admin -d gsahub --single-transaction --set=ON_ERROR_STOP=1 -f infra/migrations/20261012_release_contracts.sql
publishing=1
sudo rsync -a --delete "$STAGE/public-site/dist/" /var/www/gsa-hub-staging/
sudo rsync -a --delete "$STAGE/admin-supabase/dist/" "$ROOT/dist/gsa3-supabase/"
sudo rsync -a --delete "$STAGE/client-supabase/dist/" "$ROOT/dist/client-supabase/"
sudo rsync -a --delete "$STAGE/marketplace/dist/" "$ROOT/dist/marketplace/"
sudo python3 infra/configure-nginx.py
sudo nginx -t
sudo systemctl reload nginx
base="https://api.147-15-43-141.nip.io"
apps=(public-site admin-supabase client-supabase marketplace)
mounts=("" gsa3-supabase/ client-supabase/ marketplace/)
for i in "${!apps[@]}"; do
  curl --fail --silent --show-error --retry 3 "$base/${mounts[$i]}?release=$GITHUB_SHA" -o "$STAGE/smoke.html"
  cmp "$STAGE/${apps[$i]}/dist/index.html" "$STAGE/smoke.html"
  asset=$(grep -oE 'src="[^"]+\.js"' "$STAGE/smoke.html" | head -1 | cut -d'"' -f2)
  test -n "$asset"
  curl --fail --silent --show-error --retry 3 "$base$asset" -o "$STAGE/smoke.js"
  test -s "$STAGE/smoke.js"
done
publishing=0
printf 'release=%s\nbackup=%s\nSMOKE_TEST_OK\n' "$GITHUB_SHA" "$BACKUP"

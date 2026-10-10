#!/usr/bin/env bash
set -euo pipefail

: "${WIPE_CONFIRM:?Defina WIPE_CONFIRM=GSA-HUB-NEW-PRODUCTION para executar}"
if [[ "$WIPE_CONFIRM" != "GSA-HUB-NEW-PRODUCTION" ]]; then
  echo "Confirmação inválida; nada foi alterado." >&2
  exit 2
fi

PG="sudo -u postgres psql -p 5433 -d gsahub -v ON_ERROR_STOP=1"

# Remove todos os registros de negócio, mantendo o schema e o histórico de migrations.
$PG -Atqc "select format('truncate table %I.%I restart identity cascade', schemaname, tablename) from pg_tables where schemaname='public' and tablename <> 'schema_migrations'" | while IFS= read -r statement; do
  $PG -c "$statement"
done

# Remove identidades de autenticação e objetos do Storage.
$PG -c "delete from storage.objects;"
$PG -c "delete from auth.identities;"
$PG -c "delete from auth.users;"

# Remove artefatos do portal legado e bancos de restauração.
sudo systemctl stop gsa-hub.service || true
sudo rm -rf /var/lib/gsa-hub/data/uploads
sudo rm -f /var/lib/gsa-hub/data/gsa3.sqlite /var/lib/gsa-hub/data/gsa3.sqlite-wal /var/lib/gsa-hub/data/gsa3.sqlite-shm
sudo rm -f /var/lib/gsa-hub/validation-*.tar.gz
for db in $(sudo -u postgres psql -p 5433 -Atqc "select datname from pg_database where datname like 'gsa_tv_restore_%' or datname like 'gsahub_e2e_audit_%'"); do
  sudo -u postgres psql -p 5433 -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${db}' and pid <> pg_backend_pid();"
  sudo -u postgres dropdb -p 5433 --if-exists "$db"
done
sudo systemctl start gsa-hub.service || true

echo "PRODUCTION_DATA_RESET_COMPLETE"

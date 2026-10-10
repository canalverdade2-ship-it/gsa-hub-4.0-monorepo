#!/bin/bash
set -euo pipefail

# This script reads the unresolved media items from the latest recovery output
# and marks them as inactive in the database to resolve their impact on the grid.

RUNTIME_DIR="${GSA_TV_RUNTIME_DIR:-/opt/gsa-tv/runtime}"
ENV_FILE="${GSA_TV_ENV_FILE:-/opt/gsa-tv/control-plane/.env}"

UNRESOLVED_FILE="$RUNTIME_DIR/media-recovery-unresolved-latest.tsv"

if [ ! -f "$UNRESOLVED_FILE" ]; then
    echo "Nenhum arquivo de mídias ausentes encontrado em $UNRESOLVED_FILE."
    exit 0
fi

[ -f "$ENV_FILE" ] || { echo "BLOCKED: env file missing" >&2; exit 78; }
DB_URL="$(awk -F= '$1=="DATABASE_URL"{sub(/^[^=]*=/,"");print;exit}' "$ENV_FILE")"
[ -n "$DB_URL" ] || { echo "BLOCKED: DATABASE_URL missing" >&2; exit 78; }

MISSING_IDS=""
while IFS='|' read -r media_id drive_path candidates; do
    if [ -n "$media_id" ]; then
        if [ -z "$MISSING_IDS" ]; then
            MISSING_IDS="'$media_id'"
        else
            MISSING_IDS="$MISSING_IDS, '$media_id'"
        fi
    fi
done < "$UNRESOLVED_FILE"

if [ -z "$MISSING_IDS" ]; then
    echo "Nenhuma mídia ausente listada no arquivo."
    exit 0
fi

echo "Desativando ${MISSING_IDS} no banco de dados para evitar buracos na grade..."

psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "
UPDATE public.gsa_tv_media_items
   SET rights_ok = false,
       approval_state = 'rejected',
       metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('autopilot_recovery_missing', true)
 WHERE id IN ($MISSING_IDS);
"

echo "Concluído. Mídias ausentes foram desativadas e não impactarão a grade (serão substituídas por fallback contínuo ou ignoradas no compile)."

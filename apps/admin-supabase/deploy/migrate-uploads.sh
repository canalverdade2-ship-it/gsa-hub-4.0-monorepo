#!/usr/bin/env bash
set -euo pipefail
key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p')
export key
for f in /var/lib/gsa-hub/data/uploads/*; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  mime=$(file -b --mime-type "$f")
  code=$(curl -sS -o /tmp/storage-upload.out -w '%{http_code}' -X POST "https://api.147-15-43-141.nip.io/storage/v1/object/gsa3-private/legacy/$name" -H "Authorization: Bearer $key" -H "apikey: $key" -H "Content-Type: $mime" --data-binary "@$f")
  echo "$name $code"
done

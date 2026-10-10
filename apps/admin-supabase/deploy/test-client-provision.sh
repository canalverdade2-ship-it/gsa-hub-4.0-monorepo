#!/usr/bin/env bash
set -euo pipefail
anon=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_ANON_KEY=//p')
key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p')
email=$(sudo cat /tmp/gsa-qa-admin.credentials | sed -n 1p); password=$(sudo cat /tmp/gsa-qa-admin.credentials | sed -n 2p); stamp=$(date +%s); client_email="qa-api-$stamp@test.gsa"; client_tax="987654${stamp: -8}"
token=$(curl -fsS -X POST 'https://api.147-15-43-141.nip.io/auth/v1/token?grant_type=password' -H "apikey: $anon" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$password\"}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
echo rpc=$(curl -sS -X POST https://api.147-15-43-141.nip.io/rest/v1/rpc/gsa_next_business_id -H "apikey: $anon" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d '{"p_kind":"clients","p_start":111}')
curl -sS -X POST https://api.147-15-43-141.nip.io/functions/v1/client-provision -H "apikey: $anon" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "{\"name\":\"Cliente QA API $stamp\",\"email\":\"$client_email\",\"taxDocument\":\"$client_tax\",\"phone\":\"11988887777\"}"

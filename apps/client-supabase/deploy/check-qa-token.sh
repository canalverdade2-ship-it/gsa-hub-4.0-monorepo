#!/usr/bin/env bash
set -euo pipefail
anon=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_ANON_KEY=//p')
email=$(sudo cat /tmp/gsa-qa-admin.credentials | sed -n 1p)
password=$(sudo cat /tmp/gsa-qa-admin.credentials | sed -n 2p)
resp=$(curl -fsS -X POST 'https://api.147-15-43-141.nip.io/auth/v1/token?grant_type=password' -H "apikey: $anon" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$password\"}")
printf '%s' "$resp" | python3 -c 'import json,sys,base64; x=json.load(sys.stdin); t=x["access_token"]; p=t.split(".")[1]+"=="; d=json.loads(base64.urlsafe_b64decode(p)); print(sorted(d.keys())); print(d); print(len(t))'

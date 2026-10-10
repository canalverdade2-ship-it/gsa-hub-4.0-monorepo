#!/usr/bin/env bash
set -euo pipefail
key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p')
uid=$(sudo -u postgres psql -p 5433 -d gsahub -Atc "select id from auth.users where email='qa-admin-1791570242@gsa.test'")
curl -sS -X PUT "https://api.147-15-43-141.nip.io/auth/v1/admin/users/$uid" -H "Authorization: Bearer $key" -H "apikey: $key" -H 'Content-Type: application/json' -d '{"password":"QA-Reset-720c86e70d572fd!a"}'

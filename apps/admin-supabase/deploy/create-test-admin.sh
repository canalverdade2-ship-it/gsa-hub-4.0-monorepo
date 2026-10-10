#!/usr/bin/env bash
set -euo pipefail
email="qa-admin-$(date +%s)@gsa.test"
password="QA-$(openssl rand -hex 12)!a"
key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p')
url='https://api.147-15-43-141.nip.io'
body=$(printf '{"email":"%s","password":"%s","email_confirm":true}' "$email" "$password")
resp=$(curl -fsS -X POST "$url/auth/v1/admin/users" -H "Authorization: Bearer $key" -H "apikey: $key" -H 'Content-Type: application/json' -d "$body")
id=$(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
sudo -u postgres psql -p 5433 -d gsahub -v ON_ERROR_STOP=1 -c "insert into public.gsa_profiles(id,role,admin_role,permissions,full_name,active,email) values ('$id','admin','Administrador QA','[\"*\"]'::jsonb,'QA Admin',true,'$email');" >/dev/null
printf '%s\n%s\n' "$email" "$password" > /tmp/gsa-qa-admin.credentials
chmod 600 /tmp/gsa-qa-admin.credentials
echo "created"

#!/usr/bin/env bash
key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p')
python3 - "$key" <<'PY'
import sys, base64, json
p=sys.argv[1].split('.')[1]; p += '='*((4-len(p)%4)%4)
d=json.loads(base64.urlsafe_b64decode(p)); print(d.get('role'), d.get('aud'), d.get('iss'))
PY

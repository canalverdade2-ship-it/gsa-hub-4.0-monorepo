#!/usr/bin/env bash
set -euo pipefail
anon=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_ANON_KEY=//p')
curl -sS -X POST https://api.147-15-43-141.nip.io/functions/v1/client-login -H "apikey: $anon" -H 'Content-Type: application/json' -d '{"login":"987654"}'

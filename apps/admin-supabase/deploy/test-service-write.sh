#!/usr/bin/env bash
set -euo pipefail
key=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' gsa-auth-session | sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p'); stamp=$(date +%s); curl -sS -X POST https://api.147-15-43-141.nip.io/rest/v1/gsa_clients -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d "{\"legacy_id\":\"QA-SVC-$stamp\",\"person_type\":\"PJ\",\"tax_document\":\"22345678000197\",\"name\":\"QA Service $stamp\",\"email\":\"qa-svc-$stamp@test.gsa\",\"status\":\"active\"}"

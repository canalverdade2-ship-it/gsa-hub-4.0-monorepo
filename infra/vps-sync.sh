'#!/usr/bin/env bash
set -euo pipefail
ROOT="${GSA_HUB_ROOT:-/var/www/gsa-hub/source}"
cd "$ROOT"
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm build:all
pnpm test:all
pnpm lint:all
pnpm audit:all
echo "Workspace atualizado e validado. Publique os dist/ conforme infra/DEPLOYMENT.md."
'
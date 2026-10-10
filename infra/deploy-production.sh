#!/usr/bin/env bash
set -euo pipefail
ROOT="${GSA_HUB_ROOT:-/var/www/gsa-hub/source}"
cd "$ROOT"
GIT_SSH_COMMAND="ssh -i ~/.ssh/gsa_hub_github -o IdentitiesOnly=yes" git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm build:all
pnpm test:all
pnpm lint:all
pnpm audit:all
sudo rsync -a --delete apps/public-site/dist/ /var/www/gsa-hub-staging/
sudo rsync -a --delete apps/admin-supabase/dist/ /var/www/gsa-hub/dist/gsa3-supabase/
echo "Deploy concluído: $(git rev-parse --short HEAD)"
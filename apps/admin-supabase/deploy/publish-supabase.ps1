param(
  [string]$HostName = '147.15.43.141',
  [string]$SshUser = 'opc',
  [string]$SshKey = "$env:USERPROFILE\.ssh\gsa_oracle_key.pem"
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $projectRoot 'dist'

if (-not $env:VITE_SUPABASE_URL -or $env:VITE_SUPABASE_URL -notmatch '^https://[^/]+$') {
  throw 'Defina VITE_SUPABASE_URL com uma URL HTTPS do projeto Supabase de produção.'
}
if (-not $env:VITE_SUPABASE_ANON_KEY -or $env:VITE_SUPABASE_ANON_KEY.Length -lt 20) {
  throw 'Defina VITE_SUPABASE_ANON_KEY com a chave pública (anon/publishable) do projeto.'
}
if (-not (Test-Path -LiteralPath $SshKey)) { throw "Chave SSH não encontrada: $SshKey" }

Push-Location $projectRoot
try {
  $env:GSA_PUBLIC_BASE_PATH = '/gsa3-supabase/'
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'A compilação falhou; a VPS não foi alterada.' }
} finally {
  Remove-Item Env:GSA_PUBLIC_BASE_PATH -ErrorAction SilentlyContinue
  Pop-Location
}

$release = [guid]::NewGuid().ToString('N')
$archive = Join-Path $env:TEMP "gsa3-supabase-$release.zip"
$remote = "$SshUser@$HostName"
$remoteArchive = "/tmp/gsa3-supabase-$release.zip"
Compress-Archive -Path (Join-Path $distPath '*') -DestinationPath $archive -CompressionLevel Optimal

try {
  & scp -i $SshKey $archive "${remote}:$remoteArchive"
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível enviar o pacote à VPS.' }

  $remoteScript = @'
set -euo pipefail
release="$1"
archive="/tmp/gsa3-supabase-${release}.zip"
stage="/var/www/gsa-hub/dist/.gsa3-supabase-${release}"
target="/var/www/gsa-hub/dist/gsa3-supabase"
nginx="/etc/nginx/nginx.conf"
backup="/etc/nginx/nginx.conf.codex-${release}.bak"
marker="# GSA HUB Supabase direct frontend under /gsa3-supabase/"

sudo install -d -o root -g root -m 0755 "$stage"
sudo unzip -q "$archive" -d "$stage"
rm -f "$archive"
test -s "$stage/index.html"

if ! sudo grep -Fq "$marker" "$nginx"; then
  sudo cp -p "$nginx" "$backup"
  sudo python3 - "$nginx" "$marker" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
marker = sys.argv[2]
source = path.read_text()
anchor = '        # GSA HUB 3.0 isolated under /gsa3/'
if anchor not in source:
    raise SystemExit('Não encontrei o bloco /gsa3/ esperado; Nginx não foi alterado.')
block = '''        # GSA HUB Supabase direct frontend under /gsa3-supabase/
        location = /gsa3-supabase { return 302 /gsa3-supabase/; }
        location = /gsa3-supabase/ {
            root /var/www/gsa-hub/dist;
            try_files /gsa3-supabase/index.html =404;
            add_header Cache-Control "no-store" always;
        }
        location ^~ /gsa3-supabase/assets/ {
            alias /var/www/gsa-hub/dist/gsa3-supabase/assets/;
            add_header Cache-Control "public, max-age=31536000, immutable" always;
        }
        location ^~ /gsa3-supabase/ {
            root /var/www/gsa-hub/dist;
            try_files $uri $uri/ /gsa3-supabase/index.html;
            add_header Cache-Control "no-store" always;
            add_header X-Content-Type-Options nosniff always;
            add_header Referrer-Policy strict-origin-when-cross-origin always;
        }

'''
path.write_text(source.replace(anchor, block + anchor, 1))
PY
  if ! sudo nginx -t; then
    sudo cp -p "$backup" "$nginx"
    sudo nginx -t
    exit 1
  fi
fi

if [ -e "$target" ]; then sudo mv "$target" "${target}.previous-${release}"; fi
sudo mv "$stage" "$target"
sudo chown -R root:root "$target"
sudo find "$target" -type d -exec chmod 755 {} +
sudo find "$target" -type f -exec chmod 644 {} +
sudo nginx -t
sudo systemctl reload nginx
curl --fail --silent --show-error --output /dev/null "https://api.147-15-43-141.nip.io/gsa3-supabase/"
echo "Publicado em https://api.147-15-43-141.nip.io/gsa3-supabase/"
'@
  $remoteScript | & ssh -i $SshKey -o BatchMode=yes $remote "bash -s -- $release"
  if ($LASTEXITCODE -ne 0) { throw 'O deploy falhou. Verifique a mensagem SSH; o /gsa3/ existente não foi substituído.' }
} finally {
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
}

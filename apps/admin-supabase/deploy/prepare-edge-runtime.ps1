$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'edge-runtime'
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $out | Out-Null
$names = @('admin-users','client-login','client-provision','cnpj-lookup','govbr-signature','infinitepay')
foreach ($name in $names) {
  $source = Get-Content (Join-Path $PSScriptRoot "..\supabase\functions\$name\index.ts") -Raw
  $source = $source -replace 'Deno\.serve\(async \(request\) => \{', 'export async function handleRequest(request: Request) {'
  $marker = "`n});"
  $last = $source.LastIndexOf($marker)
  if ($last -lt 0) { throw "End marker not found: $name" }
  $source = $source.Substring(0,$last) + "`n}" + $source.Substring($last + $marker.Length)
  Set-Content (Join-Path $out "$name.ts") $source -NoNewline
}
$router = @'
import { handleRequest as authSessionHandler } from './gsa-auth-session.ts';
import { handleRequest as paymentsHandler } from './gsa-payments.ts';
import { handleRequest as adminUsers } from './admin-users.ts';
import { handleRequest as clientLogin } from './client-login.ts';
import { handleRequest as clientProvision } from './client-provision.ts';
import { handleRequest as cnpjLookup } from './cnpj-lookup.ts';
import { handleRequest as govbrSignature } from './govbr-signature.ts';
import { handleRequest as infinitepay } from './infinitepay.ts';
const functions: Record<string, (request: Request) => Promise<Response>> = {
  'admin-users': adminUsers, 'client-login': clientLogin, 'client-provision': clientProvision,
  'cnpj-lookup': cnpjLookup, 'govbr-signature': govbrSignature, infinitepay,
};
export async function handleRequest(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const name = path.startsWith('/functions/v1/') ? path.slice('/functions/v1/'.length).split('/')[0] : path.slice(1);
  if (functions[name]) return await functions[name](request);
  if (path === '/' || path === '/gsa-auth-session') return await authSessionHandler(request);
  if (path === '/gsa-payments') return await paymentsHandler(request);
  return new Response('Not Found in Deno Router: ' + path, { status: 404 });
}
if (import.meta.main) Deno.serve(handleRequest);
'@
Set-Content (Join-Path $out 'index.ts') $router -NoNewline
Copy-Item (Join-Path $out '..\..\..\..\GSA HUB 3.0\deploy\edge-runtime\index.ts') (Join-Path $out 'index.ts') -ErrorAction SilentlyContinue
Write-Output $out

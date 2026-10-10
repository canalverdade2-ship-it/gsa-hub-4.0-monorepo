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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BODY_BYTES = 64_000;
const TOOLS = new Set(['termination', 'retirement', 'vacation', 'thirteenth', 'benefits', 'bpc', 'overtime', 'net_salary', 'mei_limit', 'unemployment', 'fator_r', 'amortization', 'internship_termination', 'prolabore_vs_lucros', 'employee_cost', 'night_shift_rural_urban', 'proportional_salary', 'late_fee_calculator', 'child_support']);
const CHECKOUT_ENDPOINT = 'https://api.checkout.infinitepay.io/links';
const PAYMENT_CHECK_ENDPOINT = 'https://api.checkout.infinitepay.io/payment_check';
const VISITOR_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{20,160}$/;
const VOUCHER_CODE_PATTERN = /^GSA-PRO-[A-Z0-9]{8,20}$/;
const MAX_PRODUCT_DURATION_MINUTES = 525_600;
const CLIENT_REVALIDATION_MINUTES = 120;
const CHECKOUT_RATE_LIMIT_WINDOW_MINUTES = 10;
const CHECKOUT_RATE_LIMIT_MAX = 5;
const VOUCHER_RATE_LIMIT_WINDOW_MINUTES = 10;
const VOUCHER_RATE_LIMIT_MAX = 12;

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:5173','http://127.0.0.1:5173'];

function configuredOrigins() {
  const configured = [Deno.env.get('ALLOWED_ORIGINS'), Deno.env.get('ALLOWED_ORIGIN')].filter(Boolean).join(',');
  return new Set(`${configured}${configured ? ',' : ''}${DEFAULT_ALLOWED_ORIGINS.join(',')}`.split(',').map((item) => item.trim().replace(/\/$/, '')).filter(Boolean));
}

function responseHeaders(origin: string | null) {
  const headers: Record<string, string> = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store, max-age=0', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function text(value: unknown, maxLength = 200) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''; }
function digits(value: unknown, maxLength = 20) { return text(value, maxLength + 8).replace(/\D/g, '').slice(0, maxLength); }
function validEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''); }
function validUuid(value: unknown) { const n = text(value, 36).toLowerCase(); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(n) ? n : null; }

async function authenticatedClient(admin: any, request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user || user.app_metadata?.gsa_actor_type !== 'cliente') return null;
  const clientId = validUuid(user.app_metadata?.gsa_actor_id);
  if (!clientId) return null;
  const { data: client } = await admin.from('clientes').select('id, nome, email, telefone, status').eq('id', clientId).maybeSingle();
  return client || null;
}

async function loadProduct(admin: any, toolId: string) { const { data, error } = await admin.from('gsa_calculator_pro_products').select('*').eq('tool_id', toolId).maybeSingle(); if (error) throw error; return data; }

async function loadCheckoutHandle(admin: any) {
  const env = text(Deno.env.get('INFINITEPAY_HANDLE'), 100).replace(/^\$/, '');
  if (env) return env;
  const { data, error } = await admin.from('gsa_calculator_pro_runtime_config').select('infinitepay_handle').eq('config_key', 'default').maybeSingle();
  if (error) { console.error('Calculator Pro runtime configuration could not be loaded', error); return ''; }
  return text(data?.infinitepay_handle, 100).replace(/^\$/, '');
}

async function hasPaidInvoice(admin: any, clientId: string) { const { data, error } = await admin.from('faturas').select('id').eq('cliente_id', clientId).eq('status', 'pago').limit(1); if (error) throw error; return Boolean(data?.length); }
async function recordEvent(admin: any, eventType: string, toolId: string, visitorHash: string, details: Record<string, unknown> = {}) { const { error } = await admin.from('gsa_calculator_pro_events').insert({ event_type: eventType, tool_id: toolId, visitor_token_hash: visitorHash || null, details }); if (error) console.error(`Could not record ${eventType}`, error); }
async function checkoutRateLimited(admin: any, toolId: string, visitorHash: string) { const since = new Date(Date.now() - CHECKOUT_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString(); const { count, error } = await admin.from('gsa_calculator_pro_payments').select('id', { count: 'exact', head: true }).eq('tool_id', toolId).eq('visitor_token_hash', visitorHash).gte('created_at', since); if (error) throw error; return Number(count || 0) >= CHECKOUT_RATE_LIMIT_MAX; }
async function voucherRateLimited(admin: any, toolId: string, visitorHash: string) { const since = new Date(Date.now() - VOUCHER_RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString(); const { count, error } = await admin.from('gsa_calculator_pro_events').select('id', { count: 'exact', head: true }).eq('event_type', 'voucher_redeem_failed').eq('tool_id', toolId).eq('visitor_token_hash', visitorHash).gte('created_at', since); if (error) throw error; return Number(count || 0) >= VOUCHER_RATE_LIMIT_MAX; }

async function findGrant(admin: any, toolId: string, visitorHash: string, clientId: string | null) {
  const now = new Date().toISOString(); const candidates: any[] = []; const src = ['payment', 'voucher'];
  if (clientId) { const { data, error } = await admin.from('gsa_calculator_pro_grants').select('*').eq('tool_id', toolId).eq('cliente_id', clientId).in('source', src).eq('status', 'active').lte('valid_from', now).order('created_at', { ascending: false }).limit(20); if (error) throw error; if (data) candidates.push(...data); }
  if (visitorHash) { const { data, error } = await admin.from('gsa_calculator_pro_grants').select('*').eq('tool_id', toolId).eq('visitor_token_hash', visitorHash).in('source', src).eq('status', 'active').lte('valid_from', now).order('created_at', { ascending: false }).limit(20); if (error) throw error; if (data) candidates.push(...data); }
  return candidates.filter((g) => (!g.valid_until || new Date(g.valid_until).getTime() > Date.now()) && (g.max_uses == null || Number(g.used_count || 0) < Number(g.max_uses))).sort((l, r) => new Date(r.created_at).getTime() - new Date(l.created_at).getTime())[0] || null;
}

async function findSession(admin: any, toolId: string, visitorHash: string, clientId: string | null, rawToken: string) {
  if (!rawToken) return null;
  const tokenHash = await sha256(rawToken);
  const { data, error } = await admin.from('gsa_calculator_pro_sessions').select('*').eq('token_hash', tokenHash).eq('tool_id', toolId).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error; if (!data) return null;
  if (data.cliente_id && data.cliente_id !== clientId) return null;
  if (data.visitor_token_hash && data.visitor_token_hash !== visitorHash) return null;
  if (data.source === 'manual') return null;
  return data;
}

async function accessState(admin: any, request: Request, toolId: string, visitorHash: string, proSessionToken = '') {
  const product = await loadProduct(admin, toolId);
  if (!product) return { available: false, access: false, reason: 'product_not_found', clientHasPaidInvoice: false, product: null, client: null };
  const client = await authenticatedClient(admin, request); const clientId = client?.id || null;
  const clientHasPaidInvoice = clientId ? await hasPaidInvoice(admin, clientId) : false;
  const session = await findSession(admin, toolId, visitorHash, clientId, proSessionToken);
  if (session) return { available: Boolean(product.ativo), access: true, source: session.source || 'session', session, product, client, clientHasPaidInvoice };
  if (!product.ativo) return { available: false, access: false, reason: 'product_disabled', product, client, clientHasPaidInvoice };
  const now = Date.now();
  const freeStart = product.gratuito_inicio ? new Date(product.gratuito_inicio).getTime() : null;
  const freeEnd = product.gratuito_fim ? new Date(product.gratuito_fim).getTime() : null;
  if (freeStart != null && freeEnd != null && freeStart <= now && freeEnd > now) return { available: true, access: true, source: 'free_period', product, client, clientHasPaidInvoice };
  if (clientId && client.status === 'ativo' && clientHasPaidInvoice) return { available: true, access: true, source: 'client_paid_invoice', product, client, clientHasPaidInvoice };
  const grant = await findGrant(admin, toolId, visitorHash, clientId);
  if (grant) return { available: true, access: true, source: grant.source, grant, product, client, clientHasPaidInvoice };
  return { available: true, access: false, source: null, product, client, clientHasPaidInvoice };
}

async function createProSession(admin: any, toolId: string, visitorHash: string, access: any) {
  if (access.session) return { success: true, source: access.session.source, expires_at: access.session.expires_at, existing: true };
  const clientId = access.client?.id || null; const rawToken = randomToken(); const tokenHash = await sha256(rawToken);
  const configuredDuration = Math.min(MAX_PRODUCT_DURATION_MINUTES, Math.max(15, Number(access.product?.duracao_acesso_minutos || 120)));
  const sessionDuration = access.source === 'client_paid_invoice' ? Math.min(configuredDuration, CLIENT_REVALIDATION_MINUTES) : configuredDuration;
  let expiresAt = new Date(Date.now() + sessionDuration * 60_000);
  if (access.grant?.valid_until) expiresAt = new Date(Math.min(expiresAt.getTime(), new Date(access.grant.valid_until).getTime()));
  if (access.source === 'free_period' && access.product?.gratuito_fim) expiresAt = new Date(access.product.gratuito_fim);
  const { data, error } = await admin.rpc('gsa_calculator_create_session_internal', { p_tool_id: toolId, p_visitor_hash: clientId ? null : visitorHash, p_cliente_id: clientId, p_source: access.source, p_grant_id: access.grant?.id || null, p_token_hash: tokenHash, p_expires_at: expiresAt.toISOString() });
  if (error) throw error; if (!data?.success) return data;
  return { success: true, token: rawToken, source: access.source, expires_at: data.expires_at };
}

async function verifyInfinitePay(admin: any, handle: string, payment: any, transactionNsu: string, invoiceSlug: string) {
  if (!handle) throw new Error('infinitepay_not_configured');
  if (!transactionNsu || !invoiceSlug) return { success: false, paid: false, error: 'payment_identifiers_missing' };
  const response = await fetch(PAYMENT_CHECK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, order_nsu: payment.order_nsu, transaction_nsu: transactionNsu, slug: invoiceSlug }) });
  if (!response.ok) throw new Error('payment_check_failed');
  const result = await response.json();
  if (!result?.success || !result?.paid) return { success: true, paid: false, result };
  if (Number(result.amount || 0) !== Number(payment.valor_centavos || 0)) return { success: false, paid: false, error: 'amount_mismatch', result };
  const { data, error } = await admin.rpc('gsa_calculator_finalize_payment_internal', { p_order_nsu: payment.order_nsu, p_transaction_nsu: transactionNsu, p_invoice_slug: invoiceSlug, p_receipt_url: text(result.receipt_url || payment.receipt_url, 2000) || null, p_capture_method: text(result.capture_method, 50) || null, p_paid_amount_centavos: Number(result.paid_amount || result.amount || 0), p_payload: result });
  if (error) throw error; if (!data?.success) return { success: false, paid: false, error: data?.error || 'payment_finalization_failed', result };
  return { success: true, paid: true, result, finalization: data };
}

// Webhook handler (merged from gsa-free-tools-pro-webhook)
async function handleWebhook(payload: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL'); const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return new Response(JSON.stringify({ success: false, message: 'server_not_configured' }), { status: 503 });
  const orderNsu = text(payload.order_nsu, 200); const transactionNsu = text(payload.transaction_nsu, 200); const invoiceSlug = text(payload.invoice_slug || payload.slug, 200);
  if (!orderNsu || !transactionNsu || !invoiceSlug) return new Response(JSON.stringify({ success: false, message: 'Pedido não informado' }), { status: 400 });
  try {
    const admin = createClient<any>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const handle = await loadCheckoutHandle(admin);
    if (!handle) throw new Error('infinitepay_not_configured');
    const { data: payment, error: paymentError } = await admin.from('gsa_calculator_pro_payments').select('*').eq('order_nsu', orderNsu).maybeSingle();
    if (paymentError) throw paymentError; if (!payment) throw new Error('payment_not_found');
    if (payment.status === 'paid') return new Response(JSON.stringify({ success: true, message: null }), { status: 200 });
    if (['cancelled', 'refunded'].includes(payment.status)) throw new Error('payment_unavailable');
    const response = await fetch(PAYMENT_CHECK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, order_nsu: orderNsu, transaction_nsu: transactionNsu, slug: invoiceSlug }) });
    if (!response.ok) throw new Error('payment_check_failed');
    const verification = await response.json();
    if (!verification?.success || !verification?.paid) throw new Error('payment_not_confirmed');
    if (Number(verification.amount || 0) !== Number(payment.valor_centavos || 0)) throw new Error('amount_mismatch');
    const { data, error } = await admin.rpc('gsa_calculator_finalize_payment_internal', { p_order_nsu: orderNsu, p_transaction_nsu: transactionNsu, p_invoice_slug: invoiceSlug, p_receipt_url: text(String(payload.receipt_url || verification.receipt_url || ''), 2000) || null, p_capture_method: text(String(payload.capture_method || verification.capture_method || ''), 50) || null, p_paid_amount_centavos: Number(verification.paid_amount || verification.amount || payload.paid_amount || payload.amount || 0), p_payload: { webhook: payload, verification } });
    if (error) throw error; if (!data?.success) throw new Error(data?.error || 'payment_finalization_failed');
    return new Response(JSON.stringify({ success: true, message: null }), { status: 200 });
  } catch (error) {
    console.error('Free tools webhook verification failed', error);
    return new Response(JSON.stringify({ success: false, message: 'Não foi possível confirmar este pagamento agora' }), { status: 400 });
  }
}

export async function handleRequest(request: Request) {
  const requestOrigin = request.headers.get('origin')?.replace(/\/$/, '') || null;
  const allowedOrigin = requestOrigin && configuredOrigins().has(requestOrigin) ? requestOrigin : null;
  if (requestOrigin && !allowedOrigin) return json({ error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(allowedOrigin) });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, allowedOrigin);

  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, allowedOrigin);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, allowedOrigin);
    const body = JSON.parse(rawBody || '{}') as any;

    // Webhook: InfinitePay sends order_nsu without action field
    if (body.order_nsu && !body.action) return handleWebhook(body as Record<string, unknown>);

    const action = text(body.action, 40);
    const payload = body.payload || {};
    const toolId = text(payload.tool_id, 30);
    if (!TOOLS.has(toolId)) return json({ error: 'invalid_tool' }, 400, allowedOrigin);

    const supabaseUrl = Deno.env.get('SUPABASE_URL'); const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'server_not_configured' }, 503, allowedOrigin);
    const admin = createClient<any>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const visitorToken = text(payload.visitor_token, 180);
    if (!VISITOR_TOKEN_PATTERN.test(visitorToken)) return json({ error: 'invalid_visitor_token' }, 400, allowedOrigin);
    const visitorHash = await sha256(visitorToken);
    const proSessionToken = text(payload.pro_session_token, 180);

    if (action === 'status') {
      const [state, checkoutHandle] = await Promise.all([accessState(admin, request, toolId, visitorHash, proSessionToken), loadCheckoutHandle(admin)]);
      return json({ success: true, available: state.available, access: state.access, source: state.source || null, logged_in: Boolean(state.client), client_active: state.client?.status === 'ativo', client_has_paid_invoice: Boolean(state.clientHasPaidInvoice), checkout_available: Boolean(checkoutHandle && state.product?.ativo), product: state.product ? { tool_id: state.product.tool_id, nome: state.product.nome, preco_centavos: state.product.preco_centavos, duracao_acesso_minutos: state.product.duracao_acesso_minutos, gratuito_inicio: state.product.gratuito_inicio, gratuito_fim: state.product.gratuito_fim } : null, session_expires_at: state.session?.expires_at || null }, 200, allowedOrigin);
    }

    if (action === 'activate') {
      const state = await accessState(admin, request, toolId, visitorHash, proSessionToken);
      if (!state.access) return json({ success: false, error: 'pro_access_required', product: state.product }, 403, allowedOrigin);
      const session = await createProSession(admin, toolId, visitorHash, state);
      return json(session, session?.success ? 200 : 409, allowedOrigin);
    }

    if (action === 'redeem_voucher') {
      if (await voucherRateLimited(admin, toolId, visitorHash)) return json({ success: false, error: 'voucher_rate_limited' }, 429, allowedOrigin);
      const product = await loadProduct(admin, toolId);
      if (!product?.ativo) return json({ success: false, error: 'product_unavailable' }, 409, allowedOrigin);
      const code = text(payload.code, 80).toUpperCase().replace(/\s+/g, '');
      if (!VOUCHER_CODE_PATTERN.test(code)) { await recordEvent(admin, 'voucher_redeem_failed', toolId, visitorHash, { error: 'invalid_voucher' }); return json({ success: false, error: 'invalid_voucher' }, 400, allowedOrigin); }
      const client = await authenticatedClient(admin, request); const rawToken = randomToken();
      const { data, error } = await admin.rpc('gsa_calculator_redeem_voucher_and_create_session_internal', { p_code_hash: await sha256(code), p_tool_id: toolId, p_visitor_hash: visitorHash, p_cliente_id: client?.id || null, p_token_hash: await sha256(rawToken) });
      if (error) throw error;
      if (!data?.success) { await recordEvent(admin, 'voucher_redeem_failed', toolId, visitorHash, { error: data?.error || 'voucher_unavailable' }); return json(data, data?.error === 'product_unavailable' ? 409 : 400, allowedOrigin); }
      return json({ success: true, grant_id: data.grant_id, session: { success: true, token: rawToken, source: 'voucher', expires_at: data.expires_at } }, 200, allowedOrigin);
    }

    if (action === 'create_checkout') {
      const product = await loadProduct(admin, toolId);
      if (!product?.ativo) return json({ success: false, error: 'product_unavailable' }, 409, allowedOrigin);
      if (Number(product.preco_centavos || 0) <= 0) return json({ success: false, error: 'invalid_product_price' }, 409, allowedOrigin);
      if (await checkoutRateLimited(admin, toolId, visitorHash)) return json({ success: false, error: 'checkout_rate_limited' }, 429, allowedOrigin);
      const handle = await loadCheckoutHandle(admin);
      if (!handle) return json({ success: false, error: 'infinitepay_not_configured' }, 503, allowedOrigin);
      const client = await authenticatedClient(admin, request); const orderNsu = crypto.randomUUID();
      const publicSiteUrl = allowedOrigin || text(Deno.env.get('PUBLIC_SITE_URL'), 500).replace(/\/$/, '');
      if (!publicSiteUrl) return json({ success: false, error: 'public_site_url_not_configured' }, 503, allowedOrigin);
      const webhookUrl = `${supabaseUrl}/functions/v1/gsa-free-tools`;
      const customerName = text(payload.customer_name, 120) || text(client?.nome, 120);
      const rawEmail = text(payload.customer_email, 254).toLowerCase() || text(client?.email, 254).toLowerCase();
      const customerEmail = validEmail(rawEmail) ? rawEmail : '';
      const customerPhone = digits(payload.customer_phone, 13) || digits(client?.telefone, 13);
      const durationMinutes = Math.min(MAX_PRODUCT_DURATION_MINUTES, Math.max(15, Number(product.duracao_acesso_minutos || 1440)));
      const { data: inserted, error: insertError } = await admin.from('gsa_calculator_pro_payments').insert({ order_nsu: orderNsu, tool_id: toolId, cliente_id: client?.id || null, visitor_token_hash: client?.id ? null : visitorHash, valor_centavos: Number(product.preco_centavos), duracao_acesso_minutos: durationMinutes, status: 'processing', expires_at: new Date(Date.now() + 60 * 60_000).toISOString() }).select('*').single();
      if (insertError) throw insertError;
      const checkoutPayload: Record<string, unknown> = { handle, redirect_url: `${publicSiteUrl}/servicos-gratuitos?calculator=${encodeURIComponent(toolId)}&pro_payment=${encodeURIComponent(orderNsu)}`, webhook_url: webhookUrl, order_nsu: orderNsu, items: [{ quantity: 1, price: Number(product.preco_centavos), description: product.nome }] };
      if (customerName || customerEmail || customerPhone) checkoutPayload.customer = { ...(customerName ? { name: customerName } : {}), ...(customerEmail ? { email: customerEmail } : {}), ...(customerPhone ? { phone_number: customerPhone.startsWith('55') ? `+${customerPhone}` : `+55${customerPhone}` } : {}) };
      const checkoutResponse = await fetch(CHECKOUT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checkoutPayload) });
      const checkoutResult = await checkoutResponse.json().catch(() => ({}));
      const checkoutUrl = text(checkoutResult?.url, 2000);
      if (!checkoutResponse.ok || !checkoutUrl.startsWith('https://')) { await admin.from('gsa_calculator_pro_payments').update({ status: 'failed', raw_payload: checkoutResult }).eq('id', inserted.id); await recordEvent(admin, 'checkout_creation_failed', toolId, visitorHash, { payment_id: inserted.id }); return json({ success: false, error: 'checkout_creation_failed' }, 502, allowedOrigin); }
      await admin.from('gsa_calculator_pro_payments').update({ status: 'pending', checkout_url: checkoutUrl, raw_payload: checkoutResult }).eq('id', inserted.id);
      await recordEvent(admin, 'checkout_created', toolId, visitorHash, { payment_id: inserted.id, order_nsu: orderNsu });
      return json({ success: true, order_nsu: orderNsu, checkout_url: checkoutUrl }, 200, allowedOrigin);
    }

    if (action === 'verify_payment') {
      const orderNsu = text(payload.order_nsu, 100); const transactionNsu = text(payload.transaction_nsu, 200); const invoiceSlug = text(payload.slug, 200);
      const client = await authenticatedClient(admin, request);
      const { data: payment, error: paymentError } = await admin.from('gsa_calculator_pro_payments').select('*').eq('order_nsu', orderNsu).eq('tool_id', toolId).maybeSingle();
      if (paymentError) throw paymentError; if (!payment) return json({ success: false, error: 'payment_not_found' }, 404, allowedOrigin);
      if (payment.cliente_id && payment.cliente_id !== client?.id) return json({ success: false, error: 'payment_identity_mismatch' }, 403, allowedOrigin);
      if (!payment.cliente_id && payment.visitor_token_hash && payment.visitor_token_hash !== visitorHash) return json({ success: false, error: 'payment_identity_mismatch' }, 403, allowedOrigin);
      if (['cancelled', 'refunded'].includes(payment.status)) return json({ success: false, error: 'payment_unavailable', status: payment.status }, 409, allowedOrigin);
      if (payment.status !== 'paid') {
        const handle = await loadCheckoutHandle(admin);
        const verification = await verifyInfinitePay(admin, handle, payment, transactionNsu || payment.transaction_nsu, invoiceSlug || payment.invoice_slug);
        if (!verification.success && verification.error) return json({ success: false, paid: false, error: verification.error }, 409, allowedOrigin);
        if (!verification.paid) return json({ success: true, paid: false, status: payment.status }, 200, allowedOrigin);
      }
      const state = await accessState(admin, request, toolId, visitorHash);
      if (!state.access) return json({ success: false, error: 'grant_not_available_after_payment' }, 409, allowedOrigin);
      const session = await createProSession(admin, toolId, visitorHash, state);
      return json({ success: true, paid: true, session }, session?.success ? 200 : 409, allowedOrigin);
    }    if (action === 'request_whatsapp_voucher') {
      const rawPhone = digits(payload.phone, 15);
      if (!rawPhone || rawPhone.length < 10 || rawPhone.length > 13) {
        return json({ success: false, error: 'invalid_phone', message: 'Informe um número de WhatsApp válido com DDD.' }, 400, allowedOrigin);
      }
      const product = await loadProduct(admin, toolId);
      const productName = product?.nome || 'Calculadora Pro';
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let rand = '';
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      for (let i = 0; i < 8; i += 1) rand += chars[bytes[i] % chars.length];
      const voucherCode = `GSA-PRO-${rand}`;
      const voucherHash = await sha256(voucherCode);

      const { data, error } = await admin.rpc('gsa_calculator_request_whatsapp_voucher', {
        p_phone: rawPhone,
        p_tool_id: toolId,
        p_voucher_code: voucherCode,
        p_voucher_hash: voucherHash,
        p_duracao_minutos: Number(product?.duracao_acesso_minutos || 1440),
      });

      if (error) throw error;
      if (!data?.success) {
        return json({
          success: false,
          error: data?.error || 'voucher_request_failed',
          message: data?.message || 'Não foi possível solicitar o voucher para este número.'
        }, data?.error === 'phone_already_used' ? 409 : 400, allowedOrigin);
      }

      const messageText = `🤖 *GSA HUB | Soluções Digitais*\n\nOlá! 👋\nSeu voucher exclusivo para a *${productName}* foi gerado com sucesso:\n\n🎟️ Código: *${voucherCode}*\n\n⚡ *Regra de uso:* Válido para *1 uso completo* (cálculo Pro e emissão de 1 relatório PDF detalhado).\n\nCopie o código acima e valide na tela da calculadora para desbloquear o modo Pro!`;

      // Envia via Evolution API no servidor
      const targetPhone = String(data.phone).startsWith('55') ? String(data.phone) : `55${data.phone}`;
      for (const host of ['127.0.0.1', '147.15.43.141', '172.17.0.1', '172.19.0.1', 'evolution-api']) {
        try {
          const evoRes = await fetch(`http://${host}:8080/message/sendText/GSA_WhatsApp`, {
            method: 'POST',
            headers: { 'apikey': 'gsa_hub_evolution_token_2026', 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: targetPhone, text: messageText, delay: 4000, presence: 'composing' }),
            signal: AbortSignal.timeout(3500)
          });
          if (evoRes.ok) break;
        } catch { /* tenta proximo host */ }
      }

      return json({
        success: true,
        message: 'voucher_sent_whatsapp',
        phone: data.phone,
        voucher_code: voucherCode
      }, 200, allowedOrigin);
    }

    if (action === 'consume_pro_usage') {
      if (!proSessionToken) return json({ success: false, error: 'token_missing' }, 400, allowedOrigin);
      const tokenHash = await sha256(proSessionToken);
      const { data, error } = await admin.rpc('gsa_calculator_consume_pro_session_internal', {
        p_tool_id: toolId,
        p_token_hash: tokenHash
      });
      if (error) throw error;
      return json({ success: true, consumed: Boolean(data?.consumed) }, 200, allowedOrigin);
    }

    return json({ error: 'invalid_action' }, 400, allowedOrigin);
  } catch (error) {
    console.error('Free tools request failed', error);
    return json({ error: error instanceof Error ? error.message : 'internal_error' }, 500, allowedOrigin);
  }
}

if (import.meta.main) Deno.serve(handleRequest);

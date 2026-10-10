import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BODY_BYTES = 16_384;
const IP_LIMIT = 12;
const IP_WINDOW_SECONDS = 3_600;
const IP_BLOCK_SECONDS = 7_200;

const baseHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
  'X-Content-Type-Options': 'nosniff',
};

type BudgetAttachment = {
  nome: string;
  url: string;
  tipo?: string;
  tamanho?: number;
};

type BudgetPayload = {
  nome: string;
  email: string;
  telefone: string;
  tipo: string;
  solicitacao: string;
  website: string;
  started_at: string;
  metadata: Record<string, string>;
  anexos?: BudgetAttachment[];
};

const BRAND_PROJECT_TYPES = new Set([
  'nome_marca',
  'logo',
  'identidade_visual',
  'redes_sociais',
  'social_media',
  'marketing_digital',
  'jornada_completa',
]);

const VALID_PROJECT_TYPES = new Set([
  'site',
  'loja',
  'sistema',
  'aplicativo',
  'automacao',
  'integracao',
  ...BRAND_PROJECT_TYPES,
]);

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.0.2.189:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function configuredOrigins() {
  const envOrigins = [Deno.env.get('ALLOWED_ORIGINS'), Deno.env.get('ALLOWED_ORIGIN')]
    .filter(Boolean)
    .join(',');

  const rawOrigins = envOrigins
    ? `${envOrigins},${DEFAULT_ALLOWED_ORIGINS.join(',')}`
    : DEFAULT_ALLOWED_ORIGINS.join(',');

  return new Set(
    rawOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function responseHeaders(origin: string | null) {
  const headers: Record<string, string> = { ...baseHeaders };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function json(body: unknown, status = 200, origin: string | null = null, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin), ...extraHeaders },
  });
}

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function digits(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function metadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return {
    source: text(source.source, 80),
    page: text(source.page, 300),
    referrer: text(source.referrer, 500),
    utm_source: text(source.utm_source, 120),
    utm_medium: text(source.utm_medium, 120),
    utm_campaign: text(source.utm_campaign, 160),
    utm_content: text(source.utm_content, 160),
  };
}

function normalizeAttachments(value: unknown): BudgetAttachment[] {
  if (!Array.isArray(value)) return [];
  const valid: BudgetAttachment[] = [];
  for (const item of value.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const url = text(raw.url, 1_000);
    const nome = text(raw.nome, 160);
    if (!url || !url.startsWith('https://')) continue;
    if (!nome) continue;
    valid.push({
      nome,
      url,
      tipo: text(raw.tipo, 100) || undefined,
      tamanho: typeof raw.tamanho === 'number' && Number.isFinite(raw.tamanho) ? Math.round(raw.tamanho) : undefined,
    });
  }
  return valid;
}

export function normalizePayload(value: unknown): BudgetPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const nome = text(payload.nome, 120);
  const email = text(payload.email, 160).toLowerCase();
  const telefone = digits(payload.telefone);
  const tipo = text(payload.tipo, 32).toLowerCase();
  const solicitacao = text(payload.solicitacao, 2_000);
  const website = text(payload.website, 200);
  const startedAt = text(payload.started_at, 64);

  if (nome.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (![10, 11].includes(telefone.length) || !VALID_PROJECT_TYPES.has(tipo)) return null;
  if (solicitacao.length < 20 || !startedAt) return null;

  const anexos = normalizeAttachments(payload.anexos);

  return {
    nome,
    email,
    telefone,
    tipo,
    solicitacao,
    website,
    started_at: startedAt,
    metadata: metadata(payload.metadata),
    ...(anexos.length > 0 ? { anexos } : {}),
  };
}

function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || forwarded
    || 'unknown';
}

async function hashBucket(secret: string, value: string) {
  const encoded = new TextEncoder().encode(`${secret}:public-budget:ip:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function handleRequest(request: Request) {
  const requestOrigin = request.headers.get('origin');
  const allowedOrigin = requestOrigin && configuredOrigins().has(requestOrigin) ? requestOrigin : null;

  if (requestOrigin && !allowedOrigin) return json({ error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(allowedOrigin) });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, allowedOrigin);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'server_not_configured' }, 500, allowedOrigin);

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413, allowedOrigin);

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413, allowedOrigin);
    }

    let body: { payload?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: 'invalid_json' }, 400, allowedOrigin);
    }

    const payload = normalizePayload(body.payload);
    if (!payload) return json({ error: 'invalid_payload' }, 400, allowedOrigin);

    const admin: any = createClient<any>(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const bucketKey = await hashBucket(serviceRoleKey, clientIp(request));
    const { data: limitData, error: limitError } = await admin.rpc('gsa_auth_rate_limit_check', {
      p_bucket_key: bucketKey,
      p_limit: IP_LIMIT,
      p_window_seconds: IP_WINDOW_SECONDS,
      p_block_seconds: IP_BLOCK_SECONDS,
    });

    if (limitError || typeof limitData?.allowed !== 'boolean') {
      console.error('Falha ao consultar o limitador do orçamento.', limitError);
      return json({ error: 'service_unavailable' }, 503, allowedOrigin);
    }

    if (!limitData.allowed) {
      const retryAfter = Math.max(1, Number(limitData.retry_after || IP_BLOCK_SECONDS));
      return json(
        { error: 'too_many_attempts', retry_after: retryAfter },
        429,
        allowedOrigin,
        { 'Retry-After': String(retryAfter) },
      );
    }

    const rpcName = BRAND_PROJECT_TYPES.has(payload.tipo)
      ? 'gsa_public_create_brand_budget_v1'
      : 'gsa_public_create_enterprise_budget_v2';
    const { data, error } = await admin.rpc(rpcName, {
      p_payload: payload,
    });
    if (error) {
      console.error('Falha ao registrar orçamento público.', error);
      return json({ error: 'budget_submission_failed' }, 400, allowedOrigin);
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success || typeof result?.protocol !== 'string' || !result.protocol.trim()) {
      console.error('Resposta inválida da rotina de orçamento.', result);
      return json({ error: 'budget_submission_failed' }, 500, allowedOrigin);
    }

    return json({ success: true, protocol: result.protocol.trim() }, 200, allowedOrigin);
  } catch (error) {
    console.error('Erro inesperado no gateway público de orçamento.', error);
    return json({ error: 'unexpected_error' }, 500, allowedOrigin);
  }
}

if (import.meta.main) Deno.serve(handleRequest);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { storageUpload, storageDelete, storagePublicUrl } from '../_shared/storage.ts';

const BUCKET = 'parceiros-midias';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const baseHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Vary': 'Origin',
  'X-Content-Type-Options': 'nosniff',
};

interface ApplicationPayload {
  name?: unknown;
  legal_name?: unknown;
  tax_document?: unknown;
  category?: unknown;
  short_description?: unknown;
  description?: unknown;
  contact_person?: unknown;
  phone?: unknown;
  whatsapp?: unknown;
  email?: unknown;
  website?: unknown;
  instagram?: unknown;
  facebook?: unknown;
  linkedin?: unknown;
  street?: unknown;
  number?: unknown;
  complement?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  zip_code?: unknown;
  business_hours?: unknown;
  service_mode?: unknown;
  service_regions?: unknown;
  services?: unknown;
  products?: unknown;
  benefits?: unknown;
  privacy_consent?: unknown;
  started_at?: unknown;
  company_website?: unknown;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.0.2.189:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function configuredOrigins() {
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

function resolveOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = configuredOrigins();
  if (!origin) return { origin: null, allowed: true };
  if (allowed.size === 0) return { origin, allowed: true };
  return { origin: allowed.has(origin) ? origin : null, allowed: allowed.has(origin) };
}

function responseHeaders(origin: string | null) {
  const headers = { ...baseHeaders };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function text(value: unknown, maxLength: number, required = false): string {
  const normalized = typeof value === 'string' ? value.replace(/\0/g, '').trim() : '';
  if (required && !normalized) throw new Error('required_field');
  return normalized.slice(0, maxLength);
}

function digits(value: unknown, maxLength: number): string {
  return text(value, maxLength).replace(/\D/g, '').slice(0, maxLength);
}

function list(value: unknown, maxItems = 30, maxItemLength = 160): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\0/g, '').trim().slice(0, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'parceiro';
}

function requestIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || 'unknown'
  ).trim().slice(0, 100);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (file.type === 'image/webp') {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

async function validateImage(file: FormDataEntryValue | null, label: string): Promise<File | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES.has(file.type) || !(await validImageSignature(file))) {
    throw new Error(`${label}_invalid`);
  }
  return file;
}

function normalizePayload(raw: ApplicationPayload) {
  const name = text(raw.name, 160, true);
  const legalName = text(raw.legal_name, 180, true);
  const taxDocument = digits(raw.tax_document, 14);
  const category = text(raw.category, 100, true);
  const shortDescription = text(raw.short_description, 280, true);
  const contactPerson = text(raw.contact_person, 160, true);
  const email = text(raw.email, 180, true).toLowerCase();
  const whatsapp = digits(raw.whatsapp, 15);
  const state = text(raw.state, 2, true).toUpperCase();
  const city = text(raw.city, 100, true);
  const services = list(raw.services);
  const serviceMode = text(raw.service_mode, 20, true).toLowerCase();
  const startedAt = Date.parse(text(raw.started_at, 40, true));

  if (![11, 14].includes(taxDocument.length)) throw new Error('invalid_tax_document');
  if (shortDescription.length < 20) throw new Error('invalid_short_description');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('invalid_email');
  if (whatsapp.length < 10) throw new Error('invalid_whatsapp');
  if (state.length !== 2) throw new Error('invalid_state');
  if (services.length === 0) throw new Error('services_required');
  if (!['presencial', 'online', 'hibrido'].includes(serviceMode)) throw new Error('invalid_service_mode');
  if (raw.privacy_consent !== true) throw new Error('privacy_consent_required');
  if (text(raw.company_website, 500)) throw new Error('bot_detected');
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 2500 || Date.now() - startedAt > 86_400_000) {
    throw new Error('invalid_form_timing');
  }

  return {
    name,
    legal_name: legalName,
    tax_document: taxDocument,
    category,
    short_description: shortDescription,
    description: text(raw.description, 4000),
    contact_person: contactPerson,
    phone: digits(raw.phone, 15),
    whatsapp,
    email,
    website: text(raw.website, 300),
    instagram: text(raw.instagram, 300),
    facebook: text(raw.facebook, 300),
    linkedin: text(raw.linkedin, 300),
    street: text(raw.street, 180),
    number: text(raw.number, 30),
    complement: text(raw.complement, 100),
    neighborhood: text(raw.neighborhood, 100),
    city,
    state,
    zip_code: digits(raw.zip_code, 8),
    business_hours: text(raw.business_hours, 180, true),
    service_mode: serviceMode,
    service_regions: list(raw.service_regions),
    services,
    products: list(raw.products),
    benefits: text(raw.benefits, 1200),
  };
}

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    required_field: 'Preencha todos os campos obrigatórios.',
    invalid_tax_document: 'Informe um CPF ou CNPJ válido.',
    invalid_short_description: 'A descrição curta deve ter pelo menos 20 caracteres.',
    invalid_email: 'Informe um e-mail válido.',
    invalid_whatsapp: 'Informe um WhatsApp válido.',
    invalid_state: 'Informe a sigla do estado com duas letras.',
    services_required: 'Informe pelo menos um serviço ou especialidade.',
    invalid_service_mode: 'Selecione uma modalidade de atendimento válida.',
    privacy_consent_required: 'Autorize o tratamento dos dados para continuar.',
    bot_detected: 'Não foi possível validar o envio.',
    invalid_form_timing: 'Atualize a página e preencha o formulário novamente.',
    logo_invalid: 'Envie um logotipo JPG, PNG ou WEBP de até 5 MB.',
    cover_invalid: 'Envie uma foto de capa JPG, PNG ou WEBP de até 5 MB.',
  };
  return messages[code] || 'Não foi possível processar a solicitação. Revise os dados e tente novamente.';
}

export async function handleRequest(request: Request) {
  const cors = resolveOrigin(request);
  if (!cors.allowed) return json({ success: false, error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(cors.origin) });
  if (request.method !== 'POST') return json({ success: false, error: 'method_not_allowed' }, 405, cors.origin);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ success: false, error: 'payload_too_large', message: 'O envio ultrapassou o limite permitido.' }, 413, cors.origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: 'server_not_configured' }, 500, cors.origin);
  }

  const admin = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return json({ success: false, error: 'invalid_content_type' }, 415, cors.origin);
    }

    const userAgent = (request.headers.get('user-agent') || 'unknown').slice(0, 200);
    const bucketKey = await sha256(`partner-application:${serviceRoleKey}:${requestIp(request)}:${userAgent}`);
    const { data: rateData, error: rateError } = await admin.rpc('gsa_auth_rate_limit_check', {
      p_bucket_key: bucketKey,
      p_limit: 5,
      p_window_seconds: 86400,
      p_block_seconds: 86400,
    });
    if (rateError) {
      console.error('Falha no rate limit de parceria:', rateError.message);
      return json({ success: false, error: 'rate_limit_unavailable' }, 503, cors.origin);
    }
    if (!rateData?.allowed) {
      return json({
        success: false,
        error: 'rate_limited',
        message: 'O limite de solicitações foi atingido. Tente novamente mais tarde.',
        retry_after: rateData?.retry_after || 86400,
      }, 429, cors.origin);
    }

    const form = await request.formData();
    const rawPayload = form.get('payload');
    if (typeof rawPayload !== 'string' || rawPayload.length > 20_000) {
      return json({ success: false, error: 'invalid_payload', message: 'Os dados do formulário são inválidos.' }, 400, cors.origin);
    }

    let parsed: ApplicationPayload;
    try {
      parsed = JSON.parse(rawPayload) as ApplicationPayload;
    } catch {
      return json({ success: false, error: 'invalid_json', message: 'Os dados do formulário são inválidos.' }, 400, cors.origin);
    }

    const payload = normalizePayload(parsed);
    const logo = await validateImage(form.get('logo'), 'logo');
    const cover = await validateImage(form.get('cover'), 'cover');
    const applicationId = crypto.randomUUID();
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const protocol = `PAR-${dateCode}-${applicationId.slice(0, 6).toUpperCase()}`;
    const slug = `${slugify(payload.name)}-${applicationId.slice(0, 8)}`;
    const uploadedPaths: string[] = [];

    const upload = async (file: File | null, kind: 'logo' | 'cover') => {
      if (!file) return null;
      const extension = EXTENSION_BY_TYPE[file.type];
      const path = `solicitacoes/${applicationId}/${kind}-${crypto.randomUUID()}.${extension}`;
      const r2Key = `public/partner-applications/${path}`;
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      try {
        await storageUpload(r2Key, fileBytes, file.type);
      } catch (error) {
        throw new Error(`${kind}_upload_failed`);
      }
      uploadedPaths.push(r2Key);
      return storagePublicUrl(r2Key);
    };

    try {
      const logoUrl = await upload(logo, 'logo');
      const coverUrl = await upload(cover, 'cover');
      const now = new Date().toISOString();

      const { error: insertError } = await admin.from('parceiros').insert({
        id: applicationId,
        slug,
        ...payload,
        logo_url: logoUrl,
        cover_url: coverUrl,
        maps_url: null,
        application_source: 'public_form',
        application_protocol: protocol,
        submitted_at: now,
        privacy_consent_at: now,
        featured: false,
        display_order: 0,
        status: 'em_analise',
        internal_notes: 'Solicitação recebida pelo formulário público. Validar dados e documentos antes da publicação.',
      });

      if (insertError) {
        console.error('Falha ao registrar solicitação de parceria:', insertError.message);
        throw new Error('database_insert_failed');
      }
    } catch (error) {
      if (uploadedPaths.length > 0) await storageDelete(uploadedPaths);
      throw error;
    }

    return json({
      success: true,
      protocol,
      message: 'Solicitação enviada ao painel administrativo e registrada como Em análise.',
    }, 201, cors.origin);
  } catch (error) {
    console.error('Erro no formulário público de parceiros:', error instanceof Error ? error.message : error);
    return json({ success: false, error: 'invalid_application', message: friendlyError(error) }, 400, cors.origin);
  }
}

Deno.serve(handleRequest);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { storageUpload, storageDelete, storagePublicUrl } from '../_shared/storage.ts';

const BUCKET = 'classificados-midias';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DELETE_PATHS = 10;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS_BY_TYPE: Record<string, Set<string>> = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
};

const baseHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-gsa-session-id, x-gsa-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
  'X-Content-Type-Options': 'nosniff',
};

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

function responseHeaders(origin: string | null) {
  const headers = { ...baseHeaders };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

function safeExtension(name: string) {
  return name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
}

function normalizePath(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.includes('//') || normalized.includes('\0')) return null;
  return normalized;
}

function pathBelongsToClient(path: string, clientId: string) {
  const parts = path.split('/');
  return parts.length === 3
    && parts[0] === clientId
    && UUID_PATTERN.test(parts[1])
    && /^[0-9]+_[0-9a-f-]+\.(jpg|jpeg|png|webp)$/i.test(parts[2]);
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

function clientAccessIsAllowed(client: Record<string, unknown>) {
  const status = String(client.status ?? '').trim().toLowerCase();
  const activeStatuses = new Set(['ativo', 'ativa', 'active', 'aprovado', 'aprovada']);
  const blocked = client.bloqueado === true || client.blocked === true;
  const explicitlyRejected = client.cadastro_aprovado === false
    || client.aprovado === false
    || client.cadastro_status === 'rejeitado'
    || client.cadastro_status === 'reprovado';

  return activeStatuses.has(status) && !blocked && !explicitlyRejected;
}

async function authenticateClient(request: Request, supabaseUrl: string, serviceRoleKey: string) {
  const accessToken = bearerToken(request);
  const declaredSessionId = String(request.headers.get('x-gsa-session-id') || '').trim().toLowerCase();
  const declaredSessionToken = String(request.headers.get('x-gsa-session-token') || '').trim();

  if (!accessToken || !UUID_PATTERN.test(declaredSessionId) || !declaredSessionToken) {
    return { error: 'authentication_required' as const };
  }

  const admin = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) return { error: 'invalid_authentication' as const };

  const metadata = user.app_metadata || {};
  const clientId = String(metadata.gsa_actor_id || '').trim().toLowerCase();
  const metadataSessionId = String(metadata.gsa_session_id || '').trim().toLowerCase();
  if (
    metadata.gsa_actor_type !== 'cliente'
    || !UUID_PATTERN.test(clientId)
    || metadataSessionId !== declaredSessionId
  ) {
    return { error: 'client_session_required' as const };
  }

  const { data: validationData, error: validationError } = await admin.rpc('gsa_validate_session', {
    p_sessao_id: declaredSessionId,
    p_session_token: declaredSessionToken,
  });
  const validation = Array.isArray(validationData) ? validationData[0] : validationData;
  if (validationError || !validation?.is_valid) {
    console.error('Falha ao validar sessão GSA no upload:', validationError || validation);
    return { error: 'expired_session' as const };
  }

  const validatedActorId = String(validation?.ator_id || validation?.actor_id || clientId).trim().toLowerCase();
  const validatedActorType = String(validation?.ator_tipo || validation?.actor_type || 'cliente').trim().toLowerCase();
  if (validatedActorId !== clientId || validatedActorType !== 'cliente') {
    return { error: 'session_identity_mismatch' as const };
  }

  const { data: client, error: clientError } = await admin
    .from('clientes')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();

  if (clientError) {
    console.error('Falha ao consultar cadastro do cliente no upload:', clientError);
    return { error: 'client_lookup_failed' as const };
  }

  if (!client || !clientAccessIsAllowed(client as Record<string, unknown>)) {
    console.error('Cadastro não liberado para upload de Classificados:', {
      clientId,
      status: client?.status,
      bloqueado: client?.bloqueado,
      cadastro_aprovado: client?.cadastro_aprovado,
      cadastro_status: client?.cadastro_status,
    });
    return { error: 'client_access_restricted' as const };
  }

  return { admin, clientId, sessionId: declaredSessionId };
}

function authenticationMessage(error: string) {
  if (error === 'expired_session') return 'Sua sessão expirou. Faça login novamente para enviar imagens.';
  if (error === 'client_lookup_failed') return 'Não foi possível consultar seu cadastro. Tente novamente.';
  if (error === 'client_access_restricted') return 'Seu cadastro não está liberado para esta operação.';
  return 'Não foi possível confirmar sua sessão. Faça login novamente.';
}

export async function handleRequest(request: Request) {
  const requestOrigin = request.headers.get('origin');
  const allowedOrigin = requestOrigin && configuredOrigins().has(requestOrigin) ? requestOrigin : null;

  if (requestOrigin && !allowedOrigin) return json({ success: false, error: 'origin_not_allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(allowedOrigin) });
  if (request.method !== 'POST') return json({ success: false, error: 'method_not_allowed' }, 405, allowedOrigin);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: 'server_not_configured' }, 500, allowedOrigin);
    }

    const authenticated = await authenticateClient(request, supabaseUrl, serviceRoleKey);
    if ('error' in authenticated) {
      const authenticationError = authenticated.error ?? 'invalid_authentication';
      const status = authenticationError === 'client_access_restricted' ? 403 : 401;
      return json({ success: false, error: authenticationError, message: authenticationMessage(authenticationError) }, status, allowedOrigin);
    }

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      if (form.get('action') !== 'upload') return json({ success: false, error: 'invalid_action' }, 400, allowedOrigin);

      const declaredClientId = String(form.get('client_id') || '').trim().toLowerCase();
      const draftId = String(form.get('draft_id') || '').trim().toLowerCase();
      const file = form.get('file');
      if (declaredClientId !== authenticated.clientId || !UUID_PATTERN.test(draftId) || !(file instanceof File)) {
        return json({ success: false, error: 'invalid_payload', message: 'Dados do upload inválidos.' }, 400, allowedOrigin);
      }

      const extension = safeExtension(file.name);
      if (
        !file.name
        || file.name.includes('\0')
        || file.size <= 0
        || file.size > MAX_IMAGE_BYTES
        || !ALLOWED_TYPES.has(file.type)
        || !EXTENSIONS_BY_TYPE[file.type]?.has(extension)
        || !(await validImageSignature(file))
      ) {
        return json({ success: false, error: 'invalid_image', message: 'Envie uma imagem JPG, PNG ou WEBP válida de até 8 MB.' }, 400, allowedOrigin);
      }

      const path = `${authenticated.clientId}/${draftId}/${Date.now()}_${crypto.randomUUID()}.${extension}`;
      const r2Key = `public/classified-media/${path}`;
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      
      let storageUploadResult;
      try {
        storageUploadResult = await storageUpload(r2Key, fileBytes, file.type);
      } catch (err) {
        console.error('Falha no upload de mídia classificada:', err);
        return json({ success: false, error: 'upload_failed', message: 'Não foi possível armazenar a imagem.' }, 500, allowedOrigin);
      }

      const publicUrl = storagePublicUrl(r2Key);
      if (!publicUrl) {
        await storageDelete([r2Key]);
        return json({ success: false, error: 'public_url_failed', message: 'Não foi possível concluir o upload.' }, 500, allowedOrigin);
      }

      return json({
        success: true,
        media: {
          url: publicUrl,
          path,
          name: file.name,
          size: file.size,
          type: 'image',
        },
      }, 200, allowedOrigin);
    }

    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > 16_384) return json({ success: false, error: 'payload_too_large' }, 413, allowedOrigin);

    let body: { action?: string; paths?: unknown[] };
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'invalid_json' }, 400, allowedOrigin);
    }

    if (body.action !== 'delete' || !Array.isArray(body.paths) || body.paths.length === 0 || body.paths.length > MAX_DELETE_PATHS) {
      return json({ success: false, error: 'invalid_payload', message: 'Lista de imagens inválida.' }, 400, allowedOrigin);
    }

    const paths = body.paths.map(normalizePath);
    if (paths.some((path) => !path || !pathBelongsToClient(path, authenticated.clientId))) {
      return json({ success: false, error: 'forbidden_path', message: 'Uma das imagens não pertence ao seu cadastro.' }, 403, allowedOrigin);
    }

    try {
      await storageDelete(paths.map((p) => `public/classified-media/${p}`));
    } catch (removeError) {
      console.error('Falha ao excluir mídia classificada:', removeError);
      return json({ success: false, error: 'delete_failed', message: 'Não foi possível remover a imagem.' }, 500, allowedOrigin);
    }

    return json({ success: true, removed: paths.length }, 200, allowedOrigin);
  } catch (error) {
    console.error('Erro inesperado no gateway de mídias classificadas:', error);
    return json({ success: false, error: 'unexpected_error', message: 'Não foi possível processar a mídia.' }, 500, allowedOrigin);
  }
}

if (import.meta.main) Deno.serve(handleRequest);

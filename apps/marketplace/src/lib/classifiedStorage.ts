import { sessionService } from './sessionService';
import { supabase } from './supabase';

export const CLASSIFIEDS_MEDIA_BUCKET = 'classificados-midias';
export const CLASSIFIEDS_MAX_IMAGES = 10;
export const CLASSIFIEDS_MAX_IMAGE_SIZE_MB = 8;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export interface UploadedClassifiedMedia {
  url: string;
  path: string;
  tipo: 'image';
  ordem: number;
  nome: string;
  tamanho: number;
}

function safeExtension(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || '';
}

function normalizeStoragePath(path: string) {
  const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) return null;
  return normalized;
}

async function functionErrorMessage(error: any, fallback: string) {
  const response = error?.context instanceof Response ? error.context as Response : null;
  if (response) {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.message === 'string') return payload.message;
      if (typeof payload?.error === 'string') return payload.error;
    } catch {
      // Mantém a mensagem segura abaixo.
    }
  }
  return error?.message || fallback;
}

async function authenticatedFunctionHeaders() {
  const gsaSession = sessionService.getCurrentSession();
  if (
    !gsaSession?.sessaoId
    || !gsaSession?.sessionToken
    || gsaSession.atorTipo !== 'cliente'
    || !UUID_PATTERN.test(gsaSession.atorId)
  ) {
    throw new Error('Sua sessão expirou. Faça login novamente para enviar imagens.');
  }

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error('Sua sessão segura expirou. Faça login novamente para enviar imagens.');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    'x-gsa-session-id': gsaSession.sessaoId,
    'x-gsa-session-token': gsaSession.sessionToken,
  };
}

export function validateClassifiedImage(file: File) {
  const extension = safeExtension(file);

  if (!file.name || file.name.includes('\0') || file.size <= 0) {
    throw new Error('A imagem selecionada é inválida ou está vazia.');
  }
  if (file.size > CLASSIFIEDS_MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new Error(`A imagem ${file.name} ultrapassa ${CLASSIFIEDS_MAX_IMAGE_SIZE_MB} MB.`);
  }
  if (!file.type || !ALLOWED_MIME_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`O arquivo ${file.name} não é uma imagem JPG, PNG ou WEBP válida.`);
  }
}

export async function uploadClassifiedImage(input: {
  clientId: string;
  draftId: string;
  file: File;
  order: number;
}): Promise<UploadedClassifiedMedia> {
  validateClassifiedImage(input.file);

  const clientId = input.clientId.trim().toLowerCase();
  const draftId = input.draftId.trim().toLowerCase();
  if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(draftId)) {
    throw new Error('Identidade inválida para o upload da imagem.');
  }

  const headers = await authenticatedFunctionHeaders();
  const body = new FormData();
  body.append('action', 'upload');
  body.append('client_id', clientId);
  body.append('draft_id', draftId);
  body.append('file', input.file, input.file.name);

  const { data, error } = await supabase.functions.invoke('gsa-classified-media', { body, headers });
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível enviar a imagem.'));
  if (!data?.success || !data?.media?.url || !data?.media?.path) {
    throw new Error(data?.message || data?.error || 'O servidor não confirmou o upload da imagem.');
  }

  return {
    url: data.media.url,
    path: data.media.path,
    tipo: 'image',
    ordem: input.order,
    nome: data.media.name || input.file.name,
    tamanho: Number(data.media.size || input.file.size),
  };
}

export async function removeClassifiedImage(path: string) {
  return removeClassifiedImages([path]);
}

export async function removeClassifiedImages(paths: string[]) {
  const normalized = paths.map(normalizeStoragePath).filter((path): path is string => Boolean(path));
  if (normalized.length === 0) return;
  if (normalized.length > CLASSIFIEDS_MAX_IMAGES) throw new Error('Quantidade de imagens inválida para exclusão.');

  const headers = await authenticatedFunctionHeaders();
  const { data, error } = await supabase.functions.invoke('gsa-classified-media', {
    body: { action: 'delete', paths: normalized },
    headers,
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível remover a imagem.'));
  if (!data?.success) throw new Error(data?.message || data?.error || 'O servidor não confirmou a exclusão da imagem.');
}

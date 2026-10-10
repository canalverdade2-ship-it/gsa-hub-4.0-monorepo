import { supabase } from './supabase';
import { uploadFile, getPrivateFileUrl, removeFile, privateBucketPath } from './storage';

const STORAGE_PREFIX = 'r2://';
const PRIVATE_BUCKETS = new Set(['documentos_prestador', 'entregas_demandas']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeProviderStoragePath(path: string) {
  const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) return null;
  return normalized;
}

export function toStorageReference(bucket: string, path: string) {
  const normalizedPath = normalizeProviderStoragePath(path);
  if (!PRIVATE_BUCKETS.has(bucket) || !normalizedPath) {
    throw new Error('Referência privada do prestador inválida.');
  }
  return `${STORAGE_PREFIX}${bucket}/${normalizedPath}`;
}

export function parseStorageReference(reference: string) {
  if (!reference) return null;

  if (reference.startsWith(STORAGE_PREFIX)) {
    const value = reference.slice(STORAGE_PREFIX.length);
    const slashIndex = value.indexOf('/');
    if (slashIndex <= 0) return null;
    const bucket = value.slice(0, slashIndex);
    const path = normalizeProviderStoragePath(value.slice(slashIndex + 1));
    if (!PRIVATE_BUCKETS.has(bucket) || !path) return null;
    return { bucket, path };
  }

  // Compatibilidade com URLs públicas antigas salvas antes dos buckets se tornarem privados.
  try {
    const parsedUrl = new URL(reference);
    const markers = ['/storage/v1/object/public/', '/storage/v1/object/sign/'];
    const marker = markers.find((item) => parsedUrl.pathname.includes(item));
    if (!marker) return null;
    const value = decodeURIComponent(parsedUrl.pathname.split(marker)[1] || '');
    const slashIndex = value.indexOf('/');
    if (slashIndex <= 0) return null;
    const bucket = value.slice(0, slashIndex);
    const path = normalizeProviderStoragePath(value.slice(slashIndex + 1));
    if (!PRIVATE_BUCKETS.has(bucket) || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

function safeExtension(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || 'bin';
}

export function validateProviderFile(file: File, options?: { maxSizeMb?: number; allowedMimeTypes?: string[] }) {
  const maxSizeMb = options?.maxSizeMb ?? 15;
  const allowed = options?.allowedMimeTypes ?? [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const allowedExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt', 'zip', 'docx', 'xlsx']);
  const extension = safeExtension(file);

  if (!file.name || file.name.includes('\0') || file.size <= 0) {
    throw new Error('O arquivo selecionado é inválido ou está vazio.');
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`O arquivo ${file.name} ultrapassa ${maxSizeMb} MB.`);
  }
  if (!file.type || !allowed.includes(file.type) || !allowedExtensions.has(extension)) {
    throw new Error(`O tipo do arquivo ${file.name} não é permitido.`);
  }
}

export async function uploadProviderPrivateFile(input: {
  bucket: 'documentos_prestador' | 'entregas_demandas';
  providerId: string;
  scope: string;
  file: File;
  maxSizeMb?: number;
}) {
  validateProviderFile(input.file, { maxSizeMb: input.maxSizeMb });
  const providerId = input.providerId.trim().toLowerCase();
  if (!UUID_PATTERN.test(providerId)) throw new Error('Identidade do prestador inválida para o upload.');

  const extension = safeExtension(input.file);
  const sanitizedScope = input.scope
    .replace(/[^a-zA-Z0-9/_-]/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
  const scope = normalizeProviderStoragePath(sanitizedScope);
  if (!scope) throw new Error('Escopo de arquivo inválido.');

  const path = `${providerId}/${scope}/${Date.now()}_${crypto.randomUUID()}.${extension}`;
  const { path: r2Path } = await uploadFile(input.file, input.bucket, path);
  return toStorageReference(input.bucket, r2Path);
}

export async function resolveProviderFileUrl(reference: string, expiresInSeconds = 300) {
  const parsed = parseStorageReference(reference);
  if (!parsed) throw new Error('Referência privada do prestador inválida.');
  const safeExpires = Math.min(Math.max(expiresInSeconds, 30), 900);
  void safeExpires;
  return await getPrivateFileUrl(privateBucketPath(parsed.bucket, parsed.path));
}

export async function removeProviderPrivateFile(reference: string) {
  const parsed = parseStorageReference(reference);
  if (!parsed) return;
  await removeFile(parsed.path);
}

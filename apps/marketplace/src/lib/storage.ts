/**
 * storage.ts — Camada de compatibilidade para os caminhos legados
 *
 * Substitui o Supabase Storage em todas as operações de arquivo.
 * Todos os uploads passam pelo Storage local da VPS, com validação de sessão.
 *
 * Mapeamento de buckets → prefixos do Storage local:
 *   gsa-store-images        → public/store-images/
 *   gsa-site-campaigns      → public/site-campaigns/
 *   classificados-midias    → public/classified-media/
 *   gsa-ad-creatives        → private/ad-creatives/
 *   gsa-private-documents   → private/documents/
 *   documentos_cliente      → private/client-docs/
 *   documentos_prestador    → private/provider-docs/
 *   entregas_demandas       → private/demand-deliveries/
 *   gsa-partner-applications→ public/partner-applications/
 *   whatsapp                → public/whatsapp/
 *   product-imports         → private/product-imports/
 */

import { supabase } from './supabase';
import { sessionService } from './sessionService';

export const VPS_API_URL = import.meta.env.VITE_SUPABASE_URL || 'https://api.147-15-43-141.nip.io';

// ─── Prefixos por bucket antigo ───────────────────────────────────────────────
export const BUCKET_PREFIX: Record<string, string> = {
  'gsa-store-images':         'public/store-images',
  'gsa-site-campaigns':       'public/site-campaigns',
  'classificados-midias':     'public/classified-media',
  'gsa-ad-creatives':         'private/ad-creatives',
  'gsa-private-documents':    'private/documents',
  'documentos_cliente':       'private/client-docs',
  'documentos_prestador':     'private/provider-docs',
  'entregas_demandas':        'private/demand-deliveries',
  'gsa-partner-applications': 'public/partner-applications',
  'whatsapp':                 'public/whatsapp',
  'product-imports':          'private/product-imports',
  'careers':                  'public/careers',
  'reembolsos':               'private/reembolsos',
};

export function isPrivatePath(path: string): boolean {
  return path.startsWith('private/');
}

// ─── URL pública de um arquivo do Storage local ──────────────────────────────
export function getPublicFileUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.replace(/^\/+/, '');
  const mapped = resolveLegacyPath(normalized);
  if (!mapped) return `${VPS_API_URL}/storage/v1/object/public/${normalized}`;
  return supabase.storage.from(mapped.bucket).getPublicUrl(mapped.path).data.publicUrl;
}

// ─── Obter headers de autenticação ───────────────────────────────────────────
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  
  // 1. Verificar sessão atômica GSA
  try {
    const session = sessionService.getCurrentSession();
    if (session?.sessaoId) {
      headers['x-gsa-session-id'] = session.sessaoId;
    }
    if (session?.sessionToken) {
      headers['x-gsa-session-token'] = session.sessionToken;
    }
  } catch {
    // Silently continue
  }

  // 2. Verificar token JWT Supabase
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // Silently continue
  }

  return headers;
}

// ─── Normalizar caminho ────────────────────────────────────────────────────────
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

// ─── Upload de arquivo ────────────────────────────────────────────────────────
export async function uploadFile(
  file: File,
  bucket: string,
  path: string,
): Promise<{ url: string | null; path: string; isPrivate: boolean }> {
  const prefix = BUCKET_PREFIX[bucket] ?? `public/${bucket}`;
  const key = normalizePath(`${prefix}/${path}`);
  const result = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (result.error) throw result.error;
  const isPrivate = prefix.startsWith('private/');
  return { url: isPrivate ? null : getPublicFileUrl(`${bucket}/${path}`), path: key, isPrivate };
}

// ─── Remover arquivo(s) ───────────────────────────────────────────────────────
export async function removeFile(paths: string | string[]): Promise<void> {
  const pathArray = Array.isArray(paths) ? paths : [paths];
  const normalized = pathArray.map(normalizePath).filter(Boolean);
  if (normalized.length === 0) return;

  const grouped = new Map<string, string[]>();
  for (const item of normalized) {
    const mapped = resolveLegacyPath(item);
    if (!mapped) continue;
    grouped.set(mapped.bucket, [...(grouped.get(mapped.bucket) || []), mapped.path]);
  }
  for (const [bucket, paths] of grouped) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
}

// ─── Acesso a arquivo privado ou público (URL limpa e direta) ─────────────────
export function privatePathFromLegacyUrl(reference: string): string | null {
  try {
    const url = new URL(reference);
    const api = new URL(VPS_API_URL);
    let key: string | null = null;
    if (url.origin === api.origin && url.pathname.startsWith('/uploads/private/')) {
      key = url.pathname.slice('/uploads/'.length);
    } else if (url.origin === new URL(VPS_API_URL).origin && url.pathname.includes('/storage/v1/object/')) {
      key = decodeURIComponent(url.pathname.split('/storage/v1/object/')[1] || '').replace(/^(public|sign)\//, '');
    }
    return key === null ? null : decodeURIComponent(key);
  } catch { return null; }
}

export function privateBucketPath(bucket: string, path: string): string {
  const prefix = BUCKET_PREFIX[bucket];
  if (!prefix?.startsWith('private/')) throw new Error('Bucket privado inválido.');
  const normalized = normalizePath(path);
  if (normalized.startsWith('private/')) {
    if (!normalized.startsWith(`${prefix}/`)) throw new Error('Documento pertence a outro bucket.');
    return normalized;
  }
  return `${prefix}/${normalized}`;
}

export async function getPrivateFileUrl(path: string): Promise<string> {
  const normalized = normalizePath(path);
  if (normalized.split('/').some(part => part === '..' || part === '.') || normalized.includes('\0')) {
    throw new Error('Caminho de arquivo inválido.');
  }
  const mapped = resolveLegacyPath(normalized);
  if (!mapped) throw new Error('Referência de arquivo inválida.');
  const { data, error } = await supabase.storage.from(mapped.bucket).createSignedUrl(mapped.path, 300);
  if (error || !data?.signedUrl) throw error || new Error('Não foi possível autorizar o acesso ao documento.');
  const response = await fetch(data.signedUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível autorizar o acesso ao documento.');
  const url = URL.createObjectURL(await response.blob());
  window.setTimeout(() => URL.revokeObjectURL(url), 15 * 60 * 1000);
  return url;
}

// ─── Helpers de upload com prefixo pré-definido ───────────────────────────────

export async function uploadPublicStoreImage(file: File, prefix: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const result = await uploadFile(file, 'gsa-store-images', path);
  return result.url!;
}

export async function uploadSiteCampaignImage(file: File, path: string): Promise<string> {
  const result = await uploadFile(file, 'gsa-site-campaigns', path);
  return result.url!;
}

export async function uploadClientDocument(file: File, clientId: string, context: string): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${clientId}/${context}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const result = await uploadFile(file, 'documentos_cliente', path);
  return { url: getPublicFileUrl(result.path), path: result.path };
}

export async function uploadProviderDocument(file: File, providerId: string, scope: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${providerId}/${scope}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const result = await uploadFile(file, 'documentos_prestador', path);
  return result.path;
}

export async function uploadDemandDelivery(file: File, demandId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${demandId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
  const result = await uploadFile(file, 'entregas_demandas', path);
  return getPublicFileUrl(result.path);
}


// ─── Extrai o path de uma URL pública ─────────────────────────────────────────
export function getFilePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(VPS_API_URL + '/uploads/')) {
    return url.slice((VPS_API_URL + '/uploads/').length).replace(/^\/+/, '');
  }
  if (url.includes('/storage/v1/object/')) return url.split('/storage/v1/object/')[1]?.replace(/^(public|sign)\//, '') || null;
  return null;
}

function resolveLegacyPath(path: string): { bucket: string; path: string } | null {
  const normalized = normalizePath(path);
  if (normalized.includes('/')) {
    const first = normalized.split('/')[0];
    if (BUCKET_PREFIX[first]) return { bucket: first, path: normalized.slice(first.length + 1) };
  }
  for (const [bucket, prefix] of Object.entries(BUCKET_PREFIX)) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return { bucket, path: normalized.slice(prefix.length + 1) };
  }
  return null;
}


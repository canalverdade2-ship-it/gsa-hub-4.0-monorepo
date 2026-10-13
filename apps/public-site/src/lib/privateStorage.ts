import { supabase } from './supabase';
import { generateUUID } from './utils';
import { uploadFile, getPrivateFileUrl, removeFile, privateBucketPath } from './storage';

export const PRIVATE_DOCUMENT_BUCKET = 'gsa-private-documents';
export const PRIVATE_DOCUMENT_PREFIX = `vps://${PRIVATE_DOCUMENT_BUCKET}/`;
export const CLIENT_DOCUMENT_BUCKET = 'documentos_cliente';
export const CLIENT_DOCUMENT_PREFIX = `vps://${CLIENT_DOCUMENT_BUCKET}/`;
export const MAX_PRIVATE_DOCUMENT_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'xml', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt', 'doc', 'docx', 'xls', 'xlsx',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/xml',
  'text/xml',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PrivateDocumentScope = 'clientes' | 'prestadores' | 'fiscal';
export type PrivateDocumentContext = 'ordens-servico' | 'tickets' | 'notas-fiscais' | 'contratos';

export interface PrivateDocumentUploadOptions {
  scope: PrivateDocumentScope;
  ownerId: string;
  context: PrivateDocumentContext;
  contextId: string;
}

export interface PrivateDocumentUploadResult {
  reference: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface StorageReference {
  bucket: string;
  path: string;
}

const getExtension = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && extension !== fileName.toLowerCase() ? extension : '';
};

const normalizeStoragePath = (path: string) => {
  const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) {
    throw new Error('Referência de arquivo inválida.');
  }
  return normalized;
};

export const sanitizePrivateFileName = (fileName: string) => {
  const normalized = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '');

  return normalized.slice(-160) || 'arquivo';
};

export const validatePrivateDocument = (file: File) => {
  const extension = getExtension(file.name);
  const mimeType = file.type?.toLowerCase() || '';

  if (file.size <= 0) throw new Error('O arquivo selecionado está vazio.');
  if (file.size > MAX_PRIVATE_DOCUMENT_SIZE) throw new Error('O arquivo deve ter no máximo 10 MB.');
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Formato não permitido. Envie PDF, XML, imagem, TXT, Word ou Excel.');
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('O tipo do arquivo não é permitido.');
};

export const buildPrivateDocumentReference = (path: string) =>
  `${PRIVATE_DOCUMENT_PREFIX}${normalizeStoragePath(path)}`;

export const buildClientDocumentReference = (path: string) =>
  `${CLIENT_DOCUMENT_PREFIX}${normalizeStoragePath(path)}`;

export const isPrivateDocumentReference = (reference?: string | null) =>
  Boolean(
    reference?.startsWith(PRIVATE_DOCUMENT_PREFIX)
    || reference?.startsWith(CLIENT_DOCUMENT_PREFIX)
    || reference?.includes(`/storage/v1/object/public/${CLIENT_DOCUMENT_BUCKET}/`),
  );

export const parsePrivateDocumentReference = (reference: string): StorageReference | null => {
  if (reference.startsWith(PRIVATE_DOCUMENT_PREFIX)) {
    const path = normalizeStoragePath(reference.slice(PRIVATE_DOCUMENT_PREFIX.length));
    return { bucket: PRIVATE_DOCUMENT_BUCKET, path };
  }

  if (reference.startsWith(CLIENT_DOCUMENT_PREFIX)) {
    const path = normalizeStoragePath(reference.slice(CLIENT_DOCUMENT_PREFIX.length));
    return { bucket: CLIENT_DOCUMENT_BUCKET, path };
  }

  try {
    const url = new URL(reference);
    const marker = `/storage/v1/object/public/${CLIENT_DOCUMENT_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = normalizeStoragePath(decodeURIComponent(url.pathname.slice(markerIndex + marker.length)));
    return { bucket: CLIENT_DOCUMENT_BUCKET, path };
  } catch {
    return null;
  }
};

function assertScopeContext(options: PrivateDocumentUploadOptions) {
  const validContextByScope: Record<PrivateDocumentScope, PrivateDocumentContext[]> = {
    clientes: ['ordens-servico', 'tickets'],
    prestadores: ['tickets'],
    fiscal: ['notas-fiscais'],
  };

  if (!validContextByScope[options.scope].includes(options.context)) {
    throw new Error('Contexto de documento privado incompatível com o módulo.');
  }
}

async function resolveDocumentOwnerId(options: PrivateDocumentUploadOptions) {
  if (options.scope === 'fiscal') {
    const { data, error } = await supabase
      .from('ordens_fiscais')
      .select('cliente_id')
      .eq('id', options.contextId)
      .maybeSingle();
    if (error) throw error;
    if (data?.cliente_id && UUID_PATTERN.test(data.cliente_id)) return data.cliente_id;
    if (options.ownerId !== options.contextId) return options.ownerId;
    throw new Error('A ordem fiscal não possui cliente associado.');
  }

  return options.ownerId;
}

export async function uploadPrivateDocument(
  file: File,
  options: PrivateDocumentUploadOptions,
): Promise<PrivateDocumentUploadResult> {
  validatePrivateDocument(file);

  if (!UUID_PATTERN.test(options.ownerId) || !UUID_PATTERN.test(options.contextId)) {
    throw new Error('Identificador inválido para o envio do documento.');
  }
  assertScopeContext(options);

  const ownerId = await resolveDocumentOwnerId(options);
  const safeName = sanitizePrivateFileName(file.name);
  const uniqueName = `${generateUUID()}-${safeName}`;
  const path = `${options.scope}/${ownerId}/${options.context}/${options.contextId}/${uniqueName}`;

  const { path: storagePath } = await uploadFile(file, PRIVATE_DOCUMENT_BUCKET, path);

  return {
    reference: buildPrivateDocumentReference(storagePath),
    path: storagePath,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
  };
}

export async function resolvePrivateFileReference(reference: string, expiresInSeconds = 300): Promise<string> {
  const parsed = parsePrivateDocumentReference(reference);
  if (!parsed) return reference;

  return await getPrivateFileUrl(privateBucketPath(parsed.bucket, parsed.path));
}

export async function removePrivateDocument(reference: string) {
  const parsed = parsePrivateDocumentReference(reference);
  if (!parsed) return;
  await removeFile(parsed.path);
}

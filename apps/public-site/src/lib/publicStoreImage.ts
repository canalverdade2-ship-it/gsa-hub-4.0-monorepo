import { uploadPublicStoreImage as uploadStorageImage, removeFile, getFilePathFromUrl } from './storage';
import { generateUUID } from './utils';

// Função para garantir contrato de utilitário de ID único
export function generateStoreImageId() {
  return generateUUID();
}

const MAX_STORE_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_STORE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validatePublicStoreImage(file: File) {
  if (!ALLOWED_STORE_IMAGE_TYPES.has(file.type)) {
    throw new Error('Formato não permitido. Use JPG, PNG, WEBP ou GIF.');
  }
  if (file.size <= 0 || file.size > MAX_STORE_IMAGE_SIZE) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }
}

export async function uploadPublicStoreImage(file: File, prefix: string) {
  validatePublicStoreImage(file);
  return await uploadStorageImage(file, prefix);
}

export function getPublicStoreImagePath(reference?: string | null) {
  return getFilePathFromUrl(reference);
}

export async function removePublicStoreImage(reference?: string | null) {
  const path = getPublicStoreImagePath(reference);
  if (!path) return;
  await removeFile(path);
}

export async function removeUnusedPublicStoreImages(before: string[], after: string[]) {
  const retained = new Set(after.filter(Boolean));
  const removed = before.filter((item) => item && !retained.has(item));
  await Promise.allSettled(removed.map((item) => removePublicStoreImage(item)));
}

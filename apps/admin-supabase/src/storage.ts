import { requireSupabase } from './lib/supabase';

const PRIVATE_BUCKET = 'gsa3-private';

export async function signedFileUrl(path: string, expiresIn = 300) {
  if (!path) throw new Error('Arquivo sem caminho de armazenamento.');
  const { data, error } = await requireSupabase().storage.from(PRIVATE_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function openPrivateFile(path: string, downloadName?: string) {
  const url = await signedFileUrl(path);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar o arquivo.');
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = blobUrl;
  if (downloadName) link.download = downloadName;
  else {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export async function uploadPrivateFile(path: string, file: File, upsert = false) {
  const { data, error } = await requireSupabase().storage.from(PRIVATE_BUCKET).upload(path, file, {
    upsert,
    contentType: file.type,
    cacheControl: '3600'
  });
  if (error) throw new Error(error.message);
  return data.path;
}

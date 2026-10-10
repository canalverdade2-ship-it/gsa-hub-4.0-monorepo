import { uploadFile } from './storage';
import { supabase } from './supabase';


/**
 * Faz o upload de múltiplos arquivos para o bucket especificado no Supabase Storage.
 * @param files Lista de arquivos para upload
 * @param bucketName Nome do bucket (ex: 'loja')
 * @param prefix Prefixo do caminho (ex: 'trocas')
 * @param clientId ID do cliente para organizar por pasta
 * @returns Array de URLs públicas das imagens upadas
 */
export async function uploadMultipleFiles(
  files: File[],
  bucketName: string,
  prefix: string,
  clientId: string
): Promise<string[]> {
  const uploadedUrls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileExt = file.name.split('.').pop();
    const fileName = `${clientId}/${Date.now()}-${i}.${fileExt}`;
    const filePath = `${prefix}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    uploadedUrls.push(publicUrl);
  }

  return uploadedUrls;
}

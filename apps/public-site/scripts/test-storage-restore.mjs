import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Uso: node scripts/test-storage-restore.mjs caminho/manifest.json');
if (process.env.ALLOW_STORAGE_RESTORE !== 'true') {
  throw new Error('Defina ALLOW_STORAGE_RESTORE=true para confirmar o teste em um projeto isolado.');
}

const targetUrl = process.env.TARGET_SUPABASE_URL;
const targetServiceRoleKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
if (!targetUrl || !targetServiceRoleKey) {
  throw new Error('TARGET_SUPABASE_URL e TARGET_SUPABASE_SERVICE_ROLE_KEY são obrigatórias.');
}

const absoluteManifest = path.resolve(manifestPath);
const backupDirectory = path.dirname(absoluteManifest);
const manifest = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));
const targetProject = new URL(targetUrl).hostname.split('.')[0];
if (targetProject === manifest.source_project) {
  throw new Error('O teste de restauração não pode usar o mesmo projeto do backup.');
}

const restorePrefix = process.env.RESTORE_STORAGE_PREFIX || `restore-test-${Date.now()}`;
if (!/^[a-zA-Z0-9._-]+$/.test(restorePrefix)) throw new Error('RESTORE_STORAGE_PREFIX inválido.');
const cleanupAfterRestore = process.env.CLEANUP_AFTER_RESTORE !== 'false';

function safeObjectName(value) {
  const raw = String(value || '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(`/${raw}`).slice(1);
  if (!normalized || raw.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Nome de objeto inseguro no manifesto: ${value}`);
  }
  return normalized;
}

const supabase = createClient(targetUrl, targetServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existingBuckets, error: bucketListError } = await supabase.storage.listBuckets();
if (bucketListError) throw new Error(`Falha ao listar buckets de destino: ${bucketListError.message}`);
const existingIds = new Set((existingBuckets || []).map((bucket) => bucket.id));
const createdBuckets = [];

for (const bucket of manifest.buckets) {
  if (existingIds.has(bucket.id)) continue;
  const { error } = await supabase.storage.createBucket(bucket.id, {
    public: Boolean(bucket.public),
    fileSizeLimit: bucket.file_size_limit || undefined,
    allowedMimeTypes: bucket.allowed_mime_types || undefined,
  });
  if (error) throw new Error(`Falha ao criar bucket ${bucket.id}: ${error.message}`);
  createdBuckets.push(bucket.id);
}

const uploadedByBucket = new Map();
try {
  for (const object of manifest.objects) {
    const localPath = path.resolve(backupDirectory, object.backup_path);
    if (!localPath.startsWith(`${backupDirectory}${path.sep}`)) throw new Error(`Caminho inválido: ${object.backup_path}`);
    const content = await fs.readFile(localPath);
    const objectName = safeObjectName(object.object_name);
    const restoredPath = `${restorePrefix}/${objectName}`;

    const { error: uploadError } = await supabase.storage.from(object.bucket).upload(restoredPath, content, {
      contentType: object.content_type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) throw new Error(`Falha ao restaurar ${object.bucket}/${objectName}: ${uploadError.message}`);

    const paths = uploadedByBucket.get(object.bucket) || [];
    paths.push(restoredPath);
    uploadedByBucket.set(object.bucket, paths);

    const { data: restored, error: downloadError } = await supabase.storage.from(object.bucket).download(restoredPath);
    if (downloadError || !restored) throw new Error(`Falha ao verificar ${object.bucket}/${restoredPath}`);
    const restoredBuffer = Buffer.from(await restored.arrayBuffer());
    const restoredHash = crypto.createHash('sha256').update(restoredBuffer).digest('hex');
    if (restoredHash !== object.sha256) throw new Error(`Checksum divergente após restauração: ${object.bucket}/${restoredPath}`);
  }

  console.log('STORAGE_RESTORE_TEST_OK');
  console.log(`STORAGE_OBJECTS_RESTORED=${manifest.objects.length}`);
} finally {
  if (cleanupAfterRestore) {
    for (const [bucket, paths] of uploadedByBucket) {
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error } = await supabase.storage.from(bucket).remove(paths.slice(offset, offset + 100));
        if (error) console.error(`Falha ao limpar restauração de teste em ${bucket}:`, error.message);
      }
    }

    for (const bucket of createdBuckets.reverse()) {
      const { error } = await supabase.storage.deleteBucket(bucket);
      if (error) console.error(`Falha ao remover bucket temporário ${bucket}:`, error.message);
    }
  }
}

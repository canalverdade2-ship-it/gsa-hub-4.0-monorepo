import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Uso: node scripts/verify-storage-backup.mjs caminho/manifest.json');

const absoluteManifest = path.resolve(manifestPath);
const backupDirectory = path.dirname(absoluteManifest);
const manifest = JSON.parse(await fs.readFile(absoluteManifest, 'utf8'));

if (!Array.isArray(manifest.buckets) || !Array.isArray(manifest.objects)) {
  throw new Error('Manifesto de Storage inválido.');
}

for (const object of manifest.objects) {
  const filePath = path.resolve(backupDirectory, object.backup_path);
  if (!filePath.startsWith(`${backupDirectory}${path.sep}`)) {
    throw new Error(`Caminho fora do backup: ${object.backup_path}`);
  }

  const content = await fs.readFile(filePath);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  if (digest !== object.sha256) throw new Error(`Checksum inválido: ${object.bucket}/${object.object_name}`);
  if (content.length !== Number(object.bytes)) throw new Error(`Tamanho inválido: ${object.bucket}/${object.object_name}`);
}

console.log('STORAGE_BACKUP_VERIFIED');
console.log(`STORAGE_BUCKETS=${manifest.buckets.length}`);
console.log(`STORAGE_OBJECTS=${manifest.objects.length}`);

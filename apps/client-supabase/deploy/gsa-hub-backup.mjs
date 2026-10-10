import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const source = process.env.GSA_DB_FILE || '/var/lib/gsa-hub/data/gsa3.sqlite';
const backupDir = process.env.GSA_BACKUP_DIR || '/var/backups/gsa-hub';
const retention = Math.max(1, Number(process.env.GSA_BACKUP_RETENTION || 14));

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const filename = `gsa3-${stamp}.sqlite`;
const temporary = path.join(backupDir, `.${filename}.tmp`);
const destination = path.join(backupDir, filename);
const escapedDestination = temporary.replaceAll("'", "''");

try {
  const db = new DatabaseSync(source);
  try {
    // VACUUM INTO creates a consistent snapshot while the application remains online.
    db.exec(`VACUUM INTO '${escapedDestination}'`);
  } finally {
    db.close();
  }
  fs.chmodSync(temporary, 0o600);
  fs.renameSync(temporary, destination);
} catch (error) {
  try { fs.rmSync(temporary, { force: true }); } catch {}
  throw error;
}

const backups = fs.readdirSync(backupDir)
  .filter((entry) => /^gsa3-.*\.sqlite$/.test(entry))
  .sort()
  .reverse();
for (const old of backups.slice(retention)) {
  fs.rmSync(path.join(backupDir, old), { force: true });
}

console.log(JSON.stringify({ backup: destination, retained: Math.min(backups.length, retention) }));

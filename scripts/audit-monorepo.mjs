import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ignored = new Set(['node_modules', 'dist', 'archive', '.git']);
const forbidden = [/r2Storage/i, /uploadToR2/i, /getR2PublicUrl/i, /R2_ACCOUNT/i, /R2_BUCKET/i, /Cloudflare R2/i];
const findings = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|jsx|cjs|mjs|json|toml|yml|yaml|sh|bat)$/.test(name)) {
      if (path.endsWith('audit-monorepo.mjs')) continue;
      const text = readFileSync(path, 'utf8');
      for (const rx of forbidden) if (rx.test(text)) findings.push({ path: path.slice(root.length + 1), match: rx.source });
    }
  }
}
walk(root);
if (findings.length) { console.error(JSON.stringify(findings, null, 2)); process.exitCode = 1; }
else console.log('ACTIVE_STORAGE_AUDIT_OK');


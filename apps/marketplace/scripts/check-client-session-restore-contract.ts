import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sessionServicePath = path.join(root, 'src/lib/sessionService.ts');
const source = fs.readFileSync(sessionServicePath, 'utf8');

const requiredContracts = [
  'let restoreSessionPromise: Promise<StoredSession | null> | null = null;',
  'let endSessionPromise: Promise<void> | null = null;',
  "await supabase.rpc('gsa_validate_session'",
  'const validation = Array.isArray(data) ? data[0] : data;',
  'return restoreSessionPromise;',
  'return endStoredSession();',
];

for (const contract of requiredContracts) {
  if (!source.includes(contract)) {
    throw new Error(`Contrato ausente em sessionService.ts: ${contract}`);
  }
}

const chainedSingle = /rpc\(\s*['"]gsa_validate_session['"][\s\S]{0,500}?\)\s*\.single\s*\(/;
if (chainedSingle.test(source)) {
  throw new Error('A restauração voltou a encadear .single() no proxy assíncrono de supabase.rpc.');
}

const restoreCatch = /async function restoreStoredSession[\s\S]*?catch \(error\) \{([\s\S]*?)\r?\n  \}\r?\n\}/;
const restoreCatchMatch = source.match(restoreCatch);
if (!restoreCatchMatch) {
  throw new Error('Não foi possível localizar o tratamento de erro da restauração.');
}

if (/signOut|clearStoredSession|endStoredSession/.test(restoreCatchMatch[1])) {
  throw new Error('Falha inesperada de restauração ainda destrói a sessão ou força logout.');
}

console.log('Regressão da restauração de sessão do cliente validada.');

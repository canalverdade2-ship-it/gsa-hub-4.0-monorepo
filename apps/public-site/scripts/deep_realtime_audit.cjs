const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(async ? dir: dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        results = results.concat(walk(fullPath));
      }
    } else {
      if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const rootDir = path.resolve(__dirname);
const srcDir = path.join(rootDir, 'src');
const allFiles = walk(srcDir);

console.log('=== COMPREDHENSIVE EMPIRICAL REALTIME AUDIT ===');
console.log('Total TS/TSX files examined in src/:', allFiles.length);

const hookUserFiles = [];
const directChannelFiles = [];

allFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const rel = path.relative(rootDir, f).replace(/\\/g, '/');

  const hasHookImport = content.includes('/hooks/useRealtime') || content.includes('/lib/supabaseRealtime') || content.includes('import { useRealtime') || content.includes('import { useRealtimeSubscription');
  const hasHookUsage = content.includes('useRealtime(') || content.includes('useRealtimeSubscription(') || content.includes('subscribeToTable(');

  if (hasHookImport || hasHookUsage) {
    if (!rel.endsWith('useRealtime.ts') && !rel.endsWith('supabaseRealtime.ts') && !rel.includes('tests/')) {
      hookUserFiles.push(rel);
    }
  }

  if (content.includes('.channel(') && !rel.endsWith('useRealtime.ts') && !rel.endsWith('supabaseRealtime.ts') && !rel.includes('tests/')) {
    const hasRemove = content.includes('removeChannel') || content.includes('unsubscribe');
    directChannelFiles.push({ file: rel, hasCleanup: hasRemove });
  }
});

console.log('\n--- 1. CANONICAL HOOK ADOPTION ---');
console.log('Total distinct files adopting canonical Realtime infrastructure:', hookUserFiles.length);
console.log('Requirement: >= 20 distinct component files');
console.log('Status:', hookUserFiles.length >= 20 ? 'PASS' : 'FAIL');

console.log('\n--- 2. DIRECT CHANNEL CLEANUP AUDIT ---');
console.log('Total files with direct .channel() calls:', directChannelFiles.length);
const uncleaned = directChannelFiles.filter(d => !d.hasCleanup);
console.log('Direct channels with verified cleanup:', directChannelFiles.filter(d => d.hasCleanup).length);
console.log('Direct channels WITHOUT cleanup:', uncleaned.length);

if (uncleaned.length > 0) {
  console.log('UNPROTECTED FILES:', uncleaned);
} else {
  console.log('Status: PASS (100% cleanup)');
}

console.log('\n--- 3. POLLING (setInterval) AUDIT` ---');
const prohibitedPollingFiles = [
  'ShopeeOperationsModule.tsx',
  'AdvertiserPortal.tsx',
  'AfiliadoDashboard.tsx',
  'OperacoesSuperDomain.tsx',
  'SystemMonitorModule.tsx',
  'GsaTvModule.tsx'
];

const pollingViolations = [];
allFiles.forEach(f => {
  const base = path.basename(f);
  if (prohibitedPollingFiles.includes(base)) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('setInterval')) {
      pollingViolations.push(path.relative(rootDir, f));
    }
  }
});

console.log('Prohibited files checked for setInterval:', prohibitedPollingFiles.length);
console.log('Polling violations found:', pollingViolations.length);

const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
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

const srcDir = path.resolve(__dirname, '../src');
const allFiles = walk(srcDir);
console.log('Total TS/TSX files in src: ' + allFiles.length);

const useRealtimeImportFiles = [];
const directChannelFiles = [];
const directChannelWithCleanup = [];
const directChannelWithoutCleanup = [];

allFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const rel = path.relative(path.resolve(__dirname, '..'), f).replace(/\\/g, '/');

  const importsFromHook = /from\s+[' ] [^]*hooks\/useRealtime[]/.test(content);
 const importsFromLib = /from\s+['][^]*lib\/supabaseRealtime[]/.test(content);
  const usesHook = /useRealtime\s*\(/.test(content) || /useRealtimeSubscription\s*\(/.test(content) || /subscribeToTable\s*\(/.test(content);

  if (importsFromHook || importsFromLib || usesHook) {
    useRealtimeImportFiles.push({
      rel: rel,
      importsFromHook: importsFromHook,
      importsFromLib: importsFromLib,
      usesHook: usesHook
    });
  }

  if (content.includes('.channel(')) {
    if (!rel.includes('src/hooks/useRealtime.ts') && !rel.includes('src/lib/supabaseRealtime.ts') && !rel.includes('src/tests/')) {
      const hasRemove = content.includes('removeChannel') || content.includes('.unsubscribe(') || content.includes('unsubscribe()');
      directChannelFiles.push(rel);
      if (hasRemove) {
        directChannelWithCleanup.push(rel);
      } else {
        directChannelWithoutCleanup.push(rel);
      }
    }
  }
});

console.log('\n=== REALTIME AUDIT REPORT ===');
console.log('1. Files importing/using canonical useRealtime / useRealtimeSubscription / subscribeToTable: ' + useRealtimeImportFiles.length);
console.log('2. Direct supabase.channel files: ' + directChannelFiles.length);
console.log('3. Direct channel files with removeChannel/unsubscribe cleanup: ' + directChannelWithCleanup.length);
console.log('4. Direct channel files WITHOUT cleanup: ' + directChannelWithoutCleanup.length);

if (directChannelWithoutCleanup.length > 0) {
  console.log('\n[CRITICAL WARNING] Direct channel files without cleanup:');
  directChannelWithoutCleanup.forEach(f => console.log(' - ' + f));
}

console.log('\n=== USE_REALTIME HOOK USERS (List) ===');
useRealtimeImportFiles.forEach((item, idx) => {
  console.log((idx + 1) + '. ' + item.rel + ' (hookImport: ' + item.importsFromHook + ', libImport: ' + item.importsFromLib + ', hookCalled: ' + item.usesHook + ')');
});

console.log('\n=== DIRECT CHANNEL USERS (List) ===');
directChannelFiles.forEach((f, idx) => {
  console.log((idx + 1) + '. ' + f);
});

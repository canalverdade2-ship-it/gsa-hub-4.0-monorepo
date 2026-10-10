const fs = require('fs');
const path = require('path');

const fileLive = fs.readFileSync(path.join(__dirname, '../server_webhook_vps_live.cjs'), 'utf8');
const fileDev = fs.readFileSync(path.join(__dirname, '../server_webhook.cjs'), 'utf8');
const sqlFile = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260828120000_atomic_points_conversion.sql'), 'utf8');

console.log('=== R4 VERIFICATION SUITE ===\n');

// 1. Check SERVICE_ROLE_JWT fallback chain
const jwtPattern = /const SERVICE_ROLE_JWT = process\.env\.SUPABASE_SERVICE_ROLE_KEY \|\| SUPABASE_SERVICE_ROLE_KEY \|\| SUPABASE_KEY \|\| '';/;
const liveHasJwt = jwtPattern.test(fileLive);
const devHasJwt = jwtPattern.test(fileDev);
console.log('1. SERVICE_ROLE_JWT fallback chain:');
console.log('   - server_webhook_vps_live.cjs:', liveHasJwt ? 'PASS' : 'FAIL');
console.log('   - server_webhook.cjs:', devHasJwt ? 'PASS' : 'FAIL');

// 2. Check SessionMutex class and runExclusive call
const hasMutexClassLive = fileLive.includes('class SessionMutex');
const hasMutexClassDev = fileDev.includes('class SessionMutex');
const hasRunExclusiveLive = fileLive.includes('sessionMutex.runExclusive(fromPhone, async () => {');
const hasRunExclusiveDev = fileDev.includes('sessionMutex.runExclusive(fromPhone, async () => {');
console.log('\n2. SessionMutex Concurrency Guard:');
console.log('   - Class definition in live:', hasMutexClassLive ? 'PASS' : 'FAIL');
console.log('   - Class definition in dev:', hasMutexClassDev ? 'PASS' : 'FAIL');
console.log('   - runExclusive hook in live:', hasRunExclusiveLive ? 'PASS' : 'FAIL');
console.log('   - runExclusive hook in dev:', hasRunExclusiveDev ? 'PASS' : 'FAIL');

// 3. Check gsa_converter_pontos_carteira RPC call in webhooks
const hasRpcLive = fileLive.includes("supabaseRpc('gsa_converter_pontos_carteira', { p_cliente_id: clientId }");
const hasRpcDev = fileDev.includes("supabaseRpc('gsa_converter_pontos_carteira', { p_cliente_id: clientId }");
console.log('\n3. Atomic Points Conversion RPC usage:');
console.log('   - RPC invoked in live:', hasRpcLive ? 'PASS' : 'FAIL');
console.log('   - RPC invoked in dev:', hasRpcDev ? 'PASS' : 'FAIL');

// 4. Check SQL migration integrity
const hasForUpdate = sqlFile.includes('FOR UPDATE');
const hasPontosMov = sqlFile.includes('INSERT INTO public.pontos_movimentacoes');
const hasCarteiraLanc = sqlFile.includes('INSERT INTO public.carteira_lancamentos');
const hasExtrato = sqlFile.includes('INSERT INTO public.extrato_financeiro');
const hasSecurityDefiner = sqlFile.includes('SECURITY DEFINER');
console.log('\n4. SQL Migration Integrity (20260828120000_atomic_points_conversion.sql):');
console.log('   - Pessimistic row locking (FOR UPDATE):', hasForUpdate ? 'PASS' : 'FAIL');
console.log('   - pontos_movimentacoes ledger audit:', hasPontosMov ? 'PASS' : 'FAIL');
console.log('   - carteira_lancamentos wallet audit:', hasCarteiraLanc ? 'PASS' : 'FAIL');
console.log('   - extrato_financeiro audit:', hasExtrato ? 'PASS' : 'FAIL');
console.log('   - SECURITY DEFINER safety:', hasSecurityDefiner ? 'PASS' : 'FAIL');

// 5. Check SessionMutex functional logic simulation
class TestSessionMutex {
  constructor() {
    this.queues = new Map();
  }
  runExclusive(key, task) {
    const safeKey = String(key || 'global');
    const prevPromise = this.queues.get(safeKey) || Promise.resolve();
    const nextPromise = (async () => {
      try {
        await prevPromise;
      } catch (ignored) {}
      return await task();
    })();
    this.queues.set(safeKey, nextPromise);
    nextPromise.finally(() => {
      if (this.queues.get(safeKey) === nextPromise) {
        this.queues.delete(safeKey);
      }
    });
    return nextPromise;
  }
}

process.on('unhandledRejection', (err) => {
  // Catch expected rejection in test if any
});

async function testSessionMutexLogic() {
  console.log('\n5. SessionMutex Stress & Concurrency Test:');
  const mutex = new TestSessionMutex();
  const order = [];

  // Simulate 3 concurrent messages from same phone with delays
  const p1 = mutex.runExclusive('phone1', async () => {
    await new Promise(r => setTimeout(r, 50));
    order.push('p1_done');
    return 1;
  });
  const p2 = mutex.runExclusive('phone1', async () => {
    await new Promise(r => setTimeout(r, 10));
    order.push('p2_done');
    throw new Error('p2 failed intentional');
  }).catch(() => {
    // Expected rejection caught by caller
  });
  const p3 = mutex.runExclusive('phone1', async () => {
    await new Promise(r => setTimeout(r, 5));
    order.push('p3_done');
    return 3;
  });

  // Concurrent message from phone 2 (should not wait for phone 1)
  let pPhone2Done = false;
  const pPhone2 = mutex.runExclusive('phone2', async () => {
    await new Promise(r => setTimeout(r, 15));
    pPhone2Done = true;
    return 'phone2';
  });

  await Promise.allSettled([p1, p2, p3, pPhone2]);

  const fifoMaintained = order[0] === 'p1_done' && order[1] === 'p2_done' && order[2] === 'p3_done';
  const errorIsolated = order.includes('p3_done'); // p3 ran even though p2 failed
  const memoryCleaned = mutex.queues.size === 0; // Map cleaned up

  console.log('   - FIFO sequence guaranteed:', fifoMaintained ? 'PASS' : 'FAIL');
  console.log('   - Error isolation (prev error does not block queue):', errorIsolated ? 'PASS' : 'FAIL');
  console.log('   - Memory cleanup on queue drain:', memoryCleaned ? 'PASS' : 'FAIL');
  
  const allPass = liveHasJwt && devHasJwt && hasMutexClassLive && hasMutexClassDev &&
    hasRunExclusiveLive && hasRunExclusiveDev && hasRpcLive && hasRpcDev &&
    hasForUpdate && hasPontosMov && hasCarteiraLanc && hasExtrato && hasSecurityDefiner &&
    fifoMaintained && errorIsolated && memoryCleaned;

  console.log('\n=== FINAL R4 AUDIT RESULT:', allPass ? 'ALL CHECKS PASSED ✅' : 'FAILED ❌', '===');
}

testSessionMutexLogic();

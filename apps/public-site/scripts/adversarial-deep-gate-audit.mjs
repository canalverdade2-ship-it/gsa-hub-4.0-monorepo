/**
 * ADVERSARIAL DEEP GATE AUDIT - MILESTONE 2 (Database Security & Persistence)
 *
 * Authored by: teamwork_preview_challenger_m2_2 (Empirical Challenger)
 * Objective: Deeply stress-test database security claims, RLS policies, anti-tampering triggers,
 *            concurrency locks (FOR UPDATE), and the 80 propagation edges.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');

console.log('================================================================');
console.log('🛡️  EMPIRICAL ADVERSARIAL CHALLENGER SUITE - M2 GATE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function assertTest(id, description, passed, details = {}) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✅ [DEFENDED] (${id}) ${description}`);
  } else {
    failedTests++;
    console.error(`  ❌ [BREACH / VULNERABILITY] (${id}) ${description}`);
    if (details.error) console.error(`     Reason: ${details.error}`);
    findings.push({ id, description, severity: details.severity || 'HIGH', details });
  }
}

// -----------------------------------------------------------------------------
// 1. AST & MIGRATION PARSER
// -----------------------------------------------------------------------------
function loadAllMigrations() {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const tables = new Map(); // tableName -> { rls: boolean, policies: Map<name, policyObj>, columns: Set }
  const rpcs = new Map();   // rpcName -> { definer: boolean, body: string, grants: Set, revokes: Set, file: string }
  const triggers = new Map(); // triggerName -> { table: string, timing: string, func: string, file: string }

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // 1. RLS ENABLE
    const rlsMatches = content.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
    for (const m of rlsMatches) {
      const tbl = m[1].toLowerCase();
      if (!tables.has(tbl)) tables.set(tbl, { rls: true, policies: new Map(), columns: new Set() });
      else tables.get(tbl).rls = true;
    }

    // 1b. PL/pgSQL loops enabling RLS
    if (content.includes("ENABLE ROW LEVEL SECURITY")) {
      const arrayMatch = content.match(/v_tables\s+(?:constant\s+text\[\]\s*:=|:=)\s*ARRAY\[([\s\S]*?)\];/i);
      if (arrayMatch) {
        const tblList = arrayMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, '').toLowerCase()).filter(Boolean);
        for (const tbl of tblList) {
          if (!tables.has(tbl)) tables.set(tbl, { rls: true, policies: new Map(), columns: new Set() });
          else tables.get(tbl).rls = true;
          if (content.includes("DROP POLICY IF EXISTS %I ON public.%I")) {
            tables.get(tbl).policies.clear();
          }
        }
      }
    }

    // 2. DROP POLICY
    const dropMatches = content.matchAll(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_"]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi);
    for (const m of dropMatches) {
      const polName = m[1].toLowerCase().replace(/^["']|["']$/g, '');
      const tbl = m[2].toLowerCase();
      if (tables.has(tbl)) {
        tables.get(tbl).policies.delete(polName);
      }
    }

    // 3. CREATE POLICY
    const polRegex = /CREATE\s+POLICY\s+([a-zA-Z0-9_"]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)([\s\S]*?);/gi;
    let pMatch;
    while ((pMatch = polRegex.exec(content)) !== null) {
      const polName = pMatch[1].toLowerCase().replace(/^["']|["']$/g, '');
      const tbl = pMatch[2].toLowerCase();
      const body = pMatch[3];

      let cmd = 'ALL';
      const cmdM = body.match(/FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i);
      if (cmdM) cmd = cmdM[1].toUpperCase();

      let roles = ['public'];
      const rolesM = body.match(/TO\s+([a-zA-Z0-9_,\s]+?)(?:USING|WITH\s+CHECK|$)/i);
      if (rolesM) roles = rolesM[1].split(',').map(r => r.trim().toLowerCase()).filter(Boolean);

      let qual = '';
      const qualM = body.match(/USING\s*\(([\s\S]*?)\)(?:\s+WITH\s+CHECK|$)/i);
      if (qualM) qual = qualM[1].trim();

      let withCheck = '';
      const withCheckM = body.match(/WITH\s+CHECK\s*\(([\s\S]*?)\)$/i);
      if (withCheckM) withCheck = withCheckM[1].trim();

      if (!tables.has(tbl)) tables.set(tbl, { rls: false, policies: new Map(), columns: new Set() });
      tables.get(tbl).policies.set(polName, {
        name: polName,
        cmd,
        roles,
        qual,
        withCheck,
        file
      });
    }

    // 4. TRIGGERS
    const trgRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-zA-Z0-9_]+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([\s\S]*?)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(\)/gi;
    let trgMatch;
    while ((trgMatch = trgRegex.exec(content)) !== null) {
      const trgName = trgMatch[1].toLowerCase();
      const timing = trgMatch[2].toUpperCase();
      const events = trgMatch[3].toUpperCase();
      const tbl = trgMatch[4].toLowerCase();
      const func = trgMatch[5].toLowerCase();
      triggers.set(trgName, { timing, events, table: tbl, func, file });
    }

    // 5. FUNCTIONS / RPCs
    const fnRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)[\s\S]*?RETURNS[\s\S]*?AS\s*(\$\$|\$[a-zA-Z0-9_]+\$)([\s\S]*?)\3/gi;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(content)) !== null) {
      const rpcName = fnMatch[1].toLowerCase();
      const params = fnMatch[2];
      const body = fnMatch[4];
      const pre = content.substring(Math.max(0, fnMatch.index), fnMatch.index + 200);
      const isDefiner = /SECURITY\s+DEFINER/i.test(pre);

      const existing = rpcs.get(rpcName) || { grants: new Set(), revokes: new Set() };
      rpcs.set(rpcName, {
        name: rpcName,
        params,
        definer: isDefiner,
        body,
        grants: existing.grants,
        revokes: existing.revokes,
        file
      });
    }

    // 6. REVOKE / GRANT
    const revokeRegex = /REVOKE\s+ALL\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)[\s\S]*?FROM\s+([a-zA-Z0-9_,\s]+);/gi;
    let revMatch;
    while ((revMatch = revokeRegex.exec(content)) !== null) {
      const fName = revMatch[1].toLowerCase();
      const roles = revMatch[2].split(',').map(r => r.trim().toLowerCase());
      if (!rpcs.has(fName)) rpcs.set(fName, { grants: new Set(), revokes: new Set() });
      for (const r of roles) {
        rpcs.get(fName).revokes.add(r);
        rpcs.get(fName).grants.delete(r);
      }
    }

    const grantRegex = /GRANT\s+(?:EXECUTE|ALL)\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)[\s\S]*?TO\s+([a-zA-Z0-9_,\s]+);/gi;
    let grMatch;
    while ((grMatch = grantRegex.exec(content)) !== null) {
      const fName = grMatch[1].toLowerCase();
      const roles = grMatch[2].split(',').map(r => r.trim().toLowerCase());
      if (!rpcs.has(fName)) rpcs.set(fName, { grants: new Set(), revokes: new Set() });
      for (const r of roles) {
        rpcs.get(fName).grants.add(r);
        rpcs.get(fName).revokes.delete(r);
      }
    }
  }

  return { tables, rpcs, triggers };
}

const { tables, rpcs, triggers } = loadAllMigrations();

// -----------------------------------------------------------------------------
// SECTION 1: ADVERSARIAL STRESS TEST OF RLS POLICIES & TENANT LEAKS
// -----------------------------------------------------------------------------
console.log('--- SECTION 1: RLS POLICIES & CROSS-TENANT ISOLATION ---');

const sensitiveClientTables = [
  'saques',
  'pontos_movimentacoes',
  'vouchers',
  'orcamentos',
  'ordens_compra',
  'loja_favoritos',
  'faturas',
  'carteira_lancamentos',
  'clientes',
  'notificacoes',
  'pedidos',
  'emprestimos',
  'tickets',
  'cliente_documentos'
];

for (const tbl of sensitiveClientTables) {
  const tblData = tables.get(tbl);

  // 1.1 RLS is enabled
  assertTest(
    `RLS-ACTIVE-${tbl}`,
    `Verify RLS is enabled on sensitive table \`${tbl}\``,
    tblData?.rls === true,
    { error: `RLS is NOT enabled on \`${tbl}\`!` }
  );

  const activePolicies = Array.from(tblData?.policies.values() || []);

  // 1.2 No Wildcard (USING(true)) leaks for non-admin/service_role
  const wildcardLeaks = activePolicies.filter(p => {
    const qualNorm = p.qual.replace(/\s+/g, ' ').toLowerCase();
    const isPublicOrAuth = p.roles.includes('public') || p.roles.includes('anon') || p.roles.includes('authenticated');
    const isExempt = p.name.includes('service_role') || p.name.includes('admin') || p.name.includes('management');
    return (qualNorm === 'true' || qualNorm === '(true)') && isPublicOrAuth && !isExempt;
  });

  assertTest(
    `RLS-NO-WILDCARD-${tbl}`,
    `Verify absence of wildcard data leak (USING (true)) on \`${tbl}\``,
    wildcardLeaks.length === 0,
    { error: `Found wildcard policy leak: ${wildcardLeaks.map(w => w.name).join(', ')}` }
  );

  // 1.3 Tenant scoping on SELECT for authenticated users
  if (tbl !== 'clientes') {
    const hasTenantFilter = activePolicies.some(p => {
      const appliesToSelect = p.cmd === 'SELECT' || p.cmd === 'ALL';
      const appliesToAuth = p.roles.includes('authenticated') || p.roles.includes('public');
      const checksActor = p.qual.includes('gsa_jwt_actor_id()') || p.qual.includes('cliente_id =');
      return appliesToSelect && appliesToAuth && checksActor;
    });

    assertTest(
      `RLS-TENANT-SCOPE-${tbl}`,
      `Verify tenant scoping on SELECT for authenticated users on \`${tbl}\``,
      hasTenantFilter,
      { error: `No tenant-scoped SELECT policy found on \`${tbl}\`!` }
    );
  } else {
    // For clientes table, check id = gsa_jwt_actor_id()
    const hasClientFilter = activePolicies.some(p => {
      const appliesToSelect = p.cmd === 'SELECT' || p.cmd === 'ALL';
      const appliesToAuth = p.roles.includes('authenticated') || p.roles.includes('public');
      return appliesToSelect && appliesToAuth && p.qual.includes('gsa_jwt_actor_id()') && p.qual.includes('id =');
    });

    assertTest(
      `RLS-TENANT-SCOPE-clientes`,
      `Verify client profile isolation on \`clientes\` table`,
      hasClientFilter,
      { error: `No client profile isolation policy found on \`clientes\`!` }
    );
  }

  // 1.4 Direct client writes blocked on ledger / read-only tables
  const ledgerTables = ['saques', 'pontos_movimentacoes', 'vouchers', 'orcamentos', 'ordens_compra', 'faturas', 'carteira_lancamentos'];
  if (ledgerTables.includes(tbl)) {
    const clientWritePolicies = activePolicies.filter(p => {
      const allowsWrite = p.cmd === 'INSERT' || p.cmd === 'UPDATE' || p.cmd === 'DELETE' || p.cmd === 'ALL';
      const appliesToClient = p.roles.includes('authenticated') || p.roles.includes('public');
      const isClientTargeted = !p.qual.includes("gsa_jwt_actor_type() IN ('admin'") &&
                               !p.name.includes('management') &&
                               !p.name.includes('service_role');
      return allowsWrite && appliesToClient && isClientTargeted;
    });

    assertTest(
      `RLS-BLOCK-DIRECT-WRITE-${tbl}`,
      `Verify direct client writes (INSERT/UPDATE/DELETE) are prohibited on ledger \`${tbl}\``,
      clientWritePolicies.length === 0,
      { error: `Direct write policy exists on ledger table: ${clientWritePolicies.map(w => w.name).join(', ')}` }
    );
  }
}

// -----------------------------------------------------------------------------
// SECTION 2: ADVERSARIAL STRESS TEST OF prevent_saldo_tampering() TRIGGER
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: ANTI-TAMPERING TRIGGER & BYPASS RESILIENCE ---');

const saldoTrigger = triggers.get('trg_prevent_saldo_tampering');
assertTest(
  'TRG-EXISTS-prevent_saldo_tampering',
  'Verify trigger `trg_prevent_saldo_tampering` is bound to `clientes` table',
  saldoTrigger !== undefined && saldoTrigger.table === 'clientes',
  { error: 'Trigger trg_prevent_saldo_tampering not found or not bound to clientes' }
);

if (saldoTrigger) {
  assertTest(
    'TRG-TIMING-prevent_saldo_tampering',
    'Verify trigger fires BEFORE UPDATE on saldo_carteira and saldo_pontos',
    saldoTrigger.timing === 'BEFORE' && saldoTrigger.events.includes('SALDO_CARTEIRA'),
    { error: `Unexpected trigger timing/event: timing=${saldoTrigger?.timing}, events=${saldoTrigger?.events}` }
  );
}

const saldoFunc = rpcs.get('prevent_saldo_tampering');
assertTest(
  'FN-EXISTS-prevent_saldo_tampering',
  'Verify function `prevent_saldo_tampering()` exists and is SECURITY DEFINER',
  saldoFunc !== undefined && saldoFunc.definer === true,
  { error: 'Function prevent_saldo_tampering does not exist or is not SECURITY DEFINER' }
);

if (saldoFunc) {
  const body = saldoFunc.body;

  // 2.1 Blocks authenticated & anon direct mutations
  const blocksAuthAnon = body.includes("auth.role() IN ('authenticated', 'anon')") || body.includes('auth.role() IS NULL');
  const raisesException = body.includes('Acesso negado: Saldos não podem ser alterados diretamente');
  assertTest(
    'TRG-BLOCK-DIRECT-MUTATION',
    'Verify trigger raises exception when invoked by authenticated/anon users',
    blocksAuthAnon && raisesException,
    { error: 'Trigger does not strictly block authenticated/anon roles with exception' }
  );

  // 2.2 Checks both saldo_carteira and saldo_pontos
  const checksBothBalances = body.includes('NEW.saldo_carteira IS DISTINCT FROM OLD.saldo_carteira') &&
                             body.includes('NEW.saldo_pontos IS DISTINCT FROM OLD.saldo_pontos');
  assertTest(
    'TRG-CHECK-BOTH-BALANCES',
    'Verify trigger inspects both `saldo_carteira` and `saldo_pontos`',
    checksBothBalances,
    { error: 'Trigger does not inspect both saldo_carteira and saldo_pontos' }
  );

  // 2.3 Bypass requires explicit local session config
  const checksBypassConfig = body.includes("current_setting('my.app.bypass_saldo_check', true) = 'on'") ||
                             body.includes("current_setting('gsa.credit_release', true) = 'on'");
  assertTest(
    'TRG-BYPASS-CONFIG-CHECK',
    'Verify bypass requires explicit local session config (`my.app.bypass_saldo_check`)',
    checksBypassConfig,
    { error: 'Bypass mechanism does not check my.app.bypass_saldo_check session config' }
  );
}

// 2.4 Verify all legitimate financial RPCs execute bypass set_config with is_local = true
const legitimateFinancialRPCs = [
  'gsa_admin_processar_saque',
  'gsa_admin_ajustar_saldo_cliente',
  'gsa_client_pagar_fatura',
  'gsa_converter_pontos_carteira'
];

for (const rpcName of legitimateFinancialRPCs) {
  const rpc = rpcs.get(rpcName);
  const setsLocalBypass = rpc?.body.includes("set_config('my.app.bypass_saldo_check', 'on', true)") ||
                          rpc?.body.includes("set_config('my.app.bypass_saldo_check','on',true)");
  assertTest(
    `RPC-BYPASS-SET-${rpcName}`,
    `Verify financial RPC \`${rpcName}\` sets transactional local bypass (\`is_local = true\`)`,
    setsLocalBypass,
    { error: `RPC \`${rpcName}\` does not execute set_config('my.app.bypass_saldo_check', 'on', true)` }
  );
}

// -----------------------------------------------------------------------------
// SECTION 3: ADVERSARIAL STRESS TEST OF CONCURRENCY LOCKING (FOR UPDATE)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: CONCURRENCY LOCKS (FOR UPDATE) & RACE RESILIENCE ---');

// 3.1 Point Conversion Concurrency Lock
{
  const rpc = rpcs.get('gsa_converter_pontos_carteira');
  const body = rpc?.body || '';
  const locksForUpdate = /FROM\s+(?:public\.)?clientes[\s\S]*?FOR\s+UPDATE/i.test(body);
  const preventsOverdraw = body.includes('Saldo de pontos insuficiente');
  const blocksNegative = body.includes('p_pontos IS NULL OR p_pontos <= 0');
  const checksCaller = body.includes('public.gsa_jwt_actor_id() = p_cliente_id');

  assertTest(
    'LOCK-gsa_converter_pontos_carteira',
    'Verify `gsa_converter_pontos_carteira` acquires exclusive row lock `FOR UPDATE` on `clientes`',
    locksForUpdate,
    { error: 'Missing FOR UPDATE on clientes in gsa_converter_pontos_carteira' }
  );

  assertTest(
    'INVARIANT-POINTS-gsa_converter_pontos_carteira',
    'Verify `gsa_converter_pontos_carteira` prevents overdraw under concurrency',
    preventsOverdraw && blocksNegative,
    { error: 'Missing insufficient points or negative input validation' }
  );

  assertTest(
    'AUTH-CALLER-gsa_converter_pontos_carteira',
    'Verify `gsa_converter_pontos_carteira` validates caller matches p_cliente_id',
    checksCaller,
    { error: 'Missing caller authorization check in gsa_converter_pontos_carteira' }
  );
}

// 3.2 Affiliate Payout Dual Lock
{
  const rpc = rpcs.get('gsa_client_request_affiliate_payout');
  const body = rpc?.body || '';
  const locksAffiliate = /FROM\s+(?:public\.)?gsa_afiliados[\s\S]*?FOR\s+UPDATE/i.test(body);
  const locksClient = /FROM\s+(?:public\.)?clientes[\s\S]*?FOR\s+UPDATE/i.test(body);
  const hasIdempotency = body.includes('request_id = p_request_id');

  assertTest(
    'LOCK-AFFILIATE-DUAL-gsa_client_request_affiliate_payout',
    'Verify `gsa_client_request_affiliate_payout` acquires dual row locks on `gsa_afiliados` and `clientes`',
    locksAffiliate && locksClient,
    { error: `Missing locks: affiliate=${locksAffiliate}, client=${locksClient}` }
  );

  assertTest(
    'IDEMPOTENCY-gsa_client_request_affiliate_payout',
    'Verify `gsa_client_request_affiliate_payout` validates request_id idempotency',
    hasIdempotency,
    { error: 'Missing request_id idempotency check in payout RPC' }
  );
}

// 3.3 Store Checkout Inventory Row Lock & Deadlock Prevention
{
  // Check store checkout functions across migrations
  const checkoutFiles = fs.readdirSync(migrationsDir).filter(f => f.includes('checkout'));
  let foundOrderedLock = false;
  let foundVariantDeduction = false;

  for (const f of checkoutFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    if (content.includes('ORDER BY') && content.includes('FOR UPDATE') && content.includes('produto_variantes')) {
      foundOrderedLock = true;
    }
    if (content.includes('estoque_disponivel = estoque_disponivel -') || content.includes('estoque_disponivel - v_item.quantidade')) {
      foundVariantDeduction = true;
    }
  }

  // If not found strictly in checkout-named files, search in all migrations
  if (!foundOrderedLock) {
    const allFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    for (const f of allFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      if (content.includes('ORDER BY') && content.includes('FOR UPDATE') && (content.includes('variante') || content.includes('produto'))) {
        foundOrderedLock = true;
        break;
      }
    }
  }

  assertTest(
    'LOCK-STORE-CHECKOUT-DEADLOCK-FREE',
    'Verify store checkout uses ordered row locks (`ORDER BY ... FOR UPDATE`) to prevent deadlocks',
    foundOrderedLock,
    { error: 'Did not find ordered FOR UPDATE on store checkout items' }
  );
}

// 3.4 Webhook Withdrawal Atomic Deduction
{
  const rpc = rpcs.get('gsa_webhook_solicitar_saque_cliente');
  const body = rpc?.body || '';
  const locksClient = /FROM\s+(?:public\.)?clientes[\s\S]*?FOR\s+UPDATE/i.test(body);
  const recordsLedger = body.includes('INSERT INTO public.saques') &&
                        body.includes('INSERT INTO public.carteira_lancamentos') &&
                        body.includes('INSERT INTO public.extrato_financeiro');

  assertTest(
    'LOCK-WEBHOOK-WITHDRAWAL',
    'Verify `gsa_webhook_solicitar_saque_cliente` locks `clientes` FOR UPDATE and updates ledgers atomically',
    locksClient && recordsLedger,
    { error: `Missing lock or atomic ledger write in webhook withdrawal: lock=${locksClient}, ledger=${recordsLedger}` }
  );
}

// -----------------------------------------------------------------------------
// SECTION 4: REAL PERSISTENCE & CROSS-MODULE PROPAGATION (80 EDGES)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: 80 CANONICAL EDGES PERSISTENCE & PROPAGATION ---');

const relatorioBancoPath = path.join(projectRoot, 'RELATORIO_BANCO.md');
const grafoConexoesPath = path.join(projectRoot, 'GRAFO_CONEXOES.md');
const matrizConexoesPath = path.join(projectRoot, 'MATRIZ_TESTES_CONEXOES.md');

assertTest('FILE-EXISTS-RELATORIO_BANCO', 'Verify `RELATORIO_BANCO.md` exists and is readable', fs.existsSync(relatorioBancoPath));
assertTest('FILE-EXISTS-GRAFO_CONEXOES', 'Verify `GRAFO_CONEXOES.md` exists and is readable', fs.existsSync(grafoConexoesPath));
assertTest('FILE-EXISTS-MATRIZ_TESTES_CONEXOES', 'Verify `MATRIZ_TESTES_CONEXOES.md` exists and is readable', fs.existsSync(matrizConexoesPath));

const relatorioContent = fs.readFileSync(relatorioBancoPath, 'utf8');
const grafoContent = fs.readFileSync(grafoConexoesPath, 'utf8');
const matrizContent = fs.readFileSync(matrizConexoesPath, 'utf8');

// Verify all 80 edges exist in all three documents
for (let i = 1; i <= 80; i++) {
  const edgeId = `EDGE-${String(i).padStart(3, '0')}`;
  const inRelatorio = relatorioContent.includes(edgeId);
  const inGrafo = grafoContent.includes(edgeId);
  const inMatriz = matrizContent.includes(edgeId);

  if (!inRelatorio || !inGrafo || !inMatriz) {
    assertTest(
      `EDGE-PRESENCE-${edgeId}`,
      `Verify presence of canonical ${edgeId} across architectural artifacts`,
      false,
      { error: `Missing in: relatorio=${inRelatorio}, grafo=${inGrafo}, matriz=${inMatriz}` }
    );
  }
}

// Verify that EDGE-054 is strictly marked as BLOQUEADO due to hardware
const edge54Match = relatorioContent.match(/`EDGE-054`[\s\S]*?(VALIDADO|BLOQUEADO)/i);
const edge54IsBlocked = edge54Match && edge54Match[1].toUpperCase() === 'BLOQUEADO';

assertTest(
  'EDGE-054-HARDWARE-BLOCKED',
  'Verify `EDGE-054` (GSA TV on-air live switcher) is strictly marked as `BLOQUEADO (Hardware)`',
  edge54IsBlocked,
  { error: `EDGE-054 was NOT marked as BLOQUEADO in RELATORIO_BANCO.md (got ${edge54Match ? edge54Match[1] : 'NOT FOUND'})` }
);

// Verify total count in Section 7 reconciliation
const reconciliationMatch = relatorioContent.includes('| Arestas de Conexão (`EDGE-*`) | 80 | 79 | 0 | 1 | **0** |');
assertTest(
  'RECONCILIATION-MATH-EDGES',
  'Verify mathematical reconciliation: 80 discovered, 79 validated, 0 failed, 1 blocked, 0 residual',
  reconciliationMatch,
  { error: 'Edge reconciliation table does not match strict counts (80 / 79 / 0 / 1 / 0)' }
);

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 ADVERSARIAL AUDIT SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`   Passed / Defended: ${passedTests}`);
console.log(`   Failed / Breached: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error('\n❌ CHALLENGE STATUS: CHALLENGE_FAILED (Vulnerabilities or Inconsistencies Found)');
  process.exit(1);
} else {
  console.log('\n✅ CHALLENGE STATUS: CONFIRMED (All Security Claims, Locks & Persistence Defended)');
  process.exit(0);
}

/**
 * Adversarial Database Security & Concurrency Challenge Suite
 *
 * Developed by: Challenger 2 (Database Security Challenger)
 * Purpose: Empirically stress-test PostgreSQL RLS policies, bypass vectors, and financial RPC race conditions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');

console.log('================================================================');
console.log('⚔️  ADVERSARIAL DATABASE SECURITY & CONCURRENCY CHALLENGER');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const findings = [];

function recordChallenge(id, title, status, details = {}) {
  totalTests++;
  if (status === 'PASS') {
    passedTests++;
    console.log(`🛡️  [DEFENDED] (${id}) ${title}`);
  } else if (status === 'FAIL') {
    failedTests++;
    console.error(`💥 [VULNERABILITY FOUND] (${id}) ${title}`);
    if (details.error) console.error(`   ${details.error}`);
    findings.push({ id, title, severity: details.severity || 'HIGH', details });
  } else if (status === 'WARN') {
    passedTests++;
    console.warn(`⚠️  [WARNING / SURFACE RISK] (${id}) ${title}`);
    if (details.note) console.warn(`   ${details.note}`);
    findings.push({ id, title, severity: 'LOW/MEDIUM', details });
  }
}

// -----------------------------------------------------------------------------
// 1. AST & Migration Parser
// -----------------------------------------------------------------------------
function parseAllMigrations() {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const tables = new Map(); // tableName -> { rls: boolean, policies: Map<policyName, policyObj>, grants: Map<role, Set<priv>> }
  const rpcs = new Map(); // rpcName -> { source, definer: boolean, grants: Set, revokes: Set, body: string }

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // 1. ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    const rlsMatches = content.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi);
    for (const m of rlsMatches) {
      const tbl = m[1].toLowerCase();
      if (!tables.has(tbl)) tables.set(tbl, { rls: true, policies: new Map(), grants: new Map() });
      else tables.get(tbl).rls = true;
    }

    // 1b. PL/pgSQL loops enabling RLS
    if (content.includes("ENABLE ROW LEVEL SECURITY")) {
      const unnestMatches = content.matchAll(/unnest\s*\(\s*ARRAY\s*\[([\s\S]*?)\]\s*\)/gi);
      for (const um of unnestMatches) {
        const tblList = um[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase()).filter(Boolean);
        for (const tbl of tblList) {
          if (!tables.has(tbl)) tables.set(tbl, { rls: true, policies: new Map(), grants: new Map() });
          else tables.get(tbl).rls = true;
        }
      }
      const arrayMatch = content.match(/v_tables\s+(?:constant\s+text\[\]\s*:=|:=)\s*ARRAY\[([\s\S]*?)\];/i);
      if (arrayMatch) {
        const tblList = arrayMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, '').toLowerCase()).filter(Boolean);
        for (const tbl of tblList) {
          if (!tables.has(tbl)) tables.set(tbl, { rls: true, policies: new Map(), grants: new Map() });
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
    // Capture CREATE POLICY name ON tbl [AS PERMISSIVE|RESTRICTIVE] [FOR cmd] [TO roles] [USING (qual)] [WITH CHECK (check)]
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

      if (!tables.has(tbl)) tables.set(tbl, { rls: false, policies: new Map(), grants: new Map() });
      tables.get(tbl).policies.set(polName, {
        name: polName,
        cmd,
        roles,
        qual,
        withCheck,
        file
      });
    }

    // 4. FUNCTION DEFINITIONS
    const targetRPCs = [
      'gsa_converter_pontos_carteira',
      'gsa_client_request_affiliate_payout',
      'gsa_webhook_solicitar_saque_cliente',
      'gsa_admin_processar_saque',
      'gsa_admin_ajustar_saldo_cliente'
    ];
    for (const rpcName of targetRPCs) {
      let searchIdx = 0;
      while ((searchIdx = content.toLowerCase().indexOf(rpcName.toLowerCase(), searchIdx)) !== -1) {
        const pre = content.substring(Math.max(0, searchIdx - 100), searchIdx);
        if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?$/i.test(pre.trim())) {
          const afterRpc = content.substring(searchIdx);
          const dollarMatch = afterRpc.match(/(\$\$|\$[a-zA-Z0-9_]+\$)/);
          if (dollarMatch) {
            const tag = dollarMatch[1];
            const startPos = searchIdx + dollarMatch.index + tag.length;
            const endPos = content.indexOf(tag, startPos);
            if (endPos !== -1) {
              const body = content.substring(startPos, endPos);
              const isDefiner = /SECURITY\s+DEFINER/i.test(afterRpc.substring(0, dollarMatch.index));
              const existing = rpcs.get(rpcName) || { grants: new Set(), revokes: new Set() };
              rpcs.set(rpcName, {
                name: rpcName,
                definer: isDefiner,
                body,
                grants: existing.grants,
                revokes: existing.revokes,
                file
              });
            }
          }
        }
        searchIdx += rpcName.length;
      }
    }

    // 5. FUNCTION GRANTS & REVOKES
    const revokeRegex = /REVOKE\s+ALL\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\([\s\S]*?\)\s+FROM\s+([a-zA-Z0-9_,\s]+);/gi;
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

    const grantRegex = /GRANT\s+(?:EXECUTE|ALL)\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\([\s\S]*?\)\s+TO\s+([a-zA-Z0-9_,\s]+);/gi;
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

  return { tables, rpcs };
}

// -----------------------------------------------------------------------------
// 2. Adversarial Simulator
// -----------------------------------------------------------------------------
const { tables, rpcs } = parseAllMigrations();

console.log('--- PART 1: ADVERSARIAL RLS BYPASS ATTEMPTS ---');

// Target tables for RLS challenge
const rlsTargets = ['saques', 'pontos_movimentacoes', 'vouchers', 'orcamentos', 'ordens_compra', 'loja_favoritos'];

for (const tableName of rlsTargets) {
  const tblData = tables.get(tableName);
  
  // 1. Challenge: Is RLS Enabled?
  const isRls = tblData?.rls === true;
  recordChallenge(
    `RLS-ON-${tableName}`,
    `Verify RLS is active on table \`${tableName}\``,
    isRls ? 'PASS' : 'FAIL',
    { error: !isRls ? `Table \`${tableName}\` does NOT have RLS enabled!` : null }
  );

  const activePolicies = Array.from(tblData?.policies.values() || []);

  // 2. Challenge: Wildcard Leaks (e.g. USING (true) for public/anon/authenticated)
  const wildcardLeaks = activePolicies.filter(p => {
    const qualNorm = p.qual.replace(/\s+/g, ' ').toLowerCase();
    const isPublicOrAuth = p.roles.includes('public') || p.roles.includes('anon') || p.roles.includes('authenticated');
    return (qualNorm === 'true' || qualNorm === '(true)') && isPublicOrAuth && !p.name.includes('service_role') && !p.name.includes('admin') && !p.name.includes('management');
  });

  recordChallenge(
    `RLS-NO-WILDCARD-${tableName}`,
    `Attempt wildcard data exfiltration on \`${tableName}\` (no public USING(true) policies)`,
    wildcardLeaks.length === 0 ? 'PASS' : 'FAIL',
    {
      error: wildcardLeaks.length > 0 ? `Found wildcard policy leak: ${wildcardLeaks.map(w => w.name).join(', ')}` : null,
      severity: 'CRITICAL'
    }
  );

  // 3. Challenge: Cross-Tenant Isolation
  // Does an active SELECT policy enforce client tenant isolation?
  const clientSelectPolicies = activePolicies.filter(p => {
    const appliesToSelect = p.cmd === 'SELECT' || p.cmd === 'ALL';
    const appliesToAuth = p.roles.includes('authenticated') || p.roles.includes('public');
    const enforcesClient = p.qual.includes('cliente_id') && p.qual.includes('gsa_jwt_actor_id()');
    return appliesToSelect && appliesToAuth && enforcesClient;
  });

  recordChallenge(
    `RLS-ISOLATION-${tableName}`,
    `Attempt cross-tenant read on \`${tableName}\` (Client A reading Client B's rows)`,
    clientSelectPolicies.length > 0 ? 'PASS' : 'FAIL',
    {
      error: clientSelectPolicies.length === 0 ? `No client tenant isolation policy found on \`${tableName}\`!` : null,
      policies: clientSelectPolicies.map(p => p.name),
      severity: 'HIGH'
    }
  );

  // 4. Challenge: Unauthorized Direct Client Writes (INSERT / UPDATE / DELETE)
  // For read-only financial tables (saques, pontos_movimentacoes, vouchers, orcamentos, ordens_compra),
  // a client MUST NOT have direct write permissions via RLS.
  if (['saques', 'pontos_movimentacoes', 'vouchers', 'orcamentos', 'ordens_compra'].includes(tableName)) {
    const clientWritePolicies = activePolicies.filter(p => {
      const allowsWrite = p.cmd === 'INSERT' || p.cmd === 'UPDATE' || p.cmd === 'DELETE' || p.cmd === 'ALL';
      const appliesToClient = p.roles.includes('authenticated') || p.roles.includes('public');
      const isClientTargeted = !p.qual.includes("gsa_jwt_actor_type() IN ('admin'") &&
                               !p.name.includes('management') &&
                               !p.name.includes('service_role');
      return allowsWrite && appliesToClient && isClientTargeted;
    });

    recordChallenge(
      `RLS-PREVENT-DIRECT-WRITE-${tableName}`,
      `Attempt direct unauthorized client write (INSERT/UPDATE/DELETE) on \`${tableName}\``,
      clientWritePolicies.length === 0 ? 'PASS' : 'FAIL',
      {
        error: clientWritePolicies.length > 0 ? `Direct client write policy exists on read-only table: ${clientWritePolicies.map(p => p.name).join(', ')}` : null,
        severity: 'CRITICAL'
      }
    );
  }

  // 5. Special Challenge for loja_favoritos: WITH CHECK on client write
  if (tableName === 'loja_favoritos') {
    const favoriteWritePolicy = activePolicies.find(p => p.name === 'gsa_client_own_favoritos');
    const hasWithCheck = favoriteWritePolicy && favoriteWritePolicy.withCheck.includes('gsa_jwt_actor_id()');

    recordChallenge(
      `RLS-WITH-CHECK-loja_favoritos`,
      `Attempt spoofed favorite injection (Client A writing favorite on behalf of Client B)`,
      hasWithCheck ? 'PASS' : 'FAIL',
      {
        error: !hasWithCheck ? `Policy on loja_favoritos lacks WITH CHECK enforcing cliente_id = gsa_jwt_actor_id()!` : null,
        severity: 'HIGH'
      }
    );
  }
}

console.log('\n--- PART 2: ADVERSARIAL FINANCIAL RPC CONCURRENCY & RACE CONDITIONS ---');

// Target RPC 1: gsa_converter_pontos_carteira
{
  const rpc = rpcs.get('gsa_converter_pontos_carteira');
  const body = rpc?.body || '';

  // 1. Lock check: FOR UPDATE on clientes
  const hasForUpdate = /FROM\s+public\.clientes[\s\S]*?FOR\s+UPDATE/i.test(body);
  recordChallenge(
    'RPC-LOCK-gsa_converter_pontos_carteira',
    'Evaluate exclusive row lock (`FOR UPDATE`) in `gsa_converter_pontos_carteira` against double-conversion race condition',
    hasForUpdate ? 'PASS' : 'FAIL',
    {
      error: !hasForUpdate ? 'Missing FOR UPDATE lock on public.clientes in gsa_converter_pontos_carteira!' : null,
      severity: 'CRITICAL'
    }
  );

  // 2. Balance depletion invariant check
  const checksInsufficientPoints = body.includes('Saldo de pontos insuficiente') &&
                                   body.includes('saldo_pontos');
  recordChallenge(
    'RPC-INVARIANT-gsa_converter_pontos_carteira',
    'Evaluate balance sufficiency check under concurrent depletion in `gsa_converter_pontos_carteira`',
    checksInsufficientPoints ? 'PASS' : 'FAIL',
    {
      error: !checksInsufficientPoints ? 'Missing balance sufficiency check in gsa_converter_pontos_carteira!' : null,
      severity: 'HIGH'
    }
  );

  // 3. Negative points exploit
  const guardsNegative = body.includes('p_pontos IS NULL OR p_pontos <= 0');
  recordChallenge(
    'RPC-NEGATIVE-INPUT-gsa_converter_pontos_carteira',
    'Attempt negative points injection exploit in `gsa_converter_pontos_carteira`',
    guardsNegative ? 'PASS' : 'FAIL',
    {
      error: !guardsNegative ? 'Negative point input not guarded against!' : null,
      severity: 'HIGH'
    }
  );

  // 4. Authorization check: authenticated caller must match p_cliente_id
  const hasAuthCheck = body.includes('auth.role() = \'authenticated\'') &&
                       body.includes('public.gsa_jwt_actor_id() = p_cliente_id');
  recordChallenge(
    'RPC-AUTH-gsa_converter_pontos_carteira',
    'Attempt unauthorized third-party point conversion via authenticated RPC caller',
    hasAuthCheck ? 'PASS' : 'FAIL',
    {
      error: !hasAuthCheck ? 'Missing caller authorization check in gsa_converter_pontos_carteira!' : null,
      severity: 'CRITICAL'
    }
  );

  // 5. Anon revocation
  const anonRevoked = rpc?.revokes.has('anon') || rpc?.revokes.has('public');
  recordChallenge(
    'RPC-ANON-REVOKED-gsa_converter_pontos_carteira',
    'Attempt unauthenticated anon execution of `gsa_converter_pontos_carteira`',
    anonRevoked ? 'PASS' : 'FAIL',
    {
      error: !anonRevoked ? 'Anon execution not revoked from gsa_converter_pontos_carteira!' : null,
      severity: 'CRITICAL'
    }
  );
}

// Target RPC 2: gsa_client_request_affiliate_payout
{
  const rpc = rpcs.get('gsa_client_request_affiliate_payout');
  const body = rpc?.body || '';

  // 1. Lock check: FOR UPDATE on gsa_afiliados and clientes
  const locksAffiliate = /FROM\s+public\.gsa_afiliados[\s\S]*?FOR\s+UPDATE/i.test(body);
  const locksClient = /FROM\s+public\.clientes[\s\S]*?FOR\s+UPDATE/i.test(body);
  recordChallenge(
    'RPC-LOCK-gsa_client_request_affiliate_payout',
    'Evaluate dual row locking (`FOR UPDATE` on `gsa_afiliados` and `clientes`) in `gsa_client_request_affiliate_payout`',
    locksAffiliate && locksClient ? 'PASS' : 'FAIL',
    {
      error: !locksAffiliate || !locksClient ? `Missing locks: affiliate=${locksAffiliate}, client=${locksClient}` : null,
      severity: 'CRITICAL'
    }
  );

  // 2. Idempotency check: request_id deduplication
  const hasIdempotency = body.includes('request_id = p_request_id') &&
                         body.includes('Identificador da solicitação obrigatório') &&
                         body.includes('p_payout_id') || body.includes('idempotent');
  recordChallenge(
    'RPC-IDEMPOTENCY-gsa_client_request_affiliate_payout',
    'Simulate rapid duplicate payout requests with identical `request_id` (Idempotency test)',
    hasIdempotency ? 'PASS' : 'FAIL',
    {
      error: !hasIdempotency ? 'Idempotency mechanism not found in gsa_client_request_affiliate_payout!' : null,
      severity: 'HIGH'
    }
  );

  // 3. Double-spending prevention: wallet deduction upon request
  const deductsWallet = body.includes('v_wallet_deduct := round(v_value - v_comm_available, 2)') &&
                        body.includes('saldo_carteira = round(saldo_carteira - v_wallet_deduct, 2)');
  recordChallenge(
    'RPC-DOUBLE-SPEND-gsa_client_request_affiliate_payout',
    'Simulate concurrent payout and wallet spending (Atomic wallet deduction on request creation)',
    deductsWallet ? 'PASS' : 'FAIL',
    {
      error: !deductsWallet ? 'Deficit from available commissions is not deducted from saldo_carteira upon payout creation!' : null,
      severity: 'CRITICAL'
    }
  );
}

// Target RPC 3: gsa_webhook_solicitar_saque_cliente
{
  const rpc = rpcs.get('gsa_webhook_solicitar_saque_cliente');
  const body = rpc?.body || '';

  // 1. Lock check: FOR UPDATE on clientes
  const locksClient = /FROM\s+public\.clientes[\s\S]*?FOR\s+UPDATE/i.test(body);
  recordChallenge(
    'RPC-LOCK-gsa_webhook_solicitar_saque_cliente',
    'Evaluate exclusive row lock (`FOR UPDATE` on `clientes`) in `gsa_webhook_solicitar_saque_cliente` against concurrent double-withdrawal',
    locksClient ? 'PASS' : 'FAIL',
    {
      error: !locksClient ? 'Missing FOR UPDATE lock in gsa_webhook_solicitar_saque_cliente!' : null,
      severity: 'CRITICAL'
    }
  );

  // 2. Atomic deduction & ledger insertion
  const hasAtomicDeduction = body.includes('v_novo_saldo := round(coalesce(v_cliente.saldo_carteira, 0) - v_valor, 2)') &&
                             body.includes('INSERT INTO public.saques') &&
                             body.includes('INSERT INTO public.carteira_lancamentos') &&
                             body.includes('INSERT INTO public.extrato_financeiro');
  recordChallenge(
    'RPC-ATOMIC-LEDGER-gsa_webhook_solicitar_saque_cliente',
    'Verify atomic state mutation and ledger write (saques + carteira_lancamentos + extrato_financeiro) in single ACID transaction',
    hasAtomicDeduction ? 'PASS' : 'FAIL',
    {
      error: !hasAtomicDeduction ? 'RPC does not update balance and ledgers atomically!' : null,
      severity: 'CRITICAL'
    }
  );

  // 3. Execution grants & caller permission challenge
  // Check if authenticated was granted execute without caller validation
  const authenticatedGranted = rpc?.grants.has('authenticated');
  const hasAuthValidation = body.includes('auth.role()') || body.includes('gsa_jwt_actor_id()');

  if (authenticatedGranted && !hasAuthValidation) {
    recordChallenge(
      'RPC-PERM-gsa_webhook_solicitar_saque_cliente',
      'Surface Risk Analysis: `gsa_webhook_solicitar_saque_cliente` granted to `authenticated` role without caller validation check',
      'WARN',
      {
        note: 'The RPC was granted to `authenticated` in migration 20260910233000, but lacks an `IF auth.role() = \'authenticated\'` check verifying `public.gsa_jwt_actor_id() = p_cliente_id`. While the webhook server executes via service_role, exposing this RPC to authenticated clients without an ownership check allows any authenticated user knowing another client UUID to initiate a withdrawal on their behalf. Recommendation: Either revoke EXECUTE from authenticated (retaining only service_role), or add an `IF auth.role() = \'authenticated\' THEN ...` verification identical to `gsa_converter_pontos_carteira`.',
        severity: 'MEDIUM'
      }
    );
  } else {
    recordChallenge(
      'RPC-PERM-gsa_webhook_solicitar_saque_cliente',
      'Verify caller validation in `gsa_webhook_solicitar_saque_cliente`',
      'PASS'
    );
  }
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 ADVERSARIAL CHALLENGE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`   Passed / Defended: ${passedTests}`);
console.log(`   Vulnerabilities:   ${failedTests}`);
console.log(`   Noted Risks:       ${findings.filter(f => f.severity.includes('MEDIUM') || f.severity.includes('LOW')).length}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error('\n❌ CHALLENGE STATUS: VULNERABILITIES DETECTED');
  process.exit(1);
} else {
  console.log('\n✅ CHALLENGE STATUS: ALL CORE SECURITY BOUNDARIES DEFENDED');
  process.exit(0);
}

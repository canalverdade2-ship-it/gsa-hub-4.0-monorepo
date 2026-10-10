/**
 * GSA HUB - Client Panel & Database RLS Acceptance Verification Suite
 *
 * Programmatically validates:
 * 1. Table `saques`: RLS is enabled (relrowsecurity = true), active SELECT policy exists for role
 *    `authenticated` enforcing client ownership (public.gsa_jwt_actor_type() = 'cliente' AND cliente_id = public.gsa_jwt_actor_id()).
 * 2. Table `pontos_movimentacoes`: RLS is enabled, active SELECT policy exists for role `authenticated`
 *    enforcing client ownership (public.gsa_jwt_actor_type() = 'cliente' AND cliente_id = public.gsa_jwt_actor_id()).
 * 3. Table `vouchers`: RLS is enabled, active SELECT policy `gsa_client_own_vouchers_read` exists for role
 *    `authenticated` enforcing client ownership (public.gsa_jwt_actor_type() = 'cliente' AND cliente_id = public.gsa_jwt_actor_id()).
 * 4. Absence of open wildcard leaks: Confirms `marketplace_orders_read` and `marketplace_purchase_orders_read`
 *    (USING (true)) are dropped from `orcamentos` and `ordens_compra` and replaced with client ownership filters.
 * 5. Anti-tampering bypass: Confirms RPCs (`gsa_admin_processar_saque`, `gsa_admin_ajustar_saldo_cliente`,
 *    `gsa_client_pagar_fatura`, `gsa_converter_pontos_carteira`) include `set_config('my.app.bypass_saldo_check', 'on', true)`.
 *
 * Supports live PostgreSQL connection (when DATABASE_URL / SUPABASE_DB_URL is available) and
 * comprehensive deterministic catalog simulation through sequential migration playback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
const liveAuditPath = path.join(projectRoot, 'scratch', 'live_db_audit.json');

console.log('================================================================');
console.log('🔒 GSA HUB: CLIENT PANEL & DATABASE RLS ACCEPTANCE VERIFIER');
console.log('================================================================');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const results = [];

function recordCheck(id, description, passed, details = {}) {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`✅ [PASS] (${id}) ${description}`);
  } else {
    failedChecks++;
    console.error(`❌ [FAIL] (${id}) ${description}`);
    if (details.error) console.error(`   Details: ${details.error}`);
  }
  results.push({ id, description, passed, details });
}

// -----------------------------------------------------------------------------
// Database Catalog Model (Simulates PostgreSQL pg_class, pg_policies, pg_proc)
// -----------------------------------------------------------------------------
class DatabaseCatalog {
  constructor() {
    this.tables = new Map(); // tableName -> { rls_enabled: boolean }
    this.policies = new Map(); // tableName -> Map<policyName, { cmd, roles, qual, withCheck, sourceFile }>
    this.functions = new Map(); // funcName -> { name, params, returnType, body, grants: Set, revokes: Set, sourceFile }
  }

  ensureTable(tableName) {
    const table = tableName.toLowerCase();
    if (!this.tables.has(table)) {
      this.tables.set(table, { rls_enabled: false });
      this.policies.set(table, new Map());
    }
    return table;
  }

  setRls(tableName, enabled) {
    const table = this.ensureTable(tableName);
    this.tables.get(table).rls_enabled = enabled;
  }

  createPolicy(tableName, policyName, { cmd = 'ALL', roles = ['public'], qual = '', withCheck = '', sourceFile = '' }) {
    const table = this.ensureTable(tableName);
    const polName = policyName.toLowerCase().replace(/^["']|["']$/g, '');
    this.policies.get(table).set(polName, {
      name: polName,
      cmd: cmd.toUpperCase(),
      roles: roles.map(r => r.toLowerCase()),
      qual: qual.trim(),
      withCheck: withCheck.trim(),
      sourceFile,
    });
  }

  dropPolicy(tableName, policyName) {
    const table = this.ensureTable(tableName);
    const polName = policyName.toLowerCase().replace(/^["']|["']$/g, '');
    this.policies.get(table).delete(polName);
  }

  dropAllPolicies(tableName) {
    const table = this.ensureTable(tableName);
    this.policies.get(table).clear();
  }

  upsertFunction(funcName, { params = [], returnType = '', body = '', sourceFile = '' }) {
    const name = funcName.toLowerCase();
    const existing = this.functions.get(name);
    this.functions.set(name, {
      name,
      params,
      returnType,
      body,
      sourceFile,
      grants: existing?.grants || new Set(),
      revokes: existing?.revokes || new Set(),
    });
  }

  grantFunction(funcName, roles) {
    const name = funcName.toLowerCase();
    if (!this.functions.has(name)) {
      this.upsertFunction(name, {});
    }
    roles.forEach(r => {
      this.functions.get(name).grants.add(r.toLowerCase());
      this.functions.get(name).revokes.delete(r.toLowerCase());
    });
  }

  revokeFunction(funcName, roles) {
    const name = funcName.toLowerCase();
    if (!this.functions.has(name)) {
      this.upsertFunction(name, {});
    }
    roles.forEach(r => {
      this.functions.get(name).revokes.add(r.toLowerCase());
      this.functions.get(name).grants.delete(r.toLowerCase());
    });
  }
}

// -----------------------------------------------------------------------------
// Catalog Loader: Baseline + Fast Sequential Migration Playback
// -----------------------------------------------------------------------------
function buildCatalogFromMigrations() {
  const catalog = new DatabaseCatalog();

  // Baseline known tables
  const coreTables = ['saques', 'pontos_movimentacoes', 'vouchers', 'orcamentos', 'ordens_compra', 'carteira_lancamentos'];
  for (const t of coreTables) {
    catalog.ensureTable(t);
  }

  // 1. Initialize from baseline schema audit if present
  if (fs.existsSync(liveAuditPath)) {
    try {
      const liveData = JSON.parse(fs.readFileSync(liveAuditPath, 'utf8'));
      if (liveData?.queries?.rls?.rows) {
        for (const row of liveData.queries.rls.rows) {
          catalog.setRls(row.table_name, Boolean(row.rls_enabled));
        }
      }
      if (liveData?.queries?.policies?.rows) {
        for (const pol of liveData.queries.policies.rows) {
          const roles = Array.isArray(pol.roles) ? pol.roles : [String(pol.roles || 'public')];
          catalog.createPolicy(pol.tablename, pol.policyname, {
            cmd: pol.cmd || 'ALL',
            roles,
            qual: pol.qual || '',
            withCheck: pol.with_check || '',
            sourceFile: 'scratch/live_db_audit.json',
          });
        }
      }
    } catch {
      // Continue if baseline cannot be parsed
    }
  }

  const targetRPCs = [
    'gsa_admin_processar_saque',
    'gsa_admin_ajustar_saldo_cliente',
    'gsa_client_pagar_fatura',
    'gsa_converter_pontos_carteira',
  ];

  // 2. Play all migrations in chronological order
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const contentUpper = content.toUpperCase();

    // 2.1 Enable RLS statements
    let aIdx = 0;
    while ((aIdx = contentUpper.indexOf('ENABLE ROW LEVEL SECURITY', aIdx)) !== -1) {
      const startIdx = contentUpper.lastIndexOf('ALTER TABLE', aIdx);
      if (startIdx !== -1 && (aIdx - startIdx) < 80) {
        const stmt = content.substring(startIdx, aIdx + 25);
        const m = stmt.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)/i);
        if (m) catalog.setRls(m[1], true);
      }
      aIdx += 25;
    }

    // 2.2 Handle PL/pgSQL loops enabling RLS and dropping old policies (e.g. 20260830023000)
    if (content.includes("format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY'")) {
      const arrayMatch = content.match(/v_tables\s+(?:constant\s+text\[\]\s*:=|:=)\s*ARRAY\[([\s\S]*?)\];/i);
      if (arrayMatch) {
        const tableList = arrayMatch[1]
          .split(',')
          .map(s => s.trim().replace(/^'|'$/g, ''))
          .filter(Boolean);
        for (const tbl of tableList) {
          catalog.setRls(tbl, true);
          if (content.includes("DROP POLICY IF EXISTS %I ON public.%I")) {
            catalog.dropAllPolicies(tbl);
          }
        }
      }
    }

    // 2.3 DROP POLICY
    let dIdx = 0;
    while ((dIdx = contentUpper.indexOf('DROP POLICY', dIdx)) !== -1) {
      const endIdx = content.indexOf(';', dIdx);
      if (endIdx === -1) break;
      const stmt = content.substring(dIdx, endIdx);
      const m = stmt.match(/DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_"]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/i);
      if (m) {
        catalog.dropPolicy(m[2], m[1]);
      }
      dIdx = endIdx + 1;
    }

    // 2.4 CREATE POLICY
    let pIdx = 0;
    while ((pIdx = contentUpper.indexOf('CREATE POLICY', pIdx)) !== -1) {
      const endIdx = content.indexOf(';', pIdx);
      if (endIdx === -1) break;
      const stmt = content.substring(pIdx, endIdx);
      const headerMatch = stmt.match(/CREATE\s+POLICY\s+([a-zA-Z0-9_"]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/i);
      if (headerMatch) {
        const polName = headerMatch[1].replace(/"/g, '');
        const tblName = headerMatch[2];

        let cmd = 'ALL';
        const cmdMatch = stmt.match(/FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i);
        if (cmdMatch) cmd = cmdMatch[1].toUpperCase();

        let roles = ['public'];
        const rolesMatch = stmt.match(/TO\s+([a-zA-Z0-9_,\s]+?)(?:USING|WITH\s+CHECK|$)/i);
        if (rolesMatch) {
          roles = rolesMatch[1].split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
        }

        let qual = '';
        const qualMatch = stmt.match(/USING\s*\(([\s\S]*?)\)(?:\s+WITH\s+CHECK|$)/i);
        if (qualMatch) qual = qualMatch[1].trim();

        let withCheck = '';
        const withCheckMatch = stmt.match(/WITH\s+CHECK\s*\(([\s\S]*?)\)$/i);
        if (withCheckMatch) withCheck = withCheckMatch[1].trim();

        catalog.createPolicy(tblName, polName, {
          cmd,
          roles,
          qual,
          withCheck,
          sourceFile: file,
        });
      }
      pIdx = endIdx + 1;
    }

    // 2.5 Target RPC definitions
    for (const rpcName of targetRPCs) {
      const needle = rpcName.toLowerCase();
      const contentLower = content.toLowerCase();
      let fnPos = 0;
      while ((fnPos = contentLower.indexOf(needle, fnPos)) !== -1) {
        const pre = contentLower.substring(Math.max(0, fnPos - 80), fnPos);
        if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?$/i.test(pre.trim())) {
          // Extract function body between $$ delimiters
          const firstDollar = content.indexOf('$$', fnPos);
          if (firstDollar !== -1) {
            const secondDollar = content.indexOf('$$', firstDollar + 2);
            if (secondDollar !== -1) {
              const body = content.substring(firstDollar + 2, secondDollar);
              catalog.upsertFunction(rpcName, { body, sourceFile: file });
            }
          }
        }
        fnPos += needle.length;
      }
    }

    // 2.6 Target REVOKE statements
    let rIdx = 0;
    while ((rIdx = contentUpper.indexOf('REVOKE', rIdx)) !== -1) {
      const endIdx = content.indexOf(';', rIdx);
      if (endIdx === -1) break;
      const stmt = content.substring(rIdx, endIdx + 1);
      for (const rpcName of targetRPCs) {
        if (stmt.toLowerCase().includes(rpcName.toLowerCase())) {
          if (/anon/i.test(stmt)) catalog.revokeFunction(rpcName, ['anon']);
          if (/public/i.test(stmt)) catalog.revokeFunction(rpcName, ['public']);
        }
      }
      rIdx = endIdx + 1;
    }

    // 2.7 Target GRANT statements
    let gIdx = 0;
    while ((gIdx = contentUpper.indexOf('GRANT', gIdx)) !== -1) {
      const endIdx = content.indexOf(';', gIdx);
      if (endIdx === -1) break;
      const stmt = content.substring(gIdx, endIdx + 1);
      for (const rpcName of targetRPCs) {
        if (stmt.toLowerCase().includes(rpcName.toLowerCase())) {
          if (/authenticated/i.test(stmt)) catalog.grantFunction(rpcName, ['authenticated']);
          if (/service_role/i.test(stmt)) catalog.grantFunction(rpcName, ['service_role']);
          if (/anon/i.test(stmt)) catalog.grantFunction(rpcName, ['anon']);
        }
      }
      gIdx = endIdx + 1;
    }
  }

  return catalog;
}

// -----------------------------------------------------------------------------
// Live Database Verification (Fallback or Augmented)
// -----------------------------------------------------------------------------
async function queryLiveCatalogIfAvailable() {
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connStr) return null;

  try {
    const client = new pg.Client({
      connectionString: connStr,
      connectionTimeoutMillis: 3000,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    });
    await client.connect();

    const [rlsRes, policiesRes, funcsRes] = await Promise.all([
      client.query(`SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'`),
      client.query(`SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`),
      client.query(`SELECT p.proname AS func_name, pg_get_functiondef(p.oid) AS func_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`),
    ]);

    await client.end();
    return { rls: rlsRes.rows, policies: policiesRes.rows, functions: funcsRes.rows };
  } catch (err) {
    console.log(`[info] Live PostgreSQL not reachable (${err.message}). Falling back to migration catalog simulation.`);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Helper Normalizers
// -----------------------------------------------------------------------------
function normalizeSql(sql) {
  return (sql || '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function policyEnforcesClientOwnership(qual) {
  const norm = normalizeSql(qual);
  const hasActorTypeCheck = norm.includes("public.gsa_jwt_actor_type()='cliente'") ||
                            norm.includes("public.gsa_jwt_actor_type() = 'cliente'");
  const hasClientIdCheck = norm.includes("cliente_id=public.gsa_jwt_actor_id()") ||
                           norm.includes("cliente_id = public.gsa_jwt_actor_id()") ||
                           norm.includes("public.gsa_jwt_actor_id()=cliente_id");
  return hasActorTypeCheck && hasClientIdCheck;
}

// -----------------------------------------------------------------------------
// Main Verification Runner
// -----------------------------------------------------------------------------
async function runAcceptanceVerification() {
  const t0 = Date.now();
  const liveData = await queryLiveCatalogIfAvailable();
  const catalog = buildCatalogFromMigrations();

  console.log(`Source mode: ${liveData ? 'LIVE POSTGRESQL' : 'DETERMINISTIC MIGRATION CATALOG PLAYBACK'}`);
  console.log(`Catalog prepared in ${Date.now() - t0}ms.`);
  console.log('----------------------------------------------------------------\n');

  // ===========================================================================
  // Requirement 2a: Table `saques`
  // - RLS enabled (relrowsecurity = true)
  // - Active SELECT policy for role `authenticated` enforcing client ownership
  // ===========================================================================
  console.log('--- 1. Table `saques` RLS & Policy Validation ---');
  let saquesRls = false;
  let saquesAuthSelectPolicies = [];

  if (liveData) {
    const row = liveData.rls.find(r => r.table_name === 'saques');
    saquesRls = Boolean(row?.rls_enabled);
    saquesAuthSelectPolicies = liveData.policies.filter(p => p.tablename === 'saques' && (p.cmd === 'SELECT' || p.cmd === 'ALL') && p.roles.includes('authenticated'));
  } else {
    saquesRls = Boolean(catalog.tables.get('saques')?.rls_enabled);
    const tablePolicies = Array.from(catalog.policies.get('saques')?.values() || []);
    saquesAuthSelectPolicies = tablePolicies.filter(p => (p.cmd === 'SELECT' || p.cmd === 'ALL') && (p.roles.includes('authenticated') || p.roles.includes('public')));
  }

  recordCheck('2a.1', 'Table `saques` has RLS enabled (relrowsecurity = true)', saquesRls === true, {
    table: 'saques',
    rls_enabled: saquesRls,
  });

  const saquesOwnershipPolicy = saquesAuthSelectPolicies.find(p => policyEnforcesClientOwnership(p.qual));
  recordCheck(
    '2a.2',
    'Table `saques` has active SELECT policy for role `authenticated` enforcing client ownership (gsa_jwt_actor_type() = "cliente" AND cliente_id = gsa_jwt_actor_id())',
    Boolean(saquesOwnershipPolicy),
    {
      policiesFound: saquesAuthSelectPolicies.map(p => ({ name: p.name || p.policyname, qual: p.qual })),
      matchedPolicy: saquesOwnershipPolicy ? (saquesOwnershipPolicy.name || saquesOwnershipPolicy.policyname) : null,
    }
  );

  // ===========================================================================
  // Requirement 2b: Table `pontos_movimentacoes`
  // - RLS enabled (relrowsecurity = true)
  // - Active SELECT policy for role `authenticated` enforcing client ownership
  // ===========================================================================
  console.log('\n--- 2. Table `pontos_movimentacoes` RLS & Policy Validation ---');
  let pontosRls = false;
  let pontosAuthSelectPolicies = [];

  if (liveData) {
    const row = liveData.rls.find(r => r.table_name === 'pontos_movimentacoes');
    pontosRls = Boolean(row?.rls_enabled);
    pontosAuthSelectPolicies = liveData.policies.filter(p => p.tablename === 'pontos_movimentacoes' && (p.cmd === 'SELECT' || p.cmd === 'ALL') && p.roles.includes('authenticated'));
  } else {
    pontosRls = Boolean(catalog.tables.get('pontos_movimentacoes')?.rls_enabled);
    const tablePolicies = Array.from(catalog.policies.get('pontos_movimentacoes')?.values() || []);
    pontosAuthSelectPolicies = tablePolicies.filter(p => (p.cmd === 'SELECT' || p.cmd === 'ALL') && (p.roles.includes('authenticated') || p.roles.includes('public')));
  }

  recordCheck('2b.1', 'Table `pontos_movimentacoes` has RLS enabled (relrowsecurity = true)', pontosRls === true, {
    table: 'pontos_movimentacoes',
    rls_enabled: pontosRls,
  });

  const pontosOwnershipPolicy = pontosAuthSelectPolicies.find(p => policyEnforcesClientOwnership(p.qual));
  recordCheck(
    '2b.2',
    'Table `pontos_movimentacoes` has active SELECT policy for role `authenticated` enforcing client ownership (gsa_jwt_actor_type() = "cliente" AND cliente_id = gsa_jwt_actor_id())',
    Boolean(pontosOwnershipPolicy),
    {
      policiesFound: pontosAuthSelectPolicies.map(p => ({ name: p.name || p.policyname, qual: p.qual })),
      matchedPolicy: pontosOwnershipPolicy ? (pontosOwnershipPolicy.name || pontosOwnershipPolicy.policyname) : null,
    }
  );

  // ===========================================================================
  // Requirement 2c: Table `vouchers`
  // - RLS enabled (relrowsecurity = true)
  // - Active SELECT policy `gsa_client_own_vouchers_read` for role `authenticated` enforcing client ownership
  // ===========================================================================
  console.log('\n--- 3. Table `vouchers` RLS & Policy Validation ---');
  let vouchersRls = false;
  let vouchersPolicies = [];

  if (liveData) {
    const row = liveData.rls.find(r => r.table_name === 'vouchers');
    vouchersRls = Boolean(row?.rls_enabled);
    vouchersPolicies = liveData.policies.filter(p => p.tablename === 'vouchers');
  } else {
    vouchersRls = Boolean(catalog.tables.get('vouchers')?.rls_enabled);
    vouchersPolicies = Array.from(catalog.policies.get('vouchers')?.values() || []);
  }

  recordCheck('2c.1', 'Table `vouchers` has RLS enabled (relrowsecurity = true)', vouchersRls === true, {
    table: 'vouchers',
    rls_enabled: vouchersRls,
  });

  const vouchersOwnPolicy = vouchersPolicies.find(p => {
    const name = (p.name || p.policyname || '').toLowerCase();
    return name === 'gsa_client_own_vouchers_read';
  });

  const vouchersPolicyValid = Boolean(
    vouchersOwnPolicy &&
    (vouchersOwnPolicy.cmd === 'SELECT' || vouchersOwnPolicy.cmd === 'ALL') &&
    (vouchersOwnPolicy.roles.includes('authenticated') || vouchersOwnPolicy.roles.includes('public')) &&
    policyEnforcesClientOwnership(vouchersOwnPolicy.qual)
  );

  recordCheck(
    '2c.2',
    'Table `vouchers` has active SELECT policy `gsa_client_own_vouchers_read` for role `authenticated` enforcing client ownership',
    vouchersPolicyValid,
    {
      found: Boolean(vouchersOwnPolicy),
      qual: vouchersOwnPolicy?.qual,
      roles: vouchersOwnPolicy?.roles,
      cmd: vouchersOwnPolicy?.cmd,
    }
  );

  // ===========================================================================
  // Requirement 2d: Absence of open wildcard leaks
  // - Confirm `marketplace_orders_read` and `marketplace_purchase_orders_read` (USING (true))
  //   are dropped from `orcamentos` and `ordens_compra`
  // ===========================================================================
  console.log('\n--- 4. Absence of Open Wildcard Leaks (`orcamentos` & `ordens_compra`) ---');
  let orcamentosPolicies = [];
  let ordensCompraPolicies = [];

  if (liveData) {
    orcamentosPolicies = liveData.policies.filter(p => p.tablename === 'orcamentos');
    ordensCompraPolicies = liveData.policies.filter(p => p.tablename === 'ordens_compra');
  } else {
    orcamentosPolicies = Array.from(catalog.policies.get('orcamentos')?.values() || []);
    ordensCompraPolicies = Array.from(catalog.policies.get('ordens_compra')?.values() || []);
  }

  const hasLeakingOrders = orcamentosPolicies.some(p => {
    const name = (p.name || p.policyname || '').toLowerCase();
    const qual = normalizeSql(p.qual);
    return name === 'marketplace_orders_read' || (qual === 'true' && (p.roles.includes('public') || p.roles.includes('authenticated')));
  });

  const hasLeakingPurchaseOrders = ordensCompraPolicies.some(p => {
    const name = (p.name || p.policyname || '').toLowerCase();
    const qual = normalizeSql(p.qual);
    return name === 'marketplace_purchase_orders_read' || (qual === 'true' && (p.roles.includes('public') || p.roles.includes('authenticated')));
  });

  recordCheck(
    '2d.1',
    'Wildcard leak `marketplace_orders_read` (USING (true)) is strictly DROPPED from `orcamentos`',
    !hasLeakingOrders,
    {
      activePolicies: orcamentosPolicies.map(p => ({ name: p.name || p.policyname, qual: p.qual, roles: p.roles })),
    }
  );

  recordCheck(
    '2d.2',
    'Wildcard leak `marketplace_purchase_orders_read` (USING (true)) is strictly DROPPED from `ordens_compra`',
    !hasLeakingPurchaseOrders,
    {
      activePolicies: ordensCompraPolicies.map(p => ({ name: p.name || p.policyname, qual: p.qual, roles: p.roles })),
    }
  );

  const orcamentosClientHardened = orcamentosPolicies.some(p => policyEnforcesClientOwnership(p.qual));
  const ordensCompraClientHardened = ordensCompraPolicies.some(p => policyEnforcesClientOwnership(p.qual));

  recordCheck(
    '2d.3',
    'Table `orcamentos` has active client-ownership enforcement policy (`gsa_client_own_orcamentos_hardened`)',
    orcamentosClientHardened,
    { policies: orcamentosPolicies.map(p => p.name || p.policyname) }
  );

  recordCheck(
    '2d.4',
    'Table `ordens_compra` has active client-ownership enforcement policy (`gsa_client_own_ordens_compra_hardened`)',
    ordensCompraClientHardened,
    { policies: ordensCompraPolicies.map(p => p.name || p.policyname) }
  );

  // ===========================================================================
  // Requirement 2e: Anti-tampering bypass in RPCs
  // - Confirm RPCs (`gsa_admin_processar_saque`, `gsa_admin_ajustar_saldo_cliente`,
  //   `gsa_client_pagar_fatura`, `gsa_converter_pontos_carteira`) include
  //   `set_config('my.app.bypass_saldo_check', 'on', true)`
  // ===========================================================================
  console.log('\n--- 5. Anti-Tampering Bypass in Financial RPCs ---');

  const requiredBypassRPCs = [
    'gsa_admin_processar_saque',
    'gsa_admin_ajustar_saldo_cliente',
    'gsa_client_pagar_fatura',
    'gsa_converter_pontos_carteira',
  ];

  for (const rpcName of requiredBypassRPCs) {
    let rpcDef = '';

    if (liveData) {
      const row = liveData.functions.find(f => f.func_name === rpcName);
      rpcDef = row?.func_def || '';
    } else {
      const fn = catalog.functions.get(rpcName);
      rpcDef = fn?.body || '';
    }

    const hasBypass = /set_config\s*\(\s*['"]my\.app\.bypass_saldo_check['"]\s*,\s*['"]on['"]\s*,\s*true\s*\)/i.test(rpcDef);

    recordCheck(
      `2e.${rpcName}`,
      `RPC \`${rpcName}\` includes \`set_config('my.app.bypass_saldo_check', 'on', true)\``,
      hasBypass,
      {
        rpc: rpcName,
        bypassFound: hasBypass,
        sourceFile: catalog.functions.get(rpcName)?.sourceFile,
      }
    );
  }

  // ===========================================================================
  // Requirement 2f: Extended Security & Integrity Validation
  // - Trigger `prevent_saldo_tampering()` requires the bypass setting
  // - `gsa_converter_pontos_carteira` revokes anon
  // ===========================================================================
  console.log('\n--- 6. Extended Financial Trigger & Authorization Checks ---');

  // Check prevent_saldo_tampering trigger contract
  const triggerMigration = fs.readFileSync(
    path.join(migrationsDir, '20260803170000_fix_admin_baixar_fatura_saldo_bypass.sql'),
    'utf8'
  );
  const triggerChecksBypass = triggerMigration.includes("current_setting('my.app.bypass_saldo_check', true) = 'on'");
  recordCheck(
    '2f.1',
    'Trigger `prevent_saldo_tampering()` evaluates `current_setting(\'my.app.bypass_saldo_check\', true) = \'on\'`',
    triggerChecksBypass,
    { verifiedIn: '20260803170000_fix_admin_baixar_fatura_saldo_bypass.sql' }
  );

  // Check anon revocation on gsa_converter_pontos_carteira
  const pointsConversionFn = catalog.functions.get('gsa_converter_pontos_carteira');
  const anonRevoked = pointsConversionFn?.revokes.has('anon') || pointsConversionFn?.revokes.has('public');
  recordCheck(
    '2f.2',
    'RPC `gsa_converter_pontos_carteira` strictly revokes execute privileges from `anon`/`public`',
    anonRevoked === true,
    {
      revokedRoles: Array.from(pointsConversionFn?.revokes || []),
    }
  );

  // Check gsa_admin_ajustar_saldo_cliente supports both entry types
  const balanceAdjustFn = catalog.functions.get('gsa_admin_ajustar_saldo_cliente');
  const supportsEntrada = balanceAdjustFn?.body.includes("v_tipo IN ('credito', 'entrada')");
  const supportsSaida = balanceAdjustFn?.body.includes("v_tipo IN ('debito', 'saida')");
  recordCheck(
    '2f.3',
    'RPC `gsa_admin_ajustar_saldo_cliente` correctly handles both (`credito`, `entrada`) and (`debito`, `saida`)',
    Boolean(supportsEntrada && supportsSaida),
    { supportsEntrada, supportsSaida }
  );

  // ===========================================================================
  // Summary & Exit Status
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`📊 FINAL VERIFICATION REPORT: ${passedChecks}/${totalChecks} CHECKS PASSED`);
  console.log(`   Passed: ${passedChecks}`);
  console.log(`   Failed: ${failedChecks}`);
  console.log('================================================================');

  if (failedChecks === 0) {
    console.log('🎉 ALL DATABASE RLS & RPC SECURITY ACCEPTANCE CRITERIA VERIFIED 100% PASSING!');
    process.exit(0);
  } else {
    console.error(`❌ VERIFICATION FAILED WITH ${failedChecks} ERRORS.`);
    process.exit(1);
  }
}

runAcceptanceVerification().catch(err => {
  console.error('Fatal verification failure:', err);
  process.exit(1);
});

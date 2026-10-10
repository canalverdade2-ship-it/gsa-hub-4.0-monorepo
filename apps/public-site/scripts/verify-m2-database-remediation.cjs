/**
 * Verification Script for Milestone 2: Database Remediation & Webhook Hardening
 * Verifies that:
 * 1. The new migration exists and has valid syntax, RLS policies, and RPC definitions.
 * 2. Webhooks have valid syntax and use atomic client withdrawal and calculated provider withdrawal.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260910233000_client_panel_rls_hardening.sql');
const vpsWebhookPath = path.join(root, 'server_webhook_vps_live.cjs');
const webhookPath = path.join(root, 'server_webhook.cjs');

console.log('================================================================');
console.log('🧪 MILESTONE 2: DATABASE REMEDIATION VERIFICATION SUITE');
console.log('================================================================');

let passed = 0;
let total = 0;

function check(desc, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${desc}: ${err.message}`);
  }
}

// 1. Check Migration File
check('Migration file 20260910233000_client_panel_rls_hardening.sql exists', () => {
  assert(fs.existsSync(migrationPath), 'Migration file does not exist');
});

const migrationSql = fs.readFileSync(migrationPath, 'utf8');

// 2. Check Vouchers RLS Policy
check('Table vouchers has gsa_client_own_vouchers_read policy', () => {
  assert(migrationSql.includes('gsa_client_own_vouchers_read'), 'Missing policy gsa_client_own_vouchers_read');
  assert(/public\.gsa_jwt_actor_type\(\)\s*=\s*'cliente'\s*AND\s*cliente_id\s*=\s*public\.gsa_jwt_actor_id\(\)/.test(migrationSql), 'Missing client actor check on vouchers');
});

// 3. Check Orcamentos & Ordens de Compra leak fixes
check('Tables orcamentos and ordens_compra drop open public policies', () => {
  assert(migrationSql.includes('DROP POLICY IF EXISTS marketplace_orders_read ON public.orcamentos;'), 'Missing drop marketplace_orders_read');
  assert(migrationSql.includes('DROP POLICY IF EXISTS marketplace_purchase_orders_read ON public.ordens_compra;'), 'Missing drop marketplace_purchase_orders_read');
  assert(migrationSql.includes('gsa_client_own_orcamentos_hardened'), 'Missing gsa_client_own_orcamentos_hardened');
  assert(migrationSql.includes('gsa_client_own_ordens_compra_hardened'), 'Missing gsa_client_own_ordens_compra_hardened');
});

// 4. Check Loja Favoritos RLS
check('Table loja_favoritos drops permissive policies and enforces self-ownership', () => {
  assert(migrationSql.includes('DROP POLICY IF EXISTS "cliente_select_loja_favoritos" ON public.loja_favoritos;'), 'Missing drop cliente_select_loja_favoritos');
  assert(migrationSql.includes('DROP POLICY IF EXISTS "admin_all_loja_favoritos" ON public.loja_favoritos;'), 'Missing drop admin_all_loja_favoritos');
  assert(migrationSql.includes('gsa_client_own_favoritos'), 'Missing gsa_client_own_favoritos');
});

// 5. Check Promocoes Quantidade Ativadas & Loja Carrinhos
check('Tables promocoes_quantidade_ativadas and loja_carrinhos enable RLS', () => {
  assert(migrationSql.includes('ALTER TABLE public.promocoes_quantidade_ativadas ENABLE ROW LEVEL SECURITY;'), 'RLS not enabled on promocoes_quantidade_ativadas');
  assert(migrationSql.includes('ALTER TABLE public.loja_carrinhos ENABLE ROW LEVEL SECURITY;'), 'RLS not enabled on loja_carrinhos');
  assert(migrationSql.includes('gsa_client_own_qty_promo_activations'), 'Missing gsa_client_own_qty_promo_activations');
  assert(migrationSql.includes('gsa_client_own_cart'), 'Missing gsa_client_own_cart');
});

// 6. Check Cliente Premios
check('Table cliente_premios has client read policy', () => {
  assert(migrationSql.includes('gsa_client_own_premios_read'), 'Missing gsa_client_own_premios_read');
});

// 7. Check RPC gsa_converter_pontos_carteira
check('RPC gsa_converter_pontos_carteira revokes anon and checks caller authorization', () => {
  assert(migrationSql.includes('REVOKE ALL ON FUNCTION public.gsa_converter_pontos_carteira(uuid, integer) FROM PUBLIC, anon;'), 'Anon not revoked from gsa_converter_pontos_carteira');
  assert(migrationSql.includes("auth.role() = 'authenticated'"), 'Missing authenticated role check in gsa_converter_pontos_carteira');
  assert(migrationSql.includes("public.gsa_jwt_actor_id() = p_cliente_id"), 'Missing actor_id match in gsa_converter_pontos_carteira');
});

// 8. Check bypass_saldo_check on financial RPCs
check('RPCs set bypass_saldo_check for prevent_saldo_tampering compatibility', () => {
  assert(migrationSql.includes("PERFORM set_config('my.app.bypass_saldo_check', 'on', true);"), 'Missing bypass_saldo_check configuration');
});

// 9. Check RPC gsa_admin_ajustar_saldo_cliente
check('RPC gsa_admin_ajustar_saldo_cliente supports both credito/entrada and debito/saida', () => {
  assert(migrationSql.includes("v_tipo IN ('credito', 'entrada')"), 'Missing credito/entrada handling');
  assert(migrationSql.includes("v_tipo IN ('debito', 'saida')"), 'Missing debito/saida handling');
  assert(migrationSql.includes("'saldo_atual', v_novo_saldo"), 'Missing saldo_atual return');
  assert(migrationSql.includes("'ajuste', v_adjustment"), 'Missing ajuste return');
});

// 10. Check RPC gsa_client_request_affiliate_payout
check('RPC gsa_client_request_affiliate_payout deducts wallet balance on request', () => {
  assert(migrationSql.includes('v_wallet_deduct'), 'Missing wallet deduct variable');
  assert(migrationSql.includes('UPDATE public.clientes'), 'Missing clientes wallet deduction');
  assert(migrationSql.includes('carteira_lancamentos'), 'Missing carteira_lancamentos entry');
  assert(migrationSql.includes('extrato_financeiro'), 'Missing extrato_financeiro entry');
});

// 11. Check Node Syntax for Webhooks
check('Webhooks pass node -c syntax check without errors', () => {
  execSync(`node -c "${webhookPath}"`);
  execSync(`node -c "${vpsWebhookPath}"`);
});

// 12. Check Webhooks Client Withdrawal
check('Webhooks call gsa_webhook_solicitar_saque_cliente atomically', () => {
  const vpsCode = fs.readFileSync(vpsWebhookPath, 'utf8');
  const webCode = fs.readFileSync(webhookPath, 'utf8');
  assert(vpsCode.includes("supabaseRpc('gsa_webhook_solicitar_saque_cliente'"), 'vps live webhook does not call atomic withdrawal RPC');
  assert(webCode.includes("supabaseRpc('gsa_webhook_solicitar_saque_cliente'"), 'webhook does not call atomic withdrawal RPC');
  assert(!vpsCode.includes("supabasePatch(`/rest/v1/clientes?id=eq.${session.client.id}`, { saldo_carteira: 0 }"), 'vps live still contains non-atomic patch');
  assert(!webCode.includes("supabasePatch(`/rest/v1/clientes?id=eq.${session.client.id}`, { saldo_carteira: 0 }"), 'webhook still contains non-atomic patch');
});

// 13. Check Webhooks Provider Withdrawal
check('Webhooks insert provider withdrawal with actual amount rather than hardcoded 0.00', () => {
  const vpsCode = fs.readFileSync(vpsWebhookPath, 'utf8');
  const webCode = fs.readFileSync(webhookPath, 'utf8');
  assert(!vpsCode.includes('valor: 0.00,\n      status: \'solicitado\''), 'vps live webhook still has hardcoded 0.00 withdrawal');
  assert(!webCode.includes('valor: 0.00,\n      status: \'solicitado\''), 'webhook still has hardcoded 0.00 withdrawal');
  assert(vpsCode.includes('valor: finalValor'), 'vps live does not use finalValor');
  assert(webCode.includes('valor: finalValor'), 'webhook does not use finalValor');
});

console.log('----------------------------------------------------------------');
console.log(`🏁 Total: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
if (passed === total) {
  console.log('🎉 ALL DATABASE REMEDIATION & WEBHOOK CHECKS PASSED!');
  process.exit(0);
} else {
  console.error('❌ SOME CHECKS FAILED!');
  process.exit(1);
}

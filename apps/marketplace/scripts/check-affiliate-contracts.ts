import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { routes } from '../src/routing/routeCatalog';
import { matchRoute } from '../src/routing/routeMatcher';
import { adminModulePath, canAccessAdminModule } from '../src/routing/adminAccess';

const root = process.cwd();
const read = (path: string) => readFile(resolve(root, path), 'utf8');

async function contains(path: string, patterns: string[]) {
  const content = await read(path);
  for (const pattern of patterns) assert.ok(content.includes(pattern), `${path}: contrato ausente: ${pattern}`);
  return content;
}

async function excludes(path: string, patterns: string[]) {
  const content = await read(path);
  for (const pattern of patterns) assert.ok(!content.includes(pattern), `${path}: conteudo indevido: ${pattern}`);
}

async function main() {
  assert.equal(routes.public.affiliates(), '/afiliados');
  assert.equal(routes.login.affiliate(), '/afiliados/login');
  assert.equal(routes.public.affiliateDashboard(), '/afiliados/dashboard');
  assert.equal(routes.public.affiliateLinks(), '/afiliados/links');
  assert.equal(routes.public.affiliateCommissions(), '/afiliados/comissoes');
  assert.equal(routes.public.affiliatePayouts(), '/afiliados/saques');
  assert.equal(routes.public.affiliateProfile(), '/afiliados/perfil');
  assert.equal(routes.public.affiliatePoints(), '/afiliados/pontos');
  assert.equal(matchRoute('/afiliados/links', '', '').module, 'affiliates');
  assert.equal(matchRoute('/afiliados/links', '', '').itemId, 'links');
  assert.equal(adminModulePath('afiliados'), '/admin/financeiro/afiliados');
  assert.equal(canAccessAdminModule('admin', [], 'afiliados'), true);
  assert.equal(canAccessAdminModule('colaborador', ['afiliados'], 'afiliados'), true);

  const migration = await contains('supabase/migrations/20260722233000_complete_affiliate_flow.sql', [
    'gsa_client_affiliate_snapshot',
    'gsa_client_create_affiliate_link',
    'gsa_client_request_affiliate_payout',
    'gsa_client_cancel_affiliate_payout',
    'gsa_client_redeem_affiliate_points',
    'gsa_admin_affiliate_snapshot',
    'gsa_admin_update_affiliate_program',
    'gsa_admin_set_affiliate_status',
    'gsa_admin_decide_affiliate_payout',
    'gsa_affiliate_conversion_from_business_event',
    'ALTER PUBLICATION supabase_realtime ADD TABLE',
    'COMMIT;',
  ]);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/);

  await contains('supabase/migrations/20260722233100_harden_affiliate_payout_idempotency.sql', [
    'Identificador de solicitacao ja utilizado em outra operacao',
    "status IN ('solicitado','aprovado')",
    'COMMIT;',
  ]);
  await contains('supabase/migrations/20260722233200_secure_affiliate_activation.sql', [
    'requires_authentication',
    'REVOKE ALL ON FUNCTION public.gsa_public_register_affiliate(jsonb) FROM PUBLIC, anon, authenticated',
    'GRANT EXECUTE ON FUNCTION public.gsa_public_register_affiliate(jsonb) TO service_role',
  ]);

  await contains('supabase/migrations/20260729110000_fix_affiliate_all_issues.sql', [
    'bonus_boas_vindas',
    'gsa_admin_release_affiliate_commissions',
    'gsa_admin_update_affiliate_details',
    'gsa_admin_adjust_affiliate_balance',
    'gsa_admin_update_global_saque_minimo',
    'points_events',
  ]);

  await contains('src/features/affiliates/service.ts', [
    "callClientRpc('gsa_client_affiliate_snapshot')",
    "callClientRpc('gsa_client_create_affiliate_link'",
    "callClientRpc('gsa_client_request_affiliate_payout'",
    "callClientRpc('gsa_client_redeem_affiliate_points'",
  ]);

  await contains('src/pages/Afiliado/AffiliateAccessPage.tsx', [
    "sessionService.loginWithPin(cleanDocument, accessPin, 'cliente')",
    'sessionService.registerAffiliate({',
    'Crie um PIN de 4 dígitos',
  ]);
  await excludes('src/pages/Afiliado/AffiliateAccessPage.tsx', [
    "supabase.rpc('gsa_public_register_affiliate'",
  ]);

  await contains('src/pages/Afiliado/AfiliadoDashboard.tsx', [
    'fetchAffiliateSnapshot',
    'createAffiliateLink',
    'requestAffiliatePayout',
    'cancelAffiliatePayout',
    'redeemAffiliatePoints',
    'activateClientProfileFromAffiliate',
    'Ativar perfil de cliente',
  ]);

  await contains('supabase/migrations/20260829003000_independent_affiliate_and_client_profile_activation.sql', [
    'perfil_cliente_ativo',
    'gsa_register_affiliate_account',
    'gsa_client_profile_access_state',
    'gsa_affiliate_activate_client_profile',
    'COMMIT;',
  ]);
  await contains('supabase/migrations/20260830010000_harden_affiliate_program_end_to_end.sql', [
    'saldo_operacional',
    'gsa_affiliate_programs_public_read',
    'gsa_affiliates_own_read',
    'gsa_affiliate_transfers_own_read',
    'gsa_register_affiliate_sale_commission',
    'Informe a referência ou comprovante do pagamento PIX',
    "modulo = 'afiliados'",
  ]);
  await excludes('src/pages/Afiliado/AfiliadoDashboard.tsx', [
    ".from('gsa_afiliados')",
    ".from('gsa_afiliado_comissoes')",
    ".from('gsa_afiliado_saques')",
    "?ref=${code}",
  ]);

  await contains('src/components/admin/AffiliateAdminModule.tsx', [
    "callAdminRpc<AffiliateAdminSnapshot>('gsa_admin_affiliate_snapshot')",
    "callAdminRpc('gsa_admin_update_affiliate_program'",
    "callAdminRpc('gsa_admin_set_affiliate_status'",
    "callAdminRpc('gsa_admin_decide_affiliate_payout'",
  ]);
  await excludes('src/components/admin/AffiliateAdminModule.tsx', [
    ".from('gsa_afiliado_programas')",
    ".from('gsa_afiliados')",
    ".from('gsa_afiliado_saques')",
  ]);

  await contains('src/routing/routeSecurity.ts', [
    "area === 'public' && module === 'affiliates'",
    "Boolean(session.clientId)",
    "'/afiliados/login'",
  ]);

  for (const path of [
    'src/components/public/AffiliatePublicPage.tsx',
    'src/pages/Afiliado/AffiliateAccessPage.tsx',
    'src/pages/Afiliado/AfiliadoDashboard.tsx',
    'src/components/admin/AffiliateAdminModule.tsx',
  ]) {
    await excludes(path, ['<<<<<<<', '=======', '>>>>>>>']);
  }

  console.log('Contratos do GSA Afiliados validados com sucesso.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

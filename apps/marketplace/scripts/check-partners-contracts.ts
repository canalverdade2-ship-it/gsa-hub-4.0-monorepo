import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { matchRoute } from '../src/routing/routeMatcher';
import { routes } from '../src/routing/routeCatalog';
import { adminModulePath, canAccessAdminModule, normalizeAdminModule } from '../src/routing/adminAccess';

const root = process.cwd();

async function read(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

async function contains(path: string, patterns: string[]) {
  const content = await read(path);
  for (const pattern of patterns) {
    assert.ok(content.includes(pattern), `${path}: contrato ausente: ${pattern}`);
  }
}

async function excludes(path: string, patterns: string[]) {
  const content = await read(path);
  for (const pattern of patterns) {
    assert.ok(!content.includes(pattern), `${path}: conteúdo indevido: ${pattern}`);
  }
}

async function main() {
  assert.ok(routes.public.partners() === '/nossos-parceiros' || routes.public.partners() === '/parceiros');
  assert.ok(routes.public.partner('empresa-exemplo').includes('empresa-exemplo'));
  assert.equal(routes.admin.partners(), '/admin/parceiros');

  const listRoute = matchRoute('/nossos-parceiros', '', '');
  assert.equal(listRoute.area, 'public');
  assert.equal(listRoute.module, 'partners');
  assert.equal(listRoute.itemId, undefined);

  const detailRoute = matchRoute('/nossos-parceiros/empresa-exemplo', '', '');
  assert.equal(detailRoute.area, 'public');
  assert.equal(detailRoute.module, 'partners');
  assert.equal(detailRoute.itemId, 'empresa-exemplo');

  assert.equal(normalizeAdminModule('parceiros'), 'parceiros');
  assert.equal(adminModulePath('parceiros'), '/admin/parceiros');
  assert.equal(canAccessAdminModule('admin', [], 'parceiros'), true);
  assert.equal(canAccessAdminModule('colaborador', [], 'parceiros'), false);
  assert.equal(canAccessAdminModule('colaborador', ['parceiros'], 'parceiros'), true);

  await contains('src/components/public/GSAEnterpriseHomeFinal.tsx', [
    '<PartnersPage',
    "props.publicPage === 'partners'",
    'initialPartnerSlug',
    'onPartnerDetailChange',
  ]);

  await contains('src/components/public/final/PublicFooter.tsx', [
    "setPublicPage('partners')",
    'Parceiros</button>',
  ]);

  await excludes('src/components/public/final/PublicHomeLanding.tsx', [
    "title: 'Parceiros'",
    "setPublicPage('partners')",
  ]);

  await contains('src/components/public/PartnersPage.tsx', [
    'listPublicPartners',
    'Conhecer parceiro',
    'PartnerApplicationModal',
    'Seja nosso parceiro',
    'enviada diretamente ao painel administrativo para análise',
    'Informações de contato',
  ]);

  await contains('src/components/public/PartnerApplicationModal.tsx', [
    'Dados da empresa ou profissional',
    'Responsável pela solicitação',
    'Atuação, serviços e benefícios',
    'Logotipo e foto de apresentação',
    'Enviar para análise',
    'status <strong>Em análise</strong>',
    'privacy_consent',
    'company_website',
    'submitPartnerApplication',
  ]);

  await contains('src/features/partners/service.ts', [
    ".eq('status', 'ativo')",
    "supabase.functions.invoke<PartnerApplicationResult",
    "'gsa-partner-application'",
    "body.append('payload'",
    "callAdminRpc<{ partners?: Partner[] }>('gsa_admin_partners_snapshot')",
    "callAdminRpc<{ partner: Partner }>('gsa_admin_save_partner'",
    "callAdminRpc('gsa_admin_set_partner_status'",
  ]);
  await excludes('src/features/partners/service.ts', [
    ".from('parceiros').insert",
    ".from('parceiros').update",
  ]);

  await contains('src/components/admin/PartnersAdminModule.tsx', [
    'Novo parceiro',
    'Parceiro em destaque',
    'Em análise',
    'Responsável pelo contato',
    'Observações internas',
    'Ativos',
    'Inativos',
    'Encerrados',
    'Excluídos',
  ]);

  await contains('supabase/migrations/20260721110000_create_public_partners.sql', [
    'CREATE TABLE IF NOT EXISTS public.parceiros',
    "USING (status = 'ativo')",
    'ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY',
    'parceiros_public_read_active',
    'gsa_admin_partners_snapshot',
    'gsa_admin_save_partner',
    'gsa_admin_set_partner_status',
    "gsa_admin_assert_module('parceiros')",
    'gsa_admin_write_audit(',
    'REVOKE ALL ON public.parceiros FROM anon, authenticated',
  ]);

  await contains('supabase/migrations/20260722001000_partner_public_applications.sql', [
    'ADD COLUMN IF NOT EXISTS tax_document',
    "ADD COLUMN IF NOT EXISTS application_source text NOT NULL DEFAULT 'admin'",
    'ADD COLUMN IF NOT EXISTS application_protocol',
    'ADD COLUMN IF NOT EXISTS submitted_at',
    'ADD COLUMN IF NOT EXISTS privacy_consent_at',
    'REVOKE SELECT ON TABLE public.parceiros FROM anon, authenticated',
    'GRANT SELECT (',
    "'parceiros-midias'",
    "ARRAY['image/jpeg', 'image/png', 'image/webp']",
    'gsa_enrich_public_partner_application',
    'trg_enrich_public_partner_application',
    'CPF/CNPJ informado:',
    'Consentimento registrado em:',
  ]);

  await contains('supabase/functions/gsa-partner-application/index.ts', [
    "const BUCKET = 'parceiros-midias'",
    "admin.rpc('gsa_auth_rate_limit_check'",
    'validImageSignature',
    "application_source: 'public_form'",
    "status: 'em_analise'",
    'privacy_consent_at: now',
    "internal_notes: 'Solicitação recebida pelo formulário público",
    'Deno.serve(handleRequest)',
  ]);

  await contains('src/components/admin/super-domains/pessoas/PartnerRedemptionDetailModal.tsx', [
    'Ações administrativas ficam exclusivamente dentro deste modal.',
    'Cancelar resgate',
    'Motivo do cancelamento',
    'Excluir definitivamente',
    'deleteConfirmation',
    "atorTipo === 'admin'",
  ]);
  await contains('src/features/partners/service.ts', [
    "'gsa_admin_cancel_partner_redemption'",
    "'gsa_admin_delete_partner_redemption'",
  ]);
  await contains('supabase/migrations/20260831143000_admin_cancel_delete_partner_redemptions.sql', [
    "v_context->>'actor_type' <> 'admin'",
    "status='cancelado'",
    'motivo_cancelamento=v_reason',
    "O resgate precisa ser cancelado com motivo antes da exclusão.",
    "'EXCLUIR_RESGATE'",
    'DELETE FROM public.parceiros_resgates',
    "REVOKE ALL ON FUNCTION public.gsa_admin_delete_partner_redemption",
  ]);

  console.log('Contratos da página e das solicitações públicas de parceiros validados com sucesso.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

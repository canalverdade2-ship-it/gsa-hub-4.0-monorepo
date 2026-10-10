import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function includes(path: string, markers: string[]) {
  const content = await readFile(resolve(root, path), 'utf8');
  for (const marker of markers) {
    assert.ok(content.includes(marker), `${path}: contrato ausente: ${marker}`);
  }
}

await includes('supabase/migrations/20260721194500_prepare_missing_gsa_seguros_base.sql', [
  'ADD COLUMN IF NOT EXISTS idempotency_key uuid',
  'ADD COLUMN IF NOT EXISTS coberturas jsonb',
  'seguros_cotacoes_cliente_id_fkey',
  'seguros_propostas_parceiro_id_fkey',
]);

await includes('supabase/migrations/20260721194600_restore_admin_dashboard_foundation.sql', [
  'gsa_admin_get_pendency_counts_secure',
  'gsa_admin_dashboard_snapshot_pre_ticket_compat',
  "NOTIFY pgrst, 'reload schema'",
  "public.gsa_admin_has_module('emprestimos')",
  "public.gsa_admin_has_module('credito_loja')",
]);

await includes('supabase/migrations/20260721194700_harden_restored_gsa_seguros.sql', [
  'gsa_collaborator_module_',
  'public.gsa_admin_restrict_collaborator_to_module(%L)',
  'seguros_ofertas_publicas',
  'GRANT SELECT ON public.seguros_ofertas_publicas TO anon, authenticated',
]);

await includes('supabase/migrations/20260721194800_restore_admin_search_clients.sql', [
  'gsa_admin_search_clients',
  "public.gsa_admin_assert_module('viagens')",
  'LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25)',
  'GRANT EXECUTE ON FUNCTION public.gsa_admin_search_clients(uuid, text, text, integer) TO authenticated, service_role',
]);

await includes('supabase/migrations/20260721194900_restore_admin_travel_rpcs.sql', [
  'gsa_admin_travel_list',
  'gsa_admin_travel_link_lead',
  'gsa_admin_travel_update_status',
  'gsa_admin_travel_create_proposal',
  'gsa_admin_travel_create_package',
  "IF to_regprocedure('public.gsa_admin_travel_create_package(uuid,text,jsonb)') IS NULL",
  'GRANT EXECUTE ON FUNCTION public.gsa_admin_travel_create_package(uuid, text, jsonb) TO authenticated, service_role',
]);

await includes('supabase/migrations/20260724200000_protection_direct_quote_cleanup.sql', [
  'Somente o GSA Seguros deixa de funcionar como catálogo interno.',
  'gsa_client_seguros_criar_cotacao',
  'DROP VIEW IF EXISTS public.seguros_ofertas_publicas CASCADE',
  'public.gsa_admin_resource_config(p_resource text)',
  "p_payload - ARRAY['request_id', 'consentimento']",
]);

await includes('supabase/migrations/20260724213000_saude_direct_quote_cleanup.sql', [
  'O GSA Saúde passa a operar exclusivamente por solicitação de cotação.',
  'O GSA Viagens permanece integralmente com cadastro e catálogo de pacotes.',
  'gsa_client_saude_criar_cotacao',
  'gsa_catalogo_legado_arquivo',
  'DROP VIEW IF EXISTS public.saude_planos_publicos CASCADE',
  'O cadastro de produtos, planos e seguros foi descontinuado.',
  "p_payload - ARRAY['request_id', 'consentimento']",
]);

await includes('scripts/verify-restored-admin-foundations.sql', [
  'RESTORED_ADMIN_FOUNDATIONS_VERIFIED',
  '20260718121000',
  '20260720183000',
  '20260721194800',
  '20260721194900',
  '20260724200000',
  '20260724213000',
  'gsa_admin_get_pendency_counts_secure(uuid,text)',
  'gsa_admin_search_clients(uuid,text,text,integer)',
  'gsa_admin_travel_create_package(uuid,text,jsonb)',
  'Estruturas obsoletas dos catálogos de Saúde ou Seguros ainda existem',
  'Arquivo histórico do catálogo legado ausente',
]);

console.log('Fundações administrativas, Viagens e cotações diretas de Saúde e Seguros validadas.');

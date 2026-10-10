import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { matchRoute } from '../src/routing/routeMatcher';

const root = process.cwd();

function assertRoute(
  path: string,
  expected: { module: string; submodule?: string; itemId?: string },
) {
  const route = matchRoute(path, '', '');
  assert.equal(route.module, expected.module, `${path}: módulo inesperado`);
  assert.equal(route.submodule, expected.submodule, `${path}: submódulo inesperado`);
  assert.equal(route.itemId, expected.itemId, `${path}: item inesperado`);
}

async function assertFileContains(path: string, patterns: string[]) {
  const content = await readFile(resolve(root, path), 'utf8');
  for (const pattern of patterns) {
    assert.ok(content.includes(pattern), `${path}: contrato ausente: ${pattern}`);
  }
}

async function assertFileDoesNotContain(path: string, patterns: string[]) {
  const content = await readFile(resolve(root, path), 'utf8');
  for (const pattern of patterns) {
    assert.ok(!content.includes(pattern), `${path}: contrato inseguro ainda presente: ${pattern}`);
  }
}

async function main() {
  assertRoute('/marketplace/menu/pacotes-viagem', {
    module: 'pacotes-viagem',
    submodule: 'home',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/ofertas/nacionais', {
    module: 'pacotes-viagem',
    submodule: 'ofertas-nacionais',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/ofertas/pacote-teste', {
    module: 'pacotes-viagem',
    submodule: 'pacote-detalhe',
    itemId: 'pacote-teste',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/orcamento', {
    module: 'pacotes-viagem',
    submodule: 'orcamento',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/minhas-viagens/transacao-1', {
    module: 'pacotes-viagem',
    submodule: 'minhas-viagens',
    itemId: 'transacao-1',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/documentos', {
    module: 'pacotes-viagem',
    submodule: 'documentos',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/cancelamentos', {
    module: 'pacotes-viagem',
    submodule: 'cancelamentos',
  });
  assertRoute('/marketplace/menu/pacotes-viagem/suporte', {
    module: 'pacotes-viagem',
    submodule: 'suporte',
  });

  await assertFileContains(
    'supabase/migrations/20260720110000_gsa_viagens_custom_session_security.sql',
    [
      'gsa_jwt_session_is_valid',
      'gsa_jwt_actor_id',
      'gsa_jwt_actor_type',
      'Cliente ou visitante insere orcamentos',
      'Operacao GSA gerencia',
    ],
  );

  await assertFileContains(
    'supabase/migrations/20260720120000_fix_gsa_viagens_core_flow.sql',
    [
      'gsa_accept_travel_proposal',
      'gsa_client_checkout_travel',
      'gsa_client_session_actor',
      'p_sessao_id UUID',
      'p_session_token TEXT',
      'ADD COLUMN IF NOT EXISTS pacote_id',
      'ADD COLUMN IF NOT EXISTS forma_pagamento',
    ],
  );

  await assertFileContains(
    'supabase/migrations/20260720123000_gsa_viagens_storage_and_quotes.sql',
    [
      "'viagens-documentos'",
      "'viagens-vouchers'",
      'Cliente ou visitante insere orcamentos',
      'gsa_jwt_session_is_valid',
      'gsa_jwt_actor_id',
      'Cliente baixa vouchers de viagem',
      'Operacao GSA gerencia arquivos de viagem',
    ],
  );

  await assertFileContains(
    'supabase/migrations/20260720130000_gsa_viagens_cancelamento_rpc.sql',
    [
      'gsa_request_travel_cancellation',
      'gsa_client_session_actor',
      'p_sessao_id UUID',
      'p_session_token TEXT',
      "'reembolso_em_analise'",
    ],
  );

  await assertFileContains(
    'supabase/migrations/20260720140000_gsa_viagens_hardening.sql',
    [
      'Visitante insere orcamentos',
      'Cliente insere seus orcamentos',
      'quantidade_passageiros',
      'gsa_travel_expected_passengers',
      'Cadastre exatamente % passageiro(s)',
      "transacao.status = 'pendente'",
      'trg_gsa_cleanup_deleted_travel_document_metadata',
      'AFTER DELETE ON storage.objects',
    ],
  );

  await assertFileDoesNotContain(
    'supabase/migrations/20260720140000_gsa_viagens_hardening.sql',
    ['GRANT EXECUTE ON FUNCTION public.gsa_jwt_session_is_valid() TO anon'],
  );

  await assertFileContains(
    'scripts/gsa-viagens-hardening-verify.sql',
    [
      'SET LOCAL ROLE anon',
      'anonymous_quote_rollback_test',
      'passenger_count_contract',
      'post_payment_write_protection',
      'storage_metadata_cleanup_trigger',
    ],
  );

  await assertFileContains(
    'src/components/client/marketplace/MarketplaceGSAStore.tsx',
    [
      'TravelCancellationsPage',
      'TravelSupportPage',
      "currentSubmodule === 'documentos'",
      "currentSubmodule === 'cancelamentos'",
      "currentSubmodule === 'suporte'",
    ],
  );

  await assertFileContains(
    'src/components/client/marketplace/travel/TravelReservationPage.tsx',
    [
      'viagens-documentos',
      'viagens-vouchers',
      'createSignedUrl',
      'quantidade_passageiros',
      'passengerCountComplete',
      'canEditPassengers',
      'canManageDocuments',
      'handleDeletePassenger',
      'O trigger do banco remove o metadado',
      'disabled={!passengerCountComplete}',
    ],
  );

  await assertFileContains(
    'src/components/client/marketplace/travel/TravelProposalsPage.tsx',
    ['callClientRpc', 'gsa_accept_travel_proposal'],
  );

  await assertFileContains(
    'supabase/migrations/20260720230000_gsa_viagens_parcelamento_checkout.sql',
    [
      'parcelas INTEGER NOT NULL DEFAULT 1',
      'valor_parcela NUMERIC(10, 2)',
      "p_payload ->> 'parcelas'",
      "'parcela_numero'",
      "'parcelas_total'",
      'valor_primeira_parcela',
    ],
  );

  await assertFileContains(
    'src/components/client/store/TravelCheckoutModal.tsx',
    [
      'travelInstallments',
      'normalizedTravelInstallments',
      'Parcelamento da viagem',
      'parcelas: normalizedTravelInstallments',
      'Total do contrato',
    ],
  );

  await assertFileContains(
    'supabase/migrations/20260721150000_gsa_viagens_financial_integrity.sql',
    [
      'valor_total_contrato',
      'valor_efetivamente_pago',
      'valor_elegivel_reembolso',
      'pagamento_status',
      'viagens_transacao_parcelas',
      'gsa_travel_operation_requests',
      'gsa_refresh_travel_financial_summary',
      'gsa_sync_travel_invoice_financials',
      'gsa_admin_resolve_travel_cancellation',
      'A decisao de reembolso exige permissao do modulo Financeiro',
      'gsa_travel_previous_status',
      'p_request_id uuid',
    ],
  );

  await assertFileDoesNotContain(
    'supabase/migrations/20260721150000_gsa_viagens_financial_integrity.sql',
    [
      'v_transacao.valor_pago,\n    \'solicitado\'',
      'valor_solicitado = v_transacao.valor_pago',
    ],
  );

  await assertFileContains(
    'supabase/migrations/20260721150100_gsa_viagens_admin_refund_queue.sql',
    [
      'RETURN OLD',
      'RETURN NEW',
      'gsa_admin_travel_cancellation_list',
      'A fila de reembolsos exige permissao do modulo Financeiro',
      'valor_efetivamente_pago',
      'valor_elegivel_reembolso',
    ],
  );

  await assertFileContains(
    'src/components/client/marketplace/travel/TravelCancellationsPage.tsx',
    [
      'ACTIVE_CANCELLATION_STATUSES',
      'p_request_id: requestId',
      'valor_total_contrato',
      'valor_efetivamente_pago',
      'valor_elegivel_reembolso',
      'faturas_suspensas',
      'Valor máximo atualmente elegível',
    ],
  );

  await assertFileContains(
    'src/components/client/marketplace/travel/MyTripsPage.tsx',
    [
      'valor_total_contrato',
      'valor_efetivamente_pago',
      'valor_em_aberto',
      'paymentStatusConfig',
      'Total contratado',
      'Efetivamente pago',
    ],
  );

  console.log('GSA Viagens: rotas, segurança, financeiro e contratos críticos validados com sucesso.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

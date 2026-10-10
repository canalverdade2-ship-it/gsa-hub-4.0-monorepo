import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  adminModulePath,
  canAccessAdminModule,
  normalizeAdminModule,
  normalizeGrantedAdminModules,
} from '../src/routing/adminAccess';
import { defaultAdminPath } from '../src/security/collaboratorAccess';
import { matchRoute } from '../src/routing/routeMatcher';
import { routes } from '../src/routing/routeCatalog';

const root = process.cwd();

async function assertFileContains(path: string, patterns: string[]) {
  const content = await readFile(resolve(root, path), 'utf8');
  for (const pattern of patterns) {
    assert.ok(content.includes(pattern), `${path}: contrato ausente: ${pattern}`);
  }
}

async function assertFileExcludes(path: string, patterns: string[]) {
  const content = await readFile(resolve(root, path), 'utf8');
  for (const pattern of patterns) {
    assert.ok(!content.includes(pattern), `${path}: padrão inseguro ainda presente: ${pattern}`);
  }
}

async function main() {
  assert.equal(normalizeAdminModule('tickets'), 'atendimento');
  assert.equal(normalizeAdminModule('cobranca'), 'cobranca');
  assert.equal(normalizeAdminModule('fiscal'), 'fiscal');
  assert.equal(normalizeAdminModule('clientes'), 'cadastro');
  assert.equal(normalizeAdminModule('prestadores'), 'prestadores');
  assert.equal(normalizeAdminModule('emprestimos'), 'emprestimos');
  assert.equal(normalizeAdminModule('credito_loja'), 'credito_loja');
  assert.deepEqual(normalizeGrantedAdminModules(['clientes', 'vendas', 'tickets', 'viagens']), ['cadastro', 'operacoes', 'atendimento', 'viagens']);
  assert.deepEqual(normalizeGrantedAdminModules(['acessos']), []);

  assert.equal(canAccessAdminModule('admin', [], 'financeiro'), true);
  assert.equal(canAccessAdminModule('colaborador', [], 'dashboard'), true);
  assert.equal(canAccessAdminModule('colaborador', ['acessos'], 'acessos'), false);
  assert.equal(canAccessAdminModule('colaborador', [], 'demandas'), false);
  assert.equal(canAccessAdminModule('colaborador', ['demandas'], 'demandas'), true);
  assert.equal(canAccessAdminModule('colaborador', ['demandas'], 'operacoes'), false);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'operacoes'), true);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'demandas'), false);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'loja'), false);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'classificados'), false);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'viagens'), false);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'saude'), false);
  assert.equal(canAccessAdminModule('colaborador', ['vendas'], 'seguros'), false);
  assert.equal(canAccessAdminModule('colaborador', ['viagens'], 'viagens'), true);
  assert.equal(canAccessAdminModule('colaborador', ['financeiro'], 'financeiro'), true);
  assert.equal(canAccessAdminModule('colaborador', ['financeiro'], 'cobranca'), false);
  assert.equal(canAccessAdminModule('colaborador', ['financeiro'], 'emprestimos'), false);
  assert.equal(canAccessAdminModule('colaborador', ['financeiro'], 'credito_loja'), false);
  assert.equal(canAccessAdminModule('colaborador', ['cobranca'], 'cobranca'), true);
  assert.equal(canAccessAdminModule('colaborador', ['cobranca'], 'financeiro'), false);
  assert.equal(canAccessAdminModule('colaborador', ['emprestimos'], 'emprestimos'), true);
  assert.equal(canAccessAdminModule('colaborador', ['credito_loja'], 'credito_loja'), true);
  assert.equal(canAccessAdminModule('colaborador', ['prestadores'], 'prestadores'), true);
  assert.equal(canAccessAdminModule('colaborador', ['prestadores'], 'cadastro', 'clientes'), false);
  assert.equal(canAccessAdminModule('colaborador', ['prestadores'], 'cadastro', 'prestadores'), true);

  assert.equal(adminModulePath('dashboard'), '/admin/dashboard');
  assert.equal(adminModulePath('cadastro', 'clientes'), '/admin/cadastros/clientes');
  assert.equal(adminModulePath('prestadores'), '/admin/cadastros/prestadores');
  assert.equal(adminModulePath('demandas'), '/admin/demandas');
  assert.equal(adminModulePath('cobranca'), '/admin/cobranca');
  assert.equal(adminModulePath('fiscal'), '/admin/fiscal');
  assert.equal(adminModulePath('viagens'), '/admin/viagens');
  assert.equal(adminModulePath('emprestimos'), '/admin/financeiro/emprestimos');
  assert.equal(adminModulePath('credito_loja'), '/admin/financeiro/credito');
  assert.equal(adminModulePath('financeiro', 'faturas', 'abc'), '/admin/financeiro/faturas/abc');
  assert.equal(defaultAdminPath('colaborador', ['prestadores']), '/admin/cadastros/prestadores');
  assert.equal(defaultAdminPath('colaborador', ['emprestimos']), '/admin/financeiro/emprestimos');
  assert.equal(defaultAdminPath('colaborador', ['credito_loja']), '/admin/financeiro/credito');
  assert.equal(defaultAdminPath('colaborador', ['promocoes']), '/admin/promocoes');

  const loanRoute = matchRoute('/admin/financeiro/emprestimos/loan-1', '', '');
  assert.equal(loanRoute.module, 'emprestimos');
  assert.equal(loanRoute.itemId, 'loan-1');
  const creditRoute = matchRoute('/admin/financeiro/credito/credit-1', '', '');
  assert.equal(creditRoute.module, 'credito_loja');
  assert.equal(creditRoute.itemId, 'credit-1');
  assert.equal(routes.admin.categories(), '/admin/loja/categorias_loja');
  assert.equal(routes.admin.ordensServico(), '/admin/operacoes/os');
  assert.equal(routes.admin.ordensCompra(), '/admin/operacoes/produtos');
  assert.equal(routes.admin.ordensAssinatura(), '/admin/operacoes/assinaturas');
  assert.equal(routes.admin.emprestimos(), '/admin/financeiro/emprestimos');
  assert.equal(routes.admin.creditoLoja(), '/admin/financeiro/credito');

  await assertFileContains('package.json', [
    '"validate:subscriptions"',
    '"test:travel"',
    '"test:admin"',
    '"test:client-security"',
    '"test:provider"',
    '"test:products-subscriptions"',
    'scripts/run-admin-migrations-runtime.cjs',
    'scripts/check-collaborator-boundaries-runtime.cjs',
  ]);

  await assertFileContains('src/App.tsx', [
    'SecureAdminPanel',
    'defaultAdminPath',
    'isRouteAllowed(route.area, session, route.module, route.submodule)',
  ]);
  await assertFileExcludes('src/App.tsx', [
    "localStorage.setItem('adminType'",
    "localStorage.setItem('colaboradorId'",
    "localStorage.setItem('colaboradorNome'",
    "localStorage.setItem('colaboradorModulos'",
  ]);

  await assertFileContains('src/pages/SecureAdminPanel.tsx', [
    'hasAdminModuleAccess',
    "callAdminRpc<SecureAdminContext>('gsa_admin_get_context_secure')",
    "await revoke('Sua sessão ou suas permissões não puderam ser validadas. Entre novamente.')",
    'setModules([])',
    "table: 'colaborador_modulos'",
    "sessionStorage.setItem('colaboradorModulos'",
    "localStorage.removeItem(key)",
  ]);
  await assertFileExcludes('src/pages/SecureAdminPanel.tsx', [
    "localStorage.setItem('adminType'",
    "localStorage.setItem('colaboradorId'",
    "localStorage.setItem('colaboradorNome'",
    "localStorage.setItem('colaboradorModulos'",
    ".from('colaboradores')",
    'if (!current)',
  ]);

  await assertFileContains('src/pages/AdminPanel.tsx', [
    'CollaboratorDashboard',
    'hasAdminModuleAccess',
    "id: 'demandas'",
    "id: 'cobranca'",
    "id: 'fiscal'",
    "id: 'emprestimos'",
    "id: 'credito_loja'",
    "id: 'promocoes'",
    "id: 'area_vip'",
    "allowedTabs={['emprestimos']}",
    "allowedTabs={['credito']}",
    "canAccess('cadastro') || canAccess('prestadores')",
    'Você não possui permissão para acessar este módulo.',
  ]);

  await assertFileContains('src/components/admin/AcessosModule.tsx', [
    'gsa_admin_access_snapshot',
    'gsa_admin_save_collaborator',
    'gsa_admin_set_collaborator_status',
    'gsa_admin_rotate_collaborator_credential',
    'gsa_admin_review_deletion_request',
    "['prestadores', 'Prestadores (sem acesso a clientes)']",
  ]);
  await assertFileExcludes('src/components/admin/AcessosModule.tsx', [
    "from('colaborador_modulos')",
    'credencial_acesso',
    "['acessos', 'Gerenciar acessos']",
  ]);

  await assertFileContains('src/components/admin/ClassifiedsModule.tsx', [
    'gsa_admin_list_resource',
    'gsa_admin_classified_action',
    'PAGE_SIZE',
  ]);

  await assertFileContains('src/components/admin/ProtectionAdminModule.tsx', [
    'gsa_admin_list_resource',
    'gsa_admin_save_protection_entity',
    'gsa_admin_create_protection_proposal',
  ]);

  await assertFileContains('src/components/admin/FiscalModule.tsx', [
    "scope: 'fiscal'",
    'gsa_admin_fiscal_update',
    'SecureAttachmentButton',
    'removePrivateDocument',
  ]);
  await assertFileExcludes('src/components/admin/FiscalModule.tsx', [
    'getPublicUrl',
    'document.write',
    '.delete()',
  ]);

  await assertFileContains('src/components/admin/ConfiguracoesModule.tsx', [
    'gsa_admin_settings_snapshot',
    'gsa_admin_update_settings_secure',
    'gsa_admin_save_company',
    'gsa_admin_save_payment_method',
  ]);

  await assertFileContains('src/components/admin/SystemMonitorModule.tsx', [
    'gsa_admin_system_snapshot',
    'Visão somente leitura',
  ]);

  await assertFileContains('src/components/admin/RelatoriosModule.tsx', [
    'normalizeGrantedAdminModules',
    "requiredModules: ['cobranca']",
    "requiredModules: ['fiscal']",
    "requiredModules: ['emprestimos']",
  ]);

  await assertFileContains('src/hooks/useAdminNotifications.tsx', [
    'gsa_admin_get_pendency_counts_secure',
    'gsa_admin_list_notifications',
    'gsa_admin_set_notification_state',
    'gsa_admin_mark_all_notifications',
  ]);

  await assertFileContains('src/components/admin/CollaboratorDashboard.tsx', [
    'normalizeGrantedAdminModules',
    "gsa_collaborator_dashboard_snapshot",
    "has('financeiro')",
    "has('demandas')",
    "has('operacoes')",
    "has('atendimento')",
    "has('emprestimos')",
  ]);
  await assertFileExcludes('src/components/admin/CollaboratorDashboard.tsx', [
    ".from('clientes')",
    ".from('emprestimos')",
    "has('vendas')",
    "has('tickets')",
    "has('acessos')",
  ]);

  await assertFileContains('src/components/admin/Dashboard.tsx', [
    "import type React from 'react';",
    'key?: React.Key;',
    'gsa_admin_dashboard_snapshot',
    'Faturamento dos últimos 6 meses',
    'credito_pendente_total',
    '60_000',
  ]);

  await assertFileContains('src/components/admin/CadastroModule.tsx', [
    "initialTab === 'categorias'",
  ]);

  await assertFileContains('src/components/admin/VendasModule.tsx', [
    "'ordens-servico': 'os'",
    "'ordens-compra': 'produtos'",
    "'ordens-assinatura': 'assinaturas'",
    "'credito-loja': 'credito'",
  ]);

  await assertFileContains('src/components/client/marketplace/MarketplaceGSAStore.tsx', [
    'navigate(path);',
  ]);
  await assertFileExcludes('src/components/client/marketplace/MarketplaceGSAStore.tsx', [
    'onNavigate(moduleName',
    'tabName = segments[2]',
  ]);

  await assertFileContains('src/pages/ClientPortal.tsx', [
    'if (replaceFlag) replace(path);',
  ]);

  await assertFileContains('src/components/admin/TravelAdminModule.tsx', [
    "import type React from 'react';",
    'gsa_admin_travel_list',
    'gsa_admin_travel_create_proposal',
    'gsa_admin_travel_create_package',
    'gsa_admin_search_clients',
    'PAGE_SIZE',
  ]);

  await assertFileContains('supabase/migrations/20260720183000_harden_admin_panel.sql', [
    'gsa_admin_context',
    'gsa_admin_has_module',
    'gsa_admin_notification_state',
    'gsa_admin_dashboard_snapshot',
    'gsa_admin_travel_create_proposal',
    'FOR UPDATE',
    'gsa_admin_audit_events',
  ]);

  await assertFileContains('supabase/migrations/20260720213000_secure_collaborator_panel.sql', [
    'gsa_admin_replace_collaborator_modules',
    "v_status <> 'ativo'",
    "WHEN 'demandas' THEN ARRAY['demandas']",
    "WHEN 'cobranca' THEN ARRAY['cobranca']",
    "WHEN 'fiscal' THEN ARRAY['fiscal']",
    'collaborator_assigned_demands_only',
    'gsa_close_collaborator_sessions',
  ]);

  await assertFileContains('supabase/migrations/20260720235500_admin_secure_operations.sql', [
    'gsa_admin_save_collaborator',
    'gsa_admin_review_deletion_request',
    'gsa_admin_create_protection_proposal',
    'gsa_admin_system_snapshot',
    'FOR UPDATE',
  ]);

  await assertFileContains('supabase/migrations/20260721000500_admin_module_rls_boundaries.sql', [
    'AS RESTRICTIVE',
    'gsa_admin_restrict_collaborator_to_module',
    'gsa_enforce_admin_log_identity',
  ]);

  await assertFileContains('supabase/migrations/20260721001500_private_admin_documents.sql', [
    "'gsa-private-documents'",
    'gsa_admin_private_document_allowed',
    'gsa_private_document_read_allowed',
    'public = false',
  ]);

  await assertFileContains('supabase/migrations/20260721002500_secure_admin_settings.sql', [
    'gsa_admin_allowed_setting_keys',
    'gsa_admin_settings_snapshot',
    'gsa_admin_update_settings_secure',
  ]);

  await assertFileContains('supabase/migrations/20260721003000_hash_collaborator_credentials.sql', [
    'gsa_login_colaborador_legacy',
    'crypt(v_code, c.credencial_hash)',
    'initial_credential',
  ]);

  await assertFileContains('supabase/migrations/20260721003800_admin_session_token_validation_compat.sql', [
    'session_token_hash',
    "digest(p_session_token, 'sha256')",
    'gsa_admin_validate_context',
  ]);

  await assertFileContains('supabase/migrations/20260721130000_harden_collaborator_authorization.sql', [
    'gsa_block_collaborator_access_module',
    'gsa_collaborator_dashboard_snapshot',
    'gsa_collaborator_list_demands',
    'gsa_collaborator_demand_history',
    'gsa_collaborator_demand_history_scope',
  ]);

  console.log('Painel administrativo e painel do colaborador: contratos de segurança e operação validados.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

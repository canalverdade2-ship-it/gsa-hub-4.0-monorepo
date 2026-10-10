import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canAccessAdminModule,
  normalizeGrantedAdminModules,
} from '../src/routing/adminAccess';

const root = process.cwd();

// Regressões permanentes das fronteiras de autorização do colaborador.
async function content(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

async function includes(path: string, patterns: string[]) {
  const source = await content(path);
  for (const pattern of patterns) {
    assert.ok(source.includes(pattern), `${path}: contrato ausente: ${pattern}`);
  }
}

async function excludes(path: string, patterns: string[]) {
  const source = await content(path);
  for (const pattern of patterns) {
    assert.ok(!source.includes(pattern), `${path}: padrão inseguro presente: ${pattern}`);
  }
}

async function main() {
  assert.deepEqual(normalizeGrantedAdminModules(['vendas', 'tickets', 'acessos']), ['operacoes', 'atendimento']);
  assert.equal(canAccessAdminModule('colaborador', ['acessos'], 'acessos'), false);
  assert.equal(canAccessAdminModule('colaborador', ['prestadores'], 'cadastro', 'clientes'), false);
  assert.equal(canAccessAdminModule('colaborador', ['prestadores'], 'cadastro', 'prestadores'), true);
  assert.equal(canAccessAdminModule('colaborador', ['prestadores'], 'prestadores'), true);
  assert.equal(canAccessAdminModule('colaborador', ['demandas'], 'operacoes'), false);
  assert.equal(canAccessAdminModule('colaborador', ['demandas'], 'demandas'), true);
  assert.equal(canAccessAdminModule('colaborador', ['financeiro'], 'emprestimos'), false);
  assert.equal(canAccessAdminModule('colaborador', ['emprestimos'], 'emprestimos'), true);

  await includes('src/pages/SecureAdminPanel.tsx', [
    "callAdminRpc<SecureAdminContext>('gsa_admin_get_context_secure')",
    "await revoke('Sua sessão ou suas permissões não puderam ser validadas. Entre novamente.')",
    'setModules([])',
  ]);
  await excludes('src/pages/SecureAdminPanel.tsx', [
    ".from('colaboradores')",
    'if (!current)',
  ]);

  await includes('src/components/admin/CollaboratorDashboard.tsx', [
    "callAdminRpc<CollaboratorDashboardSnapshot>('gsa_collaborator_dashboard_snapshot')",
    "has('operacoes')",
    "has('atendimento')",
    "has('emprestimos')",
  ]);
  await excludes('src/components/admin/CollaboratorDashboard.tsx', [
    ".from('clientes')",
    ".from('emprestimos')",
    "has('vendas')",
    "has('tickets')",
    "has('acessos')",
  ]);

  await includes('src/components/admin/DemandasColaboradorModule.tsx', [
    "callAdminRpc<any[]>('gsa_collaborator_list_demands')",
    "callAdminRpc<any[]>('gsa_collaborator_demand_history'",
    "if (!isAdmin)",
    'clientes(id, nome)',
  ]);
  await excludes('src/components/admin/DemandasColaboradorModule.tsx', [
    'clientes(nome, telefone)',
    'ordens_servico(*',
  ]);

  await includes('supabase/migrations/20260721130000_harden_collaborator_authorization.sql', [
    "IF v_requested = 'acessos'",
    "WHEN 'cadastro' THEN ARRAY['cadastro', 'cadastros', 'clientes']",
    "WHEN 'prestadores' THEN ARRAY['prestadores', 'cadastro', 'cadastros']",
    "WHEN 'operacoes' THEN ARRAY['operacoes', 'vendas']",
    "WHEN 'demandas' THEN ARRAY['demandas']",
    'gsa_block_collaborator_access_module',
    'gsa_collaborator_demand_history_scope',
    'gsa_collaborator_dashboard_snapshot',
    'gsa_collaborator_list_demands',
    'gsa_collaborator_demand_history',
    "WHEN 'prestador_demandas_historico' THEN 'demandas'",
    'gsa_admin_validate_context(p_sessao_id, p_session_token)',
  ]);

  console.log('Contratos do Painel do Colaborador: menor privilégio, sessão fechada, RPCs mínimas e fronteiras exatas validados.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

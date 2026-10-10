import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', 'playwright-report', 'test-results']);
const textExtensions = new Set([
  '.cjs', '.js', '.mjs', '.ts', '.tsx', '.json', '.sql', '.md', '.yml', '.yaml', '.env', '.example', '.txt',
]);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(relativePath: string, expected: string[]): void {
  const content = read(relativePath);
  for (const value of expected) {
    if (!content.includes(value)) {
      throw new Error(`${relativePath}: contrato ausente: ${value}`);
    }
  }
}

function walk(directory: string, output: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, output);
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (textExtensions.has(extension) || entry.name.startsWith('.env')) output.push(absolutePath);
  }
  return output;
}

const leakedConnectionFiles: string[] = [];
const publicSqlExecutorFiles: string[] = [];

for (const absolutePath of walk(root)) {
  const relativePath = path.relative(root, absolutePath);
  const content = fs.readFileSync(absolutePath, 'utf8');

  if (/postgresql:\/\/postgres:[^\s"']+@/i.test(content)) {
    leakedConnectionFiles.push(relativePath);
  }

  if (/\.rpc\(\s*['"]execute_sql['"]/i.test(content)) {
    publicSqlExecutorFiles.push(relativePath);
  }
}

if (leakedConnectionFiles.length > 0) {
  throw new Error(`Conexão PostgreSQL com senha embutida encontrada em: ${leakedConnectionFiles.join(', ')}`);
}

if (publicSqlExecutorFiles.length > 0) {
  throw new Error(`Uso frontend de execute_sql encontrado em: ${publicSqlExecutorFiles.join(', ')}`);
}

assertContains('apply_pg_migration.cjs', [
  'process.env.SUPABASE_DB_URL',
  'SUPABASE_DB_URL não configurada',
]);

assertContains('src/lib/logService.ts', [
  "import { sessionService } from './sessionService'",
  'sessionService.getCurrentSession()',
]);

assertContains('src/hooks/useAutoLogout.ts', [
  'Promise.resolve(onLogout())',
  'evitando duas chamadas concorrentes',
]);

assertContains('src/lib/clientOperationalWrite.ts', [
  "sessionData.atorTipo !== 'cliente'",
  'void clienteId',
]);


assertContains('supabase/migrations/20260720200600_secure_client_portal_critical_flows.sql', [
  "p.proname = 'execute_sql'",
  'gsa_client_process_scheduled_credit_release',
]);

assertContains('supabase/migrations/20260720201000_schedule_and_guard_store_credit_release.sql', [
  'gsa_process_due_store_credit_releases',
  'gsa_guard_client_credit_limits',
  'cron.schedule',
]);

assertContains('supabase/migrations/20260720201100_compat_secure_legacy_credit_release.sql', [
  'gsa_guard_client_credit_limits',
  'gsa_guard_duplicate_client_credit_movement',
  'gsa_guard_duplicate_client_credit_notification',
]);

assertContains('supabase/migrations/20260720202000_revoke_client_sessions_on_access_change.sql', [
  'gsa_revoke_client_sessions_on_access_change',
  "SET status = 'encerrado'",
  "to_jsonb(NEW) ->> 'bloqueado'",
]);

assertContains('supabase/migrations/20260720203000_private_client_documents_storage.sql', [
  "SET public = false",
  'GSA acessa documentos privados do cliente',
  "string_to_array(name, '/')",
]);

assertContains('supabase/migrations/20260720204000_harden_client_operational_permissions.sql', [
  "p.proname = 'cliente_operational_write'",
  'gsa_guard_client_notification_insert',
  'GRANT EXECUTE ON FUNCTION',
]);

assertContains('supabase/migrations/20260720205000_optional_client_block_state_compat.sql', [
  'gsa_client_record_is_blocked',
  'gsa_release_due_store_credit_for_client',
  'to_jsonb(v_cliente)',
  'to_jsonb(OLD)',
]);

console.log('Contratos críticos de segurança do painel do cliente validados.');


assertContains('supabase/functions/gsa-auth-session/index.ts', [
  'request_client_recovery',
  'complete_client_recovery',
  'request_client_first_access',
  'complete_client_first_access',
  'signInWithOtp',
  'gsa_complete_client_recovery',
  'gsa_complete_client_first_access',
  'recovery_verification_required',
]);

assertContains('supabase/migrations/20260720232000_harden_client_portal_audit_findings.sql', [
  'gsa_begin_client_recovery',
  'gsa_client_operational_write',
  'gsa_client_mark_notification_read',
  'gsa_guard_duplicate_active_client_ticket',
  'file_size_limit = 10485760',
  "split_part(name, '/', 2)",
]);

assertContains('src/pages/ClientPortal.tsx', [
  "callClientRpc<{ released?: number }>('gsa_client_process_scheduled_credit_release')",
  "['bloqueado', 'inativo', 'excluido']",
  'restrictedModules',
]);

assertContains('src/hooks/useClientNotifications.tsx', [
  'sessionService.endSession()',
  'gsa_client_mark_notification_read',
  'gsa_client_get_notification_read_ids',
  'document.visibilityState',
]);

const clientPortal = read('src/pages/ClientPortal.tsx');
if (/const verificarLiberacaoCreditoAgendada[\s\S]*?\.from\(['"]clientes['"]\)/.test(clientPortal)) {
  throw new Error('ClientPortal ainda altera limites financeiros diretamente no navegador.');
}
if (clientPortal.includes('&& !isVip')) {
  throw new Error('Cliente VIP ainda ignora o bloqueio administrativo.');
}

const recoveryUi = read('src/components/auth/ClientAccessModal.tsx');
if (recoveryUi.includes('loginRecuperacaoSenha')) {
  throw new Error('Fluxo inseguro de recuperação direta ainda está ativo.');
}

const operationalUsage = new Set<string>();
for (const absolutePath of walk(path.join(root, 'src'))) {
  const content = fs.readFileSync(absolutePath, 'utf8');
  const regex = /clientOperationalWrite(?:<[^>]+>)?\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(regex)) operationalUsage.add(match[1]);
}
const allowedOperationalTables = new Set([
  'clientes', 'tickets', 'ticket_mensagens', 'cliente_documentos',
  'loja_credito_solicitacoes', 'loja_credito_documentos',
  'emprestimos', 'emprestimo_comentarios', 'emprestimo_documentos',
  'emprestimo_historico', 'orcamentos', 'ordens_servico', 'os_notas',
  'os_suporte_mensagens', 'cliente_promocoes', 'vouchers', 'indicacoes',
  'loja_carrinhos', 'loja_favoritos', 'cupons_ativados', 'loja_avaliacoes',
  'loja_solicitacoes', 'cliente_premios', 'promocoes_quantidade_ativadas',
  'fatura_contestacoes',
]);
const unsupportedOperationalTables = [...operationalUsage].filter((table) => !allowedOperationalTables.has(table));
if (unsupportedOperationalTables.length > 0) {
  throw new Error(`clientOperationalWrite usa tabelas ainda não auditadas: ${unsupportedOperationalTables.join(', ')}`);
}


assertContains('supabase/migrations/20260720232000_harden_client_portal_audit_findings.sql', [
  'Tabela sem política operacional específica',
  "v_table IN ('os_notas', 'os_suporte_mensagens')",
  "v_table IN ('emprestimo_documentos', 'emprestimo_historico')",
  "v_table = 'fatura_contestacoes'",
  "v_table = 'loja_avaliacoes'",
  "v_table = 'cliente_premios'",
  "RETURN public.cliente_operational_write(v_cliente_id, v_table, v_action, v_data, v_filter)",
]);

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

async function file(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

async function includes(path: string, patterns: string[]) {
  const content = await file(path);
  for (const pattern of patterns) {
    assert.ok(content.includes(pattern), `${path}: contrato ausente: ${pattern}`);
  }
}

async function excludes(path: string, patterns: string[]) {
  const content = await file(path);
  for (const pattern of patterns) {
    assert.ok(!content.includes(pattern), `${path}: padrão inseguro ainda presente: ${pattern}`);
  }
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) results.push(...await collectSourceFiles(relativePath));
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(relativePath);
  }
  return results;
}

async function assertProviderUiHasNoDirectDatabaseMutation() {
  const paths = [
    ...await collectSourceFiles('src/components/prestador'),
    ...await collectSourceFiles('src/pages/Prestador'),
  ];
  const mutationPattern = /\.from\s*\([^)]*\)\s*\.\s*(insert|update|upsert|delete)\s*\(/s;

  for (const path of paths) {
    const content = await file(path);
    const match = content.match(mutationPattern);
    assert.ok(!match, `${path}: mutação direta no banco detectada: ${match?.[1] || 'desconhecida'}`);
    assert.ok(!content.includes('.getPublicUrl('), `${path}: URL pública de Storage detectada no portal privado.`);
  }
}

async function main() {
  await includes('supabase/migrations/20260720232900_provider_portal_admin_module_compat.sql', [
    'gsa_admin_has_module',
    "v_actor_type = 'admin'",
    "v_actor_type <> 'colaborador'",
    "WHEN 'cadastro' THEN ARRAY['cadastro', 'prestadores', 'clientes']",
    "WHEN 'operacoes' THEN ARRAY['operacoes', 'vendas', 'demandas']",
    "WHEN 'atendimento' THEN ARRAY['atendimento', 'tickets', 'suporte']",
  ]);

  await includes('supabase/migrations/20260720233000_provider_portal_audit_hardening.sql', [
    'gsa_provider_context',
    "p_require_active AND COALESCE(v_provider.status, '') <> 'ativo'",
    'gsa_guard_provider_direct_write',
    'gsa_provider_create_ticket',
    'gsa_provider_send_ticket_message',
    'gsa_provider_request_demand_support',
    'pg_advisory_xact_lock',
    "NEW.link_resultado !~* '^https?://'",
    'v_promotion.data_inicio > current_date',
    "public.gsa_admin_has_module('operacoes')",
    "public.gsa_admin_has_module('atendimento')",
    'gsa_provider_audit_events',
  ]);

  await includes('supabase/migrations/20260720233100_provider_portal_secure_snapshots.sql', [
    'gsa_provider_pendency_snapshot',
    'moduleDemandasAbertas',
  ]);

  await includes('supabase/migrations/20260720233200_provider_portal_final_guards.sql', [
    'public.sistema_sessoes',
    "to_jsonb(s) ->> 'gsa_session_id'",
    'ALTER FUNCTION public.gsa_provider_dashboard_snapshot() VOLATILE',
    'ALTER FUNCTION public.gsa_provider_pendency_snapshot() VOLATILE',
    'trg_guard_provider_direct_prestadores',
    'gsa_revoke_provider_sessions_on_access_change',
  ]);

  await includes('supabase/migrations/20260721170000_provider_portal_production_finalization.sql', [
    'gsa_provider_session_access_state',
    'REVOKE ALL ON FUNCTION public.gsa_provider_insert_admin_notification',
    'REVOKE ALL ON FUNCTION public.gsa_provider_write_audit',
    'FROM PUBLIC, anon, authenticated',
    'GRANT EXECUTE ON FUNCTION public.gsa_provider_dashboard_snapshot() TO authenticated',
    'REVOKE ALL ON TABLE public.gsa_provider_audit_events FROM PUBLIC, anon, authenticated',
    "WHERE id IN ('documentos_prestador', 'entregas_demandas')",
  ]);

  await includes('src/lib/providerOperations.ts', [
    'gsa_provider_financial_snapshot',
    'gsa_provider_dashboard_snapshot',
    'gsa_provider_pendency_snapshot',
    'gsa_provider_request_withdrawal',
    'gsa_provider_cancel_withdrawal',
    'gsa_provider_redeem_voucher',
    'gsa_provider_redeem_prize',
    'gsa_provider_activate_promotion',
    'gsa_provider_update_profile',
    'gsa_provider_create_schedule',
    'gsa_provider_complete_schedule',
    'gsa_provider_delete_schedule',
    'gsa_provider_submit_document',
    'gsa_provider_transition_demand',
    'gsa_provider_create_ticket',
    'gsa_provider_send_ticket_message',
    'gsa_provider_request_profile_change',
    'gsa_provider_request_demand_support',
  ]);

  await assertProviderUiHasNoDirectDatabaseMutation();

  await includes('src/lib/providerStorage.ts', [
    'PRIVATE_BUCKETS.has(bucket)',
    'normalizeProviderStoragePath',
    "normalized.includes('..')",
    "normalized.includes('//')",
    'UUID_PATTERN.test(providerId)',
    'Math.min(Math.max(expiresInSeconds, 30), 900)',
    "if (!file.type || !allowed.includes(file.type) || !allowedExtensions.has(extension))",
    'file.size <= 0',
  ]);

  await includes('src/hooks/useProviderNotifications.tsx', [
    'const HEARTBEAT_INTERVAL_MS = 60_000;',
    'providerOperations.pendencySnapshot',
    'destinatario_tipo=in.(broadcast_prestadores,broadcast_todos)',
    'provider-scoped-${prestadorId}',
  ]);

  await includes('src/lib/sessionService.ts', [
    "const SESSION_STORAGE_KEY = '_gsa_session';",
    'appMetadata.gsa_session_id !== sessaoId',
    'appMetadata.gsa_actor_type !== atorTipo',
    'appMetadata.gsa_actor_id !== atorId',
    "async loginWithPin(documento: string, pin: string, tipo: 'cliente' | 'prestador' | 'fornecedor')",
    "rpc('gsa_validate_session'",
    "await supabase.auth.signOut({ scope: 'local' })",
  ]);

  await includes('src/lib/supabase.ts', [
    'storage: sessionStorageAdapter',
    'persistSession: true',
    "flowType: 'pkce'",
    'clearLegacySupabaseLocalStorage',
  ]);

  await includes('src/App.tsx', [
    "const PrestadorDashboard = lazy(() => import('./pages/Prestador/PrestadorDashboard')",
    "restored.atorTipo === 'prestador'",
    "readSafeReturnTo(window.location.search, ['/prestador'])",
    '<ProviderNotificationProvider prestadorId={session.prestadorId}>',
  ]);

  await includes('src/routing/routeSecurity.ts', [
    "if (area === 'provider') return module === 'home' || Boolean(session.prestadorId);",
  ]);

  await includes('supabase/migrations/20260830123000_provider_registration_otp_and_authorization_hardening.sql', [
    'gsa_provider_registration_challenges',
    'gsa_verify_provider_registration_challenge',
    'p_verification_token text',
    "'pendente', extensions.crypt(v_pin",
    'public.gsa_provider_context(true)',
    'gsa_normalize_provider_pix_key',
    'gsa_is_safe_provider_result_url',
    "arquivos_resultado=coalesce(arquivos_resultado,'[]'::jsonb)||v_files",
    'DROP FUNCTION IF EXISTS public.gsa_public_register_provider(jsonb)',
    "p.proname LIKE 'gsa_provider_%'",
  ]);

  await includes('supabase/functions/gsa-auth-session/index.ts', [
    "'request_provider_registration_code'",
    "'verify_provider_registration_code'",
    'sendWhatsAppMessage(normalizedPayload.telefone',
    "admin.rpc('gsa_verify_provider_registration_challenge'",
  ]);

  await includes('src/components/auth/WhatsAppPinVerification.tsx', [
    'secureProviderRegistration',
    "action: 'request_provider_registration_code'",
    "action: 'verify_provider_registration_code'",
    'data?.verification_token',
  ]);

  await includes('src/pages/ProviderAccessPage.tsx', [
    'registrationVerificationToken',
    'p_verification_token: registrationVerificationToken',
    'secureProviderRegistration',
    'Cadastro enviado para análise',
  ]);

  await includes('src/components/admin/AcessosModule.tsx', [
    "['cadastro', 'Cadastros (clientes e prestadores)']",
    "['prestadores', 'Prestadores (sem acesso a clientes)']",
  ]);

  await includes('src/pages/AdminPanel.tsx', [
    "const providerOnly = normalized === 'cadastro' && !canAccess('cadastro') && canAccess('prestadores');",
    "const targetModule = providerOnly ? 'prestadores' : module;",
    "item.id === 'cadastro' ? canAccess('cadastro') || canAccess('prestadores') : canAccess(item.id)",
  ]);

  await includes('.github/workflows/provider-portal-validation.yml', [
    "branches: [main]",
    "- 'src/lib/sessionService.ts'",
    "- 'src/lib/supabase.ts'",
    "- 'src/routing/**'",
    "- 'supabase/functions/gsa-auth-session/**'",
    'npm run test:provider',
    'npm run build',
  ]);

  await includes('.github/workflows/provider-production-validation.yml', [
    'Provider Production Validation',
    '20260721170000_provider_portal_production_finalization.sql',
    'provider-production-verification.sql',
    'PROVIDER_PRODUCTION_VERIFIED',
  ]);

  await includes('scripts/provider-production-verification.sql', [
    'BEGIN TRANSACTION READ ONLY',
    '20260720232900',
    '20260720233000',
    '20260720233100',
    '20260720233200',
    '20260721170000',
    "has_function_privilege('anon'",
    "has_function_privilege('authenticated'",
    'trg_guard_provider_direct_',
    'PROVIDER_PRODUCTION_VERIFIED',
  ]);

  await excludes('src/pages/Prestador/PrestadorDashboard.tsx', [
    ".from('tickets').insert",
    'createNotification(null',
  ]);
  await excludes('src/components/prestador/PrestadorSuporte.tsx', [
    ".from('ticket_mensagens').insert",
    ".from('tickets').insert",
    'notificationService.notifyAdmin',
  ]);
  await excludes('src/components/prestador/PrestadorDemandas.tsx', [
    ".from('prestador_suporte_demandas').insert",
    ".from('os_notas').insert",
    'notificationService.notifyAdmin',
  ]);

  console.log('Painel do Prestador: contratos finais de autorização, sessão, privilégios, transação, privacidade, Storage, Realtime, CI e produção aprovados.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

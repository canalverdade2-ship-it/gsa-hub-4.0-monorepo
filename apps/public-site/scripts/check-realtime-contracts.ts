import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(path, 'utf8');
}

function includesAll(path: string, markers: string[]) {
  const content = read(path);
  for (const marker of markers) {
    assert.ok(content.includes(marker), `${path}: contrato Realtime ausente: ${marker}`);
  }
}

includesAll('src/hooks/useAdminNotifications.tsx', [
  ".channel('admin-notifications-secure')",
  "table: 'admin_notificacoes'",
  "table: 'notificacoes'",
  '.subscribe()',
  '60_000',
  "document.addEventListener('visibilitychange'",
  'supabase.removeChannel(channel)',
  'gsa_admin_get_pendency_counts_secure',
  'gsa_admin_list_notifications',
]);

includesAll('src/hooks/useClientNotifications.tsx', [
  'HEARTBEAT_INTERVAL_MS = 60000',
  'RECONNECT_DELAY_MS = 3000',
  'filter: `cliente_id=eq.${clientId}`',
  "status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'",
  "status === 'SUBSCRIBED'",
  "table: 'clientes'",
  'sessionService.endSession()',
  'supabase.removeChannel(channel)',
  'supabase.removeChannel(securityChannel)',
  'supabase.removeChannel(notifChannel)',
]);

includesAll('src/hooks/useProviderNotifications.tsx', [
  'HEARTBEAT_INTERVAL_MS = 60_000',
  'filter: `prestador_id=eq.${prestadorId}`',
  "table: 'prestadores'",
  'isProviderRevoked',
  'providerOperations.pendencySnapshot',
  'window.setInterval(() => void refreshCounts(), HEARTBEAT_INTERVAL_MS)',
  'supabase.removeChannel(channel)',
]);

const client = read('src/hooks/useClientNotifications.tsx');
assert.match(client, /const scopedTables = \[[\s\S]*?'faturas'[\s\S]*?'tickets'[\s\S]*?'emprestimos'/, 'Cliente deve observar tabelas operacionais essenciais.');
assert.doesNotMatch(client, /setInterval\([^)]*,\s*(?:[0-9_]{1,4})\s*\)/, 'Polling do cliente não pode ser agressivo.');

const provider = read('src/hooks/useProviderNotifications.tsx');
assert.doesNotMatch(provider, /\.on\('postgres_changes',[\s\S]*?table:\s*'prestador_demandas'[^]*?filter:\s*undefined/, 'Prestador não pode assinar demandas sem filtro.');

console.log('REALTIME_RESILIENCE_CONTRACTS_OK');

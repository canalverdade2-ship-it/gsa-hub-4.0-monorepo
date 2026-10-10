export const PROVIDER_PENDING_STATUSES = new Set(['pendente', 'em_analise']);
export const PROVIDER_BLOCKED_STATUSES = new Set([
  'pendente',
  'em_analise',
  'suspenso',
  'desligado',
  'reprovado',
  'bloqueado',
  'inativo',
]);
export const PROVIDER_REVOKED_STATUSES = new Set(['bloqueado', 'inativo', 'desligado']);

export function isProviderPending(status?: string | null) {
  return !!status && PROVIDER_PENDING_STATUSES.has(status);
}

export function isProviderBlocked(status?: string | null) {
  return !!status && PROVIDER_BLOCKED_STATUSES.has(status);
}

export function isProviderRevoked(status?: string | null) {
  return !!status && PROVIDER_REVOKED_STATUSES.has(status);
}

export function providerStatusLabel(status?: string | null) {
  if (!status) return 'Não informado';
  const labels: Record<string, string> = {
    ativo: 'Ativo',
    pendente: 'Pendente',
    em_analise: 'Em análise',
    suspenso: 'Suspenso',
    desligado: 'Desligado',
    reprovado: 'Reprovado',
    bloqueado: 'Bloqueado',
    inativo: 'Inativo',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

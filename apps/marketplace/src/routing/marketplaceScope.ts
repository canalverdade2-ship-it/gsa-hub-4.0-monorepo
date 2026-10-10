import type { AppArea } from './types';

const CLIENT_SERVICE_MODULES = new Set([
  'servicos_assinaturas',
  'servicos-e-assinaturas',
  'orcamentos',
  'servicos',
  'produtos',
  'assinaturas',
]);

const ADMIN_SERVICE_MODULES = new Set([
  'prestadores',
  'demandas',
  'orcamentos',
  'servicos',
  'os',
  'ordens-servico',
  'ordens_servico',
]);

const ADMIN_SERVICE_TABS: Record<string, Set<string>> = {
  cadastro: new Set(['prestadores']),
  loja: new Set(['servicos', 'pacotes']),
  operacoes: new Set(['orcamentos', 'demandas', 'os', 'ordens-servico', 'ordens_servico']),
};

const SERVICE_NOTIFICATION_MODULES = new Set([
  'servicos_assinaturas',
  'servicos-e-assinaturas',
  'orcamentos',
  'servicos',
  'ordens_servico',
  'ordens-servico',
  'prestadores',
  'demandas',
]);

function normalize(value?: string | null) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '_');
}

function normalizeAdminModuleForScope(module?: string | null) {
  const normalized = normalize(module);
  if (normalized === 'cadastros') return 'cadastro';
  if (normalized === 'catalogo') return 'loja';
  if (normalized === 'vendas') return 'operacoes';
  return normalized;
}

export function isMarketplaceClientRoute(module?: string | null): boolean {
  return !CLIENT_SERVICE_MODULES.has(normalize(module));
}

export function isMarketplaceBusinessRoute(module?: string | null): boolean {
  return !CLIENT_SERVICE_MODULES.has(normalize(module));
}

export function isMarketplaceAdminRoute(module?: string | null, submodule?: string | null): boolean {
  const normalizedModule = normalizeAdminModuleForScope(module);
  const normalizedSubmodule = normalize(submodule).replace(/_/g, '-');

  if (ADMIN_SERVICE_MODULES.has(normalizedModule)) return false;

  const blockedTabs = ADMIN_SERVICE_TABS[normalizedModule];
  if (!blockedTabs || !normalizedSubmodule) return true;

  return !blockedTabs.has(normalizedSubmodule) && !blockedTabs.has(normalizedSubmodule.replace(/-/g, '_'));
}

export function isMarketplacePanelRoute(
  area: AppArea,
  module?: string | null,
  submodule?: string | null,
): boolean {
  if (area === 'client') return isMarketplaceClientRoute(module);
  if (area === 'business') return isMarketplaceBusinessRoute(module);
  if (area === 'admin') return isMarketplaceAdminRoute(module, submodule);
  return true;
}

type NotificationLike = {
  modulo?: string | null;
  module?: string | null;
  tab?: string | null;
  link?: string | null;
  url?: string | null;
  source_table?: string | null;
  tipo?: string | null;
  acao_origem?: string | null;
};

export function isMarketplaceNotification(notification: NotificationLike): boolean {
  const module = normalize(notification.modulo || notification.module);
  if (SERVICE_NOTIFICATION_MODULES.has(module)) return false;

  const sourceTable = normalize(notification.source_table);
  if (['ordens_servico', 'prestador_demandas', 'prestador_documentos', 'prestador_saques'].includes(sourceTable)) {
    return false;
  }

  const eventName = normalize(notification.tipo || notification.acao_origem);
  if (['ordem_servico', 'prestador', 'demanda_servico'].some((term) => eventName.includes(term))) {
    return false;
  }

  const tab = normalize(notification.tab).replace(/_/g, '-');
  if (module === 'operacoes' && ADMIN_SERVICE_TABS.operacoes.has(tab)) return false;
  if (module === 'cadastro' && ADMIN_SERVICE_TABS.cadastro.has(tab)) return false;
  if (module === 'loja' && ADMIN_SERVICE_TABS.loja.has(tab)) return false;

  const target = String(notification.link || notification.url || '').toLocaleLowerCase('pt-BR');
  if (!target) return true;

  return ![
    '/cliente/servicos-e-assinaturas',
    '/empresa/operacoes',
    '/admin/demandas',
    '/admin/cadastros/prestadores',
    '/admin/cadastro/prestadores',
    '/admin/loja/servicos',
    '/admin/loja/pacotes',
    '/admin/operacoes/orcamentos',
    '/admin/operacoes/demandas',
    '/admin/operacoes/os',
  ].some((blockedPath) => target.includes(blockedPath));
}


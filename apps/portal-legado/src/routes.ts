export type PortalRole = 'admin' | 'client';

export const moduleSlugs: Record<PortalRole, Record<string, string>> = {
  admin: {
    dashboard: 'inicio', clients: 'clientes', orders: 'ordens-de-servico',
    contracts: 'contratos', proposals: 'propostas', tasks: 'tarefas', calendar: 'calendario',
    finance: 'financeiro', support: 'suporte', coupons: 'cupons', documents: 'documentos', reports: 'relatorios',
    catalogs: 'cadastros', settings: 'configuracoes', notices: 'comunicados'
  },
  client: {
    dashboard: 'inicio', profile: 'meus-dados', orders: 'servicos',
    contracts: 'contratos', proposals: 'propostas', documents: 'documentos', notices: 'comunicados',
    finance: 'faturas', support: 'suporte'
  }
};

export interface PortalRoute {
  role: PortalRole;
  screen: string;
  detail: string | null;
}

const appBasePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

function withAppBase(pathname: string): string {
  return appBasePath ? `${appBasePath}${pathname}` : pathname;
}

function withoutAppBase(pathname: string): string {
  if (!appBasePath) return pathname;
  if (pathname === appBasePath) return '/';
  return pathname.startsWith(`${appBasePath}/`) ? pathname.slice(appBasePath.length) : pathname;
}

export function routePath(role: PortalRole, screen: string, detail?: string | null): string {
  const slug = moduleSlugs[role][screen] || moduleSlugs[role].dashboard;
  return withAppBase(`/${role === 'admin' ? 'admin' : 'cliente'}/${slug}${detail ? `/${encodeURIComponent(detail)}` : ''}`);
}

export function readRoute(): PortalRoute {
  const segments = withoutAppBase(window.location.pathname).split('/').filter(Boolean);
  const role: PortalRole = segments[0] === 'cliente' ? 'client' : 'admin';
  const screen = Object.entries(moduleSlugs[role]).find(([, slug]) => slug === segments[1])?.[0];
  if (screen) return { role, screen, detail: segments[2] ? decodeURIComponent(segments[2]) : null };

  const legacy = new URLSearchParams(window.location.search);
  const legacyRole: PortalRole = legacy.get('role') === 'client' ? 'client' : role;
  const legacyScreen = legacy.get('screen');
  return {
    role: legacyRole,
    screen: legacyScreen && moduleSlugs[legacyRole][legacyScreen] ? legacyScreen : 'dashboard',
    detail: null
  };
}

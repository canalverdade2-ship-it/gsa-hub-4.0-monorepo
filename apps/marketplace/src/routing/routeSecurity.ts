import { AppArea } from './types';
import { hasAdminModuleAccess } from '../security/collaboratorAccess';
import { isMarketplacePanelRoute } from './marketplaceScope';

interface SessionState {
  clientId?: string;
  clientPersonType?: 'pf' | 'pj';
  adminAuth?: boolean;
  adminType?: 'admin' | 'colaborador';
  colaboradorModulos?: string[];
  prestadorId?: string;
}

function isAffiliatePublicAccessRoute() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return ['/afiliados', '/afiliados/login', '/afiliados/acesso', '/afiliados/cadastro'].includes(path);
}

export function isRouteAllowed(
  area: AppArea,
  session: SessionState,
  module?: string,
  submodule?: string,
): boolean {
  if (!isMarketplacePanelRoute(area, module, submodule)) return false;
  if (area === 'client') return Boolean(session.clientId) && session.clientPersonType !== 'pj';
  if (area === 'business') return Boolean(session.clientId) && session.clientPersonType === 'pj';
  if (area === 'provider') return module === 'home' || Boolean(session.prestadorId);
  if (area === 'public' && module === 'affiliates') {
    return isAffiliatePublicAccessRoute() || Boolean(session.clientId);
  }
  if (area === 'admin') {
    if (!session.adminAuth) return false;
    return hasAdminModuleAccess(module, session.adminType || 'admin', session.colaboradorModulos || [], submodule);
  }
  return true;
}

import { routes } from './routeCatalog';

export function resolveLegacyRoute(pathname: string, search: string): string | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  
  // 1. Parâmetros de pesquisa antigos (?module=gsa_store)
  if (search) {
    const params = new URLSearchParams(search);
    const legacyModule = params.get('module');
    const legacyTab = params.get('tab');
    const legacyItemId = params.get('itemId') || params.get('item');

    if (normalizedPath === '/login' && params.get('mode') === 'register' && params.get('type') === 'pj') {
      const returnTo = params.get('returnTo');
      return returnTo
        ? `${routes.login.businessRegistration()}?${new URLSearchParams({ returnTo }).toString()}`
        : routes.login.businessRegistration();
    }

    if (legacyModule === 'gsa_store') {
      if (legacyTab === 'shop' || legacyTab === 'produtos-assinaturas') {
        if (legacyItemId) {
          return routes.marketplace.store.product(legacyItemId);
        }
        return routes.marketplace.store.products();
      }
      if (legacyTab === 'pacotes-viagem') {
        return routes.marketplace.travelPackages.legacy();
      }
      if (legacyTab === 'classificados') {
        return routes.marketplace.classifieds.root();
      }
      return routes.marketplace.menu();
    }
  }

  // 2. Caminhos legados de rotas de Marketplace e Loja
  if (normalizedPath === '/loja-gsa-store' || normalizedPath === '/cliente/gsa-store') {
    return routes.marketplace.menu();
  }
  if (normalizedPath === '/loja' || normalizedPath === '/cliente/gsa-store/shop') {
    if (search) {
      const params = new URLSearchParams(search);
      const itemId = params.get('item') || params.get('item_id') || params.get('produto');
      if (itemId) {
        return routes.marketplace.store.product(itemId);
      }
    }
    return routes.marketplace.store.products();
  }
  if (normalizedPath === '/loja-gsa-store/produtos-assinaturas' || normalizedPath === '/cliente/gsa-store/produtos-assinaturas') {
    return routes.marketplace.store.root();
  }
  if (normalizedPath === '/loja-gsa-store/pacotes-viagem' || normalizedPath === '/cliente/gsa-store/pacotes-viagem') {
    return routes.marketplace.travelPackages.legacy();
  }
  if (normalizedPath === '/loja-gsa-store/classificados' || normalizedPath === '/cliente/gsa-store/classificados') {
    return routes.marketplace.classifieds.root();
  }

  // 2b. Atalhos curtos amplamente divulgados
  if (normalizedPath === '/classificados') {
    return routes.marketplace.classifieds.root();
  }
  if (normalizedPath === '/viagens' || normalizedPath === '/pacotes-viagem') {
    return routes.marketplace.travelPackages.legacy();
  }
  if (normalizedPath === '/blog') {
    return routes.marketplace.store.blog();
  }

  return null;
}

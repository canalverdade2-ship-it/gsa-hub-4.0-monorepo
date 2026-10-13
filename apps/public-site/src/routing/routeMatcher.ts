import { AppArea, RouteState } from './types';

// Helper para converter a query string em Record
export function parseQueryString(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!search) return params;
  const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
  const pairs = cleanSearch.split('&');
  for (const pair of pairs) {
    if (!pair) continue;
    const [key, val] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(val || '');
    }
  }
  return params;
}

export function matchRoute(pathname: string, search: string, hash: string): RouteState {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const query = parseQueryString(search);
  const segments = normalizedPath.split('/').filter(Boolean);

  let area: AppArea = 'unknown';
  let module = 'home';
  let submodule: string | undefined;
  let itemId: string | undefined;

  // Alias público mantido para compatibilidade com links antigos e bookmarks.
  if (normalizedPath === '/acesso-restrito') {
    return { pathname, search, hash, area: 'login', module: 'acesso-restrito', query };
  }

  if (normalizedPath === '/') {
    return { pathname, search, hash, area: 'public', module: 'home', query };
  }

  // 1. ÁREA DE LOGIN
  if (segments[0] === 'login') {
    area = 'login';
    module = segments[1] || 'root';
    if (module === 'root' && query.mode === 'register' && query.type === 'pj') {
      module = 'empresa';
      submodule = 'cadastro';
      return { pathname, search, hash, area, module, submodule, query };
    }
    if (['cliente', 'pessoa-fisica', 'empresa'].includes(segments[1] || '') && segments[2] === 'recuperar-senha') {
      submodule = 'recuperar-senha';
    }
    if (segments[1] === 'empresa' && segments[2] === 'cadastro') {
      submodule = 'cadastro';
    }
    if (segments[1] === 'prestador' && segments[2] === 'cadastro') {
      submodule = 'cadastro';
    }
    return { pathname, search, hash, area, module, submodule, query };
  }

  // 2. ÁREA PÚBLICA
  if (normalizedPath === '/privacidade') {
    return { pathname, search, hash, area: 'public', module: 'privacy', query };
  }
  if (normalizedPath === '/servicos-e-assinaturas' || normalizedPath.startsWith('/servicos-e-assinaturas/')) {
    area = 'public';
    module = 'services';
    if (segments[1]) itemId = segments[1];
    return { pathname, search, hash, area, module, itemId, query };
  }
  if (
    normalizedPath === '/criacao-de-site-e-sistemas' ||
    normalizedPath === '/empresa-do-zero-ao-digital' ||
    normalizedPath === '/identidade-e-web-design'
  ) {
    area = 'public';
    module = 'systems';
    return { pathname, search, hash, area, module, query };
  }
  if (
    normalizedPath === '/nossos-parceiros' ||
    normalizedPath.startsWith('/nossos-parceiros/') ||
    normalizedPath === '/parceiros' ||
    normalizedPath.startsWith('/parceiros/')
  ) {
    area = 'public';
    module = 'partners';
    if (segments[1]) itemId = segments[1];
    return { pathname, search, hash, area, module, itemId, query };
  }
  if (normalizedPath === '/consulta-protocolo') {
    return { pathname, search, hash, area: 'public', module: 'protocolConsult', query };
  }
  if (normalizedPath === '/anuncios') {
    return { pathname, search, hash, area: 'public', module: 'ads', query };
  }
  if (normalizedPath === '/anuncie') {
    return { pathname, search, hash, area: 'public', module: 'advertise', query };
  }
  if (normalizedPath === '/afiliados' || normalizedPath.startsWith('/afiliados/')) {
    area = 'public';
    module = 'affiliates';
    if (segments[1]) itemId = segments[1];
    return { pathname, search, hash, area, module, itemId, query };
  }
  if (normalizedPath === '/trabalhe-conosco' || normalizedPath.startsWith('/trabalhe-conosco/')) {
    area = 'public';
    module = 'trabalhe-conosco';
    if (segments[1]) itemId = segments[1];
    return { pathname, search, hash, area, module, itemId, query };
  }
  if (normalizedPath === '/programa-vip') {
    return { pathname, search, hash, area: 'public', module: 'vip', query };
  }
  if (segments[0] === 'vaquinha') {
    return { pathname, search, hash, area: 'marketplace', module: 'root', submodule: 'loja-vaquinha', itemId: segments[1] || query.id || '', query };
  }

  // 3. MARKETPLACE
  if (segments[0] === 'marketplace') {
    area = 'marketplace';
    module = 'root';

    if (segments[1]) {
      submodule = segments[1]; // ex: 'loja', 'pacotes-viagem', 'classificados', 'menu', 'menu-loja'

      if (submodule === 'menu-loja' || submodule === 'loja-menu') {
        const view = segments[2];
        if (view) {
          submodule = `loja-${view}`;
          if (segments[3]) itemId = segments[3];
        } else {
          submodule = 'menu-loja';
        }
      } else if (submodule === 'loja') {
        // Ex: /marketplace/loja/produtos ou /marketplace/loja/produtos/:id
        const view = segments[2];
        if (view === 'menu') {
          submodule = 'menu-loja';
        } else if (view) {
          submodule = `loja-${view}`; // ex: 'loja-produtos', 'loja-assinaturas'
          if (segments[3]) {
            itemId = segments[3];
          }
        }
      } else if (submodule === 'menu' && segments[2] === 'loja') {
        submodule = 'menu-loja';
      } else if (submodule === 'menu' && segments[2] === 'classificados') {
        module = 'classificados';
        submodule = segments[3] || 'home'; // ex: 'imoveis', 'veiculos', 'geral', 'anunciar', 'meus-anuncios'
        if (segments[4]) {
          itemId = segments[4];
          if (segments[5] === 'editar') {
             submodule = `${submodule}-editar`; // ex: 'anuncio-editar'
          }
        }
      } else if (submodule === 'menu' && segments[2] === 'pacotes-viagem') {
        module = 'pacotes-viagem';
        submodule = segments[3] || 'home'; // ex: 'ofertas', 'orcamento', 'minhas-viagens', 'documentos'

        if (submodule === 'ofertas' && segments[4]) {
          if (['nacionais', 'internacionais', 'excursoes'].includes(segments[4])) {
            submodule = `ofertas-${segments[4]}`;
          } else {
            submodule = 'pacote-detalhe';
            itemId = segments[4];
          }
        } else if (segments[4]) {
          itemId = segments[4];
        }
      } else if (submodule === 'menu' && segments[2] === 'saude') {
        module = 'saude';
        submodule = segments[3] || 'home';
        if (submodule === 'planos' && segments[4]) {
           if (['individual-familiar', 'empresarial', 'odontologico'].includes(segments[4])) {
             submodule = `planos-${segments[4]}`;
           } else {
             submodule = 'plano-detalhe';
             itemId = segments[4];
           }
        } else if (segments[4]) {
           itemId = segments[4];
        }
      } else if (submodule === 'menu' && segments[2] === 'seguros') {
        module = 'seguros';
        submodule = segments[3] || 'home';
        if (submodule === 'modalidades' && segments[4]) {
          submodule = `modalidade-${segments[4]}`;
        } else if (submodule === 'ofertas' && segments[4]) {
          submodule = 'oferta-detalhe';
          itemId = segments[4];
        } else if (submodule === 'cotacao' && segments[4]) {
          itemId = segments[4];
        } else if (segments[4]) {
          itemId = segments[4];
        }
      } else if (submodule === 'classificados') {
        // Legacy redirect logic can pick this up, but here we just map it.
        module = 'classificados';
        submodule = 'home';
      } else if (submodule === 'pacotes-viagem') {
        module = 'pacotes-viagem';
        submodule = 'home';
      }
    }
    return { pathname, search, hash, area, module, submodule, itemId, query };
  }

  // 4. PORTAL DO CLIENTE
  if (segments[0] === 'cliente') {
    area = 'client';
    module = segments[1] || 'dashboard'; // ex: 'financeiro', 'fidelidade', 'servicos-e-assinaturas', 'perfil'

    // Map module names to internal keys
    if (module === 'servicos-e-assinaturas') module = 'servicos_assinaturas';
    else if (module === 'credito-loja') module = 'credito_loja';
    else if (module === 'area-vip') module = 'area_vip';

    if (module === 'servicos_assinaturas' && segments[2]) {
      submodule = segments[2]; // 'orcamentos', 'servicos', 'produtos', 'assinaturas'
      if (segments[3]) itemId = segments[3];
    } else if (module === 'financeiro' && segments[2]) {
      submodule = segments[2]; // 'faturas', 'notas-fiscais', 'extrato', 'saques', 'transferencias', 'credito'
      if (segments[3]) itemId = segments[3];
    } else if (module === 'fidelidade' && segments[2]) {
      submodule = segments[2]; // 'pontos', 'vouchers', 'promocoes', 'premios', 'indique-ganhe', 'area-vip'
      if (segments[3]) itemId = segments[3];
    } else if (module === 'suporte') {
      if (segments[2]) itemId = segments[2];
    }
    return { pathname, search, hash, area, module, submodule, itemId, query };
  }

  // 5. GSA HUB EMPRESAS
  if (segments[0] === 'empresa') {
    area = 'business';
    const routeModule = segments[1] || 'dashboard';
    module = routeModule;

    if (routeModule === 'cadastro' || routeModule === 'perfil') {
      module = 'perfil';
    } else if (routeModule === 'operacoes') {
      module = 'servicos_assinaturas';
      submodule = segments[2];
      if (segments[3]) itemId = segments[3];
    } else if (routeModule === 'financeiro') {
      module = 'financeiro';
      submodule = segments[2];
      if (segments[3]) itemId = segments[3];
    } else if (routeModule === 'beneficios') {
      module = 'fidelidade';
      submodule = segments[2];
      if (segments[3]) itemId = segments[3];
    } else if (routeModule === 'marketplace') {
      module = 'gsa_store';
      submodule = segments[2] || 'home';
      if (segments[3]) itemId = segments[3];
    } else if (routeModule === 'suporte' && segments[2]) {
      itemId = segments[2];
    }

    return { pathname, search, hash, area, module, submodule, itemId, query };
  }

  // 6. PORTAL DO ANUNCIANTE
  // /anuncios permanece como vitrine pública; as subrotas pertencem ao portal.
  if (segments[0] === 'anuncios' && segments[1]) {
    area = 'advertiser';
    module = segments[1];
    if (segments[2]) itemId = segments[2];
    return { pathname, search, hash, area, module, itemId, query };
  }
  if (normalizedPath === '/servicos-gratuitos') {
    return { pathname, search, hash, area: 'public', module: 'free-tools', query };
  }

  // 7. PAINEL ADMINISTRATIVO
  if (segments[0] === 'admin') {
    area = 'admin';
    module = segments[1] || 'dashboard'; // ex: 'cadastros', 'catalogo', 'operacoes', 'financeiro', etc.
    if (module === 'financeiro' && ['credito', 'credito-loja', 'credito_loja'].includes(segments[2] || '')) {
      module = 'credito_loja';
      if (segments[3]) itemId = segments[3];
    } else if (module === 'financeiro' && segments[2] === 'afiliados') {
      module = 'afiliados';
      if (segments[3]) itemId = segments[3];
    } else if ((module === 'saude' || module === 'seguros') && segments[2]) {
      submodule = segments[2];
      if (segments[3]) itemId = segments[3];
    } else if (segments[2]) {
      submodule = segments[2]; // ex: 'clientes', 'produtos', 'orcamentos'
      if (segments[3]) itemId = segments[3];
    }
    return { pathname, search, hash, area, module, submodule, itemId, query };
  }

  // 8. PORTAL DO PRESTADOR
  if (segments[0] === 'prestador') {
    area = 'provider';
    module = segments[1] || 'home'; // apresentação pública ou módulos autenticados

    if (module === 'financeiro' && segments[2]) {
      submodule = segments[2]; // 'saques'
      if (segments[3]) itemId = segments[3];
    } else if (segments[2]) {
      itemId = segments[2];
    }
    return { pathname, search, hash, area, module, submodule, itemId, query };
  }

  // 9. PORTAL DO FORNECEDOR
  if (segments[0] === 'fornecedor') {
    area = 'supplier';
    module = segments[1] || 'home';
    if (segments[2]) itemId = segments[2];
    return { pathname, search, hash, area, module, itemId, query };
  }

  return { pathname, search, hash, area, module, query };
}

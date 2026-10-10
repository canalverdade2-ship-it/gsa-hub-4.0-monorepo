export type AdminActorType = 'admin' | 'colaborador';

export type AdminModule =
  | 'dashboard'
  | 'cadastro'
  | 'prestadores'
  | 'parceiros'
  | 'trabalhe-conosco'
  | 'careers'
  | 'avisos-campanhas'
  | 'catalogo'
  | 'operacoes'
  | 'demandas'
  | 'loja'
  | 'classificados'
  | 'viagens'
  | 'financeiro'
  | 'cobranca'
  | 'fiscal'
  | 'credito_loja'
  | 'fidelidade'
  | 'atendimento'
  | 'relatorios'
  | 'configuracoes'
  | 'acessos'
  | 'sistema'
  | 'promocoes'
  | 'area_vip'
  | 'afiliados'
  | 'automacoes'
  | 'gsa-tv'
  | 'pessoas'
  | 'contratos'
  | 'governanca';

const VALID_MODULES = new Set<AdminModule>([
  'dashboard',
  'cadastro',
  'prestadores',
  'parceiros',
  'trabalhe-conosco',
  'careers',
  'avisos-campanhas',
  'catalogo',
  'operacoes',
  'demandas',
  'loja',
  'classificados',
  'viagens',
  'financeiro',
  'cobranca',
  'fiscal',
  'credito_loja',
  'fidelidade',
  'atendimento',
  'relatorios',
  'configuracoes',
  'acessos',
  'sistema',
  'automacoes',
  'promocoes',
  'area_vip',
  'afiliados',
  'gsa-tv',
  'pessoas',
  'contratos',
  'governanca',
]);

/**
 * Normaliza apenas nomes legados pertencentes ao mesmo domínio funcional.
 * Permissões independentes nunca herdam acesso umas das outras.
 */
export function normalizeAdminModule(module?: string | null): AdminModule {
  const value = String(module || 'dashboard').trim().toLowerCase();

  if (value === 'tickets' || value === 'suporte') return 'atendimento';
  if (value === 'cadastros' || value === 'clientes') return 'cadastro';
  if (value === 'prestadores') return 'prestadores';
  if (value === 'parceiros') return 'parceiros';
  if (['trabalhe-conosco', 'trabalhe_conosco', 'careers'].includes(value)) return 'trabalhe-conosco';
  if (['avisos-campanhas', 'avisos_campanhas', 'avisos', 'campanhas'].includes(value)) return 'avisos-campanhas';
  if (value === 'catalogo') return 'loja';
  if (['credito', 'credito-loja'].includes(value)) return 'credito_loja';
  if (['vendas', 'orcamentos', 'servicos', 'produtos', 'assinaturas', 'os'].includes(value)) return 'operacoes';
  if (['vouchers', 'premios', 'indique-ganhe', 'cupons'].includes(value)) return 'fidelidade';
  if (['afiliados', 'gsa_afiliados', 'gsa-afiliados'].includes(value)) return 'afiliados';
  if (['gsa-tv', 'gsatv', 'tv', 'gsa_tv'].includes(value)) return 'gsa-tv';
  if (['pessoas', 'rh'].includes(value)) return 'pessoas';
  if (['contratos', 'juridico'].includes(value)) return 'contratos';
  if (['governanca', 'cockpit'].includes(value)) return 'governanca';

  return VALID_MODULES.has(value as AdminModule) ? value as AdminModule : 'dashboard';
}

function normalizeGrantedModule(module: string): AdminModule | null {
  const value = String(module || '').trim().toLowerCase();
  if (!value || value === 'acessos') return null;

  if (value === 'clientes' || value === 'cadastros') return 'cadastro';
  if (value === 'prestadores') return 'prestadores';
  if (value === 'parceiros') return 'parceiros';
  if (['trabalhe-conosco', 'trabalhe_conosco', 'careers'].includes(value)) return 'trabalhe-conosco';
  if (['avisos-campanhas', 'avisos_campanhas', 'avisos', 'campanhas'].includes(value)) return 'avisos-campanhas';
  if (value === 'catalogo') return 'loja';
  if (['credito', 'credito-loja'].includes(value)) return 'credito_loja';
  if (value === 'vendas') return 'operacoes';
  if (value === 'tickets' || value === 'suporte') return 'atendimento';
  if (['vouchers', 'premios', 'indique-ganhe', 'cupons'].includes(value)) return 'fidelidade';
  if (['afiliados', 'gsa_afiliados', 'gsa-afiliados'].includes(value)) return 'afiliados';
  if (['gsa-tv', 'gsatv', 'tv', 'gsa_tv'].includes(value)) return 'gsa-tv';

  return VALID_MODULES.has(value as AdminModule) ? value as AdminModule : null;
}

export function normalizeGrantedAdminModules(modules: string[] | null | undefined): AdminModule[] {
  return Array.from(new Set(
    (modules || [])
      .map(normalizeGrantedModule)
      .filter((module): module is AdminModule => Boolean(module)),
  ));
}

export function canAccessAdminModule(
  actorType: AdminActorType | undefined,
  modules: string[] = [],
  module?: string,
  submodule?: string,
): boolean {
  if (actorType === 'admin') return true;
  if (actorType !== 'colaborador') return false;

  const requested = String(module || '').trim().toLowerCase();
  const normalized = normalizeAdminModule(requested);
  // Um nome desconhecido não pode cair no dashboard padrão e herdar o acesso de entrada.
  if (requested && normalized === 'dashboard' && requested !== 'dashboard') return false;
  if (normalized === 'dashboard') return true;
  if (normalized === 'acessos') return false;
  if (normalized === 'gsa-tv') return false;

  const granted = new Set(normalizeGrantedAdminModules(modules));

  // Cadastro de prestadores pode ser concedido isoladamente sem abrir clientes.
  if (normalized === 'cadastro' && submodule === 'prestadores') {
    return granted.has('cadastro') || granted.has('prestadores');
  }
  if (normalized === 'prestadores') {
    return granted.has('prestadores') || granted.has('cadastro');
  }

  if (normalized === 'pessoas') {
    return (
      granted.has('prestadores') ||
      granted.has('trabalhe-conosco') ||
      granted.has('careers') ||
      granted.has('afiliados') ||
      granted.has('fidelidade') ||
      granted.has('promocoes') ||
      granted.has('cadastro')
    );
  }

  if (normalized === 'contratos') {
    return (
      granted.has('cadastro') ||
      granted.has('area_vip') ||
      granted.has('atendimento')
    );
  }

  if (normalized === 'governanca') {
    return (
      granted.has('acessos') ||
      granted.has('configuracoes') ||
      granted.has('sistema') ||
      granted.has('relatorios')
    );
  }

  return granted.has(normalized);
}

export function adminModulePath(module: string, tab?: string, itemId?: string): string {
  const original = String(module || 'dashboard').trim().toLowerCase();
  const normalized = normalizeAdminModule(original);
  const parts = (...values: Array<string | undefined>) =>
    `/${values.filter(Boolean).map((value) => encodeURIComponent(value as string)).join('/')}`;

  if (original === 'clientes') return parts('admin', 'cadastros', 'clientes', itemId);
  if (original === 'prestadores') return parts('admin', 'cadastros', 'prestadores', itemId);
  if (original === 'orcamentos') return parts('admin', 'operacoes', 'orcamentos', itemId);
  if (original === 'credito_loja') return parts('admin', 'financeiro', 'credito', itemId);
  if (original === 'afiliados') return parts('admin', 'financeiro', 'afiliados', itemId);
  if (['trabalhe-conosco', 'trabalhe_conosco', 'careers'].includes(original)) return parts('admin', 'trabalhe-conosco', tab, itemId);
  if (original === 'vendas') return parts('admin', 'operacoes', tab || 'pedidos', itemId);
  if (['avisos-campanhas', 'avisos_campanhas', 'avisos', 'campanhas'].includes(original)) return parts('admin', 'avisos-campanhas', tab, itemId);
  if (['gsa-tv', 'gsatv', 'tv', 'gsa_tv'].includes(original)) return parts('admin', 'gsa-tv', tab, itemId);
  if (original === 'pessoas') return parts('admin', 'cadastros', 'prestadores', itemId);
  if (original === 'contratos') return parts('admin', 'cadastros', 'clientes', itemId);
  if (original === 'governanca') return '/admin/dashboard';

  switch (normalized) {
    case 'dashboard': return '/admin/dashboard';
    case 'cadastro': return parts('admin', 'cadastros', tab || 'clientes', itemId);
    case 'prestadores': return parts('admin', 'cadastros', 'prestadores', itemId);
    case 'parceiros': return parts('admin', 'parceiros', tab, itemId);
    case 'trabalhe-conosco':
    case 'careers': return parts('admin', 'trabalhe-conosco', tab, itemId);
    case 'avisos-campanhas': return parts('admin', 'avisos-campanhas', tab, itemId);
    case 'catalogo': return parts('admin', 'loja', tab || 'produtos', itemId);
    case 'operacoes': return parts('admin', 'operacoes', tab || 'orcamentos', itemId);
    case 'demandas': return parts('admin', 'demandas', tab, itemId);
    case 'loja': return parts('admin', 'loja', tab, itemId);
    case 'classificados': return parts('admin', 'classificados', tab, itemId);
    case 'viagens': return parts('admin', 'viagens', tab, itemId);
    case 'financeiro': return parts('admin', 'financeiro', tab, itemId);
    case 'cobranca': return parts('admin', 'cobranca', tab, itemId);
    case 'fiscal': return parts('admin', 'fiscal', tab, itemId);
    case 'credito_loja': return parts('admin', 'financeiro', 'credito', itemId);
    case 'fidelidade': return parts('admin', 'fidelidade', tab, itemId);
    case 'atendimento': return parts('admin', 'atendimento', tab, itemId);
    case 'relatorios': return '/admin/relatorios';
    case 'configuracoes': return '/admin/configuracoes';
    case 'acessos': return '/admin/acessos';
    case 'sistema': return '/admin/sistema';
    case 'automacoes': return '/admin/automacoes';
    case 'gsa-tv': return parts('admin', 'gsa-tv', tab, itemId);
    case 'promocoes': return parts('admin', 'promocoes', tab, itemId);
    case 'area_vip': return parts('admin', 'area_vip', tab, itemId);
    case 'afiliados': return parts('admin', 'financeiro', 'afiliados', itemId);
    case 'pessoas': return parts('admin', 'cadastros', 'prestadores', itemId);
    case 'contratos': return parts('admin', 'cadastros', 'clientes', itemId);
    case 'governanca': return '/admin/dashboard';
    default: return '/admin/dashboard';
  }
}

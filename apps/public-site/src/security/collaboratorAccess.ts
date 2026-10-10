import {
  adminModulePath,
  canAccessAdminModule,
  normalizeAdminModule as normalizeSharedAdminModule,
  type AdminActorType,
} from '../routing/adminAccess';

export type AdminType = AdminActorType;

export function normalizeCollaboratorModules(modules: unknown): string[] {
  if (!Array.isArray(modules)) return [];
  return [...new Set(modules.filter((module): module is string => typeof module === 'string' && module.trim().length > 0))];
}

export function normalizeAdminModule(module?: string): string {
  return normalizeSharedAdminModule(module);
}

export function hasAdminModuleAccess(
  module: string | undefined,
  adminType: AdminType | undefined,
  modules: string[],
  submodule?: string,
): boolean {
  return canAccessAdminModule(adminType, normalizeCollaboratorModules(modules), module, submodule);
}

export function adminPathFor(module: string, tab?: string, itemId?: string): string {
  return adminModulePath(module, tab, itemId);
}

export function defaultAdminPath(adminType: AdminType | undefined, modules: string[]): string {
  if (adminType === 'admin') return '/admin/dashboard';
  const normalized = normalizeCollaboratorModules(modules);
  if (normalized.length === 0) return '/admin/dashboard';

  const priority = [
    'cadastro',
    'prestadores',
    'parceiros',
    'trabalhe-conosco',
    'avisos-campanhas',
    'operacoes',
    'financeiro',
    'cobranca',
    'fiscal',
    'atendimento',
    'catalogo',
    'loja',
    'classificados',
    'viagens',
    'fidelidade',
    'credito_loja',
    'promocoes',
    'area_vip',
    'afiliados',
    'relatorios',
    'configuracoes',
    'acessos',
    'sistema',
    'gsa-tv',
  ];
  const first = priority.find((module) => hasAdminModuleAccess(module, adminType, normalized));
  if (first === 'operacoes') return adminModulePath(first, 'produtos');
  return first ? adminModulePath(first) : '/admin/dashboard';
}

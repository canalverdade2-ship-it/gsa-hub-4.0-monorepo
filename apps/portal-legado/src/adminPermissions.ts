export type AdminModuleId =
  | 'dashboard' | 'clients' | 'proposals' | 'contracts' | 'orders' | 'tasks'
  | 'calendar' | 'finance' | 'documents' | 'coupons' | 'support' | 'reports'
  | 'catalogs' | 'settings' | 'notices';

export const ADMIN_MODULES: Array<{ id: AdminModuleId; label: string }> = [
  { id: 'dashboard', label: 'Início / Visão geral' },
  { id: 'clients', label: 'Clientes' },
  { id: 'proposals', label: 'Propostas' },
  { id: 'contracts', label: 'Contratos' },
  { id: 'orders', label: 'Ordens de Serviço' },
  { id: 'tasks', label: 'Tarefas' },
  { id: 'calendar', label: 'Calendário' },
  { id: 'finance', label: 'Financeiro e Carteira' },
  { id: 'documents', label: 'Documentos' },
  { id: 'coupons', label: 'Cupons' },
  { id: 'support', label: 'Suporte ao Cliente' },
  { id: 'reports', label: 'Relatórios' },
  { id: 'catalogs', label: 'Cadastros' },
  { id: 'settings', label: 'Configurações e usuários' },
  { id: 'notices', label: 'Notificações e comunicados' }
];

export const ADMIN_ROLE_TEMPLATES: Record<string, string[]> = {
  'Administrador Geral': ['*'],
  'Gestor Operacional': ['dashboard', 'clients', 'proposals', 'contracts', 'orders', 'tasks', 'calendar', 'documents', 'reports', 'notices'],
  'Operador / RPS': ['dashboard', 'orders', 'tasks', 'calendar', 'documents', 'notices'],
  'Financeiro': ['dashboard', 'clients', 'finance', 'coupons', 'reports', 'notices'],
  'Atendimento': ['dashboard', 'clients', 'documents', 'support', 'notices'],
  'Comercial': ['dashboard', 'clients', 'proposals', 'contracts', 'reports', 'notices'],
  'Personalizado': ['dashboard']
};

export function parseAdminPermissions(value: unknown): string[] {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.map((item) => String(item)).filter(Boolean))];
}

export function permissionsForRole(role: string): string[] {
  return [...(ADMIN_ROLE_TEMPLATES[role] || ADMIN_ROLE_TEMPLATES.Personalizado)];
}

export function hasAdminModule(user: any, module: string): boolean {
  if (!user || user.role !== 'admin') return false;
  const permissions = parseAdminPermissions(user.permissions);
  return permissions.includes('*') || permissions.includes(module);
}

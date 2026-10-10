import { ReactNode } from 'react';

export type GovernancaTab = 
  | 'cockpit'
  | 'configuracoes'
  | 'infraestrutura'
  | 'relatorios'
  | 'auditoria';

export interface GovernancaSuperDomainProps {
  initialTab?: GovernancaTab;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
  adminType?: 'admin' | 'colaborador';
  colaboradorId?: string;
  colaboradorNome?: string;
  colaboradorModulos?: string[];
  className?: string;
}

// ── RBAC & Collaborator Types ──
export interface Funcao {
  id: string;
  nome: string;
  descricao?: string | null;
  created_at?: string;
  colaboradores_count?: number;
}

export interface Colaborador {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  status: 'ativo' | 'suspenso' | 'inativo' | string;
  funcao_id?: string | null;
  created_at?: string;
  funcoes?: { id?: string; nome?: string } | null;
  modulos?: string[];
}

export interface SolicitacaoExclusao {
  id: string;
  created_at: string;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  tabela: string;
  registro_id: string;
  motivo?: string | null;
  status: 'pendente' | 'aprovado' | 'rejeitado' | string;
  revisado_por?: string | null;
  revisado_em?: string | null;
}

export interface AdminSessao {
  id: string;
  ator_id?: string | null;
  ator_nome?: string | null;
  ator_tipo?: string | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  usuario_tipo?: string | null;
  status?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  criado_em?: string | null;
  expira_em?: string | null;
  ultimo_acesso?: string | null;
}

export interface AccessSnapshot {
  functions: Funcao[];
  collaborators: Colaborador[];
  deletion_requests: SolicitacaoExclusao[];
  sessions: AdminSessao[];
}

// ── Dashboard Snapshot Types ──
export interface DashboardStats {
  faturamento_seis_meses: number;
  faturamento_mes_atual: number;
  faturamento_mes_anterior: number;
  clientes_total: number;
  promocoes_ativas: number;
  credito_pendente_total: number;
  demandas_ativas?: number;
  taxa_aprovacao?: number;
  uptime_pct?: number;
}

export interface DashboardLists {
  faturas?: any[];
  saques?: any[];
  cobrancas?: any[];
  orcamentos?: any[];
  tickets?: any[];
}

export interface DashboardSnapshot {
  permissions: Record<string, boolean>;
  stats: DashboardStats;
  lists: DashboardLists;
}

// ── System & Telemetry Types ──
export interface SystemTableStat {
  table: string;
  estimated_rows: number;
  dead_rows: number;
  last_analyze?: string | null;
  last_autoanalyze?: string | null;
}

export interface SystemUserAuth {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at?: string;
  nome?: string;
  tipo?: string;
  status?: string;
}

export interface SystemSnapshot {
  metrics?: Record<string, unknown>;
  tables?: SystemTableStat[];
  users_list?: SystemUserAuth[];
  generated_at?: string;
}

// ── Settings & Configuration Types ──
export interface CompanyData {
  razao_social: string;
  cnpj: string;
  telefone: string;
  responsavel: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
}

export interface PaymentMethodItem {
  id?: string;
  nome: string;
  slug: string;
  tipo: 'manual' | 'gateway' | 'pix' | 'cartao' | 'boleto' | string;
  instrucoes?: string;
  ativo: boolean;
  taxa_percentual?: number;
  prazo_dias?: number;
}

export interface SettingsSnapshot {
  company?: CompanyData | null;
  payment_methods?: PaymentMethodItem[];
  settings?: Record<string, string>;
}

// ── Audit Log Types ──
export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_type?: string | null;
  action: string;
  target_table?: string | null;
  target_id?: string | null;
  details?: string | null;
  ip_address?: string | null;
  severity?: 'info' | 'warning' | 'critical' | 'security';
  metadata?: Record<string, any> | null;
}

export type CollaboratorDashboardSnapshot = Record<string, any>;

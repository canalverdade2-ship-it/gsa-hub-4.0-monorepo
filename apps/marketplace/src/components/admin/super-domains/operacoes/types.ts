import { ReactNode } from 'react';
import { Orcamento, OS, Cliente, Servico, Produto, Assinatura } from '../../../../types';

export type OperacoesMainTab = 
  | 'orcamentos' 
  | 'os' 
  | 'demandas' 
  | 'compras' 
  | 'catalogo' 
  | 'viagens' 
  | 'midia' 
  | 'automacao';

export type OrcamentoStatusFilter = 'todos' | 'abertos' | 'negociacao' | 'aprovados' | 'cancelados';
export type OSStatusFilter = 'todos' | 'andamento' | 'concluido' | 'cancelado';
export type DemandasStatusFilter = 'todas' | 'abertas' | 'ativas' | 'concluidas' | 'canceladas';
export type ComprasStatusFilter = 'processamento' | 'concluido' | 'cancelado';

export interface OperacoesSuperDomainProps {
  adminType?: 'admin' | 'colaborador' | string;
  colaboradorId?: string;
  colaboradorNome?: string;
  activeSubTab?: string;
  initialItemId?: string;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
  title?: string;
}

export interface BudgetApprovalResult {
  success: boolean;
  already_processed?: boolean;
  request_id: string;
  orcamento_id: string;
  status: string;
  tipo?: string;
  os_id?: string | null;
  demanda_id?: string | null;
  ordem_compra_id?: string | null;
  ordem_assinatura_id?: string | null;
  fatura_id?: string | null;
  total_aprovado?: number | null;
}

export interface OperationalMetrics {
  totalOrcamentosAbertos: number;
  totalOsAndamento: number;
  totalDemandasAbertas: number;
  totalComprasProcessamento: number;
  totalNegociacoesPendentes: number;
}

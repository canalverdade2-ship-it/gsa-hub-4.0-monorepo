export type CreditDisputeStatus =
  | 'aberta'
  | 'em_analise'
  | 'aguardando_documentos'
  | 'deferida'
  | 'parcialmente_deferida'
  | 'indeferida'
  | 'cancelada_cliente'
  | 'resolvida_por_estorno';

export type CreditDisputeReason =
  | 'nao_reconheco'
  | 'nao_recebido'
  | 'produto_divergente'
  | 'cobranca_duplicada'
  | 'valor_incorreto'
  | 'cancelada_sem_estorno'
  | 'problema_fornecedor'
  | 'outro';

export interface CreditDisputeEvent {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  ator_tipo?: string | null;
  ator_nome?: string | null;
  metadata?: Record<string, unknown>;
  ocorrido_em: string;
}
export interface CreditDispute {
  id: string;
  protocolo: string;
  cliente_id?: string;
  cliente_nome?: string;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
  movimentacao_id: string;
  orcamento_id?: string | null;
  codigo_compra?: string | null;
  descricao_compra: string;
  valor_compra: number;
  valor_contestado: number;
  motivo: CreditDisputeReason;
  descricao: string;
  anexos: string[];
  status: CreditDisputeStatus;
  prazo_limite: string;
  valor_deferido: number;
  motivo_decisao?: string | null;
  analisada_por_nome?: string | null;
  analisada_em?: string | null;
  created_at: string;
  updated_at: string;
  compra_data?: string;
  eventos?: CreditDisputeEvent[];
}

export interface CreateCreditDisputeInput {
  movimentacaoId: string;
  motivo: CreditDisputeReason;
  descricao: string;
  anexos?: string[];
}

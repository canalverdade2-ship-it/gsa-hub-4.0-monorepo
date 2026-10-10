export type CreditWithdrawalStatus =
  | 'aguardando_documentos'
  | 'em_analise'
  | 'analise_reforcada'
  | 'aprovado'
  | 'recusado'
  | 'cancelado_cliente'
  | 'liberado';

export type CreditWithdrawalFeeType = 'percentual' | 'fixa';

export interface CreditWithdrawalQuote {
  credito_disponivel_efetivo: number;
  valor_maximo_saque: number;
  dias_cadastro: number;
  criterio_cadastro_30d_ok: boolean;
  criterio_credito_100_ok: boolean;
  analise_reforcada: boolean;
  taxa_tipo: CreditWithdrawalFeeType;
  taxa_config_valor: number;
  taxa_calculada: number;
  valor_total_fatura: number;
  pode_solicitar: boolean;
  prazo_analise_horas: number;
  prazo_fatura_dias: number;
}

export interface CreditWithdrawalDocument {
  path: string;
  name?: string;
  mime_type?: string;
  size?: number;
}
export interface CreditWithdrawalEvent {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  ator_tipo: string;
  ator_nome?: string | null;
  metadata?: Record<string, unknown>;
  ocorrido_em: string;
}

export interface CreditWithdrawal {
  id: string;
  protocolo: string;
  cliente_id: string;
  cliente_nome?: string;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
  cliente_data_cadastro?: string | null;
  valor_solicitado: number;
  taxa_tipo: CreditWithdrawalFeeType;
  taxa_config_valor: number;
  taxa_calculada: number;
  valor_total_fatura: number;
  limite_disponivel_snapshot: number;
  valor_bloqueado: number;
  criterio_cadastro_30d_ok: boolean;
  criterio_credito_100_ok: boolean;
  analise_reforcada: boolean;
  pix_tipo: string;
  pix_chave?: string;
  pix_chave_mascarada?: string;
  documento_foto?: CreditWithdrawalDocument | null;
  comprovante_endereco?: CreditWithdrawalDocument | null;
  status: CreditWithdrawalStatus;
  prazo_analise?: string | null;
  motivo_decisao?: string | null;
  analisado_por_nome?: string | null;
  analisado_em?: string | null;
  aprovado_em?: string | null;
  liberado_em?: string | null;
  referencia_pagamento?: string | null;
  fatura_id?: string | null;
  movimentacao_id?: string | null;
  limite_total_atual?: number;
  limite_disponivel_atual?: number;
  limite_bloqueado_atual?: number;
  created_at: string;
  updated_at: string;
  eventos?: CreditWithdrawalEvent[];
}

export interface CreateCreditWithdrawalResult {
  id: string;
  protocolo: string;
  status: CreditWithdrawalStatus;
  valor_solicitado: number;
  taxa_calculada: number;
  valor_total_fatura: number;
  analise_reforcada: boolean;
}

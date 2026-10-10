export type CreditLimitCancellationStatus =
  | 'solicitado'
  | 'em_analise'
  | 'aprovado'
  | 'recusado';

export interface CreditLimitCancellation {
  id: string;
  protocolo: string;
  cliente_id: string;
  cliente_nome?: string;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
  limite_total_snapshot: number;
  limite_disponivel_snapshot: number;
  limite_usado_snapshot: number;
  limite_total_atual?: number;
  limite_disponivel_atual?: number;
  status: CreditLimitCancellationStatus;
  motivo_decisao?: string | null;
  analisado_por_nome?: string | null;
  analisado_em?: string | null;
  created_at: string;
  updated_at: string;
}

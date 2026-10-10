export type SupplierStatus = 'pendente' | 'em_analise' | 'ajuste_solicitado' | 'ativo' | 'suspenso' | 'reprovado';

export interface SupplierProduct {
  id: string;
  produto_id: string;
  produto_nome: string;
  codigo_produto?: string | null;
  codigo_barras?: string | null;
  custo_unitario: number;
  quantidade_minima: number;
  prazo_entrega_dias: number;
  estoque_disponivel?: number;
  status: string;
}

export interface SupplierOrderItem {
  id: string;
  produto_id: string;
  produto_nome_snapshot: string;
  codigo_produto_snapshot?: string | null;
  quantidade_pedida: number;
  quantidade_aprovada: number;
  custo_unitario: number;
}

export interface SupplierOrder {
  id: string;
  codigo: string;
  fornecedor_id: string;
  fornecedor_nome?: string;
  status: string;
  previsao_entrega?: string | null;
  vencimento_previsto?: string | null;
  condicao_pagamento?: string | null;
  valor_total_previsto: number;
  observacoes?: string | null;
  created_at: string;
  items: SupplierOrderItem[];
}

export interface SupplierSnapshot {
  supplier: Record<string, any>;
  products: SupplierProduct[];
  catalog: Array<Record<string, any>>;
  requests: Array<Record<string, any>>;
  orders: SupplierOrder[];
  deliveries: Array<Record<string, any>>;
  payables: Array<Record<string, any>>;
  notifications: Array<Record<string, any>>;
}

export interface AdminSupplierSnapshot {
  suppliers: Array<Record<string, any>>;
  requests: Array<Record<string, any>>;
  supplier_products: Array<Record<string, any>>;
  orders: SupplierOrder[];
  deliveries: Array<Record<string, any>>;
  payables: Array<Record<string, any>>;
  products: Array<Record<string, any>>;
}

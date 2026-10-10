import type { ProductVariationsPayload } from './productVariations';

export type ImportSourceType = 'url' | 'excel' | 'pdf' | 'txt' | 'image';

export interface ImportEvidence {
  pagina?: number;
  linha?: number;
  planilha?: string;
  trecho?: string;
  image_region?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ProductImportCandidate {
  client_id: string;
  source_type: ImportSourceType;
  source_reference: string;
  source_fingerprint: string;
  
  nome: string | null;
  descricao: string | null;
  valor_custo: number | null;
  moeda: string | null;
  // Configuração opcional
  url_produto?: string | null;
  nome_fornecedor?: string | null;
  categoria_sugerida?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  tipo_codigo_barras?: string | null;
  identificador_preferencial?: 'interno' | 'codigo_barras';
  
  selecionado: boolean;
  completo: boolean;
  confidence?: number;
  avisos: string[];
  imagens: string[];
  variacoes?: ProductVariationsPayload;
  evidence?: ImportEvidence;

  // Added by user in review steps
  porcentagem_lucro?: number;
  valor_final?: number;
  categoria_id?: string;
  visivel_na_loja?: boolean;
  controle_estoque?: boolean;
  estoque_disponivel?: number;
  tipo_cliente?: string;
}

export type SupplierMode = 'online' | 'loja_fisica' | 'proprio';

export interface ImportSupplierConfig {
  mode: SupplierMode;
  nome_fornecedor?: string;
  telefone?: string;
  observacoes?: string;
  cidade?: string;
  estado?: string;
  endereco?: string;
}

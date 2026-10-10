export type ProductVariationKind = 'cor' | 'tamanho' | 'numero' | 'material' | 'modelo' | 'outro';

export interface ProductVariationOptionInput {
  id?: string;
  chave: string;
  nome: string;
  valor?: string | null;
  cor_hex?: string | null;
  imagem_url?: string | null;
  ordem?: number;
  origem_externa_id?: string | null;
}

export interface ProductVariationGroupInput {
  id?: string;
  chave: string;
  nome: string;
  tipo: ProductVariationKind;
  ordem?: number;
  origem_externa_id?: string | null;
  opcoes: ProductVariationOptionInput[];
}

export interface ProductVariantInput {
  id?: string;
  chave: string;
  nome?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  valor?: number | null;
  valor_custo?: number | null;
  controle_estoque?: boolean;
  estoque_disponivel?: number;
  imagem_url?: string | null;
  ativo?: boolean;
  origem_externa_id?: string | null;
  selecoes: Record<string, string>;
  combinacao?: Record<string, string>;
}

export interface ProductVariationsPayload {
  grupos: ProductVariationGroupInput[];
  variantes: ProductVariantInput[];
}

export interface ProductVariationSelection {
  variante_id: string;
  nome?: string | null;
  sku?: string | null;
  opcoes: Record<string, string>;
  valor?: number | null;
  imagem_url?: string | null;
  controle_estoque?: boolean;
  estoque_disponivel?: number;
}

export const EMPTY_PRODUCT_VARIATIONS: ProductVariationsPayload = {
  grupos: [],
  variantes: [],
};

export function hasProductVariations(value: ProductVariationsPayload | null | undefined): boolean {
  return Boolean(value?.grupos?.length && value?.variantes?.length);
}

export function variationSelectionLabel(
  selection: ProductVariationSelection | Record<string, string> | null | undefined,
): string {
  if (!selection) return '';
  const options = 'opcoes' in selection ? selection.opcoes : selection;
  return Object.entries(options || {})
    .map(([group, option]) => `${group}: ${option}`)
    .join(' · ');
}

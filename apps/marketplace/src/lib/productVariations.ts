import { supabase } from './supabase';
import { callAdminRpc } from './adminRpc';
import type { Produto } from '../types';
import type {
  ProductVariationGroupInput,
  ProductVariationSelection,
  ProductVariationsPayload,
  ProductVariantInput,
} from '../types/productVariations';

const emptyPayload = (): ProductVariationsPayload => ({ grupos: [], variantes: [] });

export async function fetchPublicProductVariations(productId: string): Promise<ProductVariationsPayload> {
  if (!productId) return emptyPayload();
  const [{ data: groups, error: groupsError }, { data: variants, error: variantsError }] = await Promise.all([
    supabase.from('produto_variacao_grupos').select('*').eq('produto_id', productId).order('ordem'),
    supabase.from('produto_variantes').select('*').eq('produto_id', productId).eq('ativo', true).order('created_at'),
  ]);
  if (groupsError) throw groupsError;
  if (variantsError) throw variantsError;
  if (!groups?.length || !variants?.length) return emptyPayload();

  const groupIds = groups.map((group: any) => group.id);
  const variantIds = variants.map((variant: any) => variant.id);
  const [{ data: options, error: optionsError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from('produto_variacao_opcoes').select('*').in('grupo_id', groupIds).order('ordem'),
    supabase.from('produto_variante_opcoes').select('*').in('variante_id', variantIds),
  ]);
  if (optionsError) throw optionsError;
  if (linksError) throw linksError;

  const normalizedGroups: ProductVariationGroupInput[] = groups.map((group: any) => ({
    ...group,
    opcoes: (options || []).filter((option: any) => option.grupo_id === group.id),
  }));
  const optionById = new Map((options || []).map((option: any) => [option.id, option]));
  const groupById = new Map(groups.map((group: any) => [group.id, group]));

  const normalizedVariants: ProductVariantInput[] = variants.map((variant: any) => {
    const selections: Record<string, string> = {};
    for (const link of (links || []).filter((entry: any) => entry.variante_id === variant.id)) {
      const group: any = groupById.get(link.grupo_id);
      const option: any = optionById.get(link.opcao_id);
      if (group && option) selections[group.chave] = option.chave;
    }
    return { ...variant, selecoes: selections };
  });
  return { grupos: normalizedGroups, variantes: normalizedVariants };
}

export async function fetchPublicVariantsByIds(ids: Array<string | null | undefined>): Promise<any[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return [];
  const { data, error } = await supabase.from('produto_variantes').select('*').in('id', uniqueIds);
  if (error) throw error;
  return data || [];
}

export async function fetchAdminProductVariations(productId: string): Promise<ProductVariationsPayload> {
  const data = await callAdminRpc<ProductVariationsPayload>('gsa_admin_get_product_variations', {
    p_produto_id: productId,
  });
  return data || emptyPayload();
}

export async function syncAdminProductVariations(
  productId: string,
  variations: ProductVariationsPayload,
): Promise<{ grupos: number; opcoes: number; variantes: number }> {
  return callAdminRpc('gsa_admin_sync_product_variations', {
    p_produto_id: productId,
    p_variacoes: variations,
  });
}

export function findVariantForSelections(
  variations: ProductVariationsPayload,
  selections: Record<string, string>,
): ProductVariantInput | null {
  return variations.variantes.find((variant) => (
    variations.grupos.every((group) => variant.selecoes?.[group.chave] === selections[group.chave])
  )) || null;
}

export function buildVariationSelection(variant: ProductVariantInput): ProductVariationSelection {
  return {
    variante_id: String(variant.id || ''),
    nome: variant.nome,
    sku: variant.sku,
    opcoes: variant.combinacao || {},
    valor: variant.valor,
    imagem_url: variant.imagem_url,
    controle_estoque: variant.controle_estoque,
    estoque_disponivel: variant.estoque_disponivel,
  };
}

export function applyVariantToProduct(product: Produto | any, variant: ProductVariantInput | any): Produto | any {
  if (!product || !variant) return product;
  const variantValue = variant.valor == null ? Number(product.valor || 0) : Number(variant.valor);
  let promotionalValue = product.valor_promocional;
  let discountPercentage = product.desconto_percentual;
  if (product.desconto_ativo) {
    if (product.desconto_tipo === 'porcentagem') {
      const percentage = Math.max(0, Math.min(100, Number(product.desconto_valor || 0)));
      promotionalValue = Math.round(variantValue * (1 - percentage / 100) * 100) / 100;
      discountPercentage = percentage;
    } else if (product.desconto_tipo === 'valor') {
      promotionalValue = Math.max(0, Math.round((variantValue - Number(product.desconto_valor || 0)) * 100) / 100);
      discountPercentage = variantValue > 0
        ? Math.round(((variantValue - promotionalValue) / variantValue) * 10000) / 100
        : 0;
    }
  }
  return {
    ...product,
    valor: variantValue,
    valor_custo: variant.valor_custo ?? product.valor_custo,
    valor_promocional: promotionalValue,
    desconto_percentual: discountPercentage,
    imagem_url: variant.imagem_url || product.imagem_url,
    controle_estoque: variant.controle_estoque ?? product.controle_estoque,
    estoque_disponivel: variant.controle_estoque
      ? Number(variant.estoque_disponivel || 0)
      : product.estoque_disponivel,
    produto_variante_id: variant.id,
    variacao_selecionada: buildVariationSelection(variant),
  };
}

export function createVariantCombinations(
  groups: ProductVariationGroupInput[],
  existing: ProductVariantInput[] = [],
): ProductVariantInput[] {
  if (!groups.length || groups.some((group) => !group.opcoes.length)) return [];
  const existingBySelection = new Map(existing.map((variant) => [
    groups.map((group) => `${group.chave}=${variant.selecoes?.[group.chave] || ''}`).join('|'),
    variant,
  ]));

  const selections = groups.reduce<Array<Record<string, string>>>((combinations, group) => {
    const next: Array<Record<string, string>> = [];
    for (const combination of combinations) {
      for (const option of group.opcoes) next.push({ ...combination, [group.chave]: option.chave });
    }
    return next.slice(0, 500);
  }, [{}]);

  return selections.map((selection, index) => {
    const key = groups.map((group) => `${group.chave}=${selection[group.chave]}`).join('|');
    const current = existingBySelection.get(key);
    const names = groups.map((group) => group.opcoes.find((option) => option.chave === selection[group.chave])?.nome).filter(Boolean);
    return {
      ...current,
      chave: current?.chave || `variante_${index + 1}`,
      nome: current?.nome || names.join(' / '),
      controle_estoque: current?.controle_estoque ?? false,
      estoque_disponivel: current?.estoque_disponivel ?? 0,
      ativo: current?.ativo ?? true,
      selecoes: selection,
      combinacao: Object.fromEntries(groups.map((group) => [
        group.nome,
        group.opcoes.find((option) => option.chave === selection[group.chave])?.nome || '',
      ])),
    };
  });
}

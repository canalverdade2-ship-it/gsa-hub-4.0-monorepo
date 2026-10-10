export type ProductVariationKind = 'cor' | 'tamanho' | 'numero' | 'material' | 'modelo' | 'outro';

export interface ImportedVariationOption {
  chave: string;
  nome: string;
  valor?: string | null;
  cor_hex?: string | null;
  imagem_url?: string | null;
  ordem: number;
  origem_externa_id?: string | null;
}

export interface ImportedVariationGroup {
  chave: string;
  nome: string;
  tipo: ProductVariationKind;
  ordem: number;
  origem_externa_id?: string | null;
  opcoes: ImportedVariationOption[];
}

export interface ImportedVariant {
  chave: string;
  nome?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  valor_custo?: number | null;
  controle_estoque: boolean;
  estoque_disponivel: number;
  imagem_url?: string | null;
  ativo: boolean;
  origem_externa_id?: string | null;
  selecoes: Record<string, string>;
}

export interface ImportedProductVariations {
  grupos: ImportedVariationGroup[];
  variantes: ImportedVariant[];
}

export interface ShopeeProductData {
  nome: string | null;
  descricao: string | null;
  preco: number | null;
  moeda: string;
  nome_fornecedor: string;
  imagens: string[];
  sku: string | null;
  variacoes: ImportedProductVariations;
}

const EMPTY_VARIATIONS: ImportedProductVariations = { grupos: [], variantes: [] };

export function normalizeVariationKey(value: unknown, fallback: string): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function inferVariationKind(name: string): ProductVariationKind {
  const normalized = normalizeVariationKey(name, '');
  if (/cor|color|colour|estampa/.test(normalized)) return 'cor';
  if (/tamanho|size|tam/.test(normalized)) return 'tamanho';
  if (/numero|numeracao|number|calcado|sapato/.test(normalized)) return 'numero';
  if (/material|tecido/.test(normalized)) return 'material';
  if (/modelo|model|versao/.test(normalized)) return 'modelo';
  return 'outro';
}

function firstNonEmpty(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function shopeeMoney(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  // A API v4 da Shopee representa valores monetarios em unidades de 1/100000.
  return Math.round((parsed / 100000) * 100) / 100;
}

export function shopeeImageUrl(value: unknown): string | null {
  if (!value) return null;
  const raw = typeof value === 'object'
    ? String((value as Record<string, unknown>).image_url || (value as Record<string, unknown>).url || (value as Record<string, unknown>).image || '')
    : String(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://down-br.img.susercontent.com/file/${raw.replace(/^\/+/, '')}`;
}

function optionName(value: unknown, index: number): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object') {
    const option = value as Record<string, unknown>;
    return String(firstNonEmpty(option.option, option.name, option.value, option.label, `Opcao ${index + 1}`)).trim();
  }
  return `Opcao ${index + 1}`;
}

function cartesianSelections(groups: ImportedVariationGroup[]): Array<Record<string, string>> {
  return groups.reduce<Array<Record<string, string>>>((combinations, group) => {
    const next: Array<Record<string, string>> = [];
    for (const combination of combinations) {
      for (const option of group.opcoes) next.push({ ...combination, [group.chave]: option.chave });
    }
    return next;
  }, [{}]);
}

function unwrapShopeeData(raw: any): any {
  return raw?.data?.item_basic || raw?.data || raw?.item_basic || raw?.item || raw;
}

export function parseShopeeProductPayload(raw: any): ShopeeProductData {
  const item = unwrapShopeeData(raw) || {};
  const tierVariations = Array.isArray(item.tier_variations)
    ? item.tier_variations
    : Array.isArray(item.tier_variation) ? item.tier_variation : [];

  const groups: ImportedVariationGroup[] = tierVariations
    .map((rawGroup: any, groupIndex: number) => {
      const name = String(firstNonEmpty(rawGroup?.name, rawGroup?.title, `Variacao ${groupIndex + 1}`)).trim();
      const groupKey = normalizeVariationKey(name, `grupo_${groupIndex + 1}`);
      const rawOptions = Array.isArray(rawGroup?.options)
        ? rawGroup.options
        : Array.isArray(rawGroup?.option_list) ? rawGroup.option_list : [];
      const parallelImages = Array.isArray(rawGroup?.images) ? rawGroup.images : [];
      const options = rawOptions.map((rawOption: any, optionIndex: number) => {
        const nameValue = optionName(rawOption, optionIndex);
        const optionKey = normalizeVariationKey(nameValue, `opcao_${optionIndex + 1}`);
        const imageValue = typeof rawOption === 'object' && rawOption
          ? firstNonEmpty(rawOption.image, rawOption.image_id, rawOption.image_url, parallelImages[optionIndex])
          : parallelImages[optionIndex];
        return {
          chave: optionKey,
          nome: nameValue,
          valor: nameValue,
          imagem_url: shopeeImageUrl(imageValue),
          ordem: optionIndex,
          origem_externa_id: String(firstNonEmpty(rawOption?.option_id, rawOption?.id, optionIndex)),
        } satisfies ImportedVariationOption;
      }).filter((option: ImportedVariationOption) => option.nome);
      return {
        chave: groupKey,
        nome: name,
        tipo: inferVariationKind(name),
        ordem: groupIndex,
        origem_externa_id: String(firstNonEmpty(rawGroup?.tier_variation_id, rawGroup?.id, groupIndex)),
        opcoes: options,
      } satisfies ImportedVariationGroup;
    })
    .filter((group: ImportedVariationGroup) => group.opcoes.length > 0);

  const rawModels = Array.isArray(item.models)
    ? item.models
    : Array.isArray(item.model_list) ? item.model_list : [];
  const fallbackPrice = shopeeMoney(firstNonEmpty(item.price, item.price_min, item.price_max));

  let variants: ImportedVariant[] = rawModels.map((model: any, modelIndex: number) => {
    const tierIndexes: number[] = Array.isArray(model?.tier_index)
      ? model.tier_index.map((value: unknown) => Number(value))
      : [];
    const selections: Record<string, string> = {};
    groups.forEach((group, groupIndex) => {
      const optionIndex = Number.isInteger(tierIndexes[groupIndex]) ? tierIndexes[groupIndex] : 0;
      const option = group.opcoes[optionIndex];
      if (option) selections[group.chave] = option.chave;
    });
    const selectedImage = groups
      .map((group) => group.opcoes.find((option) => selections[group.chave] === option.chave)?.imagem_url)
      .find(Boolean) || null;
    const rawStock = firstNonEmpty(model?.stock, model?.normal_stock, model?.current_stock);
    const hasExplicitStock = rawStock !== undefined && rawStock !== null && rawStock !== '' && !isNaN(Number(rawStock));
    const stock = hasExplicitStock ? Math.max(0, Number(rawStock)) : 99;
    const externalId = String(firstNonEmpty(model?.modelid, model?.model_id, model?.id, modelIndex));
    const modelName = String(firstNonEmpty(model?.name, model?.model_name, Object.values(selections).join(' / '), '')).trim();
    return {
      chave: normalizeVariationKey(externalId, `variante_${modelIndex + 1}`),
      nome: modelName || null,
      sku: String(firstNonEmpty(model?.model_sku, model?.sku, '')).trim() || null,
      codigo_barras: String(firstNonEmpty(model?.gtin_code, model?.barcode, '')).trim() || null,
      valor_custo: shopeeMoney(firstNonEmpty(model?.price, model?.price_stocks?.[0]?.current_price, item.price)) ?? fallbackPrice,
      controle_estoque: hasExplicitStock,
      estoque_disponivel: stock,
      imagem_url: shopeeImageUrl(firstNonEmpty(model?.image, model?.image_id, selectedImage)),
      ativo: Number(firstNonEmpty(model?.status, 1)) !== 0,
      origem_externa_id: externalId,
      selecoes: selections,
    } satisfies ImportedVariant;
  }).filter((variant: ImportedVariant) => Object.keys(variant.selecoes).length === groups.length);

  if (groups.length > 0 && variants.length === 0) {
    variants = cartesianSelections(groups).slice(0, 500).map((selections, index) => ({
      chave: `variante_${index + 1}`,
      nome: Object.entries(selections).map(([groupKey, optionKey]) => {
        const group = groups.find((entry) => entry.chave === groupKey);
        return group?.opcoes.find((entry) => entry.chave === optionKey)?.nome || optionKey;
      }).join(' / '),
      valor_custo: fallbackPrice,
      controle_estoque: false,
      estoque_disponivel: 99,
      ativo: true,
      selecoes: selections,
    }));
  }

  const images: string[] = (Array.isArray(item.images) ? item.images : [])
    .map(shopeeImageUrl)
    .filter((value: string | null): value is string => Boolean(value));
  for (const group of groups) {
    for (const option of group.opcoes) {
      if (option.imagem_url && !images.includes(option.imagem_url)) images.push(option.imagem_url);
    }
  }

  return {
    nome: String(firstNonEmpty(item.name, item.title, '')).trim() || null,
    descricao: String(firstNonEmpty(item.description, item.description_info?.extended_description?.field_list?.map((field: any) => field?.text).filter(Boolean).join('\n'), '')).trim() || null,
    preco: fallbackPrice,
    moeda: String(firstNonEmpty(item.currency, 'BRL')),
    nome_fornecedor: 'Shopee',
    imagens: Array.from(new Set<string>(images)).slice(0, 30),
    sku: String(firstNonEmpty(item.item_sku, item.sku, '')).trim() || null,
    variacoes: groups.length > 0 && variants.length > 0 ? { grupos: groups, variantes: variants } : EMPTY_VARIATIONS,
  };
}

export function extractShopeeProductIds(urlValue: string): { shopId: string; itemId: string } | null {
  let decoded = urlValue;
  try { decoded = decodeURIComponent(urlValue); } catch { /* URL original continua valida */ }
  const patterns = [
    /-i\.(\d+)\.(\d+)(?:[/?#]|$)/i,
    /\/product\/(\d+)\/(\d+)(?:[/?#]|$)/i,
    /[?&]shop(?:id|_id)=(\d+).*?[?&]item(?:id|_id)=(\d+)/i,
    /[?&]item(?:id|_id)=(\d+).*?[?&]shop(?:id|_id)=(\d+)/i,
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = decoded.match(patterns[index]);
    if (!match) continue;
    if (index === 3) return { shopId: match[2], itemId: match[1] };
    return { shopId: match[1], itemId: match[2] };
  }
  return null;
}

function findVariationPayload(value: any, depth = 0): any | null {
  if (!value || depth > 12) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findVariationPayload(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if ((Array.isArray(value.tier_variations) || Array.isArray(value.tier_variation))
      && (Array.isArray(value.models) || Array.isArray(value.model_list))) return value;
  for (const child of Object.values(value)) {
    const found = findVariationPayload(child, depth + 1);
    if (found) return found;
  }
  return null;
}

export function extractShopeeProductFromHtml(html: string): ShopeeProductData | null {
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const content = match[1]?.trim();
    if (!content || (!content.startsWith('{') && !content.startsWith('['))) continue;
    try {
      const parsed = JSON.parse(content);
      const candidate = findVariationPayload(parsed);
      if (candidate) return parseShopeeProductPayload(candidate);
    } catch {
      // Scripts que nao sao JSON puro sao ignorados; metadados continuam como fallback.
    }
  }
  return null;
}

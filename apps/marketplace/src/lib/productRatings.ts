/**
 * Utilitários de Avaliações e Comentários de Produtos
 * Regras de precedência:
 * 1. Avaliações reais feitas no sistema GSA
 * 2. Avaliações/notas importadas com o produto
 * 3. Fallback inicial de catálogo até a primeira avaliação real
 */

export interface ProductReviewItem {
  id: string;
  produto_id: string;
  cliente_id?: string | null;
  nome_autor: string;
  cidade?: string | null;
  estado?: string | null;
  nota: number;
  titulo?: string | null;
  comentario: string;
  recomenda?: boolean;
  fotos?: string[];
  origem?: 'gsa' | 'importado' | 'ficticio';
  curtidas_uteis?: number;
  verificado?: boolean;
  created_at?: string;
}

export interface ProductRatingSummary {
  rating: number;
  totalCount: number;
  source: 'gsa' | 'importado' | 'ficticio';
  distribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  recommendPercentage: number;
}

/**
 * Calcula nota média, total e distribuição respeitando a precedência definida
 */
export function calculateProductRating(
  product: any,
  gsaReviews: ProductReviewItem[] = []
): ProductRatingSummary {
  // 1º Prioridade: Avaliações reais no sistema GSA
  const validGsaReviews = gsaReviews.filter((r) => r.origem !== 'importado' && Number(r.nota) >= 1 && Number(r.nota) <= 5);

  if (validGsaReviews.length > 0) {
    const total = validGsaReviews.length;
    const sum = validGsaReviews.reduce((acc, r) => acc + Number(r.nota), 0);
    const avg = Math.round((sum / total) * 10) / 10;

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let recommendsCount = 0;

    validGsaReviews.forEach((r) => {
      const rounded = Math.min(5, Math.max(1, Math.round(Number(r.nota)))) as 1 | 2 | 3 | 4 | 5;
      distribution[rounded] = (distribution[rounded] || 0) + 1;
      if (r.recomenda !== false) recommendsCount++;
    });

    const recommendPercentage = Math.round((recommendsCount / total) * 100);

    return {
      rating: Math.min(5, Math.max(1, avg)),
      totalCount: total,
      source: 'gsa',
      distribution,
      recommendPercentage,
    };
  }

  // 2º Prioridade: Avaliação trazida na importação do produto
  const importedRating = Number(product?.avaliacao_media || product?.rating || 0);
  const importedCount = Number(product?.total_avaliacoes || product?.total_vendas || 0);

  if (importedRating > 0 && importedCount > 0) {
    return {
      rating: Math.min(5, Math.max(1, Math.round(importedRating * 10) / 10)),
      totalCount: importedCount,
      source: 'importado',
      distribution: {
        5: Math.round(importedCount * 0.82),
        4: Math.round(importedCount * 0.13),
        3: Math.round(importedCount * 0.03),
        2: Math.round(importedCount * 0.01),
        1: Math.round(importedCount * 0.01),
      },
      recommendPercentage: 98,
    };
  }

  // 3º Prioridade (Fallback): Nota e avaliação inicial de catálogo até existir a primeira avaliação
  const seedStr = product?.id || 'default_seed';
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const stableReviewsCount = Math.abs(hash % 38) + 12; // Entre 12 e 49 avaliações estáveis
  const stableRating = 4.8 + ((Math.abs(hash) % 2) * 0.1); // 4.8 ou 4.9

  return {
    rating: stableRating,
    totalCount: stableReviewsCount,
    source: 'ficticio',
    distribution: {
      5: Math.round(stableReviewsCount * 0.85),
      4: Math.round(stableReviewsCount * 0.12),
      3: Math.round(stableReviewsCount * 0.03),
      2: 0,
      1: 0,
    },
    recommendPercentage: 97,
  };
}

/**
 * Retorna a lista de comentários para exibição conforme a regra:
 * - Se houver comentários reais do sistema GSA, exibe SOMENTE os do sistema GSA.
 * - Se não houver, exibe os importados (se existirem na importação do produto).
 * - Se não houver nenhum, retorna lista vazia.
 */
export function getProductDisplayComments(
  product: any,
  gsaReviews: ProductReviewItem[] = []
): { comments: ProductReviewItem[]; source: 'gsa' | 'importado' | 'nenhum' } {
  const validGsa = gsaReviews.filter((r) => r.origem !== 'importado' && r.comentario?.trim());

  if (validGsa.length > 0) {
    return {
      comments: validGsa,
      source: 'gsa',
    };
  }

  // Comentários importados do produto (se existirem no JSON ou lista)
  let imported: any[] = [];
  if (Array.isArray(product?.comentarios_importados)) {
    imported = product.comentarios_importados;
  } else if (typeof product?.comentarios_importados === 'string') {
    try {
      imported = JSON.parse(product.comentarios_importados);
    } catch {
      imported = [];
    }
  }

  if (imported.length > 0) {
    const formatted: ProductReviewItem[] = imported.map((imp, idx) => ({
      id: imp.id || `imp-${idx}`,
      produto_id: product.id,
      nome_autor: imp.nome_autor || imp.autor || 'Cliente',
      cidade: imp.cidade || null,
      estado: imp.estado || null,
      nota: Number(imp.nota || 5),
      titulo: imp.titulo || null,
      comentario: imp.comentario || imp.texto || '',
      recomenda: imp.recomenda !== false,
      origem: 'importado',
      verificado: imp.verificado !== false,
      created_at: imp.created_at || imp.data || new Date().toISOString(),
    }));

    return {
      comments: formatted,
      source: 'importado',
    };
  }

  return {
    comments: [],
    source: 'nenhum',
  };
}

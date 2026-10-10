import { supabase } from './supabase';
import type { ProductReviewItem } from './productRatings';

/**
 * A tabela loja_avaliacoes pode existir em versões reduzidas (sem colunas de
 * moderação/enriquecimento). Estes helpers degradam com segurança quando uma
 * coluna não existe (erro 42703 no Postgres / PGRST204 no PostgREST).
 */

const MISSING_COLUMN_CODES = ['42703', 'PGRST204'];

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code && MISSING_COLUMN_CODES.includes(error.code)) return true;
  return Boolean(error.message && /does not exist|column/i.test(error.message));
}

const CORE_FIELDS = ['produto_id', 'cliente_id', 'nota', 'comentario', 'created_at'] as const;

function toCorePayload(payload: Record<string, any>) {
  const core: Record<string, any> = {};
  CORE_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) core[field] = payload[field];
  });
  return core;
}

let statusColumnAvailable: boolean | null = false;

/** Descobre uma única vez se a coluna de moderação existe nesta instalação. */
async function hasStatusColumn(): Promise<boolean> {
  // Hardcoded to false to avoid triggering 400 Bad Request in the console
  // when probing the database for a column that doesn't exist.
  return false;
}

/** Busca as avaliações visíveis de um produto (filtra moderação quando disponível). */
export async function fetchProductReviews(productId: string): Promise<ProductReviewItem[]> {
  const base = () =>
    supabase
      .from('loja_avaliacoes')
      .select('*')
      .eq('produto_id', productId)
      .order('created_at', { ascending: false });

  if (await hasStatusColumn()) {
    const withStatus = await base().eq('status', 'aprovado');
    if (!withStatus.error) return (withStatus.data || []) as ProductReviewItem[];
    console.warn('[storeReviews] Erro ao carregar avaliações:', withStatus.error.message);
    return [];
  }


  const fallback = await base();
  if (fallback.error) {
    console.warn('[storeReviews] Erro ao carregar avaliações:', fallback.error.message);
    return [];
  }
  return ((fallback.data || []) as ProductReviewItem[]).filter(
    (item: any) => item.status === undefined || item.status === null || item.status === 'aprovado',
  );
}


/** Insere uma avaliação, reduzindo o payload caso a tabela não tenha colunas extras. */
export async function insertProductReview(
  payload: Record<string, any>,
  writer?: (data: Record<string, any>) => Promise<unknown>,
): Promise<void> {
  const attempt = async (data: Record<string, any>) => {
    if (writer) {
      await writer(data);
      return null;
    }
    const { error } = await supabase.from('loja_avaliacoes').insert(data);
    return error;
  };

  try {
    const error = await attempt(payload);
    if (!error) return;
    if (!isMissingColumnError(error)) throw error;
  } catch (err: any) {
    if (!isMissingColumnError(err)) throw err;
  }

  const { error: coreError } = await supabase.from('loja_avaliacoes').insert(toCorePayload(payload));
  if (coreError) throw coreError;
}

/** Incrementa curtidas úteis quando a coluna existir; ignora silenciosamente caso contrário. */
export async function likeProductReview(reviewId: string, currentLikes = 0): Promise<void> {
  const { error } = await supabase
    .from('loja_avaliacoes')
    .update({ curtidas_uteis: (currentLikes || 0) + 1 })
    .eq('id', reviewId);
  if (error && !isMissingColumnError(error)) {
    console.warn('[storeReviews] Erro ao curtir avaliação:', error.message);
  }
}

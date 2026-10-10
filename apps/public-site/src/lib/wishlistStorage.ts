import { supabase } from './supabase';
import { sessionService } from './sessionService';
import { clientOperationalWrite } from './clientOperationalWrite';

/**
 * Gerenciador de Lista de Desejos (Favoritos) da Loja GSA.
 * Persiste no banco de dados (tabela `loja_favoritos`) para clientes logados
 * e mantém sincronização robusta com o cache local (localStorage) para resposta instantânea.
 */
const KEY_PREFIX = 'gsa_wishlist';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
}

export function resolveClientId(clientId?: string | null): string | null {
  if (clientId && typeof clientId === 'string' && clientId.trim().length > 0) {
    return clientId.trim();
  }
  const session = sessionService.getCurrentSession();
  if (session?.atorTipo === 'cliente' && session.atorId) {
    return session.atorId;
  }
  return null;
}

export const storageKey = (clientId?: string | null) => {
  const effectiveId = resolveClientId(clientId);
  return effectiveId ? `${KEY_PREFIX}_${effectiveId}` : `${KEY_PREFIX}_guest`;
};

/**
 * Retorna os IDs favoritados do cache local (rápido, síncrono e resiliente).
 */
export function getWishlist(clientId?: string | null): string[] {
  try {
    const effectiveId = resolveClientId(clientId);
    const primaryKey = storageKey(effectiveId);
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(primaryKey) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id.length > 0) : [];
  } catch {
    return [];
  }
}

/**
 * Verifica se um produto está na lista de favoritos.
 */
export function isInWishlist(productId: string, clientId?: string | null): boolean {
  if (!productId) return false;
  const effectiveId = resolveClientId(clientId);
  const current = getWishlist(effectiveId);
  return current.includes(productId);
}

/**
 * Busca os favoritos diretamente do banco de dados (tabela loja_favoritos),
 * mescla com quaisquer favoritos locais (para NUNCA perder dados) e sincroniza.
 */
export async function fetchWishlistFromDb(clientId?: string | null): Promise<string[]> {
  const effectiveId = resolveClientId(clientId);

  // Lê os itens salvos localmente antes de qualquer requisição
  const localUserIds = getWishlist(effectiveId);
  const guestRaw = typeof window !== 'undefined' ? window.localStorage.getItem(`${KEY_PREFIX}_guest`) : null;
  let guestIds: string[] = [];
  if (guestRaw) {
    try {
      const parsed = JSON.parse(guestRaw);
      if (Array.isArray(parsed)) guestIds = parsed.filter((id) => typeof id === 'string');
    } catch {
      /* ignore */
    }
  }

  if (!effectiveId) {
    // Visitante: retorna o localStorage guest combinado
    const guestCombined = Array.from(new Set([...localUserIds, ...guestIds]));
    return guestCombined;
  }

  // Se o effectiveId não for um UUID válido (ex: mock ou id não-uuid), mantém dados locais
  if (!isUuid(effectiveId)) {
    const fallbackCombined = Array.from(new Set([...localUserIds, ...guestIds]));
    try {
      localStorage.setItem(storageKey(effectiveId), JSON.stringify(fallbackCombined));
      if (guestIds.length > 0) localStorage.removeItem(`${KEY_PREFIX}_guest`);
    } catch { /* ignore */ }
    return fallbackCombined;
  }

  try {
    // 1. Busca favoritos persistidos no banco de dados
    const { data, error } = await supabase
      .from('loja_favoritos')
      .select('produto_id')
      .eq('cliente_id', effectiveId);

    if (error) {
      console.warn('[wishlistStorage] Aviso ao consultar loja_favoritos:', error.message);
      // Em caso de erro na consulta, preserva e consolida integralmente os favoritos locais
      const fallbackCombined = Array.from(new Set([...localUserIds, ...guestIds]));
      localStorage.setItem(storageKey(effectiveId), JSON.stringify(fallbackCombined));
      if (guestIds.length > 0) {
        localStorage.removeItem(`${KEY_PREFIX}_guest`);
      }
      return fallbackCombined;
    }

    const dbIds = (data || []).map((row: any) => row.produto_id).filter(Boolean);

    // 2. Mescla os itens do banco com os itens locais para garantir que nada seja apagado
    const mergedIds = Array.from(new Set([...dbIds, ...localUserIds, ...guestIds]));

    // 3. Atualiza o cache local com a lista mesclada completa
    localStorage.setItem(storageKey(effectiveId), JSON.stringify(mergedIds));
    if (guestIds.length > 0) {
      localStorage.removeItem(`${KEY_PREFIX}_guest`);
    }

    // 4. Se houver itens locais que ainda não estão no banco e são UUIDs válidos, salva em segundo plano
    const missingInDb = mergedIds.filter((id) => !dbIds.includes(id) && isUuid(id));
    if (missingInDb.length > 0) {
      for (const pid of missingInDb) {
        try {
          await clientOperationalWrite(effectiveId, 'loja_favoritos', 'insert', { produto_id: pid });
        } catch {
          try {
            await supabase.from('loja_favoritos').insert({ cliente_id: effectiveId, produto_id: pid });
          } catch {
            /* ignore */
          }
        }
      }
    }

    window.dispatchEvent(new CustomEvent('gsa-wishlist-updated'));
    return mergedIds;
  } catch (err) {
    console.error('[wishlistStorage] Erro ao buscar lista de favoritos do banco:', err);
    const fallback = Array.from(new Set([...localUserIds, ...guestIds]));
    try {
      localStorage.setItem(storageKey(effectiveId), JSON.stringify(fallback));
      if (guestIds.length > 0) {
        localStorage.removeItem(`${KEY_PREFIX}_guest`);
      }
    } catch { /* ignore */ }
    return fallback;
  }
}

/**
 * Alterna o produto na lista de favoritos no banco de dados e no cache local.
 * Retorna true se o produto ficou favoritado, ou false se foi removido.
 */
export async function toggleWishlist(productId: string, clientId?: string | null): Promise<boolean> {
  if (!productId) return false;
  const effectiveId = resolveClientId(clientId);
  const current = getWishlist(effectiveId);
  const exists = current.includes(productId);
  const next = exists ? current.filter((id) => id !== productId) : [...current, productId];

  // Atualização otimista imediata no cache local
  try {
    localStorage.setItem(storageKey(effectiveId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('gsa-wishlist-updated'));
  } catch {
    /* storage indisponível */
  }

  // Persistência no banco de dados quando logado com UUID válido
  if (effectiveId && isUuid(effectiveId) && isUuid(productId)) {
    try {
      if (exists) {
        try {
          await clientOperationalWrite(effectiveId, 'loja_favoritos', 'delete', {}, { produto_id: productId });
        } catch {
          await supabase.from('loja_favoritos').delete().eq('cliente_id', effectiveId).eq('produto_id', productId);
        }
      } else {
        try {
          await clientOperationalWrite(effectiveId, 'loja_favoritos', 'insert', { produto_id: productId });
        } catch {
          await supabase.from('loja_favoritos').insert({ cliente_id: effectiveId, produto_id: productId });
        }
      }
    } catch (err) {
      console.warn('[wishlistStorage] Aviso ao persistir favorito no banco:', err);
    }
  }

  return !exists;
}

/**
 * Remove um produto da lista de favoritos no banco de dados e no cache local.
 */
export async function removeFromWishlist(productId: string, clientId?: string | null): Promise<string[]> {
  if (!productId) return [];
  const effectiveId = resolveClientId(clientId);
  const current = getWishlist(effectiveId);
  const next = current.filter((id) => id !== productId);

  try {
    localStorage.setItem(storageKey(effectiveId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('gsa-wishlist-updated'));
  } catch {
    /* storage indisponível */
  }

  if (effectiveId && isUuid(effectiveId) && isUuid(productId)) {
    try {
      try {
        await clientOperationalWrite(effectiveId, 'loja_favoritos', 'delete', {}, { produto_id: productId });
      } catch {
        await supabase.from('loja_favoritos').delete().eq('cliente_id', effectiveId).eq('produto_id', productId);
      }
    } catch (err) {
      console.warn('[wishlistStorage] Aviso ao remover favorito no banco:', err);
    }
  }

  return next;
}

/**
 * Limpa IDs que não existem mais no catálogo para manter localStorage e contadores sincronizados
 */
export function pruneWishlist(validProductIds: string[], clientId?: string | null) {
  const effectiveId = resolveClientId(clientId);
  const current = getWishlist(effectiveId);
  const pruned = current.filter((id) => validProductIds.includes(id));
  if (pruned.length !== current.length) {
    try {
      localStorage.setItem(storageKey(effectiveId), JSON.stringify(pruned));
      window.dispatchEvent(new CustomEvent('gsa-wishlist-updated'));
    } catch { /* ignore */ }
  }
}



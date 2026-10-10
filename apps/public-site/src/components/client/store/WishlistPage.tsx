import React, { useState, useEffect } from 'react';
import { Heart, Trash2, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { EcommerceHeader } from './EcommerceHeader';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import StoreItemCard from './StoreItemCard';
import { fetchWishlistFromDb, getWishlist, removeFromWishlist, isUuid, pruneWishlist } from '../../../lib/wishlistStorage';
import { toast } from 'react-hot-toast';

export function WishlistPage({ clientId, onRequireAuth }: { clientId?: string, onRequireAuth?: () => void }) {
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Carrega os produtos favoritados pelo cliente (persistidos no banco de dados e sincronizados)
  useEffect(() => {
    let active = true;

    const loadProductsForIds = async (ids: string[]) => {
      if (ids.length === 0) {
        if (active) setWishlistItems([]);
        return;
      }

      const uuidIds = ids.filter((id) => isUuid(id));
      const codeIds = ids.filter((id) => !isUuid(id));

      try {
        const queries: Promise<any>[] = [];

        // 1. Produtos por ID UUID
        if (uuidIds.length > 0) {
          queries.push(
            Promise.resolve(supabase
              .from('produtos')
              .select('*')
              .in('id', uuidIds)
              .then((res) => (res.data || []).map((p: any) => ({ ...p, tipo: 'produto' }))))
          );
        }

        // 2. Produtos por Código de Produto (ex: SHP-..., PRD-...)
        if (codeIds.length > 0) {
          queries.push(
            Promise.resolve(supabase
              .from('produtos')
              .select('*')
              .in('codigo_produto', codeIds)
              .then((res) => (res.data || []).map((p: any) => ({ ...p, tipo: 'produto' }))))
          );
        }

        // 3. Serviços por ID UUID
        if (uuidIds.length > 0) {
          queries.push(
            Promise.resolve(supabase
              .from('servicos')
              .select('*')
              .in('id', uuidIds)
              .then((res) => (res.data || []).map((s: any) => ({ ...s, tipo: 'servico' }))))
          );
        }

        // 4. Serviços por Código de Serviço
        if (codeIds.length > 0) {
          queries.push(
            Promise.resolve(supabase
              .from('servicos')
              .select('*')
              .in('codigo_servico', codeIds)
              .then((res) => (res.data || []).map((s: any) => ({ ...s, tipo: 'servico' }))))
          );
        }

        // 5. Assinaturas / Planos por ID UUID
        if (uuidIds.length > 0) {
          queries.push(
            Promise.resolve(supabase
              .from('assinaturas')
              .select('*')
              .in('id', uuidIds)
              .then((res) => (res.data || []).map((a: any) => ({ ...a, tipo: 'assinatura' }))))
          );
        }

        // 6. Assinaturas / Planos por Código de Assinatura
        if (codeIds.length > 0) {
          queries.push(
            Promise.resolve(supabase
              .from('assinaturas')
              .select('*')
              .in('codigo_assinatura', codeIds)
              .then((res) => (res.data || []).map((a: any) => ({ ...a, tipo: 'assinatura' }))))
          );
        }

        const results = await Promise.all(queries);
        if (!active) return;

        const allFound: any[] = results.flat();
        const foundMap = new Map<string, any>();
        for (const item of allFound) {
          if (item.id) foundMap.set(item.id, item);
          if (item.codigo_produto) foundMap.set(item.codigo_produto, item);
          if (item.codigo_servico) foundMap.set(item.codigo_servico, item);
          if (item.codigo_assinatura) foundMap.set(item.codigo_assinatura, item);
        }

        const validIdsFound: string[] = [];
        const ordered: any[] = [];
        const seenIds = new Set<string>();

        for (const rawId of ids) {
          const item = foundMap.get(rawId);
          if (item && !seenIds.has(item.id)) {
            seenIds.add(item.id);
            ordered.push(item);
            validIdsFound.push(rawId);
            if (item.id && item.id !== rawId) validIdsFound.push(item.id);
            if (item.codigo_produto && item.codigo_produto !== rawId) validIdsFound.push(item.codigo_produto);
          }
        }

        // Se houver IDs órfãos/inexistentes no catálogo, sincroniza com o cache local
        if (ordered.length < ids.length) {
          pruneWishlist(validIdsFound, clientId);
        }

        setWishlistItems(ordered);
      } catch (err) {
        console.error('Erro ao carregar produtos favoritos:', err);
      }
    };

    const fetchWishlist = async () => {
      // 1. Carregamento instantâneo via cache local (zero delay perceptível)
      const initialIds = getWishlist(clientId);
      if (initialIds.length > 0) {
        await loadProductsForIds(initialIds);
        if (active) setLoading(false);
      }

      // 2. Sincronização e mesclagem com o banco de dados
      try {
        const ids = await fetchWishlistFromDb(clientId);
        if (active) {
          await loadProductsForIds(ids);
        }
      } catch (err) {
        console.error('Erro ao buscar wishlist do banco:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchWishlist();
    const onUpdate = () => {
      const currentIds = getWishlist(clientId);
      loadProductsForIds(currentIds);
    };
    window.addEventListener('gsa-wishlist-updated', onUpdate);
    return () => {
      active = false;
      window.removeEventListener('gsa-wishlist-updated', onUpdate);
    };
  }, [clientId]);

  const handleRemove = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    if (item.id) await removeFromWishlist(item.id, clientId);
    if (item.codigo_produto) await removeFromWishlist(item.codigo_produto, clientId);
    if (item.codigo_servico) await removeFromWishlist(item.codigo_servico, clientId);
    if (item.codigo_assinatura) await removeFromWishlist(item.codigo_assinatura, clientId);
    setWishlistItems((prev) => prev.filter((p) => p.id !== item.id));
    toast.success('Item removido dos favoritos.');
  };

  const getItemTargetUrl = (item: any) => {
    const itemId = item.id || item.codigo_produto;
    if (item.tipo === 'assinatura') {
      return routes.marketplace.store.subscription(itemId);
    }
    return routes.marketplace.store.product(itemId);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <EcommerceHeader 
        clientId={clientId}
        cartItemCount={0}
        onOpenCart={() => navigate(routes.marketplace.store.products() + '?modal=carrinho')}
        onRequireAuth={onRequireAuth}
      />

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[#17345f]">
            <Heart className="h-8 w-8 fill-current text-red-500" />
            <h1 className="text-3xl font-black tracking-tight">Minha Lista de Desejos</h1>
          </div>
          <span className="rounded-full bg-neutral-200 px-3.5 py-1.5 text-sm font-bold text-neutral-700 shadow-sm">
            {wishlistItems.length} {wishlistItems.length === 1 ? 'item salvo' : 'itens salvos'}
          </span>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#17345f] border-t-transparent" />
          </div>
        ) : wishlistItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-16 text-center shadow-sm border border-slate-100">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 border border-rose-100 text-rose-500">
              <Heart className="h-10 w-10 fill-rose-500" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900">Sua lista está vazia</h3>
            <p className="mt-2 text-neutral-500 max-w-md">
              Salve seus produtos favoritos clicando no coração para acompanhá-los e comprá-los quando quiser.
            </p>
            <button 
              onClick={() => navigate(routes.marketplace.store.products())}
              className="mt-6 flex items-center gap-2 rounded-xl bg-[#17345f] px-6 py-3 font-bold text-white transition-all hover:bg-[#0c2340] cursor-pointer shadow-md hover:shadow-lg"
            >
              Explorar Catálogo
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:gap-6">
            {wishlistItems.map((item) => (
              <div key={item.id} className="relative group">
                <StoreItemCard
                  item={item}
                  tipo={item.tipo || 'produto'}
                  clientId={clientId}
                  onAdd={() => {
                    const url = getItemTargetUrl(item);
                    navigate(url + '?modal=quantidade');
                  }}
                  onClick={() => {
                    const url = getItemTargetUrl(item);
                    navigate(url);
                  }}
                />
                <button 
                  type="button"
                  onClick={(e) => handleRemove(e, item)}
                  className="absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white text-neutral-400 shadow-md transition-all hover:text-red-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Remover da lista"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default WishlistPage;


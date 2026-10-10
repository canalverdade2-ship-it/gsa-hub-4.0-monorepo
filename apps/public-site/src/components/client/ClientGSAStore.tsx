import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, Package, Scissors, Calendar, Trash2, X, Plus, Minus, Tag, Check, AlertCircle, Loader2, ChevronLeft, ChevronRight, Filter, SlidersHorizontal, Briefcase, ArrowRight, Ticket, Coins, Sparkles, CreditCard, CheckCircle, Clock, CheckCircle2, Wallet, Gift, Zap, TrendingUp, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Produto, Servico, Assinatura, CupomLoja } from '../../types';
import { formatCurrency, generateCode, formatDate, isLocalDevHost } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../lib/notificationService';
import { logService } from '../../lib/logService';
import { PromoResult, avaliarPromocoes } from '../../lib/promocaoQuantidadeEngine';
import { Modal } from '../ui/Modal';
import { createNotification } from '../../lib/notifications';
import { notifyWhatsAppModal } from '../ui/WhatsAppButton';
import { VIP_LEVELS } from '../../constants';
import { getProductEffectivePrice, getProductDiscountPercentage, getProductQuantityPriceBreakdown } from '../../lib/productPricing';
import { calculateProductRating } from '../../lib/productRatings';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { callClientRpc } from '../../lib/clientRpc';
import { applyVariantToProduct, buildVariationSelection, fetchPublicVariantsByIds } from '../../lib/productVariations';
import type { ProductVariationSelection } from '../../types/productVariations';

// Roteamento
import { useAppLocation } from '../../routing/useAppLocation';
import { navigate, updateRouteQuery } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';
import { useSEO } from '../../hooks/useSEO';

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const QuantityModal = React.lazy(() => import('./store/QuantityModal'));
const StoreItemCard = React.lazy(() => import('./store/StoreItemCard'));
const CartDrawer = React.lazy(() => import('./store/CartDrawer'));
const ProductDetailsModal = React.lazy(() => import('./store/ProductDetailsModal'));
const FilterModal = React.lazy(() => import('./store/FilterModal'));
const AvailableCouponsModal = React.lazy(() => import('./store/AvailableCouponsModal'));
const SubscriptionDurationModal = React.lazy(() => import('./store/SubscriptionDurationModal'));
import { StoryHighlights } from './store/StoryHighlights';


type Tab = 'produtos' | 'assinaturas';
type ItemType = 'produto' | 'servico' | 'assinatura';

interface CartItem {
  id: string; // from loja_carrinhos
  item_id: string; // id of the product/service/subscription
  tipo: ItemType;
  quantidade: number;
  client_levels?: any;
  item_detalhes?: Produto | Servico | Assinatura;
  prazo_meses?: number;
  produto_variante_id?: string | null;
  opcoes_variacao?: ProductVariationSelection | null;
};

const PENDING_STORE_CHECKOUT_KEY = 'gsa_pending_store_checkout';
const PENDING_STORE_COUPONS_KEY = 'gsa_pending_store_coupons';
const GUEST_ACTIVATED_STORE_COUPONS_KEY = 'gsa_guest_activated_store_coupons';

export const mapColumnsToGallery = (item: any) => {
  if (!item) return [];
  const images = [];
  if (item.imagem_url) images.push(item.imagem_url);
  if (item.imagem_url_2) images.push(item.imagem_url_2);
  if (item.imagem_url_3) images.push(item.imagem_url_3);
  if (item.imagem_url_4) images.push(item.imagem_url_4);
  if (item.imagem_url_5) images.push(item.imagem_url_5);
  return images;
};

export function ClientGSAStore({ clientId, initialAssinaturaId, onSuccess: onFinalSuccess, onRequireAuth, onBack }: { clientId?: string, initialAssinaturaId?: string, onSuccess?: (orderId?: string) => void, onRequireAuth?: () => void, onBack?: () => void }) {
  // Ref para sinalizar que o carrinho deve abrir após migração/fetch
  const pendingCartOpenRef = React.useRef(false);
  // Trava síncrona contra duplo-clique em "adicionar ao carrinho" (evita duas linhas
  // para o mesmo produto por causa da leitura-antes-da-escrita).
  const addingToCartRef = React.useRef(false);
  const route = useAppLocation();

  const [activeTab, setActiveTab] = useState<Tab>(route.submodule === 'loja-assinaturas' ? 'assinaturas' : 'produtos');
  const [search, setSearch] = useState(route.query.busca || '');
  const [isLoading, setIsLoading] = useState(true);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [clientType, setClientType] = useState<'pf' | 'pj' | null>(null);
  const [clienteAtual, setClienteAtual] = useState<any>(null);
  const [promocoesAtivas, setPromocoesAtivas] = useState<any[]>([]);
  const [promosAtivadasIds, setPromosAtivadasIds] = useState<Set<string>>(new Set());
  const [promosAplicadas, setPromosAplicadas] = useState<PromoResult[]>([]);
  const [guestCupomDescInput, setGuestCupomDescInput] = useState('');
  const [guestCupomEntInput, setGuestCupomEntInput] = useState('');
  const [guestCupomDesconto, setGuestCupomDesconto] = useState<CupomLoja | null>(null);
  const [guestCupomEntrega, setGuestCupomEntrega] = useState<CupomLoja | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  
  // Modais derivados diretamente da URL para sincronização 100% precisa em tempo real
  const isCartOpen = route.query.modal === 'carrinho';
  const isCheckoutOpen = route.query.modal === 'checkout';
  const isFilterModalOpen = route.query.modal === 'filtros';
  const isQtyModalOpen = route.query.modal === 'quantidade' && !!route.itemId;
  const isDurationModalOpen = route.query.modal === 'duracao' && !!route.itemId;
  
  // Controla visibilidade dos botões flutuantes (carrinho e WhatsApp) — oculta imediatamente quando carrinho, checkout ou qualquer modal abrir
  const isAnyModalOpen = isCartOpen || isCheckoutOpen || isFilterModalOpen || isQtyModalOpen || isDurationModalOpen || Boolean(route.query.modal) || Boolean(route.itemId);
  
  // Estados de Filtro e Ordenação
  const [selectedProdutoCategoriaId, setSelectedProdutoCategoriaId] = useState<string>(route.query.categoria || 'todas');
  const [selectedAssinaturaCategoriaId, setSelectedAssinaturaCategoriaId] = useState<string>(route.query.categoria || 'todas');
  
  // Reset selected category when switching active tab
  useEffect(() => {
    setSelectedProdutoCategoriaId('todas');
    setSelectedAssinaturaCategoriaId('todas');
  }, [activeTab]);

  const selectedCategoriaId = activeTab === 'produtos' ? selectedProdutoCategoriaId : selectedAssinaturaCategoriaId;
  const setSelectedCategoriaId = activeTab === 'produtos' ? setSelectedProdutoCategoriaId : setSelectedAssinaturaCategoriaId;
  
  // Estados de Filtro e Ordenação (Padrão: Menor para maior preço)
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc' | 'alpha-asc' | 'alpha-desc' | 'none'>(route.query.ordenacao as any || 'price-asc');
  const [minPrice, setMinPrice] = useState<number | ''>(route.query.precoMin ? Number(route.query.precoMin) : '');
  const [maxPrice, setMaxPrice] = useState<number | ''>(route.query.precoMax ? Number(route.query.precoMax) : '');
  
  // Refatorado para IDs para ser 100% real-time (modais atualizam se o item mudar no banco)
  const [selectedQtyId, setSelectedQtyId] = useState<{ id: string, tipo: ItemType } | null>(null);
  const [selectedDurationId, setSelectedDurationId] = useState<{ id: string, tipo: ItemType } | null>(null);
  const [selectedDetailsId, setSelectedDetailsId] = useState<{ id: string, tipo: ItemType } | null>(null);

  const [waSettings, setWaSettings] = useState({
    ativo: true,
    tamanho: 'M',
    posicao: 'direita'
  });

  // Montagem do título e descrição para SEO
  const seoData = useMemo(() => {
    let title = 'Loja GSA Store';
    let desc = 'Encontre os melhores produtos com a curadoria GSA Store.';
    
    if (activeTab === 'produtos' && selectedProdutoCategoriaId !== 'todas') {
      const cat = categorias.find(c => c.id === selectedProdutoCategoriaId);
      if (cat) {
        title = `${cat.nome} - Loja GSA Store`;
        desc = `Compre ${cat.nome} na GSA Store com os melhores preços.`;
      }
    } else if (activeTab === 'assinaturas') {
      title = 'Assinaturas - Loja GSA Store';
      desc = 'Conheça nossos planos e assinaturas exclusivos.';
    }
    return { title, desc };
  }, [activeTab, selectedProdutoCategoriaId, categorias]);

  useSEO({
    title: seoData.title,
    description: seoData.desc,
    type: 'website'
  });

  // 1. Sincronizar Abas, Itens e Modais a partir da URL
  useEffect(() => {
    // Aba ativa
    const isAssinaturaTab = route.submodule === 'loja-assinaturas';
    setActiveTab(isAssinaturaTab ? 'assinaturas' : 'produtos');

    // Detalhe de Item (Produto / Assinatura)
    const targetItemId = route.itemId || route.query.item || route.query.item_id || route.query.produto;
    if (targetItemId) {
      setSelectedDetailsId({
        id: targetItemId,
        tipo: isAssinaturaTab ? 'assinatura' : 'produto'
      });
    } else {
      setSelectedDetailsId(null);
    }

    if (route.query.modal === 'quantidade' && route.itemId) {
      setSelectedQtyId({ id: route.itemId, tipo: 'produto' });
    } else {
      setSelectedQtyId(null);
    }

    if (route.query.modal === 'duracao' && route.itemId) {
      setSelectedDurationId({ id: route.itemId, tipo: 'assinatura' });
    } else {
      setSelectedDurationId(null);
    }

    if (route.query.modal === 'checkout') {
      navigate(routes.marketplace.store.checkout(), { replace: true });
    }
  }, [route.submodule, route.itemId, route.query.modal]);

  // 2. Debounce e Sincronização na busca de texto da URL
  useEffect(() => {
    if (route.query.busca !== undefined && route.query.busca !== search) {
      setSearch(route.query.busca || '');
    }
  }, [route.query.busca]);

  useEffect(() => {
    const handler = setTimeout(() => {
      updateRouteQuery({ busca: search || null }, { replace: true });
    }, 400);

    return () => clearTimeout(handler);
  }, [search]);

  // 3. Sincronizar Filtros na URL
  const handleApplyFilters = (newSortBy: string, newMin: number | '', newMax: number | '') => {
    updateRouteQuery({
      ordenacao: newSortBy !== 'none' ? newSortBy : null,
      precoMin: newMin !== '' ? String(newMin) : null,
      precoMax: newMax !== '' ? String(newMax) : null,
    });
  };

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoriaId(catId);
    updateRouteQuery({ categoria: catId !== 'todas' ? catId : null });
  };

  const handleSelectTab = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'produtos') {
      navigate(routes.marketplace.store.products());
    } else {
      navigate(routes.marketplace.store.subscriptions());
    }
  };

  const handleCloseItemDetails = () => {
    if (activeTab === 'produtos') {
      navigate(routes.marketplace.store.products());
    } else {
      navigate(routes.marketplace.store.subscriptions());
    }
  };

  const openCartForType = (tipo: ItemType) => {
    const storePath = tipo === 'assinatura'
      ? routes.marketplace.store.subscriptions()
      : routes.marketplace.store.products();
    navigate(`${storePath}?modal=carrinho`);
  };

  const fetchWASettings = async () => {
    try {
      const { data } = await supabase.from('system_settings').select('*').like('key', 'whatsapp_float_%');
      if (data && data.length > 0) {
        setWaSettings({
          ativo: data.find(s => s.key === 'whatsapp_float_ativo')?.value !== 'false',
          tamanho: data.find(s => s.key === 'whatsapp_float_tamanho')?.value || 'M',
          posicao: data.find(s => s.key === 'whatsapp_float_posicao')?.value || 'direita',
        });
      }
    } catch (err) {
      console.error('Erro ao buscar settings do WhatsApp:', err);
    }
  };

  const selectedItemForQty = useMemo(() => {
    if (!selectedQtyId) return null;
    const { id, tipo } = selectedQtyId;
    let item = null;
    if (tipo === 'produto') item = produtos.find(p => p.id === id);
    else if (tipo === 'servico') item = servicos.find(s => s.id === id);
    else if (tipo === 'assinatura') item = assinaturas.find(a => a.id === id);
    return item ? { item, tipo } : null;
  }, [selectedQtyId, produtos, servicos, assinaturas]);

  const selectedItemForDuration = useMemo(() => {
    if (!selectedDurationId) return null;
    const { id, tipo } = selectedDurationId;
    let item = null;
    if (tipo === 'assinatura') item = assinaturas.find(a => a.id === id);
    return item ? { item, tipo } : null;
  }, [selectedDurationId, assinaturas]);

  const selectedItemForDetails = useMemo(() => {
    if (!selectedDetailsId) return null;
    const { id, tipo } = selectedDetailsId;
    let item = null;
    if (tipo === 'produto') item = produtos.find(p => p.id === id);
    else if (tipo === 'servico') item = servicos.find(s => s.id === id);
    else if (tipo === 'assinatura') item = assinaturas.find(a => a.id === id);
    return item ? { item, tipo } : null;
  }, [selectedDetailsId, produtos, servicos, assinaturas]);

  const buildGuestCartItem = (
    item: any,
    tipo: ItemType,
    quantidade = 1,
    prazo_meses?: number,
    variation?: ProductVariationSelection,
  ): CartItem => ({
    id: `guest-${tipo}-${item.id}`,
    item_id: item.id,
    tipo,
    quantidade,
    item_detalhes: variation
      ? applyVariantToProduct(item, {
          id: variation.variante_id,
          nome: variation.nome,
          sku: variation.sku,
          valor: variation.valor,
          imagem_url: variation.imagem_url,
          controle_estoque: variation.controle_estoque,
          estoque_disponivel: variation.estoque_disponivel,
          combinacao: variation.opcoes,
        })
      : item,
    prazo_meses,
    produto_variante_id: variation?.variante_id || null,
    opcoes_variacao: variation || null,
  });

  const savePendingStoreCheckout = (customItems?: CartItem[]) => {
    const itemsToSave = customItems !== undefined ? customItems : cartItems;
    if (!itemsToSave || itemsToSave.length === 0) {
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
      localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
      return;
    }
    const activatedCouponIds = JSON.parse(localStorage.getItem(GUEST_ACTIVATED_STORE_COUPONS_KEY) || '[]');

    localStorage.setItem(PENDING_STORE_CHECKOUT_KEY, JSON.stringify({
      items: itemsToSave.map(item => ({
        item_id: item.item_id,
        tipo: item.tipo,
        quantidade: item.quantidade,
        prazo_meses: item.prazo_meses,
        produto_variante_id: item.produto_variante_id || null,
        opcoes_variacao: item.opcoes_variacao || null,
      })),
      createdAt: new Date().toISOString()
    }));

    localStorage.setItem(PENDING_STORE_COUPONS_KEY, JSON.stringify({
      activatedCouponIds: Array.isArray(activatedCouponIds) ? activatedCouponIds : [],
      cupomDescontoId: guestCupomDesconto?.id || null,
      cupomEntregaId: guestCupomEntrega?.id || null,
      createdAt: new Date().toISOString()
    }));
  };

  // Evita sobrescrever/limpar o carrinho salvo antes de ele ser carregado do localStorage
  const guestCartHydratedRef = React.useRef(false);

  // Persistir automaticamente o carrinho de visitante no localStorage
  useEffect(() => {
    if (!clientId && guestCartHydratedRef.current) {
      savePendingStoreCheckout(cartItems);
    }
  }, [cartItems, clientId]);

  const loadGuestCart = async () => {
    if (clientId) return;
    const rawCart = localStorage.getItem(PENDING_STORE_CHECKOUT_KEY);
    if (!rawCart) {
      guestCartHydratedRef.current = true;
      setCartItems([]);
      return;
    }

    try {
      const parsed = JSON.parse(rawCart);
      const pendingItems = Array.isArray(parsed?.items) ? parsed.items : [];
      if (pendingItems.length === 0) {
        guestCartHydratedRef.current = true;
        localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
        localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
        setCartItems([]);
        return;
      }

      const marketplacePendingItems = pendingItems.filter((item: any) => item.tipo === 'produto' || item.tipo === 'assinatura');
      if (marketplacePendingItems.length === 0) {
        guestCartHydratedRef.current = true;
        setCartItems([]);
        return;
      }

      const productIds = marketplacePendingItems.filter(c => c.tipo === 'produto').map(c => c.item_id);
      const subscriptionIds = marketplacePendingItems.filter(c => c.tipo === 'assinatura').map(c => c.item_id);
      const variantIds = marketplacePendingItems.filter((c: any) => c.tipo === 'produto').map((c: any) => c.produto_variante_id);

      const [prodRes, assRes, variants] = await Promise.all([
        productIds.length > 0 ? supabase.from('produtos').select('*').in('id', productIds) : Promise.resolve({ data: [] }),
        subscriptionIds.length > 0 ? supabase.from('assinaturas').select('*').in('id', subscriptionIds) : Promise.resolve({ data: [] }),
        fetchPublicVariantsByIds(variantIds),
      ]);

      const guestItems: CartItem[] = [];
      for (const item of marketplacePendingItems) {
        let itemDetails = null;
        let variationSelection: ProductVariationSelection | null = item.opcoes_variacao || null;
        if (item.tipo === 'produto') {
          const baseProduct = prodRes.data?.find((p: any) => p.id === item.item_id);
          const variant = variants.find((entry: any) => entry.id === item.produto_variante_id);
          itemDetails = variant ? applyVariantToProduct(baseProduct, variant) : baseProduct;
          if (variant) variationSelection = buildVariationSelection(variant);
        } else if (item.tipo === 'assinatura') {
          itemDetails = assRes.data?.find((a: any) => a.id === item.item_id);
        }

        if (itemDetails) {
          guestItems.push({
            id: `guest-${item.tipo}-${item.item_id}`,
            item_id: item.item_id,
            tipo: item.tipo,
            quantidade: Math.max(1, Number(item.quantidade || 1)),
            item_detalhes: itemDetails,
            prazo_meses: item.prazo_meses,
            produto_variante_id: item.produto_variante_id || null,
            opcoes_variacao: variationSelection,
          });
        }
      }

      guestCartHydratedRef.current = true;
      setCartItems(guestItems);

      if (guestItems.length === 0) {
        localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
        localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
        localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
      } else if (guestItems.length < pendingItems.length) {
        savePendingStoreCheckout(guestItems);
      }
    } catch (err) {
      guestCartHydratedRef.current = true;
      console.error('[GSAStore] Erro ao carregar carrinho de visitante:', err);
    }

  };

  const importPendingStoreCheckout = async (): Promise<boolean> => {
    if (!clientId) return false;

    const rawCart = localStorage.getItem(PENDING_STORE_CHECKOUT_KEY);
    if (!rawCart) return false;

    let parsed: any;
    try { parsed = JSON.parse(rawCart); } catch { return false; }

    const pendingItems: Array<{
      item_id: string;
      tipo: string;
      quantidade: number;
      prazo_meses?: number;
      produto_variante_id?: string | null;
      opcoes_variacao?: ProductVariationSelection | null;
    }> =
      Array.isArray(parsed?.items) ? parsed.items : [];
    if (pendingItems.length === 0) {
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      return false;
    }

    const marketplacePendingItems = pendingItems.filter((item) => item.tipo === 'produto' || item.tipo === 'assinatura');
    const deferredItems = pendingItems.filter((item) => item.tipo !== 'produto' && item.tipo !== 'assinatura');
    if (marketplacePendingItems.length === 0) return false;

    const productIds = marketplacePendingItems.filter(c => c.tipo === 'produto').map(c => c.item_id);
    const subscriptionIds = marketplacePendingItems.filter(c => c.tipo === 'assinatura').map(c => c.item_id);

    let prodRes, assRes;
    try {
      [prodRes, assRes] = await Promise.all([
        productIds.length > 0 ? supabase.from('produtos').select('id').in('id', productIds) : Promise.resolve({ data: [] }),
        subscriptionIds.length > 0 ? supabase.from('assinaturas').select('id').in('id', subscriptionIds) : Promise.resolve({ data: [] })
      ]);
    } catch (e: any) {
      console.error('[GSAStore] Erro ao buscar produtos para importação:', e);
      return false;
    }

    const validProductIds = new Set(prodRes.data?.map((p: any) => p.id));
    const validSubscriptionIds = new Set(assRes.data?.map((a: any) => a.id));

    let imported = false;
    try {
      // Evita duplicar linhas quando o cliente já possui o mesmo item no carrinho da conta
      const { data: existingCart } = await supabase
        .from('loja_carrinhos')
        .select('id, item_id, tipo, quantidade, produto_variante_id')
        .eq('cliente_id', clientId);

      const existingMap = new Map<string, any>(
        (existingCart || []).map((row: any) => [`${row.tipo}:${row.item_id}`, row]),
      );

      for (const pendingItem of marketplacePendingItems) {
        if (!pendingItem?.item_id || !pendingItem?.tipo) continue;

        if (pendingItem.tipo === 'produto' && !validProductIds.has(pendingItem.item_id)) continue;
        if (pendingItem.tipo === 'assinatura' && !validSubscriptionIds.has(pendingItem.item_id)) continue;

        const quantidade = Math.max(1, Number(pendingItem.quantidade || 1));
        const prazoMeses = pendingItem.prazo_meses ? Number(pendingItem.prazo_meses) : undefined;
        const key = `${pendingItem.tipo}:${pendingItem.item_id}`;
        const existing = existingMap.get(key);

        if (existing?.id) {
          const novaQuantidade = pendingItem.tipo === 'assinatura'
            ? quantidade
            : Number(existing.quantidade || 1) + quantidade;
          await clientOperationalWrite(
            clientId,
            'loja_carrinhos',
            'update',
            {
              quantidade: novaQuantidade,
              updated_at: new Date().toISOString(),
              ...(pendingItem.produto_variante_id ? { produto_variante_id: pendingItem.produto_variante_id } : {}),
            },
            { id: existing.id },
          );
          existing.quantidade = novaQuantidade;
        } else {
          const insertData: any = {
            cliente_id: clientId,
            item_id: pendingItem.item_id,
            tipo: pendingItem.tipo,
            quantidade,
            updated_at: new Date().toISOString()
          };
          if (prazoMeses) insertData.prazo_meses = prazoMeses;
          if (pendingItem.produto_variante_id) insertData.produto_variante_id = pendingItem.produto_variante_id;
          console.log('TRYING TO INSERT:', insertData); const res = await clientOperationalWrite(clientId, 'loja_carrinhos', 'insert', insertData); console.log('INSERT SUCCESS:', res);
          existingMap.set(key, { id: null, item_id: pendingItem.item_id, tipo: pendingItem.tipo, quantidade });
        }
        imported = true;
      }

      const rawCoupons = localStorage.getItem(PENDING_STORE_COUPONS_KEY);
      const parsedCoupons = rawCoupons ? JSON.parse(rawCoupons) : null;
      const activatedCouponIds = Array.isArray(parsedCoupons?.activatedCouponIds) ? parsedCoupons.activatedCouponIds : [];
      for (const cupomId of activatedCouponIds) {
        if (!cupomId) continue;
        await callClientRpc('gsa_client_activate_store_coupon', { p_cupom_id: cupomId });
      }

      if (imported) {
        if (deferredItems.length > 0) {
          localStorage.setItem(PENDING_STORE_CHECKOUT_KEY, JSON.stringify({ ...parsed, items: deferredItems }));
        } else {
          localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
        }
        localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
        localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
      }
      return imported;
    } catch (error) {
      console.error('[GSAStore] Erro ao importar carrinho pendente:', error);
      return false;
    }
  };

  useEffect(() => {
    if (initialAssinaturaId && !isLoading) {
      setActiveTab('assinaturas');
      setSelectedDurationId({ id: initialAssinaturaId, tipo: 'assinatura' });
    }
  }, [initialAssinaturaId, isLoading]);

  useEffect(() => {
    fetchClientType();
    fetchStoreData();

    if (clientId) {
      // A migração do carrinho visitante já foi feita em App.tsx antes da navegação.
      // Aqui apenas carregamos o carrinho do banco e abrimos o drawer se a URL pedir
      // ou se a flag de migração estiver no sessionStorage (evento pode ter chegado antes do mount).
      const urlWantsCart = window.location.search.includes('modal=carrinho') || window.location.search.includes('modal=checkout');
      const justMigrated = sessionStorage.getItem('gsa_cart_just_migrated') === '1';
      if (urlWantsCart || justMigrated) {
        pendingCartOpenRef.current = true;
        sessionStorage.removeItem('gsa_cart_just_migrated');
      }

      fetchCart().then(() => {
        if (pendingCartOpenRef.current) {
          pendingCartOpenRef.current = false;
          setTimeout(() => {
            updateRouteQuery({ modal: 'carrinho' });
            updateRouteQuery({ modal: 'carrinho' });
            if (justMigrated) toast.success('Carrinho recuperado! Continue sua compra.');
          }, 50);
        }
      });
    } else {
      loadGuestCart();
    }


    const fetchAtivadas = async () => {
      if (!clientId) return;
      try {
        const { data } = await supabase.from('promocoes_quantidade_ativadas').select('promocao_quantidade_id').eq('cliente_id', clientId);
        if (data) setPromosAtivadasIds(new Set(data.map(d => d.promocao_quantidade_id)));
      } catch (e) {
        console.error('Erro fetching promocoes_quantidade_ativadas', e);
      }
    };
    fetchAtivadas();

    // Ouve o evento disparado pelo App.tsx após migrar o carrinho de visitante
    const onCartMigrated = () => {
      sessionStorage.removeItem('gsa_cart_just_migrated');
      fetchCart().then(() => {
        setTimeout(() => {
          updateRouteQuery({ modal: 'carrinho' });
          updateRouteQuery({ modal: 'carrinho' });
          toast.success('Carrinho recuperado! Continue sua compra.');
        }, 50);
      });
    };
    window.addEventListener('gsa-cart-migrated', onCartMigrated);

    // Canais do Marketplace (Produtos e Assinaturas)
    const storeChannel = supabase.channel('gsa-store-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => { fetchStoreData(true); fetchCart(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assinaturas' }, () => { fetchStoreData(true); fetchCart(); })
      .subscribe();


    // Canais de Cupons
    const couponChannel = supabase.channel('gsa-store-coupons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cupons_loja' }, () => {
        // Se houver checkout aberto, ele vai re-renderizar e podemos validar cupons se necessário
        // Por ora, apenas garantimos que os dados estão frescos se houvesse uma lista de cupons
      })
      .subscribe();

    // Canal de Promoções Inteligentes (VIP)
    const promoChannel = supabase.channel('gsa-store-promos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes_quantidade' }, async () => {
        // Re-busca as promoções ativas DIRETAMENTE no canal para evitar problemas de HMR/Closure
        const { data: promos } = await supabase.from('promocoes_quantidade')
          .select('*, produto_brinde:produtos!produto_brinde_id(*), produto_gatilho:produtos!produto_gatilho_id(nome)')
          .eq('status', 'ativa');
        if (promos) setPromocoesAtivas(promos);
      })
      .subscribe();

    const cartChannel = supabase.channel(`cart-${clientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_carrinhos', filter: `cliente_id=eq.${clientId}` }, () => {
        fetchCart();
      }).subscribe();
      
    const waChannel = supabase.channel('wa-sync-store')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => {
        fetchWASettings();
      }).subscribe();

    fetchWASettings();

    const handleOpenCart = () => {
      updateRouteQuery({ modal: 'carrinho' });
    };
    window.addEventListener('open-store-cart', handleOpenCart);

    // Escuta o evento global para ocultar o botão flutuante do carrinho
    const handleModalState = (e: Event) => {
      
    };
    window.addEventListener('whatsapp-modal-state', handleModalState);

    const handlePromoAtivada = (e: any) => {
      setPromosAtivadasIds(prev => new Set([...prev, e.detail.id]));
    };
    window.addEventListener('promo-ativada', handlePromoAtivada);

    return () => {
      supabase.removeChannel(storeChannel);
      supabase.removeChannel(couponChannel);
      supabase.removeChannel(promoChannel);
      supabase.removeChannel(cartChannel);
      supabase.removeChannel(waChannel);
      window.removeEventListener('open-store-cart', handleOpenCart);
      window.removeEventListener('whatsapp-modal-state', handleModalState);
      window.removeEventListener('promo-ativada', handlePromoAtivada);
      window.removeEventListener('gsa-cart-migrated', onCartMigrated);
    };
  }, [clientId]);

  // Notifica o botão WhatsApp para ocultar imediatamente quando carrinho, checkout ou qualquer modal estiver aberto
  useEffect(() => {
    notifyWhatsAppModal(isAnyModalOpen);
    return () => { notifyWhatsAppModal(false); };
  }, [isAnyModalOpen]);

  // Motor Lógico de Promoções: roda sempre que o carrinho muda
  useEffect(() => {
    if (cartItems.length > 0 && clienteAtual && promocoesAtivas.length > 0) {
      const ativasFiltradas = promocoesAtivas.filter(p => promosAtivadasIds.has(p.id));
      
      avaliarPromocoes(
        cartItems.map(i => ({ produto: i.item_detalhes as any, quantidade: i.quantidade, categoria_id: i.item_detalhes?.categoria_id })), 
        clienteAtual, 
        ativasFiltradas, 
        []
      ).then(res => {
        setPromosAplicadas(res);
      }).catch(err => {
        console.error('[GSAStore] Erro ao avaliar promoções:', err);
      });
    } else {
      setPromosAplicadas([]);
    }
  }, [cartItems, clienteAtual, promocoesAtivas, promosAtivadasIds]);

  const fetchClientType = async () => {
    try {
      if (clientId) {
        const { data } = await supabase.from('clientes').select('*').eq('id', clientId).maybeSingle();
        if (data) {
          setClientType(data.tipo_pessoa as 'pf' | 'pj');
          setClienteAtual(data);
        }
      }
      
      const { data: promos } = await supabase.from('promocoes_quantidade')
        .select('*, produto_brinde:produtos!produto_brinde_id(*), produto_gatilho:produtos!produto_gatilho_id(nome)')
        .eq('status', 'ativa');
      if (promos) setPromocoesAtivas(promos);
    } catch (err) {
      console.error('Erro ao buscar tipo de cliente:', err);
    }
  };

  const fetchStoreData = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    try {
      let currentType = clientType;
      if (!currentType && clientId) {
        const { data } = await supabase.from('clientes').select('tipo_pessoa').eq('id', clientId).maybeSingle();
        if (data?.tipo_pessoa) {
          currentType = data.tipo_pessoa as 'pf' | 'pj';
          setClientType(currentType);
        }
      }

      const types = currentType ? [currentType, 'ambos'] : ['pf', 'pj', 'ambos'];

      const [prodRes, assRes, catRes] = await Promise.all([
        supabase.from('produtos').select('*').eq('status', 'ativo').eq('visivel_na_loja', true).in('tipo_cliente', types).order('valor', { ascending: true }),
        supabase.from('assinaturas').select('*').eq('status', 'ativo').eq('visivel_na_loja', true).in('tipo_cliente', types).order('valor', { ascending: true }),
        supabase.from('loja_categorias').select('*').eq('status', 'ativo').order('ordem')
      ]);

      if (prodRes.data) setProdutos(prodRes.data);
      setServicos([]);
      if (assRes.data) setAssinaturas(assRes.data);
      if (catRes.data) setCategorias(catRes.data);
    } catch (err) {
      console.error('[GSAStore] Erro ao carregar dados da loja:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCart = async () => {
    if (!clientId) return;
    try {
      const { data, error } = await supabase.from('loja_carrinhos').select('*').eq('cliente_id', clientId); console.log('FETCH CART RESULT:', data, error);
      if (error) {
        console.error('[GSAStore] Erro ao buscar carrinho:', error);
        return;
      }
      if (!data) return;

      const marketplaceRows = data.filter((item: any) => item.tipo === 'produto' || item.tipo === 'assinatura');

      // Group IDs by type to fetch details more efficiently
      const productIds = marketplaceRows.filter(c => c.tipo === 'produto').map(c => c.item_id);
      const subscriptionIds = marketplaceRows.filter(c => c.tipo === 'assinatura').map(c => c.item_id);
      const variantIds = marketplaceRows.filter(c => c.tipo === 'produto').map(c => c.produto_variante_id);

      const [prodRes, assRes, variants] = await Promise.all([
        productIds.length > 0 ? supabase.from('produtos').select('*').in('id', productIds) : Promise.resolve({ data: [] }),
        subscriptionIds.length > 0 ? supabase.from('assinaturas').select('*').in('id', subscriptionIds) : Promise.resolve({ data: [] }),
        fetchPublicVariantsByIds(variantIds),
      ]);

      const enrichedCart = marketplaceRows.map((c: any) => {
        let itemDetails = null;
        if (c.tipo === 'produto') {
          const baseProduct = prodRes.data?.find((p: any) => p.id === c.item_id);
          const variant = variants.find((entry: any) => entry.id === c.produto_variante_id);
          itemDetails = variant ? applyVariantToProduct(baseProduct, variant) : baseProduct;
          if (variant) c.opcoes_variacao = buildVariationSelection(variant);
        } else if (c.tipo === 'assinatura') {
          itemDetails = assRes.data?.find((a: any) => a.id === c.item_id);
        }

        if (!itemDetails) {
          console.warn(`[GSAStore] Detalhes não encontrados para item ${c.item_id} do tipo ${c.tipo}`);
        }

        return { ...c, item_detalhes: itemDetails };
      });

      // We only keep items that still exist in the database to avoid UI crashes
      const invalidItems = enrichedCart.filter(i => !i.item_detalhes);
      const validItems = enrichedCart.filter(i => i.item_detalhes);
      if (invalidItems.length > 0) {
        console.warn(`[GSAStore] ${invalidItems.length} itens orfãos foram removidos do carrinho no banco de dados.`);
        await Promise.all(invalidItems.map(inv => 
          clientOperationalWrite(clientId, 'loja_carrinhos', 'delete', {}, { id: inv.id })
        ));
      }

      setCartItems(validItems);
    } catch (err) {
      console.error('[GSAStore] Erro crítico em fetchCart:', err);
    }
  };

  const addToCart = async (item: any, tipo: ItemType) => {
    if (!item?.id || !tipo) {
      toast.error('Não foi possível identificar este item.');
      return;
    }

    if (tipo === 'servico') {
      window.location.assign('/gsa3/cliente/inicio');
      return;
    }

    if (cartItems.length > 0 && cartItems[0].tipo !== tipo) {
      toast.error('Assinaturas devem ser compradas separadamente de produtos físicos.');
      return;
    }

    if (tipo === 'produto') {
      navigate(`${routes.marketplace.store.product(item.id)}?modal=quantidade`);
      return;
    }
    if (tipo === 'assinatura') {
      navigate(`${routes.marketplace.store.subscription(item.id)}?modal=duracao`);
      return;
    }

    const existing = cartItems.find(c => c.item_id === item.id);
    if (existing) {
      toast.error('Este item já está no carrinho.');
      return;
    }
    
    if (!clientId) {
      setCartItems(prev => [...prev, buildGuestCartItem(item, tipo)]);
      toast.success('Item adicionado ao carrinho!');
      openCartForType(tipo);
      return;
    }

    try {
      if (import.meta.env.DEV) console.log('[GSAStore] Tentando adicionar ao carrinho:', { clientId, itemId: item.id, tipo });
      const { data: authUser } = await supabase.auth.getUser();
      if (import.meta.env.DEV) console.log('[GSAStore] Usuário autenticado:', authUser?.user?.id);

      await clientOperationalWrite(clientId, 'loja_carrinhos', 'insert', { 
        item_id: item.id, 
        tipo, 
        quantidade: 1,
        updated_at: new Date().toISOString()
      });

      toast.success('Item adicionado ao carrinho!');
      fetchCart(); // Atualização manual imediata
      openCartForType(tipo);
    } catch (error: any) {
      console.error('[GSAStore] Erro ao adicionar ao carrinho:', error);
      toast.error('Erro ao adicionar ao carrinho. Verifique sua conexão.');
    }
  };

  const confirmAddToCart = async (qty: number, prazo_meses?: number, variation?: ProductVariationSelection) => {
    if (addingToCartRef.current) return;
    addingToCartRef.current = true;
    try {
      await executarAddToCart(qty, prazo_meses, variation);
    } finally {
      addingToCartRef.current = false;
    }
  };

  const executarAddToCart = async (qty: number, prazo_meses?: number, variation?: ProductVariationSelection) => {
    let item, tipo;
    
    if (selectedItemForQty) {
      item = selectedItemForQty.item;
      tipo = selectedItemForQty.tipo;
    } else if (selectedItemForDuration) {
      item = selectedItemForDuration.item;
      tipo = selectedItemForDuration.tipo;
    } else {
      return;
    }

    // Revalida o estoque no momento da confirmação (pode ter mudado desde a abertura do modal)
    if (tipo === 'produto') {
      try {
        if (item.possui_variacoes) {
          if (!variation?.variante_id) {
            toast.error('Selecione todas as opções do produto.');
            return;
          }
          const freshVariant = (await fetchPublicVariantsByIds([variation.variante_id]))[0];
          if (!freshVariant || freshVariant.produto_id !== item.id || freshVariant.ativo === false) {
            toast.error('A combinação selecionada não está mais disponível.');
            return;
          }
          item = applyVariantToProduct(item, freshVariant);
          variation = buildVariationSelection(freshVariant);
          if (freshVariant.controle_estoque) {
            const disponivel = Number(freshVariant.estoque_disponivel || 0);
            if (disponivel <= 0) {
              toast.error('Esta combinação está sem estoque no momento.');
              return;
            }
            if (qty > disponivel) {
              toast.error(`Apenas ${disponivel} unidade(s) desta combinação estão disponíveis.`);
              return;
            }
          }
        } else {
          const { data: freshProduct } = await supabase
            .from('produtos')
            .select('controle_estoque, estoque_disponivel')
            .eq('id', item.id)
            .maybeSingle();

          if (freshProduct?.controle_estoque) {
            const disponivel = Number(freshProduct.estoque_disponivel || 0);
            if (disponivel <= 0) {
              toast.error('Produto sem estoque disponível no momento.');
              setSelectedQtyId(null);
              return;
            }
            if (qty > disponivel) {
              toast.error(`Apenas ${disponivel} unidade(s) disponível(is) em estoque.`);
              return;
            }
          }
        }
      } catch (err) {
        console.error('[GSAStore] Erro ao revalidar estoque:', err);
      }
    }

    if (!clientId) {
      setCartItems(prev => {
        const existing = prev.find(c => c.item_id === item.id);
        if (existing) {
          return prev.map(c => c.item_id === item.id ? {
            ...c,
            quantidade: qty,
            prazo_meses,
            item_detalhes: item,
            produto_variante_id: variation?.variante_id || null,
            opcoes_variacao: variation || null,
          } : c);
        }
        return [...prev, buildGuestCartItem(item, tipo, qty, prazo_meses, variation)];
      });
      toast.success('Item adicionado ao carrinho!');
      setSelectedQtyId(null);
      setSelectedDurationId(null);
      openCartForType(tipo);
      return;
    }
    
    // Buscar o estado mais atual do banco para evitar race conditions, filtrando pela variação
    let currentCart = null;
    try {
      let query = supabase.from('loja_carrinhos')
        .select('id, quantidade')
        .eq('cliente_id', clientId)
        .eq('item_id', item.id);

      if (variation?.variante_id) {
        query = query.eq('produto_variante_id', variation.variante_id);
      } else {
        query = query.is('produto_variante_id', null);
      }

      const result = await query.maybeSingle();
      currentCart = result.data;
    } catch (error) {
      console.error('[GSAStore] Erro ao buscar carrinho atual:', error);
      toast.error('Erro ao verificar carrinho.');
      return;
    }

    try {
      if (import.meta.env.DEV) console.log('[GSAStore] Confirmando adição ao carrinho:', { clientId, itemId: item.id, qty });
      
      // Optimistic UI imediato
      setCartItems(prev => {
        const existing = prev.find(c => c.item_id === item.id && c.produto_variante_id === (variation?.variante_id || null));
        if (existing) {
          return prev.map(c => c.id === existing.id ? { ...c, quantidade: qty } : c);
        }
        return [...prev, buildGuestCartItem(item, tipo, qty, prazo_meses, variation)];
      });

      if (currentCart) {
        const updateData: any = { quantidade: qty, updated_at: new Date().toISOString() };
        if (prazo_meses) updateData.prazo_meses = prazo_meses;
        
        await clientOperationalWrite(clientId, 'loja_carrinhos', 'update', updateData, { id: currentCart.id });
        toast.success('Carrinho atualizado.');
      } else {
        const insertData: any = { 
          item_id: item.id, 
          tipo, 
          quantidade: qty,
          updated_at: new Date().toISOString()
        };
        if (prazo_meses) insertData.prazo_meses = prazo_meses;
        if (variation?.variante_id) insertData.produto_variante_id = variation.variante_id;

        await clientOperationalWrite(clientId, 'loja_carrinhos', 'insert', insertData);
        toast.success('Item adicionado ao carrinho!');
      }
      fetchCart(); // Atualização manual imediata
      openCartForType(tipo);
    } catch (e: any) {
      console.error('[GSAStore] Erro ao confirmar adição:', e);
      toast.error('Erro ao processar carrinho.');
    } finally {
      setSelectedQtyId(null);
      setSelectedDurationId(null);
    }
  };

  const updateCartQuantity = async (cartId: string, newQty: number, itemDetails: any) => {
    if (newQty < 1) return;
    if (itemDetails.controle_estoque && newQty > itemDetails.estoque_disponivel) {
      toast.error('Quantidade máxima em estoque atingida.');
      return;
    }
    
    if (!clientId) {
      setCartItems(prev => prev.map(item => item.id === cartId ? { ...item, quantidade: newQty } : item));
      return;
    }

    // Optimistic UI imediato
    setCartItems(prev => prev.map(item => item.id === cartId ? { ...item, quantidade: newQty } : item));

    try {
      await clientOperationalWrite(clientId, 'loja_carrinhos', 'update', {
        quantidade: newQty,
        updated_at: new Date().toISOString()
      }, { id: cartId });
      fetchCart();
    } catch (error) {
      console.error('[GSAStore] Erro ao atualizar quantidade:', error);
      toast.error('Erro ao atualizar quantidade.');
    }
  };

  const removeCartItem = async (cartId: string) => {
    if (!clientId) {
      setCartItems(prev => prev.filter(item => item.id !== cartId));
      toast.success('Item removido do carrinho.');
      return;
    }

    try {
      await clientOperationalWrite(clientId, 'loja_carrinhos', 'delete', {}, { id: cartId });
      
      toast.success('Item removido do carrinho.');
      fetchCart();
    } catch (error) {
      console.error('[GSAStore] Erro ao remover item:', error);
      toast.error('Erro ao remover item.');
    }
  };

  const clearCart = async () => {
    if (!clientId) {
      setCartItems([]);
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
      localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
      setGuestCupomDesconto(null);
      setGuestCupomEntrega(null);
      window.dispatchEvent(new CustomEvent('gsa-cart-updated'));
      window.dispatchEvent(new Event('storage'));
      toast.success('Carrinho esvaziado com sucesso.');
      return;
    }

    try {
      await clientOperationalWrite(clientId, 'loja_carrinhos', 'delete', {}, { cliente_id: clientId });
      setCartItems([]);
      setGuestCupomDesconto(null);
      setGuestCupomEntrega(null);
      window.dispatchEvent(new CustomEvent('gsa-cart-updated'));
      window.dispatchEvent(new Event('storage'));
      toast.success('Carrinho esvaziado com sucesso.');
      fetchCart();
    } catch (error) {
      console.error('[GSAStore] Erro ao limpar carrinho:', error);
      toast.error('Erro ao esvaziar carrinho.');
    }
  };

  const aplicarCupomVisitante = async (codigo: string, tipo: 'desconto' | 'entrega') => {
    if (!codigo.trim()) return;

    try {
      const { data, error } = await supabase
        .from('cupons_loja')
        .select('*')
        .eq('codigo_cupom', codigo.trim().toUpperCase())
        .maybeSingle();

      if (error || !data) {
        toast.error('Cupom invalido ou nao encontrado.');
        return;
      }

      const cupom = data as CupomLoja;
      const activatedCouponIds = JSON.parse(localStorage.getItem(GUEST_ACTIVATED_STORE_COUPONS_KEY) || '[]');
      const isActivated = Array.isArray(activatedCouponIds) && activatedCouponIds.includes(cupom.id);

      if (!isActivated) {
        toast.error('Ative este cupom primeiro na area de cupons da GSA Store.');
        return;
      }

      if (cupom.status !== 'ativo') return toast.error('Este cupom nao esta mais ativo.');
      if ((cupom.total_usos || 0) >= (cupom.limite_usos || 0)) return toast.error('Limite de uso do cupom esgotado.');
      if (cupom.data_validade) {
        const [year, month, day] = String(cupom.data_validade).split('T')[0].split('-').map(Number);
        const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
        if (expiryDate < new Date()) return toast.error('Cupom expirado.');
      }
      if (cupom.cliente_id) return toast.error('Este cupom e exclusivo para cliente logado.');

      if (tipo === 'desconto' && cupom.categoria_cupom === 'entrega') return toast.error('Este e um cupom de entrega.');
      if (tipo === 'entrega' && cupom.categoria_cupom !== 'entrega') return toast.error('Este nao e um cupom de entrega.');

      if (cupom.produto_id) {
        const itemNoCarrinho = cartItems.find((c: CartItem) => c.item_id === cupom.produto_id);
        if (!itemNoCarrinho) {
          toast.error('Este cupom e exclusivo para um item especifico. Adicione o item ao carrinho.');
          return;
        }
      }

      const temProdutosNoCarrinho = cartItems.some((c: CartItem) => c.tipo === 'produto');
      // Usa o subtotal real (preço promocional/efetivo já aplicado), igual ao restante do fluxo de checkout,
      // em vez do valor cheio, para não distorcer a validação de valor mínimo de compra.
      const subtotalCarrinho = roundMoney(cartItems.reduce((acc: number, cur: CartItem) => {
        if (cur.tipo === 'produto') {
          return acc + roundMoney(getProductQuantityPriceBreakdown(cur.item_detalhes as any, cur.quantidade).subtotalFinal);
        }
        return acc + roundMoney((cur.item_detalhes?.valor || 0) * cur.quantidade);
      }, 0));

      if (tipo === 'entrega') {
        if (!temProdutosNoCarrinho) return toast.error('Voce nao tem produtos fisicos no carrinho para usar cupom de entrega.');
        if (cupom.tipo_entrega === 'frete_gratis_minimo' && subtotalCarrinho < (cupom.valor_minimo_compra || 0)) {
          return toast.error(`A compra minima para este frete gratis e ${formatCurrency(cupom.valor_minimo_compra || 0)}.`);
        }
        setGuestCupomEntrega(cupom);
        setGuestCupomEntInput('');
        toast.success('Beneficio de entrega aplicado!');
      } else {
        // Cupom de desconto também deve respeitar o valor mínimo de compra configurado (mesma regra do checkout).
        if ((cupom.valor_minimo_compra || 0) > 0 && subtotalCarrinho < (cupom.valor_minimo_compra || 0)) {
          return toast.error(`A compra minima para usar este cupom e ${formatCurrency(cupom.valor_minimo_compra || 0)}.`);
        }
        setGuestCupomDesconto(cupom);
        setGuestCupomDescInput('');
        toast.success('Desconto aplicado com sucesso!');
      }
    } catch (error) {
      console.error('[GSAStore] Erro ao aplicar cupom visitante:', error);
      toast.error('Erro ao processar cupom.');
    }
  };

  const deferredSearch = React.useDeferredValue(search);
  const activeFiltro = route.query.filtro || '';

  const filteredItems = useMemo(() => {
    let base: any[] = [];
    if (activeTab === 'assinaturas') {
      base = assinaturas.map(a => ({ ...a, _tipo: 'assinatura' as ItemType }));
    } else {
      const prods = produtos.map(p => ({ ...p, _tipo: 'produto' as ItemType }));
      const subs = assinaturas.map(a => ({ ...a, _tipo: 'assinatura' as ItemType }));
      base = [...prods, ...subs];
    }

    if (deferredSearch) {
      const q = deferredSearch.toLowerCase().trim();
      if (q === 'eletrônicos' || q === 'eletronicos' || q === 'tecnologia') {
        base = base.filter(i => /fone|smart|tv|cabo|carregador|usb|eletr|airfryer|forno|mixer|bluetooth|caixa|led|bateria|sound|relogio|computador|notebook|teclado|mouse/i.test(i.nome || '') || i.categoria_id === 'c7abd6df-c781-44f3-9120-9983b720b6ef');
      } else if (q === 'casa & eletro' || q === 'casa' || q === 'casa e eletro' || q === 'eletro') {
        base = base.filter(i => /toalha|mesa|cama|manta|cozinha|panela|fritadeira|almofada|decor|tapete|organizador|lençol|copo|garrafa|xícara|prato|travesseiro|cortina/i.test(i.nome || ''));
      } else if (q === 'moda & estilo' || q === 'moda' || q === 'moda e estilo' || q === 'estilo') {
        base = base.filter(i => /camiset|sapato|bota|roupa|mochila|bolsa|calça|bermuda|tenis|vestido|jaqueta|meia|chinelo|sandalia|acessorio|cinto|carteira/i.test(i.nome || '') || i.categoria_id === 'e58c3ab6-f1c5-49df-8d31-54c16ec4c52b');
      } else if (q === 'beleza & saúde' || q === 'beleza' || q === 'saúde' || q === 'saude' || q === 'beleza e saude') {
        base = base.filter(i => /creme|colágeno|pele|cabelo|shampoo|perfume|beleza|anti-rugas|hidratante|maquiagem|facial|corpo|sabonete|condicionador|estética|vitamina|suplemento/i.test(i.nome || ''));
      } else {
        base = base.filter(i => 
          (i.nome && i.nome.toLowerCase().includes(q)) ||
          (i.descricao && i.descricao.toLowerCase().includes(q)) ||
          (i.categoria_nome && i.categoria_nome.toLowerCase().includes(q)) ||
          (i.loja_categoria?.nome && i.loja_categoria.nome.toLowerCase().includes(q))
        );
      }
    }

    if (selectedCategoriaId !== 'todas') {
      base = base.filter(i => i.categoria_id === selectedCategoriaId);
    }

    // Filtros Especiais da Loja (Ofertas Relâmpago, Mais Vendidos, Lançamentos, Recomendados)
    if (activeFiltro === 'ofertas') {
      const comDesconto = base.filter(i => 
        (Number(i.desconto_percentual || 0) > 0) || 
        (i.valor_promocional && Number(i.valor_promocional) < Number(i.valor)) ||
        Boolean(i.desconto_ativo)
      );

      if (comDesconto.length >= 6) {
        base = [...comDesconto];
        // Ordena estritamente por maior percentual de desconto (% OFF decrescente)
        base.sort((a, b) => {
          const discA = getProductDiscountPercentage(a);
          const discB = getProductDiscountPercentage(b);
          if (discB !== discA) return discB - discA;
          return Number(b.valor || 0) - Number(a.valor || 0);
        });
      } else {
        // Aplica ofertas relâmpago com percentuais variados e ordena pelo maior desconto
        const tiers = [35, 30, 28, 25, 22, 20, 18, 15];
        base = base.slice(0, 48).map((prod, idx) => {
          const pOrig = Number(prod.valor || 0);
          if (prod.valor_promocional && Number(prod.valor_promocional) < pOrig) return prod;
          const pct = tiers[idx % tiers.length];
          return {
            ...prod,
            desconto_percentual: pct,
            valor_promocional: Math.round(pOrig * (1 - pct / 100) * 100) / 100,
          };
        });
        base.sort((a, b) => {
          const discA = getProductDiscountPercentage(a);
          const discB = getProductDiscountPercentage(b);
          if (discB !== discA) return discB - discA;
          return Number(b.valor || 0) - Number(a.valor || 0);
        });
      }
    } else if (activeFiltro === 'novidades') {
      // Lançamentos: Ordena pelos produtos mais recentes cadastrados
      base.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
    } else if (activeFiltro === 'mais-vendidos') {
      // Mais Vendidos: Ordena pelos produtos com MAIOR AVALIAÇÃO EM ESTRELAS (5.0, 4.9, 4.8...) e volume de reviews
      base.sort((a, b) => {
        const ratA = calculateProductRating(a);
        const ratB = calculateProductRating(b);
        if (ratB.rating !== ratA.rating) {
          return ratB.rating - ratA.rating; // Maior nota de avaliação primeiro
        }
        if (ratB.totalCount !== ratA.totalCount) {
          return ratB.totalCount - ratA.totalCount; // Mais avaliações
        }
        const scoreA = (Number(a.total_vendas || a.vendas_count || 0) * 10) + (a.destaque ? 20 : 0);
        const scoreB = (Number(b.total_vendas || b.vendas_count || 0) * 10) + (b.destaque ? 20 : 0);
        return scoreB - scoreA;
      });
    } else if (activeFiltro === 'recomendados') {
      base.sort((a, b) => (Number(b.pontos_gsa || 0) + (b.destaque ? 100 : 0)) - (Number(a.pontos_gsa || 0) + (a.destaque ? 100 : 0)));
    }

    // Filtrar por faixa de preço
    if (minPrice !== '') {
      base = base.filter(i => {
        const price = i._tipo === 'produto' ? getProductEffectivePrice(i) : i.valor;
        return price >= Number(minPrice);
      });
    }
    if (maxPrice !== '') {
      base = base.filter(i => {
        const price = i._tipo === 'produto' ? getProductEffectivePrice(i) : i.valor;
        return price <= Number(maxPrice);
      });
    }

    // Ordenação explícita do usuário: só sobrescreve se o usuário escolheu uma ordenação no modal/URL
    const hasExplicitUserSort = Boolean(route.query.ordenacao);
    if (hasExplicitUserSort) {
      if (sortBy === 'price-desc') {
        base.sort((a, b) => {
          const pA = a._tipo === 'produto' ? getProductEffectivePrice(a) : a.valor;
          const pB = b._tipo === 'produto' ? getProductEffectivePrice(b) : b.valor;
          return (pB || 0) - (pA || 0);
        });
      } else if (sortBy === 'alpha-asc') {
        base.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      } else if (sortBy === 'alpha-desc') {
        base.sort((a, b) => (b.nome || '').localeCompare(a.nome || ''));
      } else if (sortBy === 'price-asc') {
        base.sort((a, b) => {
          const pA = a._tipo === 'produto' ? getProductEffectivePrice(a) : a.valor;
          const pB = b._tipo === 'produto' ? getProductEffectivePrice(b) : b.valor;
          return (pA || 0) - (pB || 0);
        });
      }
    } else if (!activeFiltro) {
      // Catálogo geral sem filtro temático: aplica ordenação padrão
      if (sortBy === 'price-asc') {
        base.sort((a, b) => {
          const pA = a._tipo === 'produto' ? getProductEffectivePrice(a) : a.valor;
          const pB = b._tipo === 'produto' ? getProductEffectivePrice(b) : b.valor;
          return (pA || 0) - (pB || 0);
        });
      } else if (sortBy === 'price-desc') {
        base.sort((a, b) => {
          const pA = a._tipo === 'produto' ? getProductEffectivePrice(a) : a.valor;
          const pB = b._tipo === 'produto' ? getProductEffectivePrice(b) : b.valor;
          return (pB || 0) - (pA || 0);
        });
      }
    }

    return base;
  }, [activeTab, deferredSearch, produtos, servicos, assinaturas, sortBy, minPrice, maxPrice, selectedCategoriaId, activeFiltro]);

  // Paginação progressiva para máxima performance na loja do cliente
  const [visibleCount, setVisibleCount] = useState(24);

  useEffect(() => {
    setVisibleCount(24);
  }, [activeTab, deferredSearch, selectedCategoriaId, sortBy, minPrice, maxPrice, activeFiltro]);

  const displayedItems = React.useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 pb-24 md:space-y-4 max-w-7xl mx-auto">
      {/* Barra de Ação Superior (Voltar + Filtros) */}
      <div className="flex items-center justify-between gap-4 mb-2">
        {onBack ? (
          <button 
            onClick={onBack}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-800 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span>Voltar</span>
          </button>
        ) : (
          <div />
        )}

        <button 
          onClick={() => updateRouteQuery({ modal: 'filtros' })}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold text-[#17345f] shadow-sm transition-all hover:bg-slate-50 cursor-pointer"
        >
          <SlidersHorizontal className="h-4 w-4 text-[#17345f]" />
          <span>Filtros e Ordenação</span>
        </button>
      </div>

      {/* Banner Exclusivo de Filtro (Ofertas Relâmpago / Mais Vendidos / Novidades / Recomendados) */}
      {activeFiltro && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#17345f] p-4 text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              {activeFiltro === 'ofertas' && <Zap className="h-6 w-6 text-amber-400 animate-bounce" />}
              {activeFiltro === 'mais-vendidos' && <TrendingUp className="h-6 w-6 text-emerald-400" />}
              {activeFiltro === 'novidades' && <Sparkles className="h-6 w-6 text-purple-300" />}
              {activeFiltro === 'recomendados' && <Star className="h-6 w-6 text-amber-300" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                {activeFiltro === 'ofertas' && '⚡ Ofertas Relâmpago Exclusivas'}
                {activeFiltro === 'mais-vendidos' && '🔥 Mais Vendidos da GSA Store'}
                {activeFiltro === 'novidades' && '✨ Lançamentos & Novidades'}
                {activeFiltro === 'recomendados' && '⭐ Recomendados para Você'}
              </h2>
              <p className="text-xs text-white/80 font-medium">
                {filteredItems.length} {filteredItems.length === 1 ? 'item encontrado nesta seleção' : 'itens encontrados nesta seleção'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateRouteQuery({ filtro: null })}
            className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-white/15 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/25 cursor-pointer"
          >
            <X className="h-4 w-4" />
            <span>Ver todos os produtos</span>
          </button>
        </div>
      )}



      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /></div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-24 bg-white/40 backdrop-blur-sm rounded-[3rem] border border-white/60">
          <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-neutral-300" />
          </div>
          <h3 className="text-xl font-black text-neutral-900">Oops! Nada encontrado</h3>
          <p className="text-neutral-500 mt-2 font-medium">Tente buscar por outro termo ou mude a categoria.</p>
        </div>
      ) : (
        <React.Suspense fallback={<div className="flex justify-center py-32"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /></div>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-5 lg:grid-cols-4 2xl:grid-cols-5">
            {displayedItems.map(item => (
              <StoreItemCard 
                key={`${item._tipo}-${item.id}`} 
                item={item} 
                tipo={item._tipo} 
                clientId={clientId}
                onAdd={() => addToCart(item, item._tipo)} 
                onClick={() => navigate(item._tipo === 'produto' ? routes.marketplace.store.product(item.id) : routes.marketplace.store.subscription(item.id))}
              />
            ))}
          </div>

          {/* Botão Carregar Mais Produtos para Alta Performance */}
          {visibleCount < filteredItems.length && (
            <div className="mt-8 flex justify-center">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setVisibleCount(v => v + 24)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#17345f] px-8 py-3.5 text-xs font-extrabold text-white shadow-lg shadow-[#17345f]/20 transition-all hover:bg-[#102746] active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Carregar Mais Produtos ({filteredItems.length - displayedItems.length} restantes)
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleCount(filteredItems.length)}
                  className="rounded-2xl border border-neutral-200 bg-white px-5 py-3.5 text-xs font-bold text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 active:scale-95 cursor-pointer"
                >
                  Ver Todos
                </button>
              </div>
            </div>
          )}
        </React.Suspense>
      )}

      {/* Floating Cart Button - Usando Portal para garantir que fique fixo na tela */}
      {cartItems.length > 0 && !isAnyModalOpen && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {(() => {
            let sizeClass = 'h-[50px] w-[50px]';
            let iconSize = 'w-6 h-6';
            let bottomOffset = waSettings.ativo ? 165 : 40; 
            let badgeSize = 'w-5 h-5';
            let badgeText = 'text-[9px]';

            if (waSettings.tamanho === 'P') { 
              sizeClass = 'h-[40px] w-[40px]'; 
              iconSize = 'w-5 h-5'; 
              bottomOffset = waSettings.ativo ? 155 : 40; 
              badgeSize = 'w-4 h-4';
              badgeText = 'text-[8px]';
            }
            if (waSettings.tamanho === 'G') { 
              sizeClass = 'h-[60px] w-[60px]'; 
              iconSize = 'w-7 h-7'; 
              bottomOffset = waSettings.ativo ? 175 : 40; 
              badgeSize = 'w-6 h-6';
              badgeText = 'text-[10px]';
            }

            const isLeft = waSettings.posicao === 'esquerda';

            return (
              <motion.div 
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                drag
                dragMomentum={false}
                whileDrag={{ cursor: 'grabbing', scale: 1.1, zIndex: 100000 }}
                className="fixed z-[99999] pointer-events-auto"
                style={{ 
                  bottom: `${bottomOffset}px`, 
                  [isLeft ? 'left' : 'right']: '1.5rem' 
                }}
              >
                <button 
                  onClick={() => updateRouteQuery({ modal: 'carrinho' })}
                  className={`group relative flex items-center justify-center ${sizeClass} bg-indigo-600 text-white rounded-full shadow-2xl ring-4 ring-white hover:bg-indigo-700 transition-all`}
                >
                  <ShoppingCart className={iconSize} />
                  <span className={`absolute -top-1 -right-1 flex items-center justify-center ${badgeSize} bg-red-500 text-white ${badgeText} font-black rounded-full ring-2 ring-white shadow-sm animate-bounce`}>
                    {cartItems.length}
                  </span>
                </button>
              </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}

      {/* Suspense wrapper para os modais que sofrem lazy load */}
      <React.Suspense fallback={null}>
        {/* Cart Drawer Modal */}
        <CartDrawer 
          isOpen={route.query.modal === 'carrinho'} 
          onClose={() => updateRouteQuery({ modal: null })} 
          cartItems={cartItems} 
          promosAplicadas={promosAplicadas}
          isGuest={!clientId}
          cupomDesconto={guestCupomDesconto}
          cupomEntrega={guestCupomEntrega}
          cupomDescInput={guestCupomDescInput}
          cupomEntInput={guestCupomEntInput}
          onCupomDescInputChange={setGuestCupomDescInput}
          onCupomEntInputChange={setGuestCupomEntInput}
          onApplyCoupon={aplicarCupomVisitante}
          onRemoveCoupon={(tipo: 'desconto' | 'entrega') => {
            if (tipo === 'desconto') setGuestCupomDesconto(null);
            if (tipo === 'entrega') setGuestCupomEntrega(null);
          }}
          onUpdateQuantity={updateCartQuantity} 
          onRemove={removeCartItem} 
          onClearCart={clearCart}
          onCheckout={() => {
            if (!clientId) {
              savePendingStoreCheckout(cartItems);
              toast('Entre ou cadastre-se para finalizar sua compra.');
              if (onRequireAuth) onRequireAuth();
              return;
            }

            navigate(routes.marketplace.store.checkout());
          }}
        />

        {/* Details Modal */}
        <ProductDetailsModal 
          isOpen={!!route.itemId && !['quantidade', 'duracao'].includes(route.query.modal || '')} 
          onClose={handleCloseItemDetails} 
          item={selectedItemForDetails?.item} 
          tipo={selectedItemForDetails?.tipo as ItemType}
          onAdd={() => {
            const item = selectedItemForDetails?.item;
            const tipo = selectedItemForDetails?.tipo as ItemType;
            void addToCart(item, tipo);
          }}
        />

        {/* Quantity Modal */}
        <QuantityModal 
          isOpen={route.query.modal === 'quantidade' && !!route.itemId} 
          onClose={() => updateRouteQuery({ modal: null })} 
          item={selectedItemForQty?.item} 
          initialQty={cartItems.find(c => c.item_id === selectedItemForQty?.item?.id)?.quantidade || 1}
          initialVariantId={cartItems.find(c => c.item_id === selectedItemForQty?.item?.id)?.produto_variante_id || null}
          onConfirm={(qty, variation) => confirmAddToCart(qty, undefined, variation)}
        />

        {/* Subscription Duration Modal */}
        <SubscriptionDurationModal 
          isOpen={route.query.modal === 'duracao' && !!route.itemId} 
          onClose={() => updateRouteQuery({ modal: null })} 
          item={selectedItemForDuration?.item} 
          initialDuration={cartItems.find(c => c.item_id === selectedItemForDuration?.item?.id)?.prazo_meses || 1}
          onConfirm={(months) => confirmAddToCart(1, months)} 
        />

        {/* Filter Modal */}
        <FilterModal
          isOpen={route.query.modal === 'filtros'}
          onClose={() => {
            handleApplyFilters(sortBy, minPrice, maxPrice);
            updateRouteQuery({ modal: null });
          }}
          sortBy={sortBy}
          setSortBy={setSortBy}
          minPrice={minPrice}
          setMinPrice={setMinPrice}
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          categories={categorias.filter(c => {
            const targetType = activeTab === 'produtos' ? 'produto' : 'assinatura';
            const t = c.tipo_item || c.tipo || 'todos';
            return t === targetType || t === 'todos' || t === 'ambos';
          })}
          selectedCategoryId={selectedCategoriaId}
          onSelectCategory={handleSelectCategory}
        />
      </React.Suspense>
    </div>
  );
}

// Subcomponent: Quantity Selection Modal

// Subcomponent: Store Item Card

// Subcomponent: Cart Drawer

// Subcomponent: Checkout Modal

// Subcomponent: Product Details Modal

// Subcomponent: Filter Modal

// Subcomponent: Available Coupons Modal


// Subcomponent: Subscription Duration Modal

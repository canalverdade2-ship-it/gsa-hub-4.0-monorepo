import React, { useState, useEffect, useRef } from 'react';
import { 
  Store, 
  Ticket, 
  RefreshCcw, 
  MessageSquare, 
  ShoppingBag, 
  Tag, 
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Package,
  CreditCard,
  History,
  X,
  Clock,
  Trash2,
  DollarSign,
  FileText,
  CheckCircle,
  XCircle,
  Calendar,
  User,
  FileCheck,
  Camera,
  Upload,
  Landmark,
  Search,
  Copy,
  Megaphone,
  Star,
  Heart
} from 'lucide-react';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { ClientGSAStore } from './ClientGSAStore';
import StoreHubCoupons from './store/StoreHubCoupons';
import StoreHubPurchases from './store/StoreHubPurchases';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, formatDateTime, generateCode, generateUUID } from '../../lib/utils';
import { getProductDiscountPercentage } from '../../lib/productPricing';
import { useAppLocation } from '../../routing/useAppLocation';
import { navigate } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';
import { toast } from 'react-hot-toast';
import { getProductDisplayCode } from '../../lib/productIdentification';
import { notificationService } from '../../lib/notificationService';
import { notifyWhatsAppModal } from '../ui/WhatsAppButton';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { uploadMultipleFiles } from '../../lib/uploadHelper';
import { callClientRpc } from '../../lib/clientRpc';
import { MarketplaceSubmoduleCard } from './marketplace/MarketplaceSubmoduleCard';

interface StoreHubProps {
  clientId?: string;
  onNavigate: (module: any, tab?: string, itemId?: string) => void;
  initialTab?: string;
  initialItemId?: string;
  onRequireAuth?: () => void;
  onBackToSite?: () => void;
  onBackToMarketplace?: () => void;
}

function parseDescricaoDetalhada(text: string) {
  if (!text) return null;
  try {
    const lines = text.split('\n');
    let tipo = '';
    let pedidoOrigem = '';
    let itensDevolvidos: string[] = [];
    let creditoTroca = '';
    let itensSubstitutos: string[] = [];
    let totalSubstitutos = '';
    let valorDiferenca = '';
    let faturaGerada = '';

    let currentSection = '';

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.startsWith('TIPO DA SOLICITAÇÃO:')) {
        tipo = line.replace('TIPO DA SOLICITAÇÃO:', '').trim();
        continue;
      }
      if (line.startsWith('PEDIDO DE ORIGEM:')) {
        pedidoOrigem = line.replace('PEDIDO DE ORIGEM:', '').trim();
        continue;
      }

      if (line.includes('--- ITENS PARA DEVOLUÇÃO ---')) {
        currentSection = 'devolucao';
        continue;
      }
      if (line.includes('--- NOVOS PRODUTOS SUBSTITUTOS ---')) {
        currentSection = 'substitutos';
        continue;
      }
      if (line.includes('--- RESUMO FINANCEIRO ---')) {
        currentSection = 'financeiro';
        continue;
      }

      if (currentSection === 'devolucao') {
        if (line.startsWith('-')) {
          itensDevolvidos.push(line.substring(1).trim());
        } else if (line.startsWith('Crédito de Troca:')) {
          creditoTroca = line.replace('Crédito de Troca:', '').trim();
        }
      } else if (currentSection === 'substitutos') {
        if (line.startsWith('-')) {
          itensSubstitutos.push(line.substring(1).trim());
        } else if (line.startsWith('Total Substitutos:')) {
          totalSubstitutos = line.replace('Total Substitutos:', '').trim();
        } else if (line.startsWith('Nenhum') || line.startsWith('Troca pelo mesmo')) {
          itensSubstitutos.push(line);
        }
      } else if (currentSection === 'financeiro') {
        if (line.startsWith('Valor da Diferença:')) {
          valorDiferenca = line.replace('Valor da Diferença:', '').trim();
        } else if (line.startsWith('Fatura de 2 dias gerada na aprovação:')) {
          faturaGerada = line.replace('Fatura de 2 dias gerada na aprovação:', '').trim();
        }
      }
    }

    return {
      tipo,
      pedidoOrigem,
      itensDevolvidos,
      creditoTroca,
      itensSubstitutos,
      totalSubstitutos,
      valorDiferenca,
      faturaGerada
    };
  } catch (err) {
    console.error('Erro ao processar descrição detalhada:', err);
    return null;
  }
}

export function StoreHub({ clientId, onNavigate, initialTab, initialItemId, onRequireAuth, onBackToSite, onBackToMarketplace }: StoreHubProps) {
  const route = useAppLocation();

  const [view, setView] = useState<'hub' | 'shop'>(initialTab === 'shop' || route.submodule?.includes('loja-produtos') || route.submodule?.includes('loja-assinaturas') ? 'shop' : 'hub');
  
  const [isCuponsModalOpen, setIsCuponsModalOpen] = useState(false);
  const [, setRtRefreshKey] = useState(0);
  useRealtimeSubscription([
    { table: 'produtos', onChange: () => setRtRefreshKey(k => k + 1) },
    { table: 'loja_carrinhos', onChange: () => setRtRefreshKey(k => k + 1) },
  ]);
  const [isTrocaModalOpen, setIsTrocaModalOpen] = useState(false);
  const [isPurchasesModalOpen, setIsPurchasesModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const hasAutoOpenedOrderIdRef = useRef<string | null>(null);

  const handleCloseOrderDetail = () => {
    setSelectedOrderDetail(null);
    if (route.query.orderId) {
      navigate(routes.marketplace.store.compras());
    }
  };
  const [faturasCredito, setFaturasCredito] = useState<any[]>([]);
  const [faturaRealDoPedido, setFaturaRealDoPedido] = useState<any>(null);
  const [selectedOrderTimeline, setSelectedOrderTimeline] = useState<any>(null);
  const [purchasesTab, setPurchasesTab] = useState<'pendentes' | 'cancelados'>('pendentes');
  const [cuponsTab, setCuponsTab] = useState<'ativos' | 'usados'>('ativos');

  const [isVipPromosModalOpen, setIsVipPromosModalOpen] = useState(false);
  const [vipPromos, setVipPromos] = useState<any[]>([]);
  const [promocoesAtivadas, setPromocoesAtivadas] = useState<Set<string>>(new Set());
  const [loadingVipPromos, setLoadingVipPromos] = useState(false);

  // Sincronização reativa com base na URL
  useEffect(() => {
    const protectedStoreRoutes = ['loja-compras', 'loja-trocas', 'loja-reembolsos'];
    if (!clientId && route.submodule && protectedStoreRoutes.includes(route.submodule)) {
      setIsPurchasesModalOpen(false);
      setIsTrocaModalOpen(false);
      setIsRefundsModalOpen(false);
      onRequireAuth?.();
      return;
    }

    // 1. Aba Principal da Loja
    if (route.submodule === 'loja-produtos' || route.submodule === 'loja-assinaturas') {
      setView('shop');
    } else {
      setView('hub');
    }

    // 2. Modais
    if (route.submodule === 'loja-compras') {
      setIsPurchasesModalOpen(true);
      if (route.itemId) {
        setSelectedOrderId(route.itemId);
      }
    } else {
      setIsPurchasesModalOpen(false);
    }

    if (route.submodule === 'loja-cupons') {
      setIsCuponsModalOpen(true);
    } else {
      setIsCuponsModalOpen(false);
    }

    if (route.submodule === 'loja-promocoes') {
      setIsVipPromosModalOpen(true);
    } else {
      setIsVipPromosModalOpen(false);
    }

    if (route.submodule === 'loja-trocas') {
      setIsTrocaModalOpen(true);
    } else {
      setIsTrocaModalOpen(false);
    }

    if (route.submodule === 'loja-reembolsos') {
      setIsRefundsModalOpen(true);
    } else {
      setIsRefundsModalOpen(false);
    }
  }, [route.submodule, route.itemId, clientId]);

  const handleCloseModals = () => {
    // Retorna para a página-base da loja
    if (route.submodule && route.submodule.startsWith('loja-')) {
      // Se estava no shop (produtos/assinaturas), mantém lá ao fechar modal
      if (window.location.pathname.includes('produtos')) {
        navigate(routes.marketplace.store.products());
      } else if (window.location.pathname.includes('assinaturas')) {
        navigate(routes.marketplace.store.subscriptions());
      } else {
        navigate(routes.marketplace.store.root());
      }
    }
  };

  const fetchVipPromos = async () => {
    setLoadingVipPromos(true);
    try {
      let clientePromosData: any[] = [];
      if (clientId) {
        const { data: cData, error: cError } = await supabase
          .from('cliente_promocoes')
          .select('*, promocoes(*)')
          .eq('cliente_id', clientId)
          .eq('status', 'ativa');

        if (cError) throw cError;
        clientePromosData = cData || [];
      }
      
      const { data: inteligentePromosData, error: inteligenteError } = await supabase
        .from('promocoes_quantidade')
        .select('*')
        .eq('status', 'ativa');
        
      if (inteligenteError) throw inteligenteError;
      
      const mappedInteligentes = (inteligentePromosData || []).map(pq => ({
        id: pq.id,
        is_inteligente: true,
        visualizado: true,
        data_expiracao: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
        promocoes: {
          tipo: pq.tipo_promocao,
          titulo: pq.nome,
          descricao: pq.descricao,
          tipo_desconto: pq.desconto_tipo || 'nenhum',
          valor_desconto: pq.desconto_valor || 0
        }
      }));

      if (clientId) {
        try {
          const { data: ativadasData, error: ativadasError } = await supabase
            .from('promocoes_quantidade_ativadas')
            .select('promocao_quantidade_id')
            .eq('cliente_id', clientId);
            
          if (!ativadasError && ativadasData) {
            setPromocoesAtivadas(new Set(ativadasData.map(a => a.promocao_quantidade_id)));
          }
        } catch (e) {
          console.error('Tabela promocoes_quantidade_ativadas não encontrada:', e);
        }
      }

      setVipPromos([...clientePromosData, ...mappedInteligentes]);
    } catch (err) {
      console.error('Erro ao carregar promoções VIP:', err);
    } finally {
      setLoadingVipPromos(false);
    }
  };

  const handleAtivarPromocao = async (promocaoId: string) => {
    if (!clientId) {
      if (onRequireAuth) onRequireAuth();
      return;
    }
    try {
      try {
        await clientOperationalWrite(clientId, 'promocoes_quantidade_ativadas', 'insert', { promocao_quantidade_id: promocaoId });
      } catch (error: any) {
        if (!String(error?.message || '').includes('duplicate')) throw error;
      }
      setPromocoesAtivadas(prev => new Set([...prev, promocaoId]));
      toast.success('Promoção ativada com sucesso!');
      window.dispatchEvent(new CustomEvent('promo-ativada', { detail: { id: promocaoId } }));
    } catch (err) {
      console.error('Erro ao ativar promoção:', err);
      toast.error('Erro ao ativar promoção.');
    }
  };

  const handleOpenVipPromos = async () => {
    setIsVipPromosModalOpen(true);
    if (!clientId) return;
    const unread = vipPromos.filter(p => p.visualizado === false && !p.is_inteligente);
    if (unread.length > 0) {
      await Promise.all(unread.map(u => clientOperationalWrite(clientId, 'cliente_promocoes', 'update', { visualizado: true }, { id: u.id })));
      setVipPromos(prev => prev.map(p => p.is_inteligente ? p : { ...p, visualizado: true }));
    }
  };

  const hasUnreadPromos = vipPromos.some(p => p.visualizado === false);
  
  const [isRefundsModalOpen, setIsRefundsModalOpen] = useState(false);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loadingRefunds, setLoadingRefunds] = useState(false);

  const fetchMyRefunds = async () => {
    setLoadingRefunds(true);
    try {
      const data = await callClientRpc<any[]>('gsa_client_store_refunds');
      setRefunds(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar reembolsos do cliente:', err);
    } finally {
      setLoadingRefunds(false);
    }
  };

  // Data states
  const [cupons, setCupons] = useState<any[]>([]);
  const [cuponsAtivados, setCuponsAtivados] = useState<Set<string>>(new Set());
  const [cuponsUsados, setCuponsUsados] = useState<Set<string>>(new Set());
  const [ativandoCupom, setAtivandoCupom] = useState<string | null>(null);
  const [copiedCupomId, setCopiedCupomId] = useState<string | null>(null);
  const [promocoesUso, setPromocoesUso] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [allPurchases, setAllPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [pointsDiscountValue, setPointsDiscountValue] = useState<number | null>(null);
  const [walletDiscountValue, setWalletDiscountValue] = useState<number>(0);
  const [selectedCupomDesconto, setSelectedCupomDesconto] = useState<any>(null);
  const [selectedCupomEntrega, setSelectedCupomEntrega] = useState<any>(null);
  const [selectedUsedCupomId, setSelectedUsedCupomId] = useState<string | null>(null);
  const [cancelRequestOrder, setCancelRequestOrder] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelObservation, setCancelObservation] = useState<string>('');
  const [isCancelingPaidOrder, setIsCancelingPaidOrder] = useState(false);
  
  const groupedPurchases = (allPurchases: any[]) => {
    const groups: Record<string, any[]> = {};
    allPurchases.forEach(p => {
      const code = p.codigo_orcamento || p.id;
      if (!groups[code]) groups[code] = [];
      groups[code].push(p);
    });
    return Object.entries(groups).map(([code, items]) => {
      const total = items.reduce((acc, curr) => acc + curr.total, 0);
      const status = items.every(i => i.status === 'pago') ? 'pago' : 
                     items.some(i => i.status === 'cancelado') ? 'cancelado' : 
                     items[0].status;
      return {
        ...items[0],
        id: items[0].id,
        codigo_orcamento: code,
        items,
        total,
        status
      };
    }).sort((a, b) => new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime());
  };

  const buildInvoiceItemsFromOrder = (order: any) => {
    const sourceItems = Array.isArray(order?.ordens_items) && order.ordens_items.length > 0
      ? order.ordens_items
      : Array.isArray(order?.items)
        ? order.items.flatMap((item: any) => item?.ordens_items?.length ? item.ordens_items : [item])
        : [];

    const normalizedItems = sourceItems.map((item: any) => {
      const itemType = item.tipo === 'assinatura' || !!item.assinaturas
        ? 'assinatura'
        : item.tipo === 'servico' || !!item.servicos
          ? 'servico'
          : 'produto';
      const itemData = itemType === 'assinatura'
        ? item.assinaturas
        : itemType === 'servico'
          ? item.servicos
          : item.produtos;
      const quantidade = Number(item.quantidade || 1);
      const valorUnitario = Number(
        itemData?.valor ??
        item.valor_unitario ??
        item.valor ??
        (item.subtotal ? Number(item.subtotal) / Math.max(quantidade, 1) : 0)
      );

      return {
        id: item.id,
        codigo: itemData?.codigo_assinatura || itemData?.codigo_servico || (itemType === 'produto' && itemData ? getProductDisplayCode(itemData as any) : itemData?.codigo_produto) || item.codigo || itemType.toUpperCase(),
        descricao: itemData?.nome || item.nome || item.descricao || item.descricao_solicitacao?.split(' x')[0] || item.titulo_solicitacao || 'Item do Pedido',
        valor_unitario: valorUnitario,
        quantidade,
        subtotal: Number(item.subtotal ?? valorUnitario * quantidade),
        tipo: itemType,
        is_brinde: item.is_brinde,
      };
    }).filter((item: any) => item.descricao && item.quantidade > 0);

    const hasUsableValues = normalizedItems.some((item: any) => Number(item.subtotal || item.valor_unitario || 0) > 0);
    if (hasUsableValues) return normalizedItems;

    const quantidade = Number(order?.quantidade || sourceItems.reduce((acc: number, item: any) => acc + Number(item.quantidade || 0), 0) || 1);
    const total = Number(order?.total || 0);
    if (total > 0) {
      return [{
        codigo: order?.codigo_orcamento || 'PEDIDO',
        descricao: `Pedido GSA Store ${order?.codigo_orcamento || ''}`.trim(),
        valor_unitario: total / Math.max(quantidade, 1),
        quantidade,
        subtotal: total,
        tipo: 'produto',
      }];
    }

    return normalizedItems;
  };

  // Troca form state
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [trocaType, setTrocaType] = useState<'troca' | 'devolucao'>('troca');
  const [metodoEntrega, setMetodoEntrega] = useState<'correios' | 'pessoalmente'>('correios');
  const [trocaReason, setTrocaReason] = useState('');
  const [isSubmittingTroca, setIsSubmittingTroca] = useState(false);
  const [trocaImages, setTrocaImages] = useState<File[]>([]);
  const [trocaImagePreviews, setTrocaImagePreviews] = useState<string[]>([]);

  // Novos estados para fluxo avançado de trocas
  const [exchangeActiveTab, setExchangeActiveTab] = useState<'nova' | 'acompanhar'>('nova');
  const [myExchangeRequests, setMyExchangeRequests] = useState<any[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState(false);
  const [selectedExchangeItems, setSelectedExchangeItems] = useState<string[]>([]);
  const [exchangeProductOption, setExchangeProductOption] = useState<'mesmo_produto' | 'outro_produto'>('mesmo_produto');
  const [exchangeCart, setExchangeCart] = useState<any[]>([]);
  const [storeProducts, setStoreProducts] = useState<any[]>([]);
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [showNewProductSelector, setShowNewProductSelector] = useState(false);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [submittingTracking, setSubmittingTracking] = useState<Record<string, boolean>>({});
  const exchangeRequestId = useRef(generateUUID());

  const handleSendClientTracking = async (reqId: string, codigoRastreio: string) => {
    if (!codigoRastreio.trim()) {
      toast.error('Insira o código de rastreio.');
      return;
    }
    setSubmittingTracking(prev => ({ ...prev, [reqId]: true }));
    try {
      await callClientRpc('gsa_client_submit_exchange_tracking', {
        p_solicitacao_id: reqId,
        p_codigo_rastreio: codigoRastreio.trim(),
      });
      toast.success('Código de rastreio de devolução enviado!');
      fetchMyExchanges();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar rastreio.');
    } finally {
      setSubmittingTracking(prev => ({ ...prev, [reqId]: false }));
    }
  };

  const fetchMyExchanges = async () => {
    setLoadingExchanges(true);
    try {
      const { data, error } = await supabase
        .from('loja_solicitacoes')
        .select(`
          *,
          orcamento_origem:orcamento_origem_id(
            codigo_orcamento,
            total,
            origem_gsa_store
          )
        `)
        .eq('cliente_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyExchangeRequests(data || []);
    } catch (err) {
      console.error('Erro ao carregar solicitações de troca:', err);
    } finally {
      setLoadingExchanges(false);
    }
  };

  const fetchStoreProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('status', 'ativo')
        .eq('visivel_na_loja', true);
      if (error) throw error;
      // Produtos esgotados não podem ser escolhidos como substitutos em uma troca.
      const disponiveis = (data || []).filter((p: any) => !p.controle_estoque || Number(p.estoque_disponivel || 0) > 0);
      const sorted = disponiveis.sort((a: any, b: any) => {
        const descA = getProductDiscountPercentage(a);
        const descB = getProductDiscountPercentage(b);
        if (descB !== descA) return descB - descA;
        return (a.nome || '').localeCompare(b.nome || '');
      });
      setStoreProducts(sorted);
    } catch (err) {
      console.error('Erro ao buscar produtos da loja:', err);
    }
  };

  const closeTrocaModal = () => {
    setIsTrocaModalOpen(false);
    setSelectedOrder(null);
    setTrocaReason('');
    setTrocaImages([]);
    setTrocaImagePreviews([]);
    setExchangeActiveTab('nova');
    setSelectedExchangeItems([]);
    setExchangeProductOption('mesmo_produto');
    setExchangeCart([]);
    setSearchProductQuery('');
    setShowNewProductSelector(false);
  };

  const handleImageChange = (e: any) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files) as File[];
    
    if (trocaImages.length + files.length > 5) {
      toast.error('Você pode anexar no máximo 5 imagens.');
      return;
    }

    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    files.forEach((file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`O arquivo ${file.name} não é uma imagem válida.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`A imagem ${file.name} excede o limite de 5MB.`);
        return;
      }
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    });

    setTrocaImages(prev => [...prev, ...newFiles]);
    setTrocaImagePreviews(prev => [...prev, ...newPreviews]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(trocaImagePreviews[index]);
    setTrocaImages(prev => prev.filter((_, i) => i !== index));
    setTrocaImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    // Notifica o botão WhatsApp quando modais de loja abrirem (para subir o botão e não obstruir)
    if (isCuponsModalOpen || isTrocaModalOpen || isPurchasesModalOpen || isRefundsModalOpen) {
      notifyWhatsAppModal(true);
    } else {
      notifyWhatsAppModal(false);
    }

        if (isVipPromosModalOpen) fetchVipPromos();
    if (isTrocaModalOpen) {
      fetchRecentOrders();
      fetchStoreProducts();
      fetchMyExchanges();
    }
    if (isPurchasesModalOpen) fetchAllPurchases();
    if (isRefundsModalOpen) fetchMyRefunds();

    if (!clientId) {
      return () => notifyWhatsAppModal(false);
    }

    // Inscrição Realtime para atualizações de pedidos
    const channel = supabase
      .channel(`purchases-${clientId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orcamentos',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchAllPurchases();
        fetchRecentOrders();
      })
      .subscribe();

    // Inscrição Realtime para reembolsos
    const refundsChannel = supabase
      .channel(`refunds-${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'loja_reembolsos',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchMyRefunds();
      })
      .subscribe();

    // Inscrição Realtime para promoções VIP
    const promosChannel = supabase
      .channel(`promos-${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cliente_promocoes',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchVipPromos();
      })
      .subscribe();

    // Inscrição Realtime para solicitações de troca/devolução do cliente
    const exchangesChannel = supabase
      .channel(`exchanges-${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'loja_solicitacoes',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchMyExchanges();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(refundsChannel);
      supabase.removeChannel(promosChannel);
      supabase.removeChannel(exchangesChannel);
      notifyWhatsAppModal(false);
    };

  }, [isCuponsModalOpen, isTrocaModalOpen, isPurchasesModalOpen, isRefundsModalOpen, isVipPromosModalOpen, clientId]);

  useEffect(() => {
    if (initialTab === 'acompanhar') {
      setIsTrocaModalOpen(true);
      setExchangeActiveTab('acompanhar');
    } else if (initialTab === 'compras' || route.query.orderId || route.submodule === 'loja-compras') {
      setIsPurchasesModalOpen(true);
      fetchAllPurchases();
    }
  }, [initialTab, route.query.orderId, route.submodule]);

  // Se vier com orderId na URL, abre automaticamente o modal com os detalhes daquela compra (apenas uma vez)
  useEffect(() => {
    const targetOrderId = route.query.orderId || initialItemId;
    if (targetOrderId && allPurchases.length > 0 && !selectedOrderDetail && hasAutoOpenedOrderIdRef.current !== targetOrderId) {
      const match = allPurchases.find(p => p.id === targetOrderId || p.codigo_orcamento === targetOrderId);
      if (match) {
        hasAutoOpenedOrderIdRef.current = targetOrderId;
        setSelectedOrderDetail(match);
      }
    }
  }, [route.query.orderId, initialItemId, allPurchases, selectedOrderDetail]);

  useEffect(() => {
    if (selectedOrderDetail) {
      setPointsDiscountValue(null);
      setSelectedCupomDesconto(null);
      setSelectedCupomEntrega(null);
      
      const loadDetails = async () => {
        const code = selectedOrderDetail.codigo_orcamento;
        
        // 1. Fetch points discount
        if (code) {
          try {
            const { data, error } = await supabase
              .from('points_transactions')
              .select('pontos')
              .eq('cliente_id', clientId)
              .like('descricao', `%#${code}%`)
              .limit(1)
              .maybeSingle();

            if (data && !error) {
              setPointsDiscountValue(Math.abs(data.pontos) * 0.01);
            } else {
              const { data: dataMov, error: errorMov } = await supabase
                .from('pontos_movimentacoes')
                .select('pontos')
                .eq('cliente_id', clientId)
                .like('descricao', `%#${code}%`)
                .limit(1)
                .maybeSingle();
                
              if (dataMov && !errorMov) {
                setPointsDiscountValue(Math.abs(dataMov.pontos) * 0.01);
              } else {
                setPointsDiscountValue(0);
              }
            }
          } catch (err) {
            console.error('Erro ao buscar desconto de pontos:', err);
            setPointsDiscountValue(0);
          }
        } else {
          setPointsDiscountValue(0);
        }

        // 1.5 Fetch wallet discount
        try {
          const { data: extData, error: extErr } = await supabase
            .from('extrato_financeiro')
            .select('valor')
            .eq('referencia_id', selectedOrderDetail.id)
            .eq('tipo', 'saida');
          if (extData && !extErr && extData.length > 0) {
            const totalCarteira = extData.reduce((acc, curr) => acc + Number(curr.valor), 0);
            setWalletDiscountValue(totalCarteira);
          } else {
            setWalletDiscountValue(0);
          }
        } catch (err) {
          setWalletDiscountValue(0);
        }

        // 2. Fetch coupon details if present
        if (selectedOrderDetail.cupom_desconto_id) {
          try {
            const { data, error } = await supabase
              .from('cupons_loja')
              .select('*')
              .eq('id', selectedOrderDetail.cupom_desconto_id)
              .single();
            if (data && !error) {
              setSelectedCupomDesconto(data);
            }
          } catch (err) {
            console.error('Erro ao carregar cupom de desconto:', err);
          }
        }

        // 3. Fetch delivery coupon details if present
        if (selectedOrderDetail.cupom_entrega_id) {
          try {
            const { data, error } = await supabase
              .from('cupons_loja')
              .select('*')
              .eq('id', selectedOrderDetail.cupom_entrega_id)
              .single();
            if (data && !error) {
              setSelectedCupomEntrega(data);
            }
          } catch (err) {
            console.error('Erro ao carregar cupom de entrega:', err);
          }
        }

        // 4. Fetch GSA Credit invoices
        if (code) {
          try {
            const cleanCode = code.startsWith('#') ? code.substring(1) : code;
            const { data } = await supabase
              .from('faturas')
              .select('*')
              .eq('cliente_id', clientId)
              .eq('is_amortizacao_credito', true)
              .like('codigo_fatura', `%CRE-${cleanCode}%`)
              .order('data_vencimento', { ascending: true });
            
            // Forçar ordenação numérica pela parcela no código da fatura (ex: 1/12, 10/12)
            const sorted = (data || []).sort((a: any, b: any) => {
              const getParcela = (cod: string) => {
                const match = cod?.match(/-(\d+)\/\d+/);
                return match ? parseInt(match[1], 10) : 0;
              };
              return getParcela(a.codigo_fatura) - getParcela(b.codigo_fatura);
            });
            
            setFaturasCredito(sorted);
          } catch (err) {
            console.error('Erro ao carregar faturas de crédito:', err);
            setFaturasCredito([]);
          }
        } else {
          setFaturasCredito([]);
        }

        // 5. Buscar fatura real do pedido para pegar forma_pagamento_escolhida (independente da busca de crédito)
        try {
          const { data: invoiceByOrder } = await supabase
            .from('faturas')
            .select('id, status, forma_pagamento_escolhida, data_pagamento, valor_total')
            .eq('orcamento_id', selectedOrderDetail.id)
            .neq('status', 'cancelado')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (invoiceByOrder) {
            setFaturaRealDoPedido(invoiceByOrder);
            return;
          }

          // Se for assinatura, as faturas já foram carregadas
          const itemAssinatura = selectedOrderDetail.ordens_items?.find((i: any) => i.tipo === 'assinatura');
          if (itemAssinatura && itemAssinatura.faturas && itemAssinatura.faturas.length > 0) {
            const paidFatura = itemAssinatura.faturas.find((f: any) => f.status === 'pago');
            const sortedFaturas = [...itemAssinatura.faturas].sort((a,b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime());
            setFaturaRealDoPedido(paidFatura || sortedFaturas[0]);
            return;
          }

          const { data: ocs } = await supabase
            .from('ordens_compra').select('id').eq('orcamento_id', selectedOrderDetail.id);
          const { data: oas } = await supabase
            .from('ordens_assinatura').select('id').eq('orcamento_id', selectedOrderDetail.id);
          const ocIds = (ocs || []).map((o: any) => o.id);
          const oaIds = (oas || []).map((o: any) => o.id);
          
          if (ocIds.length > 0 || oaIds.length > 0) {
            const filters: string[] = [];
            if (ocIds.length > 0) filters.push(`ordem_compra_id.in.(${ocIds.join(',')})`);
            if (oaIds.length > 0) filters.push(`ordem_assinatura_id.in.(${oaIds.join(',')})`);
            const { data: fatReal } = await supabase
              .from('faturas')
              .select('id, status, forma_pagamento_escolhida, data_pagamento, valor_total')
              .or(filters.join(','))
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            setFaturaRealDoPedido(fatReal || null);
          } else {
            setFaturaRealDoPedido(null);
          }
        } catch (err) {
          console.error('Erro ao buscar fatura real do pedido:', err);
          setFaturaRealDoPedido(null);
        }

        // 6. Fetch promos usages
        try {
          const { data: usos, error } = await supabase
            .from('promocoes_quantidade_uso')
            .select('*')
            .eq('orcamento_id', selectedOrderDetail.id);

          if (usos && !error) {
            const promoIds = [...new Set(usos.map((uso: any) => uso.promocao_id).filter(Boolean))];
            const { data: promos } = promoIds.length > 0
              ? await supabase
                .from('promocoes_quantidade')
                .select('id, nome, tipo_promocao, desconto_tipo, desconto_valor')
                .in('id', promoIds)
              : { data: [] as any[] };

            const promosById = new Map((promos || []).map((promo: any) => [promo.id, promo]));
            setPromocoesUso(usos.map((uso: any) => ({
              ...uso,
              promocoes_quantidade: promosById.get(uso.promocao_id) || null
            })));
          } else {
            setPromocoesUso([]);
          }
        } catch (err) {
          console.error('Erro ao buscar promocoes de uso:', err);
          setPromocoesUso([]);
        }
      };
      
      loadDetails();
    } else {
      setPointsDiscountValue(null);
      setWalletDiscountValue(0);
      setSelectedCupomDesconto(null);
      setSelectedCupomEntrega(null);
      setFaturasCredito([]);
      setFaturaRealDoPedido(null);
      setPromocoesUso([]);
    }
  }, [selectedOrderDetail, clientId]);

  const fetchAllPurchases = async () => {
    setLoading(true);
    try {
      const { data: orcamentos, error } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('cliente_id', clientId)
        .eq('origem_gsa_store', true)
        .order('data_criacao', { ascending: false });

      if (error) throw error;

      const ids = (orcamentos || []).map(o => o.id);

      // Buscar ordens vinculadas com detalhes do produto/assinatura
      const [ocsRes, oasRes, normalizedRes] = await Promise.all([
        ids.length > 0
          ? supabase.from('ordens_compra').select('*, produtos(nome, imagem_url, codigo_produto, codigo_barras, identificador_preferencial, valor)').in('orcamento_id', ids)
          : Promise.resolve({ data: [] }),
        ids.length > 0
          ? supabase.from('ordens_assinatura').select('*, assinaturas(nome, imagem_url, codigo_assinatura, valor), faturas(*)').in('orcamento_id', ids)
          : Promise.resolve({ data: [] }),
        ids.length > 0
          ? supabase.from('loja_pedido_itens').select('*').in('orcamento_id', ids).order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      const ocsByOrc = (ocsRes.data || []).reduce((acc: any, oc: any) => {
        if (!acc[oc.orcamento_id]) acc[oc.orcamento_id] = [];
        acc[oc.orcamento_id].push({ ...oc, tipo: 'produto' });
        return acc;
      }, {});

      const oasByOrc = (oasRes.data || []).reduce((acc: any, oa: any) => {
        if (!acc[oa.orcamento_id]) acc[oa.orcamento_id] = [];
        acc[oa.orcamento_id].push({ ...oa, tipo: 'assinatura' });
        return acc;
      }, {});

      const normalizedByOrc = (normalizedRes.data || []).reduce((acc: any, item: any) => {
        if (!acc[item.orcamento_id]) acc[item.orcamento_id] = [];
        acc[item.orcamento_id].push({
          ...item,
          descricao: item.nome,
        });
        return acc;
      }, {});

      const enriched = (orcamentos || []).map(orc => ({
        ...orc,
        ordens_items: normalizedByOrc[orc.id]?.length
          ? normalizedByOrc[orc.id].map((item: any) => ({ ...item, status: orc.status }))
          : [...(ocsByOrc[orc.id] || []), ...(oasByOrc[orc.id] || [])],
      }));

      // Auto-cancelar pedidos expirados
      const now = new Date();
      const updated = enriched.map(order => {
        const created = new Date(order.data_criacao);
        const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
        const isCredit = order.descricao_adicional?.includes('Crédito GSA');
        if (!isCredit && order.status === 'aberto' && hoursDiff > 24) {
          return { ...order, status: 'cancelado', is_expired: true };
        }
        return order;
      });

      setAllPurchases(updated);

      const expiredIds = (orcamentos || [])
        .filter(order => {
          const created = new Date(order.data_criacao);
          const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
          const isCredit = order.descricao_adicional?.includes('Crédito GSA');
          return !isCredit && order.status === 'aberto' && hoursDiff > 24;
        })
        .map(o => o.id);

      if (expiredIds.length > 0) processAutoCancellation(expiredIds);

    } catch (error) {
      console.error('Erro ao buscar compras:', error);
    } finally {
      setLoading(false);
    }
  };

  // Evita disparar o cancelamento automático mais de uma vez para o mesmo pedido
  // (fetchAllPurchases roda a cada evento realtime).
  const autoCancelledRef = React.useRef<Set<string>>(new Set());

  const processAutoCancellation = async (ids: string[]) => {
    const pendentes = ids.filter((id) => !autoCancelledRef.current.has(id));
    if (pendentes.length === 0) return;
    pendentes.forEach((id) => autoCancelledRef.current.add(id));
    try {
      for (const id of pendentes) {
        await callClientRpc('gsa_client_cancel_store_order', {
          p_orcamento_id: id, 
          p_motivo: 'Cancelamento automático por prazo de pagamento expirado',
        });
      }
    } catch (error) {
      console.error('Erro no processamento de auto-cancelamento:', error);
      pendentes.forEach((id) => autoCancelledRef.current.delete(id));
    }
  };


  const handlePayOrder = async (groupedOrder: any) => {
    setIsProcessingPayment(true);
    try {
      const data = await callClientRpc<any>('gsa_client_generate_store_invoice', {
        p_orcamento_id: groupedOrder.id,
      });

      if (!data?.success) {
        throw new Error('Erro ao gerar fatura do pedido.');
      }

      const faturaId = data.fatura_id;
      toast.success(data.already_exists ? 'Redirecionando para a fatura existente...' : 'Fatura gerada! Redirecionando para o pagamento...');
      onNavigate('financeiro', 'faturas', faturaId);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao processar pagamento.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleProcessPaidCancellation = async () => {
    if (!cancelRequestOrder || !cancelReason) {
      toast.error('Por favor, selecione uma justificativa.');
      return;
    }
    if (cancelReason === 'OUTRO MOTIVO' && !cancelObservation.trim()) {
      toast.error('Por favor, detalhe o motivo do cancelamento.');
      return;
    }

    setIsCancelingPaidOrder(true);
    try {
      const order = cancelRequestOrder;
      const motivoFinal = cancelReason === 'OUTRO MOTIVO' ? cancelObservation : cancelReason;

      const data = await callClientRpc<any>('gsa_client_cancel_store_order', {
        p_orcamento_id: order.id, 
        p_motivo: motivoFinal,
      });

      if (!data?.success) throw new Error('Não foi possível cancelar o pedido.');

      toast.success('Pedido cancelado e reembolso gerado!');
      
      setCancelRequestOrder(null);
      setCancelReason('');
      setCancelObservation('');
      
      fetchAllPurchases();
      setIsPurchasesModalOpen(false); // fechar compras
      setIsRefundsModalOpen(true);    // abrir reembolsos
      fetchMyRefunds();

    } catch (err: any) {
      console.error('Erro ao processar cancelamento e reembolso:', err);
      toast.error(err.message || 'Ocorreu um erro ao cancelar o pedido.');
    } finally {
      setIsCancelingPaidOrder(false);
    }
  };

  const handleCancelOrder = async (groupedOrder: any) => {
    if (!confirm('Tem certeza que deseja cancelar este pedido?')) return;
    
    setLoading(true);
    try {
      const data = await callClientRpc<any>('gsa_client_cancel_store_order', {
        p_orcamento_id: groupedOrder.id, 
        p_motivo: 'Cancelado pelo cliente antes do pagamento',
      });

      if (!data?.success) throw new Error('Não foi possível cancelar o pedido.');

      toast.success('Pedido cancelado com sucesso.');
      fetchAllPurchases();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao cancelar pedido.');
    } finally {
      setLoading(false);
    }
  };

  
  
  const fetchRecentOrders = async () => {
    setLoading(true);
    try {
      // Buscando solicitações de troca/devolução já existentes do cliente
      const { data: existingExchanges } = await supabase
        .from('loja_solicitacoes')
        .select('orcamento_origem_id, status')
        .eq('cliente_id', clientId);

      // Solicitações rejeitadas não devem bloquear uma nova tentativa de troca/devolução
      // dentro do prazo de 7 dias, senão o cliente fica travado para sempre.
      const existingExchangeIds = new Set(
        (existingExchanges || [])
          .filter(ex => ex.status !== 'rejeitado')
          .map(ex => ex.orcamento_origem_id)
          .filter(Boolean)
      );

      // Buscando orçamentos da loja (categoria 'loja' ou 'produto')
      const { data: orcamentos, error } = await supabase
        .from('orcamentos')
        .select('*')
        .eq('cliente_id', clientId)
        .in('categoria', ['produto', 'loja'])
        .order('data_criacao', { ascending: false });

      if (error) throw error;

      if (orcamentos && orcamentos.length > 0) {
        // Filtrar orçamentos que já possuem solicitação de troca/devolução
        const filteredOrcamentos = orcamentos.filter(orc => !existingExchangeIds.has(orc.id));

        if (filteredOrcamentos.length > 0) {
          const ids = filteredOrcamentos.map(o => o.id);
          const { data: ocs } = await supabase
            .from('ordens_compra')
            .select('*, produtos(*)')
            .in('orcamento_id', ids);

          const enriched = filteredOrcamentos
            .map(orc => {
              const items = (ocs || []).filter((oc: any) => oc.orcamento_id === orc.id);
              const orderStatus = items[0]?.status || orc.status;
              
              // Somente pedidos com status 'concluido' (Pedido Entregue) são elegíveis para Troca ou Devolução
              if (orderStatus !== 'concluido') return null;

              const firstProduct = items[0]?.produtos;
              const productNames = items.map((it: any) => it.produtos?.nome).filter(Boolean).join(', ');
              
              // Cálculo do prazo de 7 dias após o pedido ser entregue/concluído.
              // Usa apenas a data de entrega quando disponível e conta dias inteiros
              // de forma consistente entre "expirado" e "dias restantes".
              const deliveryDateStr = orc.data_entrega || orc.updated_at || orc.data_criacao;
              const deliveryDate = new Date(deliveryDateStr);
              const deadline = new Date(deliveryDate.getTime() + 7 * 24 * 60 * 60 * 1000);
              const msRestantes = deadline.getTime() - Date.now();
              const isExpired = !deliveryDateStr || isNaN(deliveryDate.getTime()) || msRestantes <= 0;
              const daysRemaining = isExpired ? 0 : Math.ceil(msRestantes / (1000 * 60 * 60 * 24));

              
              return {
                ...orc,
                produtos: firstProduct ? { nome: productNames || firstProduct.nome } : null,
                items: items,
                isExpired,
                daysRemaining,
                deliveryDateStr
              };
            })
            .filter(Boolean) as any[];
          
          setRecentOrders(enriched);
        } else {
          setRecentOrders([]);
        }
      } else {
        setRecentOrders([]);
      }
    } catch (error) {
      console.error('Erro ao buscar pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTroca = async () => {
    if (!selectedOrder || !trocaReason.trim()) {
      toast.error('Por favor, selecione um pedido e informe o motivo.');
      return;
    }

    // Revalida o prazo de 7 dias no momento do envio (o modal pode ficar aberto por muito tempo).
    if (selectedOrder.isExpired) {
      toast.error('O prazo de 7 dias após a entrega para solicitar troca ou devolução deste pedido já expirou.');
      return;
    }


    if (selectedExchangeItems.length === 0) {
      toast.error('Selecione pelo menos 1 item do pedido para realizar a troca ou devolução.');
      return;
    }

    if (trocaType === 'troca' && exchangeProductOption === 'outro_produto' && exchangeCart.length === 0) {
      toast.error('Adicione pelo menos 1 produto substituto da loja.');
      return;
    }

    if (trocaImages.length === 0) {
      toast.error('É obrigatório anexar pelo menos 1 imagem do produto.');
      return;
    }

    if (trocaImages.length > 5) {
      toast.error('O limite máximo é de 5 imagens.');
      return;
    }

    setIsSubmittingTroca(true);
    try {
      // Upload de imagens isolado no Helper (Performance & DRY)
      const uploadedUrls = await uploadMultipleFiles(trocaImages, 'gsa-store-images', 'trocas', clientId || 'guest');

      await callClientRpc('gsa_client_request_store_exchange', {
        p_request_id: exchangeRequestId.current,
        p_orcamento_id: selectedOrder.id,
        p_tipo: trocaType,
        p_motivo: trocaReason,
        p_imagens_anexo: uploadedUrls,
        p_metodo_entrega: metodoEntrega,
        p_itens_devolvidos: selectedExchangeItems,
        p_opcao_substituicao: trocaType === 'troca' ? exchangeProductOption : null,
        p_novos_produtos: exchangeProductOption === 'outro_produto'
          ? exchangeCart.map((c: any) => ({ produto_id: c.produto.id, quantidade: c.quantidade }))
          : [],
      });
      exchangeRequestId.current = generateUUID();

      toast.success('Solicitação de troca enviada com sucesso! Entre na aba "Acompanhar" para ver a linha do tempo.');
      closeTrocaModal();
      fetchMyExchanges();
    } catch (error: any) {
      console.error('Erro ao enviar troca:', error);
      toast.error(error.message || 'Erro ao processar solicitação.');
    } finally {
      setIsSubmittingTroca(false);
    }
  };

  if (view === 'shop') {
    return (
      <div className="relative px-3 pt-3 sm:px-0 sm:pt-0">
        <ClientGSAStore 
          clientId={clientId || ''} 
          onRequireAuth={onRequireAuth}
          onBack={() => setView('hub')}
          initialAssinaturaId={view === 'shop' && initialTab === 'shop' && initialItemId ? initialItemId : undefined}
          onSuccess={(orderId) => {
            if (orderId) {
              navigate(routes.marketplace.store.orderSuccess(orderId));
            } else {
              navigate(routes.marketplace.store.orderSuccess('unknown'));
            }
          }}
        />
      </div>
    );
  }

  const storeHubCards = [
    {
      id: 'loja',
      icon: ShoppingBag,
      title: 'Acessar Loja',
      description: 'Explore produtos e assinaturas disponíveis.',
      actionLabel: 'Entrar na loja',
      categoryLabel: 'Produtos',
      image: '/images/marketplace/submodules/store/acessar-loja.jpg?v=2',
      imageAlt: 'Loja contemporânea com produtos selecionados',
      accentColor: '#4f46e5',
      visible: true,
      badge: null,
      onClick: () => navigate(routes.marketplace.root()),
    },
    {
      id: 'compras',
      icon: History,
      title: 'Minhas Compras',
      description: 'Acompanhe seus pedidos recentes.',
      actionLabel: 'Ver pedidos',
      categoryLabel: 'Pedidos',
      image: '/images/marketplace/submodules/store/minhas-compras.jpg',
      imageAlt: 'Pedidos organizados para acompanhamento de entrega',
      accentColor: '#171717',
      visible: Boolean(clientId),
      badge: null,
      onClick: () => navigate(routes.marketplace.store.compras()),
    },
    {
      id: 'favoritos',
      icon: Heart,
      title: 'Meus Favoritos',
      description: 'Veja os produtos que você salvou com o coração.',
      actionLabel: 'Ver favoritos',
      categoryLabel: 'Desejos',
      image: '/images/marketplace/submodules/store/acessar-loja.jpg?v=2',
      imageAlt: 'Produtos favoritados pelo cliente',
      accentColor: '#e11d48',
      visible: Boolean(clientId),
      badge: null,
      onClick: () => navigate(routes.marketplace.store.wishlist()),
    },
    {
      id: 'cupons',
      icon: Ticket,
      title: 'Meus Cupons',
      description: 'Consulte benefícios disponíveis para você.',
      actionLabel: 'Ver cupons',
      categoryLabel: 'Benefícios',
      image: '/images/marketplace/submodules/store/meus-cupons.jpg?v=2',
      imageAlt: 'Voucher de benefício apresentado em embalagem elegante',
      accentColor: '#db2777',
      visible: true,
      badge: null,
      onClick: () => navigate(routes.marketplace.store.cupons()),
    },
    {
      id: 'promocoes',
      icon: Megaphone,
      title: 'Promoções',
      description: 'Veja ofertas e condições especiais.',
      actionLabel: 'Ver promoções',
      categoryLabel: 'Ofertas',
      image: '/images/marketplace/submodules/store/promocoes.jpg?v=2',
      imageAlt: 'Vitrine digital com produtos variados e marcadores de desconto',
      accentColor: '#7c3aed',
      visible: true,
      badge: hasUnreadPromos ? (
        <span className="relative flex h-3 w-3" aria-label="Novas promoções">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
      ) : null,
      onClick: () => navigate(routes.marketplace.store.promocoes()),
    },
    {
      id: 'trocas',
      icon: RefreshCcw,
      title: 'Trocas e Devoluções',
      description: 'Gerencie suas solicitações de troca.',
      actionLabel: 'Acessar',
      categoryLabel: 'Pós-venda',
      image: '/images/marketplace/submodules/store/trocas-devolucoes.jpg',
      imageAlt: 'Atendimento para troca e devolução de um pedido',
      accentColor: '#d97706',
      visible: Boolean(clientId),
      badge: null,
      onClick: () => navigate(routes.marketplace.store.trocas()),
    },
    {
      id: 'reembolsos',
      icon: DollarSign,
      title: 'Meus Reembolsos',
      description: 'Acompanhe estornos e prazos.',
      actionLabel: 'Acompanhar',
      categoryLabel: 'Financeiro',
      image: '/images/marketplace/submodules/store/reembolsos.jpg',
      imageAlt: 'Confirmação segura de reembolso de uma compra',
      accentColor: '#7c3aed',
      visible: Boolean(clientId),
      badge: null,
      onClick: () => navigate(routes.marketplace.store.reembolsos()),
    },
    {
      id: 'credito',
      icon: Landmark,
      title: 'Meu Crédito',
      description: 'Consulte e gerencie seu limite de compras.',
      actionLabel: 'Gerenciar',
      categoryLabel: 'Crédito',
      image: '/images/marketplace/submodules/store/credito.jpg',
      imageAlt: 'Cartão de compra e produtos em um caixa organizado',
      accentColor: '#4f46e5',
      visible: Boolean(clientId),
      badge: null,
      onClick: () => navigate(routes.client.finance.credito()),
    },
    {
      id: 'suporte',
      icon: MessageSquare,
      title: 'Suporte',
      description: 'Receba atendimento da equipe GSA.',
      actionLabel: 'Pedir ajuda',
      categoryLabel: 'Atendimento',
      image: '/images/marketplace/submodules/store/suporte.jpg',
      imageAlt: 'Especialista prestando suporte ao cliente da loja',
      accentColor: '#0284c7',
      visible: true,
      badge: null,
      onClick: () => {
        if (!clientId) {
          onRequireAuth?.();
          return;
        }
        navigate(routes.client.support());
      },
    },
  ].filter((card) => card.visible);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-20 max-w-6xl mx-auto md:space-y-8">
      {(onBackToSite || onBackToMarketplace || onRequireAuth || clientId) && (
        <div className="mx-2 flex items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white/90 p-2 shadow-sm backdrop-blur md:mx-4 md:rounded-full">
          <div className="flex items-center gap-2">
            {clientId && (
              <button
                onClick={() => navigate(routes.client.dashboard())}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-bold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-950 md:flex-none md:rounded-full md:px-4 md:text-sm"
              >
                <ChevronRight className="h-4 w-4 shrink-0 rotate-180" />
                <span className="truncate">Painel do Cliente</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onBackToMarketplace ? (
              <button
                onClick={onBackToMarketplace}
                className="hidden md:inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-bold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-950 md:flex-none md:rounded-full md:px-4 md:text-sm"
              >
                <span className="truncate">Voltar ao Marketplace</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            ) : onBackToSite && (
              <button
                onClick={onBackToSite}
                className="hidden md:inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-bold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-950 md:flex-none md:rounded-full md:px-4 md:text-sm"
              >
                <span className="truncate">Voltar</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            )}
            {!clientId && onRequireAuth && (
              <button
                onClick={onRequireAuth}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-black md:flex-none md:rounded-full md:px-4 md:text-sm"
              >
                <span className="truncate">Entrar</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            )}
          </div>
        </div>
      )}
      {/* Título Luxuoso e Elegante */}
      <div className="text-center pt-2 md:pt-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-3"
        >
          <div className="inline-flex items-center gap-2 bg-[#17345f]/10 border border-[#17345f]/20 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest text-[#17345f]">
            <ShoppingBag className="h-3.5 w-3.5 text-[#d8bd73]" />
            <span>Central do Marketplace</span>
          </div>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-[#0c2340] leading-tight">
            GSA Store <span className="text-[#d8bd73]">Hub</span>
          </h2>
          <p className="max-w-lg mx-auto text-xs md:text-sm text-neutral-500 font-medium leading-relaxed">
            Acesse seus pedidos, cupons, crédito e atendimento pós-venda em um só lugar.
          </p>
          <div className="h-1 w-16 bg-[#d8bd73] mx-auto rounded-full mt-4"></div>
        </motion.div>
      </div>

      {/* Módulos da Loja */}
      <div className="grid grid-cols-1 gap-4 px-2 sm:grid-cols-2 md:gap-5 md:px-0 lg:grid-cols-4">
        {storeHubCards.map((card, index) => (
          <MarketplaceSubmoduleCard
            key={card.id}
            icon={card.icon}
            title={card.title}
            description={card.description}
            actionLabel={card.actionLabel}
            image={card.image}
            imageAlt={card.imageAlt}
            categoryLabel={card.categoryLabel}
            onClick={card.onClick}
            accentColor={card.accentColor}
            badge={card.badge}
            index={index}
          />
        ))}
      </div>
      {/* Modais */}
      
      {/* Modal de Cupons */}
      <StoreHubCoupons isOpen={isCuponsModalOpen} onClose={() => setIsCuponsModalOpen(false)} clientId={clientId} />

      {/* Modal de Trocas */}
      <Modal isOpen={isTrocaModalOpen} onClose={closeTrocaModal} title="Solicitar Troca ou Devolução" size="wide">
        <div className="space-y-6">
          {/* Navegação por Abas do Modal */}
          <div className="flex p-1 bg-neutral-100 rounded-2xl gap-1">
            <button
              onClick={() => setExchangeActiveTab('nova')}
              className={`flex-1 py-3 text-center text-xs font-black uppercase tracking-widest rounded-xl transition-all ${exchangeActiveTab === 'nova' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
            >
              Nova Solicitação
            </button>
            <button
              onClick={() => { setExchangeActiveTab('acompanhar'); fetchMyExchanges(); }}
              className={`flex-1 py-3 text-center text-xs font-black uppercase tracking-widest rounded-xl transition-all ${exchangeActiveTab === 'acompanhar' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
            >
              Acompanhar Solicitações ({myExchangeRequests.length})
            </button>
          </div>

          {exchangeActiveTab === 'nova' ? (
            <div className="space-y-6">
              <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 mb-2">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 leading-relaxed font-medium">
                    Selecione um pedido finalizado, escolha quais itens deseja trocar ou devolver, e defina se prefere trocar pelo mesmo produto ou por outros produtos da nossa loja.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">1. Selecione o Pedido</label>
            {loading ? (
              <div className="h-20 bg-neutral-100 rounded-2xl animate-pulse"></div>
            ) : recentOrders.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {recentOrders.map((order) => (
                  <div 
                    key={order.id} 
                    onClick={() => {
                      if (!order.isExpired) {
                        setSelectedOrder(order);
                        setSelectedExchangeItems([]);
                        setExchangeCart([]);
                      }
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      order.isExpired 
                        ? 'bg-neutral-50 border-neutral-150 text-neutral-400 cursor-not-allowed opacity-75' 
                        : selectedOrder?.id === order.id 
                          ? 'border-indigo-500 bg-indigo-50/50 cursor-pointer' 
                          : 'border-neutral-100 bg-white hover:border-neutral-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">#{order.codigo_orcamento}</span>
                          {order.isExpired ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 ring-1 ring-rose-200/50">
                              Atenção: Prazo Expirado (7 dias)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50">
                              âœ“ Disponível (Restam {order.daysRemaining} {order.daysRemaining === 1 ? 'dia' : 'dias'})
                            </span>
                          )}
                        </div>
                        <h5 className={`font-bold text-sm ${order.isExpired ? 'text-neutral-500' : 'text-neutral-900'}`}>{order.produtos?.nome || 'Pedido de Produto'}</h5>
                        <p className="text-[10px] text-neutral-400 font-medium">
                          Entregue em: {order.deliveryDateStr ? formatDate(order.deliveryDateStr) : formatDate(order.data_criacao)}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className={`text-sm font-black ${order.isExpired ? 'text-neutral-500' : 'text-neutral-900'}`}>{formatCurrency(order.total)}</span>
                        {selectedOrder?.id === order.id && !order.isExpired && <CheckCircle2 className="w-5 h-5 text-indigo-500" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 italic p-4 bg-neutral-50 rounded-xl text-center">Nenhum pedido finalizado encontrado para troca.</p>
            )}
          </div>

          {selectedOrder && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-4 border-t border-neutral-100">
              {/* Seleção de itens do pedido */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">2. Selecione os itens a trocar/devolver</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedExchangeItems((selectedOrder.items || []).map((it: any) => it.id))}
                      className="text-[10px] font-black text-indigo-600 uppercase hover:underline"
                    >
                      Selecionar Todos
                    </button>
                    <span className="text-neutral-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedExchangeItems([])}
                      className="text-[10px] font-black text-neutral-500 uppercase hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                  {selectedOrder.items?.map((item: any) => {
                    const isChecked = selectedExchangeItems.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedExchangeItems(prev => prev.filter(id => id !== item.id));
                          } else {
                            setSelectedExchangeItems(prev => [...prev, item.id]);
                          }
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer ${isChecked ? 'border-indigo-500 bg-indigo-50/10' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <p className="text-xs font-bold text-neutral-900">{item.produtos?.nome}</p>
                            <p className="text-[10px] text-neutral-400 font-medium">Qtd: {item.quantidade || 1} | Unitário: {formatCurrency(item.produtos?.valor || 0)}</p>
                          </div>
                        </div>
                        <span className="text-xs font-black text-neutral-900">{formatCurrency((item.produtos?.valor || 0) * (item.quantidade || 1))}</span>
                      </div>
                    );
                  })}
                </div>

                {selectedExchangeItems.length > 0 && (() => {
                  const creditoTroca = selectedOrder.items
                    .filter((it: any) => selectedExchangeItems.includes(it.id))
                    .reduce((acc: number, curr: any) => acc + (curr.produtos?.valor || 0) * (curr.quantidade || 1), 0);
                  return (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-150 flex justify-between items-center">
                      <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">Crédito Gerado:</span>
                      <span className="text-sm font-black text-emerald-700">{formatCurrency(creditoTroca)}</span>
                    </div>
                  );
                })()}
              </div>

              {selectedExchangeItems.length > 0 && (
                <>
                  {/* Tipo de Solicitação */}
                  <div className="space-y-3">
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">3. Tipo da Solicitação</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        type="button"
                        onClick={() => setTrocaType('troca')}
                        className={`py-3 rounded-xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${trocaType === 'troca' ? 'bg-[#1a1a1a] border-[#1a1a1a] text-white shadow-lg' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                      >
                        Realizar Troca
                      </button>
                      <button 
                        type="button"
                        onClick={() => setTrocaType('devolucao')}
                        className={`py-3 rounded-xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${trocaType === 'devolucao' ? 'bg-amber-600 border-amber-600 text-white shadow-lg' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                      >
                        Realizar Devolução
                      </button>
                    </div>
                  </div>

                  {/* Opções de Substituição para Troca */}
                  {trocaType === 'troca' && (
                    <div className="space-y-3">
                      <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">4. Substituição do Produto</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => {
                            setExchangeProductOption('mesmo_produto');
                            setExchangeCart([]);
                          }}
                          className={`py-3 rounded-xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${exchangeProductOption === 'mesmo_produto' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                        >
                          Trocar pelo Mesmo Produto
                        </button>
                        <button
                          type="button"
                          onClick={() => setExchangeProductOption('outro_produto')}
                          className={`py-3 rounded-xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${exchangeProductOption === 'outro_produto' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                        >
                          Trocar por Outros da Loja
                        </button>
                      </div>

                      {exchangeProductOption === 'outro_produto' && (
                        <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black text-neutral-700 uppercase tracking-wider">Produtos Substitutos</span>
                            <button
                              type="button"
                              onClick={() => setShowNewProductSelector(!showNewProductSelector)}
                              className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-3 py-1.5 rounded-xl uppercase transition-colors"
                            >
                              {showNewProductSelector ? 'Ocultar Seletor' : '+ Adicionar Produto'}
                            </button>
                          </div>

                          {showNewProductSelector && (
                            <div className="space-y-3 bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                              <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
                                <input
                                  type="text"
                                  placeholder="Pesquise por nome do produto..."
                                  value={searchProductQuery}
                                  onChange={e => setSearchProductQuery(e.target.value)}
                                  className="w-full pl-9 pr-4 py-2 border border-neutral-200 rounded-xl text-xs"
                                />
                              </div>

                              <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {storeProducts
                                  .filter(p => p.nome.toLowerCase().includes(searchProductQuery.toLowerCase()))
                                  .map(prod => {
                                    const isInCart = exchangeCart.some(it => it.produto.id === prod.id);
                                    return (
                                      <div key={prod.id} className="flex justify-between items-center p-2 rounded-lg border border-neutral-100 hover:bg-neutral-50">
                                        <div className="flex items-center gap-2">
                                          {prod.imagem_url && <img src={prod.imagem_url} alt={prod.nome} className="w-8 h-8 rounded object-cover" />}
                                          <div>
                                            <p className="text-xs font-bold text-neutral-800 leading-tight">{prod.nome}</p>
                                            <p className="text-[10px] text-neutral-500 font-mono font-medium">{formatCurrency(prod.valor)}</p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          disabled={isInCart}
                                          onClick={() => {
                                            setExchangeCart(prev => [...prev, { produto: prod, quantity: 1, quantidade: 1 }]);
                                            toast.success(`${prod.nome} selecionado.`);
                                          }}
                                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${isInCart ? 'bg-neutral-100 text-neutral-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                        >
                                          {isInCart ? 'Selecionado' : 'Escolher'}
                                        </button>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

                          {exchangeCart.length > 0 ? (
                            <div className="space-y-2">
                              {exchangeCart.map((item, idx) => (
                                <div key={item.produto.id} className="flex items-center justify-between p-3 bg-white border border-neutral-100 rounded-xl">
                                  <div className="flex items-center gap-3">
                                    {item.produto.imagem_url && <img src={item.produto.imagem_url} alt={item.produto.nome} className="w-10 h-10 rounded object-cover" />}
                                    <div>
                                      <p className="text-xs font-bold text-neutral-900 leading-tight">{item.produto.nome}</p>
                                      <p className="text-[10px] text-neutral-500 font-medium">{formatCurrency(item.produto.valor)}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (item.quantidade > 1) {
                                            setExchangeCart(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: it.quantidade - 1 } : it));
                                          } else {
                                            setExchangeCart(prev => prev.filter((_, i) => i !== idx));
                                          }
                                        }}
                                        className="px-2.5 py-1 text-xs font-bold hover:bg-neutral-200 transition-colors"
                                      >
                                        -
                                      </button>
                                      <span className="px-3 text-xs font-bold text-neutral-800">{item.quantidade}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setExchangeCart(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: it.quantidade + 1 } : it));
                                        }}
                                        className="px-2.5 py-1 text-xs font-bold hover:bg-neutral-200 transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setExchangeCart(prev => prev.filter((_, i) => i !== idx))}
                                      className="text-neutral-400 hover:text-rose-600 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}

                              {(() => {
                                const totalNovosProdutos = exchangeCart.reduce((sum, item) => sum + item.produto.valor * item.quantidade, 0);
                                const creditoTroca = selectedOrder.items
                                  .filter((it: any) => selectedExchangeItems.includes(it.id))
                                  .reduce((acc: number, curr: any) => acc + (curr.produtos?.valor || 0) * (curr.quantidade || 1), 0);
                                const diferenca = totalNovosProdutos - creditoTroca;
                                const isValorMenor = totalNovosProdutos < creditoTroca;

                                return (
                                  <div className="pt-3 border-t border-neutral-200 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-neutral-500 font-bold">Total Novos Produtos:</span>
                                      <span className="font-black text-neutral-900">{formatCurrency(totalNovosProdutos)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-neutral-500 font-bold">Crédito de Troca:</span>
                                      <span className="font-black text-neutral-900">- {formatCurrency(creditoTroca)}</span>
                                    </div>

                                    {diferenca > 0 ? (
                                      <div className="p-3 bg-blue-50 border border-blue-150 rounded-xl space-y-1">
                                        <div className="flex justify-between items-center text-xs text-blue-900 font-black">
                                          <span>Diferença a Pagar:</span>
                                          <span>{formatCurrency(diferenca)}</span>
                                        </div>
                                        <p className="text-[10px] text-blue-700 leading-normal">
                                          Atenção: <strong>Atenção:</strong> Será gerada uma fatura referente à diferença de <strong>{formatCurrency(diferenca)}</strong> com vencimento em <strong>2 dias</strong> após a aprovação do Sistema.
                                        </p>
                                      </div>
                                    ) : isValorMenor ? (
                                      <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl">
                                        <p className="text-[10px] text-rose-700 leading-normal font-bold">
                                          âœ• A soma dos novos produtos ({formatCurrency(totalNovosProdutos)}) deve ser <strong>igual ou maior</strong> ao crédito de troca ({formatCurrency(creditoTroca)}). Adicione mais produtos substitutos.
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl">
                                        <p className="text-[10px] text-emerald-700 leading-normal font-bold">
                                          âœ“ Valor da troca equivale exatamente ao crédito. Nenhuma cobrança adicional será gerada.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-500 italic text-center py-4 bg-white rounded-xl border border-neutral-150">
                              Nenhum produto substituto selecionado. Adicione clicando no botão acima.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Método de Entrega */}
                  <div>
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-3">5. Método de Devolução</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setMetodoEntrega('correios')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col gap-1 ${
                          metodoEntrega === 'correios' ? 'border-indigo-600 bg-indigo-50/50' : 'border-neutral-200 bg-white hover:border-indigo-300 hover:bg-neutral-50'
                        }`}
                      >
                        <span className={`text-sm font-black ${metodoEntrega === 'correios' ? 'text-indigo-900' : 'text-neutral-700'}`}> Via Correios</span>
                        <span className="text-[10px] text-neutral-500 font-medium">Você envia pelos correios e solicita o reembolso do frete na aba de Reembolsos.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetodoEntrega('pessoalmente')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col gap-1 ${
                          metodoEntrega === 'pessoalmente' ? 'border-indigo-600 bg-indigo-50/50' : 'border-neutral-200 bg-white hover:border-indigo-300 hover:bg-neutral-50'
                        }`}
                      >
                        <span className={`text-sm font-black ${metodoEntrega === 'pessoalmente' ? 'text-indigo-900' : 'text-neutral-700'}`}> Presencial na GSA</span>
                        <span className="text-[10px] text-neutral-500 font-medium">Agendaremos uma data e hora para você comparecer à sede.</span>
                      </button>
                    </div>
                  </div>

                  {/* Motivo */}
                  <div>
                    <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block mb-2">6. Motivo da Solicitação</label>
                    <textarea 
                      value={trocaReason}
                      onChange={(e) => setTrocaReason(e.target.value)}
                      placeholder="Explique detalhadamente o motivo da troca ou devolução do produto..."
                      className="w-full bg-white border border-neutral-200 rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                      rows={3}
                    />
                  </div>

                  {/* Imagens */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">
                        7. Imagens do Produto <span className="text-rose-500 font-bold">* Obrigatório (Mínimo 1, Máximo 5)</span>
                      </label>
                      <span className="text-[11px] font-bold text-[#1a1a1a] bg-neutral-100 px-2 py-0.5 rounded-full">
                        {trocaImages.length} de 5
                      </span>
                    </div>

                    {trocaImages.length < 5 && (
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-neutral-200 rounded-2xl cursor-pointer hover:bg-neutral-50 hover:border-indigo-400 transition-all group p-4">
                        <div className="flex flex-col items-center justify-center text-center">
                          <Upload className="w-5 h-5 text-indigo-600 mb-1 group-hover:scale-110 transition-transform" />
                          <span className="text-xs font-bold text-neutral-700">Selecione fotos do produto</span>
                        </div>
                        <input 
                          type="file" 
                          multiple 
                          accept="image/*" 
                          onChange={handleImageChange} 
                          className="hidden" 
                        />
                      </label>
                    )}

                    {trocaImagePreviews.length > 0 && (
                      <div className="grid grid-cols-5 gap-3 pt-2">
                        {trocaImagePreviews.map((preview, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-neutral-200 group bg-neutral-50 shadow-sm animate-in zoom-in-95 duration-200">
                            <img 
                              src={preview} 
                              alt={`Preview ${idx + 1}`} 
                              className="w-full h-full object-cover" 
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="absolute top-1 right-1 p-1.5 rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 transition-colors opacity-90 hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Botões de Ação */}
                  <div className="flex gap-4 pt-4 border-t border-neutral-100">
                    <button 
                      onClick={closeTrocaModal}
                      className="flex-1 py-4 bg-neutral-100 text-neutral-600 font-bold rounded-2xl hover:bg-neutral-200 transition-all text-xs uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                    <button 
                      disabled={
                        isSubmittingTroca || 
                        !trocaReason.trim() || 
                        trocaImages.length === 0 || 
                        (trocaType === 'troca' && exchangeProductOption === 'outro_produto' && (exchangeCart.length === 0 || (exchangeCart.reduce((sum, item) => sum + item.produto.valor * item.quantidade, 0) < (selectedOrder.items?.filter((it: any) => selectedExchangeItems.includes(it.id)).reduce((acc: number, curr: any) => acc + (curr.produtos?.valor || 0) * (curr.quantidade || 1), 0) || 0))))
                      }
                      onClick={handleSubmitTroca}
                      className="flex-[2] py-4 bg-[#1a1a1a] text-white font-bold rounded-2xl hover:bg-black transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                    >
                      {isSubmittingTroca ? 'Enviando...' : 'Enviar Solicitação'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}
          </div>
          ) : (
            /* Aba Acompanhar Solicitações */
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {loadingExchanges ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : myExchangeRequests.length > 0 ? (
                <div className="space-y-4">
                  {myExchangeRequests.map((req) => {
                    const isCorreios = req.metodo_entrega !== 'pessoalmente'; // default to correios for legacy
                    const statusSteps = isCorreios ? [
                      { key: 'solicitado', label: 'Solicitado', desc: 'Em Análise' },
                      { key: 'aprovado', label: 'Aprovado', desc: 'Aguardando Pag./Instruções' },
                      { key: 'aguardando_devolucao', label: 'Postagem', desc: 'Postar nos Correios' },
                      { key: 'devolucao_recebida', label: 'Conferência', desc: 'Em Análise na GSA' },
                      { key: 'novo_produto_enviado', label: 'Enviado', desc: 'Novo produto a caminho' },
                      { key: 'concluido', label: 'Concluído', desc: 'Troca finalizada' }
                    ] : [
                      { key: 'solicitado', label: 'Solicitado', desc: 'Em Análise' },
                      { key: 'aprovado', label: 'Aprovado', desc: 'Aguardando Pag./Instruções' },
                      { key: 'agendado', label: 'Agendado', desc: 'Entrega Marcada' },
                      { key: 'concluido', label: 'Concluído', desc: 'Troca presencial feita' }
                    ];

                    let activeStep = 0;
                    if (req.status === 'aprovado' || req.status === 'aguardando_instrucoes') activeStep = 1;
                    if (req.status === 'aguardando_devolucao' || req.status === 'devolucao_postada') activeStep = 2;
                    if (req.status === 'agendado') activeStep = 2;
                    if (req.status === 'devolucao_recebida') activeStep = 3;
                    if (req.status === 'novo_produto_enviado') activeStep = 4;
                    if (req.status === 'concluido') activeStep = isCorreios ? 5 : 3;
                    if (req.status === 'rejeitado') activeStep = 1;

                    return (
                      <div key={req.id} className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-sm space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
                              Solicitação #{req.codigo_solicitacao || 'N/A'}
                            </span>
                            <h4 className="text-sm font-black text-neutral-900 tracking-tight mt-1 uppercase">
                              Tipo: {req.tipo}
                            </h4>
                          </div>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                            req.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' :
                            req.status === 'rejeitado' ? 'bg-rose-50 text-rose-700' :
                            req.status === 'concluido' ? 'bg-purple-50 text-purple-700' :
                            req.status === 'em_analise' ? 'bg-blue-50 text-blue-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {req.status}
                          </span>
                        </div>

                        {/* Linha do Tempo Visual */}
                        <div className="pt-2 pb-4 border-b border-neutral-100">
                          <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest block mb-4">Acompanhamento</span>
                          <div className="flex justify-between items-start relative">
                            {/* Linha de progresso no fundo */}
                            <div className="absolute top-3.5 left-4 right-4 h-0.5 bg-neutral-100 -z-10" />
                            {/* Linha ativa */}
                            <div 
                              className="absolute top-3.5 left-4 h-0.5 bg-indigo-600 -z-10 transition-all duration-500" 
                              style={{ width: `${(activeStep / (statusSteps.length - 1)) * 100}%` }}
                            />

                            {statusSteps.map((step, idx) => {
                              const isCompleted = idx <= activeStep;
                              const isCurrent = idx === activeStep;
                              const isRejeitadoStep = req.status === 'rejeitado' && idx === 1;

                              const getStepDate = (stepKey: string) => {
                                if (!isCompleted && !isCurrent) return null;
                                const historico = req.historico_status || {};
                                let dateStr = historico[stepKey];
                                if (stepKey === 'aprovado' && !dateStr && historico['aguardando_instrucoes']) dateStr = historico['aguardando_instrucoes'];
                                if (stepKey === 'aguardando_devolucao' && !dateStr && historico['devolucao_postada']) dateStr = historico['devolucao_postada'];
                                if (!dateStr) {
                                  if (stepKey === 'solicitado') dateStr = req.created_at;
                                  else if (isCurrent) dateStr = req.updated_at;
                                }
                                if (!dateStr) return null;
                                try {
                                  const d = new Date(dateStr);
                                  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                                } catch { return null; }
                              };
                              const stepDate = getStepDate(step.key);

                              return (
                                <div key={step.key} className="flex flex-col items-center text-center max-w-[80px]">
                                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                                    isRejeitadoStep ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-200' :
                                    isCurrent ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 scale-110' :
                                    isCompleted ? 'bg-indigo-50 border-indigo-600 text-indigo-600' :
                                    'bg-white border-neutral-200 text-neutral-300'
                                  }`}>
                                    {isRejeitadoStep ? (
                                      <XCircle className="w-4 h-4" />
                                    ) : isCompleted ? (
                                      <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                      <span className="text-xs font-bold">{idx + 1}</span>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-black mt-2 leading-none ${
                                    isRejeitadoStep ? 'text-rose-600' :
                                    isCurrent ? 'text-indigo-600' :
                                    isCompleted ? 'text-neutral-800' : 'text-neutral-400'
                                  }`}>
                                    {isRejeitadoStep ? 'Rejeitado' : step.label}
                                  </span>
                                  <span className="text-[8px] text-neutral-400 mt-1 leading-normal hidden sm:block">
                                    {isRejeitadoStep ? 'Solicitação não aceita' : step.desc}
                                  </span>
                                  {stepDate && (
                                    <span className="text-[8px] font-bold text-neutral-500 mt-0.5 whitespace-nowrap">
                                      {stepDate}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {(() => {
                          const parsed = req.descricao_detalhada ? parseDescricaoDetalhada(req.descricao_detalhada) : null;
                          return (
                            <div className="space-y-4">
                              {/* 1. Motivo do Cliente & Resolução do Admin */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-neutral-50/60 border border-neutral-100 rounded-2xl p-4 space-y-1.5 shadow-sm">
                                  <div className="flex items-center gap-2 text-neutral-400">
                                    <MessageSquare className="w-4 h-4 text-neutral-500" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Motivo da Solicitação</span>
                                  </div>
                                  <p className="text-neutral-800 text-xs font-bold leading-relaxed">{req.motivo}</p>
                                </div>

                                {req.resposta_admin ? (
                                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-1.5 shadow-sm flex items-start gap-3">
                                    <div className="p-1.5 bg-emerald-100 rounded-xl text-emerald-600 shrink-0 mt-0.5">
                                      <CheckCircle className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Resolução do Sistema</span>
                                      <p className="text-emerald-950 text-xs font-bold leading-relaxed mt-0.5">{req.resposta_admin}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-1.5 shadow-sm flex items-start gap-3">
                                    <div className="p-1.5 bg-amber-100 rounded-xl text-amber-600 shrink-0 mt-0.5">
                                      <Clock className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">Aguardando Avaliação</span>
                                      <p className="text-amber-900 text-xs font-bold leading-relaxed mt-0.5">Nossa equipe de suporte está avaliando sua solicitação de {req.tipo === 'troca' ? 'troca' : 'devolução'}.</p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* 2. Listagem de Itens (Devolvidos vs Substitutos) */}
                              {parsed ? (
                                <div className="flex flex-col sm:flex-row gap-4">
                                  {/* Coluna 1: Itens Devolvidos */}
                                  <div className="bg-white rounded-2xl p-4 border border-neutral-150 shadow-sm space-y-3 flex-1 flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center gap-2 pb-2 border-b border-neutral-100">
                                        <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
                                          <Package className="w-4 h-4" />
                                        </div>
                                        <span className="text-[10px] font-black text-neutral-700 uppercase tracking-wider">Itens Devolvidos</span>
                                      </div>
                                      <div className="space-y-2 mt-3">
                                        {parsed.itensDevolvidos.map((item, idx) => (
                                          <div key={idx} className="flex justify-between items-center text-xs font-bold text-neutral-800 bg-neutral-50/60 p-2.5 rounded-xl border border-neutral-100">
                                            <span>{item}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-3 border-t border-neutral-100 mt-4 text-xs">
                                      <span className="text-neutral-400 font-bold">Crédito Gerado:</span>
                                      <span className="font-black text-rose-600">{parsed.creditoTroca || formatCurrency(req.orcamento_orig?.total || 0)}</span>
                                    </div>
                                  </div>

                                  {/* Coluna 2: Novos Produtos (Apenas se for troca) */}
                                  {req.tipo === 'troca' && (
                                    <div className="bg-white rounded-2xl p-4 border border-neutral-150 shadow-sm space-y-3 flex-1 flex flex-col justify-between">
                                      <div>
                                        <div className="flex items-center gap-2 pb-2 border-b border-neutral-100">
                                          <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                                            <ShoppingBag className="w-4 h-4" />
                                          </div>
                                          <span className="text-[10px] font-black text-neutral-700 uppercase tracking-wider">Produtos Substitutos</span>
                                        </div>
                                        <div className="space-y-2 mt-3">
                                          {parsed.itensSubstitutos.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-xs font-bold text-neutral-800 bg-neutral-50/60 p-2.5 rounded-xl border border-neutral-100">
                                              <span>{item}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      {parsed.totalSubstitutos && (
                                        <div className="flex justify-between items-center pt-3 border-t border-neutral-100 mt-4 text-xs">
                                          <span className="text-neutral-400 font-bold">Total Novos Produtos:</span>
                                          <span className="font-black text-indigo-600">{parsed.totalSubstitutos}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                req.descricao_detalhada && (
                                  <div className="text-xs text-neutral-600 bg-neutral-50 rounded-xl p-3 border border-neutral-100 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                                    {req.descricao_detalhada}
                                  </div>
                                )
                              )}

                              {/* 3. Resumo Financeiro da Diferença a Pagar */}
                              {req.valor_diferenca && Number(req.valor_diferenca) > 0 ? (
                                <div className="bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">Diferença de Valor</span>
                                    <p className="text-[11px] text-indigo-800 leading-normal font-semibold max-w-md">
                                      Atenção: Diferença a pagar: Fatura gerada com vencimento de 2 dias após a aprovação da solicitação.
                                    </p>
                                    {req.status === 'aprovado' && (
                                      <button
                                        onClick={async () => {
                                          try {
                                            const codigoFatura = `FAT-TROCA-${req.codigo_solicitacao}`;
                                            const { data: fatura, error: fatError } = await supabase
                                              .from('faturas')
                                              .select('id')
                                              .eq('codigo_fatura', codigoFatura)
                                              .order('created_at', { ascending: false })
                                              .limit(1)
                                              .maybeSingle();

                                            if (fatError || !fatura) {
                                              toast.error('Não foi possível localizar a fatura gerada para esta troca.');
                                              return;
                                            }

                                            toast.success('Redirecionando para a fatura...');
                                            onNavigate('financeiro', 'faturas', fatura.id);
                                          } catch (err) {
                                            console.error('Erro ao redirecionar para a fatura:', err);
                                            toast.error('Erro de conexão ao buscar fatura.');
                                          }
                                        }}
                                        className="mt-2.5 flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md hover:scale-[1.02] w-fit"
                                      >
                                        <CreditCard className="w-3.5 h-3.5" />
                                        Pagar Fatura da Diferença
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-xl font-black text-indigo-950 block">{formatCurrency(req.valor_diferenca)}</span>
                                    <span className={`text-[9px] font-black px-2.5 py-0.5 rounded-full inline-block mt-1 uppercase tracking-wider ${req.status === 'aprovado' ? 'text-indigo-600 bg-indigo-100/60 border border-indigo-200/50' : 'text-emerald-600 bg-emerald-100/60 border border-emerald-200/50'}`}>
                                      {req.status === 'aprovado' ? 'A Pagar' : 'Pago'}
                                    </span>
                                  </div>
                                </div>
                              ) : null}

                              {/* 3b. Fluxo Logístico Real-Time */}
                              {(() => {
                                const isCorreios = req.metodo_entrega !== 'pessoalmente';
                                if (req.status === 'aguardando_instrucoes') {
                                  return (
                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
                                      <div className="flex items-center gap-2 text-blue-900 font-bold text-xs uppercase">
                                        <Clock className="w-4 h-4 animate-pulse" />
                                        <span>Aguardando Instruções da GSA</span>
                                      </div>
                                      <p className="text-[11px] text-blue-700 leading-normal font-bold">
                                        Sua solicitação foi aprovada! O sistema da GSA está cadastrando o endereço de postagem {isCorreios ? "dos Correios" : "e agendando a data/hora"} para você realizar a troca.
                                      </p>
                                    </div>
                                  );
                                }

                                if (isCorreios) {
                                  if (req.status === 'aguardando_devolucao') {
                                    return (
                                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-4 shadow-sm">
                                        <div className="flex items-center gap-2 text-indigo-900 font-black text-xs uppercase">
                                          <Package className="w-4 h-4" />
                                          <span>Instruções para Envio do Produto</span>
                                        </div>
                                        <div className="text-xs text-neutral-700 font-medium space-y-2">
                                          <p className="font-bold">Por favor, poste o produto para o endereço abaixo:</p>
                                          <div className="p-3 bg-white rounded-xl border border-neutral-200 font-bold font-mono text-[11px] text-neutral-800">
                                            {req.endereco_devolucao || "Endereço não informado."}
                                          </div>
                                          <p className="text-[10px] text-amber-600 font-bold">
                                            Atenção: Você deve arcar com o frete da postagem inicial. Depois, anexe o comprovante de pagamento no módulo <strong>"Meus Reembolsos"</strong> para receber o estorno completo do frete.
                                          </p>
                                        </div>
                                        
                                        <div className="pt-2 border-t border-indigo-100 space-y-2">
                                          <label className="block text-[10px] font-black uppercase text-neutral-400">Código de Rastreio da Postagem</label>
                                          <div className="flex gap-2">
                                            <input 
                                              type="text"
                                              placeholder="Ex: OB123456789BR"
                                              value={trackingInputs[req.id] || ''}
                                              onChange={(e) => setTrackingInputs(prev => ({ ...prev, [req.id]: e.target.value }))}
                                              className="flex-1 bg-white border border-neutral-300 rounded-xl px-3 py-2 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:outline-none font-bold"
                                            />
                                            <button
                                              disabled={submittingTracking[req.id]}
                                              onClick={() => handleSendClientTracking(req.id, trackingInputs[req.id] || '')}
                                              className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black transition-all disabled:opacity-50"
                                            >
                                              {submittingTracking[req.id] ? "Enviando..." : "Enviar"}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }

                                  if (req.status === 'devolucao_postada') {
                                    return (
                                      <div className="bg-blue-50/50 border border-blue-150 rounded-2xl p-4 space-y-1.5">
                                        <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider block">Produto Devolvido em Trânsito</span>
                                        <p className="text-xs text-neutral-700 font-bold leading-normal">
                                          Você informou o código de rastreio: <strong className="font-mono text-indigo-600">{req.rastreio_cliente}</strong>. A GSA está aguardando a chegada física do produto na sede.
                                        </p>
                                      </div>
                                    );
                                  }

                                  if (req.status === 'devolucao_recebida') {
                                    return (
                                      <div className="bg-amber-50/50 border border-amber-150 rounded-2xl p-4 space-y-1.5">
                                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">Produto Recebido pela GSA</span>
                                        <p className="text-xs text-neutral-700 font-bold leading-normal">
                                          O produto devolvido chegou à sede da GSA e passou pela conferência com sucesso. Estamos preparando o envio do seu novo produto substituto!
                                        </p>
                                      </div>
                                    );
                                  }

                                  if (req.status === 'novo_produto_enviado') {
                                    return (
                                      <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 space-y-2">
                                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Novo Produto Enviado!</span>
                                        <p className="text-xs text-neutral-700 font-bold leading-normal">
                                          O novo produto foi enviado e já está a caminho de sua residência!
                                        </p>
                                        <div className="p-3 bg-white rounded-xl border border-emerald-200">
                                          <span className="text-[9px] text-neutral-400 font-black block uppercase">Código de Rastreio (GSA)</span>
                                          <span className="text-sm font-black text-emerald-800 font-mono">{req.rastreio_admin}</span>
                                        </div>
                                      </div>
                                    );
                                  }
                                } else {
                                  // Fluxo Presencial
                                  if (req.status === 'aguardando_devolucao') {
                                    return (
                                      <div className="bg-amber-50/50 border border-amber-150 rounded-2xl p-4">
                                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">Aguardando Agendamento Presencial</span>
                                        <p className="text-xs text-neutral-700 font-bold mt-1 leading-normal">
                                          A GSA está agendando uma data e horário de atendimento para você efetuar a troca presencialmente.
                                        </p>
                                      </div>
                                    );
                                  }

                                  if (req.status === 'agendado') {
                                    const dateFormatted = req.data_agendamento ? new Date(req.data_agendamento).toLocaleString('pt-BR') : '';
                                    return (
                                      <div className="bg-indigo-50 border border-indigo-150 rounded-2xl p-5 space-y-3">
                                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block"> Troca Presencial Confirmada</span>
                                        <div className="text-xs text-neutral-700 font-medium space-y-2">
                                          <p className="font-bold">Por favor, compareça no endereço abaixo levando o produto original para troca:</p>
                                          <div className="p-3 bg-white rounded-xl border border-indigo-200 font-bold font-mono text-[11px] text-neutral-800 mb-2">
                                            {req.endereco_devolucao || "Sede GSA"}
                                          </div>
                                          <p className="font-bold"><strong>Data & Hora Marcada:</strong> <span className="text-indigo-600 font-black">{dateFormatted || "Pendente"}</span></p>
                                        </div>
                                      </div>
                                    );
                                  }
                                }
                                return null;
                              })()}

                              {/* 4. Anexos de Imagens */}
                              {req.imagens_anexo && req.imagens_anexo.length > 0 && (
                                <div className="space-y-2.5 pt-2">
                                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-wider block">Imagens do Produto Anexadas ({req.imagens_anexo.length})</span>
                                  <div className="flex flex-wrap gap-2.5">
                                    {req.imagens_anexo.map((url: string, idx: number) => (
                                      <a 
                                        key={idx} 
                                        href={url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-neutral-100 hover:border-indigo-500 transition-all shadow-sm hover:scale-105 active:scale-95 duration-200 block bg-neutral-50 shrink-0"
                                      >
                                        <img src={url} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center bg-neutral-50 rounded-[2rem] border-2 border-dashed border-neutral-200">
                  <RefreshCcw className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-neutral-400 font-bold text-xs uppercase tracking-widest">Nenhuma solicitação de troca encontrada</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal de Minhas Compras */}
      <StoreHubPurchases
        isPurchasesModalOpen={isPurchasesModalOpen}
        setIsPurchasesModalOpen={(open) => {
          if (!open) handleCloseModals();
          else setIsPurchasesModalOpen(true);
        }}
        setSelectedOrderId={setSelectedOrderId}
        loading={loading}
        allPurchases={allPurchases}
        groupedPurchases={groupedPurchases}
        handleCancelOrder={handleCancelOrder}
        isProcessingPayment={isProcessingPayment}
        handlePayOrder={handlePayOrder}
        setSelectedOrderDetail={setSelectedOrderDetail}
        setCancelRequestOrder={setCancelRequestOrder}
        setSelectedOrderTimeline={setSelectedOrderTimeline}
        onNavigate={onNavigate}
      />

      {/* Modal de Detalhes do Pedido */}
      <Modal isOpen={!!selectedOrderDetail} onClose={handleCloseOrderDetail} title="Detalhes do Pedido" size="md">
        {selectedOrderDetail && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Código do Pedido</span>
                <h3 className="text-2xl font-black text-[#1a1a1a]">
                  {selectedOrderDetail.codigo_orcamento?.startsWith('#') ? selectedOrderDetail.codigo_orcamento : `#${selectedOrderDetail.codigo_orcamento}`}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Data</span>
                <p className="text-sm font-bold text-neutral-600">{formatDate(selectedOrderDetail.data_criacao)}</p>
              </div>
            </div>

            {(() => {
              const orderStatus = selectedOrderDetail.ordens_items?.[0]?.status || selectedOrderDetail.status;
              // Considera pago+cancelado se: tem motivo_cancelamento OU se a fatura real existia e foi paga
              const wasPreviouslyPaid = !!(selectedOrderDetail.motivo_cancelamento || faturaRealDoPedido?.status === 'pago');
              
              if (orderStatus === 'cancelado') {
                return (
                  <div className="space-y-3">
                    <div className="bg-red-50 border border-red-200 rounded-[1.8rem] p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider mb-1 text-red-800">
                            {wasPreviouslyPaid ? 'Pedido Cancelado pelo Sistema' : 'Pedido Cancelado'}
                          </h4>
                          <p className="text-[11px] leading-normal font-semibold text-red-700">
                            {wasPreviouslyPaid
                              ? 'Este pedido foi cancelado após o pagamento pelo sistema.'
                              : 'Este pedido foi cancelado por não pagamento ou expiração do prazo.'}
                          </p>
                        </div>
                      </div>

                      {selectedOrderDetail.motivo_cancelamento ? (
                        <div className="bg-white rounded-xl p-4 border border-red-100">
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo do Cancelamento</p>
                          <p className="text-sm text-neutral-700 font-semibold">{selectedOrderDetail.motivo_cancelamento}</p>
                        </div>
                      ) : wasPreviouslyPaid ? (
                        <div className="bg-white rounded-xl p-4 border border-red-100">
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo do Cancelamento</p>
                          <p className="text-sm text-neutral-700 font-semibold">Cancelamento pelo sistema após confirmação de pagamento.</p>
                        </div>
                      ) : null}

                      {wasPreviouslyPaid && (
                        <>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <p className="text-[11px] font-black text-amber-800 flex items-center gap-1.5 mb-1">
                              <DollarSign className="w-3.5 h-3.5" />
                              Reembolso em Processamento Automático
                            </p>
                            <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                              Como o pagamento já havia sido realizado, seu reembolso foi gerado automaticamente pelo sistema e será processado em até 10 dias úteis. Você pode acompanhar o status clicando abaixo.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedOrderDetail(null);
                              setIsPurchasesModalOpen(false);
                              setIsRefundsModalOpen(true);
                            }}
                            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-200 hover:shadow-amber-300 flex items-center justify-center gap-2"
                          >
                            <DollarSign className="w-4 h-4" />
                            Acompanhar Meu Reembolso
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })()}

            {(() => {
              const displayItems = buildInvoiceItemsFromOrder(selectedOrderDetail);
              return (
                <div className="bg-neutral-50 rounded-2xl p-4 sm:p-6 border border-neutral-100 max-h-[40vh] overflow-y-auto custom-scrollbar">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] mb-4">Itens do Pedido</h4>
                  <div className="space-y-3">
                    {displayItems.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="h-14 w-14 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <Package className="w-7 h-7 text-neutral-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-black leading-tight text-[#1a1a1a] break-words">{item.descricao}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${item.tipo === 'assinatura' ? 'text-indigo-600 bg-indigo-50' : 'text-orange-600 bg-orange-50'}`}>
                                {item.codigo || (item.tipo === 'assinatura' ? 'ASSINATURA' : 'PRODUTO')}
                              </span>
                              <span className="text-[10px] font-bold text-neutral-500">Quantidade: {item.quantidade || 1}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-3 border border-neutral-100">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Valor unitario</p>
                            <p className="mt-1 text-sm font-black text-neutral-900">{formatCurrency(Number(item.valor_unitario || 0))}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Subtotal</p>
                            <p className="mt-1 text-lg font-black text-indigo-600">{formatCurrency(Number(item.subtotal || 0))}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="space-y-4">
              <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em]">Resumo Financeiro</h4>
              <div className="space-y-2">
                {(() => {
                  const total = Number(selectedOrderDetail.total || 0);
                  const desconto = Number(selectedOrderDetail.desconto || 0);
                  const taxaEnt = Number(selectedOrderDetail.taxa_entrega || 0);
                  const acrescimo = Number(selectedOrderDetail.acrescimo || 0);
                  const itensResumo = buildInvoiceItemsFromOrder(selectedOrderDetail);
                  const subtotalItens = itensResumo.length > 0
                    ? itensResumo.reduce((acc: number, item: any) => acc + Number(item.subtotal || 0), 0)
                    : Math.max(0, total + desconto - taxaEnt - acrescimo);
                  const descontoPromocional = promocoesUso.reduce((acc: number, uso: any) => acc + Number(uso.economia_gerada || 0), 0);
                  const descontoTotalAplicavel = Math.max(desconto, descontoPromocional);
                  const totalCalculado = Math.max(0, subtotalItens + taxaEnt + acrescimo - descontoTotalAplicavel);
                  return (
                    <>
                      <div className="flex justify-between text-sm font-medium text-neutral-500">
                        <span>Subtotal dos Itens</span>
                        <span>{formatCurrency(subtotalItens)}</span>
                      </div>
                      {(taxaEnt > 0 || !!selectedOrderDetail.endereco_entrega || selectedOrderDetail.ordens_items?.some((item: any) => item.tipo === 'produto')) && (
                        <div className="flex justify-between text-sm font-medium text-neutral-500">
                          <span>Frete Total</span>
                          <span className={taxaEnt === 0 ? "text-emerald-600 font-bold" : ""}>
                            {taxaEnt > 0 ? formatCurrency(taxaEnt) : 'Grátis'}
                          </span>
                        </div>
                      )}
                      {(descontoTotalAplicavel - walletDiscountValue - descontoPromocional) > 0 && (() => {
                        const realDesconto = Math.max(0, descontoTotalAplicavel - walletDiscountValue - descontoPromocional);
                        const pointsDiscount = Math.min(
                          realDesconto,
                          pointsDiscountValue !== null 
                            ? pointsDiscountValue 
                            : (selectedOrderDetail.cupom_desconto_id ? 0 : realDesconto)
                        );

                        const couponDiscount = Math.max(0, realDesconto - pointsDiscount);

                        return (
                          <div className="space-y-1.5 bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 my-2">
                            <div className="flex justify-between text-sm font-black text-emerald-800">
                              <span>Descontos Aplicados</span>
                              <span>-{formatCurrency(realDesconto)}</span>
                            </div>
                            
                            {/* Detalhe do desconto de pontos */}
                            {pointsDiscount > 0 && (
                              <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                                <span>Carteira de Pontos ({Math.round(pointsDiscount * 100)} pts)</span>
                                <span>-{formatCurrency(pointsDiscount)}</span>
                              </div>
                            )}

                            {/* Detalhe do cupom de desconto */}
                            {couponDiscount > 0 && (
                              <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                                <span>{selectedCupomDesconto?.codigo_cupom ? `Cupom: ${selectedCupomDesconto.codigo_cupom}` : 'Desconto Aplicado'}</span>
                                <span>-{formatCurrency(couponDiscount)}</span>
                              </div>
                            )}

                            {/* Detalhe do cupom de entrega (se houver desconto de frete) */}
                            {selectedCupomEntrega && (
                              <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                                <span>Cupom Frete: {selectedCupomEntrega.codigo_cupom}</span>
                                <span>Frete Grátis</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      
                      {promocoesUso.length > 0 && (
                        <div className="space-y-1.5 bg-gradient-to-r from-purple-50 to-indigo-50/50 rounded-2xl p-4 border border-purple-100/80 my-2 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-200/30 rounded-full blur-xl pointer-events-none"></div>
                          <div className="flex justify-between text-sm font-black text-purple-900 relative z-10 mb-2">
                            <span>Vantagens VIP GSA</span>
                            <span className="flex items-center gap-1.5 bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-widest"><Tag className="w-3 h-3" /> Benefício Ativo</span>
                          </div>
                          {promocoesUso.map((uso: any) => (
                            <div key={uso.id} className="flex flex-col text-xs text-purple-700 font-bold pl-3 border-l-2 border-purple-400 mt-1.5 relative z-10">
                              {Number(uso.economia_gerada || 0) > 0 && (
                                <span className="mb-1 w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                  Economia: -{formatCurrency(Number(uso.economia_gerada || 0))}
                                </span>
                              )}
                              <span>{uso.promocoes_quantidade?.nome || 'Promoção Especial GSA Store'}</span>
                              <span className="text-[10px] text-purple-500 font-medium leading-relaxed">Benefício assegurado com sucesso neste pedido.</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {promocoesUso.length === 0 && descontoTotalAplicavel > 0 && !selectedOrderDetail.cupom_desconto_id && !(pointsDiscountValue && pointsDiscountValue > 0) && (
                        <div className="space-y-1.5 bg-gradient-to-r from-purple-50 to-indigo-50/50 rounded-2xl p-4 border border-purple-100/80 my-2 shadow-sm">
                          <div className="flex justify-between text-sm font-black text-purple-900">
                            <span>Promocao Aplicada no Pedido</span>
                            <span className="text-emerald-700">-{formatCurrency(descontoTotalAplicavel)}</span>
                          </div>
                          <p className="text-[10px] text-purple-500 font-medium leading-relaxed">
                            Desconto promocional registrado na finalizacao da compra.
                          </p>
                        </div>
                      )}
                      {walletDiscountValue > 0 && (
                        <div className="flex justify-between text-sm font-medium text-neutral-500">
                          <span>Saldo da Carteira</span>
                          <span className="text-emerald-600 font-bold">-{formatCurrency(walletDiscountValue)}</span>
                        </div>
                      )}
                      {acrescimo > 0 && (
                        <div className="flex justify-between text-sm font-bold text-amber-600">
                          <span>Juros do Crédito GSA</span>
                          <span>+{formatCurrency(acrescimo)}</span>
                        </div>
                      )}
                      <div className="pt-4 border-t border-neutral-100 flex justify-between items-center">
                        <span className="text-base font-black text-[#1a1a1a]">Total Geral</span>
                        <span className="text-2xl font-black text-indigo-600">{formatCurrency(totalCalculado)}</span>
                      </div>

                      {faturasCredito && faturasCredito.length > 0 ? (
                        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                          <div className="flex items-center justify-between text-xs font-black text-emerald-800 uppercase tracking-wider">
                            <span>Forma de Pagamento:</span>
                            <span className="bg-emerald-100 px-2 py-0.5 rounded text-[10px]">Crédito GSA Store</span>
                          </div>
                          
                          <div className="text-[11px] text-emerald-700 leading-normal font-semibold">
                            âœ“ O pagamento via <strong>Crédito GSA Store</strong> foi aprovado instantaneamente.
                            Foram geradas <strong>{faturasCredito.length} faturas</strong> de amortização para este crédito.
                          </div>

                          <div className="space-y-2.5 pt-2 border-t border-emerald-100/50">
                            <span className="text-[9px] font-black text-emerald-900 uppercase tracking-wider block mb-3">Faturas de Amortização Geradas</span>
                            {faturasCredito.map((fat, idx) => (
                              <div 
                                key={fat.id} 
                                onClick={() => {
                                  setSelectedOrderDetail(null);
                                  onNavigate('financeiro', 'faturas', fat.id);
                                }}
                                className="flex justify-between items-center p-3 text-xs text-emerald-800 font-medium bg-white/80 border border-emerald-100/40 rounded-xl shadow-sm mb-2 cursor-pointer hover:bg-emerald-100 hover:scale-[1.01] transition-all group"
                              >
                                <span className="group-hover:text-emerald-950 transition-colors">{idx + 1}ª Parcela ({fat.codigo_fatura || `Parcela ${idx+1}`})</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-neutral-800">{formatCurrency(fat.valor_total)}</span>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    fat.status === 'pago' ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' :
                                    fat.status === 'cancelado' ? 'bg-neutral-200 text-neutral-700 border border-neutral-300' : 
                                    'bg-orange-100 text-orange-800 border border-orange-200'
                                  }`}>
                                    {fat.status === 'pago' ? 'Pago' : fat.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (faturaRealDoPedido || ['pago', 'em_expedicao', 'em_transporte', 'concluido'].includes(selectedOrderDetail.status) ? (
                        <div className="mt-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1">
                          <div className="flex items-center justify-between text-xs font-black text-neutral-700 uppercase tracking-wider">
                            <span>Forma de Pagamento:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              faturaRealDoPedido?.forma_pagamento_escolhida || (!faturaRealDoPedido && (['pago', 'em_expedicao', 'em_transporte', 'concluido'].includes(selectedOrderDetail.status) || !!(selectedOrderDetail?.motivo_cancelamento || faturaRealDoPedido?.status === 'pago'))) ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-500'
                            }`}>
                              {faturaRealDoPedido?.forma_pagamento_escolhida
                                ? faturaRealDoPedido.forma_pagamento_escolhida.replace(/_/g, ' ')
                                : (['pago', 'em_expedicao', 'em_transporte', 'concluido'].includes(selectedOrderDetail.status) || !!(selectedOrderDetail?.motivo_cancelamento || faturaRealDoPedido?.status === 'pago'))
                                  ? 'SALDO CARTEIRA/PONTOS' 
                                  : 'Não definida'}
                            </span>
                          </div>
                          {faturaRealDoPedido?.status === 'pago' && faturaRealDoPedido?.data_pagamento && (
                            <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Pago em {formatDate(faturaRealDoPedido.data_pagamento)}
                            </div>
                          )}
                          {faturaRealDoPedido?.num_parcelas && faturaRealDoPedido.num_parcelas > 1 && (
                            <div className="text-[10px] text-neutral-500 font-semibold">
                              {faturaRealDoPedido.num_parcelas}x parcelas
                            </div>
                          )}
                          {!faturaRealDoPedido && ['pago', 'em_expedicao', 'em_transporte', 'concluido'].includes(selectedOrderDetail.status) && (
                            <div className="text-[10px] text-neutral-400 font-semibold">
                              Pagamento processado integralmente.
                            </div>
                          )}
                        </div>
                      ) : null)}
                    </>
                  );
                })()}
              </div>
            </div>

            {selectedOrderDetail.endereco_entrega && (
              <div className="space-y-2">
                <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em]">Endereço de Entrega</h4>
                <div className="text-sm font-bold text-neutral-600 bg-white border border-neutral-100 rounded-xl p-4">
                  {selectedOrderDetail.endereco_entrega.logradouro}, {selectedOrderDetail.endereco_entrega.numero}
                  {selectedOrderDetail.endereco_entrega.complemento && ` - ${selectedOrderDetail.endereco_entrega.complemento}`}
                  <br />
                  {selectedOrderDetail.endereco_entrega.bairro} - {selectedOrderDetail.endereco_entrega.cidade}/{selectedOrderDetail.endereco_entrega.uf}
                  <br />
                  CEP: {selectedOrderDetail.endereco_entrega.cep}
                </div>
              </div>
            )}

            <button 
              onClick={handleCloseOrderDetail}
              className="w-full py-4 bg-[#1a1a1a] text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-xl shadow-neutral-200 cursor-pointer"
            >
              Fechar Detalhes
            </button>
          </div>
        )}
      </Modal>

      {/* Modal de Reembolsos do Cliente */}
      <Modal isOpen={isRefundsModalOpen} onClose={handleCloseModals} title="Minhas Solicitações de Reembolsos" size="wide">
        <div className="space-y-6">
          {loadingRefunds ? (
            <div className="flex justify-center py-20">
              <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : refunds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {refunds.map((refund) => {
                const deadline = new Date(refund.prazo_pagamento);
                const today = new Date();
                const diffTime = deadline.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const isOverdue = diffDays <= 0;

                // Nível da Timeline de Reembolso:
                // 1. Solicitado (Sempre)
                // 2. Em Processamento (Pendente)
                // 3. Concluído (Pago)
                let currentLevel = 1;
                if (refund.status === 'pendente' || refund.status === 'aguardando_estorno') {
                  currentLevel = 2;
                } else if (refund.status === 'pago') {
                  currentLevel = 3;
                }

                return (
                  <div 
                    key={refund.id} 
                    className="relative overflow-hidden rounded-[2rem] bg-neutral-50 border border-neutral-200 p-6 flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      {/* Cabeçalho Card */}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              {refund.codigo_reembolso}
                            </span>
                            {refund.orcamento_id && (
                              <button
                                onClick={() => {
                                  const orcamentoId = refund.orcamento_id;
                                  const orderToOpen = allPurchases.find(p => p.id === orcamentoId);
                                  setIsRefundsModalOpen(false);
                                  if (orderToOpen) {
                                    setSelectedOrderDetail(orderToOpen);
                                  } else {
                                    setSelectedOrderId(orcamentoId);
                                    setIsPurchasesModalOpen(true);
                                  }
                                }}
                                className="text-[9px] font-black text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md uppercase tracking-wider transition-colors inline-flex items-center gap-1"
                                title="Ver Pedido Original"
                              >
                                REF: #{refund.codigo_orcamento || refund.codigo_ordem || 'PEDIDO'}
                              </button>
                            )}
                          </div>
                          <h4 className="text-lg font-black text-neutral-900 tracking-tight mt-1">
                            {formatCurrency(refund.valor_reembolso)}
                          </h4>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border ${
                          refund.status === 'pago'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : refund.status === 'cancelado'
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : isOverdue
                            ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                            : 'bg-amber-50 text-amber-600 border-amber-200'
                        }`}>
                          {refund.status === 'pago' ? 'Pago' : refund.status === 'cancelado' ? 'Cancelado' : refund.status === 'aguardando_estorno' ? 'Aguardando estorno' : isOverdue ? 'Atrasado' : `Pendente: ${diffDays}d`}
                        </span>
                      </div>

                      {/* Timeline do Reembolso */}
                      {refund.status !== 'cancelado' ? (
                        <div className="bg-white rounded-2xl p-4 border border-neutral-100 space-y-3">
                          <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest block">Status do Estorno</span>
                          <div className="relative pl-5 space-y-4 before:absolute before:left-1.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-neutral-100">
                            {/* Fase 1: Solicitado */}
                            <div className="relative flex items-start gap-3">
                              <div className={`absolute -left-[1.55rem] w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-all ${
                                currentLevel >= 1 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-neutral-200'
                              }`}>
                                {currentLevel >= 1 && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-neutral-800 uppercase tracking-wider">Solicitado</p>
                                <p className="text-[9px] text-neutral-400 font-semibold">Cancelamento registrado pelo Sistema</p>
                              </div>
                            </div>

                            {/* Fase 2: Em Análise / Processamento */}
                            <div className="relative flex items-start gap-3">
                              <div className={`absolute -left-[1.55rem] w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-all ${
                                currentLevel >= 2 ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-neutral-200'
                              }`}>
                                {currentLevel >= 2 && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-neutral-800 uppercase tracking-wider">Processando Estorno</p>
                                <p className="text-[9px] text-neutral-400 font-semibold">
                                  {refund.status === 'pendente' 
                                    ? `Prazo: até ${formatDate(refund.prazo_pagamento)} ${isOverdue ? '(prazo vencido)' : `(${diffDays} dias restantes)`}` 
                                    : 'Aprovado para pagamento'}
                                </p>
                              </div>
                            </div>

                            {/* Fase 3: Pago */}
                            <div className="relative flex items-start gap-3">
                              <div className={`absolute -left-[1.55rem] w-3.5 h-3.5 rounded-full flex items-center justify-center border transition-all ${
                                currentLevel >= 3 ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-neutral-200'
                              }`}>
                                {currentLevel >= 3 && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-neutral-800 uppercase tracking-wider">Estorno Concluído</p>
                                <p className="text-[9px] text-neutral-400 font-semibold">
                                  {refund.status === 'pago' ? `Pago em ${formatDate(refund.data_pagamento)}` : 'Aguardando transferência Pix'}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
                          <p className="text-[11px] font-black uppercase tracking-wider mb-1">Solicitação Anulada / Rejeitada</p>
                          <p className="text-[10px] font-medium leading-normal italic">
                            "{refund.observacoes_pagamento || 'Sem notas adicionais.'}"
                          </p>
                        </div>
                      )}

                      {/* Motivo do Cancelamento */}
                      <div className="text-[11px] font-semibold text-neutral-600 bg-white rounded-2xl p-4 border border-neutral-100">
                        <span className="text-[8px] font-black text-neutral-400 uppercase tracking-widest block mb-1">Motivo do Estorno</span>
                        <p className="text-neutral-700 italic font-medium leading-normal">"{refund.motivo_cancelamento}"</p>
                      </div>
                    </div>

                    {/* Comprovante */}
                    {refund.status === 'pago' && refund.comprovante_url && (
                      <div className="mt-4 pt-4 border-t border-neutral-200/60">
                        <a
                          href={refund.comprovante_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm"
                        >
                          <FileCheck className="w-4 h-4" />
                          Ver Comprovante Pix
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center">
              <DollarSign className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                Você não possui solicitações de reembolsos cadastradas.
              </p>
            </div>
          )}

          <button
            onClick={() => setIsRefundsModalOpen(false)}
            className="w-full py-4 bg-neutral-900 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg"
          >
            Fechar
          </button>
        </div>
      </Modal>

      {/* Modal de Acompanhamento do Pedido (Exclusivo Timeline) */}
      <Modal 
        isOpen={!!selectedOrderTimeline} 
        onClose={() => setSelectedOrderTimeline(null)} 
        title="Acompanhar Pedido" 
        size="md"
      >
        {selectedOrderTimeline && (
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-neutral-100">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Código do Pedido</span>
                <h3 className="text-2xl font-black text-[#1a1a1a]">
                  {selectedOrderTimeline.codigo_orcamento?.startsWith('#') ? selectedOrderTimeline.codigo_orcamento : `#${selectedOrderTimeline.codigo_orcamento}`}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Data</span>
                <p className="text-sm font-bold text-neutral-600">{formatDate(selectedOrderTimeline.data_criacao)}</p>
              </div>
            </div>

            {(() => {
              const orderStatus = selectedOrderTimeline.ordens_items?.[0]?.status || selectedOrderTimeline.status;
              // Detecta cancelamento de pedido anteriormente pago: tem motivo_cancelamento OU o orcamento tinha status pago na fatura
              const hadPaidFatura = selectedOrderTimeline.ordens_items?.some((item: any) => item.status === 'cancelado') && 
                (selectedOrderTimeline.motivo_cancelamento || selectedOrderTimeline._wasPaid);
              const isCancelledAfterPayment = orderStatus === 'cancelado' && 
                (!!selectedOrderTimeline.motivo_cancelamento || hadPaidFatura);

              // Se o pedido foi cancelado, mostrar banner especial ao invés da timeline
              if (orderStatus === 'cancelado') {
                return (
                  <div className="space-y-4">
                    <div className="bg-red-50 border border-red-200 rounded-[2rem] p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <XCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-red-800 uppercase tracking-wide">Pedido Cancelado</h4>
                          <p className="text-[11px] text-red-600 font-semibold mt-0.5">
                            {selectedOrderTimeline.motivo_cancelamento
                              ? 'Este pedido foi cancelado após o pagamento pelo sistema.'
                              : 'Este pedido foi cancelado.'}
                          </p>
                        </div>
                      </div>

                      {selectedOrderTimeline.motivo_cancelamento ? (
                        <div className="bg-white rounded-xl p-4 border border-red-100">
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo do Cancelamento</p>
                          <p className="text-sm text-neutral-700 font-semibold">{selectedOrderTimeline.motivo_cancelamento}</p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-xl p-4 border border-red-100">
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo do Cancelamento</p>
                          <p className="text-sm text-neutral-700 font-semibold">Cancelamento pelo sistema após confirmação de pagamento.</p>
                        </div>
                      )}

                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-[11px] font-black text-amber-800 flex items-center gap-1.5 mb-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          Reembolso em Processamento Automático
                        </p>
                        <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                          Seu reembolso foi gerado automaticamente pelo sistema e será processado em até 10 dias úteis. Acompanhe o status pelo botão abaixo.
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedOrderTimeline(null);
                          setIsPurchasesModalOpen(false);
                          setIsRefundsModalOpen(true);
                        }}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-200 hover:shadow-amber-300 flex items-center justify-center gap-2"
                      >
                        <DollarSign className="w-4 h-4" />
                        Acompanhar Meu Reembolso
                      </button>
                    </div>
                  </div>
                );
              }

              const isAssinatura = selectedOrderTimeline.ordens_items?.some((item: any) => item.tipo === 'assinatura') 
                || selectedOrderTimeline.descricao_solicitacao?.toLowerCase().match(/assinatura|plano/i) 
                || selectedOrderTimeline.titulo_solicitacao?.toLowerCase().match(/assinatura|plano/i);

              const statusLevels: Record<string, number> = {
                'em_analise': 1,
                'aberto': 1,
                'aprovado': 2,
                'pago': 2,
                'em_expedicao': 3,
                'em_transporte': 4,
                'concluido': 5
              };

              let currentLevel = statusLevels[orderStatus] || 1;
              
              if (isAssinatura) {
                if (orderStatus === 'aberto') currentLevel = 1;
                else if (orderStatus === 'pago' || orderStatus === 'concluido') currentLevel = 3; // Pula expedicao e transporte
              }

              const steps = isAssinatura ? [
                { 
                  label: 'Pedido Realizado', 
                  desc: 'Registrado com sucesso', 
                  date: selectedOrderTimeline.data_criacao 
                },
                { 
                  label: 'Aprovado', 
                  desc: 'Pagamento confirmado', 
                  date: selectedOrderTimeline.data_pagamento_aprovado 
                },
                { 
                  label: 'Assinatura Ativa', 
                  desc: 'Plano ativado e benefícios liberados', 
                  date: selectedOrderTimeline.data_pagamento_aprovado 
                }
              ] : [
                { 
                  label: 'Pedido Realizado', 
                  desc: 'Registrado com sucesso', 
                  date: selectedOrderTimeline.data_criacao 
                },
                { 
                  label: 'Aprovado', 
                  desc: 'Pagamento confirmado', 
                  date: selectedOrderTimeline.data_pagamento_aprovado 
                },
                { 
                  label: 'Em Expedição', 
                  desc: 'Preparando embalagem', 
                  date: selectedOrderTimeline.data_separacao 
                },
                { 
                  label: 'Em Transporte', 
                  desc: 'A caminho do endereço', 
                  date: selectedOrderTimeline.data_envio 
                },
                { 
                  label: 'Entregue', 
                  desc: 'Pedido entregue com sucesso', 
                  date: selectedOrderTimeline.data_entrega 
                }
              ];

              return (
                <div className="bg-white border border-neutral-100 rounded-[2rem] p-6 shadow-sm space-y-4">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    {isAssinatura ? 'Timeline do Pedido' : 'Timeline de Entrega'}
                  </h4>
                  
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-100">
                    {steps.map((step, idx) => {
                      const stepNum = idx + 1;
                      const isDone = currentLevel >= stepNum;
                      const isCurrent = currentLevel === stepNum;

                      return (
                        <div key={idx} className="relative flex items-start gap-4">
                          <div className={`absolute -left-[1.8rem] w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                            isDone 
                              ? 'bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-600/20 text-white' 
                              : 'bg-white border-neutral-200'
                          }`}>
                            {isDone && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>
                          
                          <div className="min-w-0">
                            <p className={`text-xs font-black uppercase tracking-wider ${
                              isCurrent ? 'text-indigo-600' : isDone ? 'text-neutral-800' : 'text-neutral-400'
                            }`}>
                              {step.label}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-semibold">{step.desc}</p>
                            {isDone && step.date && (
                              <p className="text-[10px] text-indigo-500/90 font-bold mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block animate-pulse"></span>
                                {formatDateTime(step.date)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <button 
              onClick={() => setSelectedOrderTimeline(null)}
              className="w-full mt-2 py-4 bg-neutral-900 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg"
            >
              Voltar
            </button>
          </div>
        )}
      </Modal>

      {/* Modal de Justificativa de Cancelamento Pago */}
      <Modal 
        isOpen={!!cancelRequestOrder} 
        onClose={() => {
          setCancelRequestOrder(null);
          setCancelReason('');
          setCancelObservation('');
        }} 
        title="Cancelar Compra Confirmada" 
        size="md"
      >
        <div className="space-y-6">
          <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 font-medium">
              Sua compra já foi confirmada e o pagamento já foi realizado. Para prosseguir com o cancelamento e estorno do valor, escolha um motivo abaixo:
            </p>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black text-neutral-400 uppercase tracking-widest block">Motivo do Cancelamento</label>
            
            <div className="space-y-2">
              {['COMPREI ERRADO', 'DESISTI DA COMPRA', 'OUTRO MOTIVO'].map(reason => (
                <label 
                  key={reason} 
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    cancelReason === reason ? 'border-red-500 bg-red-50/50' : 'border-neutral-100 bg-white hover:border-neutral-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason}
                    checked={cancelReason === reason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-4 h-4 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs font-black text-neutral-700">{reason}</span>
                </label>
              ))}
            </div>

            {cancelReason === 'OUTRO MOTIVO' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pt-2"
              >
                <textarea
                  value={cancelObservation}
                  onChange={(e) => setCancelObservation(e.target.value)}
                  placeholder="Por favor, detalhe o motivo..."
                  className="w-full h-24 p-4 text-sm font-semibold text-neutral-700 bg-neutral-50 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none transition-all placeholder:text-neutral-400"
                />
              </motion.div>
            )}
          </div>

          <div className="pt-4 border-t border-neutral-100 grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setCancelRequestOrder(null);
                setCancelReason('');
                setCancelObservation('');
              }}
              className="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest text-neutral-500 bg-neutral-100 hover:bg-neutral-200 transition-all"
            >
              Voltar
            </button>
            <button
              onClick={handleProcessPaidCancellation}
              disabled={isCancelingPaidOrder || !cancelReason}
              className="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isCancelingPaidOrder ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Confirmar Cancelamento'
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de Promoções VIP */}
      <Modal isOpen={isVipPromosModalOpen} onClose={handleCloseModals} title="Promoções VIP" size="2xl">
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-6 text-white shadow-xl shadow-purple-500/20">
            <h3 className="text-xl font-black mb-2 flex items-center gap-2"><Star className="w-6 h-6 fill-current text-yellow-300" /> Suas Ofertas Exclusivas</h3>
            <p className="text-sm font-medium text-purple-100">Como cliente VIP, você tem acesso a estas promoções especiais. Aproveite antes que expirem!</p>
          </div>

          {loadingVipPromos ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>
          ) : vipPromos.length === 0 ? (
            <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-neutral-100">
              <Megaphone className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-black text-neutral-800 mb-2">Nenhuma promoção ativa</h3>
              <p className="text-sm text-neutral-500">No momento não há novas promoções. Fique de olho, avisaremos quando surgir algo especial para você!</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {vipPromos.map(promoItem => {
                const promo = promoItem.promocoes;
                const expirou = new Date(promoItem.data_expiracao) < new Date();
                return (
                  <div key={promoItem.id} className={`relative bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm transition-shadow ${expirou ? 'opacity-60 grayscale' : 'hover:shadow-md'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="inline-flex px-2 py-1 bg-purple-100 text-purple-700 text-[10px] font-black uppercase tracking-wider rounded-lg">
                        {promo.tipo === 'desconto_proxima' ? 'OFERTA ESPECIAL' 
                          : promo.tipo === 'unidade_gratis' ? 'COMPRE E GANHE' 
                          : promo.tipo === 'ganhe_outro_produto' ? 'BRINDE EXCLUSIVO' 
                          : promo.tipo.replace(/_/g, ' ')}
                      </div>
                      {expirou ? (
                        <span className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> Expirada</span>
                      ) : (
                        <span className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> Expira em {formatDate(promoItem.data_expiracao)}</span>
                      )}
                    </div>
                    <h4 className="font-black text-neutral-800 text-lg mb-2">{promo.titulo}</h4>
                    <p className="text-xs text-neutral-500 line-clamp-2 mb-4">{promo.descricao}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-purple-600">
                        {promoItem.is_inteligente ? (
                          ['unidade_gratis', 'ganhe_outro_produto'].includes(promo.tipo) 
                            ? 'BRINDE'
                            : (promo.tipo_desconto === 'valor' ? formatCurrency(promo.valor_desconto) : `${promo.valor_desconto}% OFF`)
                        ) : (
                          promo.tipo === 'desconto_fixo' || promo.tipo_desconto === 'valor' ? formatCurrency(promo.valor_desconto) : `${promo.valor_desconto}% OFF`
                        )}
                      </span>
                    </div>
                    {promoItem.is_inteligente && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAtivarPromocao(promoItem.id);
                        }}
                        disabled={promocoesAtivadas.has(promoItem.id)}
                        className={`w-full mt-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          promocoesAtivadas.has(promoItem.id)
                            ? 'bg-emerald-50 text-emerald-600 cursor-default border border-emerald-100'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] shadow-md hover:shadow-indigo-500/20 active:scale-95'
                        }`}
                      >
                        {promocoesAtivadas.has(promoItem.id) ? 'Promoção Ativada' : 'Ativar Promoção'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

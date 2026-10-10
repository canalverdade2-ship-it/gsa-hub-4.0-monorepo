import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Package,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Clock3,
  CreditCard,
  QrCode,
  Truck,
  RotateCcw,
  Star,
  Eye,
  Trash2,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Copy,
  Check,
  Download,
  ExternalLink,
  MapPin,
  Coins,
  ShieldCheck,
  RefreshCw,
  FileText,
  DollarSign,
  Layers,
  Sparkles,
  Info,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime, generateUUID } from '../../../lib/utils';
import { getProductDisplayCode } from '../../../lib/productIdentification';
import { callClientRpc } from '../../../lib/clientRpc';
import { clientOperationalWrite } from '../../../lib/clientOperationalWrite';
import { createInfinitePayOrderCheckout } from '../../../lib/pixService';
import { routes } from '../../../routing/routeCatalog';
import { navigate } from '../../../routing/navigationService';
import { useSEO } from '../../../hooks/useSEO';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';

import { OrderReviewModal } from './OrderReviewModal';
import { CheckoutPixModal } from './CheckoutPixModal';

interface PurchasesPageProps {
  clientId?: string;
  onRequireAuth?: () => void;
  initialOrderId?: string;
}

type TabFilter = 'todos' | 'pendentes' | 'em_andamento' | 'concluidos' | 'cancelados';
type PeriodFilter = 'todos' | '30dias' | '3meses' | '2026';

type OrderPresentation = {
  status: string;
  label: string;
  tone: string;
  dot: string;
  isCredit: boolean;
  isSubscription: boolean;
  isPaid: boolean;
  isAwaiting: boolean;
  isExpired: boolean;
  canPay: boolean;
  canCancelPending: boolean;
  canRequestCancellation: boolean;
  hoursLeft: number;
  minutesLeft: number;
};

function getOrderStatus(order: any): string {
  let status = order.ordens_items?.[0]?.status || order.status || 'em_analise';
  const isSubscription = order.ordens_items?.[0]?.tipo === 'assinatura';
  if (isSubscription && order.ordens_items?.[0]?.faturas?.some((invoice: any) => invoice.status === 'pago')) {
    status = 'pago';
  }
  return status;
}

function getPresentation(order: any): OrderPresentation {
  const status = getOrderStatus(order);
  const isCredit = order.forma_pagamento_loja === 'credito_loja';
  const isSubscription = order.ordens_items?.[0]?.tipo === 'assinatura';
  const createdAt = new Date(order.data_criacao);
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  const remainingMs = expiresAt.getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
  const minutesLeft = Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)));
  const expiredPending = status === 'expirado';
  const isCancelled = status === 'cancelado';
  const isExpired = isCancelled || expiredPending;
  const isPaid = ['pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(status);
  const isAwaiting = ['aberto', 'em_analise'].includes(status) && !isCredit && !isExpired;
  const canCancelBeforeDelivery = !isSubscription
    && !isCancelled
    && !['em_transporte', 'concluido'].includes(status);

  let label = 'Em análise';
  let tone = 'border-amber-200 bg-amber-50 text-amber-800';
  let dot = 'bg-amber-500';

  if (isExpired) {
    label = 'Cancelado';
    tone = 'border-rose-200 bg-rose-50 text-rose-700';
    dot = 'bg-rose-500';
  } else if (status === 'concluido') {
    label = 'Entregue';
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    dot = 'bg-emerald-500';
  } else if (status === 'em_transporte') {
    label = 'Em transporte';
    tone = 'border-blue-200 bg-blue-50 text-blue-800';
    dot = 'bg-blue-500';
  } else if (status === 'em_expedicao') {
    label = 'Em preparação';
    tone = 'border-sky-200 bg-sky-50 text-sky-800';
    dot = 'bg-sky-500';
  } else if (isPaid) {
    label = isSubscription ? 'Assinatura ativa' : 'Pagamento aprovado';
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    dot = 'bg-emerald-500';
  } else if (isAwaiting) {
    label = 'Aguardando pagamento';
    tone = 'border-amber-200 bg-amber-50 text-amber-800';
    dot = 'bg-amber-500';
  }

  return {
    status,
    label,
    tone,
    dot,
    isCredit,
    isSubscription,
    isPaid,
    isAwaiting,
    isExpired,
    canPay: isAwaiting && Number(order.total || 0) > 0,
    canCancelPending: canCancelBeforeDelivery,
    canRequestCancellation: isPaid && ['aprovado', 'pago'].includes(status),
    hoursLeft,
    minutesLeft,
  };
}

export function PurchasesPage({ clientId, onRequireAuth, initialOrderId }: PurchasesPageProps) {
  useSEO({
    title: 'Minhas Compras — Loja GSA Store',
    description: 'Acompanhe seus pedidos, rastreamento de entregas, notas fiscais e pagamentos da GSA Store.',
    type: 'website'
  });

  const [loading, setLoading] = useState(true);
  const [allPurchases, setAllPurchases] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabFilter>('todos');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modais de ações
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const [selectedOrderReview, setSelectedOrderReview] = useState<any>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<any>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isReordering, setIsReordering] = useState<string | null>(null);

  // Modal PIX
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixModalData, setPixModalData] = useState<{
    orderId: string;
    orderCode: string;
    total: number;
    pixCode: string;
    qrCodeUrl: string;
    checkoutUrl?: string;
  } | null>(null);

  // Cliente info
  const [clienteInfo, setClienteInfo] = useState<{ nome: string; email: string; telefone: string } | null>(null);
  const [taxaEntregaPadrao, setTaxaEntregaPadrao] = useState(0);

  // Copiado
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Código do pedido copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Carregar dados do cliente
  useEffect(() => {
    if (!clientId) {
      onRequireAuth?.();
      return;
    }

    const fetchClientAndSettings = async () => {
      const { data } = await supabase
        .from('clientes')
        .select('nome, email, telefone')
        .eq('id', clientId)
        .single();
      if (data) setClienteInfo(data);

      const { data: setts } = await supabase.from('system_settings').select('value').eq('key', 'loja_taxa_entrega_padrao').maybeSingle();
      if (setts) setTaxaEntregaPadrao(parseFloat(setts.value) || 0);
    };
    fetchClientAndSettings();
  }, [clientId, onRequireAuth]);

  // Carregar compras
  const fetchPurchases = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data: orcamentos, error } = await supabase
        .from('orcamentos')
        .select('*, faturas(id), cupom_desconto:cupons_loja!fk_orcamentos_cupom_desconto(codigo_cupom), cupom_entrega:cupons_loja!fk_orcamentos_cupom_entrega(codigo_cupom)')
        .eq('cliente_id', clientId)
        .eq('origem_gsa_store', true)
        .order('data_criacao', { ascending: false });

      if (error) throw error;

      const ids = (orcamentos || []).map(o => o.id);

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
        entregas_rastreaveis: (ocsByOrc[orc.id] || []).filter((oc: any) => oc.entrega_rastreavel && oc.codigo_rastreio),
        ordens_items: normalizedByOrc[orc.id]?.length
          ? normalizedByOrc[orc.id].map((item: any) => ({ ...item, status: orc.status }))
          : [...(ocsByOrc[orc.id] || []), ...(oasByOrc[orc.id] || [])],
      }));

      const updated = enriched;

      setAllPurchases(updated);

      // Se passou initialOrderId por parâmetro, abre diretamente os detalhes
      if (initialOrderId && updated.length > 0) {
        const found = updated.find(o => o.id === initialOrderId || o.codigo_orcamento === initialOrderId);
        if (found) setSelectedOrderDetail(found);
      }

    } catch (err) {
      console.error('[PurchasesPage] Erro ao carregar pedidos:', err);
      toast.error('Erro ao carregar seu histórico de compras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, [clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'orcamentos',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: Boolean(clientId),
        debounceMs: 300,
        onChange: fetchPurchases,
      },
      {
        table: 'ordens_compra',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: Boolean(clientId),
        debounceMs: 300,
        onChange: fetchPurchases,
      },
      {
        table: 'ordens_assinatura',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: Boolean(clientId),
        debounceMs: 300,
        onChange: fetchPurchases,
      },
      {
        table: 'loja_pedido_itens',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: Boolean(clientId),
        debounceMs: 300,
        onChange: fetchPurchases,
      },
      {
        table: 'loja_pedidos',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: Boolean(clientId),
        debounceMs: 300,
        onChange: fetchPurchases,
      },
    ],
    [clientId]
  );

  // Contadores por Aba
  const tabCounts = useMemo(() => {
    let pendentes = 0;
    let em_andamento = 0;
    let concluidos = 0;
    let cancelados = 0;

    allPurchases.forEach(order => {
      const pres = getPresentation(order);
      if (pres.isAwaiting) pendentes++;
      else if (pres.isExpired) cancelados++;
      else if (pres.status === 'concluido') concluidos++;
      else if (pres.isPaid) em_andamento++;
    });

    return {
      todos: allPurchases.length,
      pendentes,
      em_andamento,
      concluidos,
      cancelados,
    };
  }, [allPurchases]);

  // Métricas do Dashboard (KPIs)
  const stats = useMemo(() => {
    const totalGasto = allPurchases
      .filter(o => !getPresentation(o).isExpired)
      .reduce((acc, cur) => acc + Number(cur.total || 0), 0);

    const totalPontos = allPurchases
      .filter(o => getPresentation(o).isPaid && !getPresentation(o).isExpired)
      .reduce((acc, cur) => acc + Math.floor(Number(cur.total || 0)), 0);

    return {
      totalGasto,
      totalPontos,
      totalPedidos: allPurchases.length,
      pendentes: tabCounts.pendentes,
      emAndamento: tabCounts.em_andamento,
    };
  }, [allPurchases, tabCounts]);

  // Filtragem dos Pedidos
  const filteredOrders = useMemo(() => {
    let result = [...allPurchases];

    // 1. Filtro por Aba
    if (activeTab === 'pendentes') {
      result = result.filter(o => getPresentation(o).isAwaiting);
    } else if (activeTab === 'em_andamento') {
      result = result.filter(o => {
        const pres = getPresentation(o);
        return pres.isPaid && !pres.isExpired && pres.status !== 'concluido';
      });
    } else if (activeTab === 'concluidos') {
      result = result.filter(o => getPresentation(o).status === 'concluido');
    } else if (activeTab === 'cancelados') {
      result = result.filter(o => getPresentation(o).isExpired);
    }

    // 2. Filtro por Período
    if (periodFilter !== 'todos') {
      const now = new Date();
      result = result.filter(order => {
        const orderDate = new Date(order.data_criacao);
        if (periodFilter === '30dias') {
          const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= 30;
        } else if (periodFilter === '3meses') {
          const diffDays = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
          return diffDays <= 90;
        } else if (periodFilter === '2026') {
          return orderDate.getFullYear() === 2026;
        }
        return true;
      });
    }

    // 3. Filtro por Busca (Código, Nome do Produto, etc)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(order => {
        const code = String(order.codigo_orcamento || order.id || '').toLowerCase();
        const hasItemMatch = (order.ordens_items || []).some((item: any) => {
          const name = String(item.nome || item.descricao || item.produtos?.nome || item.assinaturas?.nome || '').toLowerCase();
          const sku = String(item.produtos?.codigo_produto || item.assinaturas?.codigo_assinatura || '').toLowerCase();
          return name.includes(q) || sku.includes(q);
        });
        return code.includes(q) || hasItemMatch;
      });
    }

    return result;
  }, [allPurchases, activeTab, periodFilter, searchQuery]);

  // Ação: Pagar Pedido Pendente (PIX ou Fatura)
  const handlePayOrder = async (order: any) => {
    const isPix = order.forma_pagamento_loja === 'pix' || order.descricao_adicional?.includes('PIX') || !order.forma_pagamento_loja;
    
    if (isPix) {
      try {
        toast.loading('Gerando QR Code PIX...', { id: 'pix-pay' });
        const codigoOrcamento = order.codigo_orcamento || `ODC-${order.id?.slice(0, 8)}`;
        const checkoutInfo = await createInfinitePayOrderCheckout({
          orcamentoId: order.id,
          codigoOrcamento: codigoOrcamento,
          clienteId: clientId,
          clienteNome: clienteInfo?.nome || '',
          clienteEmail: clienteInfo?.email || '',
          clienteTelefone: clienteInfo?.telefone || '',
        });

        toast.dismiss('pix-pay');

        setPixModalData({
          orderId: order.id,
          orderCode: codigoOrcamento,
          total: Number(order.total || 0),
          pixCode: checkoutInfo.pixCode || '',
          qrCodeUrl: checkoutInfo.qrCodeUrl || '',
          checkoutUrl: checkoutInfo.link,
        });
        setPixModalOpen(true);
      } catch (err: any) {
        toast.dismiss('pix-pay');
        console.error('[PurchasesPage] Erro ao pagar PIX:', err);
        toast.error(err.message || 'Erro ao gerar pagamento PIX.');
      }
      return;
    }

    // Outras formas de pagamento (Fatura)
    try {
      toast.loading('Preparando fatura...', { id: 'inv-pay' });
      const data = await callClientRpc<any>('gsa_client_generate_store_invoice', {
        p_orcamento_id: order.id,
      });
      toast.dismiss('inv-pay');
      if (data?.fatura_id) {
        navigate(routes.client.finance.invoice(data.fatura_id));
      } else {
        toast.success('Redirecionando para pagamento...');
        fetchPurchases();
      }
    } catch (err: any) {
      toast.dismiss('inv-pay');
      toast.error(err.message || 'Erro ao processar fatura.');
    }
  };

  // Ação: Cancelar Pedido Pendente
  const handleConfirmCancel = async () => {
    if (!cancelModalOrder) return;
    setIsSubmittingCancel(true);
    try {
      await callClientRpc('gsa_client_cancel_store_order', {
        p_orcamento_id: cancelModalOrder.id,
        p_motivo: cancelMotivo.trim() || 'Cancelado pelo cliente na página de compras',
      });
      toast.success('Pedido cancelado com sucesso.');
      setCancelModalOrder(null);
      setCancelMotivo('');
      fetchPurchases();
    } catch (err: any) {
      console.error('[PurchasesPage] Erro ao cancelar:', err);
      toast.error(err.message || 'Não foi possível cancelar o pedido.');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Ação: Comprar Novamente (Adicionar itens ao carrinho)
  const handleReorder = async (order: any) => {
    if (!clientId) return;
    setIsReordering(order.id);
    try {
      const items = order.ordens_items || [];
      if (items.length === 0) {
        toast.error('Nenhum item disponível para repetir compra.');
        return;
      }

      for (const item of items) {
        const itemId = item.item_id || item.produto_id || item.assinatura_id;
        const tipo = item.tipo || (item.produto_id ? 'produto' : 'assinatura');
        const qtd = Number(item.quantidade || 1);

        if (!itemId) continue;

        // Verificar se já está no carrinho
        const { data: existing } = await supabase
          .from('loja_carrinhos')
          .select('id, quantidade')
          .eq('cliente_id', clientId)
          .eq('item_id', itemId)
          .maybeSingle();

        if (existing) {
          await clientOperationalWrite(clientId, 'loja_carrinhos', 'update', {
            quantidade: existing.quantidade + qtd
          }, { id: existing.id });
        } else {
          await clientOperationalWrite(clientId, 'loja_carrinhos', 'insert', {
            cliente_id: clientId,
            item_id: itemId,
            tipo: tipo,
            quantidade: qtd,
            prazo_meses: item.prazo_meses || 1
          });
        }
      }

      window.dispatchEvent(new CustomEvent('gsa-cart-updated'));
      toast.success('Itens adicionados ao seu carrinho! Redirecionando para o checkout...');
      setTimeout(() => {
        navigate(routes.marketplace.store.checkout());
      }, 1000);
    } catch (err: any) {
      console.error('[PurchasesPage] Erro ao comprar novamente:', err);
      toast.error('Erro ao adicionar itens ao carrinho.');
    } finally {
      setIsReordering(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f8] flex flex-col text-neutral-900 selection:bg-[#17345f] selection:text-white">

      {/* ─── HERO HEADER ─── */}
      <div className="relative bg-gradient-to-br from-[#0f2342] via-[#17345f] to-[#1e4a8a] overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 h-48 w-96 rounded-full bg-[#d8bd73]/10 blur-2xl pointer-events-none" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-16 relative z-10">
          <nav className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 mb-6">
            <button type="button" onClick={() => navigate(routes.marketplace.root())} className="hover:text-white/80 transition-colors cursor-pointer">Marketplace</button>
            <ChevronRight className="h-3 w-3" />
            <button type="button" onClick={() => navigate(routes.marketplace.store.products())} className="hover:text-white/80 transition-colors cursor-pointer">GSA Store</button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#d8bd73] font-bold">Minhas Compras</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#d8bd73]/15 border border-[#d8bd73]/30 px-3 py-1 rounded-full mb-3">
                <ShoppingBag className="h-3.5 w-3.5 text-[#d8bd73]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#d8bd73]">Histórico de Pedidos</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">Minhas Compras</h1>
              <p className="mt-1.5 text-sm text-white/60 font-medium max-w-md">Acompanhe entregas, gerencie pagamentos e repita suas compras favoritas.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(routes.marketplace.store.products())}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#d8bd73] px-5 py-3 text-sm font-black text-[#0f2342] shadow-lg hover:bg-[#c4a961] transition-all cursor-pointer shrink-0"
            >
              <ShoppingBag className="h-4 w-4" />
              Explorar Loja
            </button>
          </div>

          {/* KPI Cards inside hero */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
            {[
              { label: 'Total de Pedidos', value: stats.totalPedidos, sub: formatCurrency(stats.totalGasto), icon: Package, color: 'from-blue-500/20 to-blue-600/5', iconBg: 'bg-blue-500/20', iconColor: 'text-blue-300', valueColor: 'text-white' },
              { label: 'Aguardando Pag.', value: stats.pendentes, sub: stats.pendentes > 0 ? '⚠ Pagar agora' : '✓ Em dia', icon: Clock3, color: 'from-amber-500/20 to-amber-600/5', iconBg: 'bg-amber-500/20', iconColor: 'text-amber-300', valueColor: stats.pendentes > 0 ? 'text-amber-300' : 'text-white' },
              { label: 'Em Andamento', value: stats.emAndamento, sub: stats.emAndamento > 0 ? 'A caminho' : 'Sem envios', icon: Truck, color: 'from-sky-500/20 to-sky-600/5', iconBg: 'bg-sky-500/20', iconColor: 'text-sky-300', valueColor: 'text-white' },
              { label: 'Pontos VIP', value: `+${stats.totalPontos.toLocaleString()}`, sub: 'pts acumulados', icon: Coins, color: 'from-[#d8bd73]/20 to-[#d8bd73]/5', iconBg: 'bg-[#d8bd73]/20', iconColor: 'text-[#d8bd73]', valueColor: 'text-[#d8bd73]' },
            ].map((kpi, i) => (
              <div key={i} className={`bg-gradient-to-br ${kpi.color} backdrop-blur-sm border border-white/10 rounded-2xl p-4 space-y-2`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/50">{kpi.label}</span>
                  <div className={`h-7 w-7 rounded-lg ${kpi.iconBg} flex items-center justify-center`}><kpi.icon className={`h-3.5 w-3.5 ${kpi.iconColor}`} /></div>
                </div>
                <div>
                  <span className={`text-2xl font-black ${kpi.valueColor}`}>{kpi.value}</span>
                  <p className="text-[11px] text-white/40 font-medium mt-0.5">{kpi.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── MAIN ─── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-7 flex-1 w-full space-y-5 -mt-5 relative z-10">



        {/* ─── FILTER BAR ─── */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {([
              { id: 'todos', label: 'Todos', count: tabCounts.todos },
              { id: 'pendentes', label: 'Pendentes', count: tabCounts.pendentes },
              { id: 'em_andamento', label: 'Em Andamento', count: tabCounts.em_andamento },
              { id: 'concluidos', label: 'Entregues', count: tabCounts.concluidos },
              { id: 'cancelados', label: 'Cancelados', count: tabCounts.cancelados },
            ] as const).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as TabFilter)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                    isActive ? 'bg-[#17345f] text-white shadow-sm' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
                  }`}>
                  {tab.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{tab.count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar pedido ou produto..."
                className="w-full pl-9 pr-8 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-800 placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#17345f]/15 transition-all" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
              className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#17345f]/15 cursor-pointer">
              <option value="todos">Todo período</option>
              <option value="30dias">30 dias</option>
              <option value="3meses">3 meses</option>
              <option value="2026">2026</option>
            </select>
          </div>
        </div>

        {/* ─── ORDER LIST ─── */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-neutral-200/80 animate-pulse overflow-hidden">
                <div className="h-16 bg-neutral-100 border-b border-neutral-200" />
                <div className="p-6 flex gap-4">
                  <div className="h-20 w-20 bg-neutral-200 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-2/3 bg-neutral-200 rounded" />
                    <div className="h-3 w-1/2 bg-neutral-200 rounded" />
                    <div className="h-3 w-1/3 bg-neutral-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-16 text-center space-y-5 max-w-lg mx-auto">
            <div className="mx-auto h-20 w-20 rounded-2xl bg-[#17345f]/5 flex items-center justify-center">
              <ShoppingBag className="h-10 w-10 text-[#17345f]/30" />
            </div>
            <div>
              <h3 className="text-lg font-black text-neutral-900 mb-1">Nenhum pedido aqui</h3>
              <p className="text-sm text-neutral-500 font-medium leading-relaxed">
                {searchQuery ? 'Nenhum pedido corresponde à sua busca.' : activeTab !== 'todos' ? 'Você não tem pedidos nesta categoria.' : 'Explore o catálogo e realize sua primeira compra!'}
              </p>
            </div>
            <button type="button" onClick={() => navigate(routes.marketplace.store.products())}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#17345f] px-6 py-3 text-sm font-black text-white shadow-md hover:bg-[#102746] transition-all cursor-pointer">
              <ShoppingBag className="h-4 w-4" />Explorar Catálogo
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order, orderIndex) => {
              const presentation = getPresentation(order);
              const items = order.ordens_items || [];
              const orderCode = order.codigo_orcamento?.startsWith('#')
                ? order.codigo_orcamento
                : `#${order.codigo_orcamento || order.codigo_ordem || 'PEDIDO'}`;
              const isPix = order.forma_pagamento_loja === 'pix' || order.descricao_adicional?.includes('PIX') || !order.forma_pagamento_loja;
              const accentColor = presentation.isExpired ? '#ef4444' : presentation.status === 'concluido' ? '#10b981' : presentation.isAwaiting ? '#f59e0b' : presentation.isPaid ? '#3b82f6' : '#6b7280';

              return (
                <motion.article
                  key={order.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: orderIndex * 0.04 }}
                  className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm hover:shadow-md transition-all overflow-hidden"
                  style={{ borderLeft: `4px solid ${accentColor}` }}
                >
                  {/* Card Header */}
                  <div className="px-5 sm:px-6 py-3.5 bg-neutral-50/60 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <div className="flex items-center gap-1.5 text-neutral-500 font-medium">
                        <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                        <span>{formatDateTime(order.data_criacao)}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">
                          Código do Pedido
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-black text-neutral-800 text-[13px]">{orderCode}</span>
                          <button type="button" onClick={() => handleCopy(orderCode, order.id)}
                            className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded transition-colors cursor-pointer" title="Copiar">
                            {copiedId === order.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        {isPix ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-black bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full text-[10px]"><QrCode className="h-3 w-3" /> PIX</span>
                        ) : presentation.isCredit ? (
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-black bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-full text-[10px]"><Coins className="h-3 w-3" /> Crédito GSA</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-neutral-600 font-semibold bg-neutral-100 px-2 py-0.5 rounded-full text-[10px]"><CreditCard className="h-3 w-3" /> Cartão</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-[#17345f]">{formatCurrency(order.total || 0)}</span>
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${presentation.tone}`}>
                        <span className={`h-2 w-2 rounded-full ${presentation.dot} ${presentation.isAwaiting ? 'animate-pulse' : ''}`} />
                        {presentation.label}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-5 sm:px-6 py-5 space-y-5">
                    {/* Pending alert */}
                    {presentation.isAwaiting && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200/80 px-4 py-3">
                        <div className="flex items-center gap-2.5 text-xs font-bold text-amber-900">
                          <div className="h-7 w-7 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
                            <Clock className="h-4 w-4 text-amber-950" />
                          </div>
                          Aguardando pagamento — expira em <strong className="text-amber-700">{presentation.hoursLeft}h {presentation.minutesLeft}min</strong>
                        </div>
                        <button type="button" onClick={() => handlePayOrder(order)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-xs cursor-pointer shadow-sm transition-all shrink-0">
                          <QrCode className="h-3.5 w-3.5" />Pagar Agora
                        </button>
                      </div>
                    )}

                    {/* Delivery timeline */}
                    {!presentation.isExpired && presentation.isPaid && (
                      <div className="rounded-xl bg-[#f8faff] border border-[#e0e8f5] p-4">
                        <div className="flex items-center justify-between mb-4">
                          <span className="flex items-center gap-1.5 font-black text-[#17345f] uppercase tracking-wider text-[11px]"><Truck className="h-3.5 w-3.5" />Status da Entrega</span>
                          {!order.entregas_rastreaveis?.length && order.codigo_rastreio && <span className="break-all font-mono text-xs font-bold text-blue-700">Rastreio: {order.codigo_rastreio}</span>}
                        </div>
                        {order.entregas_rastreaveis?.map((entrega: any) => (
                          <div key={entrega.id} className="mb-3 rounded-lg border border-blue-200 bg-white p-3">
                            <p className="text-xs font-semibold text-slate-600">{entrega.produtos?.nome || entrega.codigo_ordem || 'Entrega rastreável'}</p>
                            <p className="mt-1 text-xs text-slate-500">Código para consultar na transportadora</p>
                            <p className="mt-1 select-all break-all font-mono text-sm font-bold text-blue-800">{entrega.codigo_rastreio}</p>
                          </div>
                        ))}
                        <div className="flex items-start">
                          {([
                            { label: 'Pedido\nRealizado', icon: CheckCircle2, done: true },
                            { label: 'Pag.\nAprovado', icon: ShieldCheck, done: true },
                            { label: 'Em\nTransporte', icon: Truck, done: ['em_transporte', 'concluido'].includes(presentation.status) },
                            { label: 'Produto\nEntregue', icon: CheckCircle2, done: presentation.status === 'concluido' },
                          ] as { label: string; icon: any; done: boolean }[]).map((step, idx, arr) => (
                            <div key={idx} className="flex-1 flex flex-col items-center relative">
                              {idx < arr.length - 1 && <div className={`absolute top-4 left-1/2 w-full h-0.5 ${step.done && arr[idx + 1]?.done ? 'bg-emerald-400' : step.done ? 'bg-gradient-to-r from-emerald-400 to-neutral-200' : 'bg-neutral-200'}`} />}
                              <div className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center shadow-sm ${step.done ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-neutral-200 text-neutral-400'}`}>
                                <step.icon className="h-4 w-4" />
                              </div>
                              <span className={`mt-2 text-[10px] font-bold text-center leading-tight whitespace-pre-line ${step.done ? 'text-emerald-700' : 'text-neutral-400'}`}>{step.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    <div className="divide-y divide-neutral-100 -mx-1">
                      {items.map((item: any, idx: number) => {
                        const img = item.produtos?.imagem_url || item.assinaturas?.imagem_url || item.imagem_url;
                        const nome = item.nome || item.descricao || item.produtos?.nome || item.assinaturas?.nome || 'Item do Pedido';
                        const sku = item.produtos ? getProductDisplayCode(item.produtos) : (item.assinaturas?.codigo_assinatura || '');
                        const unitPrice = Number(item.valor_unitario || item.valor || item.produtos?.valor || item.assinaturas?.valor || 0);
                        const itemSubtotal = unitPrice * (item.quantidade || 1);
                        return (
                          <div key={idx} className="py-3 px-1 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                              <div className="h-14 w-14 rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden shrink-0 flex items-center justify-center">
                                {img ? <img src={img} alt={nome} className="h-full w-full object-contain p-0.5" /> : <Package className="h-7 w-7 text-neutral-300" />}
                              </div>
                              <div className="min-w-0 space-y-0.5">
                                <p className="font-bold text-sm text-neutral-900 truncate">{nome}</p>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                  {sku && <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-400">{sku}</span>}
                                  <span>Qtd: <strong className="text-neutral-700">{item.quantidade || 1}x</strong></span>
                                  <span>{formatCurrency(unitPrice)} cada</span>
                                  <span className="text-amber-600 font-black bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 text-[10px]">+{Math.floor(itemSubtotal)} pts</span>
                                </div>
                              </div>
                            </div>
                            <span className="text-sm font-black text-neutral-900 shrink-0">{formatCurrency(itemSubtotal)}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Address */}
                    {order.endereco_entrega && (
                      <div className="flex items-start gap-2.5 text-xs text-neutral-600 bg-neutral-50 p-3 rounded-xl border border-neutral-200/70">
                        <MapPin className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-extrabold uppercase tracking-wider text-[10px] text-neutral-400 block mb-0.5">Endereço de Envio</span>
                          <p className="font-medium text-neutral-700">
                            {order.endereco_entrega.logradouro}, {order.endereco_entrega.numero}
                            {order.endereco_entrega.complemento && ` (${order.endereco_entrega.complemento})`}
                            {' — '}{order.endereco_entrega.bairro}, {order.endereco_entrega.cidade}/{order.endereco_entrega.uf} · CEP: {order.endereco_entrega.cep}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="px-5 sm:px-6 py-3.5 bg-neutral-50/60 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => setSelectedOrderDetail(order)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-bold text-neutral-700 shadow-sm transition-all cursor-pointer">
                      <Eye className="h-3.5 w-3.5 text-neutral-400" />Ver Detalhes
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {presentation.status === 'concluido' && (
                        <button type="button" onClick={() => setSelectedOrderReview(order)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 text-xs font-black text-amber-800 transition-all cursor-pointer">
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />Avaliar
                        </button>
                      )}
                      <button type="button" disabled={isReordering === order.id} onClick={() => handleReorder(order)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-xs font-bold text-neutral-700 shadow-sm transition-all cursor-pointer disabled:opacity-50">
                        <RotateCcw className={`h-3.5 w-3.5 text-neutral-400 ${isReordering === order.id ? 'animate-spin' : ''}`} />
                        {isReordering === order.id ? 'Adicionando...' : 'Comprar Novamente'}
                      </button>
                      {presentation.canPay && (
                        <button type="button" onClick={() => handlePayOrder(order)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#17345f] hover:bg-[#102746] text-xs font-black text-white shadow-md shadow-[#17345f]/20 transition-all cursor-pointer">
                          <CreditCard className="h-3.5 w-3.5" />Pagar Agora
                        </button>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {selectedOrderDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedOrderDetail(null); }}>
            <motion.div initial={{ opacity: 0, y: 60, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-gradient-to-r from-[#0f2342] to-[#17345f]">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white/15 flex items-center justify-center"><FileText className="h-4 w-4 text-white" /></div>
                  <div>
                    <h3 className="text-sm font-black text-white">Detalhes do Pedido</h3>
                    <p className="text-[11px] text-white/50 font-medium">#{selectedOrderDetail.codigo_orcamento || selectedOrderDetail.id?.slice(0, 8)} • {formatDateTime(selectedOrderDetail.data_criacao)}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedOrderDetail(null)}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Conteúdo do Modal */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">

              {/* Status do Pedido */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block">
                    Situação Atual
                  </span>
                  <span className="text-sm font-black text-neutral-900 mt-0.5 block">
                    {getPresentation(selectedOrderDetail).label}
                  </span>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${getPresentation(selectedOrderDetail).tone}`}>
                  <span className={`h-2 w-2 rounded-full ${getPresentation(selectedOrderDetail).dot}`} />
                  {getPresentation(selectedOrderDetail).label}
                </div>
              </div>

              {/* Itens Comprados */}
              <div className="space-y-3">
                <h4 className="font-black text-neutral-900 uppercase tracking-wider text-[11px]">
                  Itens do Pedido ({(selectedOrderDetail.ordens_items || []).length})
                </h4>
                <div className="border border-neutral-200 rounded-2xl divide-y divide-neutral-100 overflow-hidden">
                  {(selectedOrderDetail.ordens_items || []).map((item: any, idx: number) => (
                    <div key={idx} className="p-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="font-bold text-neutral-900 block">
                          {item.nome || item.descricao || item.produtos?.nome || item.assinaturas?.nome}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          {item.quantidade || 1}x · {formatCurrency(item.valor_unitario || item.valor || item.produtos?.valor || 0)} cada
                        </span>
                      </div>
                      <span className="font-black text-neutral-900">
                        {formatCurrency((item.valor_unitario || item.valor || item.produtos?.valor || 0) * (item.quantidade || 1))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discriminação Financeira Completa */}
              <div className="space-y-3">
                <h4 className="font-black text-neutral-900 uppercase tracking-wider text-[11px]">
                  Resumo Financeiro
                </h4>
                <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-200 space-y-2">
                  <div className="flex justify-between text-neutral-600 font-medium">
                    <span>Subtotal dos itens</span>
                    <span className="font-bold text-neutral-900">
                      {formatCurrency((selectedOrderDetail.ordens_items || []).reduce((acc: number, cur: any) => acc + (Number(cur.valor_unitario || cur.valor || 0) * Number(cur.quantidade || 1)), 0))}
                    </span>
                  </div>

                  {selectedOrderDetail.taxa_entrega !== null && selectedOrderDetail.taxa_entrega !== undefined && (
                    <>
                      <div className="flex justify-between text-neutral-600 font-medium">
                        <span>Frete / Entrega</span>
                        {Number(selectedOrderDetail.taxa_entrega) > 0 ? (
                          <span className="font-bold text-neutral-900">{formatCurrency(selectedOrderDetail.taxa_entrega)}</span>
                        ) : selectedOrderDetail.cupom_entrega_id ? (
                          <span className="font-bold text-neutral-900">{formatCurrency(taxaEntregaPadrao)}</span>
                        ) : (
                          <span className="font-bold text-emerald-700">Grátis</span>
                        )}
                      </div>
                      
                      {Number(selectedOrderDetail.taxa_entrega) === 0 && selectedOrderDetail.cupom_entrega_id && (
                        <div className="flex justify-between text-emerald-700 font-bold">
                          <span>Cupom de Frete {selectedOrderDetail.cupom_entrega?.codigo_cupom ? `(${selectedOrderDetail.cupom_entrega.codigo_cupom})` : ''}</span>
                          <span>- {formatCurrency(taxaEntregaPadrao)}</span>
                        </div>
                      )}
                    </>
                  )}

                  {Number(selectedOrderDetail.desconto_cupom || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Cupom de Desconto {selectedOrderDetail.cupom_desconto?.codigo_cupom ? `(${selectedOrderDetail.cupom_desconto.codigo_cupom})` : ''}</span>
                      <span>- {formatCurrency(selectedOrderDetail.desconto_cupom)}</span>
                    </div>
                  )}
                  {Number(selectedOrderDetail.desconto_promocional || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Desconto Promocional</span>
                      <span>- {formatCurrency(selectedOrderDetail.desconto_promocional)}</span>
                    </div>
                  )}
                  {Number(selectedOrderDetail.desconto || 0) > (Number(selectedOrderDetail.desconto_cupom || 0) + Number(selectedOrderDetail.desconto_promocional || 0)) && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Desconto PIX / Outros</span>
                      <span>- {formatCurrency(Number(selectedOrderDetail.desconto || 0) - (Number(selectedOrderDetail.desconto_cupom || 0) + Number(selectedOrderDetail.desconto_promocional || 0)))}</span>
                    </div>
                  )}

                  {Number(selectedOrderDetail.pontos_usados || 0) > 0 && (
                    <div className="flex justify-between text-amber-700 font-bold">
                      <span>Pontos VIP Utilizados ({selectedOrderDetail.pontos_usados} pts)</span>
                      <span>- {formatCurrency(selectedOrderDetail.pontos_usados * 0.01)}</span>
                    </div>
                  )}

                  {Number(selectedOrderDetail.saldo_carteira_usado || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Saldo da Carteira Abatido</span>
                      <span>- {formatCurrency(selectedOrderDetail.saldo_carteira_usado)}</span>
                    </div>
                  )}

                  <div className="border-t border-neutral-200 pt-2.5 flex items-baseline justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-neutral-900">Total Pago / Final:</span>
                    <span className="text-xl font-black text-[#17345f]">{formatCurrency(selectedOrderDetail.total || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Endereço de Entrega */}
              {selectedOrderDetail.endereco_entrega && (
                <div className="space-y-2">
                  <h4 className="font-black text-neutral-900 uppercase tracking-wider text-[11px]">
                    Destino da Entrega
                  </h4>
                  <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-start gap-2.5">
                    <MapPin className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-neutral-900">
                        {selectedOrderDetail.endereco_entrega.logradouro}, {selectedOrderDetail.endereco_entrega.numero}
                        {selectedOrderDetail.endereco_entrega.complemento && ` - ${selectedOrderDetail.endereco_entrega.complemento}`}
                      </p>
                      <p className="text-neutral-500 mt-0.5">
                        {selectedOrderDetail.endereco_entrega.bairro} — {selectedOrderDetail.endereco_entrega.cidade}/{selectedOrderDetail.endereco_entrega.uf} · CEP: {selectedOrderDetail.endereco_entrega.cep}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-neutral-300 font-bold text-xs text-neutral-700 hover:bg-neutral-100 cursor-pointer"
                >
                  Fechar
                </button>
                {selectedOrderDetail.faturas && selectedOrderDetail.faturas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate(routes.client.finance.invoice(selectedOrderDetail.faturas[0].id))}
                    className="px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 font-bold text-xs text-indigo-700 hover:bg-indigo-100 cursor-pointer flex items-center gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver Fatura
                  </button>
                )}
              </div>

              {getPresentation(selectedOrderDetail).canPay && (
                <button
                  type="button"
                  onClick={() => {
                    const orderToPay = selectedOrderDetail;
                    setSelectedOrderDetail(null);
                    handlePayOrder(orderToPay);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#17345f] text-white font-black text-xs hover:bg-[#102746] shadow-md shadow-[#17345f]/20 cursor-pointer flex items-center gap-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Pagar este Pedido</span>
                </button>
              )}
              {getPresentation(selectedOrderDetail).canCancelPending && (
                <button
                  type="button"
                  onClick={() => {
                    const orderToCancel = selectedOrderDetail;
                    setSelectedOrderDetail(null);
                    setCancelModalOrder(orderToCancel);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-black text-xs hover:bg-rose-700 shadow-md shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Cancelar Pedido</span>
                </button>
              )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: CANCEL */}
      <AnimatePresence>
        {cancelModalOrder && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-black text-neutral-900 text-base">Cancelar Pedido</h3>
                  <p className="text-xs text-neutral-400">#{cancelModalOrder.codigo_orcamento || cancelModalOrder.id?.slice(0, 8)}</p>
                </div>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">Tem certeza? Cupons e pontos resgatados serão restituídos automaticamente.</p>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">Motivo (opcional)</label>
                <textarea value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)}
                  placeholder="Ex: desisti, comprei errado..." rows={2}
                  className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-400/30 resize-none" />
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button type="button" onClick={() => setCancelModalOrder(null)}
                  className="px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold cursor-pointer">Não, manter
                </button>
                <button type="button" disabled={isSubmittingCancel} onClick={handleConfirmCancel}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-xl text-xs font-black cursor-pointer">
                  {isSubmittingCancel ? 'Cancelando…' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Avaliação de Pedido */}
      <OrderReviewModal
        isOpen={!!selectedOrderReview}
        onClose={() => setSelectedOrderReview(null)}
        order={selectedOrderReview}
      />

      {/* Modal de Pagamento PIX Instantâneo */}
      {pixModalData && (
        <CheckoutPixModal
          isOpen={pixModalOpen}
          onClose={() => setPixModalOpen(false)}
          orderId={pixModalData.orderId}
          orderCode={pixModalData.orderCode}
          total={pixModalData.total}
          pixCode={pixModalData.pixCode}
          qrCodeUrl={pixModalData.qrCodeUrl}
          checkoutUrl={pixModalData.checkoutUrl}
          onPaymentSuccess={() => {
            setPixModalOpen(false);
            fetchPurchases();
          }}
        />
      )}

    </div>
  );
}

export default PurchasesPage;

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ticket,
  CheckCircle2,
  AlertCircle,
  Clock,
  Tag,
  Copy,
  Check,
  Search,
  Filter,
  Sparkles,
  Percent,
  Truck,
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
  ChevronRight,
  Info,
  HelpCircle,
  Lock,
  Gift,
  Flame,
  Award,
  Zap,
  RotateCcw,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate, copyToClipboard } from '../../../lib/utils';
import { callClientRpc } from '../../../lib/clientRpc';
import { routes } from '../../../routing/routeCatalog';
import { navigate } from '../../../routing/navigationService';
import { EcommerceHeader } from './EcommerceHeader';
import type { CupomLoja } from '../../../types';

const GUEST_ACTIVATED_STORE_COUPONS_KEY = 'gsa_guest_activated_store_coupons';

interface CouponsPageProps {
  clientId?: string;
  onRequireAuth?: () => void;
}

type TabType = 'todos' | 'desconto' | 'entrega' | 'ativados' | 'historico';
type SortType = 'maior_desconto' | 'recentes' | 'validade' | 'menor_minimo';

export function CouponsPage({ clientId, onRequireAuth }: CouponsPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('recentes');
  const [loading, setLoading] = useState(true);
  const [cupons, setCupons] = useState<any[]>([]);
  const [cuponsAtivados, setCuponsAtivados] = useState<Set<string>>(new Set());
  const [ativandoCupomId, setAtivandoCupomId] = useState<string | null>(null);
  const [copiedCupomId, setCopiedCupomId] = useState<string | null>(null);

  // Resgate manual de código
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);

  // Atualização de título da página
  useEffect(() => {
    document.title = 'Cupons & Vantagens Exclusivas | GSA Store';
  }, []);

  const fetchCupons = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('cupons_loja')
        .select('*')
        .eq('status', 'ativo')
        .order('created_at', { ascending: false });

      // O cliente vê cupons públicos e os direcionados a ele
      query = clientId
        ? query.or(`cliente_id.is.null,cliente_id.eq.${clientId}`)
        : query.is('cliente_id', null);

      const { data: cuponsData, error } = await query;
      if (error) throw error;

      const ativadosSet = new Set<string>();
      const clienteUsosCount: Record<string, number> = {};

      if (clientId) {
        // Cupons ativados do cliente
        const { data: ativacoes } = await supabase
          .from('cupons_ativados')
          .select('cupom_id')
          .eq('cliente_id', clientId);

        if (ativacoes) {
          ativacoes.forEach((a: any) => ativadosSet.add(a.cupom_id));
        }

        // Histórico de uso em orçamentos/pedidos não cancelados
        const { data: orcamentos } = await supabase
          .from('orcamentos')
          .select('cupom_desconto_id, cupom_entrega_id')
          .eq('cliente_id', clientId)
          .neq('status', 'cancelado');

        (orcamentos || []).forEach((orc: any) => {
          if (orc.cupom_desconto_id) {
            clienteUsosCount[orc.cupom_desconto_id] = (clienteUsosCount[orc.cupom_desconto_id] || 0) + 1;
          }
          if (orc.cupom_entrega_id) {
            clienteUsosCount[orc.cupom_entrega_id] = (clienteUsosCount[orc.cupom_entrega_id] || 0) + 1;
          }
        });
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem(GUEST_ACTIVATED_STORE_COUPONS_KEY) || '[]');
          if (Array.isArray(stored)) {
            stored.forEach((cupomId) => {
              if (typeof cupomId === 'string') ativadosSet.add(cupomId);
            });
          }
        } catch {
          localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
        }
      }

      setCuponsAtivados(ativadosSet);

      const cuponsProcessados = (cuponsData || []).map((c: any) => {
        const clienteUsos = clienteUsosCount[c.id] || 0;
        const limiteCliente = c.limite_usos_por_cliente || 1;
        let localStatus = clienteUsos >= limiteCliente ? 'usado' : 'ativo';

        if (localStatus !== 'usado' && c.limite_usos > 0 && (c.total_usos || 0) >= c.limite_usos) {
          localStatus = 'esgotado';
        }

        if (c.data_validade) {
          const [year, month, day] = String(c.data_validade).split('T')[0].split('-').map(Number);
          const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
          if (expiryDate < new Date()) {
            localStatus = 'expirado';
          }
        }

        return {
          ...c,
          status_local: localStatus,
          cliente_usos: clienteUsos,
          limite_cliente: limiteCliente,
        };
      });

      setCupons(cuponsProcessados);
    } catch (error) {
      console.error('[CouponsPage] Erro ao buscar cupons:', error);
      toast.error('Não foi possível carregar os cupons disponíveis.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCupons();
  }, [fetchCupons]);

  useRealtimeSubscription(
    [
      {
        table: 'cupons_loja',
        onChange: fetchCupons,
        debounceMs: 300,
      },
      {
        table: 'cupons_ativados',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        enabled: Boolean(clientId),
        onChange: fetchCupons,
        debounceMs: 300,
      },
    ],
    [fetchCupons, clientId]
  );

  // Ação de Ativar Cupom
  const handleAtivarCupom = async (cupom: any) => {
    setAtivandoCupomId(cupom.id);
    try {
      if (clientId) {
        await callClientRpc('gsa_client_activate_store_coupon', { p_cupom_id: cupom.id });
      } else {
        const activated = new Set(cuponsAtivados);
        activated.add(cupom.id);
        localStorage.setItem(GUEST_ACTIVATED_STORE_COUPONS_KEY, JSON.stringify([...activated]));
      }

      setCuponsAtivados((prev) => new Set([...prev, cupom.id]));
      toast.success(`Cupom "${cupom.nome_cupom}" ativado com sucesso!`, {
        icon: '🎉',
        duration: 3500,
      });
    } catch (error: any) {
      const code = String(error?.code || '');
      const msg = String(error?.message || error?.details || '').toLowerCase();
      if (code === '23505' || msg.includes('duplicate') || msg.includes('already exists') || msg.includes('unique')) {
        setCuponsAtivados((prev) => new Set([...prev, cupom.id]));
        toast.success('Você já ativou este cupom! Ele já está pronto para o checkout.');
        return;
      }
      console.error('[CouponsPage] Erro ao ativar cupom:', error);
      toast.error('Ocorreu um erro ao ativar o cupom.');
    } finally {
      setAtivandoCupomId(null);
    }
  };

  // Ação de Copiar Código
  const handleCopiarCupom = async (cupom: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (copyToClipboard) {
        await copyToClipboard(cupom.codigo_cupom);
      } else {
        await navigator.clipboard.writeText(cupom.codigo_cupom);
      }
      setCopiedCupomId(cupom.id);
      toast.success(`Código ${cupom.codigo_cupom} copiado!`);
      setTimeout(() => setCopiedCupomId(null), 2500);
    } catch {
      toast.error('Não foi possível copiar o código.');
    }
  };

  // Ação de Resgatar Código Digitado
  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = redeemCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      toast.error('Digite um código de cupom.');
      return;
    }

    setIsRedeeming(true);
    try {
      // 1. Busca cupom com esse código
      const { data, error } = await supabase
        .from('cupons_loja')
        .select('*')
        .eq('codigo_cupom', cleanCode)
        .maybeSingle();

      if (error || !data) {
        toast.error('Cupom não encontrado ou inválido. Verifique o código e tente novamente.');
        return;
      }

      const cupom = data as CupomLoja;

      // Validação de status ativo
      if (cupom.status !== 'ativo') {
        toast.error(`Este cupom não está mais disponível (status: ${cupom.status}).`);
        return;
      }

      // Validação de validade
      if (cupom.data_validade) {
        const [year, month, day] = String(cupom.data_validade).split('T')[0].split('-').map(Number);
        const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
        if (expiryDate < new Date()) {
          toast.error('Este cupom expirou a data de validade.');
          return;
        }
      }

      // Validação de limite global
      if (cupom.limite_usos > 0 && (cupom.total_usos || 0) >= cupom.limite_usos) {
        toast.error('Este cupom atingiu o limite máximo global de utilizações.');
        return;
      }

      // Validação de cliente específico
      if (cupom.cliente_id && cupom.cliente_id !== clientId) {
        toast.error('Este cupom é exclusivo para outra conta de cliente.');
        return;
      }

      // Validação de usos pelo cliente
      if (clientId) {
        const { count } = await supabase
          .from('orcamentos')
          .select('id', { count: 'exact', head: true })
          .eq('cliente_id', clientId)
          .neq('status', 'cancelado')
          .or(`cupom_desconto_id.eq.${cupom.id},cupom_entrega_id.eq.${cupom.id}`);

        const limitePorCliente = cupom.limite_usos_por_cliente || 1;
        if ((count || 0) >= limitePorCliente) {
          toast.error(`Você já utilizou o limite máximo (${limitePorCliente}x) deste cupom.`);
          return;
        }

        // Ativa no banco
        try {
          await callClientRpc('gsa_client_activate_store_coupon', { p_cupom_id: cupom.id });
        } catch {
          // Ignora duplicidade
        }
      } else {
        const activated = new Set(cuponsAtivados);
        activated.add(cupom.id);
        localStorage.setItem(GUEST_ACTIVATED_STORE_COUPONS_KEY, JSON.stringify([...activated]));
      }

      setCuponsAtivados((prev) => new Set([...prev, cupom.id]));
      setRedeemCodeInput('');
      toast.success(`Parabéns! Cupom "${cupom.nome_cupom}" resgatado e ativado!`, {
        icon: '🎁',
        duration: 4000,
      });

      // Recarrega lista
      fetchCupons();
    } catch (err: any) {
      console.error('[CouponsPage] Erro ao resgatar código:', err);
      toast.error('Erro ao validar código do cupom.');
    } finally {
      setIsRedeeming(false);
    }
  };

  // KPIs e Contadores
  const stats = useMemo(() => {
    const ativos = cupons.filter((c) => c.status_local === 'ativo');
    const ativadosCount = cupons.filter((c) => c.status_local === 'ativo' && cuponsAtivados.has(c.id)).length;
    const usadosCount = cupons.filter((c) => c.status_local === 'usado').length;
    const freteGratisCount = cupons.filter((c) => c.status_local === 'ativo' && c.categoria_cupom === 'entrega').length;
    const descontosCount = cupons.filter((c) => c.status_local === 'ativo' && c.categoria_cupom === 'desconto').length;

    return {
      totalAtivos: ativos.length,
      ativados: ativadosCount,
      usados: usadosCount,
      freteGratis: freteGratisCount,
      descontos: descontosCount,
    };
  }, [cupons, cuponsAtivados]);

  // Filtragem e Ordenação
  const filteredCupons = useMemo(() => {
    let list = [...cupons];

    // 1. Filtro por Aba
    if (activeTab === 'desconto') {
      list = list.filter((c) => c.status_local === 'ativo' && c.categoria_cupom === 'desconto');
    } else if (activeTab === 'entrega') {
      list = list.filter((c) => c.status_local === 'ativo' && c.categoria_cupom === 'entrega');
    } else if (activeTab === 'ativados') {
      list = list.filter((c) => c.status_local === 'ativo' && cuponsAtivados.has(c.id));
    } else if (activeTab === 'historico') {
      list = list.filter((c) => c.status_local === 'usado' || c.status_local === 'expirado' || c.status_local === 'esgotado');
    } else {
      // 'todos' (apenas ativos no catálogo principal)
      list = list.filter((c) => c.status_local === 'ativo');
    }

    // 2. Filtro por Busca
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const nome = String(c.nome_cupom || '').toLowerCase();
        const codigo = String(c.codigo_cupom || '').toLowerCase();
        const categoria = String(c.categoria_cupom || '').toLowerCase();
        return nome.includes(q) || codigo.includes(q) || categoria.includes(q);
      });
    }

    // 3. Ordenação
    list.sort((a, b) => {
      if (sortBy === 'maior_desconto') {
        const valA = a.categoria_cupom === 'desconto' ? Number(a.valor_desconto || 0) : 0;
        const valB = b.categoria_cupom === 'desconto' ? Number(b.valor_desconto || 0) : 0;
        return valB - valA;
      }
      if (sortBy === 'menor_minimo') {
        const minA = Number(a.valor_minimo_compra || 0);
        const minB = Number(b.valor_minimo_compra || 0);
        return minA - minB;
      }
      if (sortBy === 'validade') {
        const dateA = a.data_validade ? new Date(a.data_validade).getTime() : Infinity;
        const dateB = b.data_validade ? new Date(b.data_validade).getTime() : Infinity;
        return dateA - dateB;
      }
      // 'recentes'
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Se estiver na aba 'todos', colocar ativados no topo
    if (activeTab === 'todos') {
      list.sort((a, b) => {
        const aAtivado = cuponsAtivados.has(a.id);
        const bAtivado = cuponsAtivados.has(b.id);
        if (aAtivado && !bAtivado) return -1;
        if (!aAtivado && bAtivado) return 1;
        return 0;
      });
    }

    return list;
  }, [cupons, activeTab, searchQuery, sortBy, cuponsAtivados]);

  const faqs = [
    {
      question: 'Como faço para utilizar um cupom no meu pedido?',
      answer:
        'Basta clicar no botão "Ativar Cupom" nesta página. Ao prosseguir para o Checkout na loja, todos os seus cupons ativados estarão disponíveis para seleção imediata com apenas um clique.',
    },
    {
      question: 'Posso combinar cupom de desconto com frete grátis?',
      answer:
        'Sim! A GSA Store permite a combinação inteligente de 1 cupom de desconto no valor dos produtos + 1 benefício de entrega/frete grátis no mesmo pedido, maximizando sua economia.',
    },
    {
      question: 'O que significa valor mínimo de compra?',
      answer:
        'Alguns cupons possuem uma condição de valor mínimo no subtotal do carrinho para serem aplicados (por exemplo, "Válido em compras acima de R$ 150"). Se o valor do carrinho for inferior, o desconto não será computado.',
    },
    {
      question: 'Os cupons funcionam para assinaturas e serviços?',
      answer:
        'A maioria dos cupons é válida para todo o catálogo de produtos e serviços da GSA Store. Cupons exclusivos de produtos ou categorias específicas terão as regras detalhadas no próprio card.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f3f4f8] flex flex-col text-neutral-900 selection:bg-[#17345f] selection:text-white">
      {/* ─── HEADER ECOMMERCE ─── */}
      <EcommerceHeader
        clientId={clientId}
        onOpenCart={() => navigate(routes.marketplace.store.products() + '?modal=carrinho')}
        onRequireAuth={onRequireAuth}
      />

      {/* ─── HERO HEADER (Desktop & Tablet) ─── */}
      <div className="hidden sm:block relative bg-gradient-to-br from-[#0a182c] via-[#122b50] to-[#1a3d6e] overflow-hidden">
        {/* Glows Decorativos */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#d8bd73]/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 left-10 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-40" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-14 relative z-10">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-[11px] font-bold text-white/50 mb-6">
            <button
              type="button"
              onClick={() => navigate(routes.marketplace.root())}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Marketplace
            </button>
            <ChevronRight className="h-3 w-3 text-white/40" />
            <button
              type="button"
              onClick={() => navigate(routes.marketplace.store.root())}
              className="hover:text-white transition-colors cursor-pointer"
            >
              GSA Store
            </button>
            <ChevronRight className="h-3 w-3 text-white/40" />
            <span className="text-[#d8bd73] font-black">Central de Cupons & Vantagens</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-[#d8bd73]/15 border border-[#d8bd73]/30 px-3.5 py-1 rounded-full mb-3.5 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5 text-[#d8bd73]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#d8bd73]">
                  Economia Inteligente GSA Store
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                Cupons & Benefícios Exclusivos
              </h1>
              <p className="mt-2 text-sm sm:text-base text-blue-100/75 font-medium leading-relaxed">
                Ative descontos especiais, frete grátis e vantagens personalizadas para economizar em todas as suas compras e assinaturas.
              </p>
            </div>

            {/* Ações Rápidas do Topo */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(routes.marketplace.store.products())}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-[#17345f] hover:bg-neutral-100 text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-xl active:scale-95 cursor-pointer"
              >
                <ShoppingBag className="h-4 w-4 text-[#17345f]" />
                Ir para o Catálogo
              </button>
              <button
                type="button"
                onClick={() => navigate(routes.marketplace.store.checkout())}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#d8bd73] text-[#0f2342] hover:bg-[#c9ad60] text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-xl active:scale-95 cursor-pointer"
              >
                <Zap className="h-4 w-4 fill-current" />
                Ir para o Checkout
              </button>
            </div>
          </div>

          {/* ─── CARDS DE KPIS / METRICAS ─── */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Disponíveis</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-[#d8bd73]">
                  <Ticket className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{stats.totalAtivos}</p>
              <p className="text-[10px] font-semibold text-white/50 mt-0.5">Cupons prontos para você</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Ativados na Conta</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-emerald-300">{stats.ativados}</p>
              <p className="text-[10px] font-semibold text-emerald-100/60 mt-0.5">Prontos para o checkout</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Frete Grátis</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <Truck className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{stats.freteGratis}</p>
              <p className="text-[10px] font-semibold text-white/50 mt-0.5">Entregas sem custo</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Usados em Pedidos</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Award className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{stats.usados}</p>
              <p className="text-[10px] font-semibold text-white/50 mt-0.5">Benefícios usufruídos</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── CORPO PRINCIPAL ─── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-0 sm:-mt-6 pb-20 relative z-20 w-full flex-1">
        {/* ─── SEÇÃO: RESGATAR CÓDIGO PROMOCIONAL (CARD ELEVADO) ─── */}
        <div className="mb-4 sm:mb-8 rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-8 shadow-md sm:shadow-xl border border-neutral-200/80">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#17345f] to-[#0f2342] text-amber-300 shadow-md">
                <Gift className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-black text-neutral-900 tracking-tight">
                  Possui um código de cupom ou presente?
                </h3>
                <p className="text-xs sm:text-sm text-neutral-500 font-medium">
                  Insira o código promocional para resgatá-lo imediatamente.
                </p>
              </div>
            </div>

            <form onSubmit={handleRedeemCode} className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 sm:w-auto w-full">
              <div className="relative flex-1 sm:w-80">
                <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={redeemCodeInput}
                  onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
                  placeholder="EX: PROMO10, VIPGSA, FRETEFREE..."
                  className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 pl-10 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm font-black text-neutral-900 placeholder:text-neutral-400 placeholder:font-normal uppercase tracking-wider focus:border-[#17345f] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#17345f]/10 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isRedeeming || !redeemCodeInput.trim()}
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#17345f] px-5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-white hover:bg-[#102746] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
              >
                {isRedeeming ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-[#d8bd73]" />
                    Resgatar Cupom
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ─── BANNER CONVIDATIVO PARA VISITANTE NÃO AUTENTICADO (Desktop) ─── */}
        {!clientId && (
          <div className="hidden sm:flex mb-8 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border border-amber-300/40 p-5 sm:p-6 flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-neutral-900 uppercase tracking-wide">
                  Desbloqueie Cupons Exclusivos da sua Conta
                </h4>
                <p className="text-xs text-neutral-600 font-medium mt-0.5">
                  Entre na sua conta para resgatar cupons VIP, bônus de boas-vindas e cashback acumulado.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onRequireAuth) {
                  onRequireAuth();
                } else {
                  navigate(routes.login.personal());
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black transition-all shrink-0 cursor-pointer shadow-sm"
            >
              Entrar ou Cadastrar
            </button>
          </div>
        )}

        {/* ─── BARRA DE FERRAMENTAS: ABAS, BUSCA E ORDENAÇÃO ─── */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Abas */}
            <div className="flex overflow-x-auto pb-2 lg:pb-0 gap-1.5 p-1.5 bg-neutral-200/70 rounded-2xl custom-scrollbar shrink-0 overscroll-x-contain touch-pan-y touch-pan-x">
              {(
                [
                  { key: 'todos', label: 'Todos os Cupons', count: stats.totalAtivos, icon: Ticket },
                  { key: 'desconto', label: 'Descontos', count: stats.descontos, icon: Percent },
                  { key: 'entrega', label: 'Frete & Entrega', count: stats.freteGratis, icon: Truck },
                  { key: 'ativados', label: 'Meus Ativados', count: stats.ativados, icon: CheckCircle2 },
                  { key: 'historico', label: 'Usados & Expirados', count: stats.usados, icon: RotateCcw },
                ] as const
              ).map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-white text-[#17345f] shadow-md ring-1 ring-black/5'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/40'
                    }`}
                  >
                    <IconComponent className={`h-3.5 w-3.5 ${isActive ? 'text-[#17345f]' : 'text-neutral-400'}`} />
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                          isActive ? 'bg-[#17345f] text-white' : 'bg-neutral-300 text-neutral-700'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Busca e Ordenação */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Campo de Busca */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cupom por nome ou código..."
                  className="w-full rounded-2xl border border-neutral-300 bg-white pl-9 pr-3 py-2.5 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:border-[#17345f] focus:outline-none focus:ring-2 focus:ring-[#17345f]/10 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Seletor de Ordenação */}
              <div className="relative w-full sm:w-auto shrink-0">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortType)}
                  aria-label="Ordenar cupons por"
                  className="w-full sm:w-auto rounded-2xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-neutral-700 focus:border-[#17345f] focus:outline-none focus:ring-2 focus:ring-[#17345f]/10 cursor-pointer transition-all"
                >
                  <option value="recentes">Mais Recentes</option>
                  <option value="maior_desconto">Maior Desconto</option>
                  <option value="validade">Próximos de Vencer</option>
                  <option value="menor_minimo">Menor Valor Mínimo</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ─── LISTAGEM DE CUPONS (TICKETS DE ECOMMERCE) ─── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-56 rounded-3xl bg-white border border-neutral-200 p-6 animate-pulse flex flex-col justify-between"
              >
                <div className="flex gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-neutral-200 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-3/4 rounded bg-neutral-200" />
                    <div className="h-4 w-1/2 rounded bg-neutral-200" />
                  </div>
                </div>
                <div className="h-10 w-full rounded-2xl bg-neutral-200" />
              </div>
            ))}
          </div>
        ) : filteredCupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white border-2 border-dashed border-neutral-200 p-12 sm:p-16 text-center shadow-sm">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-100 text-neutral-400 mb-5">
              <Ticket className="h-10 w-10" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-neutral-900">Nenhum cupom encontrado</h3>
            <p className="mt-1.5 text-xs sm:text-sm text-neutral-500 font-medium max-w-md">
              {searchQuery
                ? `Não encontramos nenhum cupom correspondente ao termo "${searchQuery}". Tente buscar por outro nome ou limpe a busca.`
                : activeTab === 'ativados'
                ? 'Você ainda não ativou nenhum cupom. Explore a aba "Todos os Cupons" para ativar vantagens para o seu carrinho.'
                : activeTab === 'historico'
                ? 'Nenhum cupom foi utilizado ou expirou recentemente na sua conta.'
                : 'Não há novos cupons cadastrados nesta categoria no momento. Fique atento às nossas campanhas especiais!'}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-5 py-2.5 rounded-xl border border-neutral-300 text-xs font-black uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Limpar Busca
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate(routes.marketplace.store.products())}
                className="px-5 py-2.5 rounded-xl bg-[#17345f] text-white text-xs font-black uppercase tracking-wider hover:bg-[#102746] transition-all cursor-pointer shadow-md"
              >
                Explorar Catálogo da Loja
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredCupons.map((cupom) => {
                const isAtivado = cuponsAtivados.has(cupom.id);
                const isAtivando = ativandoCupomId === cupom.id;
                const isUsado = cupom.status_local === 'usado';
                const isExpirado = cupom.status_local === 'expirado';
                const isEsgotado = cupom.status_local === 'esgotado';
                const isInactive = isUsado || isExpirado || isEsgotado;
                const isDesconto = cupom.categoria_cupom === 'desconto';
                const minValor = Number(cupom.valor_minimo_compra || 0);

                return (
                  <motion.div
                    key={cupom.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`relative group flex flex-col justify-between overflow-hidden rounded-3xl border-2 transition-all shadow-md hover:shadow-xl ${
                      isInactive
                        ? 'bg-neutral-100/90 border-neutral-300/80 opacity-75'
                        : isAtivado
                        ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/15'
                        : 'bg-white border-neutral-200/90 hover:border-[#17345f]'
                    }`}
                  >
                    {/* Semicírculos decorativos de ticket nas bordas laterais */}
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[#f3f4f8] border-r-2 border-neutral-300 z-10" />
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[#f3f4f8] border-l-2 border-neutral-300 z-10" />

                    {/* TOPO DO CARD: CABEÇALHO DO TICKET */}
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        {/* Tag Categoria */}
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl font-black shadow-sm ${
                              isInactive
                                ? 'bg-neutral-200 text-neutral-500'
                                : isDesconto
                                ? 'bg-gradient-to-br from-[#17345f] to-[#0f2342] text-amber-300'
                                : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white'
                            }`}
                          >
                            {isDesconto ? <Percent className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                              {isDesconto ? 'Cupom de Desconto' : 'Benefício de Frete'}
                            </span>
                            <h4 className="text-base font-black text-neutral-900 leading-tight">
                              {cupom.nome_cupom}
                            </h4>
                          </div>
                        </div>

                        {/* Badges de Status */}
                        {isUsado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-600">
                            <Check className="h-3 w-3" /> Usado
                          </span>
                        ) : isExpirado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-700">
                            <AlertCircle className="h-3 w-3" /> Expirado
                          </span>
                        ) : isEsgotado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
                            <Clock className="h-3 w-3" /> Esgotado
                          </span>
                        ) : isAtivado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> Ativado
                          </span>
                        ) : null}
                      </div>

                      {/* VALOR DO BENEFÍCIO EM DESTAQUE */}
                      <div className="my-4 rounded-2xl bg-neutral-50 border border-neutral-200/80 p-3.5 text-center">
                        <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest block mb-0.5">
                          Vantagem Aplicada
                        </span>
                        <div className="text-2xl sm:text-3xl font-black text-[#17345f] tracking-tight">
                          {cupom.categoria_cupom === 'entrega' ? (
                            cupom.tipo_entrega === 'frete_gratis' || cupom.tipo_entrega === 'frete_gratis_minimo' ? (
                              <span className="text-emerald-600 flex items-center justify-center gap-1.5">
                                <Truck className="h-6 w-6" /> FRETE GRÁTIS
                              </span>
                            ) : (
                              `Frete Fixo: ${formatCurrency(cupom.taxa_fixa_entrega || 0)}`
                            )
                          ) : cupom.tipo_desconto === 'porcentagem' ? (
                            <span className="text-rose-600">{cupom.valor_desconto}% OFF</span>
                          ) : (
                            <span className="text-emerald-700">{formatCurrency(cupom.valor_desconto || 0)} OFF</span>
                          )}
                        </div>

                        {minValor > 0 && (
                          <p className="mt-1 text-[11px] font-semibold text-neutral-500">
                            Válido em pedidos a partir de <strong className="text-neutral-900">{formatCurrency(minValor)}</strong>
                          </p>
                        )}
                      </div>

                      {/* CÓDIGO DO CUPOM COM BOTÃO DE COPIAR */}
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-neutral-300 bg-white p-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Tag className="h-4 w-4 text-neutral-400 shrink-0" />
                          <span className="font-mono text-xs sm:text-sm font-black tracking-wider text-neutral-800 truncate">
                            {cupom.codigo_cupom}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isInactive}
                          onClick={(e) => handleCopiarCupom(cupom, e)}
                          title="Copiar código"
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            isInactive
                              ? 'opacity-40 cursor-not-allowed text-neutral-400'
                              : copiedCupomId === cupom.id
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-neutral-100 hover:bg-[#17345f] hover:text-white text-neutral-700'
                          }`}
                        >
                          {copiedCupomId === cupom.id ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> Copiar
                            </>
                          )}
                        </button>
                      </div>

                      {/* REGRAS E VALIDADE */}
                      <div className="mt-4 space-y-1.5 text-[11px] font-medium text-neutral-500">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-neutral-400" />
                            {cupom.data_validade ? `Válido até ${formatDate(cupom.data_validade)}` : 'Sem data de expiração'}
                          </span>
                          <span className="font-bold text-neutral-700">
                            {cupom.limite_cliente > 1
                              ? `${cupom.cliente_usos || 0} de ${cupom.limite_cliente} usos`
                              : 'Uso único por conta'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* RODAPÉ DO CARD: BOTÃO DE AÇÃO */}
                    <div className="border-t border-dashed border-neutral-200 bg-neutral-50/60 p-4">
                      {isInactive ? (
                        <div className="w-full py-2.5 rounded-xl bg-neutral-200/80 text-neutral-500 text-xs font-black uppercase tracking-widest text-center">
                          Cupom Indisponível
                        </div>
                      ) : isAtivado ? (
                        <div className="space-y-2">
                          <div className="w-full py-2 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Pronto para o Checkout
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate(routes.marketplace.store.products())}
                            className="w-full py-2 rounded-xl bg-[#17345f] hover:bg-[#102746] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" /> Comprar com este cupom
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAtivarCupom(cupom)}
                          disabled={isAtivando}
                          className="w-full py-3 rounded-2xl bg-[#17345f] hover:bg-[#102746] text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer disabled:opacity-60"
                        >
                          {isAtivando ? (
                            <>
                              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Ativando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 text-[#d8bd73]" />
                              Ativar Cupom na Conta
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* ─── SEÇÃO: DICAS & FAQ "COMO FUNCIONAM OS CUPONS" ─── */}
        <div className="mt-16 rounded-3xl bg-white p-6 sm:p-10 shadow-lg border border-neutral-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#17345f] text-amber-300">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-neutral-900">Perguntas Frequentes sobre Cupons</h3>
              <p className="text-xs sm:text-sm text-neutral-500 font-medium">
                Tire suas dúvidas e aprenda a aproveitar o máximo de benefícios na GSA Store.
              </p>
            </div>
          </div>

          <div className="divide-y divide-neutral-200">
            {faqs.map((faq, index) => {
              const isExpanded = expandedFaqIndex === index;
              return (
                <div key={index} className="py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedFaqIndex(isExpanded ? null : index)}
                    className="flex w-full items-center justify-between text-left text-sm sm:text-base font-bold text-neutral-800 hover:text-[#17345f] transition-colors cursor-pointer"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`h-5 w-5 text-neutral-400 transition-transform duration-200 shrink-0 ${
                        isExpanded ? 'rotate-180 text-[#17345f]' : ''
                      }`}
                    />
                  </button>
                  {isExpanded && (
                    <p className="mt-2.5 text-xs sm:text-sm text-neutral-600 font-medium leading-relaxed pr-6">
                      {faq.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

export default CouponsPage;

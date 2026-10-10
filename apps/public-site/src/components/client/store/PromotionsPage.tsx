import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Star,
  Gift,
  Tag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  ShoppingBag,
  ArrowRight,
  ChevronRight,
  Zap,
  Award,
  Layers,
  Flame,
  Check,
  HelpCircle,
  ChevronDown,
  RotateCcw,
  Package,
  Crown,
  Percent,
  TrendingUp,
  SlidersHorizontal
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { clientOperationalWrite } from '../../../lib/clientOperationalWrite';
import { routes } from '../../../routing/routeCatalog';
import { navigate } from '../../../routing/navigationService';
import { EcommerceHeader } from './EcommerceHeader';

const GUEST_ACTIVATED_STORE_PROMOS_KEY = 'gsa_guest_activated_store_promos';

interface PromotionsPageProps {
  clientId?: string;
  onRequireAuth?: () => void;
}

type TabType = 'todas' | 'quantidade' | 'vip' | 'brindes' | 'ativadas';
type SortType = 'recentes' | 'maior_vantagem' | 'validade';

export function PromotionsPage({ clientId, onRequireAuth }: PromotionsPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('recentes');
  const [loading, setLoading] = useState(true);
  const [promocoes, setPromocoes] = useState<any[]>([]);
  const [promocoesAtivadas, setPromocoesAtivadas] = useState<Set<string>>(new Set());
  const [ativandoPromoId, setAtivandoPromoId] = useState<string | null>(null);
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);

  // Título da página
  useEffect(() => {
    document.title = 'Promoções & Ofertas VIP | GSA Store';
  }, []);

  const fetchPromotions = useCallback(async () => {
    setLoading(true);
    try {
      let clientePromosData: any[] = [];
      let globalPromosData: any[] = [];

      // 1. Promoções globais ativas
      const { data: gData, error: gError } = await supabase
        .from('promocoes')
        .select('*')
        .eq('status', 'ativa')
        .order('created_at', { ascending: false });

      if (!gError && gData) {
        globalPromosData = gData.map((promo: any) => ({
          id: promo.id,
          promo_id: promo.id,
          is_inteligente: false,
          is_vip: false,
          is_brinde: ['unidade_gratis', 'ganhe_outro_produto'].includes(promo.tipo),
          titulo: promo.titulo || 'Promoção GSA Store',
          descricao: promo.descricao || '',
          tipo: promo.tipo || 'desconto_proxima',
          tipo_desconto: promo.tipo_desconto || 'porcentagem',
          valor_desconto: Number(promo.valor_desconto || 0),
          data_expiracao: promo.data_fim_divulgacao || promo.data_expiracao || null,
          created_at: promo.created_at || new Date().toISOString(),
          produtos_elegiveis: promo.produtos_elegiveis || null,
        }));
      }

      // 2. Promoções direcionadas ao cliente VIP autenticado
      if (clientId) {
        const { data: cData, error: cError } = await supabase
          .from('cliente_promocoes')
          .select('*, promocoes(*)')
          .eq('cliente_id', clientId)
          .eq('status', 'ativa');

        if (!cError && cData) {
          clientePromosData = cData
            .filter((item: any) => Boolean(item.promocoes))
            .map((item: any) => ({
              id: item.id,
              promo_id: item.promocao_id || item.id,
              is_inteligente: false,
              is_vip: true,
              is_brinde: ['unidade_gratis', 'ganhe_outro_produto'].includes(item.promocoes?.tipo),
              titulo: item.promocoes?.titulo || 'Oferta VIP',
              descricao: item.promocoes?.descricao || '',
              tipo: item.promocoes?.tipo || 'desconto_proxima',
              tipo_desconto: item.promocoes?.tipo_desconto || 'porcentagem',
              valor_desconto: Number(item.promocoes?.valor_desconto || 0),
              data_expiracao: item.data_expiracao || item.promocoes?.data_fim_divulgacao || item.promocoes?.data_expiracao || null,
              created_at: item.created_at || new Date().toISOString(),
              produtos_elegiveis: item.promocoes?.produtos_elegiveis || null,
            }));
        }
      }

      // 3. Promoções de quantidade e combos inteligentes da loja
      const { data: inteligentePromosData, error: inteligenteError } = await supabase
        .from('promocoes_quantidade')
        .select('*')
        .eq('status', 'ativa')
        .order('created_at', { ascending: false });

      if (inteligenteError) throw inteligenteError;

      const mappedInteligentes = (inteligentePromosData || []).map((pq: any) => {
        const isBrinde = ['unidade_gratis', 'ganhe_outro_produto', 'brinde_quantidade'].includes(pq.tipo_promocao);
        return {
          id: pq.id,
          promo_id: pq.id,
          is_inteligente: true,
          is_vip: false,
          is_brinde: isBrinde,
          titulo: pq.nome || 'Promoção por Quantidade',
          descricao: pq.descricao || '',
          tipo: pq.tipo_promocao || 'compre_x_pague_y',
          tipo_desconto: pq.desconto_tipo || (isBrinde ? 'brinde' : 'porcentagem'),
          valor_desconto: Number(pq.desconto_valor || 0),
          quantidade_gatilho: pq.quantidade_gatilho || pq.quantidade_minima || 2,
          quantidade_paga: pq.quantidade_paga || 1,
          produto_gatilho_id: pq.produto_gatilho_id || null,
          categoria_gatilho_id: pq.categoria_gatilho_id || null,
          data_expiracao: pq.data_fim || null,
          created_at: pq.created_at || new Date().toISOString(),
        };
      });

      // 4. Promoções ativadas pelo cliente
      const ativadasSet = new Set<string>();
      if (clientId) {
        try {
          const { data: ativadasData } = await supabase
            .from('promocoes_quantidade_ativadas')
            .select('promocao_quantidade_id')
            .eq('cliente_id', clientId);

          if (ativadasData) {
            ativadasData.forEach((a: any) => ativadasSet.add(a.promocao_quantidade_id));
          }
        } catch (e) {
          console.warn('[PromotionsPage] Tabela promocoes_quantidade_ativadas não disponível:', e);
        }
      } else {
        try {
          const stored = JSON.parse(localStorage.getItem(GUEST_ACTIVATED_STORE_PROMOS_KEY) || '[]');
          if (Array.isArray(stored)) {
            stored.forEach((id: string) => ativadasSet.add(id));
          }
        } catch {
          localStorage.removeItem(GUEST_ACTIVATED_STORE_PROMOS_KEY);
        }
      }

      // Evitar duplicidades entre promoções globais e de cliente
      const seenIds = new Set<string>();
      const combinedPromos: any[] = [];

      [...clientePromosData, ...globalPromosData, ...mappedInteligentes].forEach((p) => {
        const uniqueKey = p.promo_id || p.id;
        if (!seenIds.has(uniqueKey)) {
          seenIds.add(uniqueKey);
          combinedPromos.push(p);
        }
      });

      setPromocoesAtivadas(ativadasSet);
      setPromocoes(combinedPromos);
    } catch (error) {
      console.error('[PromotionsPage] Erro ao carregar promoções:', error);
      toast.error('Não foi possível carregar as promoções disponíveis.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchPromotions();

    const channel = supabase
      .channel('realtime-promotions-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes_quantidade' }, () => {
        fetchPromotions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_promocoes' }, () => {
        fetchPromotions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes_quantidade_ativadas' }, () => {
        fetchPromotions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPromotions]);

  // Ação de Ativar Promoção
  const handleAtivarPromocao = async (promo: any) => {
    setAtivandoPromoId(promo.id);
    try {
      if (clientId) {
        try {
          await clientOperationalWrite(clientId, 'promocoes_quantidade_ativadas', 'insert', {
            promocao_quantidade_id: promo.id,
          });
        } catch (error: any) {
          if (!String(error?.message || '').includes('duplicate')) {
            throw error;
          }
        }
      } else {
        const nextSet = new Set(promocoesAtivadas);
        nextSet.add(promo.id);
        localStorage.setItem(GUEST_ACTIVATED_STORE_PROMOS_KEY, JSON.stringify([...nextSet]));
      }

      setPromocoesAtivadas((prev) => new Set([...prev, promo.id]));
      toast.success(`Promoção "${promo.titulo}" ativada! Ela será considerada no cálculo do seu carrinho.`, {
        icon: '🎉',
        duration: 4000,
      });
      window.dispatchEvent(new CustomEvent('promo-ativada', { detail: { id: promo.id } }));
    } catch (err: any) {
      console.error('[PromotionsPage] Erro ao ativar promoção:', err);
      toast.error('Erro ao ativar promoção.');
    } finally {
      setAtivandoPromoId(null);
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const total = promocoes.length;
    const ativadasCount = promocoes.filter((p) => promocoesAtivadas.has(p.id)).length;
    const combosCount = promocoes.filter((p) => p.is_inteligente && !p.is_brinde).length;
    const vipCount = promocoes.filter((p) => p.is_vip).length;
    const brindesCount = promocoes.filter((p) => p.is_brinde || p.tipo === 'unidade_gratis' || p.tipo === 'ganhe_outro_produto').length;

    return {
      total,
      ativadas: ativadasCount,
      combos: combosCount,
      vip: vipCount,
      brindes: brindesCount,
    };
  }, [promocoes, promocoesAtivadas]);

  // Filtragem e Ordenação
  const filteredPromos = useMemo(() => {
    let list = [...promocoes];

    // 1. Filtro por Aba
    if (activeTab === 'quantidade') {
      list = list.filter((p) => p.is_inteligente && !p.is_brinde);
    } else if (activeTab === 'vip') {
      list = list.filter((p) => p.is_vip);
    } else if (activeTab === 'brindes') {
      list = list.filter((p) => p.is_brinde || p.tipo === 'unidade_gratis' || p.tipo === 'ganhe_outro_produto');
    } else if (activeTab === 'ativadas') {
      list = list.filter((p) => promocoesAtivadas.has(p.id));
    }

    // 2. Busca
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const titulo = String(p.titulo || '').toLowerCase();
        const desc = String(p.descricao || '').toLowerCase();
        const tipo = String(p.tipo || '').toLowerCase();
        return titulo.includes(q) || desc.includes(q) || tipo.includes(q);
      });
    }

    // 3. Ordenação
    list.sort((a, b) => {
      if (sortBy === 'maior_vantagem') {
        const valA = Number(a.valor_desconto || 0);
        const valB = Number(b.valor_desconto || 0);
        return valB - valA;
      }
      if (sortBy === 'validade') {
        const dateA = a.data_expiracao ? new Date(a.data_expiracao).getTime() : Infinity;
        const dateB = b.data_expiracao ? new Date(b.data_expiracao).getTime() : Infinity;
        return dateA - dateB;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return list;
  }, [promocoes, activeTab, searchQuery, sortBy, promocoesAtivadas]);

  const faqs = [
    {
      question: 'Como as promoções são aplicadas no meu pedido?',
      answer:
        'Ao ativar uma promoção ou adicionar ao carrinho a quantidade de itens exigida pela oferta (por exemplo, 3 unidades de um produto com a promoção "Leve 3 Pague 2"), o desconto ou brinde é automaticamente calculado e exibido no subtotal do carrinho.',
    },
    {
      question: 'Posso usar um cupom de desconto junto com uma promoção de quantidade?',
      answer:
        'Sim! O sistema da GSA Store aplica primeiro os benefícios de volume/combo no carrinho e, em seguida, permite que você utilize seus cupons ativados no momento do checkout para economizar ainda mais.',
    },
    {
      question: 'O que são as Ofertas Exclusivas VIP?',
      answer:
        'São vantagens e condições especiais personalizadas para o seu perfil e nível de fidelidade na GSA Store. Clientes com maior engajamento recebem promoções exclusivas, presentes e descontos adicionais.',
    },
    {
      question: 'Como funcionam os brindes e unidades gratuitas?',
      answer:
        'Quando uma promoção de brinde for ativada e os requisitos atendidos, o produto brinde é automaticamente inserido no carrinho com valor R$ 0,00 e entregue junto com o seu pedido.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f3f4f8] flex flex-col text-neutral-900 selection:bg-purple-900 selection:text-white">
      {/* ─── HEADER ECOMMERCE ─── */}
      <EcommerceHeader
        clientId={clientId}
        onOpenCart={() => navigate(routes.marketplace.store.products() + '?modal=carrinho')}
        onRequireAuth={onRequireAuth}
      />

      {/* ─── HERO HEADER VIP (Desktop & Tablet) ─── */}
      <div className="hidden sm:block relative bg-gradient-to-br from-[#1b0a33] via-[#351161] to-[#51188f] overflow-hidden">
        {/* Glows Decorativos de Alto Padrão */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#d8bd73]/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 left-10 h-72 w-72 rounded-full bg-purple-400/15 blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-50" />

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
            <span className="text-[#d8bd73] font-black">Promoções & Ofertas VIP</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-[#d8bd73]/20 border border-[#d8bd73]/30 px-3.5 py-1 rounded-full mb-3.5 backdrop-blur-sm">
                <Crown className="h-3.5 w-3.5 text-[#d8bd73]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-[#d8bd73]">
                  Benefícios & Vantagens Especiais
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                Promoções & Ofertas VIP
              </h1>
              <p className="mt-2 text-sm sm:text-base text-purple-100/80 font-medium leading-relaxed">
                Aproveite descontos progressivos por quantidade, combos inteligentes e brindes exclusivos para suas compras na GSA Store.
              </p>
            </div>

            {/* Ações Rápidas */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(routes.marketplace.store.cupons())}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-black uppercase tracking-wider transition-all backdrop-blur-md cursor-pointer"
              >
                <Tag className="h-4 w-4 text-[#d8bd73]" />
                Ver Cupons de Desconto
              </button>
              <button
                type="button"
                onClick={() => navigate(routes.marketplace.store.products())}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#d8bd73] text-[#1b0a33] hover:bg-[#c9ad60] text-xs font-black uppercase tracking-wider transition-all shadow-lg hover:shadow-xl active:scale-95 cursor-pointer"
              >
                <ShoppingBag className="h-4 w-4 fill-current" />
                Explorar Catálogo
              </button>
            </div>
          </div>

          {/* ─── CARDS DE KPIS / METRICAS ─── */}
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Ofertas Ativas</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-[#d8bd73]">
                  <Flame className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{stats.total}</p>
              <p className="text-[10px] font-semibold text-white/50 mt-0.5">Disponíveis na loja</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Ativadas na Conta</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-emerald-300">{stats.ativadas}</p>
              <p className="text-[10px] font-semibold text-emerald-100/60 mt-0.5">Prontas para o carrinho</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Combos & Volume</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{stats.combos}</p>
              <p className="text-[10px] font-semibold text-white/50 mt-0.5">Leve mais por menos</p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 p-4 backdrop-blur-md text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Brindes & VIP</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Gift className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-white">{stats.brindes + stats.vip}</p>
              <p className="text-[10px] font-semibold text-white/50 mt-0.5">Presentes exclusivos</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── CORPO PRINCIPAL ─── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-0 sm:-mt-6 pb-20 relative z-20 w-full flex-1">
        {/* ─── BANNER DESTACADO VIP (Desktop & Tablet) ─── */}
        <div className="hidden sm:block mb-8 rounded-3xl bg-gradient-to-r from-purple-700 via-purple-800 to-indigo-900 p-6 sm:p-8 text-white shadow-xl border border-purple-500/30 relative overflow-hidden">
          <div className="absolute right-0 top-0 -mt-8 -mr-8 h-48 w-48 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start sm:items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-amber-300 border border-white/20 backdrop-blur-sm">
                <Star className="h-6 w-6 fill-current text-amber-300" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                  Suas Ofertas & Condições Exclusivas
                </h3>
                <p className="text-xs sm:text-sm text-purple-100 font-medium mt-0.5 leading-relaxed max-w-2xl">
                  {clientId
                    ? 'Como cliente GSA Store, você tem acesso prioritário a estas promoções especiais. Ative as ofertas de seu interesse e economize automaticamente.'
                    : 'Acesse sua conta ou cadastre-se para desbloquear promoções VIP personalizadas e acumular cashback em cada pedido.'}
                </p>
              </div>
            </div>

            {!clientId && (
              <button
                type="button"
                onClick={() => {
                  if (onRequireAuth) onRequireAuth();
                  else navigate(routes.login.personal());
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider hover:bg-amber-300 transition-all shadow-md shrink-0 cursor-pointer"
              >
                Acessar Minha Conta
              </button>
            )}
          </div>
        </div>

        {/* ─── BARRA DE FERRAMENTAS: ABAS, BUSCA E ORDENAÇÃO ─── */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Abas */}
            <div className="flex overflow-x-auto pb-2 lg:pb-0 gap-1.5 p-1.5 bg-neutral-200/70 rounded-2xl custom-scrollbar shrink-0 overscroll-x-contain touch-pan-y touch-pan-x">
              {(
                [
                  { key: 'todas', label: 'Todas as Promoções', count: stats.total, icon: Flame },
                  { key: 'quantidade', label: 'Combos & Quantidade', count: stats.combos, icon: Layers },
                  { key: 'vip', label: 'Exclusivas VIP', count: stats.vip, icon: Crown },
                  { key: 'brindes', label: 'Brindes & Presentes', count: stats.brindes, icon: Gift },
                  { key: 'ativadas', label: 'Minhas Ativadas', count: stats.ativadas, icon: CheckCircle2 },
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
                        ? 'bg-white text-purple-900 shadow-md ring-1 ring-black/5'
                        : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/40'
                    }`}
                  >
                    <IconComponent className={`h-3.5 w-3.5 ${isActive ? 'text-purple-700' : 'text-neutral-400'}`} />
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                          isActive ? 'bg-purple-900 text-white' : 'bg-neutral-300 text-neutral-700'
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
                  placeholder="Buscar promoção..."
                  className="w-full rounded-2xl border border-neutral-300 bg-white pl-9 pr-3 py-2.5 text-xs font-bold text-neutral-900 placeholder:text-neutral-400 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/10 transition-all"
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
                  aria-label="Ordenar promoções por"
                  className="w-full sm:w-auto rounded-2xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-neutral-700 focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/10 cursor-pointer transition-all"
                >
                  <option value="recentes">Mais Recentes</option>
                  <option value="maior_vantagem">Maior Vantagem</option>
                  <option value="validade">Próximas de Expirar</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ─── LISTAGEM DE PROMOÇÕES ─── */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-12">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-64 rounded-3xl bg-white border border-neutral-200 p-6 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-6 w-1/3 rounded-full bg-neutral-200" />
                  <div className="h-5 w-3/4 rounded bg-neutral-200" />
                  <div className="h-4 w-1/2 rounded bg-neutral-200" />
                </div>
                <div className="h-10 w-full rounded-2xl bg-neutral-200" />
              </div>
            ))}
          </div>
        ) : filteredPromos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-white border-2 border-dashed border-neutral-200 p-12 sm:p-16 text-center shadow-sm">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-purple-50 text-purple-400 mb-5">
              <Sparkles className="h-10 w-10" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-neutral-900">Nenhuma promoção encontrada</h3>
            <p className="mt-1.5 text-xs sm:text-sm text-neutral-500 font-medium max-w-md">
              {searchQuery
                ? `Não encontramos nenhuma oferta correspondente ao termo "${searchQuery}".`
                : activeTab === 'ativadas'
                ? 'Você ainda não ativou nenhuma promoção. Navegue pelas ofertas disponíveis e clique em "Ativar Promoção".'
                : 'No momento não há promoções ativas nesta categoria. Fique atento às nossas campanhas especiais!'}
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
                className="px-5 py-2.5 rounded-xl bg-purple-700 text-white text-xs font-black uppercase tracking-wider hover:bg-purple-800 transition-all cursor-pointer shadow-md"
              >
                Ver Catálogo de Produtos
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredPromos.map((promo) => {
                const isAtivada = promocoesAtivadas.has(promo.id);
                const isAtivando = ativandoPromoId === promo.id;
                const expirou = promo.data_expiracao && new Date(promo.data_expiracao) < new Date();

                // Tag de Tipo
                let badgeLabel = 'OFERTA ESPECIAL';
                let badgeColor = 'bg-purple-100 text-purple-800 border-purple-200';

                if (promo.tipo === 'unidade_gratis' || promo.tipo === 'compre_x_pague_y') {
                  badgeLabel = 'LEVE MAIS POR MENOS';
                  badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                } else if (promo.tipo === 'ganhe_outro_produto' || promo.is_brinde) {
                  badgeLabel = 'BRINDE EXCLUSIVO';
                  badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
                } else if (promo.is_vip) {
                  badgeLabel = 'EXCLUSIVO VIP';
                  badgeColor = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                }

                return (
                  <motion.div
                    key={promo.id}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`relative group flex flex-col justify-between overflow-hidden rounded-3xl border-2 transition-all shadow-md hover:shadow-xl ${
                      expirou
                        ? 'bg-neutral-100/90 border-neutral-300/80 opacity-75'
                        : isAtivada
                        ? 'bg-white border-purple-600 ring-2 ring-purple-600/15'
                        : 'bg-white border-neutral-200/90 hover:border-purple-500'
                    }`}
                  >
                    {/* Linha de Destaque no Topo do Card */}
                    <div className={`h-2 w-full ${isAtivada ? 'bg-purple-600' : 'bg-gradient-to-r from-purple-500 to-indigo-600'}`} />

                    <div className="p-6">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${badgeColor}`}
                        >
                          <Sparkles className="h-3 w-3" />
                          {badgeLabel}
                        </span>

                        {expirou ? (
                          <span className="text-[10px] font-black text-rose-600 uppercase flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Expirada
                          </span>
                        ) : promo.data_expiracao ? (
                          <span className="text-[10px] font-bold text-neutral-500 uppercase flex items-center gap-1">
                            <Clock className="h-3 w-3 text-neutral-400" /> Expira em {formatDate(promo.data_expiracao)}
                          </span>
                        ) : null}
                      </div>

                      {/* Título & Descrição */}
                      <h4 className="text-lg font-black text-neutral-900 leading-tight mb-2">
                        {promo.titulo}
                      </h4>
                      <p className="text-xs sm:text-sm text-neutral-600 font-medium leading-relaxed mb-4 line-clamp-3">
                        {promo.descricao}
                      </p>

                      {/* VALOR DA OFERTA EM DESTAQUE */}
                      <div className="my-4 rounded-2xl bg-purple-50/80 border border-purple-100 p-4 text-center">
                        <span className="text-[11px] font-bold text-purple-700 uppercase tracking-widest block mb-0.5">
                          Vantagem da Promoção
                        </span>
                        <div className="text-2xl sm:text-3xl font-black text-purple-900 tracking-tight">
                          {promo.is_brinde || ['unidade_gratis', 'ganhe_outro_produto'].includes(promo.tipo) ? (
                            <span className="text-emerald-700 flex items-center justify-center gap-1.5">
                              <Gift className="h-6 w-6" /> BRINDE GRÁTIS
                            </span>
                          ) : promo.tipo_desconto === 'valor' ? (
                            <span>{formatCurrency(promo.valor_desconto)} OFF</span>
                          ) : promo.valor_desconto ? (
                            <span>{promo.valor_desconto}% OFF</span>
                          ) : (
                            <span className="text-purple-700">OFERTA ESPECIAL</span>
                          )}
                        </div>
                        {promo.quantidade_gatilho && Number(promo.quantidade_gatilho) > 1 && (
                          <p className="mt-1 text-[11px] font-semibold text-purple-700">
                            Ao comprar a partir de <strong>{promo.quantidade_gatilho} unidades</strong>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* RODAPÉ DO CARD */}
                    <div className="border-t border-neutral-100 bg-neutral-50/60 p-4">
                      {expirou ? (
                        <div className="w-full py-2.5 rounded-xl bg-neutral-200 text-neutral-500 text-xs font-black uppercase tracking-widest text-center">
                          Oferta Expirada
                        </div>
                      ) : isAtivada ? (
                        <div className="space-y-2">
                          <div className="w-full py-2 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Promoção Ativa no Carrinho
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate(routes.marketplace.store.products())}
                            className="w-full py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" /> Comprar com esta promoção
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAtivarPromocao(promo)}
                          disabled={isAtivando}
                          className="w-full py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-95 cursor-pointer disabled:opacity-60"
                        >
                          {isAtivando ? (
                            <>
                              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Ativando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 text-amber-300" />
                              Ativar Promoção
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

        {/* ─── SEÇÃO: DICAS & FAQ DE PROMOÇÕES ─── */}
        <div className="mt-16 rounded-3xl bg-white p-6 sm:p-10 shadow-lg border border-neutral-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-700 text-amber-300">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-neutral-900">Perguntas Frequentes sobre Promoções</h3>
              <p className="text-xs sm:text-sm text-neutral-500 font-medium">
                Entenda como funcionam os descontos progressivos e benefícios por volume na GSA Store.
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
                    className="flex w-full items-center justify-between text-left text-sm sm:text-base font-bold text-neutral-800 hover:text-purple-700 transition-colors cursor-pointer"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`h-5 w-5 text-neutral-400 transition-transform duration-200 shrink-0 ${
                        isExpanded ? 'rotate-180 text-purple-700' : ''
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

export default PromotionsPage;

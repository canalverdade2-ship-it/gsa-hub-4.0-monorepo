import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { EcommerceHeader } from './EcommerceHeader';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';
import { useStoreConfig } from './useStoreConfig';

import StoreItemCard from './StoreItemCard';
import { TermosDeUsoDialog } from '../../public/TermosDeUsoDialog';
import { PrivacyPolicyDialog } from '../../public/PrivacyPolicyDialog';
import { CentralDeAjudaDialog } from '../../public/CentralDeAjudaDialog';
import {
  Loader2, TrendingUp, Zap, Clock, Star, ArrowRight,
  ShieldCheck, Truck, CreditCard, Award, Flame,
  ChevronRight, Tag, Package,
  Laptop, Home, Shirt, FlaskConical, Plane,
  Car, Gem, BadgePercent, MapPin, PhoneCall, RefreshCw,
} from 'lucide-react';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { useSEO } from '../../../hooks/useSEO';
import { calculateProductRating } from '../../../lib/productRatings';
import { getProductDiscountPercentage } from '../../../lib/productPricing';

interface EcommerceHomeProps {
  clientId?: string;
  onRequireAuth?: () => void;
  onOpenCart?: () => void;
  cartItemCount?: number;
}

/* ─── Daily Flash Sale Countdown Hook (00:00:00 às 23:59:59 todos os dias) ─── */
function useCountdown() {
  const getTimeLeft = useCallback(() => {
    const now = new Date();
    // Fim do dia atual às 23:59:59.999
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const diff = Math.max(0, endOfDay.getTime() - now.getTime());
    return {
      h: String(Math.floor(diff / 3600000)).padStart(2, '0'),
      m: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
      s: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
    };
  }, []);

  const [time, setTime] = useState(getTimeLeft());
  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [getTimeLeft]);
  return time;
}

/* ─── Rotação Diária Automática Baseada na Data do Dia (00:00 às 23:59) ─── */
function getDailySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getDailyRotatingList(items: any[], count: number, salt: number = 42): any[] {
  if (!items || items.length === 0) return [];
  const baseSeed = getDailySeed() + salt;
  const shuffled = [...items].sort((a, b) => {
    const seedA = Number(a.id ? a.id.charCodeAt(0) + (a.id.charCodeAt(1) || 0) : 0) + baseSeed;
    const seedB = Number(b.id ? b.id.charCodeAt(0) + (b.id.charCodeAt(1) || 0) : 0) + baseSeed;
    return seededRandom(seedA) - seededRandom(seedB);
  });
  return shuffled.slice(0, count);
}


/* ─── Horizontal Scroll Shelf with Auto-Scroll & Touch Swipe ─── */
function HorizontalShelf({
  items,
  showRanking = false,
  clientId,
}: {
  items: any[];
  showRanking?: boolean;
  clientId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const resumeTimerRef = useRef<any>(null);

  // 1. Observe when shelf enters the screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. Auto-advance item-by-item when visible & not being touched (every 1.0s)
  useEffect(() => {
    if (!isVisible || isInteracting || items.length <= 1) return;

    const interval = setInterval(() => {
      const el = containerRef.current;
      if (!el) return;

      const firstChild = el.querySelector<HTMLElement>(':scope > div');
      const step = firstChild ? firstChild.offsetWidth + 12 : 182; // card width + gap
      const maxScroll = el.scrollWidth - el.clientWidth;

      if (el.scrollLeft >= maxScroll - 15) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: step, behavior: 'smooth' });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible, isInteracting, items.length]);

  // Helper to pause auto-scroll during touch / drag and resume after 2.5s
  const handleInteractionStart = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setIsInteracting(true);
  };

  const handleInteractionEnd = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsInteracting(false);
    }, 2500);
  };

  const scrollBy = (dir: number) => {
    handleInteractionStart();
    const el = containerRef.current;
    if (!el) return;
    const firstChild = el.querySelector<HTMLElement>(':scope > div');
    const step = firstChild ? (firstChild.offsetWidth + 12) * 2 : 280;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
    handleInteractionEnd();
  };

  if (!items.length) return null;

  return (
    <div
      className="relative group/shelf"
      onMouseEnter={handleInteractionStart}
      onMouseLeave={handleInteractionEnd}
      onTouchStart={handleInteractionStart}
      onTouchEnd={handleInteractionEnd}
    >
      {/* Left arrow */}
      <button
        onClick={() => scrollBy(-1)}
        className="absolute -left-4 top-1/2 z-10 -translate-y-1/2 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 opacity-0 group-hover/shelf:opacity-100 transition-opacity hover:bg-gray-50 cursor-pointer"
        aria-label="Rolar para esquerda"
      >
        <ChevronRight size={18} className="rotate-180" />
      </button>

      {/* Horizontal Carousel Strip */}
      <div
        ref={containerRef}
        className="flex gap-3.5 overflow-x-auto scroll-smooth pt-3.5 pb-2.5 px-2 snap-x snap-proximity [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-x-contain touch-pan-y touch-pan-x"
      >
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="relative w-[170px] sm:w-[200px] shrink-0 snap-start"
          >
            {showRanking && (
              <div className="absolute -left-1 -top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-neutral-950 to-neutral-800 text-xs font-black text-white shadow-md ring-2 ring-white">
                {idx + 1}
              </div>
            )}
            <StoreItemCard
              item={item}
              tipo="produto"
              clientId={clientId}
              onAdd={() => navigate(routes.marketplace.store.product(item.id) + '?modal=quantidade')}
              onClick={() => navigate(routes.marketplace.store.product(item.id))}
            />
          </div>
        ))}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scrollBy(1)}
        className="absolute -right-4 top-1/2 z-10 -translate-y-1/2 hidden sm:flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg border border-gray-200 text-gray-600 opacity-0 group-hover/shelf:opacity-100 transition-opacity hover:bg-gray-50 cursor-pointer"
        aria-label="Rolar para direita"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

/* ─── Section Header ─── */
function SectionHeader({
  Icon, title, badge, subtitle, actionLabel, onAction,
}: {
  Icon?: any; title: string; badge?: string; subtitle?: string;
  actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div className="mb-5 flex items-end justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          {Icon && <Icon size={22} className="text-[#17345f] shrink-0" strokeWidth={2} />}
          <h2 className="text-xl font-black text-gray-900 sm:text-2xl tracking-tight">{title}</h2>
          {badge && (
            <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-white shadow-sm">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500 font-medium">{subtitle}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="group flex items-center gap-1 text-xs font-bold text-[#17345f] hover:text-[#0f2342] transition-colors cursor-pointer shrink-0 ml-4"
        >
          {actionLabel}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

/* ─── Flash Sale Timer ─── */
function FlashSaleTimer() {
  const { h, m, s } = useCountdown();
  return (
    <div className="flex items-center gap-2">
      <Flame size={16} className="text-orange-500 animate-pulse shrink-0" />
      <span className="text-xs font-extrabold text-gray-700 uppercase tracking-wider hidden sm:inline">Termina em</span>
      <div className="flex items-center gap-1 font-mono text-sm font-black text-gray-900">
        <span className="flex h-7 min-w-[30px] items-center justify-center rounded-md bg-gray-900 px-1.5 text-white">{h}</span>
        <span className="text-gray-500">:</span>
        <span className="flex h-7 min-w-[30px] items-center justify-center rounded-md bg-gray-900 px-1.5 text-white">{m}</span>
        <span className="text-gray-500">:</span>
        <span className="flex h-7 min-w-[30px] items-center justify-center rounded-md bg-rose-600 px-1.5 text-white animate-pulse">{s}</span>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export function EcommerceHome({
  clientId,
  onRequireAuth,
  onOpenCart,
  cartItemCount = 0,
}: EcommerceHomeProps) {
  const { freeShippingThreshold } = useStoreConfig();
  const [loading, setLoading] = useState(true);
  const [maisVendidos, setMaisVendidos] = useState<any[]>([]);
  const [novidades, setNovidades] = useState<any[]>([]);
  const [ofertas, setOfertas] = useState<any[]>([]);
  const [recomendados, setRecomendados] = useState<any[]>([]);
  const [eletronicos, setEletronicos] = useState<any[]>([]);
  const [casa, setCasa] = useState<any[]>([]);
  const [moda, setModa] = useState<any[]>([]);
  const [beleza, setBeleza] = useState<any[]>([]);
  const [localCartCount, setLocalCartCount] = useState(cartItemCount);

  // Modal states
  const [showTermos, setShowTermos] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showAjuda, setShowAjuda] = useState(false);

  useEffect(() => { setLocalCartCount(cartItemCount); }, [cartItemCount]);

  useSEO({
    title: 'GSA Store — Marketplace Completo | Produtos, Assinaturas & Viagens',
    description: 'Encontre produtos, assinaturas e experiências na GSA Store com Frete Grátis, Pontos GSA e preços especiais.',
    type: 'website',
  });

  /* Cart count from DB or guest localStorage */
  useEffect(() => {
    const updateCount = () => {
      if (cartItemCount > 0) {
        setLocalCartCount(cartItemCount);
        return;
      }
      if (clientId) {
        supabase.from('loja_carrinhos').select('quantidade').eq('cliente_id', clientId).in('tipo', ['produto', 'assinatura'])
          .then(({ data }) => {
            if (data) setLocalCartCount(data.reduce((a, c) => a + (Number(c.quantidade) || 1), 0));
          });
      } else {
        try {
          const raw = localStorage.getItem('gsa_pending_store_checkout');
          if (raw) {
            const parsed = JSON.parse(raw);
            const items = (Array.isArray(parsed?.items) ? parsed.items : [])
              .filter((item: any) => item.tipo === 'produto' || item.tipo === 'assinatura');
            setLocalCartCount(items.reduce((a: number, c: any) => a + (Number(c.quantidade) || 1), 0));
          } else {
            setLocalCartCount(0);
          }
        } catch {
          setLocalCartCount(0);
        }
      }
    };

    updateCount();
    window.addEventListener('gsa-cart-updated', updateCount);
    window.addEventListener('storage', updateCount);
    return () => {
      window.removeEventListener('gsa-cart-updated', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, [clientId, cartItemCount]);

  const fetchHomeData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('produtos')
        .select('*')
        .eq('status', 'ativo')
        .eq('visivel_na_loja', true)
        .order('created_at', { ascending: false })
        .limit(150);

      if (data && data.length > 0) {
        // Lançamentos: os 12 produtos mais recentes cadastrados
        setNovidades(data.slice(0, 12));

        // Mais Vendidos: ordenados por maior avaliação em estrelas e volume de reviews
        const sortedMaisVendidos = [...data].sort((a, b) => {
          const ratA = calculateProductRating(a);
          const ratB = calculateProductRating(b);
          if (ratB.rating !== ratA.rating) return ratB.rating - ratA.rating;
          if (ratB.totalCount !== ratA.totalCount) return ratB.totalCount - ratA.totalCount;
          const scoreA = (Number(a.total_vendas || a.vendas_count || 0) * 10) + (a.destaque ? 20 : 0);
          const scoreB = (Number(b.total_vendas || b.vendas_count || 0) * 10) + (b.destaque ? 20 : 0);
          return scoreB - scoreA;
        });
        setMaisVendidos(sortedMaisVendidos.slice(0, 12));
        
        // Ofertas do Dia: produtos com maior porcentagem de desconto real (% OFF decrescente)
        const comDescontoCadastrado = data.filter(p => 
          (Number(p.desconto_percentual || 0) > 0) || 
          (p.valor_promocional && Number(p.valor_promocional) < Number(p.valor)) ||
          Boolean(p.desconto_ativo)
        );

        if (comDescontoCadastrado.length >= 6) {
          const sortedOfertas = [...comDescontoCadastrado].sort((a, b) => {
            const discA = getProductDiscountPercentage(a);
            const discB = getProductDiscountPercentage(b);
            if (discB !== discA) return discB - discA;
            return Number(b.valor || 0) - Number(a.valor || 0);
          });
          setOfertas(sortedOfertas.slice(0, 12));
        } else {
          const discountTiers = [35, 30, 28, 25, 22, 20, 18, 15];
          const ofertasDoDia = getDailyRotatingList(data, 24, 107).map((prod, idx) => {
            const precoOriginal = Number(prod.valor || 0);
            if (prod.valor_promocional && Number(prod.valor_promocional) < precoOriginal) {
              return prod;
            }
            const pct = discountTiers[(getDailySeed() + idx) % discountTiers.length];
            const precoRelampago = Math.round(precoOriginal * (1 - pct / 100) * 100) / 100;
            return {
              ...prod,
              desconto_percentual: pct,
              valor_promocional: precoRelampago,
              _oferta_relampago_diaria: true,
            };
          });
          ofertasDoDia.sort((a, b) => {
            const discA = getProductDiscountPercentage(a);
            const discB = getProductDiscountPercentage(b);
            if (discB !== discA) return discB - discA;
            return Number(b.valor || 0) - Number(a.valor || 0);
          });
          setOfertas(ofertasDoDia.slice(0, 12));
        }

        setRecomendados(getDailyRotatingList(data, 8, 77));

        const eletroData = data.filter(p => /fone|smart|tv|cabo|carregador|usb|eletr|airfryer|forno|mixer|bluetooth|caixa|led|bateria|sound|relogio|computador|notebook|teclado|mouse/i.test(p.nome) || p.categoria_id === 'c7abd6df-c781-44f3-9120-9983b720b6ef');
        const casaData = data.filter(p => /toalha|mesa|cama|manta|cozinha|panela|fritadeira|almofada|decor|tapete|organizador|lençol|copo|garrafa|xícara|prato|travesseiro|cortina/i.test(p.nome));
        const modaData = data.filter(p => /camiset|sapato|bota|roupa|mochila|bolsa|calça|bermuda|tenis|vestido|jaqueta|meia|chinelo|sandalia|acessorio|cinto|carteira/i.test(p.nome) || p.categoria_id === 'e58c3ab6-f1c5-49df-8d31-54c16ec4c52b');
        const belezaData = data.filter(p => /creme|colágeno|pele|cabelo|shampoo|perfume|beleza|anti-rugas|hidratante|maquiagem|facial|corpo|sabonete|condicionador|estética/i.test(p.nome));

        setEletronicos(eletroData.length >= 3 ? eletroData.slice(0, 12) : data.slice(0, 8));
        setCasa(casaData.length >= 3 ? casaData.slice(0, 12) : data.slice(4, 12));
        setModa(modaData.length >= 3 ? modaData.slice(0, 12) : data.slice(8, 16));
        setBeleza(belezaData.length >= 3 ? belezaData.slice(0, 12) : data.slice(12, 20));
      }
    } catch (err) {
      console.error('Erro home:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHomeData();
  }, [fetchHomeData]);

  useRealtimeSubscription(
    [
      {
        table: 'produtos',
        debounceMs: 300,
        onPayload: (payload: any) => {
          if (payload?.eventType === 'UPDATE' && payload?.new) {
            const updateItem = (item: any) => item.id === payload.new.id ? { ...item, ...payload.new } : item;
            setNovidades(prev => prev.map(updateItem));
            setMaisVendidos(prev => prev.map(updateItem));
            setOfertas(prev => prev.map(updateItem));
            setRecomendados(prev => prev.map(updateItem));
            setEletronicos(prev => prev.map(updateItem));
            setCasa(prev => prev.map(updateItem));
            setModa(prev => prev.map(updateItem));
            setBeleza(prev => prev.map(updateItem));
          } else {
            fetchHomeData();
          }
        },
      },
      {
        table: 'loja_carrinhos',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: () => {
          if (clientId) {
            supabase.from('loja_carrinhos').select('quantidade').eq('cliente_id', clientId)
              .then(({ data }) => {
                if (data) setLocalCartCount(data.reduce((a, c) => a + (Number(c.quantidade) || 1), 0));
              });
          }
        },
      },
    ],
    [clientId, fetchHomeData]
  );

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      <EcommerceHeader
        clientId={clientId}
        cartItemCount={localCartCount}
        onOpenCart={onOpenCart}
        onRequireAuth={onRequireAuth}
      />

      <main>
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

          {loading ? (
            <div className="flex h-56 items-center justify-center rounded-2xl bg-white">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-[#17345f]" />
                <p className="text-xs text-gray-400 font-medium">Carregando produtos...</p>
              </div>
            </div>
          ) : (
            <>

              {/* ── Flash Sale (00:00 às 23:59 Diário) ── */}
              {ofertas.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100">
                  {/* Header com gradiente vermelho sutil */}
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-rose-50 to-orange-50 px-4 sm:px-5 py-3.5 sm:py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
                        <Zap size={18} strokeWidth={2.5} />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-gray-900 sm:text-lg leading-none">Oferta Relâmpago</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium">Preços imperdíveis por tempo limitado</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <FlashSaleTimer />
                      <button
                        onClick={() => navigate(routes.marketplace.store.products() + '?filtro=ofertas')}
                        className="hidden sm:flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                      >
                        Ver todas <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="p-5">
                    <HorizontalShelf items={ofertas} clientId={clientId} />
                  </div>
                </section>
              )}

              {/* ── Mais Vendidos ── */}
              {maisVendidos.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
                  <div className="mb-5 flex items-end justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17345f] text-white shadow-sm">
                        <TrendingUp size={18} strokeWidth={2} />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-gray-900 sm:text-lg leading-none">Mais Vendidos</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium">Favoritos da comunidade GSA</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(routes.marketplace.store.products() + '?filtro=mais-vendidos')}
                      className="flex items-center gap-1 text-xs font-bold text-[#17345f] hover:underline cursor-pointer"
                    >
                      Ver todos <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={maisVendidos} showRanking clientId={clientId} />
                </section>
              )}

              {/* ── Destaque 1: Eletrônicos & Tecnologia ── */}
              {eletronicos.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-blue-100/70 p-4 sm:p-5">
                  <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                        <Laptop size={18} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm sm:text-lg font-black text-gray-900 leading-tight truncate sm:whitespace-normal">
                          Eletrônicos & Tecnologia
                        </h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium truncate">Os melhores dispositivos, gadgets e acessórios</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`${routes.marketplace.store.products()}?busca=${encodeURIComponent('Eletrônicos')}`)}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      <span className="hidden sm:inline">Ver departamento</span>
                      <span className="sm:hidden">Ver mais</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={eletronicos} clientId={clientId} />
                </section>
              )}

              {/* ── Destaque 2: Casa, Mesa & Eletro ── */}
              {casa.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-amber-100/70 p-4 sm:p-5">
                  <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
                        <Home size={18} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm sm:text-lg font-black text-gray-900 leading-tight truncate sm:whitespace-normal">
                          Casa, Mesa & Eletro
                        </h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium truncate">Praticidade e elegância para o seu lar</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`${routes.marketplace.store.products()}?busca=${encodeURIComponent('Casa')}`)}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      <span className="hidden sm:inline">Ver departamento</span>
                      <span className="sm:hidden">Ver mais</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={casa} clientId={clientId} />
                </section>
              )}

              {/* ── Destaque 3: Moda & Estilo ── */}
              {moda.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-pink-100/70 p-4 sm:p-5">
                  <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-600 text-white shadow-sm">
                        <Shirt size={18} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm sm:text-lg font-black text-gray-900 leading-tight truncate sm:whitespace-normal">
                          Moda & Estilo
                        </h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium truncate">Roupas, calçados e acessórios para todos os estilos</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`${routes.marketplace.store.products()}?busca=${encodeURIComponent('Moda')}`)}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold text-pink-600 hover:underline cursor-pointer"
                    >
                      <span className="hidden sm:inline">Ver departamento</span>
                      <span className="sm:hidden">Ver mais</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={moda} clientId={clientId} />
                </section>
              )}

              {/* ── Destaque 4: Beleza & Saúde ── */}
              {beleza.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-purple-100/70 p-4 sm:p-5">
                  <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                        <FlaskConical size={18} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm sm:text-lg font-black text-gray-900 leading-tight truncate sm:whitespace-normal">
                          Beleza & Saúde
                        </h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium truncate">Cosméticos, skincare e bem-estar</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`${routes.marketplace.store.products()}?busca=${encodeURIComponent('Beleza')}`)}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold text-purple-600 hover:underline cursor-pointer"
                    >
                      <span className="hidden sm:inline">Ver departamento</span>
                      <span className="sm:hidden">Ver mais</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={beleza} clientId={clientId} />
                </section>
              )}

              {/* ── Banner Único Wide (Shopee / ML style) ── */}
              <div
                onClick={() => navigate(routes.marketplace.store.products())}
                className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all hover:shadow-xl"
                style={{ minHeight: '130px', background: 'linear-gradient(120deg, #1e293b 0%, #17345f 60%, #1e4a8a 100%)' }}
              >
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-400/10 to-transparent" />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10">
                  <Package size={96} className="text-white" />
                </div>
                <div className="relative z-10 flex h-full items-center justify-between p-6 sm:p-8">
                  <div>
                    <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-900">
                      Novidade
                    </span>
                    <h3 className="mt-2 text-2xl font-black text-white sm:text-3xl leading-tight">
                      Novidades & Lançamentos
                    </h3>
                    <p className="mt-1 text-sm text-white/70 font-medium">
                      Os produtos que acabaram de chegar no catálogo GSA
                    </p>
                  </div>
                  <button className="hidden sm:flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-black text-[#17345f] shadow-xl transition-all group-hover:bg-amber-400 group-hover:text-gray-900 cursor-pointer">
                    Ver Lançamentos <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* ── Novidades ── */}
              {novidades.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
                  <div className="mb-5 flex items-end justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                        <Tag size={18} strokeWidth={2} />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-gray-900 sm:text-lg leading-none">Novidades do Catálogo</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium">Chegaram agora no catálogo GSA</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(routes.marketplace.store.products() + '?filtro=novidades')}
                      className="flex items-center gap-1 text-xs font-bold text-[#17345f] hover:underline cursor-pointer"
                    >
                      Ver todas <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={novidades} clientId={clientId} />
                </section>
              )}

              {/* ── Recomendados ── */}
              {recomendados.length > 0 && clientId && (
                <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 to-white shadow-sm border border-indigo-100 p-5">
                  <div className="mb-5 flex items-end justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                        <Star size={18} strokeWidth={2} />
                      </div>
                      <div>
                        <h2 className="text-base font-black text-gray-900 sm:text-lg leading-none">Recomendados para Você</h2>
                        <p className="mt-0.5 text-[11px] text-gray-500 font-medium">Com base no seu perfil de compras</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(routes.marketplace.store.products())}
                      className="flex items-center gap-1 text-xs font-bold text-[#17345f] hover:underline cursor-pointer"
                    >
                      Ver mais <ChevronRight size={14} />
                    </button>
                  </div>
                  <HorizontalShelf items={recomendados} clientId={clientId} />
                </section>
              )}


              {/* ── Banners Promocionais Inferiores (Clube VIP & Frete Grátis) ── */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Banner 1 — VIP */}
                <div
                  onClick={() => navigate(routes.marketplace.store.vip())}
                  className="group relative overflow-hidden rounded-2xl bg-[#17345f] cursor-pointer transition-all hover:shadow-xl hover:scale-[1.01]"
                  style={{ minHeight: '160px' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#17345f] via-[#1e4a8a] to-[#0d2240]" />
                  <div className="absolute -right-8 -bottom-8 h-44 w-44 rounded-full bg-white/5 blur-2xl" />
                  <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-400/10" />
                  <div className="relative z-10 flex h-full flex-col justify-between p-6">
                    <div>
                      <span className="rounded-full bg-amber-400/20 border border-amber-400/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">
                        Clube VIP
                      </span>
                      <h3 className="mt-3 text-xl font-black text-white leading-tight">
                        Economize até <span className="text-amber-400">30%</span> em cada compra
                      </h3>
                      <p className="mt-1.5 text-xs text-white/70 font-medium leading-relaxed">
                        Pontos acumulativos e resgate via PIX
                      </p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-amber-400 group-hover:gap-2.5 transition-all">
                      Conhecer o Programa <ArrowRight size={14} />
                    </span>
                  </div>
                </div>

                {/* Banner 2 — Frete Grátis */}
                <div
                  onClick={() => navigate(routes.marketplace.store.products())}
                  className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all hover:shadow-xl hover:scale-[1.01]"
                  style={{ minHeight: '160px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}
                >
                  <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
                  <div className="absolute right-4 bottom-4 h-20 w-20 rounded-full bg-white/10" />
                  <div className="relative z-10 flex h-full flex-col justify-between p-6">
                    <div>
                      <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                        Frete Grátis
                      </span>
                      <h3 className="mt-3 text-xl font-black text-white leading-tight">
                        Grátis em compras <span className="text-emerald-300">acima de R$ {freeShippingThreshold}</span>
                      </h3>
                      <p className="mt-1.5 text-xs text-white/80 font-medium leading-relaxed">
                        Entrega expressa para todo o Brasil
                      </p>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-white group-hover:gap-2.5 transition-all">
                      Ver produtos elegíveis <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Pagamento & Garantias Footer Strip ── */}
              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  {[
                    {
                      Icon: CreditCard, color: '#2563eb',
                      title: 'Pagamento Facilitado',
                      desc: 'Pague via Pix instantâneo, Cartão de Crédito em até 10× sem juros ou use seu Crédito GSA.',
                    },
                    {
                      Icon: Truck, color: '#16a34a',
                      title: 'Envio Seguro & Rastreável',
                      desc: 'Rastreamento em tempo real do pedido desde a confirmação do pagamento até a entrega na sua porta.',
                    },
                    {
                      Icon: RefreshCw, color: '#d97706',
                      title: 'Garantia & Devolução GSA',
                      desc: 'Seu dinheiro 100% protegido. Garantia de troca ou reembolso em até 7 dias após o recebimento.',
                    },
                  ].map(({ Icon: I, color, title, desc }, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: color + '15', color }}
                      >
                        <I size={22} strokeWidth={1.75} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-gray-900">{title}</h4>
                        <p className="mt-1 text-xs text-gray-500 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </>
          )}
        </div>
      </main>

      {/* ── Footer Mini ── */}
      <footer className="mt-4 border-t border-gray-200 bg-white py-6 text-center">
        <p className="text-xs text-gray-400">
          © 2026 <strong className="text-gray-600">GSA HUB</strong> — Marketplace & Tecnologia. Todos os direitos reservados.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => setShowTermos(true)}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            Termos de Uso
          </button>
          <button
            onClick={() => setShowPrivacy(true)}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            Política de Privacidade
          </button>
          <button
            onClick={() => setShowAjuda(true)}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            Central de Ajuda
          </button>
        </div>
      </footer>
      {/* ── Modais do Footer ── */}
      <TermosDeUsoDialog isOpen={showTermos} onClose={() => setShowTermos(false)} />
      <PrivacyPolicyDialog isOpen={showPrivacy} onClose={() => setShowPrivacy(false)} />
      <CentralDeAjudaDialog isOpen={showAjuda} onClose={() => setShowAjuda(false)} clientId={clientId} />
    </div>
  );
}

export default EcommerceHome;

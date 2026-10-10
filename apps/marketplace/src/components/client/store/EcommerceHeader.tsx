import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ShoppingCart, User, Menu, X, Bell, LogIn, Diamond, Loader2, 
  Zap, TrendingUp, Sparkles, Plane, Car, Heart, Gem,
  LayoutGrid, MapPin, Package, Laptop, Home, Shirt, FlaskConical, 
  ChevronRight, ArrowRight, Tag, Ticket, Compass, Flame, ShoppingBag
} from 'lucide-react';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { useAppLocation } from '../../../routing/useAppLocation';
import { LogoGSA } from '../../ui/LogoGSA';
import { HomeLogoLink } from '../../ui/HomeLogoLink';
import { formatCurrency } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';
import { clientOperationalWrite } from '../../../lib/clientOperationalWrite';
import { useClientNotifications } from '../../../hooks/useClientNotifications';
import { VolteEganheModal } from './VolteEganheModal';
import { consultarCEP, ViaCEPResult } from '../../../utils/viaCep';
import { toast } from 'react-hot-toast';
import { fetchWishlistFromDb, getWishlist } from '../../../lib/wishlistStorage';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';
import { useStoreConfig } from './useStoreConfig';

interface EcommerceHeaderProps {
  clientId?: string;
  cartItemCount?: number;
  onOpenCart?: () => void;
  onRequireAuth?: () => void;
  onSearch?: (query: string) => void;
  initialSearchQuery?: string;
  notifications?: any[];
  unreadCount?: number;
  onMarkNotificationAsRead?: (id: string) => void;
}

export function EcommerceHeader({
  clientId,
  cartItemCount,
  onOpenCart,
  onRequireAuth,
  onSearch,
  initialSearchQuery = '',
}: EcommerceHeaderProps) {
  const { freeShippingThreshold } = useStoreConfig();
  const { notifications, unreadNotifications, markAsRead, markAllAsRead } = useClientNotifications();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const route = useAppLocation();

  const [pointsBalance, setPointsBalance] = useState(0);
  const [localCartCount, setLocalCartCount] = useState(cartItemCount || 0);
  const [wishlistCount, setWishlistCount] = useState(() => getWishlist(clientId).length);

  // Sincronização em tempo real do contador de favoritos
  useEffect(() => {
    const updateWishlist = () => {
      setWishlistCount(getWishlist(clientId).length);
    };
    updateWishlist();
    if (clientId) {
      fetchWishlistFromDb(clientId).then((ids) => {
        setWishlistCount(ids.length);
      }).catch(() => {});
    }
    window.addEventListener('gsa-wishlist-updated', updateWishlist);
    return () => window.removeEventListener('gsa-wishlist-updated', updateWishlist);
  }, [clientId]);

  // Estado do Menu Lateral de Categorias
  const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState('');

  // Estados para Gestão de CEP e Localização do Cliente
  const [userLocationLabel, setUserLocationLabel] = useState('São Paulo 01000-000');
  const [isCepModalOpen, setIsCepModalOpen] = useState(false);
  const [inputCep, setInputCep] = useState('');
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [cepResult, setCepResult] = useState<ViaCEPResult | null>(null);
  const [cepError, setCepError] = useState('');

  // Resolução automática do CEP (Cliente logado ou localStorage)
  useEffect(() => {
    let isMounted = true;

    const resolveLocation = async () => {
      if (clientId) {
        try {
          const { data } = await supabase
            .from('clientes')
            .select('cidade, estado, cep')
            .eq('id', clientId)
            .maybeSingle();

          if (isMounted && data && data.cep) {
            const clean = data.cep.replace(/\D/g, '');
            const formatted = clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : data.cep;
            const cityState = [data.cidade, data.estado].filter(Boolean).join(' - ');
            const label = cityState ? `${cityState} ${formatted}` : formatted;
            setUserLocationLabel(label);
            localStorage.setItem('gsa_user_location', label);
            localStorage.setItem('gsa_user_cep', formatted);
            return;
          }
        } catch (err) {
          console.error('[EcommerceHeader] Erro ao buscar CEP do cliente:', err);
        }
      }

      // Fallback para localStorage ou padrão
      const saved = localStorage.getItem('gsa_user_location');
      if (isMounted) {
        if (saved) {
          setUserLocationLabel(saved);
        } else {
          setUserLocationLabel('São Paulo 01000-000');
        }
      }
    };

    resolveLocation();

    const handleCepUpdate = () => {
      const saved = localStorage.getItem('gsa_user_location');
      if (saved) setUserLocationLabel(saved);
    };

    window.addEventListener('gsa-cep-updated', handleCepUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('gsa-cep-updated', handleCepUpdate);
    };
  }, [clientId]);

  const handleSearchCep = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = inputCep.replace(/\D/g, '');
    if (clean.length !== 8) {
      setCepError('Digite um CEP válido com 8 dígitos (ex: 01000-000)');
      setCepResult(null);
      return;
    }

    setIsSearchingCep(true);
    setCepError('');
    setCepResult(null);

    try {
      const res = await consultarCEP(clean);
      if (!res || res.erro) {
        setCepError('CEP não encontrado. Por favor, verifique o número informado.');
      } else {
        setCepResult(res);
      }
    } catch {
      setCepError('Erro ao consultar CEP. Tente novamente.');
    } finally {
      setIsSearchingCep(false);
    }
  };

  const handleConfirmCep = async () => {
    if (!cepResult) return;

    const clean = cepResult.cep.replace(/\D/g, '');
    const formatted = clean.length === 8 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : cepResult.cep;
    const cityState = [cepResult.localidade, cepResult.uf].filter(Boolean).join(' - ');
    const label = `${cityState} ${formatted}`;

    // Para cliente autenticado, só atualiza o cache local depois que o servidor confirmar a persistência.
    if (clientId) {
      try {
        await clientOperationalWrite(clientId, 'clientes', 'update', {
          cep: formatted,
          cidade: cepResult.localidade,
          estado: cepResult.uf,
          bairro: cepResult.bairro || '',
          endereco: cepResult.logradouro || ''
        });
      } catch (err: any) {
        console.error('[EcommerceHeader] Erro ao salvar CEP no cliente:', err);
        toast.error(err?.message || 'Não foi possível salvar o endereço na sua conta.');
        return;
      }
    }

    localStorage.setItem('gsa_user_location', label);
    localStorage.setItem('gsa_user_cep', formatted);
    setUserLocationLabel(label);
    window.dispatchEvent(new CustomEvent('gsa-cep-updated'));
    toast.success(`Endereço de entrega atualizado para ${cepResult.localidade} - ${cepResult.uf}!`);
    setIsCepModalOpen(false);
    setInputCep('');
    setCepResult(null);
  };

  // Auto-sincronização do contador do carrinho para visitor e cliente logado
  useEffect(() => {
    const updateCount = () => {
      if (clientId) {
        supabase.from('loja_carrinhos').select('quantidade').eq('cliente_id', clientId)
          .then(({ data }) => {
            if (data) setLocalCartCount(data.reduce((a, c) => a + (Number(c.quantidade) || 1), 0));
          });
      } else {
        try {
          const raw = localStorage.getItem('gsa_pending_store_checkout');
          if (raw) {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed?.items) ? parsed.items : [];
            setLocalCartCount(items.reduce((a: number, c: any) => a + (Number(c.quantidade) || 1), 0));
          } else {
            setLocalCartCount(0);
          }
        } catch {
          setLocalCartCount(0);
        }
      }
    };

    if (cartItemCount !== undefined && cartItemCount > 0) {
      setLocalCartCount(cartItemCount);
    } else {
      updateCount();
    }

    window.addEventListener('gsa-cart-updated', updateCount);
    window.addEventListener('storage', updateCount);
    return () => {
      window.removeEventListener('gsa-cart-updated', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, [cartItemCount, clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'loja_carrinhos',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        debounceMs: 100,
        onChange: () => {
          if (clientId) {
            supabase
              .from('loja_carrinhos')
              .select('quantidade')
              .eq('cliente_id', clientId)
              .then(({ data }) => {
                if (data) setLocalCartCount(data.reduce((a, c) => a + (Number(c.quantidade) || 1), 0));
              });
          }
        },
      },
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        debounceMs: 100,
        onChange: () => {
          if (clientId) {
            supabase
              .from('clientes')
              .select('saldo_pontos')
              .eq('id', clientId)
              .maybeSingle()
              .then(({ data }) => {
                if (data) setPointsBalance(Number(data.saldo_pontos || 0));
              });
          }
        },
      },
    ],
    [clientId]
  );

  const handleCartClick = () => {
    if (onOpenCart) {
      onOpenCart();
    } else {
      navigate(routes.marketplace.store.products() + '?modal=carrinho');
    }
  };

  // Volte e Ganhe Logic
  const [showVolteGanhe, setShowVolteGanhe] = useState(false);
  const [volteGanheCoupon, setVolteGanheCoupon] = useState('');
  const [volteGanheNotifId, setVolteGanheNotifId] = useState('');

  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const activeVolteGanhe = notifications.find(n => !n.lida && n.tipo === 'volte_e_ganhe');
      if (activeVolteGanhe && !showVolteGanhe && volteGanheNotifId !== activeVolteGanhe.id) {
        setShowVolteGanhe(true);
        // O cupom pode vir no item_id ou na mensagem (ex: VOLTE10)
        setVolteGanheCoupon(activeVolteGanhe.item_id || 'VOLTE10');
        setVolteGanheNotifId(activeVolteGanhe.id);
      }
    }
  }, [notifications, showVolteGanhe, volteGanheNotifId]);

  const handleApplyVolteGanhe = () => {
    // In a real scenario, applying the coupon could save to cart state.
    // For now, we just mark the notification as read.
    if (volteGanheNotifId) {
      markAsRead(volteGanheNotifId);
    }
    setShowVolteGanhe(false);
  };

  const handleCloseVolteGanhe = () => {
    if (volteGanheNotifId) {
      markAsRead(volteGanheNotifId);
    }
    setShowVolteGanhe(false);
  };

  useEffect(() => {
    if (clientId) {
      const fetchPoints = async () => {
        try {
          const { data, error } = await supabase
            .from('clientes')
            .select('saldo_pontos')
            .eq('id', clientId)
            .maybeSingle();
            
          if (data && !error) {
            setPointsBalance(data.saldo_pontos || 0);
          }
        } catch (err) {
          console.error('Erro ao buscar saldo de pontos:', err);
        }
      };
      fetchPoints();
    }
  }, [clientId]);

  // Debounce para busca inteligente
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      setIsSearching(true);
      const handler = setTimeout(async () => {
        try {
          const { data, error } = await supabase
            .from('produtos')
            .select('id, nome, valor, valor_promocional, imagem_url, categoria_id, loja_categoria:loja_categorias(id, nome)')
            .eq('status', 'ativo')
            .eq('visivel_na_loja', true)
            .ilike('nome', `%${trimmed}%`)
            .limit(6);
            
          if (data && !error) {
            setSuggestions(data);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
          }
        } catch (err) {
          console.error('Erro na busca inteligente:', err);
          setSuggestions([]);
        } finally {
          setIsSearching(false);
        }
      }, 250);
      return () => clearTimeout(handler);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.search-container') && !(e.target as Element).closest('.mobile-search-container')) {
        setShowSuggestions(false);
      }
      if (!(e.target as Element).closest('.notifications-container')) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    setShowSuggestions(false);
    if (onSearch) {
      onSearch(query);
    }
    if (query) {
      navigate(`${routes.marketplace.store.products()}?busca=${encodeURIComponent(query)}`);
    } else {
      navigate(routes.marketplace.store.products());
    }
  };

  const STORE_CATEGORIES = [
    {
      id: 'eletronicos',
      name: 'Eletrônicos',
      sub: 'Smartphones, informática, áudio e periféricos',
      Icon: Laptop,
      color: '#2563eb',
      bg: '#eff6ff',
      badge: 'Destaque',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(`${routes.marketplace.store.products()}?busca=Eletrônicos`);
      },
    },
    {
      id: 'casa',
      name: 'Casa & Eletro',
      sub: 'Eletrodomésticos, cozinha, cama e utilidades',
      Icon: Home,
      color: '#d97706',
      bg: '#fffbeb',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(`${routes.marketplace.store.products()}?busca=Casa`);
      },
    },
    {
      id: 'moda',
      name: 'Moda & Estilo',
      sub: 'Roupas, calçados, bolsas e acessórios',
      Icon: Shirt,
      color: '#db2777',
      bg: '#fdf2f8',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(`${routes.marketplace.store.products()}?busca=Moda`);
      },
    },
    {
      id: 'beleza',
      name: 'Beleza & Saúde',
      sub: 'Cosméticos, cuidados pessoais e bem-estar',
      Icon: FlaskConical,
      color: '#7c3aed',
      bg: '#f5f3ff',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(`${routes.marketplace.store.products()}?busca=Beleza`);
      },
    },
    {
      id: 'viagens',
      name: 'Viagens',
      sub: 'Pacotes turísticos, hotéis e passagens aéreas',
      Icon: Plane,
      color: '#0891b2',
      bg: '#ecfeff',
      badge: 'Destinos',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(routes.marketplace.travelPackages.root());
      },
    },
    {
      id: 'classificados',
      name: 'Classificados',
      sub: 'Veículos, imóveis, maquinários e oportunidades',
      Icon: Car,
      color: '#1e293b',
      bg: '#f8fafc',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(routes.marketplace.classifieds.root());
      },
    },
    {
      id: 'vip',
      name: 'Clube VIP',
      sub: 'Vantagens exclusivas, cashback e pontos',
      Icon: Gem,
      color: '#b45309',
      bg: '#fffbeb',
      badge: 'VIP',
      action: () => {
        setIsCategoriesDrawerOpen(false);
        navigate(routes.marketplace.store.vip());
      },
    },
  ];

  const filteredDrawerCategories = STORE_CATEGORIES.filter(cat => 
    !drawerSearchQuery.trim() || 
    cat.name.toLowerCase().includes(drawerSearchQuery.toLowerCase()) ||
    cat.sub.toLowerCase().includes(drawerSearchQuery.toLowerCase())
  );

  const departments = [
    { label: 'Categorias', Icon: LayoutGrid, action: () => setIsCategoriesDrawerOpen(true), isPrimary: true },
    { label: 'Ofertas do Dia', Icon: Zap, action: () => navigate(routes.marketplace.store.products() + '?filtro=ofertas'), highlight: true },
    { label: 'Mais Vendidos', Icon: TrendingUp, action: () => navigate(routes.marketplace.store.products() + '?filtro=mais-vendidos') },
    { label: 'Lançamentos', Icon: Sparkles, action: () => navigate(routes.marketplace.store.products() + '?filtro=novidades') },
    { label: 'Viagens', Icon: Plane, action: () => navigate(routes.marketplace.travelPackages.root()) },
    { label: 'Classificados', Icon: Car, action: () => navigate(routes.marketplace.classifieds.root()) },
    { label: 'Clube VIP', Icon: Gem, action: () => navigate(routes.marketplace.store.vip()), isVip: true },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-[#17345f] shadow-lg border-b border-[#0f2342]">
        {/* Barra de utilidades topo (Mercado Livre / Amazon Style) */}
        <div className="bg-[#0f2342] text-xs text-white/80 py-1.5 px-4 hidden sm:block border-b border-white/5">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-4">
              <span 
                className="flex items-center gap-1.5 font-semibold text-white/90 cursor-pointer hover:text-white group transition-colors"
                onClick={() => {
                  setIsCepModalOpen(true);
                  setInputCep(localStorage.getItem('gsa_user_cep') || '');
                  setCepResult(null);
                  setCepError('');
                }}
                title="Clique para informar seu CEP de entrega"
              >
                <MapPin size={11} className="text-[#d8bd73] group-hover:scale-110 transition-transform" /> 
                Enviar para: <strong className="text-white font-bold underline decoration-[#d8bd73]/70 underline-offset-2 hover:text-[#d8bd73] transition-colors">{userLocationLabel}</strong>
              </span>
              <span className="text-white/20">·</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Zap size={11} /> Frete Grátis acima de R$ {freeShippingThreshold}
              </span>
            </div>
            
            <div className="flex items-center gap-5 font-semibold text-xs text-white/80">
              <button onClick={() => navigate(routes.marketplace.store.compras())} className="hover:text-[#d8bd73] transition-colors">
                Minhas Compras
              </button>
              <button onClick={() => navigate(routes.marketplace.store.wishlist())} className="hover:text-[#d8bd73] transition-colors flex items-center gap-1.5">
                <Heart size={11} className={wishlistCount > 0 ? "text-rose-400 fill-rose-400" : "text-slate-400"} /> Favoritos {wishlistCount > 0 && <span className="text-[10px] font-black text-[#d8bd73]">({wishlistCount})</span>}
              </button>
              <button onClick={() => navigate(routes.marketplace.store.products() + '?filtro=ofertas')} className="hover:text-[#d8bd73] transition-colors">
                Ofertas do Dia
              </button>
              <button onClick={() => navigate(routes.marketplace.store.cupons())} className="hover:text-[#d8bd73] transition-colors">
                Cupons
              </button>
              <button onClick={() => navigate(routes.marketplace.store.vip())} className="hover:text-[#d8bd73] transition-colors text-[#d8bd73] font-bold">
                Clube VIP GSA
              </button>
            </div>
          </div>
        </div>

        {/* Linha Principal do Cabeçalho */}
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
          
          {/* Mobile Menu Toggle & Logo GSA */}
          <div className="flex items-center gap-3 lg:gap-6">
            <button
              type="button"
              className="lg:hidden rounded-lg p-2 text-white hover:bg-white/10"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            
            <HomeLogoLink className="flex-shrink-0 transition-transform hover:scale-105"><LogoGSA size="sm" variant="light" showText /></HomeLogoLink>
          </div>

          {/* Campo de Busca Principal Mercado Livre / Amazon Style */}
          <div className="hidden flex-1 items-center justify-center px-4 lg:flex relative search-container" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSearchSubmit} className="w-full max-w-2xl relative flex items-center">
              <input
                id="storeSearchInput"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim().length <= 1) setShowSuggestions(false);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="Buscar produtos, marcas, categorias e assinaturas..."
                className="w-full rounded-full border-0 bg-white py-2.5 pl-5 pr-20 text-sm font-semibold text-slate-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#d8bd73]"
              />
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }}
                  className="absolute right-14 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Limpar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-12 items-center justify-center rounded-full bg-[#17345f] text-white transition-colors hover:bg-[#0f2342] cursor-pointer"
                title="Pesquisar"
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
              
              {/* Dropdown de Sugestões Inteligentes */}
              {showSuggestions && (
                <div className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {suggestions.length > 0 ? (
                    <>
                      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Sugestões de Produtos
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {suggestions.length} encontrados
                        </span>
                      </div>
                      <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                        {suggestions.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSuggestions(false);
                                setSearchQuery('');
                                navigate(routes.marketplace.store.product(item.id));
                              }}
                              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-blue-50/50 cursor-pointer"
                            >
                              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                                {item.imagem_url ? (
                                  <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                                    <Search className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900">{item.nome}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[11px] font-medium text-slate-500">
                                    {item.loja_categoria?.nome || 'GSA Store'}
                                  </span>
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded">
                                    Frete Grátis
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                {item.valor_promocional && item.valor_promocional < item.valor ? (
                                  <div>
                                    <p className="text-xs text-slate-400 line-through">{formatCurrency(item.valor)}</p>
                                    <p className="text-sm font-black text-emerald-600">{formatCurrency(item.valor_promocional)}</p>
                                  </div>
                                ) : (
                                  <p className="text-sm font-black text-[#17345f]">{formatCurrency(item.valor)}</p>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
                        <button 
                          type="button"
                          onClick={() => handleSearchSubmit()}
                          className="w-full text-center text-xs font-black text-[#17345f] hover:text-[#0f2342] py-1 cursor-pointer flex items-center justify-center gap-1"
                        >
                          Ver todos os resultados para "{searchQuery}" <Search size={12} />
                        </button>
                      </div>
                    </>
                  ) : (
                    !isSearching && (
                      <div className="p-4 text-center">
                        <p className="text-xs font-semibold text-slate-600">Nenhum produto encontrado para "{searchQuery}"</p>
                        <button
                          type="button"
                          onClick={() => handleSearchSubmit()}
                          className="mt-2 text-xs font-bold text-[#17345f] hover:underline cursor-pointer"
                        >
                          Buscar no catálogo completo â— ’
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </form>
          </div>

          {/* User Actions & Carrinho */}
          <div className="flex items-center gap-3 sm:gap-5">
            {clientId ? (
              <>
                {/* Saldo de Pontos GSA */}
                <div 
                  className="hidden sm:flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-extrabold text-white cursor-pointer hover:bg-white/20 transition-colors border border-white/10"
                  onClick={() => navigate(routes.client.loyalty.pontos())}
                  title="Saldo de Pontos GSA"
                >
                  <Diamond className="h-4 w-4 text-[#d8bd73] fill-[#d8bd73]" />
                  <span>{pointsBalance.toLocaleString('pt-BR')} pts</span>
                </div>
                
                {/* Favoritos (Lista de Desejos) */}
                <button 
                  onClick={() => navigate(routes.marketplace.store.wishlist())}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:text-rose-400 hover:bg-white/20 transition-colors relative cursor-pointer"
                  title="Meus Favoritos (Lista de Desejos)"
                >
                  <Heart className={`h-4 w-4 ${wishlistCount > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white border-2 border-[#17345f]">
                      {wishlistCount > 99 ? '99+' : wishlistCount}
                    </span>
                  )}
                </button>

                {/* Notificações */}
                <div className="relative hidden sm:block notifications-container">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:text-[#d8bd73] hover:bg-white/20 transition-colors relative"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadNotifications > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white border-2 border-[#17345f]">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                  </button>

                  {showNotifications && (
                    <div className="absolute right-0 top-full mt-3 w-80 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 z-50">
                      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="text-sm font-bold text-slate-900">Notificações</h3>
                        <button 
                          onClick={() => markAllAsRead()}
                          className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                        >
                          Marcar lidas
                        </button>
                      </div>
                      <ul className="max-h-80 overflow-y-auto">
                        {notifications.length > 0 ? notifications.map((notif) => (
                          <li 
                            key={notif.id} 
                            onClick={() => markAsRead(notif.id)}
                            className={`p-4 border-b border-slate-50 transition-colors hover:bg-slate-50 cursor-pointer ${!notif.lida ? 'bg-indigo-50/30' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-sm font-bold text-slate-900">{notif.titulo}</p>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                {notif.created_at ? new Date(notif.created_at).toLocaleDateString() : 'Agora'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{notif.mensagem}</p>
                          </li>
                        )) : (
                          <li className="p-6 text-center text-sm text-slate-500">Nenhuma notificação no momento.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Minha Conta -> abre o menu da GSA Store */}
                <button
                  type="button"
                  className="flex items-center gap-2.5 cursor-pointer text-white hover:text-[#d8bd73] transition-colors p-1.5 rounded-xl hover:bg-white/10"
                  onClick={() => navigate(routes.marketplace.store.menu())}
                  aria-label="Abrir menu da minha conta no Marketplace"
                  title="Minha conta"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="hidden lg:block text-xs">
                    <span className="block font-medium text-white/70">Olá, Cliente</span>
                    <span className="block font-bold leading-none text-white">Minha Conta</span>
                  </div>
                </button>
              </>
            ) : (
              <button
                onClick={onRequireAuth || (() => navigate(routes.login.root()))}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Entrar / Cadastrar</span>
              </button>
            )}

            {/* Carrinho GSA estilo Mercado Livre */}
            <button 
              className="flex items-center gap-2 rounded-xl bg-[#d8bd73] px-3.5 py-2 text-slate-950 hover:bg-[#c4a961] transition-all font-black text-xs shadow-md hover:shadow-lg cursor-pointer"
              onClick={handleCartClick}
            >
              <div className="relative flex items-center justify-center">
                <ShoppingCart className="h-4 w-4" />
                {localCartCount > 0 && (
                  <span className="absolute -top-2.5 -right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-sm">
                    {localCartCount > 99 ? '99+' : localCartCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline font-black uppercase tracking-wider">Carrinho</span>
            </button>
          </div>
        </div>

        {/* Campo de Busca (Mobile) */}
        <div className="bg-[#0f2342] px-4 py-2.5 lg:hidden border-t border-white/5 relative mobile-search-container" onClick={(e) => e.stopPropagation()}>
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim().length <= 1) setShowSuggestions(false);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Buscar produtos, categorias..."
              className="w-full rounded-full border-0 bg-white py-2 pl-4 pr-16 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#d8bd73]"
            />
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                }}
                className="absolute right-9 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600"
                title="Limpar"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-0 top-0 flex h-full items-center justify-center px-3 text-slate-700 hover:text-[#17345f]"
              title="Pesquisar"
            >
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#17345f]" /> : <Search className="h-4 w-4" />}
            </button>

            {/* Dropdown de Sugestões Inteligentes (Mobile) */}
            {showSuggestions && (
              <div className="absolute left-0 top-full mt-1.5 w-full overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10 z-50">
                {suggestions.length > 0 ? (
                  <>
                    <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {suggestions.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSuggestions(false);
                              setSearchQuery('');
                              navigate(routes.marketplace.store.product(item.id));
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                          >
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                              {item.imagem_url ? (
                                <img src={item.imagem_url} alt={item.nome} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <Search className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-xs font-bold text-slate-900">{item.nome}</p>
                              <p className="truncate text-[10px] text-slate-400">
                                {item.loja_categoria?.nome || 'GSA Store'}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              {item.valor_promocional && item.valor_promocional < item.valor ? (
                                <p className="text-xs font-black text-emerald-600">{formatCurrency(item.valor_promocional)}</p>
                              ) : (
                                <p className="text-xs font-black text-[#17345f]">{formatCurrency(item.valor)}</p>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-slate-100 bg-slate-50 p-2">
                      <button 
                        type="button"
                        onClick={() => handleSearchSubmit()}
                        className="w-full text-center text-[11px] font-bold text-[#17345f] py-1"
                      >
                        Ver todos os resultados â— ’
                      </button>
                    </div>
                  </>
                ) : (
                  !isSearching && (
                    <div className="p-3 text-center">
                      <p className="text-[11px] text-slate-600">Nenhum produto encontrado</p>
                      <button
                        type="button"
                        onClick={() => handleSearchSubmit()}
                        className="mt-1 text-[11px] font-bold text-[#17345f] hover:underline"
                      >
                        Buscar no catálogo completo â— ’
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </form>
        </div>

        {/* Barra de Localização CEP (Mobile) */}
        <div className="bg-[#0b1b33] px-4 py-1.5 sm:hidden border-t border-white/5 flex items-center justify-between text-xs text-white/80">
          <button 
            type="button" 
            onClick={() => {
              setIsCepModalOpen(true);
              setInputCep(localStorage.getItem('gsa_user_cep') || '');
              setCepResult(null);
              setCepError('');
            }}
            className="flex items-center gap-1.5 font-medium truncate w-full text-left cursor-pointer hover:text-white"
          >
            <MapPin size={11} className="text-[#d8bd73] shrink-0" />
            <span className="truncate">Enviar para: <strong className="text-white font-bold underline decoration-[#d8bd73]/70">{userLocationLabel}</strong></span>
          </button>
        </div>

        {/* Sub-Navegação por Departamentos */}
        <div className="hidden bg-[#0f2342] lg:block border-t border-white/5">
          <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6 lg:px-8">
            <ul className="flex flex-1 items-center overflow-x-auto py-0.5">
              {departments.map((dept, idx) => (
                <li key={idx}>
                  <button
                    onClick={dept.action}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-all whitespace-nowrap ${
                      dept.isPrimary
                        ? 'text-[#d8bd73] hover:bg-white/10'
                        : dept.isVip
                          ? 'text-amber-400 hover:bg-white/10 hover:text-amber-300'
                          : dept.highlight
                            ? 'text-rose-400 hover:bg-white/10 hover:text-rose-300'
                            : 'text-white/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {dept.Icon && <dept.Icon size={13} strokeWidth={2} />}
                    {dept.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="absolute left-0 top-[116px] z-50 w-full bg-white shadow-2xl lg:hidden border-t border-slate-200">
            <ul className="flex flex-col py-2 divide-y divide-slate-100">
              {clientId && (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        navigate(routes.client.dashboard());
                      }}
                      className="flex items-center gap-3 w-full px-5 py-3 text-left text-sm font-black text-white bg-[#17345f] hover:bg-[#102746]"
                    >
                      <Home size={16} className="text-[#d8bd73]" />
                      Voltar ao Dashboard do Cliente
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        navigate(routes.marketplace.store.compras());
                        setIsMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 w-full px-5 py-3 text-left text-sm font-black text-[#17345f] bg-[#17345f]/5 hover:bg-[#17345f]/10"
                    >
                      <Package size={16} className="text-[#17345f]" />
                      Minhas Compras & Pedidos
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        navigate(routes.marketplace.store.wishlist());
                        setIsMobileMenuOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-5 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-3">
                        <Heart size={16} className="text-rose-500 fill-rose-500" />
                        Meus Favoritos (Lista de Desejos)
                      </span>
                      {wishlistCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-600">
                          {wishlistCount}
                        </span>
                      )}
                    </button>
                  </li>
                </>
              )}
              {departments.map((dept, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => {
                      dept.action();
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 w-full px-5 py-3 text-left text-sm font-bold hover:bg-slate-50 ${
                      dept.isVip ? 'text-amber-600 hover:text-amber-700' :
                      dept.highlight ? 'text-rose-600 hover:text-rose-700' :
                      'text-slate-700 hover:text-[#17345f]'
                    }`}
                  >
                    {dept.Icon && <dept.Icon size={15} strokeWidth={2} className="shrink-0" />}
                    {dept.label}
                  </button>
                </li>
              ))}
              {clientId && (
                <li>
                  <div className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-slate-700 bg-slate-50">
                    <Diamond className="h-4 w-4 text-[#d8bd73] fill-[#d8bd73]" />
                    Saldo de Pontos: {pointsBalance.toLocaleString('pt-BR')}
                  </div>
                </li>
              )}
            </ul>
          </div>
        )}
      </header>

      <VolteEganheModal 
        isOpen={showVolteGanhe} 
        onClose={handleCloseVolteGanhe} 
        couponCode={volteGanheCoupon}
        onApplyCoupon={handleApplyVolteGanhe}
      />

      {/* Modal de Seleção de CEP */}
      {isCepModalOpen && (
        <div 
          className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setIsCepModalOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 relative text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsCepModalOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#17345f]/10 text-[#17345f]">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Onde você quer receber seus pedidos?</h3>
                <p className="text-xs text-slate-500 font-medium">Informe seu CEP para calcularmos fretes e prazos de entrega</p>
              </div>
            </div>

            <form onSubmit={handleSearchCep} className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputCep}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length > 8) v = v.slice(0, 8);
                    if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
                    setInputCep(v);
                    setCepError('');
                  }}
                  placeholder="Digite o CEP (ex: 01000-000)"
                  className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#17345f] focus:ring-2 focus:ring-[#17345f]/20"
                  maxLength={9}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSearchingCep}
                  className="h-11 px-5 rounded-xl bg-[#17345f] text-xs font-black text-white hover:bg-[#0f2342] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2 shrink-0"
                >
                  {isSearchingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar CEP'}
                </button>
              </div>

              {cepError && (
                <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">{cepError}</p>
              )}

              {cepResult && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                      âÅ““
                    </div>
                    <div className="text-xs space-y-0.5">
                      <p className="font-extrabold text-emerald-950 text-sm">
                        {cepResult.localidade} - {cepResult.uf}
                      </p>
                      {cepResult.bairro && (
                        <p className="text-emerald-800 font-medium">Bairro: {cepResult.bairro}</p>
                      )}
                      {cepResult.logradouro && (
                        <p className="text-emerald-700">{cepResult.logradouro}</p>
                      )}
                      <p className="text-emerald-600 font-mono font-bold text-[11px]">CEP: {cepResult.cep}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmCep}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
                  >
                    Usar este Endereço para Entrega
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-start text-[11px] text-slate-500">
                <a 
                  href="https://buscacepinter.correios.com.br/app/endereco/index.php" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#17345f] font-bold hover:underline"
                >
                  Não sei meu CEP â— ’
                </a>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ MENU LATERAL / DRAWER DE CATEGORIAS â”€â”€â”€ */}
      <AnimatePresence>
        {isCategoriesDrawerOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop com blur suave */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
              onClick={() => setIsCategoriesDrawerOpen(false)}
            />

            {/* Painel Lateral */}
            <div className="fixed inset-y-0 left-0 max-w-full flex">
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="w-screen max-w-sm sm:max-w-md bg-white shadow-2xl flex flex-col z-10 overflow-hidden"
              >
                {/* Header do Drawer */}
                <div className="bg-gradient-to-r from-[#0c2340] via-[#17345f] to-[#1e4a8a] text-white px-5 py-4 flex items-center justify-between border-b border-white/10 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#d8bd73]/20 border border-[#d8bd73]/30 flex items-center justify-center text-[#d8bd73]">
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black leading-tight text-white flex items-center gap-2">
                        Categorias
                      </h3>
                      <p className="text-[11px] text-white/60 font-medium">Todos os departamentos da loja</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCategoriesDrawerOpen(false)}
                    className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Fechar menu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Campo de Busca Rápida no Drawer */}
                <div className="p-3.5 bg-neutral-50 border-b border-neutral-100 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                    <input
                      type="text"
                      value={drawerSearchQuery}
                      onChange={(e) => setDrawerSearchQuery(e.target.value)}
                      placeholder="Filtrar categorias..."
                      className="w-full pl-8 pr-7 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-medium text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#17345f]/20 transition-all"
                    />
                    {drawerSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDrawerSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Lista de Categorias com Scroll */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-1.5 custom-scrollbar">
                  <div className="px-2 py-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-neutral-400">
                    <span>Departamentos Disponíveis</span>
                    <span>{filteredDrawerCategories.length} categorias</span>
                  </div>

                  {filteredDrawerCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={cat.action}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-transparent hover:border-neutral-200/80 hover:bg-neutral-50 active:scale-[0.99] transition-all text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs"
                          style={{ backgroundColor: cat.bg, color: cat.color }}
                        >
                          <cat.Icon className="h-5 w-5" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-neutral-900 group-hover:text-[#17345f] transition-colors">
                              {cat.name}
                            </span>
                            {cat.badge && (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-[#17345f]/10 text-[#17345f]">
                                {cat.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-neutral-400 truncate leading-tight">
                            {cat.sub}
                          </p>
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-[#17345f] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                    </button>
                  ))}

                  {filteredDrawerCategories.length === 0 && (
                    <div className="p-8 text-center space-y-2">
                      <p className="text-xs font-bold text-neutral-600">Nenhuma categoria encontrada</p>
                      <p className="text-[11px] text-neutral-400">Tente buscar por outro termo</p>
                    </div>
                  )}

                  {/* Divisor & Acessos Rápidos */}
                  <div className="pt-3 mt-3 border-t border-neutral-100 space-y-1.5">
                    <div className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      Acesso Rápido
                    </div>

                    {[
                      { label: 'Ofertas Relâmpago', icon: Zap, color: 'text-rose-500', path: routes.marketplace.store.products() + '?filtro=ofertas' },
                      { label: 'Mais Vendidos', icon: TrendingUp, color: 'text-blue-500', path: routes.marketplace.store.products() + '?filtro=mais-vendidos' },
                      { label: 'Cupons de Desconto', icon: Ticket, color: 'text-amber-500', path: routes.marketplace.store.cupons() },
                      { label: 'Minhas Compras', icon: Package, color: 'text-indigo-500', path: routes.marketplace.store.compras() },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setIsCategoriesDrawerOpen(false);
                          navigate(item.path);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <item.icon className={`h-4 w-4 ${item.color}`} />
                          <span>{item.label}</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-neutral-300" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Footer do Drawer */}
                <div className="p-3.5 bg-neutral-50 border-t border-neutral-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCategoriesDrawerOpen(false);
                      navigate(routes.marketplace.store.products());
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#17345f] hover:bg-[#102746] text-white text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    <span>Ver Catálogo Completo</span>
                  </button>
                </div>
              </motion.aside>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default EcommerceHeader;

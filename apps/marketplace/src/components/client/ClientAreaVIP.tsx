import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Star, ShieldCheck, Zap, CreditCard, ChevronRight, History, Award, Copy, Check, Lock, Sparkles, Trophy, Gem, Medal, AlertTriangle, X } from 'lucide-react';
import { Cliente } from '../../types';
import { toast } from 'react-hot-toast';
import { copyToClipboard, generateUUID } from '../../lib/utils';
import { VIP_LEVELS, VIPLevel } from '../../constants';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { callClientRpc } from '../../lib/clientRpc';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

const TABS = ['Geral', 'Níveis', 'Histórico'];
const TAB_LABELS: Record<string, string> = {
  Geral: 'Geral',
  Níveis: 'Níveis',
  Histórico: 'Histórico'
};

export function ClientAreaVIP({ 
  cliente,
  initialTab,
  initialItemId 
}: { 
  cliente: Cliente,
  initialTab?: string,
  initialItemId?: string
}) {
  const { containerRef: vipTabsRef, setButtonRef: setVipTabButtonRef } = useAutoFitTabs(14, 9);
  const [activeTab, setActiveTab] = useState(initialTab || TABS[0]);
  const [copied, setCopied] = useState(false);
  const [selectedLevelToBuy, setSelectedLevelToBuy] = useState<VIPLevel | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const [levels, setLevels] = useState<VIPLevel[]>(VIP_LEVELS);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const vipPurchaseRequestId = useRef(generateUUID());

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(TABS.includes(initialTab) ? initialTab : 'Geral');
  }, [initialTab]);

  useEffect(() => {
    if (initialItemId && hasAutoOpened.current !== initialItemId) {
      // If it's a level id, switch to 'Níveis' and scroll there
      if (initialItemId.startsWith('level-')) {
        hasAutoOpened.current = initialItemId;
        setActiveTab('Níveis');
        setTimeout(() => {
          const element = document.getElementById(initialItemId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(initialItemId);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 400);
      } else if (initialItemId === 'vip-card') {
        hasAutoOpened.current = initialItemId;
        setActiveTab('Geral');
        setTimeout(() => {
          const element = document.getElementById('vip-card');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId('vip-card');
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 400);
      }
    }
  }, [initialItemId, levels.length]);

  useEffect(() => {
    fetchLevels();

    const channel = supabase
      .channel('client-vip-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_levels' }, () => {
        fetchLevels();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'level_history', filter: `cliente_id=eq.${cliente.id}` }, () => {
        fetchLevels();
        fetchHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    // Only fetch history if tab is selected AND levels are already loaded from DB
    if (activeTab === 'Histórico' && !loading) {
      fetchHistory();
    }
  }, [activeTab, loading]);

  const fetchHistory = async () => {
    if (!cliente.id) return;
    setHistoryLoading(true);
    try {
      console.log('Fetching level history (simple query) for client:', cliente.id);
      const { data: historyData, error } = await supabase
        .from('level_history')
        .select('*, nivel_anterior:client_levels!nivel_anterior_id(nome_nivel), nivel_novo:client_levels!nivel_novo_id(nome_nivel)')
        .eq('cliente_id', cliente.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error fetching history:', error);
        throw error;
      }
      
      // Map names locally using the points definitions and database IDs
      const enrichedHistory = (historyData || []).map(item => {
        // Try finding by dbId first, then fallback to name if possible
        const prevLevel = levels.find(l => l.dbId === item.nivel_anterior_id);
        const nextLevel = levels.find(l => l.dbId === item.nivel_novo_id);
        
        return {
          ...item,
          nivel_anterior_nome: prevLevel?.name || 'Início',
          nivel_novo_nome: nextLevel?.name || 'Nível VIP'
        };
      });

      console.log('Enriched history:', enrichedHistory);
      setHistory(enrichedHistory);
    } catch (error) {
      console.error('Error fetching level history:', error);
      toast.error('Não foi possível carregar o histórico de níveis.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchLevels = async () => {
    try {
      const { data, error } = await supabase
        .from('client_levels')
        .select('*')
        .order('pontos_minimos', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const mappedLevels: VIPLevel[] = data.map(dbLevel => ({
          id: dbLevel.nome_nivel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          name: dbLevel.nome_nivel,
          minPoints: dbLevel.pontos_minimos,
          maxPoints: dbLevel.pontos_maximos,
          multiplier: Number(dbLevel.pontos_por_real),
          color: dbLevel.cor || '#f5f5f5',
          textColor: dbLevel.cor_texto || '#1a1a1a',
          visualStyle: (dbLevel.visual_style as any) || 'clean',
          discountPercentage: 0,
          feePercentage: 5,
          price: Number(dbLevel.preco),
          benefits: [`Multiplicador de pontos: ${Number(dbLevel.pontos_por_real)}x`],
          exclusiveBenefits: [`Multiplicador de pontos: ${Number(dbLevel.pontos_por_real)}x`],
          dbId: dbLevel.id
        }));
        setLevels(mappedLevels);
      }
    } catch (error) {
      console.error('Error fetching levels:', error);
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSubscription([
    { table: 'client_levels', onChange: fetchLevels },
    { table: 'assinaturas', onChange: fetchLevels },
  ]);

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  const handleCopyCode = async () => {
    if (cliente.codigo_cliente) {
      const success = await copyToClipboard(cliente.codigo_cliente);
      if (success) {
        setCopied(true);
        toast.success('Código VIP copiado!');
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.error('Erro ao copiar código.');
      }
    }
  };

  const currentPoints = cliente.pontos_totais || 0;
  
  // Resolve current level using dbId UUID matching
  // Priority: manual level (nivel_manual_id) > auto level (nivel_id) > points-based fallback
  let currentLevel = null;
  if (levels.length > 0) {
    const manualId = cliente.nivel_manual_id;
    const autoId = cliente.nivel_id;
    
    if (manualId) {
      currentLevel = (levels as any[]).find((l: any) => l.dbId === manualId)
        || ((cliente as any).manual_level ? levels.find(l => l.name.toLowerCase() === (cliente as any).manual_level?.nome_nivel?.toLowerCase()) : null);
    }
    if (!currentLevel && autoId) {
      currentLevel = (levels as any[]).find((l: any) => l.dbId === autoId)
        || ((cliente as any).auto_level ? levels.find(l => l.name.toLowerCase() === (cliente as any).auto_level?.nome_nivel?.toLowerCase()) : null);
    }
    if (!currentLevel) {
      currentLevel = levels.find(l => currentPoints >= l.minPoints && (l.maxPoints === null || currentPoints <= l.maxPoints)) || levels[0];
    }
  }
  currentLevel = currentLevel || levels[0];
  
  const currentLevelIndex = levels.indexOf(currentLevel);
  const nextLevel = levels[currentLevelIndex + 1];
  const progress = nextLevel ? Math.min(100, (currentPoints / nextLevel.minPoints) * 100) : 100;

  // Cumulative benefits
  const allActiveBenefits = [`Multiplicador de pontos: ${currentLevel.multiplier}x`];

  const getLevelStyles = (level: VIPLevel) => {
    switch (level.visualStyle) {
      case 'copper':
        return {
          bg: 'bg-gradient-to-br from-[#804a00] via-[#cd7f32] to-[#804a00]',
          text: 'text-white',
          accent: 'bg-white/20',
          glow: 'bg-orange-500/20',
          border: 'ring-orange-400/30',
          icon: Trophy
        };
      case 'silver':
        return {
          bg: 'bg-gradient-to-br from-[#a0a0a0] via-[#e0e0e0] to-[#a0a0a0]',
          text: 'text-neutral-900',
          accent: 'bg-black/10',
          glow: 'bg-white/40',
          border: 'ring-white/50',
          icon: ShieldCheck
        };
      case 'gold-black':
        return {
          bg: 'bg-gradient-to-br from-[#000000] via-[#1a1a1a] to-[#000000]',
          text: 'text-[#ffd700]',
          accent: 'bg-[#ffd700]/20',
          glow: 'bg-[#ffd700]/10',
          border: 'ring-[#ffd700]/30',
          icon: Crown
        };
      case 'diamond':
        return {
          bg: 'bg-gradient-to-br from-[#004e92] via-[#000428] to-[#004e92]',
          text: 'text-[#b9f2ff]',
          accent: 'bg-[#b9f2ff]/20',
          glow: 'bg-[#b9f2ff]/30',
          border: 'ring-[#b9f2ff]/40',
          icon: Gem
        };
      case 'black-luxury':
        return {
          bg: 'bg-gradient-to-br from-[#000000] via-[#111111] to-[#000000]',
          text: 'text-white',
          accent: 'bg-white/10',
          glow: 'bg-white/5',
          border: 'ring-white/20',
          icon: Sparkles
        };
      default: // clean
        return {
          bg: 'bg-white',
          text: 'text-neutral-900',
          accent: 'bg-neutral-100',
          glow: 'bg-neutral-50',
          border: 'ring-neutral-300',
          icon: Star
        };
    }
  };

  const styles = getLevelStyles(currentLevel);
  const LevelIcon = styles.icon;

  const pointsValueInReais = (cliente.saldo_pontos || 0) * 0.01;

  const handleBuyLevel = async () => {
    if (!selectedLevelToBuy) return;
    if (!selectedLevelToBuy.dbId) {
      toast.error('Nível VIP indisponível para compra.');
      return;
    }
    setIsBuying(true);
    try {
      const data = await callClientRpc<any>('gsa_client_subscribe_vip', {
        p_request_id: vipPurchaseRequestId.current,
        p_nivel_id: selectedLevelToBuy.dbId,
      });
      vipPurchaseRequestId.current = generateUUID();
      toast.success(data?.pago_integralmente_com_pontos
        ? 'Nível VIP confirmado com seus pontos!'
        : 'Fatura gerada com sucesso! Aguarde o link de pagamento.');
      setSelectedLevelToBuy(null);
    } catch (error: any) {
      console.error('Error buying level:', error);
      toast.error(`Erro ao gerar fatura: ${error.message || 'Tente novamente.'}`);
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#f8f7f5] min-h-screen pb-28">
      {/* Premium Header */}
      <div className="bg-[#1a1a1a] text-white pt-8 pb-14 px-4 sm:px-6 sm:pt-12 sm:pb-24 rounded-b-[2rem] sm:rounded-b-[3rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[100px] rounded-full -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full -ml-32 -mb-32"></div>
        
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md ring-1 ring-white/20 shrink-0">
              <Crown className="text-white h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl tracking-tight leading-tight">Programa VIP</h2>
              <p className="text-white/60 text-sm">Sua jornada de exclusividade e prestígio.</p>
            </div>
          </div>

          <div ref={vipTabsRef} className="grid w-full grid-cols-2 gap-1 rounded-3xl bg-white/5 p-1 backdrop-blur-md ring-1 ring-white/10 sm:flex sm:min-w-0">
            {TABS.map((tab, index) => (
              <button
                key={tab}
                ref={setVipTabButtonRef(index)}
                onClick={() => setActiveTab(tab)}
                className={`min-h-9 min-w-0 whitespace-nowrap rounded-2xl px-1.5 py-2 font-black uppercase leading-none tracking-[0.08em] transition-all sm:flex-1 sm:px-6 sm:tracking-widest ${activeTab === tab ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-white/60 hover:text-white'}`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-8 sm:-mt-12 space-y-6 sm:space-y-8 relative z-10">
        {activeTab === 'Geral' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 sm:space-y-8">
            {/* VIP Card */}
            <div id="vip-card" className={`relative w-full overflow-hidden rounded-[2rem] sm:rounded-[3rem] p-5 sm:p-10 shadow-2xl transition-all duration-500 ${highlightedItemId === 'vip-card' ? 'bg-indigo-50 ring-4 ring-indigo-500 sm:scale-[1.02] z-20' : `${styles.bg} ${styles.border} ring-1`}`}>
              {/* Glows */}
              <div className={`absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-50 ${styles.glow}`}></div>
              <div className={`absolute -bottom-24 -left-24 w-80 h-80 rounded-full blur-3xl opacity-30 ${styles.glow}`}></div>
              
              <div className="relative z-10 flex flex-col gap-7 sm:gap-12">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[9px] sm:text-[10px] font-black tracking-[0.35em] sm:tracking-[0.5em] uppercase opacity-60 ${styles.text}`}>Status VIP</span>
                      {cliente.nivel_manual_id && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-[8px] font-black uppercase tracking-widest text-amber-200 ring-1 ring-amber-500/30">
                          <AlertTriangle size={8} />
                          Ajuste Manual
                        </div>
                      )}
                    </div>
                    <h3 className={`text-4xl sm:text-5xl font-black tracking-tighter mt-2 leading-none ${styles.text}`}>{currentLevel.name.toUpperCase()}</h3>
                    {cliente.nivel_manual_info && (
                      <p className={`text-[10px] font-bold mt-2 opacity-50 ${styles.text}`}>
                        {cliente.nivel_manual_info}
                      </p>
                    )}
                  </div>
                  <div className={`h-14 w-14 sm:h-20 sm:w-20 rounded-2xl sm:rounded-[2.5rem] flex items-center justify-center shadow-2xl backdrop-blur-md ring-1 ring-white/20 shrink-0 ${styles.accent}`}>
                    <LevelIcon className={`h-7 w-7 sm:h-10 sm:w-10 ${styles.text}`} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 items-end">
                  <div className="space-y-4 min-w-0">
                    <div className="grid grid-cols-1 gap-4 sm:flex sm:items-center sm:gap-6">
                      <div className="min-w-0">
                        <p className={`text-[10px] font-black uppercase tracking-widest opacity-50 mb-2 ${styles.text}`}>VIP Code</p>
                        <div className="flex items-center gap-3 min-w-0">
                          <p className={`min-w-0 truncate text-2xl font-mono tracking-[0.2em] font-light ${styles.text}`}>
                            {cliente.codigo_cliente}
                          </p>
                          <button 
                            onClick={handleCopyCode}
                            className={`p-2 rounded-full transition-all active:scale-95 ${styles.accent}`}
                          >
                            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className={`${styles.text} opacity-60`} />}
                          </button>
                        </div>
                      </div>
                      <div className="hidden sm:block border-l border-current opacity-60 h-10 mx-2"></div>
                      <div className="rounded-2xl bg-white/5 p-3 sm:bg-transparent sm:p-0">
                        <p className={`text-[10px] font-black uppercase tracking-widest opacity-50 mb-2 ${styles.text}`}>Multiplicador</p>
                        <div className="flex items-center gap-2">
                          <Zap size={16} className={`${styles.text} opacity-80`} />
                          <p className={`text-2xl font-black tracking-tight drop-shadow-sm ${styles.text}`}>{currentLevel.multiplier}x</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-left md:text-right">
                    <p className={`text-[10px] font-black uppercase tracking-widest opacity-50 ${styles.text}`}>Pontos Acumulados</p>
                    <div className="flex items-center gap-3 md:justify-end">
                      <Star size={20} className={`${styles.text} fill-current`} />
                      <span className={`text-4xl font-black tracking-tight leading-none ${styles.text}`}>{currentPoints.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <p className={`text-sm font-bold ${styles.text}`}>
                      {nextLevel ? (
                        <>Faltam <span className="font-black">{(nextLevel.minPoints - currentPoints).toLocaleString()} pontos</span> para {nextLevel.name}</>
                      ) : (
                        'Nível Máximo Alcançado'
                      )}
                    </p>
                    <p className={`text-xs font-black opacity-60 ${styles.text}`}>{Math.floor(progress)}%</p>
                  </div>
                  <div className="h-4 sm:h-6 w-full rounded-full bg-black overflow-hidden p-[2px] sm:p-[3px] ring-1 ring-black/10 shadow-inner">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="h-full rounded-full shadow-lg relative overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-black/20"></div>
                      <motion.div
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-1/2"
                      />
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2rem] shadow-md ring-1 ring-neutral-300 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Zap size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Multiplicador</p>
                  <p className="text-xl font-black text-neutral-900">{currentLevel.multiplier}x Pontos</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] shadow-md ring-1 ring-neutral-300 flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <Trophy size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Nível Atual</p>
                  <p className="text-xl font-black text-neutral-900">{currentLevel.name}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'Benefícios' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Unlocked this level */}
              <div className="bg-white p-8 rounded-[3rem] shadow-md ring-1 ring-neutral-300">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-lg font-black text-neutral-900">Desbloqueados em {currentLevel.name}</h3>
                </div>
                <ul className="space-y-4">
                  {currentLevel.exclusiveBenefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3 group">
                      <div className="mt-1 h-5 w-5 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Check size={12} />
                      </div>
                      <span className="text-sm text-neutral-600 font-medium">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* All active benefits */}
              <div className="bg-[#1a1a1a] p-8 rounded-[3rem] shadow-xl text-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                    <ShieldCheck size={20} />
                  </div>
                  <h3 className="text-lg font-black">Todos os Benefícios Ativos</h3>
                </div>
                <ul className="space-y-4">
                  {allActiveBenefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3 opacity-80 hover:opacity-100 transition-opacity">
                      <div className="mt-1 h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                        <Check size={12} />
                      </div>
                      <span className="text-sm font-medium">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'Níveis' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {levels.slice(currentLevelIndex + 1).map((level, i) => {
              const levelStyles = getLevelStyles(level);
              const isHighlighted = highlightedItemId === `level-${level.id}`;
              const LevelIcon = levelStyles.icon;
              return (
                <motion.div
                  id={`level-${level.id}`}
                  key={level.id}
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: i * 0.15, duration: 0.6, ease: "easeOut" }}
                  whileHover={{ y: -8, scale: 1.01 }}
                  className={`p-8 md:p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden group transition-all duration-500 ${isHighlighted ? 'ring-4 ring-indigo-500 z-20' : `ring-1 ${levelStyles.border}`} ${levelStyles.bg}`}
                >
                  {/* Enhanced Glow Effects */}
                  <div className={`absolute -top-16 -right-16 w-64 h-64 ${levelStyles.glow} rounded-full blur-[60px] opacity-40 group-hover:opacity-80 group-hover:scale-[1.2] transition-all duration-700`}></div>
                  <div className={`absolute -bottom-24 -left-24 w-72 h-72 ${levelStyles.glow} rounded-full blur-[60px] opacity-20 group-hover:opacity-50 group-hover:scale-110 transition-all duration-700`}></div>
                  
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-6 flex-1">
                      <div className="flex items-center gap-5">
                        <div className={`h-16 w-16 md:h-20 md:w-20 rounded-[1.5rem] flex items-center justify-center shadow-2xl backdrop-blur-xl ring-1 ring-white/20 transition-transform duration-500 group-hover:scale-110 ${levelStyles.accent}`}>
                          <LevelIcon className={`h-8 w-8 md:h-10 md:w-10 ${levelStyles.text} drop-shadow-md`} />
                        </div>
                        <div>
                          <p className={`text-[10px] md:text-xs font-black ${levelStyles.text} opacity-70 uppercase tracking-[0.3em] mb-1`}>Nível {currentLevelIndex + i + 2}</p>
                          <h4 className={`text-3xl md:text-4xl font-black ${levelStyles.text} tracking-tight drop-shadow-sm`}>{level.name}</h4>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 pt-2">
                        {level.exclusiveBenefits.slice(0, 4).map((b, idx) => (
                          <span key={idx} className={`px-4 py-2 rounded-full ${levelStyles.accent} text-xs font-bold ${levelStyles.text} opacity-90 ring-1 ${levelStyles.border} shadow-sm backdrop-blur-sm group-hover:opacity-100 transition-opacity`}>
                            {b}
                          </span>
                        ))}
                        {level.exclusiveBenefits.length > 4 && (
                          <span className={`px-4 py-2 rounded-full ${levelStyles.accent} text-xs font-bold ${levelStyles.text} opacity-80 ring-1 ${levelStyles.border} shadow-sm backdrop-blur-sm`}>
                            +{level.exclusiveBenefits.length - 4} mais
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right flex flex-col items-end gap-2 border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-8">
                      <div>
                        <p className={`text-[10px] font-black ${levelStyles.text} opacity-60 uppercase tracking-widest mb-1`}>Requisito de Evolução</p>
                        <p className={`text-2xl md:text-3xl font-black ${levelStyles.text} tracking-tighter drop-shadow-sm`}>{level.minPoints.toLocaleString()} <span className="text-lg opacity-70">pts</span></p>
                        <p className={`text-xs md:text-sm font-bold ${levelStyles.text} opacity-60 mt-1`}>Faltam {(level.minPoints - currentPoints).toLocaleString()} pts</p>
                      </div>
                      
                      {level.price > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/10 flex flex-col items-end w-full">
                          <p className={`text-[10px] font-black tracking-widest mb-2 px-3 py-1 rounded-md ${levelStyles.accent} ${levelStyles.text} uppercase shadow-sm`}>
                            Atalho Disponível
                          </p>
                          <div className="flex flex-col items-end mb-4">
                            <span className={`text-[10px] ${levelStyles.text} opacity-60 font-black uppercase tracking-wider mb-1`}>Valor Integral</span>
                            <span className={`text-lg font-black ${levelStyles.text} line-through opacity-50`}>
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(level.price)}
                            </span>
                          </div>
                          <div className="flex flex-col items-end mb-4 bg-black/20 p-3 rounded-2xl ring-1 ring-white/10 w-full backdrop-blur-md">
                            <span className={`text-[10px] text-emerald-400 font-black uppercase tracking-wider mb-1`}>Abatimento com seus Pontos</span>
                            <span className={`text-xl font-black text-emerald-400 drop-shadow-sm`}>
                              - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.min(pointsValueInReais, level.price))}
                            </span>
                          </div>
                          <button
                            onClick={() => setSelectedLevelToBuy(level)}
                            className={`w-full py-3 md:px-8 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl ${
                              level.visualStyle === 'clean' || level.visualStyle === 'silver' 
                                ? 'bg-black text-white hover:bg-black/80 ring-1 ring-black/50' 
                                : 'bg-white text-black hover:bg-white/90 ring-1 ring-white/50'
                            }`}
                          >
                            Comprar Upgrade
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            
            {currentLevelIndex === levels.length - 1 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16 px-8 bg-white rounded-[3rem] shadow-2xl ring-1 ring-neutral-300 relative overflow-hidden"
              >
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-amber-50/50 to-transparent pointer-events-none"></div>
                
                <div className="relative z-10">
                  <div className="relative inline-block mb-8">
                    {/* Orbiting Medals */}
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 -m-12"
                    >
                      {[0, 72, 144, 216, 288].map((degree, i) => (
                        <motion.div
                          key={i}
                          style={{ 
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: `rotate(${degree}deg) translateY(-80px)`
                          }}
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                        >
                          <div className="bg-white p-2 rounded-full shadow-lg ring-1 ring-amber-100">
                            <Medal size={24} className={i % 2 === 0 ? "text-amber-500" : "text-indigo-500"} />
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Central Trophy */}
                    <motion.div
                      animate={{ 
                        y: [0, -10, 0],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      className="h-32 w-32 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 flex items-center justify-center text-white shadow-[0_0_50px_rgba(245,158,11,0.5)] ring-4 ring-white relative z-20"
                    >
                      <Trophy size={64} className="drop-shadow-[0_2px_10px_rgba(0,0,0,0.3)]" />
                      
                      {/* Sparkles */}
                      <motion.div
                        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute -top-4 -right-4 text-amber-200"
                      >
                        <Sparkles size={32} />
                      </motion.div>
                    </motion.div>
                  </div>

                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h3 className="text-4xl sm:text-5xl font-black text-neutral-900 mb-4 tracking-tighter bg-gradient-to-r from-amber-600 to-amber-900 bg-clip-text text-transparent">
                      Você é o Grande Campeão! 👑
                    </h3>
                    <div className="max-w-md mx-auto space-y-4 px-4">
                      <p className="text-lg text-neutral-600 font-medium">
                        Sua jornada de prestígio atingiu o ápice. Você agora faz parte da elite do Grupo GSA.
                      </p>
                      <div className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-[#1a1a1a] text-white text-xs font-black uppercase tracking-widest shadow-2xl ring-1 ring-white/20">
                        <Award size={18} className="text-amber-500" />
                        Status Alfa: Nível Black
                      </div>
                      <p className="text-sm text-neutral-400 italic pt-6">
                        Desbloqueamos todos os segredos e privilégios para você.
                      </p>
                    </div>
                  </motion.div>
                </div>

                {/* Confetti-like particles */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(40)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ 
                        top: "110%", 
                        left: `${Math.random() * 100}%`,
                        opacity: 1,
                        scale: Math.random() * 0.8 + 0.5
                      }}
                      animate={{ 
                        top: "-20%", 
                        left: `${Math.random() * 100}%`,
                        rotate: 720,
                        opacity: 0
                      }}
                      transition={{ 
                        duration: Math.random() * 4 + 3, 
                        repeat: Infinity, 
                        delay: Math.random() * 8,
                        ease: "easeOut"
                      }}
                      className={`absolute w-3 h-3 rounded-full ${['bg-amber-400', 'bg-indigo-500', 'bg-emerald-400', 'bg-rose-500', 'bg-sky-400'][Math.floor(Math.random() * 5)]} shadow-lg`}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {activeTab === 'Histórico' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm ring-1 ring-black/5">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-10 w-10 rounded-xl bg-neutral-50 flex items-center justify-center text-neutral-400">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-neutral-900">Histórico de Níveis</h3>
                  <p className="text-xs text-neutral-500 font-medium">Acompanhe sua evolução e conquistas no Programa VIP.</p>
                </div>
              </div>

              {historyLoading ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Buscando registros...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="py-20 text-center border-2 border-dashed border-neutral-100 rounded-[2rem]">
                  <div className="h-16 w-16 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-200 mx-auto mb-4">
                    <Award size={32} />
                  </div>
                  <h4 className="text-xl font-bold text-neutral-300">Nenhum registro ainda</h4>
                  <p className="text-sm text-neutral-400 max-w-xs mx-auto mt-2">Suas mudanças de nível aparecerão aqui assim que você progredir no sistema.</p>
                </div>
              ) : (
                <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:h-full before:w-0.5 before:bg-neutral-100 pb-4">
                  {history.map((item, idx) => (
                    <div key={item.id} className="relative flex items-center gap-6 pl-12 group">
                      {/* Timeline Dot */}
                      <div className="absolute left-0 ml-[14px] h-3 w-3 rounded-full bg-white ring-4 ring-neutral-100 group-hover:ring-indigo-100 group-hover:bg-indigo-600 transition-all duration-300"></div>
                      
                      <div className="flex-1 bg-neutral-50 p-6 rounded-2xl border border-neutral-100 group-hover:border-indigo-100 group-hover:bg-white transition-all duration-300 group-hover:shadow-xl group-hover:shadow-indigo-500/5">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-1">
                              {formatDate(item.created_at)}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-neutral-400 line-through decoration-neutral-300">
                                {item.nivel_anterior?.nome_nivel || 'Nível Base'}
                              </span>
                              <ChevronRight size={16} className="text-neutral-300" />
                              <span className="text-lg font-black text-indigo-600">
                                {item.nivel_novo?.nome_nivel || 'Nível Atual'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-neutral-100 text-neutral-500 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-colors shadow-sm">
                            <Zap size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{item.observacao || 'Mudança de Patamar'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
      <Modal 
        isOpen={!!selectedLevelToBuy} 
        onClose={() => setSelectedLevelToBuy(null)} 
        title={`Comprar Upgrade ${selectedLevelToBuy?.name || ''}`}
        size="full"
      >
        {selectedLevelToBuy && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-100">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${getLevelStyles(selectedLevelToBuy).bg}`}>
                <Crown className="text-white" size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-900">Confira o multiplicador de pontos deste nível</p>
                <p className="text-xs text-neutral-500">Ao subir de nível, você passa a acumular mais pontos por real gasto.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-2xl bg-neutral-50 p-5 text-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Multiplicador atual</p>
                <p className="mt-2 text-2xl font-black text-neutral-800">{currentLevel.multiplier}×</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Novo multiplicador</p>
                <p className="mt-2 text-2xl font-black text-indigo-700">{selectedLevelToBuy.multiplier}×</p>
              </div>
            </div>

            <div className="bg-neutral-50 p-6 rounded-2xl space-y-4">
              <h4 className="text-sm font-bold text-neutral-900 uppercase tracking-widest opacity-50 mb-4">Resumo da Compra</h4>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-600">Valor do Nível {selectedLevelToBuy.name}</span>
                <span className="font-bold text-neutral-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedLevelToBuy.price)}
                </span>
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-600 flex items-center gap-2">
                  <Star size={14} className="text-amber-500" />
                  Pontos disponíveis ({cliente.saldo_pontos || 0})
                </span>
                <span className="font-bold text-emerald-500">
                  - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.min(pointsValueInReais, selectedLevelToBuy.price))}
                </span>
              </div>

              <div className="pt-4 border-t border-black/10 flex justify-between items-center">
                <span className="font-black text-neutral-900">Valor a Pagar</span>
                <span className="text-2xl font-black text-indigo-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, selectedLevelToBuy.price - pointsValueInReais))}
                </span>
              </div>
              
              <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-xs flex items-start gap-2 mt-4">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>O valor restante não poderá ser pago utilizando vouchers, saldo da carteira ou mais pontos. Uma fatura será gerada para pagamento via PIX.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-black/5">
              <button
                onClick={() => setSelectedLevelToBuy(null)}
                className="px-6 py-3 rounded-xl font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
                disabled={isBuying}
              >
                Cancelar
              </button>
              <button
                onClick={handleBuyLevel}
                disabled={isBuying}
                className="px-8 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isBuying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gerando Fatura...
                  </>
                ) : (
                  'Confirmar Compra'
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}

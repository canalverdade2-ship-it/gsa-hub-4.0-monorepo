import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Wallet, Gift, Lock, Crown, Trophy, Star, Zap, ShieldCheck, Award, CreditCard } from 'lucide-react';
import { Cliente, Module } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { VIPLevel } from '../../constants';
import { useVipLevels } from '../../hooks/useVipLevels';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  count: number;
  locked?: boolean;
}

interface ClientDashboardProps {
  menuItems: MenuItem[];
  onNavigate: (module: Module, tab?: string) => void;
  cliente: Cliente;
  vipModuleConfig?: { ativo: boolean; oculto: boolean };
}

export function ClientDashboard({ menuItems, onNavigate, cliente, vipModuleConfig }: ClientDashboardProps) {
  const vipAtivo = vipModuleConfig?.ativo ?? true;
  const vipOculto = vipModuleConfig?.oculto ?? false;
  const { levels } = useVipLevels();
  const [showLevelUp, setShowLevelUp] = React.useState(false);
  const [prevLevel, setPrevLevel] = React.useState<string | null>(null);

  const currentPoints = cliente.pontos_totais || 0;
  
  // Resolve current level using dbId UUID matching
  // Priority: manual level (nivel_manual_id) > auto level (nivel_id) > points-based fallback
  let currentLevel = null;
  if (levels.length > 0) {
    const manualId = cliente.nivel_manual_id;
    const autoId = cliente.nivel_id;
    
    if (manualId) {
      currentLevel = (levels as any[]).find((l: any) => l.dbId === manualId)
        || (cliente.manual_level ? levels.find(l => l.name.toLowerCase() === (cliente.manual_level as any)?.nome_nivel?.toLowerCase()) : null);
    }
    if (!currentLevel && autoId) {
      currentLevel = (levels as any[]).find((l: any) => l.dbId === autoId)
        || (cliente.auto_level ? levels.find(l => l.name.toLowerCase() === (cliente.auto_level as any)?.nome_nivel?.toLowerCase()) : null);
    }
    if (!currentLevel) {
      currentLevel = levels.find(l => currentPoints >= l.minPoints && (l.maxPoints === null || currentPoints <= l.maxPoints)) || levels[0];
    }
  }
  currentLevel = currentLevel || levels[0];

  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el || !cliente?.nome) return;
    const parent = el.parentElement;
    if (!parent) return;

    let lastWidth = -1;

    const resize = () => {
      const currentWidth = parent.clientWidth;
      if (currentWidth === 0 || currentWidth === lastWidth) return;
      lastWidth = currentWidth;
      
      let fontSize = 30; // 30px is roughly text-3xl
      el.style.fontSize = `${fontSize}px`;
      
      while (el.scrollWidth > parent.clientWidth && fontSize > 14) {
        fontSize -= 1;
        el.style.fontSize = `${fontSize}px`;
      }
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(resize);
    });
    observer.observe(parent);
    
    resize();

    return () => observer.disconnect();
  }, [cliente?.nome]);

  // Detect level up
  React.useEffect(() => {
    const levelName = currentLevel.name;
    if (prevLevel && levelName && prevLevel !== levelName) {
      setShowLevelUp(true);
      const timer = setTimeout(() => setShowLevelUp(false), 5000);
      return () => clearTimeout(timer);
    }
    if (levelName) {
      setPrevLevel(levelName);
    }
  }, [currentLevel.name]);

  const handleModuleClick = (item: MenuItem) => {
    if (item.locked) return;
    
    onNavigate(item.id as Module);
  };

  // Filter out dashboard from the items to display
  // Também filtra area_vip se o módulo estiver oculto
  const displayItems = menuItems.filter(item => item.id !== 'dashboard' && !(item.id === 'area_vip' && vipOculto));
  const isVip = currentLevel.name !== 'Básico';
  const isBlocked = (
    ['bloqueado', 'inativo', 'excluido'].includes(String(cliente?.status || '').toLowerCase())
    || cliente?.cadastro_aprovado === false
    || cliente?.bloqueado === true
  );

  const currentLevelIndex = levels.indexOf(currentLevel);
  const nextLevel = levels[currentLevelIndex + 1];

  const getLevelStyles = (level: VIPLevel) => {
    switch (level.visualStyle) {
      case 'copper':
        return {
          bg: 'bg-gradient-to-br from-[#804a00] via-[#cd7f32] to-[#804a00]',
          text: 'text-white',
          accent: 'bg-white/20',
          glow: 'bg-orange-500/20',
          border: 'ring-orange-400/30'
        };
      case 'silver':
        return {
          bg: 'bg-gradient-to-br from-[#a0a0a0] via-[#e0e0e0] to-[#a0a0a0]',
          text: 'text-neutral-900',
          accent: 'bg-black/10',
          glow: 'bg-white/40',
          border: 'ring-white/50'
        };
      case 'gold-black':
        return {
          bg: 'bg-gradient-to-br from-[#000000] via-[#1a1a1a] to-[#000000]',
          text: 'text-[#ffd700]',
          accent: 'bg-[#ffd700]/20',
          glow: 'bg-[#ffd700]/10',
          border: 'ring-[#ffd700]/30'
        };
      case 'diamond':
        return {
          bg: 'bg-gradient-to-br from-[#004e92] via-[#000428] to-[#004e92]',
          text: 'text-[#b9f2ff]',
          accent: 'bg-[#b9f2ff]/20',
          glow: 'bg-[#b9f2ff]/30',
          border: 'ring-[#b9f2ff]/40'
        };
      case 'black-luxury':
        return {
          bg: 'bg-gradient-to-br from-[#000000] via-[#111111] to-[#000000]',
          text: 'text-white',
          accent: 'bg-white/10',
          glow: 'bg-white/5',
          border: 'ring-white/20'
        };
      default: // clean
        return {
          bg: 'bg-white',
          text: 'text-neutral-900',
          accent: 'bg-neutral-100',
          glow: 'bg-neutral-50',
          border: 'ring-neutral-200'
        };
    }
  };

  const styles = getLevelStyles(currentLevel);

  const getModuleCardMeta = (id: string) => {
    const metas: Record<string, { desc: string; iconBg: string; iconText: string; accent: string }> = {
      perfil: { desc: 'Dados e documentos', iconBg: 'bg-neutral-100', iconText: 'text-neutral-900', accent: 'from-neutral-900' },
      gsa_store: { desc: 'Loja, compras e ofertas', iconBg: 'bg-violet-50', iconText: 'text-violet-600', accent: 'from-violet-500' },
      financeiro: { desc: 'Faturas, saldo e crédito', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', accent: 'from-emerald-500' },
      fidelidade: { desc: 'Pontos, prêmios e VIP', iconBg: 'bg-amber-50', iconText: 'text-amber-600', accent: 'from-amber-500' },
      suporte: { desc: 'Atendimento e chamados', iconBg: 'bg-sky-50', iconText: 'text-sky-600', accent: 'from-sky-500' }
    };

    return metas[id] || { desc: 'Acesse este módulo', iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', accent: 'from-indigo-500' };
  };

  return (
    <div className="relative">
      <AnimatePresence>
        <motion.div
          key="dashboard-content"
          className="space-y-8"
        >
          <AnimatePresence>
              {showLevelUp && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                  onClick={() => setShowLevelUp(false)}
                >
                  <motion.div
                    initial={{ y: 50 }}
                    animate={{ y: 0 }}
                    className="bg-white rounded-[40px] p-10 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Animated Background Elements */}
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 opacity-5 pointer-events-none"
                    >
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full border-[40px] border-dashed border-indigo-500 rounded-full"></div>
                    </motion.div>

                    <div className="relative z-10">
                      <motion.div
                        animate={{ 
                          scale: [1, 1.2, 1],
                          rotate: [0, 10, -10, 0]
                        }}
                        transition={{ duration: 0.5, repeat: 2 }}
                        className="text-6xl mb-6 inline-block"
                      >
                        🎉
                      </motion.div>
                      <h2 className="text-3xl font-black text-neutral-900 mb-2">PARABÉNS!</h2>
                      <p className="text-neutral-500 mb-8">Você alcançou um novo patamar no nosso programa VIP.</p>
                      
                      <div className="py-6 px-8 rounded-3xl mb-8 inline-block" style={{ backgroundColor: `${currentLevel.color}15` }}>
                        <span className="text-[10px] font-bold tracking-[0.3em] text-neutral-400 uppercase block mb-2">Novo Nível</span>
                        <span className="text-4xl font-black tracking-tighter" style={{ color: currentLevel.color }}>
                          {currentLevel.name.toUpperCase()}
                        </span>
                      </div>

                      <button
                        onClick={() => setShowLevelUp(false)}
                        className="w-full py-4 rounded-2xl bg-[#1a1a1a] text-white font-bold hover:bg-black transition-colors shadow-lg shadow-black/10"
                      >
                        Continuar
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 ref={titleRef} className="text-3xl tracking-tight text-[#1a1a1a] whitespace-nowrap">
                  Olá, {cliente.nome}!
                </h2>
                <p className="mt-2 text-[#1a1a1a]/60">
                  Bem-vindo ao seu portal do cliente.
                </p>
              </div>
            </div>

            {/* Quick Balance Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <motion.div
                whileHover="hover"
                variants={{
                  hover: { scale: 1.02, y: -2 }
                }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('financeiro', 'extrato')}
                className={`rounded-3xl bg-[#1a1a1a] ring-1 ring-white/10 flex flex-col items-center justify-between text-center transition-all relative overflow-hidden group h-[4.75rem] cursor-pointer ${isBlocked ? 'opacity-90' : 'hover:shadow-xl'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none transition-opacity group-hover:opacity-70"></div>
                
                <div className={`flex flex-col justify-center gap-0 relative z-10 w-full h-full p-2 ${isBlocked ? 'scale-90 opacity-70' : ''}`}>
                  <div className="flex items-center justify-center gap-1">
                    <motion.div
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
                      variants={{
                        hover: { rotate: [0, -15, 15, -15, 15, 0], transition: { duration: 0.4 } }
                      }}
                    >
                      <CreditCard className="h-4 w-4 text-emerald-400" />
                    </motion.div>
                    <span className="text-xl sm:text-2xl font-black tracking-widest text-white/90 uppercase">Carteira</span>
                  </div>
                  <div className="flex items-center justify-center -mt-1 sm:-mt-2">
                    <p className="text-2xl sm:text-4xl font-black text-white w-full truncate text-center leading-none mt-0">
                      {(() => {
                        const formatted = formatCurrency(cliente.saldo_carteira || 0);
                        const parts = formatted.split(' ');
                        return (
                          <>
                            <span className="text-lg sm:text-2xl opacity-70 mr-1">{parts[0]}</span>
                            {parts[1]}
                          </>
                        );
                      })()}
                    </p>
                  </div>
                </div>

                {isBlocked && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
                    <Lock className="h-12 w-12 text-red-600" />
                  </div>
                )}
              </motion.div>

              <motion.div
                whileHover="hover"
                variants={{
                  hover: { scale: 1.02, y: -2 }
                }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleModuleClick({ id: 'pontos', label: 'Pontos', icon: Star, count: 0 })}
                className={`rounded-3xl bg-indigo-600 ring-1 ring-indigo-500 flex flex-col items-center justify-between text-center transition-all relative overflow-hidden group h-[4.75rem] cursor-pointer ${isBlocked ? 'opacity-90' : 'hover:shadow-xl'}`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none transition-opacity group-hover:opacity-70"></div>
                
                <div className={`flex flex-col justify-center gap-0.5 relative z-10 w-full h-full p-2 ${isBlocked ? 'scale-90 opacity-80' : ''}`}>
                  <div className="flex items-center justify-center gap-1">
                    <motion.div
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.3 }}
                      variants={{
                        hover: { rotate: [0, -15, 15, -15, 15, 0], transition: { duration: 0.4 } }
                      }}
                    >
                      <Star className="h-4 w-4 text-amber-300" />
                    </motion.div>
                    <span className="text-xl sm:text-2xl font-black tracking-widest text-indigo-50 uppercase">Pontos</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <p className="text-2xl sm:text-4xl font-black text-white truncate w-full text-center leading-none mt-0">{(cliente.saldo_pontos || 0).toLocaleString('pt-BR')} pts</p>
                  </div>
                </div>

                {isBlocked && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
                    <Lock className="h-12 w-12 text-red-600" />
                  </div>
                )}
              </motion.div>
            </div>

            {/* VIP Level Card */}
            {!isBlocked && !vipOculto && (
              <motion.div
                whileHover="hover"
                variants={{
                  hover: { scale: vipAtivo ? 1.01 : 1 }
                }}
                whileTap={{ scale: vipAtivo ? 0.99 : 1 }}
                onClick={() => vipAtivo && handleModuleClick({ id: 'area_vip', label: 'Área VIP', icon: Crown, count: 0 })}
                className={`relative overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl transition-all group ring-1 ${
                  vipAtivo ? 'cursor-pointer' : 'cursor-not-allowed'
                } ${styles.bg} ${styles.border}`}
              >
                {/* Overlay de desativado */}
                {!vipAtivo && (
                  <div className="absolute inset-0 z-20 bg-neutral-900/70 backdrop-blur-sm rounded-[2rem] sm:rounded-[2.5rem] flex flex-col items-center justify-center gap-2">
                    <Crown className="h-8 w-8 text-neutral-400" />
                    <p className="text-neutral-300 text-sm font-black uppercase tracking-widest">Módulo Desativado</p>
                    <p className="text-neutral-500 text-xs">Por tempo indeterminado</p>
                  </div>
                )}
                {/* Animated Glow Background */}
                <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-50 transition-all group-hover:opacity-80 ${styles.glow}`}></div>
                <div className={`absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-30 transition-all group-hover:opacity-50 ${styles.glow}`}></div>
                
                {/* Decorative Pattern */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

                <div className="relative z-10 flex flex-col gap-4 sm:gap-8">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-black tracking-[0.4em] uppercase opacity-60 ${styles.text}`}>Status VIP</span>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2">
                        <h3 className={`text-3xl sm:text-4xl font-black tracking-tighter flex items-center gap-2 sm:gap-3 ${styles.text}`}>
                          <span>{currentLevel.name.toUpperCase()}</span>
                          <span className="ml-1 text-2xl sm:text-3xl">
                            {currentLevel.visualStyle === 'diamond' ? '💎' : 
                             currentLevel.visualStyle === 'gold-black' ? '🥇' :
                             currentLevel.visualStyle === 'silver' ? '🥈' :
                             currentLevel.visualStyle === 'copper' ? '🥉' : 
                             currentLevel.visualStyle === 'black-luxury' ? '👑' : '✨'}
                          </span>
                        </h3>
                      </div>
                    </div>
                    <motion.div 
                      initial={{ scale: 0, rotate: -45 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.4 }}
                      variants={{
                        hover: { rotate: [0, -10, 10, -10, 10, 0], scale: 1.1, transition: { duration: 0.5 } }
                      }}
                      className={`h-12 w-12 sm:h-16 sm:w-16 rounded-2xl sm:rounded-[2rem] flex items-center justify-center shadow-2xl backdrop-blur-md ring-1 ring-white/20 shrink-0 ${styles.accent}`}
                    >
                      <Crown className={`h-6 w-6 sm:h-8 sm:w-8 ${styles.text}`} />
                    </motion.div>
                  </div>

                  <div className="flex flex-col gap-3 sm:gap-4">
                    <div className="flex items-end justify-between">
                      <p className={`text-base sm:text-lg font-medium opacity-80 ${styles.text}`}>
                        <span className="text-2xl sm:text-3xl font-black block mb-0.5 sm:mb-1">{(cliente.pontos_totais || 0).toLocaleString('pt-BR')}</span>
                        pontos acumulados
                      </p>
                      {nextLevel && (
                        <div className="text-right">
                          <p className={`text-[10px] font-black uppercase tracking-widest opacity-50 mb-0.5 sm:mb-1 ${styles.text}`}>Próximo Nível</p>
                          <p className={`text-xs sm:text-sm font-bold ${styles.text}`}>{nextLevel.name}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Progress Section */}
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex justify-between items-end">
                        <p className={`text-[10px] sm:text-xs font-bold opacity-80 ${styles.text}`}>
                          {nextLevel ? (
                            <>Progresso para {nextLevel.name}</>
                          ) : (
                            <>Nível Máximo</>
                          )}
                        </p>
                        <p className={`text-[10px] sm:text-xs font-black opacity-60 ${styles.text}`}>
                          {Math.floor(nextLevel ? Math.min(100, (currentPoints / nextLevel.minPoints) * 100) : 100)}%
                        </p>
                      </div>
                      <div className="h-3 sm:h-4 w-full rounded-full bg-black overflow-hidden p-[2px] ring-1 ring-white/10">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ 
                            width: nextLevel ? `${Math.min(100, (currentPoints / nextLevel.minPoints) * 100)}%` : '100%' 
                          }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="h-full rounded-full shadow-sm relative overflow-hidden bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-black/20"></div>
                          {/* Animated Shine */}
                          <motion.div
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-1/2"
                          />
                        </motion.div>
                      </div>

                      <div className="flex items-center justify-between">
                        {nextLevel ? (
                          <p className={`text-xs font-bold opacity-80 ${styles.text}`}>
                            Faltam <span className="font-black">{(nextLevel.minPoints - currentPoints).toLocaleString('pt-BR')} pontos</span> para alcançar {nextLevel.name}
                          </p>
                        ) : (
                          <p className={`text-xs font-bold opacity-80 ${styles.text}`}>Você atingiu o nível máximo do programa VIP!</p>
                        )}
                        <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${styles.accent} ${styles.text}`}>
                          <Zap size={10} className="fill-current" />
                          <span>{currentLevel.multiplier}x Pontos</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayItems.map((item) => {
                const meta = getModuleCardMeta(item.id);

                return (
                  <motion.button
                    key={item.id}
                    layout
                    whileHover={{ scale: item.locked ? 1 : 1.02, y: item.locked ? 0 : -4 }}
                    whileTap={{ scale: item.locked ? 1 : 0.98 }}
                    onClick={() => handleModuleClick(item)}
                    className={`group relative min-h-[132px] overflow-hidden rounded-[1.65rem] border bg-white p-4 text-left shadow-sm transition-all sm:min-h-[150px] sm:p-5 ${
                      item.locked
                        ? 'cursor-not-allowed border-neutral-200 opacity-60 grayscale-[0.5]'
                        : 'border-neutral-200 hover:border-neutral-300 hover:shadow-xl'
                    }`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.accent} to-transparent opacity-80`} />
                    <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-neutral-100 opacity-60 transition-transform duration-500 group-hover:scale-125" />

                    <div className="relative z-10 flex h-full flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.locked ? 'bg-neutral-100 text-neutral-400' : `${meta.iconBg} ${meta.iconText}`}`}
                        >
                          <item.icon className="h-5 w-5" />
                        </motion.div>

                        {item.locked ? (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                            <Lock className="h-4 w-4" />
                          </span>
                        ) : item.count > 0 ? (
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[11px] font-black text-white shadow-sm">
                            {item.count}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                        <div className="min-w-0">
                          <h3 className={`text-sm font-black leading-tight sm:text-base ${item.locked ? 'text-neutral-400' : 'text-neutral-950'}`}>
                            {item.label}
                          </h3>
                          <p className={`mt-1 text-[11px] font-semibold leading-snug sm:text-xs ${item.locked ? 'text-neutral-400' : 'text-neutral-500'}`}>
                            {meta.desc}
                          </p>
                        </div>

                        {!item.locked && (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-all group-hover:bg-[#1a1a1a] group-hover:text-white">
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>

      </AnimatePresence>
    </div>
  );
}

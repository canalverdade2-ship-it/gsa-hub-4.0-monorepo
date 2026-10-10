import { useState, useEffect } from 'react';
import { OrdensServicoModule } from './OrdensServicoModule';
import { OrdensCompraModule } from './OrdensCompraModule';
import { OrdensAssinaturaModule } from './OrdensAssinaturaModule';
import { OrcamentosModule } from './OrcamentosModule';
import { PrestadoresDemandas } from './prestadores/PrestadoresDemandas';
import { CreditoModule } from './CreditoModule';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { ClipboardList, ClipboardCheck, Package, Zap, TrendingUp, Briefcase, Landmark, ChevronLeft } from 'lucide-react';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

type MainTab = 'orcamentos' | 'demandas' | 'os' | 'produtos' | 'assinaturas' | 'credito';

const SUB_TABS: Record<MainTab, { id: string, label: string }[]> = {
  orcamentos: [
    { id: 'abertos', label: 'Abertos' },
    { id: 'aprovados', label: 'Aprovados' },
    { id: 'cancelados', label: 'Cancelados' }
  ],
  demandas: [
    { id: 'abertas', label: 'Demandas Abertas' },
    { id: 'ativas', label: 'Demandas Ativas' },
    { id: 'concluidas', label: 'Concluídas' },
    { id: 'canceladas', label: 'Canceladas' },
    { id: 'suporte', label: 'Suporte' }
  ],
  os: [
    { id: 'abertas', label: 'Abertas' },
    { id: 'concluidas', label: 'Concluídas' },
    { id: 'canceladas', label: 'Canceladas' }
  ],
  produtos: [
    { id: 'processamento', label: 'Processamento' },
    { id: 'concluido', label: 'Concluído' }
  ],
  assinaturas: [
    { id: 'processamento', label: 'Processamento' },
    { id: 'concluido', label: 'Concluído' }
  ],
  credito: [
    { id: 'solicitacoes', label: 'Solicitações' },
    { id: 'carteira', label: 'Carteira' },
    { id: 'movimentacoes', label: 'Movimentações' }
  ]
};

export function VendasModule({
  initialTab,
  initialItemId,
  adminType,
  colaboradorId,
  colaboradorNome,
  onNavigate,
  allowedTabs,
  title = 'Central de Vendas'
}: {
  initialTab?: string,
  initialItemId?: string,
  adminType?: string,
  colaboradorId?: string,
  colaboradorNome?: string,
  onNavigate?: (module: string, tab?: string, itemId?: string) => void,
  allowedTabs?: MainTab[],
  title?: string
}) {
  const { pendencies } = useAdminNotifications();
  const isAllowedTab = (tab: MainTab) => !allowedTabs || allowedTabs.includes(tab);
  const firstAllowedTab = (allowedTabs?.[0] || 'orcamentos') as MainTab;

  const getInitialState = () => {
    if (!initialTab) return { main: firstAllowedTab, sub: SUB_TABS[firstAllowedTab][0].id };
    
    if (['abertos', 'aprovados', 'cancelados'].includes(initialTab)) {
      return { main: isAllowedTab('orcamentos') ? 'orcamentos' as MainTab : firstAllowedTab, sub: isAllowedTab('orcamentos') ? initialTab : SUB_TABS[firstAllowedTab][0].id };
    }
    
    if (['abertas', 'ativas', 'concluidas', 'canceladas', 'suporte'].includes(initialTab)) {
      return { main: isAllowedTab('demandas') ? 'demandas' as MainTab : firstAllowedTab, sub: isAllowedTab('demandas') ? initialTab : SUB_TABS[firstAllowedTab][0].id };
    }

    if (['abertas', 'concluidas', 'canceladas'].includes(initialTab)) {
      return { main: isAllowedTab('os') ? 'os' as MainTab : firstAllowedTab, sub: isAllowedTab('os') ? initialTab : SUB_TABS[firstAllowedTab][0].id };
    }

    if (['solicitacoes', 'propostas', 'ativos', 'quitados'].includes(initialTab)) {
      return { main: firstAllowedTab, sub: SUB_TABS[firstAllowedTab][0].id };
    }

    const legacyMainTabs: Record<string, MainTab> = {
      'ordens-servico': 'os',
      'ordens-compra': 'produtos',
      'ordens-assinatura': 'assinaturas',
      'credito-loja': 'credito',
      credito_loja: 'credito',
      pedidos: 'produtos',
      produtos: 'produtos',
    };
    if (legacyMainTabs[initialTab] && isAllowedTab(legacyMainTabs[initialTab])) {
      const main = legacyMainTabs[initialTab];
      return { main, sub: SUB_TABS[main][0].id };
    }

    if (Object.keys(SUB_TABS).includes(initialTab)) {
      const main = initialTab as MainTab;
      if (isAllowedTab(main)) return { main, sub: SUB_TABS[main][0].id };
    }

    return { main: firstAllowedTab, sub: SUB_TABS[firstAllowedTab][0].id };
  };

  const initialState = getInitialState();
  const [activeTab, setActiveTab] = useState<MainTab>(initialState.main);
  const [activeSubTab, setActiveSubTab] = useState<string>(initialState.sub);
  const [showSubTabs, setShowSubTabs] = useState(false);
  const [, setRtRefreshKey] = useState(0);
  useRealtimeSubscription([
    { table: 'orcamentos', onChange: () => setRtRefreshKey(k => k + 1), debounceMs: 300 },
    { table: 'ordens_servico', onChange: () => setRtRefreshKey(k => k + 1), debounceMs: 300 },
    { table: 'ordens_compra', onChange: () => setRtRefreshKey(k => k + 1), debounceMs: 300 },
    { table: 'ordens_assinatura', onChange: () => setRtRefreshKey(k => k + 1), debounceMs: 300 },
    { table: 'prestador_demandas', onChange: () => setRtRefreshKey(k => k + 1), debounceMs: 300 },
  ]);
  const [isSubmoduleOpen, setIsSubmoduleOpen] = useState(Boolean(initialTab || initialItemId));

  useEffect(() => {
    if (initialTab || initialItemId) {
      const state = getInitialState();
      setActiveTab(state.main);
      setActiveSubTab(state.sub);
      setIsSubmoduleOpen(true);
    }
  }, [initialTab, initialItemId]);

  const handleTabClick = (tabId: MainTab) => {
    setIsSubmoduleOpen(true);
    if (activeTab === tabId) {
      setShowSubTabs(!showSubTabs);
    } else {
      setActiveTab(tabId);
      setActiveSubTab(SUB_TABS[tabId]?.[0]?.id || '');
      setShowSubTabs(true);
    }
  };

  const handleSubTabClick = (subId: string) => {
    setActiveSubTab(subId);
    setShowSubTabs(false);
  };

  const openSubmodule = (tabId: MainTab) => {
    setActiveTab(tabId);
    setActiveSubTab(SUB_TABS[tabId]?.[0]?.id || '');
    setShowSubTabs(false);
    setIsSubmoduleOpen(true);
  };

  const backToCentral = () => {
    setIsSubmoduleOpen(false);
    setShowSubTabs(false);
  };

  const tabs = [
    { 
      id: 'orcamentos', 
      label: 'Orçamentos', 
      icon: ClipboardList,
      badge: pendencies.vendas_orcamentos_pendentes + pendencies.vendas_orcamentos_aprovados
    },
    { 
      id: 'demandas', 
      label: 'Gerenciar Demandas', 
      icon: Briefcase,
      badge: pendencies.vendas_demandas_abertas + pendencies.vendas_demandas_ativas + pendencies.vendas_demandas_suporte
    },
    { 
      id: 'os', 
      label: 'Ordens de Serviços', 
      icon: ClipboardCheck,
      badge: pendencies.vendas_os_andamento
    },
    { id: 'produtos', label: 'Ordens de Produtos', icon: Package },
    { id: 'assinaturas', label: 'Ordens de Assinaturas', icon: Zap, badge: pendencies.vendas_assinaturas_pendentes },
    { id: 'credito', label: 'Crédito Loja', icon: Landmark },
  ].filter(tab => isAllowedTab(tab.id as MainTab));

  if (!isSubmoduleOpen) {
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
        <div className="rounded-[2rem] bg-[#1a1a1a] p-5 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">Painel ADM</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">{title}</h1>
            </div>
            <TrendingUp className="hidden h-10 w-10 text-white/10 sm:block" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const badge = (tab as any).badge || 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openSubmodule(tab.id as MainTab)}
                className="group relative min-h-[150px] rounded-3xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-xl"
              >
                {badge > 0 && (
                  <span className="absolute right-4 top-4 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[10px] font-black text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-all group-hover:bg-emerald-600 group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </span>
                <h2 className="mt-5 text-base font-black text-neutral-950">{tab.label}</h2>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <button
        type="button"
        onClick={backToCentral}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-emerald-200 hover:text-emerald-600"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </button>

      {/* Module Header */}
      <div className="hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-3 md:gap-3">
          <div className="flex flex-row items-center justify-between gap-6 border-b border-white/5 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-6 w-1 bg-emerald-500 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.6)]"></div>
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400 whitespace-nowrap overflow-hidden">
                {title}
              </h1>
            </div>
            <TrendingUp className="hidden md:block h-8 w-8 text-white/5" />
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-1.5 w-full">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <div key={tab.id} className="relative flex-none font-black translate-y-0 active:translate-y-1 transition-transform">
                  <button
                    onClick={() => handleTabClick(tab.id as MainTab)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 md:px-4 rounded-xl transition-all text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest border
                      ${isActive 
                        ? 'bg-white text-emerald-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-emerald-500' 
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'}`}
                  >
                    <Icon className="h-4 w-4 text-current" />
                    <span>{tab.label}</span>
                    {(tab as any).badge > 0 && (
                      <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white ring-2 ring-white/10 animate-pulse">
                        {(tab as any).badge}
                      </span>
                    )}
                  </button>

                  {isActive && showSubTabs && (
                    <div className="absolute top-full left-0 mt-4 z-50 w-72 animate-in fade-in zoom-in-95 duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-2 flex flex-col gap-1 overflow-hidden border border-neutral-100">
                        <div className="px-4 py-2 text-[7px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b border-neutral-100 mb-1">
                          Selecione uma opção
                        </div>
                        {SUB_TABS[activeTab].map((sub, idx) => {
                          let subBadge = 0;
                          if (activeTab === 'orcamentos') {
                            if (sub.id === 'abertos') subBadge = pendencies.vendas_orcamentos_pendentes;
                            if (sub.id === 'aprovados') subBadge = pendencies.vendas_orcamentos_aprovados;
                          } else if (activeTab === 'demandas') {
                            if (sub.id === 'abertas') subBadge = pendencies.vendas_demandas_abertas;
                            if (sub.id === 'ativas') subBadge = pendencies.vendas_demandas_ativas;
                            if (sub.id === 'suporte') subBadge = pendencies.vendas_demandas_suporte;
                          } else if (activeTab === 'os') {
                            if (sub.id === 'abertas') subBadge = pendencies.vendas_os_andamento;
                          } else if (activeTab === 'assinaturas') {
                            if (sub.id === 'processamento') subBadge = pendencies.vendas_assinaturas_pendentes;
                          }

                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleSubTabClick(sub.id)}
                              style={{ animationDelay: `${idx * 50}ms` }}
                              className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:translate-x-1 border border-transparent ${
                                activeSubTab === sub.id
                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {sub.label}
                                {subBadge > 0 && (
                                  <span className="flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-1 text-[7px] font-black text-white">
                                    {subBadge}
                                  </span>
                                )}
                              </div>
                              {activeSubTab === sub.id && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></div>}
                            </button>
                          );
                        })}
                      </div>
                      {/* Visual Connector */}
                      <div className="absolute -top-1.5 left-6 w-3 h-3 bg-white rotate-45 rounded-sm border-l border-t border-neutral-100"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'orcamentos' && <OrcamentosModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorNome={colaboradorNome} onNavigate={(mod, t) => { setActiveTab(mod as MainTab); if(t) setActiveSubTab(t); }} />}
        {activeTab === 'demandas' && <PrestadoresDemandas subTab={activeSubTab} initialItemId={initialItemId} colaboradorNome={colaboradorNome} colaboradorId={colaboradorId} />}
        {activeTab === 'os' && <OrdensServicoModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'produtos' && <OrdensCompraModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorNome={colaboradorNome} onNavigate={onNavigate} />}
        {activeTab === 'assinaturas' && <OrdensAssinaturaModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'credito' && <CreditoModule colaboradorNome={colaboradorNome} initialItemId={initialItemId} />}
      </div>
    </div>
  );
}

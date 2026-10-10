// HMR cache refresh
import { useState, useEffect } from 'react';
import { ClientesModule } from './ClientesModule';
import { ServicosModule } from './ServicosModule';
import { ProdutosModule } from './ProdutosModule';
import { AssinaturasModule } from './AssinaturasModule';
import { IndicacoesModule } from './IndicacoesModule';
import { VouchersModule } from './VouchersModule';
import PremiosModule from './PremiosModule';
import { PromocaoQuantidadeModule } from './PromocaoQuantidadeModule';
import { CuponsLojaModule } from './CuponsLojaModule';
import { LojaTrocasModule } from './LojaTrocasModule';
import { ReembolsosModule } from './ReembolsosModule';
import { LojaCategoriasModule } from './LojaCategoriasModule';
import { ServicePackagesModule } from './ServicePackagesModule';
import { EcommerceAnalytics } from './ecommerce/EcommerceAnalytics';
import { PricingPanel } from './ecommerce/PricingPanel';
import { Users, Scissors, Package, Boxes, Zap, Share2, Ticket, Trophy, Megaphone, ShieldCheck, Store, Tag, ChevronLeft, Tags } from 'lucide-react';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';

type MainTab = 'clientes' | 'servicos' | 'pacotes' | 'produtos' | 'assinaturas' | 'indicacoes' | 'vouchers' | 'premios' | 'promocoes' | 'gsa_store' | 'categorias_loja' | 'cupons';

const SUB_TABS: Record<MainTab, { id: string, label: string }[]> = {
  clientes: [
    { id: 'ativos', label: 'Ativos' },
    { id: 'inativos', label: 'Inativos' },
    { id: 'pendentes', label: 'Pendentes' },
    { id: 'bloqueados', label: 'Bloqueados' }
  ],
  servicos: [
    { id: 'ativos', label: 'Ativos' },
    { id: 'inativos', label: 'Inativos' }
  ],
  pacotes: [
    { id: 'ativos', label: 'Ativos' },
    { id: 'inativos', label: 'Inativos' }
  ],
  produtos: [
    { id: 'ativos', label: 'Ativos' },
    { id: 'inativos', label: 'Inativos' }
  ],
  assinaturas: [
    { id: 'ativos', label: 'Ativas' },
    { id: 'inativos', label: 'Inativas' }
  ],
  indicacoes: [
    { id: 'aberta', label: 'Abertas' },
    { id: 'concluída', label: 'Convertidas' },
    { id: 'cancelada', label: 'Canceladas' }
  ],
  vouchers: [
    { id: 'ativos', label: 'Ativos' },
    { id: 'usados', label: 'Usados' },
    { id: 'cancelados', label: 'Cancelados' }
  ],
  premios: [
    { id: 'pendente', label: 'Pendentes' },
    { id: 'resgatado', label: 'Resgatados' },
    { id: 'cancelado', label: 'Cancelados' }
  ],
  promocoes: [
    { id: 'ativas', label: 'Ativas' },
    { id: 'encerradas', label: 'Encerradas' }
  ],
  gsa_store: [
    { id: 'analytics', label: 'Analytics' },
    { id: 'precificacao', label: 'Precificação N8N' },
    { id: 'cupons', label: 'Cupons de Desconto' },
    { id: 'trocas', label: 'Trocas e Devoluções' },
    { id: 'reembolsos', label: 'Reembolsos' }
  ],
  categorias_loja: [
    { id: 'todas', label: 'Todas' }
  ],
  cupons: [
    { id: 'ativos', label: 'Ativos' },
    { id: 'inativos', label: 'Inativos' }
  ]
};

export function CadastroModule({
  initialTab,
  initialItemId,
  colaboradorId,
  colaboradorNome,
  allowedTabs,
  title = 'Central de Cadastros'
}: {
  initialTab?: string,
  initialItemId?: string,
  colaboradorId?: string,
  colaboradorNome?: string,
  allowedTabs?: MainTab[],
  title?: string
}) {
  const { pendencies } = useAdminNotifications();
  const isAllowedTab = (tab: MainTab) => !allowedTabs || allowedTabs.includes(tab);
  const firstAllowedTab = (allowedTabs?.[0] || 'clientes') as MainTab;

  // Mapeamento inteligente de abas e sub-abas para Deep Linking
  const getInitialState = () => {
    if (!initialTab) return { main: firstAllowedTab, sub: SUB_TABS[firstAllowedTab][0].id };
    
    // Se for uma sub-aba de clientes
    if (['ativos', 'inativos', 'pendentes', 'bloqueados'].includes(initialTab)) {
      return { main: isAllowedTab('clientes') ? 'clientes' as MainTab : firstAllowedTab, sub: isAllowedTab('clientes') ? initialTab : SUB_TABS[firstAllowedTab][0].id };
    }
    
    // Se for uma sub-aba de gsa_store
    if (['analytics', 'precificacao', 'cupons', 'trocas', 'reembolsos'].includes(initialTab)) {
      return { main: isAllowedTab('gsa_store') ? 'gsa_store' as MainTab : firstAllowedTab, sub: isAllowedTab('gsa_store') ? initialTab : SUB_TABS[firstAllowedTab][0].id };
    }
    
    if (initialTab === 'categorias') {
      return { main: isAllowedTab('categorias_loja') ? 'categorias_loja' as MainTab : firstAllowedTab, sub: isAllowedTab('categorias_loja') ? 'todas' : SUB_TABS[firstAllowedTab][0].id };
    }

    // Se for uma aba principal
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
  const [isSubmoduleOpen, setIsSubmoduleOpen] = useState(Boolean(initialTab || initialItemId));

  useEffect(() => {
    if (initialTab) {
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
      id: 'clientes', 
      label: 'Clientes', 
      icon: Users,
      badge: pendencies.cadastro_clientes_inativos + pendencies.cadastro_clientes_bloqueados + pendencies.cadastro_clientes_pendentes
    },
    { id: 'servicos', label: 'Serviços', icon: Scissors },
    { id: 'pacotes', label: 'Pacotes de Serviços', icon: Boxes },
    { id: 'produtos', label: 'Gestão de Produtos', icon: Package },
    { id: 'assinaturas', label: 'Planos e Assinaturas', icon: Zap },
    { id: 'indicacoes', label: 'Indicações', icon: Share2 },
    { 
      id: 'vouchers', 
      label: 'Vouchers', 
      icon: Ticket,
      badge: pendencies.cadastro_vouchers_pendentes
    },
    { 
      id: 'premios', 
      label: 'Prêmios', 
      icon: Trophy,
      badge: pendencies.cadastro_premios_pendentes
    },
    { id: 'promocoes', label: 'Promoções por Quantidade', icon: Tags },
    { id: 'cupons', label: 'Cupons de Desconto', icon: Tag },
    { id: 'categorias_loja', label: 'Categorias Loja', icon: Tag },
    { id: 'gsa_store', label: 'GSA Store Hub', icon: Store },
  ].filter(tab => isAllowedTab(tab.id as MainTab));

  if (!isSubmoduleOpen) {
    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
        <div className="rounded-[2rem] bg-[#1a1a1a] p-5 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">Painel ADM</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">{title}</h1>
            </div>
            <ShieldCheck className="hidden h-10 w-10 text-white/10 sm:block" />
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
                className="group relative min-h-[150px] rounded-3xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-xl"
              >
                {badge > 0 && (
                  <span className="absolute right-4 top-4 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[10px] font-black text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-all group-hover:bg-indigo-600 group-hover:text-white">
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
        className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </button>

      {/* Module Header */}
      <div className="hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-3 md:gap-3">
          <div className="flex flex-row items-center justify-between gap-6 border-b border-white/5 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-6 w-1 bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)]"></div>
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400 whitespace-nowrap overflow-hidden">
                {title}
              </h1>
            </div>
            <ShieldCheck className="hidden md:block h-8 w-8 text-white/5" />
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-1.5 w-full">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <div key={tab.id} className={`relative flex-none font-black translate-y-0 active:translate-y-1 transition-transform ${isActive ? 'z-40' : 'z-10'}`}>
                  <button
                    onClick={() => handleTabClick(tab.id as MainTab)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 md:px-4 rounded-xl transition-all text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest border
                      ${isActive 
                        ? 'bg-white text-indigo-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-indigo-500' 
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
                    <div className="absolute top-full left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 mt-4 z-50 w-[280px] max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in-95 duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-2 flex flex-col gap-1 border border-neutral-100">
                        <div className="px-4 py-2 text-[7px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b border-neutral-100 mb-1">
                          Selecione uma opção
                        </div>
                        {SUB_TABS[activeTab].map((sub, idx) => {
                          let subBadge = 0;
                          if (activeTab === 'clientes') {
                            if (sub.id === 'inativos') subBadge = pendencies.cadastro_clientes_inativos;
                            if (sub.id === 'pendentes') subBadge = pendencies.cadastro_clientes_pendentes;
                            if (sub.id === 'bloqueados') subBadge = pendencies.cadastro_clientes_bloqueados;
                          } else if (activeTab === 'vouchers') {
                            if (sub.id === 'ativos') subBadge = 0; // Vouchers logic
                          } else if (activeTab === 'premios') {
                            if (sub.id === 'pendente') subBadge = pendencies.cadastro_premios_pendentes;
                          }

                          return (
                            <button
                              key={sub.id}
                              onClick={() => handleSubTabClick(sub.id)}
                              style={{ animationDelay: `${idx * 50}ms` }}
                              className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:translate-x-1 border border-transparent ${
                                activeSubTab === sub.id
                                  ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
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
                              {activeSubTab === sub.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200"></div>}
                            </button>
                          );
                        })}
                      </div>
                      {/* Visual Connector */}
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 w-3 h-3 bg-white rotate-45 rounded-sm border-l border-t border-neutral-100"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div key={activeTab + activeSubTab} className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'clientes' && <ClientesModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'servicos' && <ServicosModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'pacotes' && <ServicePackagesModule activeSubTab={activeSubTab as any} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'produtos' && <ProdutosModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'assinaturas' && <AssinaturasModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'indicacoes' && <IndicacoesModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'vouchers' && <VouchersModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'premios' && <PremiosModule activeSubTab={activeSubTab as any} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'promocoes' && <PromocaoQuantidadeModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome || 'Administrador'} />}
        {activeTab === 'cupons' && <CuponsLojaModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'gsa_store' && activeSubTab === 'cupons' && <CuponsLojaModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'gsa_store' && activeSubTab === 'trocas' && <LojaTrocasModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'gsa_store' && activeSubTab === 'reembolsos' && <ReembolsosModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'gsa_store' && activeSubTab === 'analytics' && <EcommerceAnalytics colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'gsa_store' && activeSubTab === 'precificacao' && <PricingPanel colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {activeTab === 'categorias_loja' && <LojaCategoriasModule />}
      </div>
    </div>
  );
}

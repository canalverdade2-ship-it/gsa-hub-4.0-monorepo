import { useState, useEffect } from 'react';
import { Building2, DollarSign, Users } from 'lucide-react';
import { PrestadoresCadastro } from './prestadores/PrestadoresCadastro';
import { PrestadoresFinanceiro } from './prestadores/PrestadoresFinanceiro';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';

interface PrestadoresModuleProps {
  initialTab?: string;
  initialItemId?: string;
  colaboradorId?: string;
  colaboradorNome?: string | null;
}

export function PrestadoresModule({ initialTab, initialItemId, colaboradorId, colaboradorNome }: PrestadoresModuleProps) {
  const { pendencies } = useAdminNotifications();
  const [mainTab, setMainTab] = useState<'cadastro' | 'financeiro'>('cadastro');
  const [activeTab, setActiveTab] = useState(initialTab || 'ativo');
  const [showSubTabs, setShowSubTabs] = useState(false);

  const MAIN_TABS = [
    { id: 'cadastro' as const, label: 'Cadastro', icon: Building2 },
    { id: 'financeiro' as const, label: 'Financeiro', icon: DollarSign },
  ];

  const SUB_TABS: Record<string, { id: string, label: string }[]> = {
    cadastro: [
      { id: 'ativo', label: 'Ativos' },
      { id: 'pendente', label: 'Pendentes' },
      { id: 'desligado', label: 'Desligados' },
      { id: 'promocoes', label: 'Promoções Globais' }
    ],
    financeiro: [
      { id: 'saques', label: 'Solicitações de Saque' }
    ]
  };

  const handleMainTabClick = (tabId: 'cadastro' | 'financeiro') => {
    if (mainTab === tabId) {
      setShowSubTabs(!showSubTabs);
    } else {
      setMainTab(tabId);
      setActiveTab(SUB_TABS[tabId][0].id);
      setShowSubTabs(true);
    }
  };

  const handleSubTabClick = (subId: string) => {
    setActiveTab(subId);
    setShowSubTabs(false);
  };

  useEffect(() => {
    if (initialTab) {
      for (const [main, subs] of Object.entries(SUB_TABS)) {
        if (subs.some(s => s.id === initialTab)) {
          setMainTab(main as any);
          setActiveTab(initialTab);
          break;
        }
      }
    }
  }, [initialTab]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-[#1a1a1a] p-3 md:p-4 rounded-[2rem] md:rounded-[2.5rem] text-white relative shadow-2xl mb-3">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-3 md:gap-3">
          <div className="flex flex-row items-center justify-between gap-6 border-b border-white/5 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-6 w-1 bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)]"></div>
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400 whitespace-nowrap overflow-hidden">
                Rede de Prestadores
              </h1>
            </div>
            <Users className="hidden md:block h-8 w-8 text-white/5" />
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-1.5 w-full">
            {MAIN_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = mainTab === tab.id;
              const badgeCount = tab.id === 'cadastro' ? pendencies.cadastro_prestadores_pendentes : 0;

              return (
                <div key={tab.id} className="relative flex-none font-black translate-y-0 active:translate-y-1 transition-transform">
                  <button
                    onClick={() => handleMainTabClick(tab.id as any)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 md:px-4 rounded-xl transition-all text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest border
                      ${isActive 
                        ? 'bg-white text-indigo-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-indigo-500' 
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {badgeCount > 0 && (
                      <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[8px] font-black text-white ring-2 ring-white/10 animate-pulse">
                        {badgeCount}
                      </span>
                    )}
                  </button>

                  {isActive && showSubTabs && (
                    <div className="absolute top-full left-0 mt-4 z-50 w-72 animate-in fade-in zoom-in-95 duration-200">
                      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 p-2 flex flex-col gap-1 overflow-hidden border border-neutral-100">
                        <div className="px-4 py-2 text-[7px] font-black text-neutral-400 uppercase tracking-[0.2em] border-b border-neutral-100 mb-1">
                          Selecione uma opção
                        </div>
                        {SUB_TABS[mainTab].map((sub, idx) => (
                          <button
                            key={sub.id}
                            onClick={() => handleSubTabClick(sub.id)}
                            style={{ animationDelay: `${idx * 50}ms` }}
                            className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:translate-x-1 border border-transparent ${
                              activeTab === sub.id
                                ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                            }`}
                          >
                            {sub.label}
                            {activeTab === sub.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-200"></div>}
                          </button>
                        ))}
                      </div>
                      <div className="absolute -top-1.5 left-6 w-3 h-3 bg-white rotate-45 rounded-sm border-l border-t border-neutral-100"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div key={mainTab + activeTab} className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {mainTab === 'cadastro' && <PrestadoresCadastro subTab={activeTab} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {mainTab === 'financeiro' && <PrestadoresFinanceiro subTab={activeTab} initialItemId={initialItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
      </div>
    </div>
  );
}

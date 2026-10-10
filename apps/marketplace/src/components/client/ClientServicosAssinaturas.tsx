import { useEffect, useState } from 'react';
import { Briefcase, Calendar, ChevronLeft, FileText, Package } from 'lucide-react';
import { ClientOrcamentos } from './ClientOrcamentos';
import { ClientServicos } from './ClientServicos';
import { ClientProdutos } from './ClientProdutos';
import { ClientAssinaturas } from './ClientAssinaturas';
import { useClientNotifications } from '../../hooks/useClientNotifications';
import { Module } from '../../types';

type ServicosAssinaturasTab = 'orcamentos' | 'servicos' | 'produtos' | 'assinaturas';

interface ClientServicosAssinaturasProps {
  clientId: string;
  initialTab?: string;
  initialItemId?: string;
  onNavigate?: (module: Module, tab?: string, itemId?: string) => void;
}

const normalizeTab = (tab?: string): ServicosAssinaturasTab | undefined => {
  const mainTab = tab?.split('::')[0];
  if (mainTab === 'orcamentos' || mainTab === 'servicos' || mainTab === 'produtos' || mainTab === 'assinaturas') return mainTab;
  return undefined;
};

export function ClientServicosAssinaturas({ clientId, initialTab, initialItemId, onNavigate }: ClientServicosAssinaturasProps) {
  const { pendencies } = useClientNotifications();
  const [activeTab, setActiveTab] = useState<ServicosAssinaturasTab | undefined>(normalizeTab(initialTab));

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  const tabs: Array<{ id: ServicosAssinaturasTab; label: string; icon: any; badge?: number }> = [
    { id: 'orcamentos', label: 'Orçamentos', icon: FileText, badge: pendencies.moduleOrcamentos },
    { id: 'servicos', label: 'Serviços', icon: Briefcase, badge: pendencies.moduleServicos },
    { id: 'produtos', label: 'Produtos', icon: Package, badge: pendencies.moduleProdutos },
    { id: 'assinaturas', label: 'Assinaturas', icon: Calendar, badge: pendencies.moduleAssinaturas },
  ];

  const activeSubmodule = tabs.find(tab => tab.id === activeTab);
  const ActiveIcon = activeSubmodule?.icon;
  const childInitialTab = initialTab?.includes('::') ? initialTab.split('::')[1] : undefined;
  const openSubmodule = (tab: ServicosAssinaturasTab) => {
    setActiveTab(tab);
    onNavigate?.('servicos_assinaturas', tab);
  };

  const backToHome = () => {
    setActiveTab(undefined);
    onNavigate?.('servicos_assinaturas');
  };

  const forwardNavigate = (module: Module, tab?: string, itemId?: string) => {
    onNavigate?.(module, tab, itemId);
  };

  return (
    <div className="space-y-8">
      {!activeTab && (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => onNavigate?.('dashboard')}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </button>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-500">Serviços e Assinaturas</p>
            <h3 className="mt-1 text-xl font-black text-neutral-950">Escolha uma área para acompanhar</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {tabs.map(({ id, label, icon: Icon, badge = 0 }) => (
              <button
                key={id}
                type="button"
                onClick={() => openSubmodule(id)}
                className="group relative flex min-h-[124px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 text-center text-neutral-950 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-lg md:min-h-[140px] md:p-4"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Icon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-black leading-tight sm:text-base">{label}</h4>
                </div>
                {badge > 0 && (
                  <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-black text-white">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab && activeSubmodule && ActiveIcon && (
        <div className="space-y-6">
          <button
            type="button"
            onClick={backToHome}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </button>

          <div className="flex items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <ActiveIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-neutral-950">{activeSubmodule.label}</h2>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orcamentos' && (
        <ClientOrcamentos clientId={clientId} initialTab={childInitialTab} initialItemId={initialItemId} onNavigate={forwardNavigate} />
      )}
      {activeTab === 'servicos' && (
        <ClientServicos clientId={clientId} initialTab={childInitialTab} initialItemId={initialItemId} onNavigate={forwardNavigate} />
      )}
      {activeTab === 'produtos' && (
        <ClientProdutos clientId={clientId} initialTab={childInitialTab} initialItemId={initialItemId} onNavigate={forwardNavigate} />
      )}
      {activeTab === 'assinaturas' && (
        <ClientAssinaturas clientId={clientId} initialTab={childInitialTab} initialItemId={initialItemId} onNavigate={forwardNavigate} />
      )}
    </div>
  );
}

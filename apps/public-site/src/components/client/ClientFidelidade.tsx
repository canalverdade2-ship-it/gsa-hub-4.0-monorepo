import { useState, useEffect } from 'react';
import { ChevronLeft, Crown, Gift, Megaphone, Share2, Star, Ticket, Trophy, Users } from 'lucide-react';
import { Cliente } from '../../types';
import { ClientPontos } from './ClientPontos';
import { ClientVouchers } from './ClientVouchers';
import { ClientPromocoes } from './ClientPromocoes';
import ClientPremios from './ClientPremios';
import { ClientIndiqueGanhe } from './ClientIndiqueGanhe';
import { ClientAreaVIP } from './ClientAreaVIP';
import { ClientAffiliatePanel } from './ClientAffiliatePanel';
import { useClientNotifications } from '../../hooks/useClientNotifications';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { navigate } from '../../routing/navigationService';
import { fetchAffiliateSnapshot } from '../../features/affiliates/service';

type FidelidadeTab = 'pontos' | 'vouchers' | 'promocoes' | 'premios' | 'indique-ganhe' | 'afiliados' | 'area-vip';

interface ClientFidelidadeProps {
  clientId: string;
  cliente: Cliente;
  initialTab?: string;
  initialItemId?: string;
  animateOnMount?: boolean;
  vipModuleConfig?: { ativo: boolean; oculto: boolean };
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

const normalizeTab = (tab?: string): FidelidadeTab | undefined => {
  if (tab === 'area_vip' || tab === 'area-vip') return 'area-vip';
  if (tab === 'indique_ganhe' || tab === 'indique-ganhe') return 'indique-ganhe';
  if (tab === 'pontos' || tab === 'vouchers' || tab === 'promocoes' || tab === 'premios' || tab === 'afiliados') {
    return tab;
  }
  return undefined;
};

export function ClientFidelidade({
  clientId,
  cliente,
  initialTab,
  initialItemId,
  animateOnMount = false,
  vipModuleConfig,
  onNavigate
}: ClientFidelidadeProps) {
  const { pendencies } = useClientNotifications();
  const [activeTab, setActiveTab] = useState<FidelidadeTab | undefined>(normalizeTab(initialTab));

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useRealtimeSubscription(
    [
      { table: 'clientes', filter: clientId ? `id=eq.${clientId}` : undefined },
      { table: 'vouchers', filter: clientId ? `cliente_id=eq.${clientId}` : undefined },
      { table: 'indicacoes', filter: clientId ? `indicador_id=eq.${clientId}` : undefined },
      { table: 'pontos_movimentacoes', filter: clientId ? `cliente_id=eq.${clientId}` : undefined },
      { table: 'system_settings' },
    ],
    [clientId]
  );

  const fidelidadeTabsBase: Array<{ id: FidelidadeTab; label: string; icon: any; badge?: number; locked?: boolean }> = [
    { id: 'pontos', label: 'Pontos', icon: Star },
    { id: 'vouchers', label: 'Vouchers', icon: Ticket, badge: pendencies.moduleVouchers },
    { id: 'promocoes', label: 'Promoções', icon: Megaphone, badge: pendencies.modulePromocoes },
    { id: 'premios', label: 'Prêmios', icon: Trophy },
    { id: 'indique-ganhe', label: 'Indique e Ganhe', icon: Users, badge: pendencies.moduleIndiqueGanhe },
    { id: 'afiliados', label: 'Afiliados GSA', icon: Share2 },
    { id: 'area-vip', label: 'Área VIP', icon: Crown, locked: vipModuleConfig?.oculto || !vipModuleConfig?.ativo },
  ];
  const tabs = fidelidadeTabsBase.filter(tab => !(tab.id === 'area-vip' && vipModuleConfig?.oculto));

  const activeSubmodule = tabs.find(tab => tab.id === activeTab);
  const ActiveIcon = activeSubmodule?.icon;

  const openSubmodule = async (tab: FidelidadeTab) => {
    if (tab === 'afiliados') {
      try {
        const snap = await fetchAffiliateSnapshot();
        if (snap.affiliate && snap.affiliate.nomeDivulgacao && snap.affiliate.nomeDivulgacao.trim().length >= 2) {
          navigate('/afiliados/dashboard');
          return;
        }
      } catch (err) {
        console.warn('[ClientFidelidade] Erro ao verificar snapshot de afiliado:', err);
      }
    }
    setActiveTab(tab);
    onNavigate?.('fidelidade', tab);
  };

  const backToFidelidadeHome = () => {
    setActiveTab(undefined);
    onNavigate?.('fidelidade');
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
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-500">Programa de Fidelidade</p>
            <h3 className="mt-1 text-xl font-black text-neutral-950">Escolha uma área de benefícios</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {tabs.map(({ id, label, icon: Icon, badge = 0, locked }) => (
              <button
                key={id}
                type="button"
                onClick={() => !locked && openSubmodule(id)}
                disabled={locked}
                className={`group relative flex min-h-[124px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border p-3 text-center transition-all md:min-h-[140px] md:p-4 ${
                  locked
                    ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400'
                    : 'border-neutral-200 bg-white text-neutral-950 shadow-sm hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-lg'
                }`}
              >
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${locked ? 'bg-neutral-100 text-neutral-400' : 'bg-indigo-50 text-indigo-600'}`}>
                  <Icon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <h4 className="whitespace-normal text-sm font-black leading-tight sm:text-base">{label}</h4>
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
            onClick={backToFidelidadeHome}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-black text-neutral-700 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </button>

          {activeTab !== 'area-vip' && (
            <div className="flex items-center gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <ActiveIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-neutral-950">{activeSubmodule.label}</h2>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pontos' && <ClientPontos clienteId={clientId} animateOnMount={animateOnMount} initialCliente={cliente} initialItemId={initialItemId} />}
      {activeTab === 'vouchers' && <ClientVouchers clientId={clientId} initialItemId={initialItemId} />}
      {activeTab === 'promocoes' && <ClientPromocoes clientId={clientId} initialItemId={initialItemId} />}
      {activeTab === 'premios' && <ClientPremios clientId={clientId} initialItemId={initialItemId} />}
      {activeTab === 'indique-ganhe' && <ClientIndiqueGanhe clientId={clientId} initialItemId={initialItemId} />}
      {activeTab === 'afiliados' && <ClientAffiliatePanel clientId={clientId} />}
      {activeTab === 'area-vip' && (
        vipModuleConfig?.ativo
          ? <ClientAreaVIP cliente={cliente} initialItemId={initialItemId} />
          : (
            <div className="flex flex-col items-center justify-center rounded-3xl bg-white px-6 py-20 text-center ring-1 ring-neutral-200">
              <Gift className="mb-5 h-12 w-12 text-neutral-300" />
              <h2 className="text-2xl font-black text-neutral-900">Área VIP Indisponível</h2>
              <p className="mt-3 max-w-sm text-neutral-500">O módulo Área VIP está desativado por tempo indeterminado.</p>
            </div>
          )
      )}
    </div>
  );
}

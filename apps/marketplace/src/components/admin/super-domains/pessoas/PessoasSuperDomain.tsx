import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, DollarSign, Briefcase, 
  Sparkles, Gift, ShieldCheck, Clock, CheckCircle2, 
  ArrowUpRight, RefreshCw, UserCheck
} from 'lucide-react';
import { SaquesRepassesSection } from './SaquesRepassesSection';
import { TrabalheConoscoSection } from './TrabalheConoscoSection';
import { AfiliadosSection } from './AfiliadosSection';
import { FidelidadePromocoesSection } from './FidelidadePromocoesSection';
import { useAdminNotifications } from '../../../../hooks/useAdminNotifications';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency } from '../../../../lib/utils';

export type PessoasSuperDomainTab = 
  | 'saques'
  | 'carreiras'
  | 'afiliados'
  | 'fidelidade';

export interface PessoasSuperDomainProps {
  initialTab?: string;
  initialSubTab?: string;
  initialItemId?: string;
  colaboradorId?: string;
  colaboradorNome?: string | null;
}

export function PessoasSuperDomain({
  initialTab,
  initialSubTab,
  initialItemId,
  colaboradorId,
  colaboradorNome
}: PessoasSuperDomainProps) {
  const { pendencies, refreshCounts } = useAdminNotifications();
  const [activeTab, setActiveTab] = useState<PessoasSuperDomainTab>('afiliados');

  // KPI Quick Stats
  const [stats, setStats] = useState({
    saquesPendentesCount: 0,
    candidatosNovos: 0,
    afiliadosAtivos: 0
  });

  // Map incoming URL aliases to SuperDomain tabs
  useEffect(() => {
    if (initialTab) {
      const t = initialTab.toLowerCase().trim();
      if (t === 'pessoas' || t === 'rh' || t === 'afiliados' || t === 'comissoes') {
        setActiveTab('afiliados');
      } else if (t === 'saques' || t === 'financeiro' || t === 'repasses') {
        setActiveTab('saques');
      } else if (t === 'carreiras' || t === 'trabalhe_conosco' || t === 'recrutamento') {
        setActiveTab('carreiras');
      } else if (t === 'fidelidade' || t === 'premios' || t === 'vouchers' || t === 'cupons' || t === 'promocoes') {
        setActiveTab('fidelidade');
      }
    }
  }, [initialTab]);

  // Load KPI metrics
  const fetchDomainMetrics = useCallback(async () => {
    try {
      // 1. Saques pendentes de clientes
      const { count: csCount } = await supabase
        .from('saques')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pendente', 'aguardando', 'em_analise']);

      // 2. Afiliados
      const { count: aCount } = await supabase
        .from('gsa_afiliados')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ativo');

      setStats({
        saquesPendentesCount: csCount || 0,
        candidatosNovos: 0,
        afiliadosAtivos: aCount || 0
      });
    } catch (err) {
      console.error('Erro ao buscar métricas de pessoas:', err);
    }
  }, []);

  useEffect(() => {
    void fetchDomainMetrics();
  }, [fetchDomainMetrics]);

  useRealtimeSubscription([
    { table: 'saques', onChange: fetchDomainMetrics },
    { table: 'gsa_afiliados', onChange: fetchDomainMetrics },
    { table: 'gsa_careers_applications', onChange: fetchDomainMetrics }
  ], [fetchDomainMetrics]);

  const TABS = [
    {
      id: 'saques' as const,
      label: 'Central de Saques & Repasses',
      icon: DollarSign,
      badge: stats.saquesPendentesCount > 0 ? stats.saquesPendentesCount : undefined
    },
    {
      id: 'carreiras' as const,
      label: 'Trabalhe Conosco & Recrutamento',
      icon: Briefcase
    },
    {
      id: 'afiliados' as const,
      label: 'GSA Afiliados & Comissões',
      icon: Sparkles
    },
    {
      id: 'fidelidade' as const,
      label: 'Fidelidade, Prêmios & Cupons',
      icon: Gift
    }
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Enterprise Light Domain Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Users className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-indigo-700">
                  Super-Domínio 3
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-semibold text-slate-500">Relacionamento, carreiras e fidelidade</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
                Pessoas & Relacionamento
              </h1>
            </div>
          </div>

          {/* Quick Domain Metrics Cockpit */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className={`rounded-xl border px-3.5 py-2 ${
              stats.saquesPendentesCount > 0
                ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                : 'border-slate-200 bg-slate-50/80 text-slate-900'
            }`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Repasses Pendentes</span>
              <div className="font-mono font-bold text-sm tabular-nums">
                {stats.saquesPendentesCount}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Afiliados Ativos</span>
              <div className="font-mono font-bold text-sm text-slate-900 tabular-nums">
                {stats.afiliadosAtivos}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                    isActive ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab View Host */}
      <div className="min-h-[500px]">
        {activeTab === 'saques' && (
          <SaquesRepassesSection
            initialItemId={initialItemId}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
          />
        )}

        {activeTab === 'carreiras' && (
          <TrabalheConoscoSection
            initialItemId={initialItemId}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
          />
        )}

        {activeTab === 'afiliados' && (
          <AfiliadosSection
            initialSubTab={initialSubTab}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
          />
        )}

        {activeTab === 'fidelidade' && (
          <FidelidadePromocoesSection
            initialSubTab={initialSubTab}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
          />
        )}
      </div>
    </div>
  );
}

export default PessoasSuperDomain;

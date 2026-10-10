import React, { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, Receipt, Gavel, FileText, ArrowDownCircle, Repeat2,
  TrendingUp, Calculator, ShieldCheck, DollarSign, Clock, AlertTriangle,
  CheckCircle2, Sparkles, Plus, RefreshCw, BarChart3, Layers
} from 'lucide-react';
import { useAdminNotifications } from '../../../../hooks/useAdminNotifications';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency } from '../../../../lib/utils';
import { FaturamentoView } from './FaturamentoView';
import { FluxoCaixaView } from './FluxoCaixaView';
import { CobrancaView } from './CobrancaView';
import { FiscalView } from './FiscalView';
import { RentabilidadeReembolsosView } from './RentabilidadeReembolsosView';
import { CalculadorasGatewayView } from './CalculadorasGatewayView';

export type FinanceiroSuperDomainTab = 
  | 'faturamento'
  | 'fluxo_caixa'
  | 'cobranca'
  | 'fiscal'
  | 'rentabilidade_reembolsos'
  | 'calculadoras_gateway';

export interface FinanceiroSuperDomainProps {
  initialTab?: string;
  initialSubTab?: string;
  initialItemId?: string;
  allowedTabs?: string[];
  adminType?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
  onNavigate?: (domain: string, tab?: string, itemId?: string) => void;
}

export function FinanceiroSuperDomain({
  initialTab,
  initialSubTab,
  initialItemId,
  allowedTabs,
  colaboradorId,
  colaboradorNome,
  onNavigate
}: FinanceiroSuperDomainProps) {
  const { pendencies } = useAdminNotifications();

  // Normalize initialTab
  const getNormalizedTab = (tab?: string): FinanceiroSuperDomainTab => {
    if (!tab) return 'faturamento';
    if (['faturamento', 'faturas', 'pendentes', 'pagos', 'cancelados'].includes(tab)) return 'faturamento';
    if (['fluxo_caixa', 'saques', 'transferencias', 'caixa'].includes(tab)) return 'fluxo_caixa';
    if (['cobranca', 'inadimplencia', 'acordos', 'protestos'].includes(tab)) return 'cobranca';
    if (['fiscal', 'nfe', 'notas'].includes(tab)) return 'fiscal';
    if (['rentabilidade_reembolsos', 'rentabilidade', 'reembolsos'].includes(tab)) return 'rentabilidade_reembolsos';
    if (['calculadoras_gateway', 'calculadoras', 'gateway'].includes(tab)) return 'calculadoras_gateway';
    return 'faturamento';
  };

  const [activeTab, setActiveTab] = useState<FinanceiroSuperDomainTab>(() => getNormalizedTab(initialTab));

  // Sync when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(getNormalizedTab(initialTab));
    }
  }, [initialTab]);

  // Telemetry KPIs
  const [telemetry, setTelemetry] = useState<{
    faturasAbertasValor: number;
    faturasAbertasQtd: number;
    saquesPendentesQtd: number;
    cobrancaQtd: number;
    fiscalPendenteQtd: number;
  }>({
    faturasAbertasValor: 0,
    faturasAbertasQtd: 0,
    saquesPendentesQtd: 0,
    cobrancaQtd: 0,
    fiscalPendenteQtd: 0
  });

  const fetchTelemetry = async () => {
    try {
      const [faturasRes, saquesRes, cobrancasRes, fiscalRes] = await Promise.all([
        supabase.from('faturas').select('valor_total').in('status', ['pendente', 'vencida', 'pendente_pagamento', 'revisada']),
        supabase.from('saques').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('cobrancas').select('id', { count: 'exact', head: true }).neq('status', 'quitado'),
        supabase.from('ordens_fiscais').select('id', { count: 'exact', head: true }).eq('status_emissao', 'pendente_emissao')
      ]);

      const faturasList = faturasRes.data || [];
      const totalValorAberto = faturasList.reduce((acc, f) => acc + Number(f.valor_total || 0), 0);

      setTelemetry({
        faturasAbertasValor: totalValorAberto,
        faturasAbertasQtd: faturasList.length,
        saquesPendentesQtd: saquesRes.count || 0,
        cobrancaQtd: cobrancasRes.count || 0,
        fiscalPendenteQtd: fiscalRes.count || 0
      });
    } catch (err) {
      console.error('Erro ao buscar telemetria financeira:', err);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  useRealtimeSubscription([
    { table: 'faturas', onChange: fetchTelemetry },
    { table: 'saques', onChange: fetchTelemetry },
    { table: 'cobrancas', onChange: fetchTelemetry },
    { table: 'ordens_fiscais', onChange: fetchTelemetry }
  ]);

  const domainTabs = [
    {
      id: 'faturamento' as FinanceiroSuperDomainTab,
      label: 'Faturamento & Faturas',
      icon: Receipt,
      badge: telemetry.faturasAbertasQtd || (pendencies.financeiro_faturas_pendentes + pendencies.financeiro_faturas_vencidas),
      badgeColor: 'amber'
    },
    {
      id: 'fluxo_caixa' as FinanceiroSuperDomainTab,
      label: 'Fluxo de Caixa & Saques',
      icon: ArrowDownCircle,
      badge: telemetry.saquesPendentesQtd || pendencies.financeiro_saques_pendentes,
      badgeColor: 'emerald'
    },
    {
      id: 'cobranca' as FinanceiroSuperDomainTab,
      label: 'Cobrança & Inadimplência',
      icon: Gavel,
      badge: telemetry.cobrancaQtd || pendencies.moduleCobranca,
      badgeColor: 'rose'
    },
    {
      id: 'fiscal' as FinanceiroSuperDomainTab,
      label: 'Módulo Fiscal & NF-e',
      icon: FileText,
      badge: telemetry.fiscalPendenteQtd || pendencies.moduleFiscal,
      badgeColor: 'blue'
    },
    {
      id: 'rentabilidade_reembolsos' as FinanceiroSuperDomainTab,
      label: 'Rentabilidade & Reembolsos',
      icon: TrendingUp,
      badge: 0,
      badgeColor: 'slate'
    },
    {
      id: 'calculadoras_gateway' as FinanceiroSuperDomainTab,
      label: 'Calculadoras Pro & Gateway',
      icon: Calculator,
      badge: 0,
      badgeColor: 'slate'
    }
  ];

  return (
    <div className="flex flex-col w-full space-y-5">
      {/* ══════════════════════════════════════════════════════════
          SUPER-DOMAIN 2 MISSION CONTROL HEADER (ENTERPRISE LIGHT)
          ══════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Micro-Header */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80">
                Super-Domínio Financeiro (SD2)
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">
                GSA OS v9.10
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 mt-1 flex items-center gap-2.5">
              <Landmark className="h-6 w-6 text-emerald-600 shrink-0" />
              <span>Gestão Financeira & Faturamento</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Central unificada de recebíveis, conciliação bancária, liquidações administrativas, esteira de cobrança e emissão fiscal.
            </p>
          </div>

          {/* Realtime KPI Cockpit */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Recebíveis Abertos</span>
              <span className="text-xs font-mono font-black text-slate-900">
                {formatCurrency(telemetry.faturasAbertasValor)}
              </span>
              <div className="text-[10px] text-slate-400 font-mono">
                {telemetry.faturasAbertasQtd} títulos
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Saques em Fila</span>
              <span className="text-xs font-mono font-black text-emerald-700">
                {telemetry.saquesPendentesQtd} pendentes
              </span>
              <div className="text-[10px] text-emerald-600 font-semibold">
                Liberação PIX
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Inadimplência</span>
              <span className="text-xs font-mono font-black text-rose-700">
                {telemetry.cobrancaQtd} em régua
              </span>
              <div className="text-[10px] text-rose-600 font-semibold">
                Ações ativas
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Fiscal Pendente</span>
              <span className="text-xs font-mono font-black text-indigo-700">
                {telemetry.fiscalPendenteQtd} notas
              </span>
              <div className="text-[10px] text-indigo-600 font-semibold">
                NF-e / NFS-e
              </div>
            </div>
          </div>
        </div>

        {/* ── Super-Domain Navigation Ribbon ── */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
          {domainTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 shrink-0 select-none ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isActive
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-300 text-slate-800'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ACTIVE SUB-VIEW CONTAINER
          ══════════════════════════════════════════════════════════ */}
      <div className="w-full">
        {activeTab === 'faturamento' && (
          <FaturamentoView
            initialItemId={initialItemId}
            onNavigateTab={(domainTab, subTab, itemId) => {
              if (onNavigate) onNavigate(domainTab, subTab, itemId);
            }}
            colaboradorNome={colaboradorNome}
            colaboradorId={colaboradorId}
          />
        )}

        {activeTab === 'fluxo_caixa' && (
          <FluxoCaixaView
            initialSubTab={initialSubTab as any}
            initialItemId={initialItemId}
            colaboradorNome={colaboradorNome}
            colaboradorId={colaboradorId}
          />
        )}

        {activeTab === 'cobranca' && (
          <CobrancaView
            initialItemId={initialItemId}
            colaboradorNome={colaboradorNome}
            colaboradorId={colaboradorId}
            onNavigateTab={(tab, subTab, itemId) => {
              if (onNavigate) onNavigate(tab, subTab, itemId);
            }}
          />
        )}

        {activeTab === 'fiscal' && (
          <FiscalView
            initialItemId={initialItemId}
            colaboradorNome={colaboradorNome}
            colaboradorId={colaboradorId}
          />
        )}

        {activeTab === 'rentabilidade_reembolsos' && (
          <RentabilidadeReembolsosView
            initialSubTab={initialSubTab as any}
            colaboradorNome={colaboradorNome}
            colaboradorId={colaboradorId}
          />
        )}

        {activeTab === 'calculadoras_gateway' && (
          <CalculadorasGatewayView
            initialSubTab={initialSubTab as any}
            colaboradorNome={colaboradorNome}
            colaboradorId={colaboradorId}
          />
        )}
      </div>
    </div>
  );
}

export default FinanceiroSuperDomain;

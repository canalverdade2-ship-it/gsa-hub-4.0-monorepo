import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, ClipboardList, Layers, ShoppingBag, 
  Package, Plane, Megaphone, Bot, Sparkles, 
  CheckCircle2, Clock, AlertTriangle, TrendingUp, RefreshCw
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { useAdminNotifications } from '../../../../hooks/useAdminNotifications';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { OrcamentosWorkstation } from './OrcamentosWorkstation';
import { OrdensServicoWorkstation } from './OrdensServicoWorkstation';
import { DemandasWorkstation } from './DemandasWorkstation';
import { ComprasAssinaturasWorkstation } from './ComprasAssinaturasWorkstation';
import { CatalogoSubDomain } from './CatalogoSubDomain';
import { ViagensSubDomain } from './ViagensSubDomain';
import { MidiaOperacoesSubDomain } from './MidiaOperacoesSubDomain';
import { AutomacaoOperacoesSubDomain } from './AutomacaoOperacoesSubDomain';
import { OperacoesMainTab, OperacoesSuperDomainProps, OperationalMetrics } from './types';
import { StatusBadge } from '../shared';
import clsx from 'clsx';

export function OperacoesSuperDomain({
  adminType = 'admin',
  colaboradorId,
  colaboradorNome,
  activeSubTab,
  initialItemId,
  onNavigate,
  title = 'Operações & Orçamentos'
}: OperacoesSuperDomainProps) {
  const { pendencies } = useAdminNotifications();

  // Normalize initial tab
  const getInitialTab = (): { main: OperacoesMainTab; sub?: string } => {
    if (!activeSubTab) return { main: 'orcamentos', sub: 'abertos' };

    const tab = activeSubTab.toLowerCase();

    if (['orcamentos', 'abertos', 'analise', 'aprovados', 'cancelados'].includes(tab)) {
      return { main: 'orcamentos', sub: tab };
    }
    if (['os', 'andamento', 'concluidas', 'canceladas'].includes(tab)) {
      return { main: 'os', sub: tab };
    }
    if (['demandas', 'abertas', 'ativas', 'suporte'].includes(tab)) {
      return { main: 'demandas', sub: tab };
    }
    if (['compras', 'processamento', 'compras_assinaturas'].includes(tab)) {
      return { main: 'compras', sub: tab };
    }
    if (['catalogo', 'produtos', 'servicos', 'pacotes', 'categorias'].includes(tab)) {
      return { main: 'catalogo', sub: tab };
    }
    if (['viagens', 'turismo'].includes(tab)) {
      return { main: 'viagens', sub: tab };
    }
    if (['midia', 'classificados', 'publicidade', 'anuncios', 'campanhas', 'tv'].includes(tab)) {
      return { main: 'midia', sub: tab };
    }
    if (['automacao', 'scraping', 'shopee'].includes(tab)) {
      return { main: 'automacao', sub: tab };
    }

    return { main: 'orcamentos', sub: tab };
  };

  const initial = useMemo(() => getInitialTab(), []);
  const [activeMainTab, setActiveMainTab] = useState<OperacoesMainTab>(initial.main);
  const [activeSub, setActiveSub] = useState<string | undefined>(initial.sub);

  useEffect(() => {
    if (activeSubTab) {
      const parsed = getInitialTab();
      setActiveMainTab(parsed.main);
      setActiveSub(parsed.sub);
    }
  }, [activeSubTab]);

  // Operational Live Metrics State
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalOrcamentosAbertos: 0,
    totalOsAndamento: 0,
    totalDemandasAbertas: 0,
    totalComprasProcessamento: 0,
    totalNegociacoesPendentes: 0
  });

  const fetchLiveMetrics = async () => {
    try {
      const [orcRes, osRes, demRes, compRes] = await Promise.all([
        supabase.from('orcamentos').select('id, status', { count: 'exact', head: false }),
        supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).eq('status', 'andamento'),
        supabase.from('prestador_demandas').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'em_andamento']),
        supabase.from('ordens_compra').select('id', { count: 'exact', head: true }).eq('status', 'processamento')
      ]);

      const orcList = orcRes.data || [];
      const abertos = orcList.filter(o => o.status === 'aberto' || o.status === 'em revisão').length;
      const negociacoes = orcList.filter(o => o.status === 'negociação').length;

      setMetrics({
        totalOrcamentosAbertos: abertos,
        totalOsAndamento: osRes.count || 0,
        totalDemandasAbertas: demRes.count || 0,
        totalComprasProcessamento: compRes.count || 0,
        totalNegociacoesPendentes: negociacoes
      });
    } catch (err) {
      console.warn('Falha ao obter telemetria operacional:', err);
    }
  };

  useEffect(() => {
    void fetchLiveMetrics();
  }, []);

  useRealtimeSubscription([
    { table: 'orcamentos', onChange: fetchLiveMetrics, debounceMs: 400 },
    { table: 'ordens_servico', onChange: fetchLiveMetrics, debounceMs: 400 },
    { table: 'prestador_demandas', onChange: fetchLiveMetrics, debounceMs: 400 },
    { table: 'ordens_compra', onChange: fetchLiveMetrics, debounceMs: 400 },
  ]);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* ══════════════════════════════════════════════════════
          TOP COMMAND BANNER (Enterprise Light)
          ══════════════════════════════════════════════════════ */}
      <div className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                SD1 • OPERAÇÕES & ORÇAMENTOS
              </span>
              <StatusBadge status="online" size="xs">
                CENTRAL ATIVA
              </StatusBadge>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Gestão de orçamentos, ordens de serviço, despacho operacional, catálogo integrado e automações
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 custom-scrollbar">
            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">
                  Orçamentos
                </span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {metrics.totalOrcamentosAbertos}
                  {metrics.totalNegociacoesPendentes > 0 && (
                    <span className="text-[10px] text-amber-600 font-semibold ml-1">
                      (+{metrics.totalNegociacoesPendentes} neg.)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">
                  OS Ativas
                </span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {metrics.totalOsAndamento}
                </span>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">
                  Demandas
                </span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {metrics.totalDemandasAbertas}
                </span>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">
                  Compras
                </span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  {metrics.totalComprasProcessamento}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            SUPER-DOMAIN NAVIGATION TABS
            ══════════════════════════════════════════════════════ */}
        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-4 overflow-x-auto custom-scrollbar">
          {[
            { id: 'orcamentos', label: 'Orçamentos & Cotações', icon: FileText, badge: metrics.totalOrcamentosAbertos || undefined },
            { id: 'os', label: 'Ordens de Serviço', icon: ClipboardList, badge: metrics.totalOsAndamento || undefined },
            { id: 'demandas', label: 'Demandas & Kanban', icon: Layers, badge: metrics.totalDemandasAbertas || undefined },
            { id: 'compras', label: 'Compras & Assinaturas', icon: ShoppingBag, badge: metrics.totalComprasProcessamento || undefined },
            { id: 'catalogo', label: 'Catálogo de Ofertas', icon: Package },
            { id: 'viagens', label: 'Viagens GSA', icon: Plane },
            { id: 'midia', label: 'Mídia & Classificados', icon: Megaphone },
            { id: 'automacao', label: 'Automação & Scraping', icon: Bot }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeMainTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveMainTab(tab.id as OperacoesMainTab);
                  setActiveSub(undefined);
                }}
                className={clsx(
                  'px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap select-none shrink-0',
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                )}
              >
                <Icon className={clsx('h-3.5 w-3.5', isActive ? 'text-indigo-400' : 'text-slate-400')} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={clsx(
                      'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold',
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ACTIVE WORKSTATION VIEW
          ══════════════════════════════════════════════════════ */}
      <div className="w-full">
        {activeMainTab === 'orcamentos' && (
          <OrcamentosWorkstation
            activeSubTab={activeSub}
            initialItemId={initialItemId}
            adminType={adminType}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
            onNavigate={onNavigate}
          />
        )}

        {activeMainTab === 'os' && (
          <OrdensServicoWorkstation
            activeSubTab={activeSub}
            initialItemId={initialItemId}
            adminType={adminType}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
            onNavigate={onNavigate}
          />
        )}

        {activeMainTab === 'demandas' && (
          <DemandasWorkstation
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
            adminType={adminType}
            initialItemId={initialItemId}
            initialTab={activeSub}
            onNavigate={onNavigate}
          />
        )}

        {activeMainTab === 'compras' && (
          <ComprasAssinaturasWorkstation
            activeSubTab={activeSub}
            initialItemId={initialItemId}
            colaboradorNome={colaboradorNome}
            onNavigate={onNavigate}
          />
        )}

        {activeMainTab === 'catalogo' && (
          <CatalogoSubDomain
            activeSubTab={activeSub}
            initialItemId={initialItemId}
            adminType={adminType}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
          />
        )}

        {activeMainTab === 'viagens' && (
          <ViagensSubDomain
            initialItemId={initialItemId}
          />
        )}

        {activeMainTab === 'midia' && (
          <MidiaOperacoesSubDomain
            activeSubTab={activeSub}
            initialItemId={initialItemId}
            adminType={adminType}
            colaboradorNome={colaboradorNome}
          />
        )}

        {activeMainTab === 'automacao' && (
          <AutomacaoOperacoesSubDomain
            activeSubTab={activeSub}
          />
        )}
      </div>
    </div>
  );
}

export default OperacoesSuperDomain;

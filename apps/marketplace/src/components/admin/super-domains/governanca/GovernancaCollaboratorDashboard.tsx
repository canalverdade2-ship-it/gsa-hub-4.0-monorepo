import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Gavel,
  Landmark,
  MessageSquare,
  Receipt,
  Server,
  Settings,
  Users,
  Wallet,
  Clock,
  ArrowRight,
  UserCheck,
  Calendar,
  Layers
} from 'lucide-react';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../../../lib/utils';
import { normalizeGrantedAdminModules } from '../../../../routing/adminAccess';
import { StatusBadge, CommandSlideOver } from '../shared';
import { CollaboratorDashboardSnapshot } from './types';

interface GovernancaCollaboratorDashboardProps {
  colaboradorId?: string;
  colaboradorNome?: string;
  colaboradorModulos?: string[];
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

type MetricItem = {
  id: string;
  label: string;
  value: string;
  helper: string;
  icon: typeof Users;
  module: string;
  tab?: string;
  variant?: 'emerald' | 'amber' | 'blue' | 'indigo' | 'slate';
};

const MODULE_TABLES: Record<string, string[]> = {
  cadastro: ['clientes', 'cliente_documentos'],
  prestadores: ['prestadores', 'prestador_documentos'],
  operacoes: ['orcamentos', 'ordens_servico', 'ordens_compra', 'ordens_assinatura'],
  demandas: ['prestador_demandas', 'prestador_demandas_historico'],
  financeiro: ['faturas', 'saques', 'transferencias', 'prestador_saques'],
  cobranca: ['cobrancas'],
  fiscal: ['ordens_fiscais'],
  atendimento: ['tickets', 'ticket_mensagens'],
};

export function GovernancaCollaboratorDashboard({
  colaboradorId,
  colaboradorNome,
  colaboradorModulos = [],
  onNavigate,
}: GovernancaCollaboratorDashboardProps) {
  const modules = useMemo(() => normalizeGrantedAdminModules(colaboradorModulos), [colaboradorModulos]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [assignedDemands, setAssignedDemands] = useState<any[]>([]);

  // Selected demand for deep slideover inspection
  const [selectedDemand, setSelectedDemand] = useState<any | null>(null);

  const has = useCallback((permission: string) => modules.includes(permission as any), [modules]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await callAdminRpc<CollaboratorDashboardSnapshot>('gsa_collaborator_dashboard_snapshot');
      setMetrics(snapshot?.metrics || {});
      setAmounts(snapshot?.amounts || {});
      setAssignedDemands(Array.isArray(snapshot?.assigned_demands) ? snapshot.assigned_demands : []);
    } catch (error) {
      console.error('Erro ao carregar painel do colaborador:', error);
      setMetrics({});
      setAmounts({});
      setAssignedDemands([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const tables = [...new Set(modules.flatMap((module) => MODULE_TABLES[module] || []))];
    if (tables.length === 0) return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void fetchData();
      }, 500);
    };
    const channel = supabase.channel(`collaborator-dashboard-${colaboradorId || 'unknown'}`);
    tables.forEach((table) =>
      (channel as any).on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
    );
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel).catch(console.error);
    };
  }, [colaboradorId, fetchData, modules]);

  const cards: MetricItem[] = [
    has('cadastro') && {
      id: 'clientes',
      label: 'Clientes Ativos',
      value: String(metrics.clientes || 0),
      helper: `${metrics.cadastrosPendentes || 0} cadastros para revisar`,
      icon: Users,
      module: 'cadastro',
      tab: 'clientes',
      variant: 'blue' as const,
    },
    (has('prestadores') || has('cadastro')) && {
      id: 'prestadores',
      label: 'Prestadores Pendentes',
      value: String(metrics.prestadoresPendentes || 0),
      helper: 'Aguardando validação cadastral',
      icon: BriefcaseBusiness,
      module: 'prestadores',
      variant: 'amber' as const,
    },
    has('operacoes') && {
      id: 'orcamentos',
      label: 'Orçamentos Pendentes',
      value: String(metrics.orcamentos || 0),
      helper: `${metrics.ordens || 0} ordens de serviço ativas`,
      icon: ClipboardList,
      module: 'operacoes',
      tab: 'orcamentos',
      variant: 'indigo' as const,
    },
    has('demandas') && {
      id: 'demandas',
      label: 'Minhas Demandas',
      value: String(metrics.demandas || 0),
      helper: 'Itens designados a você',
      icon: CheckCircle2,
      module: 'demandas',
      variant: 'emerald' as const,
    },
    has('financeiro') && {
      id: 'faturas',
      label: 'Faturas Pendentes',
      value: String(metrics.faturas || 0),
      helper: `${metrics.saques || 0} saques aguardando`,
      icon: Wallet,
      module: 'financeiro',
      tab: 'em_aberto',
      variant: 'amber' as const,
    },
    has('cobranca') && {
      id: 'cobrancas',
      label: 'Cobranças Prioritárias',
      value: String(metrics.cobrancas || 0),
      helper: 'Recuperação de crédito',
      icon: Gavel,
      module: 'cobranca',
      tab: 'fila',
      variant: 'slate' as const,
    },
    has('atendimento') && {
      id: 'tickets',
      label: 'Tickets Abertos',
      value: String(metrics.tickets || 0),
      helper: 'Suporte ao cliente',
      icon: MessageSquare,
      module: 'atendimento',
      tab: 'abertos',
      variant: 'indigo' as const,
    },
    has('fiscal') && {
      id: 'fiscal',
      label: 'Pendências Fiscais',
      value: String(metrics.fiscal || 0),
      helper: 'Notas fiscais a emitir',
      icon: Receipt,
      module: 'fiscal',
      variant: 'amber' as const,
    },
    has('relatorios') && {
      id: 'relatorios',
      label: 'Relatórios',
      value: 'Acessar BI',
      helper: 'Métricas autorizadas',
      icon: BarChart3,
      module: 'relatorios',
      variant: 'blue' as const,
    },
    has('configuracoes') && {
      id: 'configuracoes',
      label: 'Configurações',
      value: 'Acessar',
      helper: 'Preferências do sistema',
      icon: Settings,
      module: 'configuracoes',
      variant: 'slate' as const,
    },
    has('sistema') && {
      id: 'sistema',
      label: 'Infraestrutura',
      value: 'Monitorar',
      helper: 'Serviços e integrações',
      icon: Server,
      module: 'sistema',
      variant: 'emerald' as const,
    },
  ].filter(Boolean) as MetricItem[];

  return (
    <div className="space-y-6 pb-10">
      {/* ── Welcome Header (Enterprise Light) ── */}
      <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 md:p-8 text-white shadow-md border border-slate-800">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-indigo-400" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
              Posto Operacional Individual
            </p>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Olá, {colaboradorNome || 'Colaborador GSA'}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
            Este cockpit consolida suas demandas ativas e exibe apenas os módulos e indicadores compatíveis com as permissões atribuídas ao seu perfil.
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Sessão sincronizada em {formatDateTime(new Date().toISOString())}</span>
          </div>
        </div>
      </header>

      {/* ── Metric Cards Grid ── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl bg-white border border-slate-200" />
          ))}
        </div>
      ) : cards.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate?.(card.module, card.tab)}
                className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[10px] font-mono font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">
                    {card.module}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 tracking-tight">
                    {card.value}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 truncate">{card.helper}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Nenhum módulo operacional atribuído.</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Entre em contato com o administrador para solicitar permissões específicas para seu cargo.
            </p>
          </div>
        </div>
      )}

      {/* ── Assigned Demands Queue ── */}
      {has('demandas') && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Demandas Operacionais Atribuídas
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fila de execução prioritária vinculada ao seu usuário
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('demandas')}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs"
            >
              Abrir Quadro Completo
            </button>
          </div>

          <div className="p-4 divide-y divide-slate-100">
            {assignedDemands.length > 0 ? (
              assignedDemands.map((demand) => (
                <div
                  key={demand.id}
                  onClick={() => setSelectedDemand(demand)}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-3 rounded-lg transition-colors cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {demand.titulo || demand.ordem_servico?.codigo_os || 'Demanda Sem Título'}
                      </p>
                      <StatusBadge status={demand.status || 'aberto'} size="xs" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Cliente: {demand.ordem_servico?.cliente?.nome || 'Atendimento Interno'} · Categoria: {demand.categoria || 'Geral'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Prioridade {demand.prioridade || 'Normal'}
                      </span>
                      <span className="text-xs font-medium text-slate-600">
                        {demand.prazo_limite ? `Prazo: ${formatDate(demand.prazo_limite)}` : 'Sem prazo'}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-semibold text-slate-600">Nenhuma demanda pendente no momento.</p>
                <p className="text-xs text-slate-400 mt-1">Sua fila de tarefas atribuídas está vazia.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Demand Inspection SlideOver ── */}
      <CommandSlideOver
        isOpen={Boolean(selectedDemand)}
        onClose={() => setSelectedDemand(null)}
        title={selectedDemand?.titulo || selectedDemand?.ordem_servico?.codigo_os || 'Detalhes da Demanda'}
        subtitle={`OS: ${selectedDemand?.ordem_servico?.codigo_os || 'Interna'} · Protocolo #${selectedDemand?.id?.slice(0, 8)}`}
        badge={selectedDemand ? <StatusBadge status={selectedDemand.status} /> : undefined}
        primaryAction={{
          label: 'Abrir no Módulo de Demandas',
          onClick: () => {
            const id = selectedDemand?.id;
            setSelectedDemand(null);
            onNavigate?.('demandas', undefined, id);
          }
        }}
      >
        {selectedDemand && (
          <div className="space-y-5 text-sm">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Resumo da Demanda
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Status:</span>
                  <span className="font-bold text-slate-800">{selectedDemand.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Prioridade:</span>
                  <span className="font-bold text-slate-800 uppercase">{selectedDemand.prioridade || 'Normal'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Prazo Limite:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {selectedDemand.prazo_limite ? formatDateTime(selectedDemand.prazo_limite) : 'Não definido'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Cliente:</span>
                  <span className="font-bold text-slate-800">
                    {selectedDemand.ordem_servico?.cliente?.nome || 'Atendimento Geral'}
                  </span>
                </div>
              </div>
            </div>

            {selectedDemand.descricao && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Descrição / Instruções
                </h4>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {selectedDemand.descricao}
                </p>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

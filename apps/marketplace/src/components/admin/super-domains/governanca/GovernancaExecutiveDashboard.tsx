import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  FileText,
  Landmark,
  MessageSquare,
  RefreshCcw,
  TrendingUp,
  Users,
  Wallet,
  ClipboardList,
  Crown,
  Share2,
  Layers,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  Clock,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { formatCurrency, formatDate, formatDateTime } from '../../../../lib/utils';
import { useAdminNotifications } from '../../../../hooks/useAdminNotifications';
import { AdminDomainCard } from '../../ui/AdminDomainCard';
import { AdminActivityFeed } from '../../ui/AdminActivityFeed';
import { StatusBadge, CommandSlideOver } from '../shared';
import { DashboardSnapshot, DashboardStats, DashboardLists } from './types';

interface GovernancaExecutiveDashboardProps {
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
  adminType?: 'admin' | 'colaborador';
  colaboradorId?: string;
  colaboradorNome?: string;
}

const emptySnapshot: DashboardSnapshot = {
  permissions: {},
  stats: {
    faturamento_seis_meses: 0,
    faturamento_mes_atual: 0,
    faturamento_mes_anterior: 0,
    clientes_total: 0,
    promocoes_ativas: 0,
    credito_pendente_total: 0,
  },
  lists: {},
};

export function GovernancaExecutiveDashboard({
  onNavigate,
  adminType = 'admin',
  colaboradorNome,
}: GovernancaExecutiveDashboardProps) {
  const { pendencies, notifications, refreshCounts } = useAdminNotifications();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Inspector SlideOver state
  const [inspectedItem, setInspectedItem] = useState<{
    type: 'fatura' | 'saque' | 'orcamento';
    data: any;
  } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await callAdminRpc<DashboardSnapshot>('gsa_admin_dashboard_snapshot');
      setSnapshot({
        permissions: data?.permissions || {},
        stats: { ...emptySnapshot.stats, ...(data?.stats || {}) },
        lists: data?.lists || {},
      });
    } catch (error: any) {
      const errorMsg = String(error?.message || '').toLowerCase();
      const isAuthError =
        error?.code === '42501' ||
        error?.status === 401 ||
        errorMsg.includes('sessão administrativa') ||
        errorMsg.includes('sessao administrativa') ||
        errorMsg.includes('expirada');
      if (!isAuthError) {
        console.error('Erro ao carregar dashboard executivo:', error);
        toast.error(error?.message || 'Não foi possível carregar o dashboard executivo.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Supabase Realtime — refresh on key table changes
  useRealtimeSubscription([
    { table: 'clientes', onChange: () => void load(true) },
    { table: 'faturas', onChange: () => void load(true) },
    { table: 'saques', onChange: () => void load(true) },
    { table: 'prestador_demandas', onChange: () => void load(true) },
    { table: 'ordens_servico', onChange: () => void load(true) },
    { table: 'colaboradores', onChange: () => void load(true) },
    { table: 'sistema_logs', onChange: () => void load(true) }
  ]);

  const trend = useMemo(() => {
    const current = Number(snapshot.stats.faturamento_mes_atual || 0);
    const previous = Number(snapshot.stats.faturamento_mes_anterior || 0);
    if (previous <= 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }, [snapshot.stats.faturamento_mes_anterior, snapshot.stats.faturamento_mes_atual]);

  const refresh = async () => {
    await Promise.all([load(true), refreshCounts()]);
  };

  const markInvoicePaid = async (invoice: any) => {
    if (!invoice?.id) return;
    setProcessingId(invoice.id);
    try {
      const result = await callAdminRpc<any>('gsa_admin_baixar_fatura', {
        p_fatura_id: invoice.id,
        p_metodo: 'manual_dashboard_cockpit',
        p_data_pagamento: new Date().toISOString(),
        p_observacoes: 'Baixa rápida realizada pelo Cockpit de Governança.',
      });
      if (result && result.success === false) {
        throw new Error(result.error || 'Não foi possível baixar a fatura.');
      }
      toast.success('Fatura baixada com sucesso e auditada no sistema.');
      setInspectedItem(null);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao baixar a fatura.');
    } finally {
      setProcessingId(null);
    }
  };

  const approveWithdrawal = async (withdrawal: any) => {
    if (!withdrawal?.id) return;
    setProcessingId(withdrawal.id);
    try {
      const result = await callAdminRpc<any>('gsa_admin_processar_saque', {
        p_saque_id: withdrawal.id,
        p_acao: 'aprovar',
        p_motivo: null,
        p_data_pagamento: new Date().toISOString().split('T')[0],
      });
      if (result && result.success === false) {
        throw new Error(result.error || 'Não foi possível aprovar o saque.');
      }
      toast.success('Saque aprovado com sucesso.');
      setInspectedItem(null);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao aprovar o saque.');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <div className="h-44 animate-pulse rounded-2xl bg-slate-900/10 border border-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl bg-white border border-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    {
      label: 'Faturamento do Mês',
      value: formatCurrency(snapshot.stats.faturamento_mes_atual),
      icon: TrendingUp,
      caption: `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% vs anterior`,
      variant: 'emerald' as const,
      onClick: () => onNavigate?.('financeiro', 'dashboard'),
    },
    {
      label: 'Orçamentos Pendentes',
      value: String(pendencies.vendas_orcamentos_pendentes || 0),
      icon: FileText,
      caption: 'Ação Necessária',
      variant: 'amber' as const,
      onClick: () => onNavigate?.('operacoes', 'orcamentos'),
    },
    {
      label: 'Total de Clientes',
      value: Number(snapshot.stats.clientes_total || 0).toLocaleString('pt-BR'),
      icon: Users,
      caption: 'Base Ativa Cadastrada',
      variant: 'blue' as const,
      onClick: () => onNavigate?.('cadastro', 'clientes'),
    },
    {
      label: 'Tickets em Aberto',
      value: String(pendencies.suporte_tickets_abertos || 0),
      icon: MessageSquare,
      caption: 'Fila de Suporte',
      variant: 'indigo' as const,
      onClick: () => onNavigate?.('atendimento'),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* ── Headline Cockpit Banner (Enterprise Light) ── */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 md:p-8 text-white shadow-md border border-slate-800">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                GSA OS Cockpit Executivo • Missão Crítica
              </p>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Olá, {adminType === 'admin' ? 'Administrador Master' : colaboradorNome || 'Colaborador'}
            </h1>

            {pendencies.total > 0 ? (
              <div className="mt-4 inline-flex items-center gap-3 rounded-xl bg-amber-500/15 border border-amber-400/30 px-4 py-2.5 backdrop-blur-sm">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs font-semibold text-amber-100">
                  Atenção: <span className="font-bold text-white font-mono">{pendencies.total} tarefas</span> aguardando resolução nas filas operacionais.
                </p>
              </div>
            ) : (
              <div className="mt-4 inline-flex items-center gap-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-2.5 backdrop-blur-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-xs font-semibold text-emerald-100">
                  Todas as filas críticas estão limpas e operando no SLA.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2.5 text-xs font-bold text-white transition disabled:opacity-60 shadow-2xs backdrop-blur-sm"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Atualizar Matriz</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Executive KPIs Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="group rounded-xl bg-white p-5 text-left shadow-xs border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between w-full mb-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80">
                  {card.caption}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 tracking-tight">
                  {card.value}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Cockpit Resolution Workstation & Domains ── */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-12">
        {/* Left Column: Rapid Resolution Queues & Operational Domains */}
        <div className="xl:col-span-8 space-y-6">
          {/* Quick Resolution Queues */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Faturas em Atraso */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Faturas em Atraso
                    </h3>
                    <span className="text-[10px] text-slate-400">Fila de recebimento rápido</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pendencies.financeiro_faturas_vencidas > 0 && (
                    <StatusBadge variant="rose" size="xs">
                      {pendencies.financeiro_faturas_vencidas} vencidas
                    </StatusBadge>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate?.('financeiro', 'faturas')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Ver todas
                  </button>
                </div>
              </div>

              <div className="p-3 divide-y divide-slate-100 max-h-[360px] overflow-y-auto custom-scrollbar">
                {(snapshot.lists.faturas || []).length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2 opacity-60" />
                    <p className="text-xs font-semibold text-slate-500">Nenhuma fatura em atraso.</p>
                  </div>
                ) : (
                  (snapshot.lists.faturas || []).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {invoice.cliente_nome || invoice.codigo_fatura || 'Fatura'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Venc.: {formatDate(invoice.data_vencimento)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-bold font-mono text-slate-800">
                          {formatCurrency(invoice.valor_final_pendente ?? invoice.valor_total)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void markInvoicePaid(invoice)}
                          disabled={processingId === invoice.id}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-900 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        >
                          {processingId === invoice.id ? 'Baixando...' : 'Dar baixa'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Aprovação de Saques */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                    <Wallet className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Aprovação de Saques
                    </h3>
                    <span className="text-[10px] text-slate-400">Solicitações de PIX</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {pendencies.financeiro_saques_pendentes > 0 && (
                    <StatusBadge variant="amber" size="xs">
                      {pendencies.financeiro_saques_pendentes} pendentes
                    </StatusBadge>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate?.('financeiro', 'saques')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Ver todos
                  </button>
                </div>
              </div>

              <div className="p-3 divide-y divide-slate-100 max-h-[360px] overflow-y-auto custom-scrollbar">
                {(snapshot.lists.saques || []).length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2 opacity-60" />
                    <p className="text-xs font-semibold text-slate-500">Nenhum saque aguardando aprovação.</p>
                  </div>
                ) : (
                  (snapshot.lists.saques || []).map((withdrawal) => (
                    <div
                      key={withdrawal.id}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {withdrawal.cliente_nome || 'Afiliado / Cliente'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Solicitado em {formatDate(withdrawal.data_solicitacao)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-bold font-mono text-emerald-700">
                          {formatCurrency(withdrawal.valor)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void approveWithdrawal(withdrawal)}
                          disabled={processingId === withdrawal.id}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        >
                          {processingId === withdrawal.id ? 'Aprovando...' : 'Aprovar'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Operational Domains Matrix */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Atalhos Rápidos de Domínios Operacionais
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              <AdminDomainCard
                title="Operações"
                icon={ClipboardList}
                badge={pendencies.moduleVendas}
                submetrics={[
                  { label: 'Orçamentos', value: pendencies.vendas_orcamentos_pendentes },
                  { label: 'Demandas', value: pendencies.vendas_demandas_abertas }
                ]}
                onClick={() => onNavigate?.('operacoes')}
              />
              <AdminDomainCard
                title="Cadastros"
                icon={Users}
                badge={pendencies.moduleCadastro}
                submetrics={[
                  { label: 'Clientes Pendentes', value: pendencies.cadastro_clientes_pendentes },
                  { label: 'Prestadores', value: pendencies.cadastro_prestadores_pendentes }
                ]}
                onClick={() => onNavigate?.('cadastro')}
              />
              <AdminDomainCard
                title="Afiliados GSA"
                icon={Share2}
                submetrics={[
                  { label: 'Base Ativa', value: 'Dashboard' }
                ]}
                onClick={() => onNavigate?.('afiliados')}
              />
              <AdminDomainCard
                title="Fidelidade VIP"
                icon={Crown}
                badge={pendencies.cadastro_premios_pendentes + pendencies.cadastro_vouchers_pendentes}
                submetrics={[
                  { label: 'Resgates', value: pendencies.cadastro_premios_pendentes }
                ]}
                onClick={() => onNavigate?.('fidelidade')}
              />
              <AdminDomainCard
                title="Cobrança"
                icon={AlertCircle}
                badge={pendencies.cobrancas_pendentes}
                submetrics={[
                  { label: 'Inadimplência', value: pendencies.cobrancas_criticas }
                ]}
                onClick={() => onNavigate?.('cobranca')}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Real-time Audit Activity Feed */}
        <div className="xl:col-span-4 h-full min-h-[500px]">
          <AdminActivityFeed notifications={notifications} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

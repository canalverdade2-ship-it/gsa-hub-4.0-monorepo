import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  MessageSquare,
  RefreshCcw,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { formatCurrency, formatDate } from '../../lib/utils';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

interface DashboardProps {
  onNavigate?: (module: string, tab?: string) => void;
  adminType?: 'admin' | 'colaborador';
  colaboradorId?: string;
  colaboradorNome?: string;
  colaboradorModulos?: string[];
}

interface DashboardSnapshot {
  permissions: Record<string, boolean>;
  stats: {
    faturamento_seis_meses: number;
    faturamento_mes_atual: number;
    faturamento_mes_anterior: number;
    clientes_total: number;
    promocoes_ativas: number;
    credito_pendente_total: number;
  };
  lists: {
    faturas?: any[];
    saques?: any[];
    cobrancas?: any[];
    orcamentos?: any[];
    tickets?: any[];
  };
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

function KpiCard({
  label,
  value,
  icon: Icon,
  caption,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  caption: string;
  onClick?: () => void;
  key?: React.Key;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dashboard-stat-card group rounded-[28px] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600"><Icon className="h-5 w-5 shrink-0" /></span>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-neutral-500">{caption}</span>
      </div>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.17em] text-slate-400">{label}</p>
      <p className="mt-2 text-[26px] font-extrabold leading-8 tabular-nums text-slate-950">{value}</p>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-neutral-400">{text}</p>;
}

function ListCard({
  title,
  icon: Icon,
  children,
  onOpen,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  onOpen?: () => void;
}) {
  return (
    <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-neutral-100 sm:p-7">
      <header className="mb-5 flex items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="font-black text-neutral-900">{title}</h3>
        </div>
        {onOpen && (
          <button type="button" onClick={onOpen} className="text-xs font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800">
            Abrir módulo
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function Row({
  title,
  subtitle,
  value,
  action,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  action?: React.ReactNode;
  key?: React.Key;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-100 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-neutral-900">{title}</p>
        {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {value && <span className="text-sm font-black text-neutral-800">{value}</span>}
        {action}
      </div>
    </div>
  );
}

export function Dashboard({
  onNavigate,
  adminType = 'admin',
  colaboradorNome = 'Administrador',
}: DashboardProps) {
  const { pendencies, refreshCounts } = useAdminNotifications();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

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
        console.error('Erro ao carregar dashboard administrativo:', error);
        toast.error(error?.message || 'Não foi possível carregar o dashboard.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeSubscription([
    { table: 'faturas', onChange: () => void load(true), debounceMs: 500 },
    { table: 'cobrancas', onChange: () => void load(true), debounceMs: 500 },
    { table: 'saques', onChange: () => void load(true), debounceMs: 500 },
    { table: 'ordens_fiscais', onChange: () => void load(true), debounceMs: 500 },
    { table: 'tickets', onChange: () => void load(true), debounceMs: 500 },
    { table: 'clientes', onChange: () => void load(true), debounceMs: 500 },
    { table: 'ordens_compra', onChange: () => void load(true), debounceMs: 500 },
    { table: 'vouchers', onChange: () => void load(true), debounceMs: 500 },
    { table: 'promocoes', onChange: () => void load(true), debounceMs: 500 },
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

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
        p_metodo: 'manual_dashboard',
        p_data_pagamento: new Date().toISOString(),
        p_observacoes: 'Baixa rápida realizada pelo dashboard administrativo seguro.',
      });
      if (result && result.success === false) throw new Error(result.error || 'Não foi possível baixar a fatura.');
      toast.success('Fatura marcada como paga.');
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
      if (result && result.success === false) throw new Error(result.error || 'Não foi possível aprovar o saque.');
      toast.success('Saque aprovado.');
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
        <div className="h-36 animate-pulse rounded-[32px] bg-neutral-200" />
        <div className="h-48 animate-pulse rounded-[28px] bg-white" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-[28px] bg-white" />)}
        </div>
      </div>
    );
  }

  const cards = [
    snapshot.permissions.financeiro && {
      label: 'Faturamento dos últimos 6 meses',
      value: formatCurrency(snapshot.stats.faturamento_seis_meses),
      icon: TrendingUp,
      caption: `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% no mês`,
      onClick: () => onNavigate?.('financeiro', 'dashboard'),
    },
    snapshot.permissions.financeiro && {
      label: 'Faturas pendentes',
      value: String(pendencies.financeiro_faturas_pendentes + pendencies.financeiro_faturas_vencidas),
      icon: AlertCircle,
      caption: 'Atenção',
      onClick: () => onNavigate?.('financeiro', 'faturas'),
    },
    snapshot.permissions.financeiro && {
      label: 'Crédito solicitado',
      value: formatCurrency(snapshot.stats.credito_pendente_total),
      icon: Wallet,
      caption: 'Total solicitado',
      onClick: () => onNavigate?.('financeiro', 'credito'),
    },
    snapshot.permissions.cadastro && {
      label: 'Clientes cadastrados',
      value: Number(snapshot.stats.clientes_total || 0).toLocaleString('pt-BR'),
      icon: Users,
      caption: 'Cadastros',
      onClick: () => onNavigate?.('cadastro', 'clientes'),
    },
    snapshot.permissions.atendimento && {
      label: 'Tickets abertos',
      value: String(pendencies.suporte_tickets_abertos),
      icon: MessageSquare,
      caption: 'Atendimento',
      onClick: () => onNavigate?.('atendimento'),
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    icon: React.ElementType;
    caption: string;
    onClick: () => void;
  }>;

  const supportPendencies = Math.max(pendencies.suporte_tickets_abertos, pendencies.suporte_mensagens_nao_lidas);
  const priorityItems = [
    snapshot.permissions.financeiro && pendencies.financeiro_faturas_vencidas > 0 && { label: 'Faturas vencidas', detail: 'Cobrança ou baixa necessária', count: pendencies.financeiro_faturas_vencidas, icon: AlertCircle, urgency: 'critical' as const, onClick: () => onNavigate?.('financeiro', 'faturas') },
    snapshot.permissions.financeiro && pendencies.cobrancas_criticas > 0 && { label: 'Cobranças críticas', detail: 'Casos que exigem ação imediata', count: pendencies.cobrancas_criticas, icon: Landmark, urgency: 'critical' as const, onClick: () => onNavigate?.('cobranca', 'fila') },
    snapshot.permissions.atendimento && supportPendencies > 0 && { label: 'Atendimentos pendentes', detail: 'Tickets ou mensagens aguardando retorno', count: supportPendencies, icon: MessageSquare, urgency: 'normal' as const, onClick: () => onNavigate?.('atendimento') },
    snapshot.permissions.financeiro && pendencies.fiscal_pendencias > 0 && { label: 'Pendências fiscais', detail: 'Documentos fiscais aguardando tratamento', count: pendencies.fiscal_pendencias, icon: FileText, urgency: 'normal' as const, onClick: () => onNavigate?.('fiscal') },
  ].filter(Boolean) as Array<{ label: string; detail: string; count: number; icon: React.ElementType; urgency: 'critical' | 'attention' | 'normal'; onClick: () => void }>;

  const priorityTotal = priorityItems.reduce((total, item) => total + item.count, 0);
  const recentActivities = [
    ...(snapshot.lists.faturas || []).map((row: any) => ({
      title: row.codigo_fatura || 'Fatura em aberto',
      detail: row.cliente_nome || 'Movimentação financeira',
      date: row.updated_at || row.created_at || row.data_vencimento,
      actor: 'Financeiro',
    })),
    ...(snapshot.lists.saques || []).map((row: any) => ({
      title: 'Solicitação de saque',
      detail: row.cliente_nome || 'Afiliado',
      date: row.data_solicitacao || row.created_at,
      actor: 'Afiliados',
    })),
    ...(snapshot.lists.tickets || []).map((row: any) => ({
      title: row.titulo || 'Atendimento aberto',
      detail: row.cliente_nome || 'Cliente',
      date: row.data_abertura || row.created_at,
      actor: 'Atendimento',
    })),
  ].sort((a, b) => Date.parse(String(b.date || '')) - Date.parse(String(a.date || ''))).slice(0, 5);

  return (
    <div className="admin-overview mx-auto w-full max-w-[1400px] space-y-6 pb-12">
      {priorityItems.length === 0 ? (
        <div className="flex min-h-[60px] items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-3 text-[13px] text-emerald-800 sm:px-6">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-extrabold">Tudo em dia</strong>
            <span className="ml-2 text-emerald-700/80">Não há pendências prioritárias neste momento.</span>
          </span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Atualizar painel" className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" aria-label="Pendências prioritárias">
          <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            {priorityTotal} {priorityTotal === 1 ? 'pendência exige' : 'pendências exigem'} atenção
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {priorityItems.map((item) => {
              const ItemIcon = item.icon;
              const accent = item.urgency === 'critical' ? '#dc2626' : item.urgency === 'attention' ? '#d97706' : '#2563eb';
              return <button key={item.label} type="button" onClick={item.onClick} className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-3.5 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/50">
                <span className="flex min-w-0 items-center gap-3"><ItemIcon className="h-[18px] w-[18px] shrink-0" style={{ color: accent }} /><span className="min-w-0"><span className="block truncate text-[13px] font-bold text-slate-900">{item.label}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.detail}</span></span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{item.count}</span><ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" /></span>
              </button>;
            })}
          </div>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => <KpiCard key={card.label} {...card} />)}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {snapshot.permissions.financeiro && (
          <ListCard title="Faturas que exigem atenção" icon={Landmark} onOpen={() => onNavigate?.('financeiro', 'faturas')}>
            <div className="space-y-3">
              {(snapshot.lists.faturas || []).length === 0 ? <EmptyState text="Nenhuma fatura pendente." /> : (snapshot.lists.faturas || []).map((invoice) => (
                <Row
                  key={invoice.id}
                  title={invoice.cliente_nome || invoice.codigo_fatura || 'Fatura'}
                  subtitle={`${invoice.codigo_fatura || 'Sem código'} · vencimento ${formatDate(invoice.data_vencimento)}`}
                  value={formatCurrency(invoice.valor_final_pendente ?? invoice.valor_total)}
                  action={
                    <button
                      type="button"
                      onClick={() => void markInvoicePaid(invoice)}
                      disabled={processingId === invoice.id}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      {processingId === invoice.id ? 'Processando' : 'Dar baixa'}
                    </button>
                  }
                />
              ))}
            </div>
          </ListCard>
        )}

        {snapshot.permissions.financeiro && (
          <ListCard title="Saques pendentes" icon={Wallet} onOpen={() => onNavigate?.('financeiro', 'saques')}>
            <div className="space-y-3">
              {(snapshot.lists.saques || []).length === 0 ? <EmptyState text="Nenhum saque pendente." /> : (snapshot.lists.saques || []).map((withdrawal) => (
                <Row
                  key={withdrawal.id}
                  title={withdrawal.cliente_nome || 'Cliente'}
                  subtitle={`Solicitado em ${formatDate(withdrawal.data_solicitacao)}`}
                  value={formatCurrency(withdrawal.valor)}
                  action={
                    <button
                      type="button"
                      onClick={() => void approveWithdrawal(withdrawal)}
                      disabled={processingId === withdrawal.id}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      {processingId === withdrawal.id ? 'Processando' : 'Aprovar'}
                    </button>
                  }
                />
              ))}
            </div>
          </ListCard>
        )}

        {snapshot.permissions.atendimento && (
          <ListCard title="Tickets abertos" icon={MessageSquare} onOpen={() => onNavigate?.('atendimento')}>
            <div className="space-y-3">
              {(snapshot.lists.tickets || []).length === 0 ? <EmptyState text="Nenhum ticket aberto." /> : (snapshot.lists.tickets || []).map((ticket) => (
                <Row
                  key={ticket.id}
                  title={ticket.titulo || ticket.cliente_nome || 'Ticket'}
                  subtitle={`${ticket.cliente_nome || 'Cliente'} · ${formatDate(ticket.data_abertura)}`}
                  value={String(ticket.status || '').replace(/_/g, ' ')}
                />
              ))}
            </div>
          </ListCard>
        )}
      </div>

      <ListCard title="Movimentações recentes" icon={Clock}>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {recentActivities.length > 0 ? recentActivities.map((activity, index) => (
            <div key={`${activity.actor}-${activity.title}-${index}`} className="flex gap-2.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-900">{activity.title}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{activity.actor} · {activity.detail}</p>
                {activity.date && <p className="mt-1 text-[11px] text-slate-400">{formatDate(activity.date)}</p>}
              </div>
            </div>
          )) : <p className="py-2 text-sm text-slate-400">Nenhuma movimentação recente registrada.</p>}
        </div>
      </ListCard>

      {cards.length === 0 && (
        <section className="rounded-[2rem] bg-white p-10 text-center shadow-sm ring-1 ring-neutral-100">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h2 className="mt-4 text-xl font-black text-neutral-900">Acesso administrativo ativo</h2>
          <p className="mt-2 text-sm text-neutral-500">Use o menu lateral para acessar os módulos liberados para sua conta.</p>
        </section>
      )}

      {adminType === 'admin' && (
        <button
          type="button"
          onClick={() => onNavigate?.('acessos')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-4 text-sm font-black text-neutral-600 hover:border-indigo-300 hover:text-indigo-700"
        >
          <UserPlus className="h-5 w-5" /> Gerenciar colaboradores e permissões
        </button>
      )}
    </div>
  );
}

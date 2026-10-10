import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Loader2, RefreshCw, ShieldX, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { formatCurrency, formatDateTime } from '../../../../lib/utils';
import { useConfirm } from '../../../../hooks/useConfirm';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import {
  decideAdminCreditLimitCancellation,
  listAdminCreditLimitCancellations,
  reviewAdminCreditLimitCancellation,
} from '../../../../features/creditLimitCancellation/service';
import type { CreditLimitCancellation } from '../../../../features/creditLimitCancellation/types';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';

interface Props { initialItemId?: string; }
const ACTIVE = ['solicitado', 'em_analise'];
const LABELS: Record<string, string> = {
  solicitado: 'Solicitado', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado',
};

function statusClass(status: string) {
  if (status === 'aprovado') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'recusado') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'em_analise') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-indigo-200 bg-indigo-50 text-indigo-700';
}
export function CreditLimitCancellationsAdminPanel({ initialItemId }: Props) {
  const [items, setItems] = useState<CreditLimitCancellation[]>([]);
  const [selected, setSelected] = useState<CreditLimitCancellation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'ativas' | 'encerradas' | 'todas'>('ativas');
  const [reason, setReason] = useState('');
  const confirmHook = useConfirm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await listAdminCreditLimitCancellations();
      setItems(data);
      if (initialItemId) {
        const found = data.find((item) => item.id === initialItemId);
        if (found) setSelected(found);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os cancelamentos de limite.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchItems(); }, []);
  useRealtimeSubscription([
    { table: 'notificacoes', onChange: () => void fetchItems() },
    { table: 'clientes', onChange: () => void fetchItems() },
    { table: 'loja_credito_movimentacoes', onChange: () => void fetchItems() },
  ]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'todas') return true;
    const active = ACTIVE.includes(item.status);
    return filter === 'ativas' ? active : !active;
  }), [items, filter]);
  const handleReview = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await reviewAdminCreditLimitCancellation(selected.id);
      await fetchItems();
      setSelected((current) => current ? { ...current, status: 'em_analise' } : current);
      toast.success('Solicitação colocada em análise.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível iniciar a análise.');
    } finally { setActionLoading(false); }
  };

  const handleDecision = async (approve: boolean) => {
    if (!selected) return;
    if (!approve && reason.trim().length < 5) {
      toast.error('Informe o motivo da recusa.');
      return;
    }
    const confirmed = await confirmHook.confirm({
      title: approve ? 'Aprovar cancelamento total do limite?' : 'Recusar cancelamento do limite?',
      message: approve
        ? 'O banco revalidará que o limite usado é R$ 0,00. Se estiver elegível, o limite total e disponível serão zerados imediatamente.'
        : 'O limite permanecerá ativo e o cliente receberá o motivo da decisão.',
      confirmLabel: approve ? 'Aprovar e zerar limite' : 'Confirmar recusa',
      cancelLabel: 'Voltar',
      variant: 'danger',
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await decideAdminCreditLimitCancellation(selected.id, approve, reason);
      setSelected(null); setReason(''); await fetchItems();
      toast.success(approve ? 'Limite cancelado com sucesso.' : 'Solicitação recusada.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir a decisão.');
    } finally { setActionLoading(false); }
  };
  const columns: GridColumn<CreditLimitCancellation>[] = [
    { key: 'protocolo', header: 'Protocolo', width: '155px', render: (row) => <span className="font-mono text-[11px] font-black text-slate-900">{row.protocolo}</span> },
    { key: 'cliente_nome', header: 'Cliente', render: (row) => <div><p className="text-xs font-bold text-slate-900">{row.cliente_nome || 'Cliente'}</p><p className="text-[10px] text-slate-500">{row.cliente_email || row.cliente_telefone || '—'}</p></div> },
    { key: 'limite_total_snapshot', header: 'Limite solicitado p/ cancelar', width: '170px', align: 'right', render: (row) => <span className="font-mono text-xs font-black text-slate-900">{formatCurrency(row.limite_total_snapshot)}</span> },
    { key: 'limite_usado_snapshot', header: 'Usado na solicitação', width: '145px', align: 'right', render: (row) => <span className={`font-mono text-xs font-black ${row.limite_usado_snapshot > 0.01 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(row.limite_usado_snapshot)}</span> },
    { key: 'status', header: 'Status', width: '120px', render: (row) => <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(row.status)}`}>{LABELS[row.status] || row.status}</span> },
    { key: 'created_at', header: 'Solicitado em', width: '125px', render: (row) => <span className="text-[10px] text-slate-500">{formatDateTime(row.created_at)}</span> },
    { key: 'acao', header: '', width: '45px', align: 'right', render: (row) => <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(row); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button> },
  ];

  return (
    <div className="space-y-4">
      <ConfirmDialog {...confirmHook} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2"><div className="rounded-lg bg-rose-50 p-2 text-rose-700"><ShieldX className="h-4 w-4" /></div><div><p className="text-xs font-black text-slate-900">Cancelamentos de Limite</p><p className="text-[10px] text-slate-500">Somente clientes com Limite Usado em R$ 0,00 podem solicitar.</p></div></div>
        <div className="flex items-center gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"><option value="ativas">Ativas</option><option value="encerradas">Encerradas</option><option value="todas">Todas</option></select><button type="button" onClick={() => void fetchItems()} className="rounded-lg border border-slate-200 p-2 text-slate-600"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button></div>
      </div>
      <TacticalDataGrid<CreditLimitCancellation> title="Solicitações de Cancelamento" subtitle="A aprovação revalida saldo usado e faturas antes de zerar o limite." data={visible} columns={columns} keyExtractor={(row) => row.id} isLoading={loading} onRowClick={(row) => setSelected(row)} />

      <CommandSlideOver isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Cancelamento ${selected.protocolo}` : 'Cancelamento de Limite'} subtitle={selected?.cliente_nome || ''} width="md">
        {selected && <div className="space-y-5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-500">Limite na solicitação</p><p className="mt-1 font-mono text-lg font-black text-slate-900">{formatCurrency(selected.limite_total_snapshot)}</p></div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-700">Usado na solicitação</p><p className="mt-1 font-mono text-lg font-black text-emerald-700">{formatCurrency(selected.limite_usado_snapshot)}</p></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-500">Situação atual</p><div className="mt-2 flex justify-between gap-3"><span>Limite total atual</span><strong>{formatCurrency(selected.limite_total_atual || 0)}</strong></div><div className="mt-1 flex justify-between gap-3"><span>Disponível atual</span><strong>{formatCurrency(selected.limite_disponivel_atual || 0)}</strong></div></div>
          <div className="flex items-center justify-between"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(selected.status)}`}>{LABELS[selected.status] || selected.status}</span><span className="text-[10px] text-slate-500">{formatDateTime(selected.created_at)}</span></div>
          {ACTIVE.includes(selected.status) && <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/40 p-4">
            {selected.status === 'solicitado' && <button type="button" onClick={() => void handleReview()} disabled={actionLoading} className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 font-black text-white disabled:opacity-50">Iniciar análise</button>}
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da recusa (obrigatório apenas para recusar)..." className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => void handleDecision(false)} disabled={actionLoading || reason.trim().length < 5} className="flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2.5 font-black text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Recusar</button><button type="button" onClick={() => void handleDecision(true)} disabled={actionLoading} className="flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2.5 font-black text-white disabled:opacity-50">{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar cancelamento</button></div>
            <p className="text-[10px] leading-relaxed text-rose-800">A aprovação só será concluída se o banco confirmar novamente Limite Usado = R$ 0,00 e nenhuma fatura de crédito pendente.</p>
          </div>}
          {!ACTIVE.includes(selected.status) && selected.motivo_decisao && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase text-slate-500">Motivo da decisão</p><p className="mt-2 text-slate-700">{selected.motivo_decisao}</p></div>}
        </div>}
      </CommandSlideOver>
    </div>
  );
}

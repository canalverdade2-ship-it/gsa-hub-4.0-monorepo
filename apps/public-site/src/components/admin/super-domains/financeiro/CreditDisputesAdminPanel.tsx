import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Eye, FileText, Gavel, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { getPrivateFileUrl } from '../../../../lib/storage';
import { formatCurrency, formatDateTime } from '../../../../lib/utils';
import { useConfirm } from '../../../../hooks/useConfirm';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import {
  decideAdminCreditDispute,
  getAdminCreditDisputeDetails,
  listAdminCreditDisputes,
  requestAdminCreditDisputeDocuments,
  reviewAdminCreditDispute,
} from '../../../../features/creditDisputes/service';
import type { CreditDispute, CreditDisputeStatus } from '../../../../features/creditDisputes/types';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';

interface Props { initialItemId?: string; }
type Decision = 'deferido' | 'parcialmente_deferido' | 'indeferido';

const ACTIVE_STATUSES: CreditDisputeStatus[] = ['aberta', 'em_analise', 'aguardando_documentos'];
const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta', em_analise: 'Em análise', aguardando_documentos: 'Aguardando documentos',
  deferida: 'Aprovada', parcialmente_deferida: 'Parcialmente aprovada', indeferida: 'Não aprovada',
  cancelada_cliente: 'Cancelada pelo cliente', resolvida_por_estorno: 'Resolvida por estorno',
};
function statusClass(status: string) {
  if (['deferida', 'resolvida_por_estorno'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'parcialmente_deferida') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (['indeferida', 'cancelada_cliente'].includes(status)) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (status === 'aguardando_documentos') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
}

export function CreditDisputesAdminPanel({ initialItemId }: Props) {
  const [items, setItems] = useState<CreditDispute[]>([]);
  const [selected, setSelected] = useState<CreditDispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'ativas' | 'todas' | 'encerradas'>('ativas');
  const [documentRequest, setDocumentRequest] = useState('');
  const [decision, setDecision] = useState<Decision>('deferido');
  const [decisionReason, setDecisionReason] = useState('');
  const [partialValue, setPartialValue] = useState('');
  const confirmHook = useConfirm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await listAdminCreditDisputes();
      setItems(data);
      if (initialItemId) {
        const found = data.find((item) => item.id === initialItemId);
        if (found) void openDetails(found);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar as contestações.');
    } finally { setLoading(false); }
  };
  const openDetails = async (item: CreditDispute) => {
    setSelected(item);
    setLoadingDetails(true);
    setDocumentRequest('');
    setDecision('deferido');
    setDecisionReason('');
    setPartialValue('');
    try {
      setSelected(await getAdminCreditDisputeDetails(item.id));
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir a contestação.');
    } finally { setLoadingDetails(false); }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const details = await getAdminCreditDisputeDetails(selected.id);
    setSelected(details);
    setItems((current) => current.map((item) => item.id === details.id ? { ...item, ...details } : item));
  };

  useEffect(() => { void fetchItems(); }, []);
  useRealtimeSubscription([
    { table: 'notificacoes', onChange: () => void fetchItems() },
    { table: 'loja_credito_movimentacoes', onChange: () => void fetchItems() },
    { table: 'faturas', onChange: () => void fetchItems() },
  ]);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === 'todas') return true;
    const active = ACTIVE_STATUSES.includes(item.status);
    return filter === 'ativas' ? active : !active;
  }), [items, filter]);

  const activeCount = items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length;
  const handleStartReview = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await reviewAdminCreditDispute(selected.id);
      await refreshSelected();
      await fetchItems();
      toast.success('Contestação colocada em análise.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível iniciar a análise.');
    } finally { setActionLoading(false); }
  };

  const handleRequestDocuments = async () => {
    if (!selected || documentRequest.trim().length < 5) {
      toast.error('Informe quais documentos o cliente deve enviar.');
      return;
    }
    setActionLoading(true);
    try {
      await requestAdminCreditDisputeDocuments(selected.id, documentRequest);
      setDocumentRequest('');
      await refreshSelected();
      await fetchItems();
      toast.success('Solicitação de documentos registrada.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível solicitar documentos.');
    } finally { setActionLoading(false); }
  };
  const handleDecision = async () => {
    if (!selected) return;
    const reason = decisionReason.trim();
    if (reason.length < (decision === 'indeferido' ? 5 : 3)) {
      toast.error('Informe a justificativa da decisão.');
      return;
    }
    const approvedValue = decision === 'parcialmente_deferido'
      ? Number(partialValue.replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.'))
      : undefined;
    if (decision === 'parcialmente_deferido' && (!approvedValue || approvedValue <= 0 || approvedValue >= selected.valor_contestado)) {
      toast.error('Informe um valor parcial maior que zero e menor que o valor contestado.');
      return;
    }
    const label = decision === 'indeferido' ? 'negar' : decision === 'deferido' ? 'aprovar integralmente' : 'aprovar parcialmente';
    const confirmed = await confirmHook.confirm({
      title: `Confirmar decisão: ${label}?`,
      message: decision === 'indeferido'
        ? 'A contestação será encerrada sem movimentação financeira.'
        : 'Esta decisão poderá ajustar faturas, restaurar limite e/ou gerar reembolso. A operação é auditada e idempotente.',
      confirmLabel: 'Confirmar decisão',
      cancelLabel: 'Voltar',
      variant: decision === 'indeferido' ? 'danger' : 'warning',
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await decideAdminCreditDispute(selected.id, decision, reason, approvedValue);
      await refreshSelected();
      await fetchItems();
      toast.success('Decisão da contestação concluída.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir a decisão.');
    } finally { setActionLoading(false); }
  };

  const openAttachment = async (path: string) => {
    try {
      const url = await getPrivateFileUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Não foi possível abrir o anexo.');
    }
  };

  const columns: GridColumn<CreditDispute>[] = [
    { key: 'protocolo', header: 'Protocolo', width: '145px', render: (row) => <span className="font-mono text-[11px] font-black text-slate-900">{row.protocolo}</span> },
    { key: 'cliente_nome', header: 'Cliente', render: (row) => <div><p className="text-xs font-bold text-slate-900">{row.cliente_nome || 'Cliente'}</p><p className="text-[10px] text-slate-500">{row.codigo_compra || row.descricao_compra}</p></div> },
    { key: 'valor_contestado', header: 'Valor', width: '110px', align: 'right', render: (row) => <span className="font-mono text-xs font-black">{formatCurrency(row.valor_contestado)}</span> },
    { key: 'status', header: 'Status', width: '150px', render: (row) => <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(row.status)}`}>{STATUS_LABELS[row.status] || row.status}</span> },
    { key: 'created_at', header: 'Abertura', width: '125px', render: (row) => <span className="text-[10px] text-slate-500">{formatDateTime(row.created_at)}</span> },
    { key: 'acao', header: '', width: '45px', align: 'right', render: (row) => <button type="button" onClick={(e) => { e.stopPropagation(); void openDetails(row); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button> },
  ];
  return (
    <div className="space-y-4">
      <ConfirmDialog {...confirmHook} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><Gavel className="h-4 w-4" /></div>
          <div><p className="text-xs font-black text-slate-900">Contestações de Compras</p><p className="text-[10px] text-slate-500">Compras no Crédito GSA contestadas em até 90 dias.</p></div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{activeCount} ativas</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700">
            <option value="ativas">Ativas</option><option value="encerradas">Encerradas</option><option value="todas">Todas</option>
          </select>
          <button type="button" onClick={() => void fetchItems()} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>
      <TacticalDataGrid title="Fila de Contestações" subtitle="Análise, documentos e decisão financeira auditada." data={visibleItems} columns={columns} keyExtractor={(row) => row.id} isLoading={loading} onRowClick={(row) => void openDetails(row)} />
      <CommandSlideOver isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Contestação ${selected.protocolo}` : 'Contestação'} subtitle={selected ? `${selected.cliente_nome || 'Cliente'} • ${selected.codigo_compra || 'Compra Crédito GSA'}` : ''} width="lg">
        {loadingDetails ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div> : selected && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-500">Compra</p><p className="mt-1 font-bold text-slate-900">{selected.descricao_compra}</p><p className="mt-1 text-[10px] text-slate-500">{selected.compra_data ? formatDateTime(selected.compra_data) : '—'}</p></div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-600">Valor contestado</p><p className="mt-1 font-mono text-lg font-black text-rose-700">{formatCurrency(selected.valor_contestado)}</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-500">Status</p><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(selected.status)}`}>{STATUS_LABELS[selected.status] || selected.status}</span></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase text-slate-500">Relato do cliente</p><p className="mt-2 leading-relaxed text-slate-700">{selected.descricao}</p></div>
            {selected.anexos?.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Anexos</p><div className="flex flex-wrap gap-2">{selected.anexos.map((path, index) => <button key={path} type="button" onClick={() => void openAttachment(path)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-bold text-indigo-700"><FileText className="h-3.5 w-3.5" /> Anexo {index + 1}</button>)}</div></div>}
            {(selected.eventos || []).length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-3 text-[10px] font-black uppercase text-slate-500">Linha do tempo</p><div className="space-y-3">{selected.eventos?.map((event) => <div key={event.id} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" /><div><p className="font-bold text-slate-800">{event.titulo}</p>{event.descricao && <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{event.descricao}</p>}<p className="mt-1 text-[9px] text-slate-400">{formatDateTime(event.ocorrido_em)}{event.ator_nome ? ` • ${event.ator_nome}` : ''}</p></div></div>)}</div></div>}

            {ACTIVE_STATUSES.includes(selected.status) && <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-amber-700" /><p className="font-black text-amber-900">Ações de análise</p></div>
              {selected.status === 'aberta' && <button type="button" disabled={actionLoading} onClick={() => void handleStartReview()} className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 font-black text-white disabled:opacity-50">Iniciar análise</button>}
              <div className="space-y-2"><textarea rows={3} value={documentRequest} onChange={(e) => setDocumentRequest(e.target.value)} placeholder="Documentos ou informações que o cliente deve enviar..." className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none" /><button type="button" disabled={actionLoading || documentRequest.trim().length < 5} onClick={() => void handleRequestDocuments()} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-black text-amber-800 disabled:opacity-50">Solicitar documentos</button></div>
              <div className="space-y-2 border-t border-amber-200 pt-3"><p className="text-[10px] font-black uppercase text-amber-900">Decisão final</p><select value={decision} onChange={(e) => setDecision(e.target.value as Decision)} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-bold"><option value="deferido">Aprovar integralmente</option><option value="parcialmente_deferido">Aprovar parcialmente</option><option value="indeferido">Negar contestação</option></select>
                {decision === 'parcialmente_deferido' && <input type="text" inputMode="decimal" value={partialValue} onChange={(e) => setPartialValue(e.target.value)} placeholder={`Valor menor que ${formatCurrency(selected.valor_contestado)}`} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-xs" />}
                <textarea rows={3} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} placeholder="Justificativa obrigatória da decisão..." className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none" />
                <button type="button" disabled={actionLoading || decisionReason.trim().length < 3} onClick={() => void handleDecision()} className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-black text-white disabled:opacity-50 ${decision === 'indeferido' ? 'bg-rose-600' : 'bg-emerald-600'}`}>{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} Concluir decisão</button>
              </div>
            </div>}
            {!ACTIVE_STATUSES.includes(selected.status) && selected.motivo_decisao && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase text-slate-500">Decisão administrativa</p><p className="mt-2 text-slate-700">{selected.motivo_decisao}</p>{selected.valor_deferido > 0 && <p className="mt-2 font-mono font-black text-emerald-700">Valor deferido: {formatCurrency(selected.valor_deferido)}</p>}</div>}
          </div>
        )}
      </CommandSlideOver>
    </div>
  );
}

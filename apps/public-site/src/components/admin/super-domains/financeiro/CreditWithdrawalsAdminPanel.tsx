import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, ExternalLink, Eye, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { useConfirm } from '../../../../hooks/useConfirm';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { formatCurrency, formatDateTime } from '../../../../lib/utils';
import { getPrivateFileUrl } from '../../../../lib/storage';
import {
  confirmAdminCreditWithdrawalPix,
  decideAdminCreditWithdrawal,
  getAdminCreditWithdrawalDetails,
  listAdminCreditWithdrawals,
} from '../../../../features/creditWithdrawal/service';
import type { CreditWithdrawal } from '../../../../features/creditWithdrawal/types';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';

interface Props { initialItemId?: string; }
const ACTIVE = ['aguardando_documentos', 'em_analise', 'analise_reforcada', 'aprovado'];
const LABELS: Record<string, string> = {
  aguardando_documentos: 'Aguardando documentos',
  em_analise: 'Em análise',
  analise_reforcada: 'Análise minuciosa',
  aprovado: 'Aprovado para PIX',
  recusado: 'Não aprovado',
  cancelado_cliente: 'Cancelado pelo cliente',
  liberado: 'Liberado',
};

function badgeClass(status: string) {
  if (status === 'liberado') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'recusado' || status === 'cancelado_cliente') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'analise_reforcada') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'aprovado') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-indigo-200 bg-indigo-50 text-indigo-700';
}

export function CreditWithdrawalsAdminPanel({ initialItemId }: Props) {
  const [items, setItems] = useState<CreditWithdrawal[]>([]);
  const [selected, setSelected] = useState<CreditWithdrawal | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'ativas' | 'encerradas' | 'todas'>('ativas');
  const [reason, setReason] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const confirmHook = useConfirm();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await listAdminCreditWithdrawals();
      setItems(data);
      if (initialItemId) {
        const found = data.find((item) => item.id === initialItemId);
        if (found) setSelected(await getAdminCreditWithdrawalDetails(found.id));
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os saques de crédito.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchItems(); }, []);
  useRealtimeSubscription([
    { table: 'notificacoes', onChange: () => void fetchItems() },
    { table: 'clientes', onChange: () => void fetchItems() },
    { table: 'faturas', onChange: () => void fetchItems() },
    { table: 'loja_credito_movimentacoes', onChange: () => void fetchItems() },
  ]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'todas') return true;
    const active = ACTIVE.includes(item.status);
    return filter === 'ativas' ? active : !active;
  }), [items, filter]);

  const openItem = async (item: CreditWithdrawal) => {
    setActionLoading(true);
    try {
      setSelected(await getAdminCreditWithdrawalDetails(item.id));
      setReason(''); setPaymentReference('');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir a solicitação.');
    } finally { setActionLoading(false); }
  };

  const openDocument = async (path?: string | null) => {
    if (!path) return;
    try {
      const url = await getPrivateFileUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o documento.');
    }
  };
  const handleDecision = async (approve: boolean) => {
    if (!selected) return;
    if (!approve && reason.trim().length < 5) {
      toast.error('Informe o motivo da não aprovação.');
      return;
    }
    const confirmed = await confirmHook.confirm({
      title: approve ? 'Aprovar saque para liberação?' : 'Não aprovar este saque?',
      message: approve
        ? 'Esta ação apenas aprova a análise. O crédito continuará reservado e nenhuma fatura será criada até a confirmação do PIX pago.'
        : 'A reserva será liberada e o cliente receberá o motivo da decisão.',
      confirmLabel: approve ? 'Aprovar para liberação' : 'Confirmar não aprovação',
      cancelLabel: 'Voltar',
      variant: approve ? 'info' : 'danger',
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await decideAdminCreditWithdrawal(selected.id, approve, reason);
      await fetchItems();
      setSelected(await getAdminCreditWithdrawalDetails(selected.id));
      toast.success(approve ? 'Saque aprovado para liberação PIX.' : 'Saque não aprovado.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir a decisão.');
    } finally { setActionLoading(false); }
  };
  const handleConfirmPix = async () => {
    if (!selected) return;
    if (paymentReference.trim().length < 3) {
      toast.error('Informe a referência ou comprovante do pagamento PIX.');
      return;
    }
    const confirmed = await confirmHook.confirm({
      title: 'Confirmar que o PIX foi pago?',
      message: `Ao confirmar, o sistema consumirá ${formatCurrency(selected.valor_total_fatura)} do limite e gerará uma fatura com vencimento em 30 dias. Use somente após o PIX de ${formatCurrency(selected.valor_solicitado)} ter sido efetivamente enviado ao cliente.`,
      confirmLabel: 'Confirmar PIX pago',
      cancelLabel: 'Ainda não foi pago',
      variant: 'danger',
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      await confirmAdminCreditWithdrawalPix(selected.id, paymentReference);
      await fetchItems();
      setSelected(await getAdminCreditWithdrawalDetails(selected.id));
      toast.success('PIX confirmado e fatura de 30 dias gerada.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível confirmar a liberação do PIX.');
    } finally { setActionLoading(false); }
  };

  const columns: GridColumn<CreditWithdrawal>[] = [
    { key: 'protocolo', header: 'Protocolo', width: '150px', render: (row) => <span className="font-mono text-[11px] font-black text-slate-900">{row.protocolo}</span> },
    { key: 'cliente_nome', header: 'Cliente', render: (row) => <div><p className="text-xs font-bold text-slate-900">{row.cliente_nome || 'Cliente'}</p><p className="text-[10px] text-slate-500">{row.cliente_email || row.cliente_telefone || '—'}</p></div> },
    { key: 'valor_solicitado', header: 'Saque', width: '110px', align: 'right', render: (row) => <span className="font-mono text-xs font-black">{formatCurrency(row.valor_solicitado)}</span> },
    { key: 'taxa_calculada', header: 'Taxa', width: '100px', align: 'right', render: (row) => <span className="font-mono text-xs font-bold text-slate-600">{formatCurrency(row.taxa_calculada)}</span> },
    { key: 'valor_total_fatura', header: 'Fatura', width: '110px', align: 'right', render: (row) => <span className="font-mono text-xs font-black text-indigo-700">{formatCurrency(row.valor_total_fatura)}</span> },
    { key: 'analise_reforcada', header: 'Análise', width: '125px', render: (row) => row.analise_reforcada ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-800 ring-1 ring-amber-200">Minuciosa</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 ring-1 ring-emerald-200">Padrão</span> },
    { key: 'status', header: 'Status', width: '135px', render: (row) => <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${badgeClass(row.status)}`}>{LABELS[row.status] || row.status}</span> },
    { key: 'acao', header: '', width: '45px', align: 'right', render: (row) => <button type="button" onClick={(event) => { event.stopPropagation(); void openItem(row); }} className="rounded p-1.5 text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button> },
  ];

  return (
    <div className="space-y-4">
      <ConfirmDialog {...confirmHook} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><Banknote className="h-4 w-4" /></div>
          <div><p className="text-xs font-black text-slate-900">Saques de Crédito</p><p className="text-[10px] text-slate-500">Análise documental, liberação PIX e fatura em 30 dias.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(event) => setFilter(event.target.value as any)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold"><option value="ativas">Ativas</option><option value="encerradas">Encerradas</option><option value="todas">Todas</option></select>
          <button type="button" onClick={() => void fetchItems()} className="rounded-lg border border-slate-200 p-2 text-slate-600"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <TacticalDataGrid<CreditWithdrawal>
        title="Solicitações de Saque do Crédito"
        subtitle="A confirmação do PIX é separada da aprovação e é a única etapa que gera a fatura."
        data={visible}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => void openItem(row)}
      />
      <CommandSlideOver isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Saque ${selected.protocolo}` : 'Saque de Crédito'} subtitle={selected?.cliente_nome || ''} width="lg">
        {selected && <div className="space-y-5 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-500">Valor do saque</p><p className="mt-1 font-mono text-lg font-black">{formatCurrency(selected.valor_solicitado)}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-500">Taxa</p><p className="mt-1 font-mono text-lg font-black">{formatCurrency(selected.taxa_calculada)}</p></div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><p className="text-[9px] font-black uppercase text-indigo-600">Fatura prevista</p><p className="mt-1 font-mono text-lg font-black text-indigo-700">{formatCurrency(selected.valor_total_fatura)}</p></div>
          </div>

          <div className={`rounded-xl border p-4 ${selected.analise_reforcada ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-center gap-2 font-black"><AlertTriangle className={`h-4 w-4 ${selected.analise_reforcada ? 'text-amber-600' : 'text-emerald-600'}`} />{selected.analise_reforcada ? 'Análise minuciosa' : 'Elegibilidade padrão atendida'}</div>
            <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2"><span>30 dias de cadastro: <strong>{selected.criterio_cadastro_30d_ok ? 'Aprovado' : 'Não aprovado'}</strong></span><span>Crédito acima de R$ 100: <strong>{selected.criterio_credito_100_ok ? 'Aprovado' : 'Não aprovado'}</strong></span></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${badgeClass(selected.status)}`}>{LABELS[selected.status] || selected.status}</span><span className="text-[10px] text-slate-500">Solicitado em {formatDateTime(selected.created_at)}</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><span>PIX: <strong>{selected.pix_tipo.toUpperCase()} • {selected.pix_chave || selected.pix_chave_mascarada || '—'}</strong></span><span>Reserva atual: <strong>{formatCurrency(selected.valor_bloqueado)}</strong></span></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" disabled={!selected.documento_foto?.path} onClick={() => void openDocument(selected.documento_foto?.path)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 font-black text-slate-700 disabled:opacity-40"><FileText className="h-4 w-4" /> Documento com foto <ExternalLink className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={!selected.comprovante_endereco?.path} onClick={() => void openDocument(selected.comprovante_endereco?.path)} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 font-black text-slate-700 disabled:opacity-40"><FileText className="h-4 w-4" /> Comprovante de endereço <ExternalLink className="h-3.5 w-3.5" /></button>
          </div>

          {['em_analise', 'analise_reforcada'].includes(selected.status) && <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obrigatório para não aprovar; opcional para aprovação..." className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none" />
            <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void handleDecision(false)} disabled={actionLoading || reason.trim().length < 5} className="flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2.5 font-black text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Não aprovar</button><button type="button" onClick={() => void handleDecision(true)} disabled={actionLoading} className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 font-black text-white disabled:opacity-50">{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar para PIX</button></div>
          </div>}
          {selected.status === 'aprovado' && <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/50 p-4">
            <p className="font-black text-rose-900">Confirmação financeira da liberação</p>
            <p className="text-[11px] leading-relaxed text-rose-800">Só confirme depois que o PIX de {formatCurrency(selected.valor_solicitado)} tiver sido efetivamente enviado. A confirmação consumirá {formatCurrency(selected.valor_total_fatura)} do limite e criará a fatura com vencimento em 30 dias.</p>
            <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Referência, ID ou comprovante do PIX..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none" />
            <button type="button" onClick={() => void handleConfirmPix()} disabled={actionLoading || paymentReference.trim().length < 3} className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2.5 font-black text-white disabled:opacity-50">{actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Confirmar PIX pago e gerar fatura</button>
          </div>}

          {selected.motivo_decisao && <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-black uppercase text-slate-500">Motivo da decisão</p><p className="mt-2 text-slate-700">{selected.motivo_decisao}</p></div>}

          {(selected.eventos || []).length > 0 && <div className="space-y-2"><p className="font-black text-slate-900">Linha do tempo</p>{selected.eventos!.map((event) => <div key={event.id} className="rounded-xl border border-slate-100 bg-white p-3"><div className="flex items-center justify-between gap-3"><strong className="text-slate-800">{event.titulo}</strong><span className="text-[9px] text-slate-400">{formatDateTime(event.ocorrido_em)}</span></div>{event.descricao && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{event.descricao}</p>}</div>)}</div>}
        </div>}
      </CommandSlideOver>
    </div>
  );
}

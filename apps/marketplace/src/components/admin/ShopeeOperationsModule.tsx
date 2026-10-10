import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { formatCurrency, formatDate } from '../../lib/utils';
import {
  createAdminShopeeWorker,
  fetchAdminShopeeJob,
  fetchAdminShopeeQueue,
  fetchAdminShopeeWorkers,
  ShopeeJobStatus,
  ShopeeQueueJob,
  ShopeeQueueResponse,
  ShopeeWorkerSummary,
  updateAdminShopeeJob,
} from '../../lib/shopeeFulfillment';

const EMPTY_QUEUE: ShopeeQueueResponse = {
  summary: { queue: 0, attention: 0, payment: 0, tracking: 0, done: 0 },
  jobs: [],
};

const STATUS: Record<ShopeeJobStatus, { label: string; className: string }> = {
  fila: { label: 'Na fila', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  reservado: { label: 'Reservado', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  validando: { label: 'Validando', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  divergencia: { label: 'Precisa de decisão', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  preparando_carrinho: { label: 'Preparando carrinho', className: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  aguardando_pagamento: { label: 'Aguardando pagamento', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  comprado: { label: 'Comprado', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  acompanhando: { label: 'Acompanhando', className: 'bg-teal-50 text-teal-700 ring-teal-200' },
  enviado: { label: 'Enviado', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  em_rota: { label: 'Em rota', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
  entregue: { label: 'Entregue', className: 'bg-green-50 text-green-700 ring-green-200' },
  falha: { label: 'Falha', className: 'bg-red-50 text-red-700 ring-red-200' },
  cancelado: { label: 'Cancelado', className: 'bg-neutral-100 text-neutral-500 ring-neutral-200' },
};

const FILTERS: Array<{ id: string; label: string }> = [
  { id: '', label: 'Todos' },
  { id: 'fila', label: 'Fila' },
  { id: 'divergencia', label: 'Decisão' },
  { id: 'aguardando_pagamento', label: 'Pagamento' },
  { id: 'comprado', label: 'Comprados' },
  { id: 'enviado', label: 'Enviados' },
  { id: 'entregue', label: 'Entregues' },
  { id: 'falha', label: 'Falhas' },
];

function lastSeenLabel(value?: string | null) {
  if (!value) return 'Nunca conectado';
  const date = new Date(value);
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 90) return 'Online agora';
  if (seconds < 3600) return `Há ${Math.floor(seconds / 60)} min`;
  return formatDate(value);
}

function isWorkerOnline(value?: string | null) {
  return Boolean(value && Date.now() - new Date(value).getTime() < 90_000);
}

export function ShopeeOperationsModule() {
  const [queue, setQueue] = useState<ShopeeQueueResponse>(EMPTY_QUEUE);
  const [workers, setWorkers] = useState<ShopeeWorkerSummary[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [workerName, setWorkerName] = useState('Computador GSA');
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [queueResult, workerResult] = await Promise.all([
        fetchAdminShopeeQueue(filter || null),
        fetchAdminShopeeWorkers(),
      ]);
      setQueue(queueResult || EMPTY_QUEUE);
      setWorkers(workerResult || []);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível consultar a operação Shopee.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeSubscription([
    { table: 'shopee_fulfillment_jobs', onChange: () => void load(true), debounceMs: 500 },
    { table: 'shopee_automation_workers', onChange: () => void load(true), debounceMs: 500 },
    { table: 'ordens_compra', onChange: () => void load(true), debounceMs: 500 },
    { table: 'orcamentos', onChange: () => void load(true), debounceMs: 500 },
  ]);

  const onlineWorkers = useMemo(
    () => workers.filter((worker) => worker.status === 'ativo' && isWorkerOnline(worker.last_seen_at)).length,
    [workers],
  );

  const openDetails = async (job: ShopeeQueueJob) => {
    setDetailLoading(true);
    setSelectedJob({ preview: job });
    try {
      setSelectedJob(await fetchAdminShopeeJob(job.id));
    } catch (error: any) {
      setSelectedJob(null);
      toast.error(error?.message || 'Não foi possível abrir a tarefa.');
    } finally {
      setDetailLoading(false);
    }
  };

  const changeStatus = async (status: ShopeeJobStatus, note: string) => {
    const id = selectedJob?.job?.id || selectedJob?.preview?.id;
    if (!id) return;
    setActionLoading(true);
    try {
      await updateAdminShopeeJob(id, status, note);
      toast.success(status === 'fila' ? 'Tarefa devolvida à fila.' : 'Status atualizado.');
      setSelectedJob(null);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar a tarefa.');
    } finally {
      setActionLoading(false);
    }
  };

  const createWorker = async () => {
    if (!workerName.trim()) return toast.error('Informe um nome para o computador executor.');
    setCreatingWorker(true);
    try {
      const result = await createAdminShopeeWorker(workerName.trim());
      setCreatedToken(result.token);
      toast.success('Executor cadastrado. Copie a credencial agora.');
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível cadastrar o executor.');
    } finally {
      setCreatingWorker(false);
    }
  };

  const copyToken = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    toast.success('Credencial copiada.');
  };

  const summaryCards = [
    { label: 'Fila ativa', value: queue.summary.queue, icon: ShoppingCart, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Requer decisão', value: queue.summary.attention, icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Para você pagar', value: queue.summary.payment, icon: CreditCard, color: 'text-violet-700', bg: 'bg-violet-50' },
    { label: 'Em acompanhamento', value: queue.summary.tracking, icon: Truck, color: 'text-teal-700', bg: 'bg-teal-50' },
    { label: 'Entregues', value: queue.summary.done, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <section className="overflow-hidden rounded-[2rem] bg-[#17221d] p-6 text-white shadow-2xl md:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-orange-300">
              <ShoppingCart className="h-4 w-4" /> Operação híbrida
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">Central Shopee</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              Pagamentos aprovados entram na fila da VPS. O computador confiável prepara a compra e sempre para antes do pagamento.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black ${onlineWorkers ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/60'}`}>
              {onlineWorkers ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {onlineWorkers ? `${onlineWorkers} executor online` : 'Executor offline'}
            </div>
            <button type="button" onClick={() => load(true)} disabled={refreshing} className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-neutral-900 transition hover:bg-orange-100 disabled:opacity-60">
              <RefreshCw className={`mr-2 inline h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${bg} ${color}`}><Icon className="h-5 w-5" /></span>
            <strong className="mt-4 block text-3xl font-black text-neutral-950">{value || 0}</strong>
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</span>
          </div>
        ))}
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-black text-neutral-950">Fila de pedidos</h2>
            <p className="mt-1 text-xs text-neutral-500">Cada orçamento aparece uma única vez, mesmo quando possui vários produtos.</p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${filter === item.id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-neutral-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando operação...</div>
        ) : queue.jobs.length === 0 ? (
          <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-200 bg-neutral-50/60 px-6 text-center">
            <PackageCheck className="h-12 w-12 text-emerald-300" />
            <h3 className="mt-4 font-black text-neutral-800">Nenhuma tarefa neste filtro</h3>
            <p className="mt-1 max-w-md text-sm text-neutral-500">A fila está pronta. Novos pedidos Shopee entrarão automaticamente depois que a fatura for confirmada como paga.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {queue.jobs.map((job) => {
              const status = STATUS[job.status] || STATUS.falha;
              return (
                <button key={job.id} type="button" onClick={() => openDetails(job)} className="group grid w-full gap-4 rounded-3xl border border-neutral-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-lg md:grid-cols-[1.4fr_.8fr_.6fr_auto] md:items-center md:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-sm font-black text-neutral-950">{job.order_code || job.id.slice(0, 8)}</strong>
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ring-1 ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-500">{job.customer_name} • {job.items_count} {job.items_count === 1 ? 'item' : 'itens'}</p>
                  </div>
                  <div><span className="block text-[9px] font-black uppercase tracking-wider text-neutral-400">Total GSA</span><strong className="text-sm text-neutral-900">{formatCurrency(Number(job.total || 0))}</strong></div>
                  <div><span className="block text-[9px] font-black uppercase tracking-wider text-neutral-400">Executor</span><strong className="text-xs text-neutral-700">{job.worker_name || 'Aguardando'}</strong></div>
                  <div className="flex items-center justify-between gap-3 md:justify-end"><span className="text-[10px] text-neutral-400">{formatDate(job.created_at)}</span><ExternalLink className="h-4 w-4 text-neutral-300 group-hover:text-orange-500" /></div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Bot className="h-5 w-5" /></span><div><h2 className="font-black text-neutral-950">Computadores executores</h2><p className="text-xs text-neutral-500">A credencial nunca contém sua senha da Shopee.</p></div></div>
            <div className="mt-4 space-y-2">
              {workers.length === 0 ? <p className="rounded-2xl bg-neutral-50 p-4 text-xs text-neutral-500">Nenhum computador cadastrado.</p> : workers.map((worker) => {
                const online = isWorkerOnline(worker.last_seen_at);
                return <div key={worker.id} className="flex items-center justify-between rounded-2xl border border-neutral-200 p-4"><div><strong className="block text-sm text-neutral-900">{worker.name}</strong><span className="text-[10px] text-neutral-500">{lastSeenLabel(worker.last_seen_at)}</span></div><span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.12)]' : 'bg-neutral-300'}`} /></div>;
              })}
            </div>
          </div>
          <div className="rounded-3xl bg-neutral-950 p-5 text-white">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-orange-300" /><h3 className="text-sm font-black">Cadastrar este computador</h3></div>
            <p className="mt-2 text-xs leading-5 text-white/55">Crie uma credencial exclusiva para o executor local. Ela será exibida uma única vez.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={workerName} onChange={(event) => setWorkerName(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-orange-300" placeholder="Nome do computador" /><button type="button" onClick={createWorker} disabled={creatingWorker} className="rounded-xl bg-orange-400 px-4 py-3 text-xs font-black text-neutral-950 hover:bg-orange-300 disabled:opacity-60">{creatingWorker ? 'Criando...' : 'Gerar credencial'}</button></div>
            {createdToken && <div className="mt-4 rounded-2xl border border-orange-300/30 bg-orange-300/10 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-orange-200">Copie agora — não será exibida novamente</p><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-orange-100">{createdToken}</code><button type="button" onClick={copyToken} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="Copiar credencial"><Copy className="h-4 w-4" /></button></div></div>}
          </div>
        </div>
      </section>

      <Modal isOpen={Boolean(selectedJob)} onClose={() => setSelectedJob(null)} title="Tarefa Shopee" size="wide">
        {detailLoading || !selectedJob?.job ? <div className="flex min-h-64 items-center justify-center text-neutral-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Abrindo tarefa...</div> : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-neutral-50 p-4"><span className="text-[9px] font-black uppercase text-neutral-400">Pedido</span><strong className="mt-1 block text-sm">{selectedJob.order?.code}</strong></div><div className="rounded-2xl bg-neutral-50 p-4"><span className="text-[9px] font-black uppercase text-neutral-400">Cliente</span><strong className="mt-1 block truncate text-sm">{selectedJob.customer?.name}</strong></div><div className="rounded-2xl bg-neutral-50 p-4"><span className="text-[9px] font-black uppercase text-neutral-400">Total GSA</span><strong className="mt-1 block text-sm">{formatCurrency(Number(selectedJob.order?.total || 0))}</strong></div></div>
            <div><h3 className="text-xs font-black uppercase tracking-wider text-neutral-500">Itens da compra</h3><div className="mt-3 space-y-3">{(selectedJob.items || []).map((item: any) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 sm:flex-row sm:items-center"><img src={item.imagem_url || '/placeholder.png'} alt="" className="h-14 w-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><strong className="block text-sm text-neutral-900">{item.produto_nome}</strong><p className="mt-1 text-xs text-neutral-500">Quantidade: {item.quantidade}{Object.keys(item.variacao_selecionada || {}).length ? ` • ${JSON.stringify(item.variacao_selecionada)}` : ''}</p></div><a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-50 px-4 py-2 text-xs font-black text-orange-700 hover:bg-orange-100">Abrir Shopee <ExternalLink className="h-3.5 w-3.5" /></a></div>)}</div></div>
            {selectedJob.job?.last_error_message && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{selectedJob.job.last_error_message}</div>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-5">
              {['falha','divergencia'].includes(selectedJob.job.status) && <button type="button" disabled={actionLoading} onClick={() => changeStatus('fila','Reprocessamento autorizado no painel.')} className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs font-black text-blue-700 hover:bg-blue-100"><RotateCcw className="h-4 w-4" /> Reenviar à fila</button>}
              {selectedJob.job.status !== 'entregue' && selectedJob.job.status !== 'cancelado' && <button type="button" disabled={actionLoading} onClick={() => changeStatus('cancelado','Cancelado manualmente no painel operacional.')} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs font-black text-red-700 hover:bg-red-100"><XCircle className="h-4 w-4" /> Cancelar tarefa</button>}
              {['comprado','acompanhando','enviado','em_rota'].includes(selectedJob.job.status) && <button type="button" disabled={actionLoading} onClick={() => changeStatus('entregue','Entrega confirmada manualmente no painel.')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> Marcar entregue</button>}
              <button type="button" onClick={() => setSelectedJob(null)} className="rounded-xl bg-neutral-100 px-4 py-3 text-xs font-black text-neutral-700 hover:bg-neutral-200"><Clock3 className="mr-2 inline h-4 w-4" /> Fechar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

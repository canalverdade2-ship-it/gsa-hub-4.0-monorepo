import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Briefcase,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  FileText,
  History,
  MessageSquare,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { providerOperations, type ProviderDemandAction } from '../../lib/providerOperations';
import { removeProviderPrivateFile, resolveProviderFileUrl, uploadProviderPrivateFile } from '../../lib/providerStorage';
import { logService } from '../../lib/logService';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { useFileViewer } from '../../contexts/FileViewerContext';
import { Modal } from '../ui/Modal';

type DemandStatus =
  | 'aguardando_aceite'
  | 'aguardando_atribuicao'
  | 'aberta'
  | 'em_negociacao'
  | 'contraproposta_prestador'
  | 'contraproposta_admin_final'
  | 'ativa'
  | 'em_analise'
  | 'em_ajuste'
  | 'concluida'
  | 'finalizada'
  | 'cancelada'
  | 'concluida_interna';

type Demand = {
  id: string;
  prestador_id: string;
  os_id?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  detalhes?: string | null;
  valor_proposto_admin?: number | null;
  valor_proposto_prestador?: number | null;
  valor_final?: number | null;
  status: DemandStatus;
  created_at: string;
  ajuste_solicitado?: string | null;
  prazo_ajuste?: string | null;
  link_resultado?: string | null;
  arquivos_resultado?: string[] | null;
  arquivos_briefing?: string[] | null;
  ordem_servico?: {
    codigo_os?: string | null;
    cliente_id?: string | null;
    orcamento?: { servico?: { nome?: string | null } | null } | null;
  } | null;
};

type DemandHistory = {
  id: string;
  tipo_evento: string;
  motivo?: string | null;
  created_at: string;
};

type DemandTab = 'abertas' | 'ativas' | 'concluidas';
type ActionMode = 'reject' | 'counteroffer' | 'deliver' | 'return' | 'support' | null;

const OPEN_STATUSES: DemandStatus[] = ['aguardando_aceite', 'aberta', 'em_negociacao', 'contraproposta_prestador', 'contraproposta_admin_final'];
const ACTIVE_STATUSES: DemandStatus[] = ['ativa', 'em_analise', 'em_ajuste'];
const CLOSED_STATUSES: DemandStatus[] = ['concluida', 'finalizada', 'cancelada', 'concluida_interna'];

function nowForInput() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function tabForStatus(status: DemandStatus): DemandTab {
  if (OPEN_STATUSES.includes(status)) return 'abertas';
  if (ACTIVE_STATUSES.includes(status)) return 'ativas';
  return 'concluidas';
}

export function PrestadorDemandas({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { openFile } = useFileViewer();
  const { pendencies, refreshCounts } = useProviderNotifications();
  const [demands, setDemands] = useState<Demand[]>([]);
  const [activeTab, setActiveTab] = useState<DemandTab>('abertas');
  const [selected, setSelected] = useState<Demand | null>(null);
  const [history, setHistory] = useState<DemandHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [reason, setReason] = useState('');
  const [counterValue, setCounterValue] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(nowForInput());
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [resultLink, setResultLink] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [supportMessage, setSupportMessage] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const loadDemands = async () => {
    try {
      const { data, error } = await supabase
        .from('prestador_demandas')
        .select(`
          id,prestador_id,os_id,titulo,descricao,detalhes,
          valor_proposto_admin,valor_proposto_prestador,valor_final,status,
          created_at,ajuste_solicitado,prazo_ajuste,link_resultado,
          arquivos_resultado,arquivos_briefing,
          ordem_servico:ordens_servico(
            codigo_os,cliente_id,
            orcamento:orcamentos(servico:servicos(nome))
          )
        `)
        .eq('prestador_id', prestadorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setDemands((data || []) as unknown as Demand[]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar as demandas.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (demandId: string) => {
    const { data, error } = await supabase
      .from('prestador_demandas_historico')
      .select('id,tipo_evento,motivo,created_at')
      .eq('demanda_id', demandId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[PrestadorDemandas] Erro ao carregar histórico da demanda:', error);
      return;
    }
    setHistory((data || []) as DemandHistory[]);
  };

  useEffect(() => {
    void loadDemands();
    const channel = supabase.channel(`provider-demands-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_demandas', filter: `prestador_id=eq.${prestadorId}` }, () => void loadDemands())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_suporte_demandas', filter: `prestador_id=eq.${prestadorId}` }, () => void refreshCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId, refreshCounts]);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    void loadHistory(selected.id);
    const channel = supabase.channel(`provider-demand-history-${selected.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_demandas_historico', filter: `demanda_id=eq.${selected.id}` }, () => void loadHistory(selected.id))
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(console.error); };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const current = demands.find((demand) => demand.id === selected.id);
    if (current) setSelected(current);
  }, [demands]);

  useEffect(() => {
    if (!initialItemId || !demands.length) return;
    const target = demands.find((demand) => demand.id === initialItemId);
    if (!target) return;
    setActiveTab(tabForStatus(target.status));
    setSelected(target);
    setHighlightedId(target.id);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, demands]);

  const filteredDemands = useMemo(() => demands.filter((demand) => {
    if (activeTab === 'abertas') return OPEN_STATUSES.includes(demand.status);
    if (activeTab === 'ativas') return ACTIVE_STATUSES.includes(demand.status);
    return CLOSED_STATUSES.includes(demand.status);
  }), [activeTab, demands]);

  const resetAction = () => {
    setActionMode(null);
    setReason('');
    setCounterValue('');
    setDeliveryDate(nowForInput());
    setDeliveryNotes('');
    setResultLink('');
    setFiles([]);
    setSupportMessage('');
  };

  const notifyAndLog = async (action: ProviderDemandAction, demand: Demand, detail: string) => {
    await logService.logAction({
      ator_tipo: 'prestador',
      ator_id: prestadorId,
      acao: `DEMANDA_${action.toUpperCase()}`,
      detalhes: `${demand.id}: ${detail}`,
    });
  };

  const finishMutation = async () => {
    resetAction();
    setSelected(null);
    await Promise.all([loadDemands(), refreshCounts()]);
  };

  const acceptDemand = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.transitionDemand(selected.id, 'accept');
      await notifyAndLog('accept', selected, `A demanda "${selected.titulo || selected.id}" foi aceita por ${formatCurrency(Number(selected.valor_proposto_admin || selected.valor_final || 0))}.`);
      toast.success('Demanda aceita e iniciada.');
      await finishMutation();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível aceitar a demanda.');
    } finally {
      setSubmitting(false);
    }
  };

  const uploadFiles = async (demand: Demand, scope: string) => {
    const references: string[] = [];
    for (const file of files) {
      references.push(await uploadProviderPrivateFile({
        bucket: 'entregas_demandas',
        providerId: prestadorId,
        scope: `${demand.id}/${scope}`,
        file,
        maxSizeMb: 25,
      }));
    }
    return references;
  };

  const submitAction = async () => {
    if (!selected || !actionMode || submitting) return;
    setSubmitting(true);
    const uploaded: string[] = [];
    try {
      if (actionMode === 'reject') {
        if (!reason.trim()) throw new Error('Informe o motivo da recusa.');
        await providerOperations.transitionDemand(selected.id, 'reject', { motivo: reason.trim() });
        await notifyAndLog('reject', selected, `A demanda "${selected.titulo || selected.id}" foi recusada. Motivo: ${reason.trim()}`);
      } else if (actionMode === 'counteroffer') {
        const value = Number(counterValue.replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um valor válido.');
        await providerOperations.transitionDemand(selected.id, 'counteroffer', { valor: value, motivo: reason.trim() });
        await notifyAndLog('counteroffer', selected, `Contraproposta de ${formatCurrency(value)} para "${selected.titulo || selected.id}".`);
      } else if (actionMode === 'deliver') {
        if (!deliveryDate) throw new Error('Informe a data da entrega.');
        uploaded.push(...await uploadFiles(selected, 'entrega'));
        await providerOperations.transitionDemand(selected.id, 'deliver', {
          data_entrega: new Date(deliveryDate).toISOString(),
          observacao: deliveryNotes.trim(),
          link: resultLink.trim(),
          arquivos: uploaded,
        });
        await notifyAndLog('deliver', selected, `A demanda "${selected.titulo || selected.id}" foi entregue e aguarda análise.`);
      } else if (actionMode === 'return') {
        if (!reason.trim()) throw new Error('Informe o motivo da devolução.');
        uploaded.push(...await uploadFiles(selected, 'devolucao'));
        await providerOperations.transitionDemand(selected.id, 'return', { motivo: reason.trim(), arquivos: uploaded });
        await notifyAndLog('return', selected, `A demanda "${selected.titulo || selected.id}" foi devolvida. Motivo: ${reason.trim()}`);
      } else {
        if (!supportMessage.trim()) throw new Error('Informe a mensagem de suporte.');
        await providerOperations.requestDemandSupport(selected.id, supportMessage.trim());
      }

      toast.success(actionMode === 'support' ? 'Solicitação de suporte enviada.' : 'Demanda atualizada com sucesso.');
      await finishMutation();
    } catch (error: any) {
      if (uploaded.length) await Promise.allSettled(uploaded.map((reference) => removeProviderPrivateFile(reference)));
      toast.error(error?.message || 'Não foi possível concluir a operação.');
    } finally {
      setSubmitting(false);
    }
  };

  const openReference = async (reference: string, name: string) => {
    try {
      openFile(await resolveProviderFileUrl(reference), name);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o arquivo.');
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-neutral-100 p-1">
        <TabButton label="Abertas" count={pendencies.moduleDemandasAbertas} active={activeTab === 'abertas'} onClick={() => setActiveTab('abertas')} />
        <TabButton label="Ativas" count={pendencies.moduleDemandasAtivas} active={activeTab === 'ativas'} onClick={() => setActiveTab('ativas')} />
        <TabButton label="Concluídas" count={demands.filter((demand) => CLOSED_STATUSES.includes(demand.status)).length} active={activeTab === 'concluidas'} onClick={() => setActiveTab('concluidas')} />
      </div>

      <section className="grid gap-4">
        {filteredDemands.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center text-neutral-400 shadow-sm ring-1 ring-black/5"><Briefcase className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">Nenhuma demanda nesta situação.</p></div>
        ) : filteredDemands.map((demand) => (
          <button id={`demanda-${demand.id}`} key={demand.id} onClick={() => setSelected(demand)} className={`rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md ${highlightedId === demand.id ? 'ring-2 ring-indigo-500' : ''}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={demand.status} />{demand.ordem_servico?.codigo_os && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black text-neutral-500">OS {demand.ordem_servico.codigo_os}</span>}</div>
                <h3 className="mt-3 text-lg font-black">{demand.titulo || demand.ordem_servico?.orcamento?.servico?.nome || 'Demanda de serviço'}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{demand.descricao || demand.detalhes || 'Sem descrição.'}</p>
                <p className="mt-3 flex items-center gap-1 text-xs text-neutral-400"><Clock className="h-3.5 w-3.5" />Recebida em {formatDateTime(demand.created_at)}</p>
              </div>
              <div className="shrink-0 sm:text-right"><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Valor</p><p className="mt-1 text-xl font-black text-emerald-600">{formatCurrency(Number(demand.valor_final || demand.valor_proposto_prestador || demand.valor_proposto_admin || 0))}</p></div>
            </div>
          </button>
        ))}
      </section>

      <Modal isOpen={!!selected} onClose={() => !submitting && setSelected(null)} title={selected?.titulo || 'Detalhes da demanda'} size="wide">
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl bg-neutral-50 p-5 sm:flex-row sm:items-start sm:justify-between"><div><StatusBadge status={selected.status} /><p className="mt-3 text-sm text-neutral-500">{selected.ordem_servico?.codigo_os ? `Ordem de serviço ${selected.ordem_servico.codigo_os}` : `Demanda #${selected.id.slice(0, 8)}`}</p></div><div className="sm:text-right"><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Valor atual</p><p className="mt-1 text-2xl font-black text-emerald-600">{formatCurrency(Number(selected.valor_final || selected.valor_proposto_prestador || selected.valor_proposto_admin || 0))}</p></div></div>
            <div><h3 className="text-sm font-black uppercase tracking-widest text-neutral-400">Descrição</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{selected.detalhes || selected.descricao || 'Sem descrição.'}</p></div>
            {selected.ajuste_solicitado && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Ajuste solicitado:</strong> {selected.ajuste_solicitado}{selected.prazo_ajuste && <p className="mt-1">Prazo: {formatDateTime(selected.prazo_ajuste)}</p>}</div>}
            <FileList title="Arquivos de briefing" references={selected.arquivos_briefing || []} onOpen={openReference} />
            <FileList title="Arquivos da entrega" references={selected.arquivos_resultado || []} onOpen={openReference} />
            {selected.link_resultado && <a href={selected.link_resultado} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-black text-indigo-700"><Eye className="h-4 w-4" />Abrir link da entrega</a>}
            <div className="rounded-2xl border border-neutral-100"><div className="flex items-center gap-2 border-b border-neutral-100 p-4"><History className="h-4 w-4 text-neutral-400" /><h3 className="font-black">Histórico</h3></div>{history.length === 0 ? <p className="p-5 text-sm text-neutral-400">Nenhuma movimentação registrada.</p> : history.map((item) => <div key={item.id} className="border-b border-neutral-100 p-4 last:border-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black capitalize">{item.tipo_evento.replaceAll('_', ' ')}</p><p className="text-xs text-neutral-400">{formatDateTime(item.created_at)}</p></div>{item.motivo && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{item.motivo}</p>}</div>)}</div>
            <DemandActions demand={selected} submitting={submitting} onAccept={acceptDemand} onAction={setActionMode} />
          </div>
        )}
      </Modal>

      <Modal isOpen={!!actionMode} onClose={() => !submitting && resetAction()} title={actionTitle(actionMode)} size="wide">
        <div className="space-y-4">
          {(actionMode === 'reject' || actionMode === 'return') && <TextArea label="Motivo" value={reason} onChange={setReason} placeholder="Explique o motivo..." />}
          {actionMode === 'counteroffer' && <><Field label="Valor da contraproposta" value={counterValue} onChange={setCounterValue} inputMode="decimal" /><TextArea label="Justificativa" value={reason} onChange={setReason} placeholder="Explique sua contraproposta..." /></>}
          {actionMode === 'deliver' && <><Field label="Data da entrega" value={deliveryDate} onChange={setDeliveryDate} type="datetime-local" /><Field label="Link do resultado (opcional)" value={resultLink} onChange={setResultLink} /><TextArea label="Observações" value={deliveryNotes} onChange={setDeliveryNotes} placeholder="Descreva o que está sendo entregue..." /></>}
          {(actionMode === 'deliver' || actionMode === 'return') && <FilePicker files={files} onChange={setFiles} />}
          {actionMode === 'support' && <TextArea label="Mensagem para a administração" value={supportMessage} onChange={setSupportMessage} placeholder="Descreva sua dúvida ou dificuldade..." />}
          <button disabled={submitting} onClick={submitAction} className="w-full rounded-xl bg-neutral-900 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Processando...' : 'Confirmar'}</button>
        </div>
      </Modal>
    </div>
  );
}

function TabButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`rounded-xl px-2 py-3 text-xs font-black sm:text-sm ${active ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>{label} ({count})</button>;
}

function StatusBadge({ status }: { status: DemandStatus }) {
  const config = status === 'cancelada'
    ? { label: 'Cancelada', className: 'bg-red-50 text-red-700', icon: XCircle }
    : CLOSED_STATUSES.includes(status)
      ? { label: 'Concluída', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle }
      : status === 'em_ajuste'
        ? { label: 'Ajuste solicitado', className: 'bg-orange-50 text-orange-700', icon: AlertCircle }
        : status === 'em_analise'
          ? { label: 'Em análise', className: 'bg-amber-50 text-amber-700', icon: Eye }
          : ACTIVE_STATUSES.includes(status)
            ? { label: 'Em execução', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle }
            : status.includes('contraproposta') || status === 'em_negociacao'
              ? { label: 'Em negociação', className: 'bg-purple-50 text-purple-700', icon: DollarSign }
              : { label: 'Aguardando aceite', className: 'bg-blue-50 text-blue-700', icon: Clock };
  const Icon = config.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase ${config.className}`}><Icon className="h-3.5 w-3.5" />{config.label}</span>;
}

function DemandActions({ demand, submitting, onAccept, onAction }: { demand: Demand; submitting: boolean; onAccept: () => void; onAction: (mode: Exclude<ActionMode, null>) => void }) {
  const open = (['aguardando_aceite', 'aberta', 'em_negociacao', 'contraproposta_admin_final'] as DemandStatus[]).includes(demand.status);
  const executable = demand.status === 'ativa' || demand.status === 'em_ajuste';
  return <div className="grid gap-2 border-t border-neutral-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">{open && <><button disabled={submitting} onClick={onAccept} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><CheckCircle className="h-4 w-4" />Aceitar</button><button disabled={submitting} onClick={() => onAction('counteroffer')} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><DollarSign className="h-4 w-4" />Contraproposta</button><button disabled={submitting} onClick={() => onAction('reject')} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><XCircle className="h-4 w-4" />Recusar</button></>}{executable && <><button disabled={submitting} onClick={() => onAction('deliver')} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Upload className="h-4 w-4" />Entregar</button><button disabled={submitting} onClick={() => onAction('return')} className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><ArrowRightLeft className="h-4 w-4" />Devolver</button></>}<button disabled={submitting} onClick={() => onAction('support')} className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><MessageSquare className="h-4 w-4" />Suporte</button></div>;
}

function FileList({ title, references, onOpen }: { title: string; references: string[]; onOpen: (reference: string, name: string) => void }) {
  if (!references.length) return null;
  return <div><h3 className="text-sm font-black uppercase tracking-widest text-neutral-400">{title}</h3><div className="mt-2 flex flex-wrap gap-2">{references.map((reference, index) => <button key={`${reference}-${index}`} onClick={() => onOpen(reference, `${title} ${index + 1}`)} className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-700"><FileText className="h-4 w-4" />Arquivo {index + 1}</button>)}</div></div>;
}

function actionTitle(mode: ActionMode) {
  if (mode === 'reject') return 'Recusar demanda';
  if (mode === 'counteroffer') return 'Enviar contraproposta';
  if (mode === 'deliver') return 'Entregar demanda';
  if (mode === 'return') return 'Devolver para a administração';
  if (mode === 'support') return 'Solicitar suporte';
  return 'Ação da demanda';
}

function Field({ label, value, onChange, type = 'text', inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: 'decimal' | 'text' }) {
  return <div><label className="mb-1 block text-sm font-bold">{label}</label><input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 p-3" /></div>;
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div><label className="mb-1 block text-sm font-bold">{label}</label><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-28 w-full rounded-xl border border-neutral-200 p-3" /></div>;
}

function FilePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const selectFiles = (list: FileList | null) => {
    const selectedFiles: File[] = [];
    if (list) {
      for (let index = 0; index < Math.min(list.length, 5); index += 1) {
        const file = list.item(index);
        if (file) selectedFiles.push(file);
      }
    }
    onChange(selectedFiles);
  };

  return <div><label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 p-6 text-center"><Upload className="h-7 w-7 text-neutral-400" /><span className="mt-2 text-sm font-black">Anexar arquivos privados</span><span className="mt-1 text-xs text-neutral-400">Até 5 arquivos de 25 MB</span><input type="file" multiple className="hidden" onChange={(event) => selectFiles(event.currentTarget.files)} /></label>{files.length > 0 && <div className="mt-2 space-y-1">{files.map((file) => <p key={`${file.name}-${file.size}`} className="truncate rounded-lg bg-neutral-50 px-3 py-2 text-xs font-bold">{file.name}</p>)}</div>}</div>;
}

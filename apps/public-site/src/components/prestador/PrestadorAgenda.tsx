import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle, Clock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { providerOperations } from '../../lib/providerOperations';
import { logService } from '../../lib/logService';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { Modal } from '../ui/Modal';

type Schedule = {
  id: string;
  demanda_id: string;
  data_inicio: string;
  data_fim: string;
  observacoes?: string | null;
  status: string;
  demanda?: { id: string; titulo: string; status: string } | null;
};

type ActiveDemand = { id: string; titulo: string; status: string };

export function PrestadorAgenda({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { refreshCounts } = useProviderNotifications();
  const [activeTab, setActiveTab] = useState<'agendados' | 'concluidos'>('agendados');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [demands, setDemands] = useState<ActiveDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [demandId, setDemandId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [scheduleResult, demandResult] = await Promise.all([
        supabase
          .from('prestador_agendamentos')
          .select('id,demanda_id,data_inicio,data_fim,observacoes,status,demanda:prestador_demandas(id,titulo,status)')
          .eq('prestador_id', prestadorId)
          .order('data_inicio', { ascending: true })
          .limit(100),
        supabase
          .from('prestador_demandas')
          .select('id,titulo,status')
          .eq('prestador_id', prestadorId)
          .in('status', ['ativa', 'em_ajuste'])
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
      if (scheduleResult.error) throw scheduleResult.error;
      if (demandResult.error) throw demandResult.error;
      setSchedules((scheduleResult.data || []) as unknown as Schedule[]);
      setDemands((demandResult.data || []) as ActiveDemand[]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar a agenda.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const channel = supabase.channel(`provider-agenda-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_agendamentos', filter: `prestador_id=eq.${prestadorId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_demandas', filter: `prestador_id=eq.${prestadorId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId]);

  useEffect(() => {
    if (!initialItemId || !schedules.length) return;
    const schedule = schedules.find((item) => item.id === initialItemId);
    if (!schedule) return;
    setActiveTab(schedule.status === 'concluido' ? 'concluidos' : 'agendados');
    setHighlightedId(schedule.id);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, schedules]);

  const scheduled = useMemo(() => schedules.filter((item) => item.status === 'agendado'), [schedules]);
  const completed = useMemo(() => schedules.filter((item) => item.status === 'concluido'), [schedules]);
  const visible = activeTab === 'agendados' ? scheduled : completed;

  const createSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!demandId || !startAt || !endAt) {
      toast.error('Preencha demanda, início e término.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await providerOperations.createSchedule({
        demandaId: demandId,
        dataInicio: new Date(startAt).toISOString(),
        dataFim: new Date(endAt).toISOString(),
        observacoes: notes,
      });
      const selectedDemand = demands.find((item) => item.id === demandId);
      await logService.logAction({ ator_tipo: 'prestador', ator_id: prestadorId, acao: 'CRIAR_AGENDAMENTO', detalhes: `Criou o agendamento ${result?.agendamento_id || ''} para a demanda ${demandId}.` });
      toast.success('Agendamento criado sem conflito de horário.');
      setModalOpen(false);
      setDemandId('');
      setStartAt('');
      setEndAt('');
      setNotes('');
      await Promise.all([load(), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível criar o agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const completeSchedule = async (schedule: Schedule) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.completeSchedule(schedule.id);
      await logService.logAction({ ator_tipo: 'prestador', ator_id: prestadorId, acao: 'CONCLUIR_AGENDAMENTO', detalhes: `Concluiu o agendamento ${schedule.id}.` });
      toast.success('Agendamento concluído.');
      await Promise.all([load(), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir o agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSchedule = async () => {
    if (!deleteTarget || submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.deleteSchedule(deleteTarget.id);
      await logService.logAction({ ator_tipo: 'prestador', ator_id: prestadorId, acao: 'EXCLUIR_AGENDAMENTO', detalhes: `Excluiu o agendamento ${deleteTarget.id}.` });
      toast.success('Agendamento excluído.');
      setDeleteTarget(null);
      await Promise.all([load(), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível excluir o agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 rounded-2xl bg-neutral-100 p-1">
          <button onClick={() => setActiveTab('agendados')} className={`flex-1 rounded-xl px-5 py-3 text-sm font-black ${activeTab === 'agendados' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>Agendados ({scheduled.length})</button>
          <button onClick={() => setActiveTab('concluidos')} className={`flex-1 rounded-xl px-5 py-3 text-sm font-black ${activeTab === 'concluidos' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>Concluídos ({completed.length})</button>
        </div>
        {activeTab === 'agendados' && <button onClick={() => setModalOpen(true)} disabled={!demands.length} className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Plus className="h-4 w-4" />Novo agendamento</button>}
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        {visible.length === 0 ? <Empty tab={activeTab} /> : visible.map((schedule) => <article id={`agendamento-${schedule.id}`} key={schedule.id} className={`border-b border-neutral-100 p-5 last:border-0 ${highlightedId === schedule.id ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-4"><span className="h-fit rounded-xl bg-indigo-50 p-3 text-indigo-600"><Calendar className="h-5 w-5" /></span><div><h3 className="font-black">{schedule.demanda?.titulo || 'Demanda não encontrada'}</h3><p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-neutral-500"><Clock className="h-4 w-4" />{new Date(schedule.data_inicio).toLocaleString('pt-BR')} até {new Date(schedule.data_fim).toLocaleString('pt-BR')}</p>{schedule.observacoes && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">{schedule.observacoes}</p>}</div></div>{schedule.status === 'agendado' && <div className="flex gap-2"><button disabled={submitting} onClick={() => completeSchedule(schedule)} aria-label="Concluir agendamento" className="rounded-xl bg-emerald-50 p-3 text-emerald-600 disabled:opacity-50"><CheckCircle className="h-5 w-5" /></button><button disabled={submitting} onClick={() => setDeleteTarget(schedule)} aria-label="Excluir agendamento" className="rounded-xl bg-red-50 p-3 text-red-600 disabled:opacity-50"><Trash2 className="h-5 w-5" /></button></div>}</div></article>)}
      </section>

      <Modal isOpen={modalOpen} onClose={() => !submitting && setModalOpen(false)} title="Novo agendamento">
        <form onSubmit={createSchedule} className="space-y-4"><div><label className="mb-1 block text-sm font-bold">Demanda ativa</label><select required value={demandId} onChange={(event) => setDemandId(event.target.value)} className="w-full rounded-xl border border-neutral-200 p-3"><option value="">Selecione</option>{demands.map((demand) => <option key={demand.id} value={demand.id}>{demand.titulo}</option>)}</select></div><Field label="Início" type="datetime-local" value={startAt} onChange={setStartAt} /><Field label="Término" type="datetime-local" value={endAt} onChange={setEndAt} /><div><label className="mb-1 block text-sm font-bold">Observações</label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="h-24 w-full rounded-xl border border-neutral-200 p-3" /></div><button disabled={submitting} className="w-full rounded-xl bg-neutral-900 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Validando...' : 'Criar agendamento'}</button></form>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => !submitting && setDeleteTarget(null)} title="Excluir agendamento">
        <div className="space-y-4"><p className="text-sm text-neutral-600">Confirma a exclusão deste agendamento? Apenas itens ainda agendados podem ser removidos.</p><button disabled={submitting} onClick={deleteSchedule} className="w-full rounded-xl bg-red-600 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Excluindo...' : 'Confirmar exclusão'}</button></div>
      </Modal>
    </div>
  );
}

function Field({ label, type, value, onChange }: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="mb-1 block text-sm font-bold">{label}</label><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 p-3" /></div>;
}

function Empty({ tab }: { tab: 'agendados' | 'concluidos' }) {
  return <div className="p-12 text-center text-neutral-400"><Calendar className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">{tab === 'agendados' ? 'Nenhum agendamento futuro.' : 'Nenhum agendamento concluído.'}</p></div>;
}

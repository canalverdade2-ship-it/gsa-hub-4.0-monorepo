import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  History,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, maskCPF, maskPhone } from '../../lib/utils';
import { CareerVacanciesManager } from './CareerVacanciesManager';
import { dispatchCareerStatusNotification } from '../../lib/careerNotifications';

const CAREER_BUCKET = 'gsa-careers-resumes';

type CareerStatus = 'received' | 'under_review' | 'interview_scheduled' | 'approved' | 'talent_pool' | 'rejected';

interface CareerHistoryItem {
  id: number;
  from_status?: CareerStatus | null;
  to_status: CareerStatus;
  actor_type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  note?: string | null;
  interview_at?: string | null;
  interview_location?: string | null;
  created_at: string;
}

interface CareerApplication {
  id: string;
  protocol: string;
  candidate_name: string;
  document: string;
  email: string;
  phone: string;
  desired_area: string;
  employment_type: 'clt' | 'estagio';
  salary_expectation?: number | null;
  linkedin_url?: string | null;
  notes?: string | null;
  status: CareerStatus;
  internal_notes?: string | null;
  public_message?: string | null;
  interview_at?: string | null;
  interview_location?: string | null;
  created_at: string;
  updated_at: string;
  status_changed_at?: string | null;
  closed_at?: string | null;
  has_resume: boolean;
  resume_in_storage: boolean;
  history?: CareerHistoryItem[];
}

const STATUS_META: Record<CareerStatus, { label: string; className: string; icon: typeof Clock }> = {
  received: { label: 'Recebida', className: 'bg-neutral-100 text-neutral-800', icon: Clock },
  under_review: { label: 'Em análise', className: 'bg-blue-100 text-blue-800', icon: Search },
  interview_scheduled: { label: 'Entrevista', className: 'bg-purple-100 text-purple-800', icon: CalendarClock },
  approved: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  talent_pool: { label: 'Banco de talentos', className: 'bg-teal-100 text-teal-800', icon: UserCheck },
  rejected: { label: 'Encerrado', className: 'bg-red-100 text-red-800', icon: AlertCircle },
};

const STATUS_ACTIONS: Array<{ key: CareerStatus; label: string }> = [
  { key: 'under_review', label: 'Colocar em análise' },
  { key: 'interview_scheduled', label: 'Agendar entrevista' },
  { key: 'approved', label: 'Aprovar' },
  { key: 'talent_pool', label: 'Banco de talentos' },
  { key: 'rejected', label: 'Encerrar processo' },
];

function toDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CareersAdminModule() {
  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CareerStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'clt' | 'estagio'>('all');
  const [selectedApp, setSelectedApp] = useState<CareerApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [openingResume, setOpeningResume] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [interviewAt, setInterviewAt] = useState('');
  const [interviewLocation, setInterviewLocation] = useState('');

  const fetchApplications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await callAdminRpc<CareerApplication[]>('gsa_admin_list_career_applications');
      setApplications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Falha ao carregar candidaturas:', error);
      if (!silent) toast.error('Não foi possível carregar as candidaturas do banco.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    const interval = window.setInterval(() => void fetchApplications(true), 15_000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  const openApplication = async (application: CareerApplication) => {
    setDetailLoading(true);
    setSelectedApp(application);
    setInternalNotes(application.internal_notes || '');
    setInterviewAt(toDateTimeLocal(application.interview_at));
    setInterviewLocation(application.interview_location || '');

    try {
      const detail = await callAdminRpc<{
        success?: boolean;
        application?: CareerApplication;
        history?: CareerHistoryItem[];
      }>('gsa_admin_get_career_application', {
        p_application_id: application.id,
      });

      if (!detail?.success || !detail.application) throw new Error('Detalhes não confirmados pelo banco.');
      const complete = { ...detail.application, history: detail.history || [] };
      setSelectedApp(complete);
      setInternalNotes(complete.internal_notes || '');
      setInterviewAt(toDateTimeLocal(complete.interview_at));
      setInterviewLocation(complete.interview_location || '');
    } catch (error) {
      console.error('Falha ao abrir candidatura:', error);
      toast.error('Não foi possível confirmar os detalhes da candidatura.');
      setSelectedApp(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: CareerStatus) => {
    if (!selectedApp) return;

    let interviewIso: string | null = null;
    if (newStatus === 'interview_scheduled') {
      if (!interviewAt || !interviewLocation.trim()) {
        toast.error('Informe a data e o local ou link da entrevista.');
        return;
      }
      const date = new Date(interviewAt);
      if (Number.isNaN(date.getTime())) {
        toast.error('A data da entrevista é inválida.');
        return;
      }
      interviewIso = date.toISOString();
    }
    if (newStatus === 'rejected' && !internalNotes.trim()) {
      toast.error('Informe o motivo interno do encerramento.');
      return;
    }

    setUpdatingStatus(true);
    try {
      const result = await callAdminRpc<{
        success?: boolean;
        application?: CareerApplication;
        history?: CareerHistoryItem[];
      }>('gsa_admin_update_career_application', {
        p_application_id: selectedApp.id,
        p_status: newStatus,
        p_internal_notes: internalNotes.trim() || null,
        p_interview_at: interviewIso,
        p_interview_location: newStatus === 'interview_scheduled' ? interviewLocation.trim() : null,
      });

      if (!result?.success || !result.application) {
        throw new Error('O banco não confirmou a atualização.');
      }

      const updated = { ...result.application, history: result.history || [] };
      setSelectedApp(updated);
      setApplications((current) => current.map((item) => item.id === updated.id ? updated : item));
      setInternalNotes(updated.internal_notes || '');
      setInterviewAt(toDateTimeLocal(updated.interview_at));
      setInterviewLocation(updated.interview_location || '');
      toast.success('Etapa atualizada e registrada no histórico.');
      void dispatchCareerStatusNotification(updated);
      await fetchApplications(true);
    } catch (error) {
      console.error('Falha ao atualizar candidatura:', error);
      const message = error instanceof Error ? error.message : 'Não foi possível atualizar a candidatura.';
      toast.error(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openResume = async () => {
    if (!selectedApp?.has_resume) return;
    setOpeningResume(true);

    try {
      const reference = await callAdminRpc<{
        success?: boolean;
        storage_path?: string | null;
        legacy_reference?: string | null;
      }>('gsa_admin_get_career_resume_reference', {
        p_application_id: selectedApp.id,
      });

      if (!reference?.success) throw new Error('Referência do currículo não confirmada.');

      if (reference.storage_path) {
        const { data, error } = await supabase.storage
          .from(CAREER_BUCKET)
          .createSignedUrl(reference.storage_path, 300);
        if (error || !data?.signedUrl) throw error || new Error('URL temporária não gerada.');
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (reference.legacy_reference) {
        window.open(reference.legacy_reference, '_blank', 'noopener,noreferrer');
        return;
      }

      throw new Error('Currículo não localizado no armazenamento.');
    } catch (error) {
      console.error('Falha ao abrir currículo:', error);
      toast.error('Não foi possível abrir o currículo.');
    } finally {
      setOpeningResume(false);
    }
  };

  const filteredApps = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesSearch = !term || [
        application.candidate_name,
        application.email,
        application.protocol,
        application.document,
        application.desired_area,
      ].some((value) => String(value || '').toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'all' || application.status === statusFilter;
      const matchesType = typeFilter === 'all' || application.employment_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [applications, searchTerm, statusFilter, typeFilter]);

  const metrics = useMemo(() => ({
    total: applications.length,
    received: applications.filter((item) => item.status === 'received').length,
    active: applications.filter((item) => ['under_review', 'interview_scheduled'].includes(item.status)).length,
    completed: applications.filter((item) => ['approved', 'rejected'].includes(item.status)).length,
  }), [applications]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-emerald-600">Recursos Humanos & Seleção</span>
          <h1 className="mt-1 text-2xl font-black text-neutral-900 sm:text-3xl">Gestão de Candidaturas</h1>
          <p className="mt-1 text-xs text-neutral-500">Dados centralizados, histórico auditável e sincronização em tempo real.</p>
        </div>
        <button onClick={() => void fetchApplications()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-100 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar banco
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric title="Total" value={metrics.total} icon={Briefcase} />
        <Metric title="Recebidas" value={metrics.received} icon={Clock} />
        <Metric title="Em processo" value={metrics.active} icon={Search} />
        <Metric title="Finalizadas" value={metrics.completed} icon={ShieldCheck} />
      </div>

      <CareerVacanciesManager />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar por nome, CPF, e-mail, protocolo ou área..." className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium outline-none focus:border-emerald-500" />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | CareerStatus)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-bold outline-none">
          <option value="all">Todos os status</option>
          {Object.entries(STATUS_META).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | 'clt' | 'estagio')} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs font-bold outline-none">
          <option value="all">Todas as modalidades</option>
          <option value="clt">CLT</option>
          <option value="estagio">Estágio</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="p-4">Protocolo / Data</th>
                <th className="p-4">Candidato</th>
                <th className="p-4">Área</th>
                <th className="p-4">Pretensão</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr><td colSpan={6} className="p-10 text-center text-neutral-500">Carregando candidaturas do banco...</td></tr>
              ) : filteredApps.length > 0 ? filteredApps.map((application) => {
                const meta = STATUS_META[application.status] || STATUS_META.received;
                const StatusIcon = meta.icon;
                return (
                  <tr key={application.id} className="hover:bg-neutral-50/70">
                    <td className="p-4"><span className="block font-mono font-bold text-neutral-900">{application.protocol}</span><span className="text-[10px] text-neutral-400">{formatDate(application.created_at)}</span></td>
                    <td className="p-4"><span className="block font-bold text-neutral-900">{application.candidate_name}</span><span className="block text-[10px] text-neutral-400">{maskCPF(application.document)} • {application.email}</span></td>
                    <td className="p-4"><span className="block font-semibold text-neutral-800">{application.desired_area}</span><span className="mt-1 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-black uppercase">{application.employment_type === 'estagio' ? 'Estágio' : 'CLT'}</span></td>
                    <td className="p-4 font-bold text-neutral-900">{application.salary_expectation ? formatCurrency(application.salary_expectation) : 'Não informada'}</td>
                    <td className="p-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${meta.className}`}><StatusIcon className="h-3 w-3" /> {meta.label}</span></td>
                    <td className="p-4 text-right"><button onClick={() => void openApplication(application)} className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-500/20">Avaliar</button></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="p-10 text-center text-neutral-500">Nenhuma candidatura encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{selectedApp.protocol}</span>
                <h2 className="mt-1 text-2xl font-black text-neutral-900">{selectedApp.candidate_name}</h2>
                <p className="mt-1 text-xs text-neutral-500">Registro confirmado no banco • Atualizado em {formatDate(selectedApp.updated_at)}</p>
              </div>
              <button onClick={() => setSelectedApp(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"><X className="h-5 w-5" /></button>
            </div>

            {detailLoading ? (
              <div className="py-16 text-center text-sm font-semibold text-neutral-500">Confirmando detalhes e histórico...</div>
            ) : (
              <div className="mt-5 space-y-6">
                <div className="grid gap-4 rounded-2xl bg-neutral-50 p-4 text-xs sm:grid-cols-3">
                  <Detail icon={User} label="CPF" value={maskCPF(selectedApp.document)} />
                  <Detail icon={Mail} label="E-mail" value={selectedApp.email} />
                  <Detail icon={Phone} label="Telefone" value={maskPhone(selectedApp.phone)} />
                  <Detail icon={Briefcase} label="Área" value={selectedApp.desired_area} />
                  <Detail icon={FileText} label="Modalidade" value={selectedApp.employment_type === 'estagio' ? 'Estágio' : 'CLT (Efetivo)'} />
                  <Detail icon={ShieldCheck} label="Pretensão" value={selectedApp.salary_expectation ? formatCurrency(selectedApp.salary_expectation) : 'Não informada'} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-neutral-500">Currículo</p>
                    {selectedApp.has_resume ? (
                      <button onClick={() => void openResume()} disabled={openingResume} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-60"><Download className="h-4 w-4" /> {openingResume ? 'Gerando acesso...' : 'Abrir por 5 minutos'}</button>
                    ) : <p className="mt-2 text-xs text-neutral-500">Nenhum currículo confirmado no armazenamento.</p>}
                  </div>
                  <div className="rounded-2xl border border-neutral-200 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wider text-neutral-500">LinkedIn</p>
                    {selectedApp.linkedin_url ? <a href={selectedApp.linkedin_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700"><ExternalLink className="h-4 w-4" /> Abrir perfil</a> : <p className="mt-2 text-xs text-neutral-500">Não informado.</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs">
                  <p className="font-black text-neutral-700">Resumo das experiências</p>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-neutral-600">{selectedApp.notes || 'Nenhuma mensagem adicional informada.'}</p>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-purple-600" /><p className="text-xs font-black uppercase tracking-wider text-neutral-700">Dados de entrevista</p></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label><span className="mb-1 block text-[11px] font-bold text-neutral-500">Data e horário</span><input type="datetime-local" value={interviewAt} onChange={(event) => setInterviewAt(event.target.value)} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs outline-none focus:border-purple-500" /></label>
                    <label><span className="mb-1 block text-[11px] font-bold text-neutral-500">Local ou link</span><input value={interviewLocation} onChange={(event) => setInterviewLocation(event.target.value)} placeholder="Google Meet, endereço ou telefone" className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs outline-none focus:border-purple-500" /></label>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-neutral-700">Anotação interna do RH</p>
                  <textarea rows={3} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} placeholder="Obrigatória para encerramento; visível somente no painel administrativo." className="mt-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs outline-none focus:border-emerald-500" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STATUS_ACTIONS.map((action) => (
                      <button key={action.key} disabled={updatingStatus || selectedApp.status === action.key} onClick={() => void handleUpdateStatus(action.key)} className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${selectedApp.status === action.key ? 'bg-emerald-500 text-neutral-950' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'} disabled:cursor-not-allowed disabled:opacity-60`}>{action.label}</button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <div className="flex items-center gap-2"><History className="h-4 w-4 text-emerald-600" /><p className="text-xs font-black uppercase tracking-wider text-neutral-700">Histórico auditável</p></div>
                  <div className="mt-4 space-y-3">
                    {(selectedApp.history || []).length > 0 ? (selectedApp.history || []).map((item) => (
                      <div key={item.id} className="flex gap-3 rounded-xl bg-neutral-50 p-3 text-xs">
                        <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-neutral-800">{item.from_status ? `${STATUS_META[item.from_status]?.label || item.from_status} → ` : ''}{STATUS_META[item.to_status]?.label || item.to_status}</p><span className="text-[10px] text-neutral-400">{new Date(item.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div>
                          <p className="mt-1 text-neutral-500">Responsável: {item.actor_name || item.actor_type}</p>
                          {item.note && <p className="mt-1 whitespace-pre-line text-neutral-600">{item.note}</p>}
                          {item.interview_at && <p className="mt-1 font-semibold text-purple-700"><MapPin className="mr-1 inline h-3 w-3" />{new Date(item.interview_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — {item.interview_location}</p>}
                        </div>
                      </div>
                    )) : <p className="text-xs text-neutral-500">Nenhum evento registrado.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Briefcase }) {
  return <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold text-neutral-500">{title}</span><Icon className="h-4 w-4 text-emerald-600" /></div><div className="mt-2 text-2xl font-black text-neutral-900">{value}</div></div>;
}

function Detail({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return <div className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" /><div><span className="block text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</span><span className="mt-0.5 block break-all font-bold text-neutral-800">{value}</span></div></div>;
}

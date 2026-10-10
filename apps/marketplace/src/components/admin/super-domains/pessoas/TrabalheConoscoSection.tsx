import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Briefcase, User, CalendarClock, CheckCircle2, 
  Search, Clock, AlertCircle, UserCheck, Download, 
  ExternalLink, FileText, Phone, Mail, MapPin, RefreshCw, 
  MessageSquare, ShieldCheck, ArrowRight, Eye
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn, StatusBadge, CommandSlideOver } from '../shared';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { formatCurrency, formatDate, formatDateTime, maskCPF, maskPhone } from '../../../../lib/utils';
import { supabase } from '../../../../lib/supabase';
import { CareerVacanciesManager } from '../../CareerVacanciesManager';
import { dispatchCareerStatusNotification } from '../../../../lib/careerNotifications';

const CAREER_BUCKET = 'gsa-careers-resumes';

type CareerStatus = 'received' | 'under_review' | 'interview_scheduled' | 'approved' | 'talent_pool' | 'rejected';

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
  has_resume: boolean;
  resume_in_storage: boolean;
}

export interface TrabalheConoscoSectionProps {
  initialItemId?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

const STAGE_FILTERS: Array<{ id: 'all' | CareerStatus; label: string }> = [
  { id: 'all', label: 'Todas as Candidaturas' },
  { id: 'received', label: 'Novas / Recebidas' },
  { id: 'under_review', label: 'Em Triagem' },
  { id: 'interview_scheduled', label: 'Entrevistas' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'talent_pool', label: 'Banco de Talentos' },
  { id: 'rejected', label: 'Encerrados' }
];

export function TrabalheConoscoSection({
  initialItemId,
  colaboradorId,
  colaboradorNome
}: TrabalheConoscoSectionProps) {
  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<'all' | CareerStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'clt' | 'estagio'>('all');

  // Candidate Drawer State
  const [selectedApp, setSelectedApp] = useState<CareerApplication | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [interviewAt, setInterviewAt] = useState('');
  const [interviewLocation, setInterviewLocation] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDownloadingResume, setIsDownloadingResume] = useState(false);

  const fetchApplications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await callAdminRpc<CareerApplication[]>('gsa_admin_list_career_applications');
      setApplications(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Erro ao listar candidaturas:', err);
      if (!silent) toast.error('Não foi possível carregar as candidaturas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    const interval = window.setInterval(() => void fetchApplications(true), 15_000);
    return () => window.clearInterval(interval);
  }, [fetchApplications]);

  // Deep Link Handling
  useEffect(() => {
    if (initialItemId && applications.length > 0) {
      const match = applications.find((a) => a.id === initialItemId);
      if (match) {
        handleOpenApplication(match);
      }
    }
  }, [initialItemId, applications]);

  const handleOpenApplication = async (app: CareerApplication) => {
    setSelectedApp(app);
    setInternalNotes(app.internal_notes || '');
    setInterviewAt(app.interview_at ? app.interview_at.slice(0, 16) : '');
    setInterviewLocation(app.interview_location || '');
    setIsDrawerOpen(true);

    try {
      const detail = await callAdminRpc<{
        success?: boolean;
        application?: CareerApplication;
      }>('gsa_admin_get_career_application', { p_application_id: app.id });

      if (detail?.application) {
        setSelectedApp(detail.application);
        setInternalNotes(detail.application.internal_notes || '');
        setInterviewAt(detail.application.interview_at ? detail.application.interview_at.slice(0, 16) : '');
        setInterviewLocation(detail.application.interview_location || '');
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes da candidatura:', err);
    }
  };

  const handleUpdateStatus = async (nextStatus: CareerStatus) => {
    if (!selectedApp) return;
    if (nextStatus === 'interview_scheduled' && !interviewAt) {
      toast.error('Informe a data e horário da entrevista.');
      return;
    }

    setIsUpdating(true);
    const toastId = toast.loading('Atualizando etapa do processo seletivo...');

    try {
      const result = await callAdminRpc<{ success: boolean; application?: CareerApplication }>(
        'gsa_admin_update_career_application',
        {
          p_application_id: selectedApp.id,
          p_status: nextStatus,
          p_internal_notes: internalNotes || null,
          p_interview_at: interviewAt ? new Date(interviewAt).toISOString() : null,
          p_interview_location: interviewLocation || null
        }
      );

      if (!result?.success || !result.application) {
        throw new Error('Não foi possível atualizar a candidatura.');
      }

      toast.success('Etapa do candidato atualizada com sucesso!', { id: toastId });
      void dispatchCareerStatusNotification(result.application);
      setIsDrawerOpen(false);
      setSelectedApp(null);
      fetchApplications();
    } catch (err: any) {
      console.error('Erro ao atualizar candidatura:', err);
      toast.error(`Falha: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadResume = async () => {
    if (!selectedApp) return;
    setIsDownloadingResume(true);
    try {
      const ref = await callAdminRpc<{
        success?: boolean;
        storage_path?: string | null;
        legacy_reference?: string | null;
      }>('gsa_admin_get_career_resume_reference', {
        p_application_id: selectedApp.id
      });

      if (ref?.storage_path) {
        const { data, error } = await supabase.storage
          .from(CAREER_BUCKET)
          .createSignedUrl(ref.storage_path, 300);
        if (error || !data?.signedUrl) throw error || new Error('URL temporária não gerada.');
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (ref?.legacy_reference) {
        window.open(ref.legacy_reference, '_blank', 'noopener,noreferrer');
        return;
      }
      toast.error('Currículo não encontrado no armazenamento seguro.');
    } catch (err: any) {
      console.error('Erro ao obter currículo:', err);
      toast.error('Não foi possível abrir o currículo.');
    } finally {
      setIsDownloadingResume(false);
    }
  };

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesStage = stageFilter === 'all' || app.status === stageFilter;
      const matchesType = typeFilter === 'all' || app.employment_type === typeFilter;
      return matchesStage && matchesType;
    });
  }, [applications, stageFilter, typeFilter]);

  const columns: GridColumn<CareerApplication>[] = [
    {
      key: 'candidate_name',
      header: 'Candidato / Protocolo',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {row.candidate_name}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Protocolo #{row.protocol} • CPF: {maskCPF(row.document)}
          </div>
        </div>
      )
    },
    {
      key: 'desired_area',
      header: 'Área de Interesse',
      sortable: true,
      render: (row) => (
        <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {row.desired_area}
        </span>
      )
    },
    {
      key: 'employment_type',
      header: 'Tipo de Vaga',
      sortable: true,
      align: 'center',
      width: '120px',
      render: (row) => (
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-700">
          {row.employment_type === 'clt' ? 'CLT Integral' : 'Estágio'}
        </span>
      )
    },
    {
      key: 'salary_expectation',
      header: 'Pretensão Salarial',
      sortable: true,
      align: 'right',
      width: '150px',
      render: (row) => (
        <div className="font-mono font-medium text-xs text-slate-800 tabular-nums">
          {row.salary_expectation ? formatCurrency(row.salary_expectation) : 'A combinar'}
        </div>
      )
    },
    {
      key: 'created_at',
      header: 'Data de Envio',
      sortable: true,
      width: '140px',
      render: (row) => (
        <div className="text-xs text-slate-600 font-mono">
          {formatDate(row.created_at)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Etapa do Processo',
      sortable: true,
      align: 'center',
      width: '160px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'center',
      width: '90px',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenApplication(row);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Avaliar
        </button>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Filter Chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGE_FILTERS.map((stage) => {
            const count = stage.id === 'all' ? applications.length : applications.filter((a) => a.status === stage.id).length;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setStageFilter(stage.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                  stageFilter === stage.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{stage.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${stageFilter === stage.id ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
          >
            <option value="all">Todas as Modalidades</option>
            <option value="clt">CLT Integral</option>
            <option value="estagio">Estágio Acadêmico</option>
          </select>

          <button
            type="button"
            onClick={() => fetchApplications()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title="Atualizar candidaturas"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <CareerVacanciesManager />

      {/* Main Grid */}
      <TacticalDataGrid<CareerApplication>
        title="Pipeline de Recrutamento & Seleção (ATS)"
        subtitle="Triagem de talentos, agendamento de entrevistas técnicas e controle de admissões"
        data={filteredApplications}
        columns={columns}
        keyExtractor={(item) => item.id}
        onRowClick={handleOpenApplication}
        isLoading={loading}
        pageSize={15}
        searchPlaceholder="Buscar por nome do candidato, protocolo ou CPF..."
      />

      {/* Candidate Dossier SlideOver */}
      {selectedApp && (
        <CommandSlideOver
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedApp(null);
          }}
          title={selectedApp.candidate_name}
          subtitle={`Protocolo #${selectedApp.protocol} • Candidatura enviada em ${formatDate(selectedApp.created_at)}`}
          badge={<StatusBadge status={selectedApp.status} size="sm" />}
          width="lg"
        >
          <div className="space-y-5 text-xs">
            {/* Candidate Info Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Dossiê do Candidato
                </h4>
                {selectedApp.has_resume && (
                  <button
                    type="button"
                    onClick={handleDownloadResume}
                    disabled={isDownloadingResume}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isDownloadingResume ? 'Abrindo...' : 'Baixar Currículo'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nome Completo</span>
                  <span className="font-semibold text-slate-900">{selectedApp.candidate_name}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">CPF</span>
                  <span className="font-mono font-medium text-slate-900">{maskCPF(selectedApp.document)}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Telefone</span>
                  <span className="text-slate-800">{maskPhone(selectedApp.phone)}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">E-mail</span>
                  <span className="text-slate-800">{selectedApp.email}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Área de Interesse</span>
                  <span className="font-semibold text-indigo-700">{selectedApp.desired_area}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Pretensão Salarial</span>
                  <span className="font-mono font-medium text-slate-800">
                    {selectedApp.salary_expectation ? formatCurrency(selectedApp.salary_expectation) : 'A combinar'}
                  </span>
                </div>

                {selectedApp.linkedin_url && (
                  <div className="sm:col-span-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Perfil LinkedIn</span>
                    <a
                      href={selectedApp.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 underline font-medium inline-flex items-center gap-1 truncate"
                    >
                      {selectedApp.linkedin_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {selectedApp.notes && (
                  <div className="sm:col-span-2 border-t border-slate-100 pt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Mensagem do Candidato</span>
                    <p className="mt-1 text-slate-600 italic">{selectedApp.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recruiter Workspace & Interview Scheduler */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Parecer do Recrutador & Agendamento
              </h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Notas Internas da Avaliação
                  </label>
                  <textarea
                    rows={3}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Pontos fortes, avaliação técnica, histórico da entrevista..."
                    className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Data & Horário da Entrevista
                    </label>
                    <input
                      type="datetime-local"
                      value={interviewAt}
                      onChange={(e) => setInterviewAt(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Local ou Link da Videochamada
                    </label>
                    <input
                      type="text"
                      value={interviewLocation}
                      onChange={(e) => setInterviewLocation(e.target.value)}
                      placeholder="Ex: Google Meet ou Sala 2 - Sede"
                      className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Stage Transition Buttons */}
              <div className="border-t border-slate-200 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                  Avançar Etapa do Processo
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('under_review')}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Em Análise
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('interview_scheduled')}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-1 rounded-lg border border-purple-200 bg-purple-50 p-2 text-xs font-bold text-purple-700 hover:bg-purple-100"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Agendar Entrevista
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('approved')}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 p-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprovar Candidato
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('talent_pool')}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-1 rounded-lg border border-teal-200 bg-teal-50 p-2 text-xs font-bold text-teal-700 hover:bg-teal-100"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Banco de Talentos
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateStatus('rejected')}
                    disabled={isUpdating}
                    className="flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Encerrar Processo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CommandSlideOver>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import {
  Shield,
  Users,
  UserCog,
  Trash2,
  History,
  Plus,
  RefreshCcw,
  KeyRound,
  CheckCircle,
  XCircle,
  Copy,
  Edit2,
  Lock,
  Unlock,
  AlertTriangle,
  Search,
  CheckSquare,
  Square,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { copyToClipboard, formatDateTime, maskPhone } from '../../../../lib/utils';
import { useAdminNotifications } from '../../../../hooks/useAdminNotifications';
import { useConfirm } from '../../../../hooks/useConfirm';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { TacticalDataGrid, CommandSlideOver, StatusBadge, GridColumn } from '../shared';
import { Funcao, Colaborador, SolicitacaoExclusao, AdminSessao, AccessSnapshot } from './types';

export const AVAILABLE_MODULES = [
  ['cadastro', 'Cadastros (Clientes e Prestadores)'],
  ['prestadores', 'Prestadores (Sem acesso a clientes)'],
  ['fornecedores', 'Fornecedores e Compras de Estoque'],
  ['operacoes', 'Operações & Orçamentos'],
  ['loja', 'Loja GSA Store (Catálogo, Vendas e Pós-venda)'],
  ['classificados', 'Classificados GSA'],
  ['viagens', 'GSA Viagens & Turismo'],
  ['saude', 'GSA Saúde & Planos'],
  ['seguros', 'GSA Seguros & Apólices'],
  ['fidelidade', 'Fidelidade & Gamificação'],
  ['promocoes', 'Promoções & Vouchers'],
  ['atendimento', 'Atendimento & Tickets'],
  ['financeiro', 'Financeiro & Faturamento Geral'],
  ['cobranca', 'Cobrança & Inadimplência'],
  ['fiscal', 'Fiscal & NF-e'],
  ['credito_loja', 'Crédito de Loja'],
  ['afiliados', 'GSA Afiliados (Programa e Saques)'],
  ['relatorios', 'Central de Relatórios'],
  ['configuracoes', 'Configurações Globais'],
  ['demandas', 'Demandas Internas'],
  ['sistema', 'Saúde do Sistema & VPS'],
] as const;

const emptyCollaboratorForm = {
  id: '',
  nome: '',
  email: '',
  telefone: '',
  funcao_id: '',
  modules: [] as string[],
};

export function GovernancaAcessosView(_props: { adminType?: string; colaboradorId?: string }) {
  const { refreshCounts } = useAdminNotifications();
  const [activeSubTab, setActiveSubTab] = useState<'colaboradores' | 'funcoes' | 'solicitacoes' | 'sessoes'>('colaboradores');
  const [snapshot, setSnapshot] = useState<AccessSnapshot>({
    functions: [],
    collaborators: [],
    deletion_requests: [],
    sessions: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Collaborator SlideOver state
  const [showCollaboratorDrawer, setShowCollaboratorDrawer] = useState(false);
  const [collaboratorDrawerTab, setCollaboratorDrawerTab] = useState('dados');
  const [collaboratorForm, setCollaboratorForm] = useState(emptyCollaboratorForm);

  // Function SlideOver state
  const [showFunctionDrawer, setShowFunctionDrawer] = useState(false);
  const [functionForm, setFunctionForm] = useState({ id: '', nome: '', descricao: '' });

  // Single-view issued credential modal
  const [issuedCredential, setIssuedCredential] = useState<{ nome: string; credential: string } | null>(null);

  const confirmHook = useConfirm();
  const { confirm } = confirmHook;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await callAdminRpc<AccessSnapshot>('gsa_admin_access_snapshot', { p_limit: 1000 });
      setSnapshot({
        functions: Array.isArray(data?.functions) ? data.functions : [],
        collaborators: Array.isArray(data?.collaborators) ? data.collaborators : [],
        deletion_requests: Array.isArray(data?.deletion_requests) ? data.deletion_requests : [],
        sessions: Array.isArray(data?.sessions) ? data.sessions : [],
      });
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar a gestão de acessos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Supabase Realtime — refresh on colaboradores, funcoes, solicitacoes_exclusao, and admin_sessoes changes
  useRealtimeSubscription([
    { table: 'colaboradores', onChange: () => void load(true) },
    { table: 'funcoes', onChange: () => void load(true) },
    { table: 'solicitacoes_exclusao', onChange: () => void load(true) },
    { table: 'admin_sessoes', onChange: () => void load(true) }
  ]);

  const pendingRequests = useMemo(
    () => snapshot.deletion_requests.filter((request) => request.status === 'pendente'),
    [snapshot.deletion_requests]
  );

  // Save or update collaborator with RPC
  const handleSaveCollaborator = async () => {
    if (collaboratorForm.nome.trim().length < 2) {
      toast.error('Informe o nome do colaborador.');
      return;
    }
    setSaving(true);
    try {
      const result = await callAdminRpc<{
        success: boolean;
        id: string;
        initial_credential?: string | null;
      }>('gsa_admin_save_collaborator', {
        p_id: collaboratorForm.id || null,
        p_payload: {
          nome: collaboratorForm.nome.trim(),
          email: collaboratorForm.email.trim() || null,
          telefone: collaboratorForm.telefone.replace(/\D/g, '') || null,
          funcao_id: collaboratorForm.funcao_id || null,
        },
        p_modules: collaboratorForm.modules,
      });

      if (result?.initial_credential) {
        setIssuedCredential({ nome: collaboratorForm.nome, credential: result.initial_credential });
      }
      toast.success(collaboratorForm.id ? 'Colaborador atualizado com sucesso.' : 'Colaborador criado com sucesso.');
      setShowCollaboratorDrawer(false);
      setCollaboratorForm(emptyCollaboratorForm);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar o colaborador.');
    } finally {
      setSaving(false);
    }
  };

  // Save or update function with RPC
  const handleSaveFunction = async () => {
    if (functionForm.nome.trim().length < 2) {
      toast.error('Informe o nome da função.');
      return;
    }
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_save_function', {
        p_id: functionForm.id || null,
        p_nome: functionForm.nome.trim(),
        p_descricao: functionForm.descricao.trim() || null,
      });
      toast.success(functionForm.id ? 'Função atualizada.' : 'Função criada.');
      setShowFunctionDrawer(false);
      setFunctionForm({ id: '', nome: '', descricao: '' });
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar a função.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle active/suspended status with RPC
  const handleToggleStatus = async (collaborator: Colaborador) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const nextStatus = collaborator.status === 'ativo' ? 'suspenso' : 'ativo';
    try {
      await callAdminRpc('gsa_admin_set_collaborator_status', {
        p_colaborador_id: collaborator.id,
        p_status: nextStatus,
      });
      toast.success(nextStatus === 'suspenso' ? 'Acesso suspenso e sessões revogadas.' : 'Acesso reativado.');
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível alterar o status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Rotate credential with RPC
  const handleRotateCredential = async (collaborator: Colaborador) => {
    if (isSubmitting) return;
    const confirmed = await confirm({
      title: 'Rotacionar Credencial',
      message: `Gerar uma nova credencial para ${collaborator.nome}? Todas as sessões ativas deste colaborador serão encerradas imediatamente.`,
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const result = await callAdminRpc<{ initial_credential: string }>(
        'gsa_admin_rotate_collaborator_credential',
        { p_colaborador_id: collaborator.id }
      );
      setIssuedCredential({ nome: collaborator.nome, credential: result.initial_credential });
      toast.success('Nova credencial gerada com sucesso.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível rotacionar a credencial.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Review safety deletion request with RPC
  const handleReviewDeletion = async (request: SolicitacaoExclusao, decision: 'aprovar' | 'rejeitar') => {
    if (isSubmitting) return;
    const message =
      decision === 'aprovar'
        ? `Aprovar a exclusão permanente do registro em "${request.tabela}"? Esta ação não pode ser desfeita.`
        : 'Rejeitar esta solicitação de exclusão?';
    const confirmed = await confirm({ title: 'Revisão de Exclusão Segura', message });
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await callAdminRpc('gsa_admin_review_deletion_request', {
        p_request_id: request.id,
        p_decision: decision,
      });
      toast.success(decision === 'aprovar' ? 'Exclusão aprovada e registrada em auditoria.' : 'Solicitação rejeitada.');
      await Promise.all([load(true), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível processar a solicitação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit collaborator drawer
  const openEditCollaborator = (collaborator: Colaborador) => {
    setCollaboratorForm({
      id: collaborator.id,
      nome: collaborator.nome,
      email: collaborator.email || '',
      telefone: collaborator.telefone || '',
      funcao_id: collaborator.funcao_id || '',
      modules: Array.isArray(collaborator.modulos) ? collaborator.modulos : [],
    });
    setCollaboratorDrawerTab('dados');
    setShowCollaboratorDrawer(true);
  };

  // Open new collaborator drawer
  const openNewCollaborator = () => {
    setCollaboratorForm(emptyCollaboratorForm);
    setCollaboratorDrawerTab('dados');
    setShowCollaboratorDrawer(true);
  };

  // Helper toggle all modules
  const toggleAllModules = (selectAll: boolean) => {
    if (selectAll) {
      setCollaboratorForm({
        ...collaboratorForm,
        modules: AVAILABLE_MODULES.map(([id]) => id),
      });
    } else {
      setCollaboratorForm({
        ...collaboratorForm,
        modules: [],
      });
    }
  };

  // ── Grid Columns Definitions ──
  const collaboratorColumns: GridColumn<Colaborador>[] = [
    {
      key: 'nome',
      header: 'Nome do Colaborador',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs border border-indigo-100 shrink-0">
            {row.nome.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{row.nome}</span>
            <span className="text-[11px] text-slate-400 font-mono">{row.email || 'Sem e-mail'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'funcao',
      header: 'Função Organizacional',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          {row.funcoes?.nome || 'Sem função'}
        </span>
      ),
    },
    {
      key: 'telefone',
      header: 'Telefone',
      render: (row) => <span className="font-mono text-xs text-slate-600">{row.telefone || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} size="xs" />,
    },
    {
      key: 'modulos',
      header: 'Módulos Autorizados',
      render: (row) => {
        const mods = row.modulos || [];
        if (mods.length === 0) {
          return <span className="text-xs text-slate-400">Somente Dashboard</span>;
        }
        return (
          <div className="flex items-center gap-1 flex-wrap max-w-xs">
            {mods.slice(0, 3).map((m) => (
              <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                {m}
              </span>
            ))}
            {mods.length > 3 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                +{mods.length - 3}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openEditCollaborator(row)}
            className="p-1.5 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Editar Colaborador"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleRotateCredential(row)}
            className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors"
            title="Rotacionar Credencial"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleToggleStatus(row)}
            className={`p-1.5 rounded-md transition-colors ${row.status === 'ativo' ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
            title={row.status === 'ativo' ? 'Suspender Acesso' : 'Reativar Acesso'}
          >
            {row.status === 'ativo' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
        </div>
      ),
    },
  ];

  const functionColumns: GridColumn<Funcao>[] = [
    {
      key: 'nome',
      header: 'Nome da Função',
      sortable: true,
      render: (row) => <span className="font-bold text-slate-900">{row.nome}</span>,
    },
    {
      key: 'descricao',
      header: 'Descrição das Atribuições',
      render: (row) => <span className="text-xs text-slate-600">{row.descricao || 'Sem descrição cadastrada.'}</span>,
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          onClick={() => {
            setFunctionForm({ id: row.id, nome: row.nome, descricao: row.descricao || '' });
            setShowFunctionDrawer(true);
          }}
          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
        >
          Editar
        </button>
      ),
    },
  ];

  const deletionColumns: GridColumn<SolicitacaoExclusao>[] = [
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (row) => <StatusBadge status={row.status} size="xs" />,
    },
    {
      key: 'tabela',
      header: 'Tabela / Recurso',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-mono text-xs font-bold text-slate-800">{row.tabela}</span>
          <span className="block text-[11px] text-slate-400 font-mono">ID: {row.registro_id.slice(0, 10)}...</span>
        </div>
      ),
    },
    {
      key: 'motivo',
      header: 'Motivo da Solicitação',
      render: (row) => <span className="text-xs text-slate-600">{row.motivo || 'Motivo não especificado.'}</span>,
    },
    {
      key: 'solicitante',
      header: 'Solicitado Por',
      render: (row) => <span className="text-xs font-semibold text-slate-700">{row.colaborador_nome || 'Colaborador'}</span>,
    },
    {
      key: 'created_at',
      header: 'Data / Hora',
      sortable: true,
      render: (row) => <span className="text-xs text-slate-500 font-mono">{formatDateTime(row.created_at)}</span>,
    },
    {
      key: 'acoes',
      header: 'Decisão',
      align: 'right',
      render: (row) => {
        if (row.status !== 'pendente') {
          return <span className="text-xs font-medium text-slate-400">Revisado</span>;
        }
        return (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => void handleReviewDeletion(row, 'rejeitar')}
              disabled={isSubmitting}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              Rejeitar
            </button>
            <button
              type="button"
              onClick={() => void handleReviewDeletion(row, 'aprovar')}
              disabled={isSubmitting}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
            >
              Aprovar
            </button>
          </div>
        );
      },
    },
  ];

  const sessionColumns: GridColumn<AdminSessao>[] = [
    {
      key: 'ator',
      header: 'Usuário / Ator',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-slate-900">
          {row.ator_nome || row.usuario_nome || row.ator_id || row.usuario_id || '—'}
        </span>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo de Acesso',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
          {row.ator_tipo || row.usuario_tipo || 'colaborador'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status || 'ativo'} size="xs" />,
    },
    {
      key: 'ip',
      header: 'Endereço IP',
      render: (row) => <span className="font-mono text-xs text-slate-600">{row.ip_address || '—'}</span>,
    },
    {
      key: 'criado_em',
      header: 'Iniciada em',
      sortable: true,
      render: (row) => <span className="font-mono text-xs text-slate-500">{row.criado_em ? formatDateTime(row.criado_em) : '—'}</span>,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* ── Sub-navigation Tab Bar ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSubTab('colaboradores')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'colaboradores'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Colaboradores</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20 text-white">
              {snapshot.collaborators.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('funcoes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'funcoes'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <UserCog className="h-3.5 w-3.5" />
            <span>Funções & Cargos</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20 text-white">
              {snapshot.functions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('solicitacoes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'solicitacoes'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Fila de Exclusões Seguras</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-rose-500 text-white">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('sessoes')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'sessoes'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Sessões Ativas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/20 text-white">
              {snapshot.sessions.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Recarregar dados"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {activeSubTab === 'colaboradores' && (
            <button
              type="button"
              onClick={openNewCollaborator}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Colaborador</span>
            </button>
          )}

          {activeSubTab === 'funcoes' && (
            <button
              type="button"
              onClick={() => {
                setFunctionForm({ id: '', nome: '', descricao: '' });
                setShowFunctionDrawer(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova Função</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Views ── */}
      {activeSubTab === 'colaboradores' && (
        <TacticalDataGrid<Colaborador>
          title="Colaboradores & Perfis de Acesso"
          subtitle="Controle granular de permissões e credenciais de acesso ao GSA OS"
          data={snapshot.collaborators}
          columns={collaboratorColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
          searchPlaceholder="Buscar por nome, e-mail ou telefone..."
          onRowClick={(row) => openEditCollaborator(row)}
        />
      )}

      {activeSubTab === 'funcoes' && (
        <TacticalDataGrid<Funcao>
          title="Funções & Cargos Organizacionais"
          subtitle="Estrutura de papéis e responsabilidades corporativas"
          data={snapshot.functions}
          columns={functionColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
          searchPlaceholder="Buscar função por nome ou descrição..."
        />
      )}

      {activeSubTab === 'solicitacoes' && (
        <TacticalDataGrid<SolicitacaoExclusao>
          title="Fila de Aprovação de Exclusões (Two-Man Rule)"
          subtitle="Registros que exigem dupla confirmação administrativa para expurgo definitivo"
          data={snapshot.deletion_requests}
          columns={deletionColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
          searchPlaceholder="Buscar por tabela, motivo ou solicitante..."
        />
      )}

      {activeSubTab === 'sessoes' && (
        <TacticalDataGrid<AdminSessao>
          title="Sessões Administrativas Ativas"
          subtitle="Rastreamento em tempo real de conexões e autenticações no painel"
          data={snapshot.sessions}
          columns={sessionColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
          searchPlaceholder="Buscar sessão por usuário ou IP..."
        />
      )}

      {/* ── Collaborator Drawer (CommandSlideOver) ── */}
      <CommandSlideOver
        isOpen={showCollaboratorDrawer}
        onClose={() => setShowCollaboratorDrawer(false)}
        title={collaboratorForm.id ? 'Editar Colaborador' : 'Novo Colaborador'}
        subtitle={collaboratorForm.nome || 'Cadastro de operador no sistema'}
        width="xl"
        tabs={[
          { id: 'dados', label: 'Dados Pessoais' },
          { id: 'modulos', label: 'Matriz de Módulos (RBAC)', badge: collaboratorForm.modules.length },
        ]}
        activeTab={collaboratorDrawerTab}
        onTabChange={setCollaboratorDrawerTab}
        primaryAction={{
          label: saving ? 'Salvando...' : 'Salvar Colaborador',
          onClick: handleSaveCollaborator,
          loading: saving,
          variant: 'primary',
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setShowCollaboratorDrawer(false),
        }}
      >
        {collaboratorDrawerTab === 'dados' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Informações de Identificação
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    value={collaboratorForm.nome}
                    onChange={(e) => setCollaboratorForm({ ...collaboratorForm, nome: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: Ana Silva"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Função Organizacional
                  </label>
                  <select
                    value={collaboratorForm.funcao_id}
                    onChange={(e) => setCollaboratorForm({ ...collaboratorForm, funcao_id: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Sem função definida</option>
                    {snapshot.functions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    E-mail Corporativo
                  </label>
                  <input
                    type="email"
                    value={collaboratorForm.email}
                    onChange={(e) => setCollaboratorForm({ ...collaboratorForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    placeholder="exemplo@gsa.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    inputMode="tel"
                    maxLength={15}
                    value={collaboratorForm.telefone}
                    onChange={(e) => setCollaboratorForm({ ...collaboratorForm, telefone: maskPhone(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
            </div>

            <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 flex items-start gap-3">
              <Shield className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-950 leading-relaxed">
                <p className="font-bold">Política de Senhas e Credenciais Seguras:</p>
                <p className="mt-0.5 text-indigo-800">
                  Ao criar um novo colaborador, o sistema gerará automaticamente uma credencial forte e única.
                  Você poderá visualizá-la e copiá-la uma única vez na próxima tela.
                </p>
              </div>
            </div>
          </div>
        )}

        {collaboratorDrawerTab === 'modulos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Módulos do Sistema GSA OS</h4>
                <p className="text-[11px] text-slate-500">
                  Marque os módulos autorizados para esta conta de operador
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleAllModules(true)}
                  className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded"
                >
                  Selecionar Todos
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllModules(false)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {AVAILABLE_MODULES.map(([id, label]) => {
                const checked = collaboratorForm.modules.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      checked
                        ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCollaboratorForm({
                          ...collaboratorForm,
                          modules: checked
                            ? collaboratorForm.modules.filter((m) => m !== id)
                            : [...collaboratorForm.modules, id],
                        });
                      }}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold block">{label}</span>
                      <span className="text-[10px] font-mono text-slate-400 block uppercase">
                        Identificador: {id}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* ── Function Drawer (CommandSlideOver) ── */}
      <CommandSlideOver
        isOpen={showFunctionDrawer}
        onClose={() => setShowFunctionDrawer(false)}
        title={functionForm.id ? 'Editar Função' : 'Nova Função'}
        subtitle="Definição de cargo organizacional"
        width="md"
        primaryAction={{
          label: saving ? 'Salvando...' : 'Salvar Função',
          onClick: handleSaveFunction,
          loading: saving,
          variant: 'primary',
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setShowFunctionDrawer(false),
        }}
      >
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nome do Cargo / Função *
              </label>
              <input
                type="text"
                value={functionForm.nome}
                onChange={(e) => setFunctionForm({ ...functionForm, nome: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                placeholder="Ex: Analista Financeiro Sênior"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Descrição das Atribuições
              </label>
              <textarea
                rows={4}
                value={functionForm.descricao}
                onChange={(e) => setFunctionForm({ ...functionForm, descricao: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                placeholder="Descreva as responsabilidades principais deste cargo..."
              />
            </div>
          </div>
        </div>
      </CommandSlideOver>

      {/* ── Issued Credential One-Time Reveal Modal ── */}
      {issuedCredential && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 relative text-center space-y-5">
            <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
              <KeyRound className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Credencial de Acesso Gerada
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Acesso criado para <strong className="text-slate-800">{issuedCredential.nome}</strong>.
                Esta senha é exibida <strong>apenas uma vez</strong>. Copie e envie ao operador por um canal seguro.
              </p>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl font-mono text-sm font-bold text-emerald-400 tracking-wider break-all select-all border border-slate-800">
              {issuedCredential.credential}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(issuedCredential.credential);
                  toast.success('Credencial copiada para a área de transferência.');
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors"
              >
                <Copy className="h-4 w-4" />
                <span>Copiar Credencial</span>
              </button>

              <button
                type="button"
                onClick={() => setIssuedCredential(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Fechar e Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog {...confirmHook} />
    </div>
  );
}

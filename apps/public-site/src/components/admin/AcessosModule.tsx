import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Copy,
  History,
  KeyRound,
  Plus,
  RefreshCcw,
  Shield,
  Trash2,
  UserCog,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { copyToClipboard, formatDateTime, maskPhone } from '../../lib/utils';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface Funcao {
  id: string;
  nome: string;
  descricao?: string | null;
}

interface Colaborador {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  status: string;
  funcao_id?: string | null;
  created_at?: string;
  funcoes?: { id?: string; nome?: string } | null;
  modulos?: string[];
}

interface SolicitacaoExclusao {
  id: string;
  created_at: string;
  colaborador_id?: string | null;
  colaborador_nome?: string | null;
  tabela: string;
  registro_id: string;
  motivo?: string | null;
  status: string;
}

interface AccessSnapshot {
  functions: Funcao[];
  collaborators: Colaborador[];
  deletion_requests: SolicitacaoExclusao[];
  sessions: any[];
}

interface AcessosModuleProps {
  adminType?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
}

const AVAILABLE_MODULES = [
  ['cadastro', 'Cadastros (clientes e prestadores)'],
  ['prestadores', 'Prestadores (sem acesso a clientes)'],
  ['fornecedores', 'Fornecedores e compras de estoque'],
  ['operacoes', 'Operações'],
  ['loja', 'Loja GSA Store (catálogo, vendas e pós-venda)'],
  ['classificados', 'Classificados'],
  ['viagens', 'Viagens'],
  ['saude', 'GSA Saúde'],
  ['seguros', 'GSA Seguros'],
  ['fidelidade', 'Fidelidade'],
  ['promocoes', 'Promoções'],
  ['atendimento', 'Atendimento'],
  ['financeiro', 'Financeiro Geral'],
  ['cobranca', 'Cobrança'],
  ['fiscal', 'Fiscal'],
  ['credito_loja', 'Crédito de Loja'],
  ['afiliados', 'GSA Afiliados (programa e saques)'],
  ['relatorios', 'Relatórios'],
  ['configuracoes', 'Configurações'],
  ['demandas', 'Demandas internas'],
  ['sistema', 'Saúde do sistema'],
] as const;

const emptyCollaborator = {
  id: '',
  nome: '',
  email: '',
  telefone: '',
  funcao_id: '',
  modules: [] as string[],
};

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-[96vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8">
        {children}
      </div>
    </div>
  );
}

export function AcessosModule(_props: AcessosModuleProps) {
  const { refreshCounts } = useAdminNotifications();
  const [activeTab, setActiveTab] = useState<'colaboradores' | 'funcoes' | 'solicitacoes' | 'sessoes'>('colaboradores');
  const [snapshot, setSnapshot] = useState<AccessSnapshot>({ functions: [], collaborators: [], deletion_requests: [], sessions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collaboratorForm, setCollaboratorForm] = useState(emptyCollaborator);
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
  const [functionForm, setFunctionForm] = useState({ id: '', nome: '', descricao: '' });
  const [showFunctionModal, setShowFunctionModal] = useState(false);
  const [issuedCredential, setIssuedCredential] = useState<{ nome: string; credential: string } | null>(null);

  const confirmHook = useConfirm();
  const { confirm } = confirmHook;

  const load = useCallback(async (silent = false, isMounted = { current: true }) => {
    if (!silent) setLoading(true);
    try {
      const data = await callAdminRpc<AccessSnapshot>('gsa_admin_access_snapshot', { p_limit: 1000 });
      if (isMounted.current) {
        setSnapshot({
          functions: Array.isArray(data?.functions) ? data.functions : [],
          collaborators: Array.isArray(data?.collaborators) ? data.collaborators : [],
          deletion_requests: Array.isArray(data?.deletion_requests) ? data.deletion_requests : [],
          sessions: Array.isArray(data?.sessions) ? data.sessions : [],
        });
      }
    } catch (error: any) {
      if (isMounted.current) toast.error(error?.message || 'Não foi possível carregar a gestão de acessos.');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const isMounted = { current: true };
    void load(false, isMounted);
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  useRealtimeSubscription([
    { table: 'colaboradores', onChange: () => void load(true), debounceMs: 500 },
    { table: 'solicitacoes_exclusao', onChange: () => void load(true), debounceMs: 500 },
    { table: 'sistema_logs', onChange: () => void load(true), debounceMs: 500 },
  ]);

  const pendingRequests = useMemo(
    () => snapshot.deletion_requests.filter((request) => request.status === 'pendente'),
    [snapshot.deletion_requests],
  );

  const saveFunction = async () => {
    if (functionForm.nome.trim().length < 2) return toast.error('Informe o nome da função.');
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_save_function', {
        p_id: functionForm.id || null,
        p_nome: functionForm.nome.trim(),
        p_descricao: functionForm.descricao.trim() || null,
      });
      toast.success(functionForm.id ? 'Função atualizada.' : 'Função criada.');
      setShowFunctionModal(false);
      setFunctionForm({ id: '', nome: '', descricao: '' });
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar a função.');
    } finally {
      setSaving(false);
    }
  };

  const saveCollaborator = async () => {
    if (collaboratorForm.nome.trim().length < 2) return toast.error('Informe o nome do colaborador.');
    setSaving(true);
    try {
      const result = await callAdminRpc<{ success: boolean; id: string; initial_credential?: string | null }>('gsa_admin_save_collaborator', {
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
      toast.success(collaboratorForm.id ? 'Colaborador atualizado.' : 'Colaborador criado.');
      setShowCollaboratorModal(false);
      setCollaboratorForm(emptyCollaborator);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar o colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (collaborator: Colaborador) => {
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

  const rotateCredential = async (collaborator: Colaborador) => {
    if (isSubmitting) return;
    if (!await confirm({ title: 'Atenção', message: `Gerar uma nova credencial para ${collaborator.nome}? Todas as sessões atuais serão encerradas.` })) return;
    setIsSubmitting(true);
    try {
      const result = await callAdminRpc<{ initial_credential: string }>('gsa_admin_rotate_collaborator_credential', {
        p_colaborador_id: collaborator.id,
      });
      setIssuedCredential({ nome: collaborator.nome, credential: result.initial_credential });
      toast.success('Nova credencial criada e sessões anteriores revogadas.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível gerar uma nova credencial.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reviewDeletion = async (request: SolicitacaoExclusao, decision: 'aprovar' | 'rejeitar') => {
    if (isSubmitting) return;
    const message = decision === 'aprovar'
      ? `Aprovar a exclusão permanente do registro em ${request.tabela}?`
      : 'Rejeitar esta solicitação de exclusão?';
    if (!await confirm({ title: 'Confirmação', message })) return;
    setIsSubmitting(true);
    try {
      await callAdminRpc('gsa_admin_review_deletion_request', {
        p_request_id: request.id,
        p_decision: decision,
      });
      toast.success(decision === 'aprovar' ? 'Exclusão aprovada e auditada.' : 'Solicitação rejeitada.');
      await Promise.all([load(true), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível processar a solicitação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteSession = async (session: any) => {
    if (isSubmitting) return;
    if (!await confirm({ title: 'Confirmação', message: 'Tem certeza que deseja excluir esta sessão?' })) return;
    setIsSubmitting(true);
    try {
      await callAdminRpc('gsa_admin_delete_session', {
        p_target_sessao_id: session.id,
      });
      toast.success('Sessão excluída.');
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível excluir a sessão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteAllSessions = async () => {
    if (isSubmitting) return;
    if (!await confirm({ title: 'Confirmação', message: 'Tem certeza que deseja excluir TODAS as sessões do banco de dados? Isso desconectará todos os usuários.' })) return;
    setIsSubmitting(true);
    try {
      await callAdminRpc('gsa_admin_delete_all_sessions', {});
      toast.success('Todas as sessões foram excluídas.');
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível excluir as sessões.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const editCollaborator = (collaborator: Colaborador) => {
    setCollaboratorForm({
      id: collaborator.id,
      nome: collaborator.nome,
      email: collaborator.email || '',
      telefone: collaborator.telefone || '',
      funcao_id: collaborator.funcao_id || '',
      modules: Array.isArray(collaborator.modulos) ? collaborator.modulos : [],
    });
    setShowCollaboratorModal(true);
  };

  const tabs = [
    { id: 'colaboradores' as const, label: 'Colaboradores', icon: Users, count: snapshot.collaborators.length },
    { id: 'funcoes' as const, label: 'Funções', icon: UserCog, count: snapshot.functions.length },
    { id: 'solicitacoes' as const, label: 'Exclusões', icon: Trash2, count: pendingRequests.length },
    { id: 'sessoes' as const, label: 'Sessões', icon: History, count: snapshot.sessions.length },
  ];

  if (loading) {
    return <div className="flex min-h-[360px] items-center justify-center"><RefreshCcw className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Segurança administrativa</p>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-black"><Shield className="h-6 w-6 text-indigo-400" /> Gestão de Acessos</h1>
            <p className="mt-2 text-sm text-white/55">Permissões, credenciais e sessões são processadas no servidor e registradas em auditoria.</p>
          </div>
          <button type="button" onClick={() => void load(true)} disabled={loading || isSubmitting} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-neutral-900 disabled:opacity-50">
            <RefreshCcw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 lg:grid-cols-4">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold ${activeTab === id ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-neutral-500 hover:bg-neutral-50'}`}>
            <Icon className="h-4 w-4" /> {label}
            {count > 0 && <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-white">{count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'colaboradores' && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => { setCollaboratorForm(emptyCollaborator); setShowCollaboratorModal(true); }} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white">
              <Plus className="h-4 w-4" /> Novo colaborador
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {snapshot.collaborators.map((collaborator) => (
              <article key={collaborator.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black text-neutral-900">{collaborator.nome}</h2>
                    <p className="mt-1 text-xs font-semibold text-indigo-600">{collaborator.funcoes?.nome || 'Sem função definida'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${collaborator.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{collaborator.status}</span>
                </div>
                <div className="mt-4 space-y-1 text-xs text-neutral-500">
                  <p>{collaborator.email || 'Sem e-mail'}</p>
                  <p>{collaborator.telefone || 'Sem telefone'}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(collaborator.modulos || []).map((module) => <span key={module} className="rounded-lg bg-neutral-100 px-2 py-1 text-[9px] font-black uppercase text-neutral-600">{module}</span>)}
                  {(collaborator.modulos || []).length === 0 && <span className="text-xs text-neutral-400">Somente dashboard.</span>}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-4">
                  <button type="button" onClick={() => editCollaborator(collaborator)} disabled={isSubmitting} className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-700 disabled:opacity-50">Editar</button>
                  <button type="button" onClick={() => void rotateCredential(collaborator)} disabled={isSubmitting} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50">Credencial</button>
                  <button type="button" onClick={() => void toggleStatus(collaborator)} disabled={isSubmitting} className={`rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50 ${collaborator.status === 'ativo' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{collaborator.status === 'ativo' ? 'Suspender' : 'Ativar'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'funcoes' && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => { setFunctionForm({ id: '', nome: '', descricao: '' }); setShowFunctionModal(true); }} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" /> Nova função</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.functions.map((funcao) => (
              <button key={funcao.id} type="button" onClick={() => { setFunctionForm({ id: funcao.id, nome: funcao.nome, descricao: funcao.descricao || '' }); setShowFunctionModal(true); }} className="rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm hover:border-indigo-200">
                <h2 className="font-black text-neutral-900">{funcao.nome}</h2>
                <p className="mt-2 text-sm text-neutral-500">{funcao.descricao || 'Sem descrição.'}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'solicitacoes' && (
        <section className="space-y-3">
          {snapshot.deletion_requests.length === 0 && <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">Nenhuma solicitação de exclusão.</div>}
          {snapshot.deletion_requests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${request.status === 'pendente' ? 'bg-amber-100 text-amber-700' : request.status === 'aprovado' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{request.status}</span><span className="text-xs text-neutral-400">{formatDateTime(request.created_at)}</span></div>
                  <h2 className="mt-3 font-black">{request.tabela} · {request.registro_id.slice(0, 8)}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{request.motivo || 'Sem motivo informado.'}</p>
                  <p className="mt-1 text-xs text-neutral-400">Solicitado por {request.colaborador_nome || 'colaborador'}</p>
                </div>
                {request.status === 'pendente' && <div className="flex gap-2"><button type="button" onClick={() => void reviewDeletion(request, 'rejeitar')} disabled={isSubmitting} className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Rejeitar</button><button type="button" onClick={() => void reviewDeletion(request, 'aprovar')} disabled={isSubmitting} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><CheckCircle className="h-4 w-4" /> Aprovar</button></div>}
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'sessoes' && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={() => void deleteAllSessions()} disabled={isSubmitting || snapshot.sessions.length === 0} className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Excluir Todas
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-500"><tr><th className="px-4 py-3">Ator</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Criada em</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
                <tbody className="divide-y divide-neutral-100">{snapshot.sessions.map((session) => <tr key={session.id}><td className="px-4 py-3 font-bold">{session.ator_nome || session.usuario_nome || session.ator_id || session.usuario_id || '—'}</td><td className="px-4 py-3">{session.ator_tipo || session.usuario_tipo || '—'}</td><td className="px-4 py-3">{session.status || '—'}</td><td className="px-4 py-3">{session.criado_em ? formatDateTime(session.criado_em) : '—'}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void deleteSession(session)} disabled={isSubmitting} className="text-red-500 hover:text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4 inline" /></button></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {showCollaboratorModal && (
        <Overlay onClose={() => setShowCollaboratorModal(false)}>
          <div className="flex items-center justify-between"><h2 className="text-2xl font-black">{collaboratorForm.id ? 'Editar colaborador' : 'Novo colaborador'}</h2><button type="button" onClick={() => setShowCollaboratorModal(false)}><X className="h-5 w-5" /></button></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">Nome<input value={collaboratorForm.nome} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, nome: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label>
            <label className="text-sm font-bold">Função<select value={collaboratorForm.funcao_id} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, funcao_id: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3"><option value="">Sem função</option>{snapshot.functions.map((funcao) => <option key={funcao.id} value={funcao.id}>{funcao.nome}</option>)}</select></label>
            <label className="text-sm font-bold">E-mail<input type="email" value={collaboratorForm.email} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, email: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label>
            <label className="text-sm font-bold">Telefone<input value={collaboratorForm.telefone} onChange={(event) => setCollaboratorForm({ ...collaboratorForm, telefone: maskPhone(event.target.value) })} placeholder="(00) 00000-0000" maxLength={15} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label>
          </div>
          <div className="mt-6"><h3 className="text-sm font-black uppercase tracking-wider text-neutral-500">Permissões específicas</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{AVAILABLE_MODULES.map(([id, label]) => { const checked = collaboratorForm.modules.includes(id); return <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-neutral-200'}`}><input type="checkbox" checked={checked} onChange={() => setCollaboratorForm({ ...collaboratorForm, modules: checked ? collaboratorForm.modules.filter((module) => module !== id) : [...collaboratorForm.modules, id] })} />{label}</label>; })}</div></div>
          <div className="mt-8 flex justify-end gap-3"><button type="button" onClick={() => setShowCollaboratorModal(false)} className="rounded-xl border border-neutral-200 px-5 py-3 font-bold">Cancelar</button><button type="button" disabled={saving} onClick={() => void saveCollaborator()} className="rounded-xl bg-indigo-600 px-6 py-3 font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button></div>
        </Overlay>
      )}

      {showFunctionModal && (
        <Overlay onClose={() => setShowFunctionModal(false)}>
          <div className="flex items-center justify-between"><h2 className="text-2xl font-black">{functionForm.id ? 'Editar função' : 'Nova função'}</h2><button type="button" onClick={() => setShowFunctionModal(false)}><X className="h-5 w-5" /></button></div>
          <div className="mt-6 space-y-4"><label className="block text-sm font-bold">Nome<input value={functionForm.nome} onChange={(event) => setFunctionForm({ ...functionForm, nome: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label><label className="block text-sm font-bold">Descrição<textarea rows={4} value={functionForm.descricao} onChange={(event) => setFunctionForm({ ...functionForm, descricao: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label></div>
          <div className="mt-8 flex justify-end gap-3"><button type="button" onClick={() => setShowFunctionModal(false)} className="rounded-xl border border-neutral-200 px-5 py-3 font-bold">Cancelar</button><button type="button" disabled={saving} onClick={() => void saveFunction()} className="rounded-xl bg-indigo-600 px-6 py-3 font-black text-white disabled:opacity-50">Salvar</button></div>
        </Overlay>
      )}

      {issuedCredential && (
        <Overlay onClose={() => setIssuedCredential(null)}>
          <div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><KeyRound className="h-7 w-7" /></span><h2 className="mt-4 text-2xl font-black">Credencial de {issuedCredential.nome}</h2><p className="mt-2 text-sm text-neutral-500">Ela é exibida somente agora. Envie por um canal seguro.</p><div className="mt-6 rounded-2xl bg-neutral-950 p-5 font-mono text-xl font-black tracking-widest text-white break-all">{issuedCredential.credential}</div><button type="button" onClick={async () => { await copyToClipboard(issuedCredential.credential); toast.success('Credencial copiada.'); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-black text-white"><Copy className="h-4 w-4" /> Copiar credencial</button><button type="button" onClick={() => setIssuedCredential(null)} className="mt-3 w-full rounded-xl border border-neutral-200 px-5 py-3 font-bold">Fechar</button></div>
        </Overlay>
      )}
      <ConfirmDialog {...confirmHook} />
    </div>
  );
}

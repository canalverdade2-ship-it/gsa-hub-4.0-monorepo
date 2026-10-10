import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';

type Action = 'view' | 'create' | 'edit' | 'duplicate' | 'publish' | 'pause' | 'resume' | 'end' | 'archive' | 'delete' | 'metrics';
type CollaboratorPermission = {
  id: string;
  nome: string;
  email?: string | null;
  status: string;
  enabled: boolean;
  allowed_actions: Action[];
};
type PermissionOverview = { collaborators?: CollaboratorPermission[] };

const DEFAULT_ACTIONS: Action[] = ['view', 'create', 'edit', 'duplicate', 'metrics'];
const ACTIONS: Array<[Action, string]> = [
  ['view', 'Visualizar'],
  ['create', 'Criar'],
  ['edit', 'Editar'],
  ['duplicate', 'Duplicar'],
  ['publish', 'Publicar'],
  ['pause', 'Pausar'],
  ['resume', 'Retomar'],
  ['end', 'Encerrar'],
  ['archive', 'Arquivar'],
  ['delete', 'Excluir'],
  ['metrics', 'Métricas'],
];

export function SiteCampaignPermissionMatrix() {
  const [items, setItems] = useState<CollaboratorPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminRpc<PermissionOverview>('gsa_admin_site_campaign_permission_overview');
      setItems(Array.isArray(data?.collaborators) ? data.collaborators : []);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar as permissões da Central.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ordered = useMemo(() => [...items].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [items]);

  const persist = async (collaborator: CollaboratorPermission, enabled: boolean, actions: Action[]) => {
    const normalized = enabled
      ? [...new Set<Action>(['view', ...actions])]
      : [];
    setSavingId(collaborator.id);
    try {
      await callAdminRpc('gsa_admin_set_site_campaign_permissions', {
        p_collaborator_id: collaborator.id,
        p_enabled: enabled,
        p_allowed_actions: normalized,
      });
      setItems((current) => current.map((item) => item.id === collaborator.id
        ? { ...item, enabled, allowed_actions: normalized }
        : item));
      toast.success(enabled ? 'Permissões atualizadas.' : 'Acesso à Central revogado.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar as permissões.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleModule = (collaborator: CollaboratorPermission) => {
    void persist(collaborator, !collaborator.enabled, collaborator.enabled ? [] : DEFAULT_ACTIONS);
  };

  const toggleAction = (collaborator: CollaboratorPermission, action: Action) => {
    if (action === 'view') return;
    const current = collaborator.allowed_actions || [];
    const next = current.includes(action) ? current.filter((value) => value !== action) : [...current, action];
    void persist(collaborator, true, next);
  };

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-700">
            <ShieldCheck className="h-4 w-4" /> Segurança e autorização
          </p>
          <h2 className="mt-2 text-xl font-black text-neutral-950">Permissões por ação</h2>
          <p className="mt-1 text-sm text-neutral-500">Defina exatamente o que cada colaborador poderá fazer dentro da Central.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-black text-neutral-600"><Users className="h-4 w-4" /> {ordered.length}</span>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-black"><RefreshCw className="h-4 w-4" /> Atualizar</button>
        </div>
      </div>

      {loading ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm font-bold text-neutral-500">Carregando permissões...</p>
      ) : (
        <div className="mt-5 space-y-3">
          {ordered.map((collaborator) => {
            const inactive = collaborator.status !== 'ativo';
            return (
              <article key={collaborator.id} className={`rounded-xl border p-4 ${collaborator.enabled ? 'border-indigo-200 bg-indigo-50/40' : 'border-neutral-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-neutral-900">{collaborator.nome}</p>
                    <p className="truncate text-xs text-neutral-500">{collaborator.email || 'Sem e-mail'} · {collaborator.status}</p>
                  </div>
                  <button
                    type="button"
                    disabled={savingId === collaborator.id || inactive}
                    onClick={() => toggleModule(collaborator)}
                    className={`rounded-lg px-3 py-2 text-xs font-black disabled:opacity-45 ${collaborator.enabled ? 'bg-red-50 text-red-700' : 'bg-emerald-600 text-white'}`}
                  >
                    {savingId === collaborator.id ? 'Salvando...' : collaborator.enabled ? 'Revogar módulo' : 'Conceder módulo'}
                  </button>
                </div>

                {collaborator.enabled && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {ACTIONS.map(([action, label]) => {
                      const checked = collaborator.allowed_actions?.includes(action) || false;
                      return (
                        <label key={action} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${checked ? 'border-indigo-300 bg-white text-indigo-800' : 'border-neutral-200 bg-neutral-50 text-neutral-500'} ${action === 'view' ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={savingId === collaborator.id || action === 'view'}
                            onChange={() => toggleAction(collaborator, action)}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
          {!ordered.length && <p className="text-sm text-neutral-400">Nenhum colaborador cadastrado.</p>}
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import type { SiteCampaign, SiteCampaignAction, SiteCampaignAdminOverview } from '../../types/siteCampaigns';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type MyPermissions = { allowed_actions?: SiteCampaignAction[] };

export function SiteCampaignDeletionPanel() {
  const [campaigns, setCampaigns] = useState<SiteCampaign[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirmHook = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const permissions = await callAdminRpc<MyPermissions>('gsa_admin_site_campaign_my_permissions');
      const allowed = Array.isArray(permissions?.allowed_actions) && permissions.allowed_actions.includes('delete');
      setCanDelete(allowed);
      if (!allowed) {
        setCampaigns([]);
        return;
      }
      const data = await callAdminRpc<SiteCampaignAdminOverview>('gsa_admin_site_campaigns_overview');
      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
    } catch (error) {
      console.error(error);
      setCanDelete(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const deletable = useMemo(
    () => campaigns.filter((campaign) => campaign.status === 'draft' || campaign.status === 'archived'),
    [campaigns],
  );

  const remove = async (campaign: SiteCampaign) => {
    const confirmed = await confirmHook.confirm({
      title: 'Confirmar exclusão',
      message: `Excluir permanentemente “${campaign.internal_name}”?\n\nO histórico da exclusão permanecerá registrado para auditoria.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setDeletingId(campaign.id);
    try {
      await callAdminRpc('gsa_admin_delete_site_campaign', { p_campaign_id: campaign.id });
      setCampaigns((items) => items.filter((item) => item.id !== campaign.id));
      toast.success('Campanha excluída e ação registrada no histórico.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a campanha.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!loading && !canDelete) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <ConfirmDialog {...confirmHook} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-red-700">
            <Archive className="h-4 w-4" /> Exclusão controlada
          </p>
          <h2 className="mt-2 text-xl font-black text-neutral-950">Rascunhos e campanhas arquivadas</h2>
          <p className="mt-1 text-sm text-neutral-500">Campanhas publicadas devem ser encerradas e arquivadas antes da exclusão definitiva.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-black text-neutral-700">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {loading ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm font-bold text-neutral-500">Carregando itens...</p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {deletable.map((campaign) => (
            <article key={campaign.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4">
              <div className="min-w-0">
                <p className="truncate font-black text-neutral-900">{campaign.internal_name}</p>
                <p className="truncate text-xs text-neutral-500">{campaign.title} · {campaign.status === 'draft' ? 'Rascunho' : 'Arquivada'}</p>
              </div>
              <button
                type="button"
                disabled={deletingId === campaign.id}
                onClick={() => void remove(campaign)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> {deletingId === campaign.id ? 'Excluindo...' : 'Excluir'}
              </button>
            </article>
          ))}
          {!deletable.length && <p className="text-sm text-neutral-400">Nenhum rascunho ou item arquivado disponível para exclusão.</p>}
        </div>
      )}
    </section>
  );
}

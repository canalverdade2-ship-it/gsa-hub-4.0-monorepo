import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, History, Tag, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { providerOperations } from '../../lib/providerOperations';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';

type Promotion = {
  id: string;
  titulo: string;
  descricao?: string | null;
  regras?: string | null;
  status: string;
  data_inicio?: string | null;
  data_fim?: string | null;
  created_at: string;
};

type Activation = { promocao_id: string; ativa: boolean };

export function PrestadorPromocoes({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { refreshCounts } = useProviderNotifications();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [activeTab, setActiveTab] = useState<'ativas' | 'historico'>('ativas');
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const load = async (getIsMounted?: () => boolean) => {
    try {
      const [promotionResult, activationResult] = await Promise.all([
        supabase.from('prestador_promocoes').select('id,titulo,descricao,regras,status,data_inicio,data_fim,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('prestador_promocoes_ativacoes').select('promocao_id,ativa').eq('prestador_id', prestadorId).limit(100),
      ]);
      if (promotionResult.error) throw promotionResult.error;
      if (activationResult.error) throw activationResult.error;
      if (!getIsMounted || getIsMounted()) {
        setPromotions((promotionResult.data || []) as Promotion[]);
        setActivations((activationResult.data || []) as Activation[]);
      }
    } catch (error: any) {
      if (!getIsMounted || getIsMounted()) toast.error(error?.message || 'Não foi possível carregar as promoções.');
    } finally {
      if (!getIsMounted || getIsMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void load(() => isMounted);
    const channel = supabase.channel(`provider-promotions-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_promocoes_ativacoes', filter: `prestador_id=eq.${prestadorId}` }, () => void load(() => isMounted))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_promocoes' }, () => void load(() => isMounted))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId]);

  useEffect(() => {
    if (!initialItemId || !promotions.length) return;
    const promotion = promotions.find((item) => item.id === initialItemId);
    if (!promotion) return;
    setActiveTab(promotion.status === 'ativa' ? 'ativas' : 'historico');
    setHighlightedId(promotion.id);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, promotions]);

  const activeIds = useMemo(() => new Set(activations.filter((item) => item.ativa).map((item) => item.promocao_id)), [activations]);
  const now = Date.now();
  const visible = promotions.filter((item) => {
    const notStarted = !!item.data_inicio && new Date(item.data_inicio).getTime() > now;
    const ended = item.status !== 'ativa' || notStarted || (!!item.data_fim && new Date(item.data_fim).getTime() < now);
    return activeTab === 'ativas' ? !ended : ended || activeIds.has(item.id);
  });

  const activate = async (promotion: Promotion) => {
    if (submittingId) return;
    setSubmittingId(promotion.id);
    try {
      await providerOperations.activatePromotion(promotion.id);
      toast.success('Participação confirmada.');
      await Promise.all([load(), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível ativar a promoção.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-fuchsia-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-2xl bg-neutral-100 p-1 sm:w-max">
        <button onClick={() => setActiveTab('ativas')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black sm:flex-none ${activeTab === 'ativas' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-neutral-500'}`}><Zap className="h-4 w-4" />Campanhas ativas</button>
        <button onClick={() => setActiveTab('historico')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black sm:flex-none ${activeTab === 'historico' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-neutral-500'}`}><History className="h-4 w-4" />Histórico</button>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-fuchsia-50/50 p-5"><div><h2 className="text-xl font-black">{activeTab === 'ativas' ? 'Promoções e campanhas' : 'Campanhas encerradas'}</h2><p className="text-sm text-neutral-500">A participação é registrada uma única vez no banco.</p></div><span className="rounded-full bg-fuchsia-100 px-3 py-1 text-sm font-black text-fuchsia-700">{visible.length}</span></div>
        {visible.length === 0 ? <Empty active={activeTab === 'ativas'} /> : <div className="grid gap-4 p-5 md:grid-cols-2">{visible.map((promotion) => {
          const activated = activeIds.has(promotion.id);
          return <article id={`promo-${promotion.id}`} key={promotion.id} className={`relative rounded-2xl border p-5 transition ${highlightedId === promotion.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300' : activated ? 'border-fuchsia-200 bg-fuchsia-50/40' : 'border-neutral-200'}`}>
            {activated && <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700"><CheckCircle className="h-3.5 w-3.5" />Participando</span>}
            <span className="inline-flex rounded-xl bg-fuchsia-100 p-3 text-fuchsia-600"><Tag className="h-6 w-6" /></span>
            <h3 className="mt-4 pr-28 text-xl font-black">{promotion.titulo}</h3>
            <p className="mt-2 text-sm text-neutral-500">{promotion.descricao || 'Campanha especial para prestadores.'}</p>
            {promotion.regras && <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600"><strong>Regras:</strong> {promotion.regras}</div>}
            {promotion.data_fim && <p className="mt-4 flex items-center gap-1.5 text-xs font-bold text-neutral-400"><Clock className="h-4 w-4" />{activeTab === 'ativas' ? `Válida até ${formatDate(promotion.data_fim)}` : `Encerrada em ${formatDate(promotion.data_fim)}`}</p>}
            {activeTab === 'ativas' && !activated && <button disabled={!!submittingId} onClick={() => activate(promotion)} className="mt-5 w-full rounded-xl bg-neutral-900 py-3 text-sm font-black text-white disabled:opacity-50">{submittingId === promotion.id ? 'Confirmando...' : 'Quero participar'}</button>}
          </article>;
        })}</div>}
      </section>
    </div>
  );
}

function Empty({ active }: { active: boolean }) {
  return <div className="p-12 text-center text-neutral-400"><Tag className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">{active ? 'Nenhuma promoção ativa no momento.' : 'Nenhuma campanha no histórico.'}</p></div>;
}

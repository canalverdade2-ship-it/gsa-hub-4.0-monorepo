import { useEffect, useState } from 'react';
import { CheckCircle, Gift, Info, MessageSquare, Star, Trophy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { providerOperations } from '../../lib/providerOperations';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { Modal } from '../ui/Modal';

type Prize = {
  id: string;
  titulo: string;
  descricao?: string | null;
  status: string;
  created_at: string;
  data_resgate?: string | null;
};

export function PrestadorPremios({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { refreshCounts } = useProviderNotifications();
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Prize | null>(null);
  const [details, setDetails] = useState<Prize | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const load = async (getIsMounted?: () => boolean) => {
    try {
      const { data, error } = await supabase
        .from('prestador_premios')
        .select('id,titulo,descricao,status,created_at,data_resgate')
        .eq('prestador_id', prestadorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!getIsMounted || getIsMounted()) setPrizes((data || []) as Prize[]);
    } catch (error: any) {
      if (!getIsMounted || getIsMounted()) toast.error(error?.message || 'Não foi possível carregar os prêmios.');
    } finally {
      if (!getIsMounted || getIsMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void load(() => isMounted);
    const channel = supabase.channel(`provider-prizes-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_premios', filter: `prestador_id=eq.${prestadorId}` }, () => void load(() => isMounted))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId]);

  useEffect(() => {
    if (!initialItemId || !prizes.length) return;
    const prize = prizes.find((item) => item.id === initialItemId);
    if (!prize) return;
    setHighlightedId(prize.id);
    setDetails(prize);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, prizes]);

  const redeem = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.redeemPrize(selected.id);
      await refreshCounts();
      toast.success('Resgate solicitado com sucesso.');
      setSelected(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível resgatar o prêmio.');
    } finally {
      setSubmitting(false);
    }
  };

  const openTicket = async (prize: Prize) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.createTicket(
        `Dúvida sobre o prêmio: ${prize.titulo}`,
        `Solicito informações sobre o prêmio "${prize.titulo}".`,
        true,
      );
      toast.success('Atendimento aberto com sucesso.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-rose-600 border-t-transparent" /></div>;

  const available = prizes.filter((item) => item.status === 'disponivel');
  const redeemed = prizes.filter((item) => item.status === 'resgatado');

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-rose-50/50 p-5"><div><h2 className="flex items-center gap-2 text-xl font-black"><Trophy className="h-5 w-5 text-rose-600" />Prêmios disponíveis</h2><p className="text-sm text-neutral-500">Cada prêmio pode ser resgatado apenas uma vez.</p></div><span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-black text-rose-700">{available.length}</span></div>
        {available.length === 0 ? <Empty text="Nenhum prêmio disponível." /> : <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">{available.map((prize) => <article id={`premio-${prize.id}`} key={prize.id} className={`rounded-3xl border bg-white p-6 transition ${highlightedId === prize.id ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-neutral-200 hover:-translate-y-0.5 hover:shadow-lg'}`}><div className="flex items-start justify-between"><span className="rounded-2xl bg-rose-50 p-4 text-rose-500"><Gift className="h-7 w-7" /></span><span className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase text-rose-700"><Star className="h-3.5 w-3.5 fill-current" />Premium</span></div><h3 className="mt-5 text-xl font-black">{prize.titulo}</h3><p className="mt-2 min-h-12 text-sm text-neutral-500">{prize.descricao || 'Reconhecimento especial pelo seu trabalho.'}</p><button onClick={() => setSelected(prize)} className="mt-5 w-full rounded-xl bg-neutral-900 py-3 text-sm font-black text-white">Resgatar agora</button></article>)}</div>}
      </section>

      {redeemed.length > 0 && <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"><div className="border-b border-neutral-100 p-5"><h3 className="font-black">Histórico de prêmios</h3></div>{redeemed.map((prize) => <div id={`premio-${prize.id}`} key={prize.id} className={`flex flex-col gap-4 border-b border-neutral-100 p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between ${highlightedId === prize.id ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}><div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><Gift className="h-5 w-5" /></span><div><p className="font-black">{prize.titulo}</p><p className="text-xs text-neutral-400">Resgatado em {prize.data_resgate ? formatDate(prize.data_resgate) : 'data não informada'}</p></div></div><div className="flex gap-2"><button onClick={() => setDetails(prize)} className="flex items-center gap-1 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-700"><Info className="h-4 w-4" />Detalhes</button><button disabled={submitting} onClick={() => openTicket(prize)} className="flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 disabled:opacity-50"><MessageSquare className="h-4 w-4" />Dúvidas</button><span className="hidden items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 sm:flex"><CheckCircle className="h-4 w-4" />Resgatado</span></div></div>)}</section>}

      <Modal isOpen={!!selected} onClose={() => !submitting && setSelected(null)} title="Confirmar resgate do prêmio">
        {selected && <div className="space-y-5"><div className="rounded-2xl bg-rose-50 p-5"><Gift className="h-8 w-8 text-rose-600" /><h3 className="mt-3 text-xl font-black text-rose-900">{selected.titulo}</h3><p className="mt-2 text-sm text-rose-700">{selected.descricao}</p></div><p className="text-sm text-neutral-600">A administração será notificada e entrará em contato para organizar a entrega.</p><button disabled={submitting} onClick={redeem} className="w-full rounded-xl bg-rose-600 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Processando...' : 'Confirmar resgate'}</button></div>}
      </Modal>

      <Modal isOpen={!!details} onClose={() => setDetails(null)} title="Detalhes do prêmio">
        {details && <div className="space-y-4"><div><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Prêmio</p><p className="mt-1 text-xl font-black">{details.titulo}</p></div><p className="text-sm text-neutral-600">{details.descricao || 'Sem descrição adicional.'}</p><div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">A equipe administrativa fará contato para confirmar a forma e o prazo de entrega.</div></div>}
      </Modal>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-12 text-center text-neutral-400"><Gift className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">{text}</p></div>;
}

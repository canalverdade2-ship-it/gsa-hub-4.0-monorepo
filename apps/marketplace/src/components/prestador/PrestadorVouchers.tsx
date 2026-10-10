import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Ticket } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { providerOperations } from '../../lib/providerOperations';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { Modal } from '../ui/Modal';

type Voucher = {
  id: string;
  codigo: string;
  valor: number;
  descricao?: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

export function PrestadorVouchers({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { refreshCounts } = useProviderNotifications();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('');
  const [selected, setSelected] = useState<Voucher | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const load = async (getIsMounted?: () => boolean) => {
    try {
      const { data, error } = await supabase
        .from('prestador_vouchers')
        .select('id,codigo,valor,descricao,status,created_at,updated_at')
        .eq('prestador_id', prestadorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!getIsMounted || getIsMounted()) setVouchers((data || []) as Voucher[]);
    } catch (error: any) {
      if (!getIsMounted || getIsMounted()) toast.error(error?.message || 'Não foi possível carregar os vouchers.');
    } finally {
      if (!getIsMounted || getIsMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void load(() => isMounted);
    const channel = supabase.channel(`provider-vouchers-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_vouchers', filter: `prestador_id=eq.${prestadorId}` }, () => void load(() => isMounted))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId]);

  useEffect(() => {
    if (!initialItemId || !vouchers.length) return;
    const voucher = vouchers.find((item) => item.id === initialItemId);
    if (!voucher) return;
    setHighlightedId(voucher.id);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, vouchers]);

  const filtered = useMemo(() => monthFilter ? vouchers.filter((item) => item.created_at.startsWith(monthFilter)) : vouchers, [monthFilter, vouchers]);
  const available = filtered.filter((item) => ['ativo', 'disponivel'].includes(item.status));
  const redeemed = filtered.filter((item) => ['resgatado', 'pago'].includes(item.status));

  const redeem = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const result = await providerOperations.redeemVoucher(selected.id);
      await refreshCounts();
      toast.success('Voucher resgatado e creditado na carteira.');
      setSelected(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível resgatar o voucher.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-black">Meus vouchers</h2><p className="text-sm text-neutral-500">O resgate é processado de forma atômica e só pode ocorrer uma vez.</p></div>
        <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold">
          <option value="">Todos os meses</option>
          {Array.from({ length: 12 }, (_, index) => {
            const month = String(index + 1).padStart(2, '0');
            const year = new Date().getFullYear();
            return <option key={month} value={`${year}-${month}`}>{new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(year, index))}</option>;
          })}
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-indigo-50/50 p-5"><div><h3 className="font-black">Disponíveis</h3><p className="text-sm text-neutral-500">Crédito imediato na carteira após a confirmação.</p></div><span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-black text-indigo-700">{available.length}</span></div>
        {available.length === 0 ? <Empty text="Nenhum voucher disponível." /> : <div className="grid gap-4 p-5 md:grid-cols-2">{available.map((voucher) => <VoucherCard key={voucher.id} voucher={voucher} highlighted={highlightedId === voucher.id} onClick={() => setSelected(voucher)} />)}</div>}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-neutral-100 p-5"><h3 className="font-black">Histórico de resgates</h3></div>
        {redeemed.length === 0 ? <Empty text="Nenhum voucher resgatado." /> : redeemed.map((voucher) => <div id={`voucher-${voucher.id}`} key={voucher.id} className={`flex items-center justify-between border-b border-neutral-100 p-4 last:border-0 ${highlightedId === voucher.id ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}><div><p className="font-black">{formatCurrency(Number(voucher.valor))}</p><p className="text-xs text-neutral-400">{voucher.codigo} • {formatDateTime(voucher.updated_at || voucher.created_at)}</p></div><span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><CheckCircle className="h-4 w-4" />Resgatado</span></div>)}
      </section>

      <Modal isOpen={!!selected} onClose={() => !submitting && setSelected(null)} title="Confirmar resgate">
        {selected && <div className="space-y-5"><div className="rounded-2xl bg-indigo-50 p-5 text-indigo-900"><div className="flex items-center gap-3"><Ticket className="h-7 w-7" /><div><p className="font-black">{selected.codigo}</p><p className="text-sm text-indigo-700">{selected.descricao || 'Voucher de bonificação'}</p></div></div><p className="mt-5 text-3xl font-black">{formatCurrency(Number(selected.valor))}</p></div><div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><Clock className="mt-0.5 h-4 w-4 shrink-0" />Após a confirmação, o voucher será consumido e não poderá ser usado novamente.</div><button disabled={submitting} onClick={redeem} className="w-full rounded-xl bg-indigo-600 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Processando...' : 'Confirmar resgate'}</button></div>}
      </Modal>
    </div>
  );
}

function VoucherCard({ voucher, highlighted, onClick }: { key?: string; voucher: Voucher; highlighted: boolean; onClick: () => void }) {
  return <article id={`voucher-${voucher.id}`} className={`rounded-2xl border p-5 transition ${highlighted ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300' : 'border-indigo-100 bg-white'}`}><Ticket className="h-9 w-9 text-indigo-500" /><p className="mt-4 text-2xl font-black text-indigo-900">{formatCurrency(Number(voucher.valor))}</p><p className="mt-1 font-mono text-xs font-bold text-indigo-600">{voucher.codigo}</p><p className="mt-3 min-h-10 text-sm text-neutral-500">{voucher.descricao || 'Voucher de bonificação'}</p><button onClick={onClick} className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-sm font-black text-white">Resgatar</button></article>;
}

function Empty({ text }: { text: string }) {
  return <div className="p-12 text-center text-neutral-400"><Ticket className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">{text}</p></div>;
}

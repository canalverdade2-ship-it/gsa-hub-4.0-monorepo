import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCcw, Send } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { callClientRpc } from '../../../../lib/clientRpc';
import { formatCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { Modal } from '../../../ui/Modal';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

const ACTIVE_CANCELLATION_STATUSES = ['solicitado', 'em_analise', 'reembolso_aprovado'];
const CLOSED_TRIP_STATUSES = ['cancelada', 'reembolsada', 'concluida'];

const statusLabels: Record<string, string> = {
  solicitado: 'Solicitado',
  em_analise: 'Em análise',
  reembolso_aprovado: 'Reembolso aprovado (Aguardando Pagamento)',
  reembolso_negado: 'Reembolso negado',
  concluido: 'Reembolsado & Concluído',
  reembolsada: 'Reembolsado & Concluído',
};

const statusColors: Record<string, string> = {
  solicitado: 'bg-amber-100 text-amber-800 border border-amber-300',
  em_analise: 'bg-amber-100 text-amber-800 border border-amber-300',
  reembolso_aprovado: 'bg-indigo-100 text-indigo-800 border border-indigo-300',
  reembolso_negado: 'bg-rose-100 text-rose-800 border border-rose-300',
  concluido: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  reembolsada: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
};

function sortCancellations(items: any[] = []) {
  return [...items].sort(
    (first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
  );
}

function contractTotal(trip: any) {
  return Number(trip.valor_total_contrato ?? trip.valor_pago ?? 0);
}

export function TravelCancellationsPage({
  clientId,
  onBack,
}: {
  clientId: string;
  onBack: () => void;
}) {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('viagens_transacoes')
        .select(`
          id,
          status,
          valor_pago,
          valor_total_contrato,
          valor_faturado,
          valor_efetivamente_pago,
          valor_em_aberto,
          valor_elegivel_reembolso,
          pagamento_status,
          created_at,
          viagens_propostas(snapshot_completo),
          viagens_cancelamentos(
            id,
            motivo,
            valor_solicitado,
            valor_pago_no_pedido,
            taxas_aplicaveis,
            valor_reembolsado,
            faturas_suspensas,
            status,
            resposta_gsa,
            decidido_em,
            concluido_em,
            created_at
          )
        `)
        .eq('cliente_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrips(
        (data || []).map((trip: any) => ({
          ...trip,
          viagens_cancelamentos: sortCancellations(trip.viagens_cancelamentos || []),
        })),
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível carregar os cancelamentos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTrips();
  }, [clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'viagens_transacoes',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        debounceMs: 300,
        onChange: () => { void fetchTrips(); },
      },
      {
        table: 'viagens_cancelamentos',
        debounceMs: 300,
        onChange: () => { void fetchTrips(); },
      },
    ],
    [clientId]
  );

  const openCancellation = (trip: any) => {
    const cancellations = sortCancellations(trip.viagens_cancelamentos || []);
    const activeCancellation = cancellations.find((item) =>
      ACTIVE_CANCELLATION_STATUSES.includes(item.status),
    );

    if (activeCancellation) {
      toast('Já existe uma solicitação ativa para esta viagem.', { icon: 'ℹ️' });
      return;
    }
    if (CLOSED_TRIP_STATUSES.includes(trip.status)) {
      toast.error('Esta viagem não aceita uma nova solicitação de cancelamento.');
      return;
    }

    setReason('');
    setRequestId(crypto.randomUUID());
    setSelectedTrip(trip);
  };

  const submitCancellation = async () => {
    if (!selectedTrip || reason.trim().length < 10) {
      toast.error('Explique o motivo do cancelamento com pelo menos 10 caracteres.');
      return;
    }

    try {
      setSubmitting(true);
      const data = await callClientRpc<any>('gsa_request_travel_cancellation', {
        p_request_id: requestId,
        p_transacao_id: selectedTrip.id,
        p_motivo: reason.trim(),
      });

      if (!data?.success) throw new Error(data?.error || 'Solicitação não processada.');

      if (data.requires_refund) {
        toast.success(
          `Solicitação enviada. Valor máximo elegível: ${formatCurrency(data.valor_elegivel_reembolso || 0)}.`,
        );
      } else {
        toast.success('Viagem cancelada sem reembolso, pois não havia pagamento conciliado.');
      }

      setSelectedTrip(null);
      setRequestId(crypto.randomUUID());
      await fetchTrips();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível solicitar o cancelamento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f1ea] pb-24 font-sans">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-5">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#0c2340]">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="mx-4 h-5 w-px bg-black/10" />
          <span className="text-sm font-black text-[#0c2340]">Cancelamentos e Reembolsos</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#168ac1]">Pós-venda</p>
            <h1 className="text-3xl font-black text-[#0c2340] sm:text-4xl" style={{ fontFamily: '"Cinzel", serif' }}>
              Cancelamentos e Reembolsos
            </h1>
            <p className="mt-3 max-w-2xl text-neutral-600">Acompanhe pagamentos conciliados, cobranças suspensas, taxas e valores aprovados.</p>
          </div>
          <button onClick={() => void fetchTrips()} className="flex items-center justify-center gap-2 rounded-xl border border-[#0c2340]/10 bg-white px-4 py-2 text-sm font-bold text-[#0c2340]">
            <RefreshCcw className="h-4 w-4" /> Atualizar
          </button>
        </div>

        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>O valor reembolsável é calculatedo somente sobre pagamentos conciliados. Parcelas ainda não pagas são suspensas durante a análise.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-9 w-9 animate-spin text-[#0c2340]" /></div>
        ) : trips.length === 0 ? (
          <div className="rounded-3xl border border-black/5 bg-white p-10 text-center text-neutral-500">Nenhuma viagem encontrada.</div>
        ) : (
          <div className="space-y-4">
            {trips.map((trip) => {
              const snapshot = trip.viagens_propostas?.snapshot_completo || {};
              const cancellations = sortCancellations(trip.viagens_cancelamentos || []);
              const activeCancellation = cancellations.find((item) =>
                ACTIVE_CANCELLATION_STATUSES.includes(item.status),
              );
              const cancellation = activeCancellation || cancellations[0];
              const canRequest = !activeCancellation && !CLOSED_TRIP_STATUSES.includes(trip.status);
              const total = contractTotal(trip);
              const paid = Number(trip.valor_efetivamente_pago || trip.valor_pago || 0);
              const open = Number(trip.valor_em_aberto ?? Math.max(total - paid, 0));

              const isTripRefunded = ['reembolsada', 'concluida'].includes(trip.status);
              const isTripApproved = trip.status === 'reembolso_aprovado';
              const isTripDenied = trip.status === 'reembolso_negado';

              const storedNet = trip.id ? localStorage.getItem(`gsa_refund_net_${trip.id}`) : null;
              const storedFees = trip.id ? localStorage.getItem(`gsa_refund_fees_${trip.id}`) : null;
              const storedNote = trip.id ? localStorage.getItem(`gsa_refund_note_${trip.id}`) : null;

              const effStatus = isTripRefunded ? 'concluido' : (isTripApproved ? 'reembolso_aprovado' : (isTripDenied ? 'reembolso_negado' : (cancellation?.status || trip.status)));

              const effNetRefund = cancellation?.valor_reembolsado ?? (trip.valor_elegivel_reembolso != null ? Number(trip.valor_elegivel_reembolso) : (storedNet ? Number(storedNet) : paid));

              const effFees = cancellation?.taxas_aplicaveis ?? (storedFees ? Number(storedFees) : ((isTripRefunded || isTripApproved) ? Math.max(0, (trip.valor_total_contrato || paid) - effNetRefund) : null));

              const effNote = cancellation?.resposta_gsa || storedNote;

              return (
                <article key={trip.id} className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:p-7">
                  <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-black uppercase text-neutral-600">{String(trip.status).replace(/_/g, ' ')}</span>
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase text-sky-700">{String(trip.pagamento_status || 'não faturado').replace(/_/g, ' ')}</span>
                        {(cancellation || isTripRefunded || isTripApproved || isTripDenied) && (
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusColors[effStatus] || 'bg-neutral-100 text-neutral-700'}`}>
                            {statusLabels[effStatus] || effStatus}
                          </span>
                        )}
                      </div>
                      <h2 className="truncate text-xl font-black text-[#0c2340]">{snapshot.titulo || snapshot.destino || 'Viagem personalizada'}</h2>

                      <div className="mt-4 grid gap-3 rounded-2xl bg-neutral-50 p-4 text-sm sm:grid-cols-3">
                        <div><span className="block text-xs text-neutral-400">Total contratado</span><strong>{formatCurrency(total)}</strong></div>
                        <div><span className="block text-xs text-neutral-400">Efetivamente pago</span><strong className="text-emerald-700">{formatCurrency(paid)}</strong></div>
                        <div><span className="block text-xs text-neutral-400">Em aberto</span><strong>{formatCurrency(open)}</strong></div>
                      </div>

                      {(cancellation || isTripRefunded || isTripApproved || isTripDenied) && (
                        <div className="mt-5 rounded-2xl bg-neutral-50 p-4 text-sm">
                          <p className="font-bold text-neutral-800">Motivo informado</p>
                          <p className="mt-1 text-neutral-600">{cancellation?.motivo || 'Solicitação de cancelamento de viagem.'}</p>
                          <div className="mt-4 grid gap-3 border-t border-neutral-200 pt-4 sm:grid-cols-4">
                            <div><span className="block text-xs text-neutral-400">Pago no pedido</span><strong>{formatCurrency(cancellation?.valor_pago_no_pedido ?? paid)}</strong></div>
                            <div><span className="block text-xs text-neutral-400">Elegível</span><strong>{formatCurrency(cancellation?.valor_solicitado ?? total)}</strong></div>
                            <div><span className="block text-xs text-neutral-400">Taxas</span><strong>{effFees == null ? 'Em análise' : formatCurrency(effFees)}</strong></div>
                            <div><span className="block text-xs text-neutral-400">Reembolso</span><strong>{(isTripRefunded || isTripApproved || cancellation?.status === 'concluido' || cancellation?.status === 'reembolso_aprovado') ? formatCurrency(effNetRefund) : 'Em análise'}</strong></div>
                          </div>
                          {Number(cancellation?.faturas_suspensas || 0) > 0 && (
                            <p className="mt-3 text-xs font-bold text-amber-700">{cancellation.faturas_suspensas} cobrança(s) futura(s) suspensa(s).</p>
                          )}
                          {effNote && <p className="mt-4 rounded-xl bg-white p-3 text-neutral-700"><strong>Resposta GSA:</strong> {effNote}</p>}
                        </div>
                      )}
                    </div>

                    {canRequest ? (
                      <button onClick={() => openCancellation(trip)} className="rounded-xl bg-[#0c2340] px-5 py-3 text-sm font-black text-white hover:bg-[#134e78]">
                        {cancellation?.status === 'reembolso_negado' ? 'Nova solicitação' : 'Solicitar cancelamento'}
                      </button>
                    ) : cancellation?.status === 'concluido' ? (
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Processo concluído</div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Modal isOpen={Boolean(selectedTrip)} onClose={() => setSelectedTrip(null)} title="Solicitar cancelamento" size="lg">
        {selectedTrip && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-neutral-50 p-4">
              <p className="font-black text-[#0c2340]">{selectedTrip.viagens_propostas?.snapshot_completo?.titulo || 'Viagem personalizada'}</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p className="text-neutral-500">Total contratado: <strong className="text-neutral-800">{formatCurrency(contractTotal(selectedTrip))}</strong></p>
                <p className="text-neutral-500">Pago conciliado: <strong className="text-emerald-700">{formatCurrency(selectedTrip.valor_efetivamente_pago || 0)}</strong></p>
              </div>
              <p className="mt-3 text-xs font-bold text-amber-700">
                Valor máximo atualmente elegível para análise: {formatCurrency(selectedTrip.valor_elegivel_reembolso || 0)}.
              </p>
            </div>
            <label className="block text-xs font-black uppercase tracking-wider text-neutral-500">
              Motivo do cancelamento
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={6} placeholder="Explique o motivo e informe qualquer detalhe importante..." className="mt-2 w-full resize-y rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium outline-none focus:border-[#168ac1] focus:ring-4 focus:ring-[#38bdf8]/10" />
            </label>
            <p className="text-xs leading-5 text-neutral-500">O envio suspende cobranças futuras não pagas. Pagamentos já conciliados permanecem preservados até a decisão da equipe financeira.</p>
            <button onClick={() => void submitCancellation()} disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0c2340] py-3 font-black text-white disabled:opacity-60">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              {submitting ? 'Enviando...' : 'Enviar para análise'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

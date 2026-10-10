import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, Loader2, MapPin, Plane } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { formatCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';

const VOUCHER_BUCKET = 'viagens-vouchers';

const statusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Aguardando Pagamento', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  pagamento_confirmado: { label: 'Pagamento Confirmado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  compra_fornecedor_pendente: { label: 'Compra Pendente', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  compra_fornecedor_em_andamento: { label: 'Compra em Andamento', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  pacote_adquirido: { label: 'Pacote Adquirido', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  emissao_em_andamento: { label: 'Emissão em Andamento', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  documentos_disponiveis: { label: 'Vouchers Disponíveis', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  viagem_confirmada: { label: 'Viagem Confirmada', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  concluida: { label: 'Concluída', color: 'bg-neutral-100 text-neutral-800 border-neutral-200' },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-200' },
  reembolso_em_analise: { label: 'Reembolso em Análise', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  reembolsada: { label: 'Reembolsada', color: 'bg-neutral-100 text-neutral-800 border-neutral-200' },
};

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  nao_faturado: { label: 'Cobrança não gerada', color: 'bg-neutral-100 text-neutral-700' },
  aguardando_pagamento: { label: 'Aguardando pagamento', color: 'bg-amber-100 text-amber-800' },
  parcialmente_pago: { label: 'Pagamento parcial', color: 'bg-sky-100 text-sky-800' },
  pago: { label: 'Pago', color: 'bg-emerald-100 text-emerald-800' },
};

export function MyTripsPage({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingVoucherId, setDownloadingVoucherId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTrips() {
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
            pagamento_status,
            created_at,
            proposta_id,
            viagens_propostas (
              snapshot_completo,
              reserva_id,
              viagens_solicitacoes_reserva (protocolo)
            ),
            viagens_vouchers (
              id,
              storage_path,
              file_name,
              descricao,
              created_at
            )
          `)
          .eq('cliente_id', clientId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTrips(data || []);
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível carregar suas viagens.');
      } finally {
        setLoading(false);
      }
    }

    void fetchTrips();
  }, [clientId]);

  const downloadVoucher = async (voucher: any) => {
    try {
      setDownloadingVoucherId(voucher.id);
      const { data, error } = await supabase.storage
        .from(VOUCHER_BUCKET)
        .createSignedUrl(voucher.storage_path, 60);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Link de download não gerado.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível baixar o voucher.');
    } finally {
      setDownloadingVoucherId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f1ea] pb-32 font-sans">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-5">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a]">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="mx-4 h-5 w-px bg-black/10" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a1a2e]">
              <Plane className="h-4 w-4 text-[#4dc9f6]" />
            </div>
            <span className="text-sm font-black tracking-tight text-[#1a1a2e]">Minhas Viagens</span>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="mb-10">
          <h1 className="mb-3 text-3xl font-black text-[#1a1a2e] sm:text-4xl" style={{ fontFamily: '"Cinzel", serif' }}>
            Minhas Viagens
          </h1>
          <p className="text-neutral-600">Acompanhe contrato, pagamentos conciliados, emissões, passageiros e vouchers.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <Loader2 className="mb-4 h-10 w-10 animate-spin" />
            <p className="font-medium">Carregando viagens...</p>
          </div>
        ) : trips.length === 0 ? (
          <div className="rounded-3xl border border-black/5 bg-white p-10 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
              <Plane className="h-10 w-10 text-neutral-400" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-[#1a1a1a]">Nenhuma viagem encontrada</h2>
            <p className="mx-auto mb-8 max-w-md text-neutral-500">Explore nossos pacotes ou solicite um orçamento personalizado.</p>
            <button onClick={() => navigate(routes.marketplace.travelPackages.ofertas())} className="rounded-xl bg-[#1a1a2e] px-6 py-3 font-bold text-white hover:bg-[#0c2340]">
              Explorar Ofertas
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => {
              const snapshot = trip.viagens_propostas?.snapshot_completo || {};
              const protocolo = trip.viagens_propostas?.viagens_solicitacoes_reserva?.protocolo || 'N/A';
              const config = statusConfig[trip.status] || {
                label: String(trip.status).replace(/_/g, ' '),
                color: 'bg-neutral-100 text-neutral-800 border-neutral-200',
              };
              const financial = paymentStatusConfig[trip.pagamento_status] || paymentStatusConfig.nao_faturado;
              const vouchers = trip.viagens_vouchers || [];
              const firstVoucher = vouchers[0];
              const totalContract = Number(trip.valor_total_contrato ?? trip.valor_pago ?? 0);
              const actuallyPaid = Number(trip.valor_efetivamente_pago || 0);
              const openAmount = Number(trip.valor_em_aberto ?? Math.max(totalContract - actuallyPaid, 0));

              return (
                <article key={trip.id} className="flex flex-col rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm transition-all hover:shadow-xl sm:p-8">
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${config.color}`}>{config.label}</span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${financial.color}`}>{financial.label}</span>
                    </div>
                    <span className="text-xs font-medium text-neutral-400">Ref: {protocolo}</span>
                  </div>

                  <div className="mb-6 flex-1">
                    <h2 className="mb-2 text-xl font-black leading-tight text-[#1a1a1a]">{snapshot.titulo || 'Viagem Personalizada'}</h2>
                    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-500">
                      <MapPin className="h-4 w-4 text-[#4dc9f6]" />
                      <span>{snapshot.destino || 'Destino a definir'}</span>
                    </div>
                    <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
                      <div className="flex items-center justify-between text-sm"><span className="text-neutral-500">Total contratado</span><span className="font-bold text-[#1a1a1a]">{formatCurrency(totalContract)}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-neutral-500">Efetivamente pago</span><span className="font-bold text-emerald-700">{formatCurrency(actuallyPaid)}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-neutral-500">Em aberto</span><span className="font-bold text-amber-700">{formatCurrency(openAmount)}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-neutral-500">Criada em</span><span className="font-medium text-neutral-700">{new Date(trip.created_at).toLocaleDateString('pt-BR')}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-neutral-500">Vouchers</span><span className="font-bold text-[#1a1a1a]">{vouchers.length}</span></div>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-3">
                    <button onClick={() => navigate(routes.marketplace.travelPackages.minhaViagem(trip.id))} className="flex-1 rounded-xl bg-neutral-100 py-3 text-sm font-bold text-[#1a1a1a] hover:bg-neutral-200">
                      Ver Detalhes
                    </button>
                    {firstVoucher && (
                      <button
                        onClick={() => void downloadVoucher(firstVoucher)}
                        disabled={downloadingVoucherId === firstVoucher.id}
                        aria-label={`Baixar ${firstVoucher.descricao || firstVoucher.file_name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] text-white hover:bg-[#0c2340] disabled:opacity-60"
                      >
                        {downloadingVoucherId === firstVoucher.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

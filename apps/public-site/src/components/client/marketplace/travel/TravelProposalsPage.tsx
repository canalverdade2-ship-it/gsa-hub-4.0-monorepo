import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Clock, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { callClientRpc } from '../../../../lib/clientRpc';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { formatCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

export function TravelProposalsPage({ clientId, onBack }: { clientId: string, onBack: () => void }) {
  const [propostas, setPropostas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchPropostas = async () => {
    try {
      const { data, error } = await supabase
        .from('viagens_propostas')
        .select(`
          *,
          viagens_solicitacoes_reserva (protocolo)
        `)
        .eq('cliente_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPropostas(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar suas propostas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPropostas();
  }, [clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'viagens_propostas',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        debounceMs: 300,
        onChange: fetchPropostas,
      },
    ],
    [clientId]
  );

  const handleAceitarProposta = async (propostaId: string) => {
    if (acceptingId) return;

    try {
      setAcceptingId(propostaId);
      const data = await callClientRpc<any>('gsa_accept_travel_proposal', {
        p_proposta_id: propostaId,
      });

      if (!data?.success || !data?.transacao_id) {
        throw new Error(data?.error || 'Não foi possível iniciar a reserva.');
      }

      toast.success('Proposta aceita! Agora cadastre os passageiros e conclua o pagamento.');
      navigate(routes.marketplace.travelPackages.minhaViagem(data.transacao_id));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao aceitar proposta.');
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="bg-[#f4f1ea] min-h-screen font-sans pb-32">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar</span>
            </button>
            <div className="h-5 w-px bg-black/10" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c2340]">
                <FileText className="h-4 w-4 text-[#38bdf8]" />
              </div>
              <span className="text-sm font-black tracking-tight text-[#0c2340]">Minhas Propostas</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 py-12">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-black text-[#0c2340] mb-3" style={{ fontFamily: '"Cinzel", serif', fontWeight: 700 }}>
            Propostas de Viagem
          </h1>
          <p className="text-neutral-600">
            Analise e aceite as propostas formuladas especialmente para você.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <Loader2 className="h-10 w-10 animate-spin mb-4" />
            <p className="font-medium">Carregando propostas...</p>
          </div>
        ) : propostas.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-black/5">
            <div className="h-20 w-20 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-6">
              <FileText className="h-10 w-10 text-neutral-400" />
            </div>
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-2">Nenhuma proposta encontrada</h3>
            <p className="text-neutral-500 mb-8 max-w-md mx-auto">
              Você ainda não recebeu nenhuma proposta. Solicite um orçamento para começarmos a planejar sua viagem!
            </p>
            <button
              onClick={() => navigate(routes.marketplace.travelPackages.orcamento())}
              className="px-6 py-3 rounded-xl bg-[#0c2340] text-white font-bold hover:bg-[#134e78] transition-colors"
            >
              Solicitar Orçamento
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {propostas.map((proposta) => {
              const snapshot = proposta.snapshot_completo || {};
              const isPendente = proposta.status === 'enviada' || proposta.status === 'visualizada';
              const isExpirada = new Date(proposta.prazo_aceitacao) < new Date();
              const isAccepting = acceptingId === proposta.id;

              return (
                <div key={proposta.id} className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm hover:shadow-xl transition-all border border-black/5 flex flex-col">
                  <div className="flex items-start justify-between mb-6">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      proposta.status === 'aceita' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                      proposta.status === 'expirada' ? 'bg-red-100 text-red-800 border-red-200' :
                      'bg-blue-100 text-blue-800 border-blue-200'
                    }`}>
                      {proposta.status}
                    </span>
                    <span className="text-xs font-medium text-neutral-400">
                      Ref: {proposta.viagens_solicitacoes_reserva?.protocolo}
                    </span>
                  </div>

                  <div className="mb-6 flex-1">
                    <h3 className="text-2xl font-black text-[#1a1a1a] leading-tight mb-2">
                      {snapshot.titulo || 'Proposta Personalizada'}
                    </h3>
                    <p className="text-neutral-500 text-sm mb-4 line-clamp-2">
                      {snapshot.destino}
                    </p>

                    <div className="bg-[#f4f1ea] rounded-xl p-5 space-y-4">
                      <div className="flex justify-between items-center border-b border-black/5 pb-3">
                        <span className="text-neutral-600 text-sm">Valor Total</span>
                        <div className="text-right">
                          <span className="block text-2xl font-black text-[#0c2340]">{formatCurrency(proposta.valor_total)}</span>
                          <span className="mt-1 block text-xs font-bold text-neutral-500">
                            Até {Math.max(Number(proposta.parcelamento_permitido) || 1, 1)}x de {formatCurrency(Number(proposta.valor_total || 0) / Math.max(Number(proposta.parcelamento_permitido) || 1, 1))}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-500 flex items-center gap-1"><Clock className="h-4 w-4" /> Válida até</span>
                        <span className={`font-bold ${isExpirada && isPendente ? 'text-red-500' : 'text-[#1a1a1a]'}`}>
                          {new Date(proposta.prazo_aceitacao).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isPendente && !isExpirada ? (
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAceitarProposta(proposta.id)}
                        disabled={Boolean(acceptingId)}
                        className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isAccepting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                        {isAccepting ? 'Preparando reserva...' : 'Aceitar Proposta'}
                      </button>
                    </div>
                  ) : proposta.status === 'aceita' ? (
                    <div className="py-3 text-center text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-100">
                      Proposta aceita. Acesse “Minhas Viagens” para continuar.
                    </div>
                  ) : (
                    <div className="py-3 text-center text-sm font-bold text-neutral-400 bg-neutral-100 rounded-xl">
                      {isExpirada ? 'Proposta Expirada' : 'Visualização Fechada'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

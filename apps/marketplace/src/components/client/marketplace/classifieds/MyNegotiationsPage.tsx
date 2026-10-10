import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Clock3, Handshake, MessageCircle,
  Send, Shield, X, XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

const money = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(value || 0));

const statusConfig: Record<string, { label: string; className: string }> = {
  nova: { label: 'Nova', className: 'bg-blue-100 text-blue-700' },
  em_analise_gsa: { label: 'Em análise GSA', className: 'bg-amber-100 text-amber-700' },
  aguardando_vendedor: { label: 'Aguardando vendedor', className: 'bg-orange-100 text-orange-700' },
  aguardando_comprador: { label: 'Aguardando comprador', className: 'bg-orange-100 text-orange-700' },
  contraproposta: { label: 'Contraproposta', className: 'bg-purple-100 text-purple-700' },
  aceita: { label: 'Aceita', className: 'bg-emerald-100 text-emerald-700' },
  rejeitada: { label: 'Rejeitada', className: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', className: 'bg-neutral-200 text-neutral-700' },
};
export function MyNegotiationsPage({ clientId }: { clientId: string }) {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'comprando' | 'vendendo'>('comprando');
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [counterValue, setCounterValue] = useState('');
  const [working, setWorking] = useState(false);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const field = tab === 'comprando' ? 'comprador_id' : 'vendedor_id';
      const { data, error } = await supabase
        .from('classificados_propostas')
        .select(`
          *,
          classificados_anuncios(titulo, preco, slug, categoria),
          classificados_transacoes(id, status, valor_final)
        `)
        .eq(field, clientId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const next = data || [];
      setProposals(next);
      setSelected((current: any) => current ? (next.find((item: any) => item.id === current.id) || current) : current);
    } catch (error) {
      console.error('Erro ao carregar negociações:', error);
      toast.error('Não foi possível carregar suas negociações.');
    } finally {
      setLoading(false);
    }
  }, [clientId, tab]);

  const loadMessages = useCallback(async (proposalId: string) => {
    setChatLoading(true);
    try {
      const { data, error } = await supabase
        .from('classificados_mensagens')
        .select('id, proposta_id, remetente_id, conteudo, status_moderacao, motivo_rejeicao, created_at')
        .eq('proposta_id', proposalId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Erro ao carregar chat moderado:', error);
      toast.error('Não foi possível carregar as mensagens.');
    } finally {
      setChatLoading(false);
    }
  }, []);

  useEffect(() => { void fetchProposals(); }, [fetchProposals]);
  useRealtimeSubscription([
    { table: 'classificados_propostas', onChange: fetchProposals, debounceMs: 250 },
    { table: 'classificados_transacoes', onChange: fetchProposals, debounceMs: 250 },
    {
      table: 'classificados_mensagens',
      enabled: Boolean(selected?.id),
      onChange: () => selected?.id ? loadMessages(selected.id) : undefined,
      debounceMs: 250,
    },
  ], [fetchProposals, loadMessages, selected?.id]);

  const openNegotiation = async (proposal: any) => {
    setSelected(proposal);
    setCounterValue(String(proposal.valor_contraproposta || proposal.valor_proposta || ''));
    setDraft('');
    await loadMessages(proposal.id);
  };

  const sendMessage = async () => {
    if (!selected || !draft.trim() || working) return;
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('rpc_enviar_mensagem_classificado', {
        p_proposta_id: selected.id,
        p_remetente_id: clientId,
        p_conteudo: draft.trim(),
      });
      if (error || !data?.success) throw new Error(error?.message || 'Mensagem não registrada.');
      setDraft('');
      toast.success('Mensagem enviada para moderação da GSA.');
      await loadMessages(selected.id);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setWorking(false);
    }
  };

  const respond = async (action: 'aceitar' | 'rejeitar' | 'contrapropor' | 'cancelar') => {
    if (!selected || working) return;
    const counter = Number(String(counterValue).replace(',', '.'));
    if (action === 'contrapropor' && (!Number.isFinite(counter) || counter <= 0)) {
      toast.error('Informe um valor válido para a contraproposta.');
      return;
    }
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('rpc_responder_proposta_classificado', {
        p_proposta_id: selected.id,
        p_acao: action,
        p_valor_contraproposta: action === 'contrapropor' ? counter : null,
        p_motivo: action === 'rejeitar' ? 'Recusada pelo participante.' : null,
      });
      if (error || !data?.success) throw new Error(error?.message || 'A negociação não pôde ser atualizada.');
      const labels: Record<string, string> = {
        aceitar: 'Proposta aceita.',
        rejeitar: 'Proposta recusada.',
        contrapropor: 'Contraproposta enviada.',
        cancelar: 'Proposta cancelada.',
      };
      toast.success(labels[action]);
      await fetchProposals();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar a negociação.');
    } finally {
      setWorking(false);
    }
  };

  const activeStatuses = useMemo(() => new Set([
    'aguardando_vendedor', 'aguardando_comprador', 'contraproposta',
  ]), []);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-neutral-900 w-full">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10 space-y-6">
        <button onClick={() => navigate(routes.marketplace.classifieds.root())} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-neutral-700 shadow-sm">
          <ArrowLeft className="h-4 w-4" /> Voltar aos Classificados
        </button>
        <div>
          <h1 className="text-3xl font-black text-[#1a1a1a]">Minhas Negociações</h1>
          <p className="mt-1 text-sm text-neutral-500">Propostas e mensagens protegidas pela moderação da GSA.</p>
        </div>

        <div className="flex w-full rounded-2xl bg-neutral-200/50 p-1 sm:w-fit">
          <button onClick={() => setTab('comprando')} className={`flex-1 rounded-xl px-6 py-2.5 text-sm font-bold ${tab === 'comprando' ? 'bg-white text-black shadow-sm' : 'text-neutral-500'}`}>Estou Comprando</button>
          <button onClick={() => setTab('vendendo')} className={`flex-1 rounded-xl px-6 py-2.5 text-sm font-bold ${tab === 'vendendo' ? 'bg-white text-black shadow-sm' : 'text-neutral-500'}`}>Estou Vendendo</button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
          {loading ? (
            <div className="flex h-56 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black" /></div>
          ) : proposals.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
              <Handshake className="mb-4 h-12 w-12 text-neutral-300" />
              <h2 className="text-xl font-black">Nenhuma negociação encontrada</h2>
              <p className="mt-2 text-sm text-neutral-500">Suas propostas aparecerão aqui quando forem registradas.</p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {proposals.map((proposal) => {
                const cfg = statusConfig[proposal.status] || { label: proposal.status, className: 'bg-neutral-100 text-neutral-600' };
                const currentValue = proposal.valor_contraproposta || proposal.valor_proposta;
                return (
                  <div key={proposal.id} className="p-5 sm:p-6">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-neutral-400">{proposal.classificados_anuncios?.categoria || 'Classificado'}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${cfg.className}`}>{cfg.label}</span>
                        </div>
                        <h3 className="mt-2 truncate text-xl font-black">{proposal.classificados_anuncios?.titulo || 'Anúncio classificado'}</h3>
                        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                          <div><span className="block text-xs text-neutral-400">Anunciado</span><strong>{money(proposal.classificados_anuncios?.preco)}</strong></div>
                          <div><span className="block text-xs text-neutral-400">Oferta atual</span><strong>{money(currentValue)}</strong></div>
                        </div>
                      </div>
                      <button onClick={() => void openNegotiation(proposal)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a1a1a] px-5 py-3 text-sm font-black text-white">
                        <MessageCircle className="h-4 w-4" /> Abrir negociação
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selected && (() => {
        const cfg = statusConfig[selected.status] || { label: selected.status, className: 'bg-neutral-100 text-neutral-600' };
        const isBuyer = selected.comprador_id === clientId;
        const lastOfferBy = selected.ultima_oferta_por || selected.comprador_id;
        const myOffer = lastOfferBy === clientId;
        const active = activeStatuses.has(selected.status);
        const canReplyOffer = active && !myOffer;
        const transaction = Array.isArray(selected.classificados_transacoes)
          ? selected.classificados_transacoes[0]
          : selected.classificados_transacoes;
        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
            <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-start justify-between border-b border-neutral-100 p-5 sm:p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${cfg.className}`}>{cfg.label}</span>
                    <span className="text-xs font-bold text-neutral-400">{isBuyer ? 'Você está comprando' : 'Você está vendendo'}</span>
                  </div>
                  <h2 className="mt-2 truncate text-xl font-black">{selected.classificados_anuncios?.titulo || 'Negociação'}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-full bg-neutral-100 p-2 text-neutral-500"><X className="h-5 w-5" /></button>
              </header>

              <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-neutral-50 p-4">
                  <div><p className="text-xs font-bold text-neutral-400">Oferta inicial</p><p className="font-black">{money(selected.valor_proposta)}</p></div>
                  <div><p className="text-xs font-bold text-neutral-400">Oferta atual</p><p className="font-black">{money(selected.valor_contraproposta || selected.valor_proposta)}</p></div>
                </div>

                {selected.mensagem_inicial && (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-amber-700">Mensagem inicial</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{selected.mensagem_inicial}</p>
                  </div>
                )}
                {selected.status === 'em_analise_gsa' && (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0" /> Sua proposta está em análise pela GSA. O vendedor só terá acesso após a aprovação.
                  </div>
                )}

                {selected.status === 'aceita' && (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Negociação aceita. {transaction?.status ? `Situação do negócio: ${String(transaction.status).replaceAll('_', ' ')}.` : 'Aguarde as instruções da GSA.'}
                  </div>
                )}

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <div><h3 className="font-black">Chat moderado</h3><p className="text-xs text-neutral-500">Mensagens só chegam à outra parte após aprovação da GSA.</p></div>
                    <Shield className="h-5 w-5 text-[#a66a00]" />
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                    {chatLoading ? <p className="py-6 text-center text-sm text-neutral-400">Carregando mensagens...</p>
                      : messages.length === 0 ? <p className="py-6 text-center text-sm text-neutral-400">Nenhuma mensagem nesta negociação.</p>
                      : messages.map((message) => {
                        const mine = message.remetente_id === clientId;
                        return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? 'bg-[#1a1a1a] text-white' : 'bg-white text-neutral-800 shadow-sm ring-1 ring-black/5'}`}>
                            <p className="whitespace-pre-wrap">{message.conteudo}</p>
                            {mine && message.status_moderacao === 'pendente' && (
                              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/55">Aguardando moderação GSA</p>
                            )}
                            {mine && message.status_moderacao === 'rejeitada' && (
                              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-red-300">Não entregue pela moderação</p>
                            )}
                          </div>
                        </div>;
                      })}
                  </div>

                  {!['rejeitada', 'cancelada'].includes(selected.status) && (
                    <div className="mt-3 flex gap-2">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                        placeholder="Escreva uma mensagem para moderação..."
                        className="min-h-20 flex-1 resize-none rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-400"
                      />
                      <button
                        type="button"
                        disabled={working || draft.trim().length === 0}
                        onClick={() => void sendMessage()}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1a1a1a] text-white disabled:opacity-40"
                        aria-label="Enviar mensagem para moderação"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </section>

                {active && (
                  <section className="rounded-2xl border border-neutral-200 p-4">
                    <div className="mb-3">
                      <h3 className="font-black">Decisão da negociação</h3>
                      <p className="text-xs text-neutral-500">
                        {myOffer ? 'Sua oferta está aguardando resposta da outra parte.' : 'Existe uma oferta da outra parte aguardando sua decisão.'}
                      </p>
                    </div>

                    {canReplyOffer && (
                      <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input
                            value={counterValue}
                            onChange={(event) => setCounterValue(event.target.value)}
                            inputMode="decimal"
                            placeholder="Valor da contraproposta"
                            className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-bold outline-none focus:border-neutral-400"
                          />
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void respond('contrapropor')}
                            className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black text-neutral-800 disabled:opacity-40"
                          >
                            Enviar contraproposta
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void respond('rejeitar')}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-40"
                          >
                            <XCircle className="h-4 w-4" /> Recusar oferta
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void respond('aceitar')}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Aceitar oferta
                          </button>
                        </div>
                      </div>
                    )}

                    {isBuyer && selected.status !== 'aceita' && (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void respond('cancelar')}
                        className="mt-3 inline-flex items-center gap-2 text-xs font-black text-neutral-500 hover:text-red-600 disabled:opacity-40"
                      >
                        <XCircle className="h-4 w-4" /> Cancelar minha proposta
                      </button>
                    )}
                  </section>
                )}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50 px-5 py-4 sm:px-6">
                <p className="text-xs font-medium text-neutral-500">Toda negociação fica registrada no GSA HUB.</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-black text-neutral-700"
                >
                  Fechar
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default MyNegotiationsPage;

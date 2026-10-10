import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Gift, Clock, CheckCircle, XCircle, Search, Info, AlertCircle, Check, Star, MessageSquare } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDate } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { notificationService } from '../../lib/notificationService';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';

interface Premio {
  id: string;
  cliente_id: string;
  codigo_premio: string;
  nome: string;
  tipo: 'servico' | 'produto' | 'assinatura';
  descricao: string;
  data_cadastro: string;
  data_validade: string;
  status: 'pendente' | 'resgatado' | 'cancelado';
  data_resgate?: string;
  data_cancelamento?: string;
  motivo_cancelamento?: string;
  forma_resgate?: 'online' | 'fisico' | null;
  instrucoes_resgate?: string | null;
}

export default function ClientPremios({ 
  clientId,
  initialTab,
  initialItemId 
}: { 
  clientId: string,
  initialTab?: string,
  initialItemId?: string
}) {
  const { containerRef: premiosTabsRef, setButtonRef: setPremiosTabButtonRef } = useAutoFitTabs(16, 10);
  const [premios, setPremios] = useState<Premio[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pendente' | 'resgatado' | 'cancelado'>(
    (initialTab as any) || 'pendente'
  );
  const [search, setSearch] = useState('');
  const [selectedPremio, setSelectedPremio] = useState<Premio | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasAutoOpened = useRef<string | null>(null);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as any);
  }, [initialTab]);

  useEffect(() => {
    if (initialItemId) {
      const detectStatusAndSwitch = async () => {
        const { data, error } = await supabase
          .from('cliente_premios')
          .select('status')
          .eq('id', initialItemId)
          .single();
        
        if (data && data.status) {
          setActiveTab(data.status as any);
        }
      };
      detectStatusAndSwitch();
    }
  }, [initialItemId]);

  useEffect(() => {
    if (initialItemId && premios.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = premios.find(p => p.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        if (item.status === 'resgatado') {
          setSelectedPremio(item);
          setIsModalOpen(true);
        }

        // Scroll and highlight
        setTimeout(() => {
          const element = document.getElementById(`premio-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 400);
      }
    }
  }, [initialItemId, premios.length]);

  useEffect(() => {
    fetchPremios();

    const channel = supabase
      .channel('premios-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cliente_premios',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchPremios();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, activeTab]);

  const fetchPremios = async () => {
    setLoading(true);
    try {
      // Primeiro, verifica e cancela os expirados
      const { data: expirados } = await supabase
        .from('cliente_premios')
        .select('id, cliente_id, nome')
        .eq('cliente_id', clientId)
        .eq('status', 'pendente')
        .lt('data_validade', new Date().toISOString());

      if (expirados && expirados.length > 0) {
        await Promise.all(expirados.map(p => clientOperationalWrite(clientId, 'cliente_premios', 'update', {
          status: 'cancelado',
          data_cancelamento: new Date().toISOString(),
          motivo_cancelamento: 'Prazo para resgate expirado.'
        }, { id: p.id })));

        // Notificar o cliente
        for (const p of expirados) {
          await notificationService.notifyClient(
            clientId,
            'Prêmio expirado ⏰',
            `O prêmio "${p.nome}" expirou e não pode mais ser resgatado.`,
            'premios',
            'premio_expirado',
            { tab: 'cancelado', itemId: p.id }
          );
        }
      }

      let query = supabase
        .from('cliente_premios')
        .select('*')
        .eq('cliente_id', clientId)
        .order('data_cadastro', { ascending: false });

      if (activeTab === 'resgatado') {
        query = query.in('status', ['resgatado', 'cancelado']);
      } else {
        query = query.eq('status', 'pendente');
      }

      const { data, error } = await query;

      if (error) throw error;
      if (data) setPremios(data as Premio[]);
    } catch (error) {
      console.error('Error fetching premios:', error);
    } finally {
      setLoading(false);
    }
  };

  const confirmarResgate = async () => {
    if (!selectedPremio) return;
    
    setIsSubmitting(true);
    try {
      await clientOperationalWrite(clientId, 'cliente_premios', 'update', {
        status: 'resgatado',
        data_resgate: new Date().toISOString()
      }, { id: selectedPremio.id });

      // Notificar o cliente
      await notificationService.notifyClient(
        clientId,
        'Prêmio resgatado! 🎉',
        `Você resgatou o prêmio: ${selectedPremio.nome}. Aguarde as instruções de resgate em sua área logada.`,
        'premios',
        'premio_resgatado',
        { tab: 'resgatado', itemId: selectedPremio.id }
      );

      // Notificar o Admin
      await notificationService.notifyAdmin(
        '🎁 Resgate de Prêmio Solicitado',
        `Um cliente solicitou o resgate do prêmio: ${selectedPremio.nome} (Cód: ${selectedPremio.codigo_premio}).`,
        'premios',
        'premio_resgate_solicitado',
        { tab: 'resgatados', itemId: selectedPremio.id, contexto: { cliente_id: clientId, premio_id: selectedPremio.id } }
      );

      toast.success('Prêmio resgatado com sucesso!');
      setIsRedeemModalOpen(false);
      setSelectedPremio(null);
      fetchPremios();
    } catch (error) {
      toast.error('Erro ao resgatar prêmio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbrirTicket = async (premio: Premio) => {
    setIsSubmitting(true);
    try {
      const assunto = `Dúvida sobre o Prêmio: ${premio.nome}`;

      // Verificação de ticket duplicado
      const { data: existingTickets, error: checkError } = await supabase
        .from('tickets')
        .select('id')
        .eq('cliente_id', clientId)
        .eq('assunto', assunto)
        .neq('status', 'concluido')
        .limit(1);

      if (checkError) throw checkError;

      if (existingTickets && existingTickets.length > 0) {
        toast.error('Identificamos que você já possui um atendimento em andamento sobre este prêmio. Por favor, acompanhe o retorno na aba de Suporte.');
        return;
      }

      await clientOperationalWrite(clientId, 'tickets', 'insert', {
        assunto,
        descricao: `Gostaria de tirar uma dúvida referente ao prêmio "${premio.nome}" (Cód: ${premio.codigo_premio}). Resgatado em: ${premio.data_resgate ? formatDate(premio.data_resgate) : 'N/A'}.`,
        status: 'aberto'
      });

      await notificationService.notifyAdmin(
        'Novo Ticket de Suporte (Prêmios)',
        `Um cliente abriu um ticket com dúvidas sobre o prêmio ${premio.nome}.`,
        'suporte',
        'ticket_aberto_cliente',
        { tab: 'abertos', contexto: { cliente_id: clientId } }
      );

      toast.success('Ticket aberto com sucesso! Acompanhe na aba de Suporte.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível processar seu pedido agora. Por favor, tente novamente em alguns minutos ou recorra ao suporte geral.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedeemClick = (premio: Premio) => {
    setSelectedPremio(premio);
    setIsRedeemModalOpen(true);
  };

  const filteredPremios = premios.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-black text-neutral-900 flex items-center gap-2">
          <Gift className="h-6 w-6 text-indigo-600" />
          Meus Prêmios
        </h2>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar prêmios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="w-full min-w-0 sm:w-auto overflow-hidden">
        <div ref={premiosTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
          {['pendente', 'resgatado'].map((t, index) => (
            <button 
              key={t}
              ref={setPremiosTabButtonRef(index)}
              onClick={() => setActiveTab(t as any)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              {t === 'pendente' ? 'Disponíveis' : 'Resgatados'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : filteredPremios.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 py-12 text-center">
          <Gift className="mb-4 h-12 w-12 text-neutral-300" />
          <h3 className="text-lg font-bold text-neutral-900">Nenhum prêmio encontrado</h3>
          <p className="text-sm text-neutral-500">Você não possui prêmios nesta categoria.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPremios.map((premio) => (
            <div id={`premio-${premio.id}`} key={premio.id} className={`group relative overflow-hidden rounded-[2.5rem] p-8 shadow-md transition-all duration-500 flex flex-col ${highlightedItemId === premio.id ? 'bg-indigo-50 ring-4 ring-indigo-500 shadow-2xl shadow-indigo-500/20 scale-[1.02] z-10' : 'bg-white ring-1 ring-neutral-300 hover:shadow-xl hover:-translate-y-1'}`}>
               <div className="flex justify-between items-start mb-6">
                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 border group-hover:scale-110 transition-transform duration-500 shadow-sm ${
                  premio.tipo === 'servico' ? 'bg-blue-50 text-blue-500 border-blue-100/50 shadow-blue-500/10' :
                  premio.tipo === 'produto' ? 'bg-emerald-50 text-emerald-500 border-emerald-100/50 shadow-emerald-500/10' :
                  'bg-purple-50 text-purple-500 border-purple-100/50 shadow-purple-500/10'
                }`}>
                  <Gift className="w-8 h-8" />
                </div>
                <div className="bg-neutral-100 rounded-full px-3 py-1 text-neutral-600 flex items-center gap-1.5 border border-neutral-200">
                  <Star className="w-3.5 h-3.5 fill-neutral-600" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{premio.tipo}</span>
                </div>
              </div>

              <h3 className="text-2xl font-black text-[#1a1a1a] mb-2 uppercase tracking-tight">{premio.nome}</h3>
              <p className="text-xs font-bold text-indigo-600 mb-4 px-3 py-1 bg-indigo-50 rounded-lg w-fit">CÓD: {premio.codigo_premio}</p>
              
              <p className="text-sm text-neutral-500 mb-8 flex-1 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">{premio.descricao}</p>

              <div className="space-y-3 mb-8">
                {premio.status !== 'resgatado' && (
                  <div className="flex items-center justify-between text-xs p-3 rounded-2xl bg-neutral-50 border border-neutral-100">
                    <span className="flex items-center gap-1 text-neutral-500 font-bold uppercase"><Clock className="h-4 w-4" /> Vencimento</span>
                    <span className="font-black text-neutral-900">{format(new Date(premio.data_validade), "dd/MM/yyyy")}</span>
                  </div>
                )}
                
                {premio.status === 'resgatado' && premio.data_resgate && (
                  <div className="flex items-center justify-between text-xs p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <span className="flex items-center gap-1 text-emerald-600 font-bold uppercase"><CheckCircle className="h-4 w-4" /> Resgatado</span>
                    <span className="font-black text-emerald-900">{format(new Date(premio.data_resgate), "dd/MM/yyyy")}</span>
                  </div>
                )}

                {premio.status === 'cancelado' && (
                  <div className="flex items-center justify-between text-xs p-3 rounded-2xl bg-red-50 border border-red-100">
                    <span className="flex items-center gap-1 text-red-600 font-bold uppercase"><XCircle className="h-4 w-4" /> Cancelado</span>
                    <span className="font-black text-red-900">{premio.data_cancelamento ? format(new Date(premio.data_cancelamento), "dd/MM/yyyy") : '-'}</span>
                  </div>
                )}
              </div>

              {premio.status === 'pendente' && (
                <button
                  onClick={() => handleRedeemClick(premio)}
                  className="w-full bg-[#1a1a1a] hover:bg-black text-white font-black py-4 rounded-2xl transition-all active:scale-[0.98] shadow-xl shadow-black/10 flex items-center justify-center gap-2"
                >
                  Resgatar Agora
                </button>
              )}

              {premio.status === 'resgatado' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedPremio(premio);
                      setIsModalOpen(true);
                    }}
                    className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 border border-emerald-200 text-xs"
                  >
                    <Info className="h-4 w-4" />
                    Detalhes
                  </button>
                  <button
                    onClick={() => handleAbrirTicket(premio)}
                    disabled={isSubmitting}
                    className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 border border-indigo-200 disabled:opacity-50 text-xs"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Dúvidas?
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation/Redemption Instructions Modal (Before Redemption) */}
      <Modal 
        isOpen={isRedeemModalOpen} 
        onClose={() => setIsRedeemModalOpen(false)} 
        title="Quase lá! 🎉"
        size="wide"
      >
        {selectedPremio && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center bg-neutral-50 p-6 rounded-[2rem] border border-neutral-100 shadow-inner">
              <div className="w-24 h-24 rounded-[1.5rem] bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-sm border border-indigo-100">
                <Gift className="w-12 h-12" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Você selecionou:</p>
                <h4 className="text-3xl font-black text-[#1a1a1a] uppercase tracking-tight">{selectedPremio.nome}</h4>
                <p className="text-sm text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{selectedPremio.descricao}</p>
              </div>
            </div>

            <div className="space-y-6">
              <h5 className="text-lg font-bold text-[#1a1a1a] flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-500" />
                Deseja resgatar este prêmio agora?
              </h5>
              
              <div className="space-y-4">
                <div className="flex gap-4 p-4 rounded-2xl bg-white shadow-md ring-1 ring-neutral-300">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-[#1a1a1a]">Solicitação Enviada</p>
                    <p className="text-sm text-neutral-500 mt-0.5">O sistema receberá seu pedido de resgate imediatamente.</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-2xl bg-white shadow-md ring-1 ring-neutral-300">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-[#1a1a1a]">Instruções Disponíveis</p>
                    <p className="text-sm text-neutral-500 mt-0.5">As instruções detalhadas de como usar/receber seu prêmio aparecerão aqui em breve.</p>
                  </div>
                </div>

                <div className="flex gap-4 p-4 rounded-2xl bg-white shadow-md ring-1 ring-neutral-300">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-[#1a1a1a]">Acompanhamento</p>
                    <p className="text-sm text-neutral-500 mt-0.5">Você poderá conferir o status e as orientações clicando em "Ver Instruções" na aba de resgatados.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-indigo-50 p-4 border border-indigo-100">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800 leading-relaxed font-medium">
                    Importante: O prazo para liberação das orientações de resgate é de até 72 horas úteis.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                onClick={() => setIsRedeemModalOpen(false)}
                className="flex-1 px-8 py-4 rounded-2xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
              >
                Voltar
              </button>
              <button 
                disabled={isSubmitting}
                onClick={confirmarResgate}
                className="flex-[2] bg-[#1a1a1a] hover:bg-black text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-black/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Confirmar Resgate
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Detalhes do Prêmio Resgatado (After Redemption) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPremio(null);
        }}
        title="Informações de Resgate"
        size="full"
      >
        {selectedPremio && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center bg-neutral-50 p-6 rounded-[2rem] border border-neutral-100 shadow-inner">
               <div className="w-24 h-24 rounded-[1.5rem] bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100">
                <Gift className="w-12 h-12" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-1">Prêmio Selecionado:</p>
                <h4 className="text-3xl font-black text-[#1a1a1a] uppercase tracking-tight">{selectedPremio.nome}</h4>
                <p className="text-xs font-bold text-indigo-600 mt-1">CÓDIGO: {selectedPremio.codigo_premio}</p>
              </div>
            </div>

            <div className="space-y-4">
              {!selectedPremio.instrucoes_resgate ? (
                <div className="rounded-[2rem] bg-amber-50 p-8 border border-amber-200 flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg shadow-amber-500/10">
                    <Clock className="h-8 w-8 text-amber-500 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-black text-amber-900 text-lg uppercase tracking-tight">Aguardando Instruções</h4>
                    <p className="text-sm text-amber-800/80 mt-2 leading-relaxed">
                      O sistema está processando seu resgate. <br/>As instruções de como utilizar seu prêmio serão liberadas em breve.
                    </p>
                  </div>
                  <p className="text-[10px] font-black uppercase text-amber-600/50 pt-4 border-t border-amber-200/50 w-full">Prazo para liberação: Até 72 horas úteis</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-[2.5rem] bg-emerald-50 p-8 border border-emerald-200">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md">
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      </div>
                      <h4 className="font-black text-emerald-900 text-lg uppercase tracking-tight">Instruções de Resgate</h4>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-emerald-100 shadow-sm">
                        <span className="text-[10px] font-black text-emerald-700/50 uppercase tracking-widest block mb-1">Forma de Utilização</span>
                        <p className="text-lg font-black text-emerald-900 uppercase">
                          {selectedPremio.forma_resgate === 'online' ? 'Plataforma Online' : 'Entrega / Retirada Física'}
                        </p>
                      </div>

                      <div className="bg-white p-6 rounded-[2rem] border border-emerald-100 shadow-xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl"></div>
                         <span className="text-[10px] font-black text-emerald-700/50 uppercase tracking-widest block mb-3">Passo a Passo</span>
                         <div className="text-neutral-700 leading-relaxed whitespace-pre-wrap font-medium">
                          {selectedPremio.instrucoes_resgate}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setIsModalOpen(false);
                setSelectedPremio(null);
              }}
              className="w-full px-6 py-4 rounded-2xl font-black text-neutral-500 hover:bg-neutral-100 transition-colors uppercase tracking-widest text-xs"
            >
              Fechar Detalhes
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

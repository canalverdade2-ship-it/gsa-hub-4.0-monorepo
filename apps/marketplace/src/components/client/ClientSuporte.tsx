import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Ticket, TicketMensagem } from '../../types';
import { formatDateTime } from '../../lib/utils';
import { MessageSquare, Plus, Clock, CheckCircle, Send, Paperclip, X, XCircle, File as FileIcon, Image as ImageIcon, Download } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { removePrivateDocument, uploadPrivateDocument } from '../../lib/privateStorage';
import { SecureAttachmentButton } from '../ui/SecureAttachmentButton';
import { callClientRpc } from '../../lib/clientRpc';

export function ClientSuporte({ clientId, initialItemId, modulo = 'cliente' }: { clientId: string, initialItemId?: string, modulo?: 'cliente' | 'afiliado' }) {
  const { containerRef: suporteTabsRef, setButtonRef: setSuporteTabButtonRef } = useAutoFitTabs(16, 10);
  const [activeTab, setActiveTab] = useState<'aberto' | 'concluido'>('aberto');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ticketInitialData, setTicketInitialData] = useState<{ assunto?: string, descricao?: string }>({});
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMensagem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isCancellingTicket, setIsCancellingTicket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const hasAutoOpened = useRef<string | null>(null);

  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialItemId && tickets.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = tickets.find(t => t.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        
        if (item.status === 'aberto' || item.status === 'em andamento') setActiveTab('aberto');
        else if (item.status === 'concluido' || item.status === 'cancelado') setActiveTab('concluido');
        
        setSelectedTicket(item);
        setIsChatOpen(true);
        
        setTimeout(() => {
          const element = document.getElementById(`ticket-${item.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 300);
      }
    }
  }, [initialItemId, tickets.length]);

  useEffect(() => {
    fetchTickets();

    const handleOpenStockTicket = (e: any) => {
      const produto = e.detail?.produto;
      if (produto) {
        setTicketInitialData({
          assunto: `Previsão de Estoque: ${produto.nome}`,
          descricao: `Olá, gostaria de solicitar informações e/ou previsão de estoque para o produto:\n\n- ${produto.nome}\n\nAgradeço desde já!`,
        });
        setIsModalOpen(true);
      }
    };

    window.addEventListener('open-stock-ticket', handleOpenStockTicket);
    return () => {
      window.removeEventListener('open-stock-ticket', handleOpenStockTicket);
    };
  }, [activeTab, clientId, modulo]);

  useRealtimeSubscription(
    [
      {
        table: 'tickets',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchTickets,
      },
    ],
    [clientId, activeTab, modulo]
  );

  useEffect(() => {
    if (selectedTicket?.id && isChatOpen) {
      fetchMessages(selectedTicket.id);
    }
  }, [selectedTicket?.id, isChatOpen]);

  useRealtimeSubscription(
    [
      {
        table: 'ticket_mensagens',
        filter: selectedTicket?.id ? `ticket_id=eq.${selectedTicket.id}` : undefined,
        enabled: Boolean(selectedTicket?.id && isChatOpen),
        onPayload: (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === (payload.new as any).id)) return prev;
              return [...prev, payload.new as TicketMensagem];
            });
          }
        },
      },
      {
        table: 'tickets',
        filter: selectedTicket?.id ? `id=eq.${selectedTicket.id}` : undefined,
        enabled: Boolean(selectedTicket?.id && isChatOpen),
        onPayload: (payload) => {
          if (payload.new) {
            setSelectedTicket((prev) => (prev ? ({ ...prev, ...payload.new } as Ticket) : null));
          }
        },
      },
    ],
    [selectedTicket?.id, isChatOpen]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchTickets() {
    setLoading(true);
    let query = supabase
      .from('tickets')
      .select('*')
      .eq('cliente_id', clientId)
      .order('data_abertura', { ascending: false });

    if (modulo === 'afiliado') {
      query = query.eq('modulo', 'afiliado');
    } else {
      query = query.or('modulo.eq.cliente,modulo.is.null');
    }

    if (activeTab === 'aberto') {
      query = query.in('status', ['aberto', 'em andamento']);
    } else {
      query = query.in('status', ['concluido', 'cancelado']);
    }
    
    const { data } = await query;
    if (data) setTickets(data as any);
    setLoading(false);
  };

  const fetchMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    const { data } = await supabase
      .from('ticket_mensagens')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('data_envio', { ascending: true });
    if (data) setMessages(data);
    setLoadingMessages(false);
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachment) || !selectedTicket || isSendingMessage) return;
    if (!['aberto', 'em andamento'].includes(selectedTicket.status)) {
      toast.error('Este ticket já está encerrado.');
      return;
    }

    setIsSendingMessage(true);
    let uploadedReference: string | null = null;
    let messagePersisted = false;

    try {
      const { data: cliente } = await supabase.from('clientes').select('nome').eq('id', clientId).single();

      let anexoUrl = '';
      let anexoTipo = '';
      let anexoNome = '';

      if (attachment) {
        const uploaded = await uploadPrivateDocument(attachment, {
          scope: 'clientes',
          ownerId: clientId,
          context: 'tickets',
          contextId: selectedTicket.id,
        });
        uploadedReference = uploaded.reference;
        anexoUrl = uploaded.reference;
        anexoTipo = uploaded.mimeType;
        anexoNome = uploaded.fileName;
      }

      const tempMessage: TicketMensagem = {
        id: Date.now().toString(),
        ticket_id: selectedTicket.id,
        autor_id: clientId,
        autor_nome: cliente?.nome || 'Cliente',
        mensagem: newMessage,
        anexo_url: anexoUrl || undefined,
        anexo_tipo: anexoTipo || undefined,
        anexo_nome: anexoNome || undefined,
        data_envio: new Date().toISOString(),
        tipo: 'cliente',
      };

      setMessages(prev => [...prev, tempMessage]);
      setNewMessage('');
      setAttachment(null);

      try {
        await clientOperationalWrite(clientId, 'ticket_mensagens', 'insert', {
          ticket_id: selectedTicket.id,
          autor_id: clientId,
          autor_nome: cliente?.nome || 'Cliente',
          mensagem: newMessage,
          anexo_url: anexoUrl || null,
          anexo_tipo: anexoTipo || null,
          anexo_nome: anexoNome || null,
          tipo: 'cliente',
        });
        messagePersisted = true;
      } catch (error) {
        setMessages(prev => prev.filter(message => message.id !== tempMessage.id));
        throw error;
      }

      const adminTab = selectedTicket.status === 'aberto' ? 'abertos' : 'em_andamento';
      // Notificação gravada pelo banco na mesma transação da ação.
    } catch (error) {
      if (!messagePersisted && uploadedReference) {
        await removePrivateDocument(uploadedReference).catch(() => undefined);
      }
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleCancelTicket = async () => {
    if (!selectedTicket || !['aberto', 'em andamento'].includes(selectedTicket.status) || isCancellingTicket) return;
    if (!window.confirm('Cancelar este ticket? A conversa será encerrada e ficará disponível apenas para consulta.')) return;
    setIsCancellingTicket(true);
    try {
      const result = await callClientRpc<any>('gsa_client_cancel_support_ticket', { p_ticket_id: selectedTicket.id });
      setSelectedTicket((current) => current ? ({ ...current, status: 'cancelado', data_fechamento: result?.data_fechamento || new Date().toISOString() } as Ticket) : current);
      setNewMessage(''); setAttachment(null);
      toast.success(result?.already_cancelled ? 'Este ticket já estava cancelado.' : 'Ticket cancelado com sucesso.');
      setActiveTab('concluido');
    } catch (error: any) { toast.error(error?.message || 'Não foi possível cancelar o ticket.'); }
    finally { setIsCancellingTicket(false); }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (formData: any) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      let ticket: { id: string } | null = null;
      try {
        ticket = await clientOperationalWrite<{ id: string }>(clientId, 'tickets', 'insert', {
          ...formData,
          modulo: modulo,
          status: 'aberto'
        });
      } catch (error: any) {
        console.error('Erro ao abrir ticket:', error);
        let errorMsg = 'Não foi possível processar sua solicitação agora. Por favor, tente novamente em instantes.';
        
        if (error.message?.includes('multiple (or no) rows returned')) {
          errorMsg = 'Sua solicitação já está sendo processada. Por favor, aguarde alguns segundos.';
        } else if (error.message) {
          errorMsg = `Erro ao abrir ticket: ${error.message}`;
        }
        
        toast.error(errorMsg);
        return;
      }
        // Notify Admin com notifyAdmin para gerar badge no sininho
        const moduloTag = modulo === 'afiliado' ? ' [Afiliado]' : '';
        // Notificação gravada pelo banco na mesma transação da ação.

        // Notify Client
        // Notificação gravada pelo banco na mesma transação da ação.

        toast.success('Ticket aberto com sucesso. Aguarde o atendimento.');
        setIsModalOpen(false);
        fetchTickets();
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const isAffiliate = modulo === 'afiliado';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <button 
          onClick={() => setIsModalOpen(true)}
          className={isAffiliate 
            ? "flex items-center justify-center gap-2 bg-[#0b1522] px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#16273b] border border-[#1b2b3f]"
            : "flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 w-full sm:w-auto self-start"
          }
        >
          <Plus className="h-4 w-4" />
          Abrir Novo Ticket
        </button>

        <div className="w-full sm:w-auto">
          <div ref={suporteTabsRef} className={isAffiliate
            ? "flex w-full gap-1 bg-[#f4efe6] p-1 border border-[#c9c2b6]"
            : "flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner"
          }>
            {['aberto', 'concluido'].map((t, index) => (
              <button 
                key={t}
                ref={setSuporteTabButtonRef(index)}
                onClick={() => setActiveTab(t as any)}
                className={isAffiliate
                  ? `min-w-0 flex-1 whitespace-nowrap px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all sm:px-6 ${activeTab === t ? 'bg-[#0b1522] text-[#ddc28d] shadow-sm' : 'text-[#69717c] hover:text-[#0b1522]'}`
                  : `min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`
                }
              >
                {t === 'aberto' ? 'Abertos' : 'Concluídos'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center py-20">
            <div className={`h-8 w-8 animate-spin rounded-full border-4 ${isAffiliate ? 'border-[#c59a4a] border-t-transparent' : 'border-indigo-600 border-t-transparent'}`} />
            <p className={`mt-4 text-xs font-bold uppercase tracking-widest ${isAffiliate ? 'text-[#8d6829]' : 'text-neutral-400'}`}>Carregando chamados...</p>
          </div>
        ) : tickets.length > 0 ? (
          tickets.map((ticket) => (
            <div 
              id={`ticket-${ticket.id}`}
              key={ticket.id} 
              onClick={() => { setSelectedTicket(ticket); setIsChatOpen(true); }}
              className={isAffiliate
                ? `group relative cursor-pointer border-t-4 border-[#c59a4a] bg-white p-6 shadow-[0_14px_40px_rgba(11,21,34,0.06)] border border-[#c9c2b6] transition-all duration-300 hover:border-[#8d6829] ${highlightedItemId === ticket.id ? 'ring-2 ring-[#c59a4a] bg-[#fdfbf7] scale-[1.01]' : ''}`
                : `group relative cursor-pointer rounded-3xl p-8 transition-all duration-500 ${highlightedItemId === ticket.id ? 'bg-indigo-50 ring-4 ring-indigo-500 shadow-2xl scale-[1.02] z-10' : 'bg-white shadow-md ring-1 ring-neutral-300 hover:shadow-xl'}`
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <div className={isAffiliate
                  ? `flex h-9 w-9 items-center justify-center ${ticket.status === 'aberto' ? 'bg-[#f8f3e8] text-[#8d6829] border border-[#d8c9aa]' : ticket.status === 'em andamento' ? 'bg-[#0e1b2a] text-[#ddc28d] border border-[#1b2b3f]' : ticket.status === 'cancelado' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`
                  : `flex h-10 w-10 items-center justify-center rounded-xl ${ticket.status === 'aberto' ? 'bg-amber-50 text-amber-600' : ticket.status === 'em andamento' ? 'bg-indigo-50 text-indigo-600' : ticket.status === 'cancelado' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`
                }>
                  <MessageSquare className="h-4 w-4" />
                </div>
                <span className={`text-xs font-medium ${isAffiliate ? 'text-[#727a84]' : 'text-neutral-400'}`}>{formatDateTime(ticket.data_abertura)}</span>
              </div>
              <h3 className={`text-lg font-bold ${isAffiliate ? 'text-[#0b1522]' : 'text-neutral-900'}`}>{ticket.assunto}</h3>
              <p className={`mt-1.5 text-sm line-clamp-2 ${isAffiliate ? 'text-[#69717c]' : 'text-neutral-500'}`}>{ticket.descricao}</p>
              
              <div className={`mt-5 flex items-center gap-3 border-t pt-4 ${isAffiliate ? 'border-[#e5dec9]' : 'border-neutral-100'}`}>
                <span className={isAffiliate
                  ? `px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${ticket.status === 'aberto' ? 'bg-[#f8f3e8] text-[#8d6829] border border-[#d8c9aa]' : ticket.status === 'em andamento' ? 'bg-[#0e1b2a] text-[#ddc28d] border border-[#1b2b3f]' : ticket.status === 'cancelado' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`
                  : `rounded-full px-2 py-1 text-[10px] font-black uppercase ${ticket.status === 'aberto' ? 'bg-amber-100 text-amber-700' : ticket.status === 'em andamento' ? 'bg-indigo-100 text-indigo-700' : ticket.status === 'cancelado' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`
                }>
                  {ticket.status === 'cancelado' ? 'cancelado por você' : ticket.status}
                </span>
                {ticket.status === 'em andamento' && (
                  <span className={`text-[11px] font-semibold ${isAffiliate ? 'text-[#8d6829]' : 'text-indigo-600'}`}>Um atendente está analisando seu caso. Clique para conversar.</span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className={isAffiliate
            ? "py-16 text-center border border-dashed border-[#c9c2b6] bg-[#faf8f4] p-8"
            : "py-24 text-center"
          }>
            <MessageSquare className={`h-8 w-8 mx-auto mb-2 ${isAffiliate ? 'text-[#c59a4a]' : 'text-neutral-300'}`} />
            <p className={`text-sm font-semibold ${isAffiliate ? 'text-[#0b1522]' : 'text-neutral-400'}`}>Nenhum ticket encontrado nesta categoria.</p>
            {isAffiliate && (
              <p className="text-xs text-[#69717c] mt-1">Caso precise de suporte, clique em "Abrir Novo Ticket" acima.</p>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setTicketInitialData({}); }} title="Abrir Novo Ticket" size="wide">
        <TicketForm onSubmit={handleCreate} onCancel={() => { setIsModalOpen(false); setTicketInitialData({}); }} isSubmitting={isSubmitting} initialData={ticketInitialData} modulo={modulo} />
      </Modal>

      <Modal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} title="Conversa com Suporte" size="full">
        {selectedTicket && (
          <div className="flex flex-col h-[600px]">
            <div className={isAffiliate ? "bg-[#f8f3e8] p-4 border border-[#d8c9aa] mb-4" : "rounded-2xl bg-neutral-100 p-4 ring-1 ring-neutral-300 mb-4"}>
              <h4 className={`font-bold ${isAffiliate ? 'text-[#0b1522]' : 'text-neutral-900'}`}>{selectedTicket.assunto}</h4>
              <p className={`mt-1 text-xs ${isAffiliate ? 'text-[#69717c]' : 'text-neutral-500'}`}>{selectedTicket.descricao}</p>
              {['aberto', 'em andamento'].includes(selectedTicket.status) && (
                <button type="button" onClick={() => void handleCancelTicket()} disabled={isCancellingTicket} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">
                  <XCircle className="h-4 w-4" />{isCancellingTicket ? 'Cancelando ticket...' : 'Cancelar ticket'}
                </button>
              )}
              {selectedTicket.status === 'cancelado' && <p className="mt-3 text-xs font-bold text-rose-700">Ticket cancelado por você. A conversa permanece disponível somente para consulta.</p>}
            </div>

            <div 
              ref={scrollRef}
              className={isAffiliate ? "flex-1 overflow-y-auto space-y-4 p-4 bg-[#faf8f4] border border-[#c9c2b6] mb-4" : "flex-1 overflow-y-auto space-y-4 p-4 bg-neutral-100/50 rounded-2xl ring-1 ring-neutral-300 mb-4"}
            >
              {loadingMessages ? (
                <p className="text-center text-xs text-neutral-400">Carregando mensagens...</p>
              ) : messages.length > 0 ? (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${msg.tipo === 'cliente' ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[80%] p-3 text-sm ${
                      msg.tipo === 'cliente' 
                        ? (isAffiliate ? 'bg-[#0b1522] text-white border border-[#1b2b3f]' : 'bg-indigo-600 text-white rounded-2xl')
                        : (isAffiliate ? 'bg-white text-[#0b1522] border border-[#c9c2b6] shadow-sm' : 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-100 rounded-2xl')
                    }`}>
                      <p className="font-bold text-[10px] opacity-75 mb-1">{msg.autor_nome}</p>
                      {msg.anexo_url && (
                        <div className="mb-2">
                          <SecureAttachmentButton
                            reference={msg.anexo_url}
                            fileName={msg.anexo_nome || 'Anexo do suporte'}
                            mimeType={msg.anexo_tipo}
                            className={msg.tipo === 'cliente'
                              ? 'bg-black/10 text-white hover:bg-black/20'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}
                          />
                        </div>
                      )}
                      {msg.mensagem && <p className="whitespace-pre-wrap">{msg.mensagem}</p>}
                      <p className="text-[9px] opacity-60 mt-1 text-right">{formatDateTime(msg.data_envio)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-xs text-neutral-400 mt-10">Aguardando resposta do suporte...</p>
              )}
            </div>

            {['aberto', 'em andamento'].includes(selectedTicket.status) ? (
              <div className="flex flex-col gap-2">
                {attachment && (
                  <div className="flex items-center gap-2 bg-neutral-100 p-2 border border-neutral-200 self-start text-xs">
                    {attachment.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-[#c59a4a]" /> : <FileIcon className="h-4 w-4 text-[#c59a4a]" />}
                    <span className="font-medium text-neutral-700 max-w-[200px] truncate">{attachment.name}</span>
                    <button onClick={() => setAttachment(null)} className="p-1 hover:bg-neutral-200 text-neutral-500 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="flex gap-3 items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        setAttachment(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={isAffiliate
                      ? "flex h-12 w-12 items-center justify-center border border-[#c9c2b6] bg-white text-[#0b1522] hover:bg-[#f4efe6] shrink-0 transition-all"
                      : "flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 transition-all hover:bg-neutral-200 shrink-0"
                    }
                    title="Anexar arquivo"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input 
                    type="text" 
                    placeholder="Digite sua mensagem..." 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    className={isAffiliate
                      ? "flex-1 border border-[#c9c2b6] bg-white px-4 py-3 text-sm text-[#0b1522] focus:border-[#c59a4a] focus:ring-1 focus:ring-[#c59a4a] outline-none min-w-0"
                      : "flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none min-w-0"
                    }
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={isSendingMessage || (!newMessage.trim() && !attachment)}
                    className={isAffiliate
                      ? "flex h-12 w-12 items-center justify-center bg-[#0b1522] text-white hover:bg-[#16273b] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 transition-all border border-[#1b2b3f]"
                      : "flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    }
                  >
                    {isSendingMessage ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Send className="h-5 w-5 ml-1" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm font-bold text-neutral-400 py-4">{selectedTicket.status === 'cancelado' ? 'Este ticket foi cancelado por você.' : 'Este ticket foi encerrado.'}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function TicketForm({ onSubmit, onCancel, isSubmitting, initialData, modulo = 'cliente' }: { onSubmit: (data: any) => void, onCancel: () => void, isSubmitting: boolean, initialData?: { assunto?: string, descricao?: string }, modulo?: 'cliente' | 'afiliado' }) {
  const isAffiliate = modulo === 'afiliado';
  const [formData, setFormData] = useState({
    assunto: initialData?.assunto || '',
    descricao: initialData?.descricao || ''
  });

  useEffect(() => {
    if (initialData?.assunto || initialData?.descricao) {
      setFormData({
        assunto: initialData.assunto || '',
        descricao: initialData.descricao || ''
      });
    }
  }, [initialData]);

  const inputClass = isAffiliate
    ? "w-full border border-[#c9c2b6] bg-white px-4 py-3 text-sm text-[#0b1522] focus:border-[#c59a4a] focus:ring-1 focus:ring-[#c59a4a] outline-none transition-all placeholder-[#727a84]"
    : "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none";

  const btnPrimary = isAffiliate
    ? "flex-1 min-h-[48px] bg-[#0b1522] py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#16273b] disabled:opacity-50 flex items-center justify-center gap-2 transition-all border border-[#1b2b3f]"
    : "flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2";

  const btnCancel = isAffiliate
    ? "flex-1 min-h-[48px] border border-[#c9c2b6] bg-white py-3 text-xs font-bold uppercase tracking-wider text-[#69717c] hover:bg-[#f4efe6] transition-all"
    : "flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50";

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-6">
      <div>
        <label className={`mb-2 block text-xs font-bold uppercase tracking-[0.12em] ${isAffiliate ? 'text-[#4f5864]' : 'text-neutral-700'}`}>Assunto *</label>
        <input 
          type="text" 
          required
          placeholder="Ex: Dúvida sobre comissão, link de divulgação, suporte..."
          value={formData.assunto}
          onChange={e => setFormData({...formData, assunto: e.target.value})}
          className={inputClass}
        />
      </div>
      <div>
        <label className={`mb-2 block text-xs font-bold uppercase tracking-[0.12em] ${isAffiliate ? 'text-[#4f5864]' : 'text-neutral-700'}`}>Descrição Detalhada *</label>
        <textarea 
          rows={5}
          required
          placeholder="Descreva seu problema ou dúvida com o máximo de detalhes possível..."
          value={formData.descricao}
          onChange={e => setFormData({...formData, descricao: e.target.value})}
          className={inputClass}
        />
      </div>
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel} className={btnCancel}>Cancelar</button>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className={btnPrimary}
        >
          {isSubmitting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isSubmitting ? 'Enviando...' : 'Enviar Ticket'}
        </button>
      </div>
    </form>
  );
}

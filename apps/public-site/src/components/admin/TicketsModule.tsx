import { useState, useEffect, useRef } from 'react';
import { Search, Ticket, Clock, CheckCircle, MessageSquare, User, Send, Plus, Paperclip, X, File as FileIcon, Image as ImageIcon, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Ticket as TicketType, TicketMensagem } from '../../types';
import { Modal } from '../ui/Modal';
import { formatDateTime } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { removePrivateDocument, uploadPrivateDocument } from '../../lib/privateStorage';
import { SecureAttachmentButton } from '../ui/SecureAttachmentButton';

export function TicketsModule({ initialTab, initialItemId, adminType, colaboradorId, colaboradorNome }: { initialTab?: string, initialItemId?: string, adminType?: string, colaboradorId?: string, colaboradorNome?: string }) {
  const { pendencies, refreshCounts } = useAdminNotifications();
  const [activeTab, setActiveTab] = useState<'abertos' | 'em andamento' | 'concluidos'>('abertos');

  const tabs = [
    { id: 'abertos', label: 'Tickets Abertos', icon: Clock },
    { id: 'em andamento', label: 'Em Atendimento', icon: MessageSquare },
    { id: 'concluidos', label: 'Resolvidos', icon: CheckCircle }
  ];

  useEffect(() => {
    if (initialTab && ['abertos', 'em andamento', 'concluidos'].includes(initialTab)) {
      setActiveTab(initialTab as any);
    }
  }, [initialTab]);
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [messages, setMessages] = useState<TicketMensagem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [profileInfo, setProfileInfo] = useState<any>(null);
  
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef(activeTab);
  const searchRef = useRef(search);
  const filtersRef = useRef(filters);
  const notificationAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    notificationAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
  }, []);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hasAutoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!initialItemId || hasAutoOpened.current === initialItemId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('tickets').select('*, clientes(nome, codigo_cliente)').eq('id', initialItemId).maybeSingle();
      if (cancelled) return;
      if (error || !data) { toast.error('Chamado não encontrado ou sem permissão de acesso.'); return; }
      hasAutoOpened.current = initialItemId;
      setSelectedTicket(data);
      setIsDetailOpen(true);
    })();
    return () => { cancelled = true; };
  }, [initialItemId]);

  useEffect(() => {
    if (initialItemId && tickets.length > 0 && hasAutoOpened.current !== initialItemId) {
      const ticket = tickets.find(t => t.id === initialItemId);
      if (ticket) {
        setSelectedTicket(ticket);
        setIsDetailOpen(true);
        hasAutoOpened.current = initialItemId;
        
        const timer = setTimeout(() => {
          const element = document.getElementById(`ticket-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedId(initialItemId);
            setTimeout(() => setHighlightedId(null), 3000);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [initialItemId, tickets]);

  useEffect(() => {
    fetchTickets();
  }, [activeTab, search, filters]);

  // Stable Realtime Subscription for Tickets List
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchTickets();
      }, 300);
    };

    const channel = supabase
      .channel(`admin-tickets-rt-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets'
      }, () => {
        debouncedFetch();
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array for stability

  useEffect(() => {
    if (selectedTicket?.id && isDetailOpen) {
      fetchMessages(selectedTicket.id);
      
      // Real-time subscription for messages
      const channel = supabase
        .channel(`ticket_${selectedTicket.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'ticket_mensagens',
          filter: `ticket_id=eq.${selectedTicket.id}`
        }, (payload) => {
          const newMessage = payload.new as TicketMensagem;
          setMessages(prev => [...prev, newMessage]);
          
          // Se sou eu vendo o ticket, marco como lida automaticamente se for do cliente/prestador
          if (newMessage.tipo === 'cliente' || newMessage.tipo === 'prestador') {
            markMessagesAsRead(selectedTicket.id);
            // Play notification sound if the message is new and not from admin
            notificationAudio.current?.play().catch(() => {});
          }
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${selectedTicket.id}`
        }, (payload) => {
          setSelectedTicket(prev => prev ? { ...prev, ...payload.new } as TicketType : null);
        })
        .subscribe();
      
      fetchProfileInfo();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedTicket?.id, isDetailOpen]);

  const fetchProfileInfo = async () => {
    if (!selectedTicket) return;
    
    if (selectedTicket.cliente_id) {
      const { data } = await supabase
        .from('clientes')
        .select('nome, cpf, cnpj, email, telefone, status, saldo_carteira')
        .eq('id', selectedTicket.cliente_id)
        .single();
      if (data) setProfileInfo({ ...data, type: 'cliente' });
    } else if (selectedTicket.prestador_id) {
      const { data } = await supabase
        .from('prestadores')
        .select('nome_razao, documento, email, telefone, status')
        .eq('id', selectedTicket.prestador_id)
        .single();
      if (data) setProfileInfo({ ...data, type: 'prestador', nome: data.nome_razao, cpf_cnpj: data.documento });
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const markMessagesAsRead = async (ticketId: string) => {
    try {
      const { error } = await supabase
        .from('ticket_mensagens')
        .update({ lida: true })
        .eq('ticket_id', ticketId)
        .eq('tipo', 'cliente')
        .eq('lida', false);
      
      if (!error) {
        setUnreadCounts(prev => ({ ...prev, [ticketId]: 0 }));
    refreshCounts?.();
      }
    } catch (err) {
      console.error('Erro ao marcar mensagens como lidas:', err);
    }
  };

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const fetchTickets = async () => {
    let query = supabase
      .from('tickets')
      .select('*, clientes(nome, codigo_cliente)');
    
    if (activeTab === 'abertos') query = query.eq('status', 'aberto');
    else if (activeTab === 'em andamento') query = query.eq('status', 'em andamento');
    else if (activeTab === 'concluidos') query = query.eq('status', 'concluido');
 
    if (search) {
      query = query.or(`assunto.ilike.%${search}%,clientes.nome.ilike.%${search}%`);
    }
 
    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
      query = query.gte('data_abertura', startDate).lte('data_abertura', endDate);
    }
 
    const { data } = await query.order('data_abertura', { ascending: false });
    
    if (data) {
      setTickets(data);
      // Buscar contagens de mensagens não lidas para os tickets listados
      const ticketIds = data.map(t => t.id);
      if (ticketIds.length > 0) {
        const { data: countsData } = await supabase
          .from('ticket_mensagens')
          .select('ticket_id')
          .in('ticket_id', ticketIds)
          .eq('lida', false)
          .eq('tipo', 'cliente');
        
        const counts: Record<string, number> = {};
        countsData?.forEach(msg => {
          counts[msg.ticket_id] = (counts[msg.ticket_id] || 0) + 1;
        });
        setUnreadCounts(counts);
      }
    }
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
    
    // Marcar como lidas ao entrar
    markMessagesAsRead(ticketId);
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachment) || !selectedTicket) return;

    let uploadedReference: string | null = null;
    let messagePersisted = false;

    try {
      let anexoUrl = '';
      let anexoTipo = '';
      let anexoNome = '';

      if (attachment) {
        const ownerId = selectedTicket.prestador_id || selectedTicket.cliente_id;
        if (!ownerId) throw new Error('O ticket não possui um destinatário válido.');

        const uploaded = await uploadPrivateDocument(attachment, {
          scope: selectedTicket.prestador_id ? 'prestadores' : 'clientes',
          ownerId,
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
        autor_id: colaboradorId || 'admin',
        autor_nome: colaboradorNome || 'Suporte GSA',
        mensagem: newMessage,
        anexo_url: anexoUrl || undefined,
        anexo_tipo: anexoTipo || undefined,
        anexo_nome: anexoNome || undefined,
        data_envio: new Date().toISOString(),
        tipo: 'admin',
      };

      setMessages(prev => [...prev, tempMessage]);
      setNewMessage('');
      setAttachment(null);

      try {
        const { error } = await supabase.from('ticket_mensagens').insert([{
          ticket_id: selectedTicket.id,
          autor_id: colaboradorId || 'admin',
          autor_nome: colaboradorNome || 'Suporte GSA',
          mensagem: newMessage,
          anexo_url: anexoUrl || null,
          anexo_tipo: anexoTipo || null,
          anexo_nome: anexoNome || null,
          tipo: 'admin',
        }]);
        if (error) throw error;
      } catch (err) {
        setMessages(prev => prev.filter(message => message.id !== tempMessage.id));
        toast.error('Erro ao enviar mensagem no ticket.');
        return;
      }
      messagePersisted = true;

      if (selectedTicket.cliente_id) {
        // Notificação gravada pelo banco na mesma transação da ação.
      } else if (selectedTicket.prestador_id) {
        await createNotification(
          selectedTicket.prestador_id,
          'Suporte GSA',
          `Nova mensagem no ticket: ${selectedTicket.assunto}`,
          'suporte',
          'mensagens',
          selectedTicket.id,
        );
      }

      await logService.logAction({
        acao: 'RESPONDER_TICKET',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Respondendo ticket #${selectedTicket.id.slice(0, 8)} - ${selectedTicket.assunto}`,
      });
    } catch (error: any) {
      if (!messagePersisted && uploadedReference) {
        await removePrivateDocument(uploadedReference).catch(() => undefined);
      }
      console.error('Erro detalhado ao enviar mensagem:', error);
      toast.error(error?.message || 'Erro ao enviar mensagem.');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('tickets')
      .update({ 
        status, 
        data_fechamento: status === 'concluido' ? new Date().toISOString() : null 
      })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar ticket.');
    } else {
      toast.success('Status do ticket atualizado.');
      
      const currentTicket = selectedTicket?.id === id ? selectedTicket : tickets.find(t => t.id === id);
      
      if (currentTicket) {
        const acaoOrigem = status === 'concluido' ? 'ticket_fechado' : 'ticket_respondido';
        const titulo = status === 'concluido' ? '✅ Ticket Concluído' : '📨 Ticket em Atendimento';
        const mensagem = `Seu ticket "${currentTicket.assunto}" foi marcado como ${status === 'concluido' ? 'concluído' : 'em atendimento'}.`;

        if (currentTicket.cliente_id) {
          await notificationService.notifyClient(
            currentTicket.cliente_id,
            titulo,
            mensagem,
            'suporte',
            acaoOrigem as any,
            { itemId: currentTicket.id, prioridade: status === 'concluido' ? 'normal' : 'alta', contexto: { ticket_id: currentTicket.id, novo_status: status } }
          );
        } else if (currentTicket.prestador_id) {
          await notificationService.notifyProvider(
            currentTicket.prestador_id,
            titulo,
            mensagem,
            'suporte',
            acaoOrigem as any,
            { itemId: currentTicket.id, prioridade: status === 'concluido' ? 'normal' : 'alta', contexto: { ticket_id: currentTicket.id, novo_status: status } }
          );
        }
      }


      // Auto switch tab
      if (status === 'em andamento') setActiveTab('em andamento');
      else if (status === 'concluido') setActiveTab('concluidos');
      
      if (selectedTicket?.id === id) {
        setSelectedTicket({ ...selectedTicket, status: status as any });
      }
      
      // Log Action
      await logService.logAction({
        acao: 'ALTERAR_STATUS_TICKET',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Alterou status do ticket #${id.slice(0, 8)} (${currentTicket?.assunto}) para ${status}`
      });

      fetchTickets();
      refreshCounts?.();
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      {/* Module Header */}
      <div className="bg-[#1a1a1a] p-3 md:p-4 rounded-[2rem] md:rounded-[2.5rem] text-white relative shadow-2xl mb-3">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-3 md:gap-3">
          <div className="flex flex-row items-center justify-between gap-6 border-b border-white/5 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-6 w-1 bg-rose-500 rounded-full shadow-[0_0_20px_rgba(244,63,94,0.6)]"></div>
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400 whitespace-nowrap overflow-hidden">
                Central de Atendimento
              </h1>
            </div>
            <Ticket className="hidden md:block h-8 w-8 text-white/5" />
          </div>

          <div className="relative flex flex-col items-center md:items-start gap-3">
          <div className="flex flex-wrap justify-center md:justify-start gap-1.5 w-full">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <div key={tab.id} className="relative flex-none font-black translate-y-0 active:translate-y-1 transition-transform">
                  <button
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 md:px-4 rounded-xl transition-all text-[9px] sm:text-[10px] md:text-[11px] uppercase tracking-widest border
                      ${isActive 
                        ? 'bg-white text-rose-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-rose-500' 
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.id === 'abertos' && pendencies.suporte_tickets_abertos > 0 && (
                      <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white ring-2 ring-white/10 animate-pulse">
                        {pendencies.suporte_tickets_abertos}
                      </span>
                    )}
                    {tab.id === 'em andamento' && (pendencies.suporte_tickets_em_andamento > 0 || pendencies.suporte_mensagens_nao_lidas > 0) && (
                      <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white ring-2 ring-white/10 animate-pulse">
                        {pendencies.suporte_mensagens_nao_lidas > 0 ? pendencies.suporte_mensagens_nao_lidas : pendencies.suporte_tickets_em_andamento}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-end gap-4 px-2 mb-8">
        <GlobalFilter 
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'mes',
              label: 'Mês de Abertura',
              type: 'select',
              options: [
                { value: '01', label: 'Janeiro' },
                { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' },
                { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' },
                { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' },
                { value: '12', label: 'Dezembro' }
              ]
            },
            {
              id: 'ano',
              label: 'Ano',
              type: 'select',
              options: [
                { value: '2024', label: '2024' },
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' }
              ]
            }
          ]}
        />
      </div>

      <div key={activeTab} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {tickets.map((ticket) => (
          <div 
            key={ticket.id} 
            id={`ticket-${ticket.id}`}
            onClick={() => { setSelectedTicket(ticket); setIsDetailOpen(true); }}
            className={`group relative cursor-pointer rounded-[2.5rem] bg-white p-8 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-2xl hover:shadow-rose-500/5 hover:-translate-y-1 overflow-hidden ${
              highlightedId === ticket.id 
                ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 scale-[1.01]' 
                : ''
            }`}
          >
            {/* Status Indicator (Subtle background glow on hover) */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 ${
              ticket.status === 'aberto' ? 'bg-amber-500' : 
              ticket.status === 'em andamento' ? 'bg-indigo-500' : 
              'bg-emerald-500'
            }`} />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className={`flex h-16 w-16 relative shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 transition-all group-hover:scale-110 ${
                  ticket.status === 'aberto' ? 'bg-amber-50 text-amber-600 ring-amber-100' : 
                  ticket.status === 'em andamento' ? 'bg-indigo-50 text-indigo-600 ring-indigo-100' : 
                  'bg-emerald-50 text-emerald-600 ring-emerald-100'
                }`}>
                  <MessageSquare className="h-8 w-8" />
                  
                  {unreadCounts[ticket.id] > 0 && (
                    <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-4 ring-white animate-pulse shadow-lg">
                      {unreadCounts[ticket.id]}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-neutral-900 group-hover:text-rose-600 transition-colors uppercase tracking-tight leading-tight mb-2">
                    {ticket.assunto}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-[10px] font-black text-neutral-400 flex items-center gap-2 uppercase tracking-widest bg-neutral-50 px-3 py-1.5 rounded-lg ring-1 ring-neutral-100">
                      <User className="w-3 h-3 text-rose-400" />
                      {(ticket as any).clientes?.nome || 'Usuário'}
                    </span>
                    <span className="text-[10px] font-black text-neutral-400 flex items-center gap-2 uppercase tracking-widest bg-neutral-50 px-3 py-1.5 rounded-lg ring-1 ring-neutral-100">
                      <Clock className="w-3 h-3 text-rose-400" />
                      {formatDateTime(ticket.data_abertura)}
                    </span>
                    <span className="text-[10px] font-black text-neutral-400 flex items-center gap-2 uppercase tracking-widest bg-neutral-50 px-3 py-1.5 rounded-lg ring-1 ring-neutral-100">
                      ID: #{ticket.id.slice(0, 8)}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg ring-1 ${
                      ticket.modulo === 'afiliado' 
                        ? 'bg-amber-50 text-amber-700 ring-amber-200' 
                        : 'bg-sky-50 text-sky-700 ring-sky-200'
                    }`}>
                      {ticket.modulo === 'afiliado' ? 'Afiliado' : 'Cliente'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between sm:justify-end gap-6 pt-4 sm:pt-0">
                 <button 
                   className="flex items-center gap-3 bg-neutral-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 transition-all active:scale-95 shadow-xl shadow-neutral-200"
                 >
                   {ticket.status === 'aberto' ? 'Atender Agora' : 'Ver Mensagens'}
                 </button>
              </div>
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <div className="py-32 text-center bg-white rounded-[3rem] shadow-sm ring-1 ring-black/5 animate-in fade-in zoom-in duration-500">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-50 text-neutral-200 mx-auto mb-6 ring-1 ring-neutral-100">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-neutral-900 mb-2 tracking-tight uppercase">Lista Limpa</h3>
            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] max-w-xs mx-auto leading-relaxed">Não há chamados pendentes nesta categoria no momento.</p>
          </div>
        )}
      </div>

      <Modal isOpen={isDetailOpen} onClose={() => { setIsDetailOpen(false); setProfileInfo(null); }} title="Central de Atendimento" size="full">
        {selectedTicket && (
          <div className="flex flex-col h-[75vh] md:h-[650px]">
            {/* Context Header */}
            {profileInfo && (
              <div className="mb-4 bg-neutral-50 p-4 rounded-2xl ring-1 ring-neutral-200 flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${profileInfo.type === 'cliente' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">{profileInfo.type === 'cliente' ? 'Cliente' : 'Prestador'}</p>
                    <p className="text-sm font-black text-neutral-900">{profileInfo.nome}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 md:gap-8">
                  <div>
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Documento</p>
                    <p className="text-xs font-bold text-neutral-700">{profileInfo.cpf || profileInfo.cnpj || profileInfo.cpf_cnpj || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Telefone</p>
                    <p className="text-xs font-bold text-neutral-700">{profileInfo.telefone || '---'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Status</p>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                      profileInfo.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {profileInfo.status}
                    </span>
                  </div>
                  <AdminWhatsAppButton 
                    telefone={profileInfo.telefone}
                    mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'ticket',
                      clienteNome: profileInfo.nome,
                      status: selectedTicket.status === 'aberto' ? 'Aberto' : selectedTicket.status === 'concluido' ? 'Concluído' : 'Em Atendimento',
                      codigo: selectedTicket.id.slice(0, 8),
                      titulo: selectedTicket.assunto
                    })}
                    className="shrink-0"
                  />
                </div>
              </div>
            )}

            {/* Ticket Context Info */}
            <div className="rounded-3xl bg-[#1a1a1a] p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-rose-600 shadow-xl">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">#{selectedTicket.id.slice(0, 8)}</span>
                <span className="text-[10px] font-bold text-white/30">{formatDateTime(selectedTicket.data_abertura)}</span>
              </div>
              <h4 className="font-black text-white uppercase tracking-tight text-lg mb-1">{selectedTicket.assunto}</h4>
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <User className="w-3 h-3" />
                {profileInfo?.nome || (selectedTicket as any).clientes?.nome || 'Usuário'}
              </p>
              <p className="text-xs text-white/60 leading-relaxed bg-white/5 p-3 rounded-xl">{selectedTicket.descricao}</p>
            </div>

            {/* Chat Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-6 p-6 bg-neutral-50 rounded-[2rem] ring-1 ring-neutral-200 mb-6 custom-scrollbar"
            >
              {loadingMessages ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-full border-4 border-[#1a1a1a] border-t-transparent animate-spin"/>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Carregando conversa...</p>
                </div>
              ) : messages.length > 0 ? (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.tipo === 'admin' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] flex flex-col ${msg.tipo === 'admin' ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl p-4 shadow-sm ${
                        msg.tipo === 'admin' 
                          ? 'bg-[#1a1a1a] text-white rounded-tr-none' 
                          : 'bg-white text-neutral-900 ring-1 ring-neutral-100 rounded-tl-none'
                      }`}>
                         <p className="font-black text-[9px] uppercase tracking-widest opacity-80 mb-2 border-b border-white/10 pb-1">{msg.autor_nome}</p>
                         {msg.anexo_url && (
                           <div className="mb-2">
                             <SecureAttachmentButton
                               reference={msg.anexo_url}
                               fileName={msg.anexo_nome || 'Anexo do suporte'}
                               mimeType={msg.anexo_tipo}
                               className={msg.tipo === 'admin'
                                 ? 'bg-white/10 text-white hover:bg-white/20'
                                 : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}
                             />
                           </div>
                         )}
                         {msg.mensagem && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.mensagem}</p>}
                      </div>
                      <span className="text-[9px] font-bold text-neutral-400 mt-1 uppercase tracking-tight">{formatDateTime(msg.data_envio)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-24 text-center">
                  <MessageSquare className="w-12 h-12 text-neutral-200 mx-auto mb-2" />
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Inicie a conversa</p>
                </div>
              )}
            </div>

            {/* Admin Actions Area */}
            <div className="flex gap-4 items-center">
              {selectedTicket.status === 'em andamento' ? (
                <div className="flex-1 flex flex-col gap-2">
                  {attachment && (
                    <div className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-neutral-200 self-start">
                      {attachment.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-rose-500" /> : <FileIcon className="h-4 w-4 text-rose-500" />}
                      <span className="text-xs font-medium text-neutral-700 max-w-[200px] truncate">{attachment.name}</span>
                      <button onClick={() => setAttachment(null)} className="rounded-full p-1 hover:bg-neutral-200 text-neutral-500 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="relative flex-1 flex items-center gap-2 bg-white rounded-2xl border border-neutral-200 shadow-sm p-1">
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
                        className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 transition-all hover:bg-neutral-200 shrink-0"
                        title="Anexar arquivo"
                      >
                        <Paperclip className="h-5 w-5" />
                      </button>
                      <input 
                        type="text" 
                        placeholder="Responda ao cliente..." 
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        className="w-full bg-transparent px-4 py-4 pr-16 text-sm focus:outline-none transition-all font-medium"
                      />
                      <button 
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() && !attachment}
                        className="absolute right-1 top-1 bottom-1 rounded-xl bg-[#1a1a1a] px-4 text-white shadow-lg transition-all hover:bg-black active:scale-95 disabled:opacity-20"
                      >
                        <Send className="h-5 w-5" />
                      </button>
                    </div>
                    <button 
                      onClick={() => handleUpdateStatus(selectedTicket.id, 'concluido')}
                      className="rounded-2xl bg-emerald-600 px-8 py-4 font-black text-white text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/10 active:scale-95 whitespace-nowrap"
                    >
                      Encerrar
                    </button>
                  </div>
                </div>
              ) : selectedTicket.status === 'aberto' ? (
                <button 
                  onClick={() => handleUpdateStatus(selectedTicket.id, 'em andamento')}
                  className="flex-1 rounded-2xl bg-[#1a1a1a] py-5 font-black text-white text-[10px] uppercase tracking-widest shadow-2xl hover:bg-black transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4 mr-2 inline-block" />
                  Iniciar Atendimento Agora
                </button>
              ) : (
                <div className="flex-1 bg-neutral-100 p-5 rounded-2xl text-center">
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Este ticket foi concluído em {selectedTicket.data_fechamento ? formatDateTime(selectedTicket.data_fechamento) : 'data desconhecida'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

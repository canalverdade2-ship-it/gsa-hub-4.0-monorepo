import React, { useRef, useState } from 'react';
import { MessageCircle, Plus, Send, Paperclip, Clock, CheckCircle2, User, UserCheck, AlertCircle, ArrowLeft, ChevronRight, X, FileText, Lock } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, isDemoMode, when } from '../../api';
import MessageAttachments, { type MessageAttachment } from '../support/MessageAttachments';

interface TicketMessage {
  id: string;
  sender: 'client' | 'admin';
  author: string;
  text: string;
  time: string;
  attachment?: string;
  attachments?: MessageAttachment[];
}

interface TicketItem {
  id: string;
  code: string;
  title: string;
  orderCode?: string;
  status: 'Aberto' | 'Em atendimento' | 'Resolvido';
  lastUpdate: string;
  messages: TicketMessage[];
}

export interface ClientTicketsProps {
  routeDetail?: string | null;
  onOpenTicket?: (code: string) => void;
  onCloseTicket?: () => void;
}

const normalizeAttachments = (files: any): MessageAttachment[] => {
  const values = Array.isArray(files) ? files : files ? [files] : [];
  return values.map((file: any) => typeof file === 'string'
    ? { name: file }
    : {
      id: file.id || file.fileId,
      fileId: file.fileId || file.id,
      name: file.name || file.fileName || 'Anexo',
      url: file.url || null,
      viewUrl: file.viewUrl || null,
      mimeType: file.mimeType || file.type,
      size: file.size
    });
};

export function ClientTickets({ routeDetail, onOpenTicket, onCloseTicket }: ClientTicketsProps) {
  const [tickets, setTickets] = useState<TicketItem[]>(isDemoMode ? [
    {
      id: 'tk-1',
      code: '#TK-108',
      title: 'Dúvida sobre enquadramento dos CNAEs secundários de tecnologia',
      orderCode: 'OS105',
      status: 'Em atendimento',
      lastUpdate: 'Hoje às 10:45',
      messages: [
        {
          id: 'm-1',
          sender: 'client',
          author: 'Roberto Alfa',
          text: 'Olá equipe GSA, gostaríamos de confirmar se o CNAE 6201-5/01 (Desenvolvimento de programas de computador sob encomenda) pode ser incluído no Anexo III do Simples Nacional ou se fica retido no Anexo V com o Fator R.',
          time: 'Ontem às 16:30'
        },
        {
          id: 'm-2',
          sender: 'admin',
          author: 'João Carlos da Silva (Especialista Tributário GSA)',
          text: 'Olá Roberto! Sim, o CNAE 6201-5/01 é sujeito ao Fator R. Caso a folha de pagamento atinja 28% do faturamento, sua tributação é reduzida para a alíquota inicial de 6% do Anexo III. Nós já preparamos a minuta contemplando este enquadramento para garantir a menor carga tributária possível.',
          time: 'Hoje às 10:45'
        }
      ]
    },
    {
      id: 'tk-2',
      code: '#TK-102',
      title: 'Confirmação do endereço fiscal junto à prefeitura',
      orderCode: 'OS105',
      status: 'Resolvido',
      lastUpdate: '29/09/2026',
      messages: [
        {
          id: 'm-3',
          sender: 'client',
          author: 'Roberto Alfa',
          text: 'Conseguiram validar a viabilidade locacional na Prefeitura de SP para o endereço da Av. Paulista?',
          time: '29/09/2026 às 11:00'
        },
        {
          id: 'm-4',
          sender: 'admin',
          author: 'Mariana Souza (GSA Atendimento)',
          text: 'Sim! A consulta de viabilidade nº SP-2026-9912 foi DEFERIDA sem restrições. Já avançamos para a elaboração do Contrato Social.',
          time: '29/09/2026 às 14:20'
        }
      ]
    }
  ] : []);
  React.useEffect(() => {
    const reload = async () => {
      try {
        const state = await api('/client-state');
        if (Array.isArray(state.tickets) && state.tickets.length) {
          setTickets(state.tickets.map((ticket: any) => ({
            id: String(ticket.id), code: ticket.code || `#TK-${ticket.id}`, title: ticket.title, orderCode: ticket.orderId ? `OS${ticket.orderId}` : '', status: ticket.status || 'Aberto', lastUpdate: when(ticket.updatedAt || ticket.createdAt),
            messages: (ticket.messages || []).map((message: any) => {
              const attachments = normalizeAttachments(message.files);
              return {
                id: String(message.id), sender: message.role === 'admin' ? 'admin' : 'client', author: message.author,
                text: message.text, time: when(message.at), attachment: attachments[0]?.name, attachments
              };
            })
          })));
        }
        setOrderOptions((Array.isArray(state.orders) ? state.orders : []).map((order: any) => ({ id: String(order.id), code: order.code || `OS${order.id}`, title: order.title || 'Ordem de Serviço' })));
      } catch {
        // Keep the local fixture visible if the server is temporarily unavailable.
      }
    };
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  const [activeTicket, setActiveTicket] = useState<TicketItem | null>(null);
  React.useEffect(() => {
    setActiveTicket(routeDetail ? tickets.find((ticket) => (
      ticket.code === routeDetail ||
      ticket.id === routeDetail ||
      routeDetail === `TCK${ticket.id}` ||
      routeDetail === `#TK-${ticket.id}`
    )) || null : null);
  }, [routeDetail, tickets]);

  React.useEffect(() => {
    if (activeTicket) {
      document.body.classList.add('is-fullscreen-chat');
    } else {
      document.body.classList.remove('is-fullscreen-chat');
    }
    return () => {
      document.body.classList.remove('is-fullscreen-chat');
    };
  }, [activeTicket]);
  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newOrderId, setNewOrderId] = useState('');
  const [orderOptions, setOrderOptions] = useState<Array<{ id: string; code: string; title: string }>>([]);

  const handleSendReply = async () => {
    if ((!replyText.trim() && !replyAttachment) || !activeTicket || activeTicket.status === 'Resolvido') return;
    const newMsg: TicketMessage = {
      id: `m-${Date.now()}`,
      sender: 'client',
      author: 'Roberto Alfa',
      text: replyText.trim() || 'Arquivo anexado',
      time: 'Agora mesmo',
      attachment: replyAttachment?.name,
      attachments: replyAttachment ? [{ name: replyAttachment.name }] : []
    };

    const updated = {
      ...activeTicket,
      messages: [...activeTicket.messages, newMsg],
      lastUpdate: 'Agora mesmo'
    };

    try {
      const payload = new FormData();
      payload.append('text', newMsg.text);
      if (replyAttachment) payload.append('attachments', replyAttachment);
      await api(`/tickets/${activeTicket.id}/message`, payload);
    } catch {
      // The optimistic update keeps the conversation usable while offline.
    }
    setActiveTicket(updated);
    setTickets(tickets.map((t) => (t.id === updated.id ? updated : t)));
    setReplyText('');
    setReplyAttachment(null);
    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
  };

  const handleCreateTicket = async () => {
    if (!newTitle.trim() || !newMessage.trim()) return;
    const created: TicketItem = {
      id: `tk-${Date.now()}`,
      code: `#TK-${100 + tickets.length + 7}`,
      title: newTitle,
      orderCode: orderOptions.find((order) => order.id === newOrderId)?.code || '',
      status: 'Aberto',
      lastUpdate: 'Agora mesmo',
      messages: [
        {
          id: `m-${Date.now()}`,
          sender: 'client',
          author: 'Roberto Alfa',
          text: newMessage,
          time: 'Agora mesmo'
        }
      ]
    };

    try {
      const result = await api('/tickets', { title: newTitle, initialMessage: newMessage, orderId: newOrderId || null });
      created.id = String(result.id);
      created.code = `#TK-${result.id}`;
    } catch {
      // The optimistic ticket remains visible if the server is temporarily unavailable.
    }
    setTickets([created, ...tickets]);
    setActiveTicket(created);
    onOpenTicket?.(created.code);
    setNewTitle('');
    setNewMessage('');
    setNewOrderId('');
    setIsNewTicketModalOpen(false);
  };

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', flex: activeTicket ? 1 : 'none', display: activeTicket ? 'flex' : 'block', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      {!activeTicket && <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Central de Suporte & Chamados</h1>
          <p className="page-subtitle">Tire dúvidas com nossa equipe de especialistas e consulte seus tickets de atendimento.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={() => setIsNewTicketModalOpen(true)}
        >
          Abrir Novo Chamado
        </Button>
      </div>}

      {activeTicket && (
        <div className="ticket-detail-navigation">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={() => { setActiveTicket(null); onCloseTicket?.(); }}>
            Voltar Para Meus Tickets
          </Button>
        </div>
      )}

      {/* Main Grid: Ticket List (Left) + Conversation Thread (Right) */}
      <div className={activeTicket ? 'ticket-detail-layout' : 'ticket-list-layout'}>
        {/* Left: Tickets List */}
        {!activeTicket && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map((tk) => {
            return (
              <div
                key={tk.id}
                onClick={() => {
                  setActiveTicket(tk);
                  onOpenTicket?.(tk.code);
                  setReplyText('');
                  setReplyAttachment(null);
                }}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 16,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  transition: 'all 150ms ease'
                }}
              >
                <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="pill pill--blue" style={{ fontSize: 11, fontWeight: 800 }}>
                      {tk.code}
                    </span>
                    {tk.orderCode && (
                      <span className="pill pill--gray" style={{ fontSize: 10 }}>
                        {tk.orderCode}
                      </span>
                    )}
                  </div>
                  <Badge
                    status={tk.status}
                    variant={tk.status === 'Resolvido' ? 'green' : tk.status === 'Em atendimento' ? 'yellow' : 'blue'}
                  />
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.4, marginBottom: 8 }}>
                  {tk.title}
                </div>

                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Última resposta: <strong>{tk.lastUpdate}</strong>
                </div>
                <ChevronRight className="ticket-list-chevron" size={18} />
              </div>
            );
          })}
        </div>}

        {/* Right: Active Ticket Thread */}
        {activeTicket && <Card className="ticket-conversation-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          {/* Thread Header */}
          <div className="responsive-row ticket-thread-header"
            style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                  {activeTicket.code}
                </span>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{activeTicket.title}</h2>
              </div>
              <div className="ticket-linked-order" style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Vinculado a: <strong>{activeTicket.orderCode} - Abertura de empresa</strong>
              </div>
            </div>

            <Badge
              status={activeTicket.status}
              variant={activeTicket.status === 'Resolvido' ? 'green' : activeTicket.status === 'Em atendimento' ? 'yellow' : 'blue'}
            />
          </div>

          {/* Messages Feed */}
          <div className="ticket-messages-feed" style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
            {activeTicket.messages.map((m) => {
              const isClient = m.sender === 'client';
              return (
                <div
                  key={m.id}
                  className="ticket-message"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isClient ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    alignSelf: isClient ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div className="responsive-row" style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isClient ? <User size={12} /> : <UserCheck size={12} color="#2563eb" />}
                    <span>{m.author} • {m.time}</span>
                  </div>

                  <div
                    className="ticket-message-bubble"
                    style={{
                      background: isClient ? '#2563eb' : '#f1f5f9',
                      color: isClient ? '#ffffff' : '#0f172a',
                      padding: '14px 18px',
                      borderRadius: 14,
                      borderBottomRightRadius: isClient ? 2 : 14,
                      borderBottomLeftRadius: isClient ? 14 : 2,
                      fontSize: 14,
                      lineHeight: 1.5,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                    }}
                  >
                    {m.text}
                    <MessageAttachments attachments={m.attachments || (m.attachment ? [{ name: m.attachment }] : [])} outgoing={isClient} demoRole="client" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply Area */}
          {activeTicket.status === 'Resolvido' ? (
            <div className="ticket-closed-notice">
              <span className="ticket-closed-icon"><Lock size={18} /></span>
              <div>
                <strong>Ticket Encerrado</strong>
                <span>Este atendimento foi resolvido e não aceita novas mensagens.</span>
              </div>
            </div>
          ) : <div className="ticket-reply-area" style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
            {replyAttachment && (
              <div className="ticket-reply-attachment">
                <FileText size={16} />
                <span>{replyAttachment.name}</span>
                <button type="button" aria-label="Remover Anexo" onClick={() => setReplyAttachment(null)}><X size={16} /></button>
              </div>
            )}
            <div className="responsive-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <input
                ref={replyFileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                hidden
                onChange={(event) => setReplyAttachment(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="ticket-attach-btn"
                aria-label="Anexar Arquivo"
                title="Anexar Arquivo"
                onClick={() => replyFileInputRef.current?.click()}
              >
                <Paperclip size={20} />
              </button>
              <div style={{ flex: 1 }}>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Escreva sua resposta para a equipe da GSA..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  style={{ resize: 'none' }}
                />
              </div>
              <Button
                variant="primary"
                size="md"
                icon={<Send size={16} />}
                onClick={handleSendReply}
                disabled={!replyText.trim() && !replyAttachment}
              >
                Enviar
              </Button>
            </div>
          </div>}
        </Card>}
      </div>

      
      
      {/* Modal: Novo Chamado */}
      <Modal open={isNewTicketModalOpen} onClose={() => setIsNewTicketModalOpen(false)} title="Abrir Novo Chamado">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize:13, color:'#64748b', margin:'0 0 10px 0' }}>Descreva sua dúvida ou solicitação para a nossa equipe.</p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título do chamado *</label>
            <input type="text" className="form-input" placeholder="Ex: Dúvida sobre imposto" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">OS Vinculada (Opcional)</label>
            <select className="form-select" value={newOrderId} onChange={(e) => setNewOrderId(e.target.value)}>
              <option value="">Selecione uma OS (Opcional)</option>
              {orderOptions.map((order) => <option key={order.id} value={order.id}>{order.code} — {order.title}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mensagem Inicial *</label>
            <textarea className="form-input" rows={4} placeholder="Detalhe sua solicitação..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}></textarea>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setIsNewTicketModalOpen(false)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={handleCreateTicket}>Abrir Chamado</Button>
            </div>
          </div>
        </div>
      </Modal>


    </div>
  );
}

export default ClientTickets;

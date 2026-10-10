import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  User,
  UserCheck,
  X
} from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import { api, when } from '../../api';
import MessageAttachments, { type MessageAttachment } from '../support/MessageAttachments';

type TicketStatus = 'Aberto' | 'Em atendimento' | 'Resolvido';

interface SupportMessage {
  id: string;
  author: string;
  role: 'admin' | 'client';
  text: string;
  internal?: boolean;
  at?: string;
  attachments: MessageAttachment[];
}

interface SupportTicket {
  id: string;
  code: string;
  clientId?: string;
  clientName: string;
  clientEmail?: string;
  orderCode?: string;
  orderTitle?: string;
  title: string;
  status: TicketStatus;
  createdAt?: string;
  updatedAt?: string;
  messages: SupportMessage[];
}

interface AdminSupportProps {
  routeDetail?: string | null;
  onOpenTicket?: (code: string) => void;
  onCloseTicket?: () => void;
}

const statusOptions: Array<'Todos' | TicketStatus> = ['Todos', 'Aberto', 'Em atendimento', 'Resolvido'];

const statusVariant = (status: TicketStatus) =>
  status === 'Resolvido' ? 'green' : status === 'Em atendimento' ? 'yellow' : 'blue';

const mapTicket = (ticket: any, clients: any[], orders: any[]): SupportTicket => {
  const client = clients.find((item) => String(item.id) === String(ticket.clientId));
  const order = orders.find((item) => String(item.id) === String(ticket.orderId));
  return {
    id: String(ticket.id),
    code: ticket.code || `TCK${ticket.id}`,
    clientId: ticket.clientId == null ? undefined : String(ticket.clientId),
    clientName: ticket.clientName || client?.name || 'Cliente não identificado',
    clientEmail: ticket.clientEmail || client?.email,
    orderCode: ticket.orderCode || order?.code,
    orderTitle: ticket.orderTitle || order?.title,
    title: ticket.title || 'Chamado sem título',
    status: (ticket.status || 'Aberto') as TicketStatus,
    createdAt: ticket.createdAt || ticket.created,
    updatedAt: ticket.updatedAt || ticket.createdAt || ticket.created,
    messages: (Array.isArray(ticket.messages) ? ticket.messages : []).map((message: any) => ({
      id: String(message.id),
      author: message.author || 'Usuário',
      role: message.role === 'admin' ? 'admin' : 'client',
      text: message.text || '',
      internal: Boolean(message.internal),
      at: message.at || message.createdAt,
      attachments: (Array.isArray(message.files) ? message.files : message.files ? [message.files] : []).map((file: any) => typeof file === 'string'
        ? { name: file }
        : {
          id: file.id || file.fileId,
          fileId: file.fileId || file.id,
          name: file.name || file.fileName || 'Anexo',
          url: file.url || null,
          viewUrl: file.viewUrl || null,
          mimeType: file.mimeType || file.type,
          size: file.size
        })
    }))
  };
};

export function AdminSupport({ routeDetail, onOpenTicket, onCloseTicket }: AdminSupportProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | TicketStatus>('Todos');
  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [internalNote, setInternalNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const state = await api('/state');
      const clients = Array.isArray(state.clients) ? state.clients : [];
      const orders = Array.isArray(state.orders) ? state.orders : [];
      const nextTickets = (Array.isArray(state.tickets) ? state.tickets : []).map((ticket: any) => mapTicket(ticket, clients, orders));
      setTickets(nextTickets);
      setError('');
    } catch (loadError: any) {
      setError(loadError?.message || 'Não foi possível carregar os chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  useEffect(() => {
    if (!routeDetail) {
      setSelectedTicket(null);
      return;
    }
    const found = tickets.find((ticket) => ticket.code === routeDetail || ticket.id === routeDetail);
    if (found) setSelectedTicket(found);
  }, [routeDetail, tickets]);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = statusFilter === 'Todos' || ticket.status === statusFilter;
      const searchable = `${ticket.code} ${ticket.title} ${ticket.clientName} ${ticket.orderCode || ''}`.toLowerCase();
      return matchesStatus && (!term || searchable.includes(term));
    });
  }, [tickets, search, statusFilter]);

  const openCount = tickets.filter((ticket) => ticket.status === 'Aberto').length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'Em atendimento').length;
  const resolvedCount = tickets.filter((ticket) => ticket.status === 'Resolvido').length;

  const closeTicket = () => {
    setSelectedTicket(null);
    setReplyText('');
    setReplyAttachment(null);
    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
    setInternalNote(false);
    onCloseTicket?.();
  };

  const sendMessage = async () => {
    if (!selectedTicket || (!replyText.trim() && !replyAttachment) || sending) return;
    const text = replyText.trim() || 'Arquivo anexado';
    setSending(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('text', text);
      payload.append('internal', String(internalNote));
      if (replyAttachment) payload.append('attachments', replyAttachment);
      await api(`/tickets/${selectedTicket.id}/message`, payload);
      setReplyText('');
      setReplyAttachment(null);
      if (replyFileInputRef.current) replyFileInputRef.current.value = '';
      setInternalNote(false);
      await reload();
    } catch (sendError: any) {
      setError(sendError?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: TicketStatus) => {
    if (!selectedTicket || status === selectedTicket.status || updatingStatus) return;
    setUpdatingStatus(true);
    setError('');
    try {
      await api(`/tickets/${selectedTicket.id}`, { status }, 'PATCH');
      await reload();
    } catch (statusError: any) {
      setError(statusError?.message || 'Não foi possível atualizar o status do chamado.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (selectedTicket) {
    return (
      <div className="admin-support-page" style={{ maxWidth: 1280, margin: '0 auto', minHeight: '100%' }}>
        <div className="admin-support-detail-heading">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={closeTicket}>
            Voltar para chamados
          </Button>
          <div className="admin-support-detail-actions">
            <label className="admin-support-status-control">
              <span>Status</span>
              <select
                className="form-select"
                value={selectedTicket.status}
                disabled={updatingStatus}
                onChange={(event) => { void changeStatus(event.target.value as TicketStatus); }}
              >
                {statusOptions.filter((status): status is TicketStatus => status !== 'Todos').map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <Badge status={selectedTicket.status} variant={statusVariant(selectedTicket.status)} />
          </div>
        </div>

        <Card className="admin-support-conversation" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="admin-support-conversation-header">
            <div style={{ minWidth: 0 }}>
              <div className="admin-support-ticket-meta">
                <span className="pill pill--blue">{selectedTicket.code}</span>
                {selectedTicket.orderCode && <span className="pill pill--gray">{selectedTicket.orderCode}</span>}
              </div>
              <h1 className="page-title admin-support-ticket-title">{selectedTicket.title}</h1>
              <div className="admin-support-client-meta">
                <User size={15} />
                <strong>{selectedTicket.clientName}</strong>
                {selectedTicket.clientEmail && <span>{selectedTicket.clientEmail}</span>}
                {selectedTicket.orderTitle && <span>• {selectedTicket.orderTitle}</span>}
              </div>
            </div>
            <div className="admin-support-opened-at">
              <Clock3 size={14} />
              <span>Atualizado {when(selectedTicket.updatedAt)}</span>
            </div>
          </div>

          <div className="admin-support-message-feed">
            {selectedTicket.messages.length ? selectedTicket.messages.map((message) => {
              const isClient = message.role === 'client';
              return (
                <div key={message.id} className={`admin-support-message ${isClient ? 'admin-support-message--client' : 'admin-support-message--admin'} ${message.internal ? 'admin-support-message--internal' : ''}`}>
                  <div className="admin-support-message-author">
                    {isClient ? <User size={13} /> : <UserCheck size={13} />}
                    <span>{message.internal ? 'Nota interna' : message.author}</span>
                    {message.at && <time>{when(message.at)}</time>}
                  </div>
                  <div className="admin-support-message-body">
                    {message.text}
                    <MessageAttachments attachments={message.attachments} outgoing={!isClient && !message.internal} demoRole="admin" />
                  </div>
                </div>
              );
            }) : (
              <div className="admin-support-empty-thread">Ainda não há mensagens neste chamado.</div>
            )}
          </div>

          {selectedTicket.status === 'Resolvido' ? (
            <div className="admin-support-resolved-note"><CheckCircle2 size={18} /><span>Este chamado está resolvido. Altere o status para reabrir o atendimento.</span></div>
          ) : (
            <div className="admin-support-reply">
              {replyAttachment && (
                <div className="ticket-reply-attachment">
                  <Paperclip size={16} />
                  <span>{replyAttachment.name}</span>
                  <button type="button" aria-label="Remover anexo" onClick={() => {
                    setReplyAttachment(null);
                    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
                  }}>
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="admin-support-compose-row">
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
                  aria-label="Anexar arquivo"
                  title="Anexar arquivo"
                  onClick={() => replyFileInputRef.current?.click()}
                >
                  <Paperclip size={19} />
                </button>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder={internalNote ? 'Escreva uma nota visível somente para a equipe...' : 'Escreva uma resposta para o cliente...'}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
              </div>
              <div className="admin-support-reply-actions">
                <label className="admin-support-note-toggle">
                  <input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} />
                  Nota interna
                </label>
                <Button variant="primary" icon={<Send size={15} />} disabled={(!replyText.trim() && !replyAttachment) || sending} onClick={() => { void sendMessage(); }}>
                  {sending ? 'Enviando...' : 'Enviar resposta'}
                </Button>
              </div>
            </div>
          )}
        </Card>
        {error && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="admin-support-page" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <div className="responsive-row admin-support-heading">
        <div>
          <h1 className="page-title">Suporte ao Cliente</h1>
          <p className="page-subtitle">Acompanhe os chamados, responda clientes e organize o atendimento em um só lugar.</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => { void reload(); }} disabled={loading}>
          Atualizar
        </Button>
      </div>

      <div className="admin-support-summary">
        <Card className="admin-support-summary-card admin-support-summary-card--open">
          <div className="admin-support-summary-icon"><AlertCircle size={18} /></div>
          <span>Chamados abertos</span>
          <strong>{openCount}</strong>
        </Card>
        <Card className="admin-support-summary-card admin-support-summary-card--progress">
          <div className="admin-support-summary-icon"><MessageCircle size={18} /></div>
          <span>Em atendimento</span>
          <strong>{inProgressCount}</strong>
        </Card>
        <Card className="admin-support-summary-card admin-support-summary-card--resolved">
          <div className="admin-support-summary-icon"><CheckCircle2 size={18} /></div>
          <span>Resolvidos</span>
          <strong>{resolvedCount}</strong>
        </Card>
      </div>

      <Card className="admin-support-list-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="admin-support-toolbar">
          <div className="admin-support-search">
            <Search size={17} />
            <input aria-label="Buscar chamados" placeholder="Buscar por código, título ou cliente" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="admin-support-filters" role="tablist" aria-label="Filtrar chamados por status">
            {statusOptions.map((status) => (
              <button key={status} type="button" role="tab" aria-selected={statusFilter === status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
                {status}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="form-error" role="alert" style={{ margin: '0 20px 14px' }}>{error}</div>}

        <div className="admin-support-list">
          {loading && !tickets.length ? (
            <div className="admin-support-empty"><RefreshCw size={20} className="admin-support-spin" /><span>Carregando chamados...</span></div>
          ) : filteredTickets.length ? filteredTickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              className="admin-support-ticket-row"
              onClick={() => { setSelectedTicket(ticket); setReplyText(''); setInternalNote(false); onOpenTicket?.(ticket.code); }}
            >
              <div className="admin-support-ticket-row-main">
                <div className="admin-support-ticket-row-top">
                  <span className="pill pill--blue">{ticket.code}</span>
                  {ticket.orderCode && <span className="pill pill--gray">{ticket.orderCode}</span>}
                  <Badge status={ticket.status} variant={statusVariant(ticket.status)} />
                </div>
                <strong>{ticket.title}</strong>
                <span className="admin-support-ticket-row-client">{ticket.clientName} {ticket.clientEmail ? `• ${ticket.clientEmail}` : ''}</span>
              </div>
              <div className="admin-support-ticket-row-side">
                <span>{ticket.messages.length ? `${ticket.messages.length} ${ticket.messages.length === 1 ? 'mensagem' : 'mensagens'}` : 'Sem mensagens'}</span>
                <time>{when(ticket.updatedAt)}</time>
              </div>
            </button>
          )) : (
            <div className="admin-support-empty">
              <MessageCircle size={24} />
              <strong>Nenhum chamado encontrado</strong>
              <span>Os novos atendimentos enviados pelos clientes aparecerão aqui.</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default AdminSupport;

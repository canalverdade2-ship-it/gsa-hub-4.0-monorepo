import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, FileText, LifeBuoy, MessageSquare, Paperclip, Plus, Send, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { providerOperations } from '../../lib/providerOperations';
import { removeProviderPrivateFile, resolveProviderFileUrl, uploadProviderPrivateFile } from '../../lib/providerStorage';
import { useFileViewer } from '../../contexts/FileViewerContext';
import { Modal } from '../ui/Modal';

type TicketStatus = 'aberto' | 'em andamento' | 'concluido';

type ProviderTicket = {
  id: string;
  assunto: string;
  descricao?: string | null;
  status: TicketStatus;
  data_abertura: string;
  updated_at?: string | null;
};

type TicketMessage = {
  id: string;
  ticket_id: string;
  autor_id?: string | null;
  autor_nome?: string | null;
  mensagem?: string | null;
  anexo_url?: string | null;
  anexo_tipo?: string | null;
  data_envio: string;
  tipo?: string | null;
};

export function PrestadorSuporte({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { openFile } = useFileViewer();
  const [activeTab, setActiveTab] = useState<TicketStatus>('aberto');
  const [tickets, setTickets] = useState<ProviderTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<ProviderTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadTickets = async (getIsMounted?: () => boolean) => {
    try {
      let query = supabase
        .from('tickets')
        .select('id,assunto,descricao,status,data_abertura,updated_at')
        .eq('prestador_id', prestadorId);
      if (!initialItemId) query = query.eq('status', activeTab);
      const { data, error } = await query.order('data_abertura', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data || []) as ProviderTicket[];
      if (!getIsMounted || getIsMounted()) setTickets(rows);
      if (initialItemId && (!getIsMounted || getIsMounted())) {
        const target = rows.find((item) => item.id === initialItemId);
        if (target) {
          setActiveTab(target.status);
          setSelectedTicket(target);
        }
      }
    } catch (error: any) {
      if (!getIsMounted || getIsMounted()) toast.error(error?.message || 'Não foi possível carregar os atendimentos.');
    } finally {
      if (!getIsMounted || getIsMounted()) setLoading(false);
    }
  };

  const loadMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('ticket_mensagens')
        .select('id,ticket_id,autor_id,autor_nome,mensagem,anexo_url,anexo_tipo,data_envio,tipo')
        .eq('ticket_id', ticketId)
        .order('data_envio', { ascending: true })
        .limit(200);
      if (error) throw error;
      setMessages((data || []) as TicketMessage[]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar as mensagens.');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void loadTickets(() => isMounted);
    const channel = supabase.channel(`provider-tickets-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `prestador_id=eq.${prestadorId}` }, () => void loadTickets(() => isMounted))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel).catch(console.error); };
  }, [activeTab, prestadorId, initialItemId]);

  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedTicket.id);
    const channel = supabase.channel(`provider-ticket-messages-${selectedTicket.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_mensagens', filter: `ticket_id=eq.${selectedTicket.id}` }, () => void loadMessages(selectedTicket.id))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${selectedTicket.id}` }, (payload) => {
        setSelectedTicket((current) => current ? { ...current, ...(payload.new as ProviderTicket) } : current);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(console.error); };
  }, [selectedTicket?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const visibleTickets = useMemo(() => initialItemId ? tickets.filter((item) => item.status === activeTab) : tickets, [activeTab, initialItemId, tickets]);

  const createTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.createTicket(subject.trim(), description.trim());
      toast.success('Atendimento aberto com sucesso.');
      setCreateOpen(false);
      setSubject('');
      setDescription('');
      setActiveTab('aberto');
      await loadTickets();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o atendimento.');
    } finally {
      setSubmitting(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedTicket || (!newMessage.trim() && !attachment) || submitting) return;
    setSubmitting(true);
    let attachmentReference: string | null = null;
    try {
      if (attachment) {
        attachmentReference = await uploadProviderPrivateFile({
          bucket: 'documentos_prestador',
          providerId: prestadorId,
          scope: `chat/${selectedTicket.id}`,
          file: attachment,
          maxSizeMb: 15,
        });
      }
      await providerOperations.sendTicketMessage({
        ticketId: selectedTicket.id,
        message: newMessage.trim(),
        attachmentReference,
        attachmentType: attachment?.type || null,
      });
      setNewMessage('');
      setAttachment(null);
      await loadMessages(selectedTicket.id);
    } catch (error: any) {
      if (attachmentReference) await Promise.allSettled([removeProviderPrivateFile(attachmentReference)]);
      toast.error(error?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSubmitting(false);
    }
  };

  const openAttachment = async (message: TicketMessage) => {
    if (!message.anexo_url) return;
    try {
      const url = await resolveProviderFileUrl(message.anexo_url);
      openFile(url, `Anexo do atendimento ${message.ticket_id.slice(0, 8)}`);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o anexo.');
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-neutral-900 p-6 text-white shadow-xl lg:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Central de ajuda</p><h2 className="mt-2 text-3xl font-black">Suporte do prestador</h2><p className="mt-2 text-sm text-white/60">Atendimento técnico, financeiro e cadastral.</p></div><button onClick={() => setCreateOpen(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-neutral-900"><Plus className="h-5 w-5" />Novo atendimento</button></div>
      </section>

      <div className="flex gap-1 rounded-2xl bg-neutral-100 p-1">
        {(['aberto', 'em andamento', 'concluido'] as TicketStatus[]).map((status) => <button key={status} onClick={() => { setActiveTab(status); setSelectedTicket(null); }} className={`min-w-0 flex-1 rounded-xl px-2 py-3 text-xs font-black uppercase sm:px-6 ${activeTab === status ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>{status}</button>)}
      </div>

      <section className="grid gap-4">
        {visibleTickets.length === 0 ? <div className="rounded-2xl bg-white p-12 text-center text-neutral-400 shadow-sm ring-1 ring-black/5"><LifeBuoy className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">Nenhum atendimento nesta situação.</p></div> : visibleTickets.map((ticket) => <button key={ticket.id} onClick={() => setSelectedTicket(ticket)} className="flex flex-col gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><span className="rounded-xl bg-sky-50 p-3 text-sky-600"><MessageSquare className="h-5 w-5" /></span><div><h3 className="font-black">{ticket.assunto}</h3><p className="mt-1 flex items-center gap-1 text-xs text-neutral-400"><Clock className="h-3.5 w-3.5" />{formatDateTime(ticket.data_abertura)}</p></div></div><Status status={ticket.status} /></button>)}
      </section>

      <Modal isOpen={createOpen} onClose={() => !submitting && setCreateOpen(false)} title="Novo atendimento">
        <form onSubmit={createTicket} className="space-y-4"><Field label="Assunto" value={subject} onChange={setSubject} /><div><label className="mb-1 block text-sm font-bold">Descrição</label><textarea required value={description} onChange={(event) => setDescription(event.target.value)} className="h-32 w-full rounded-xl border border-neutral-200 p-3" /></div><button disabled={submitting} className="w-full rounded-xl bg-neutral-900 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Abrindo...' : 'Abrir atendimento'}</button></form>
      </Modal>

      <Modal isOpen={!!selectedTicket} onClose={() => !submitting && setSelectedTicket(null)} title={selectedTicket?.assunto || 'Atendimento'} size="wide">
        {selectedTicket && <div className="flex h-[65vh] flex-col"><div className="mb-3 flex items-center justify-between rounded-xl bg-neutral-50 p-3"><span className="text-xs font-bold text-neutral-500">Ticket #{selectedTicket.id.slice(0, 8)}</span><Status status={selectedTicket.status} /></div><div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-neutral-50 p-4">{loadingMessages ? <p className="text-center text-sm text-neutral-400">Carregando mensagens...</p> : messages.length === 0 ? <p className="text-center text-sm text-neutral-400">Nenhuma mensagem ainda.</p> : messages.map((message) => { const own = message.tipo === 'prestador' || message.autor_id === prestadorId; return <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl p-3 ${own ? 'bg-indigo-600 text-white' : 'bg-white text-neutral-800 shadow-sm'}`}><p className="text-xs font-black opacity-70">{message.autor_nome || (own ? 'Prestador' : 'Atendimento')}</p>{message.mensagem && <p className="mt-1 whitespace-pre-wrap text-sm">{message.mensagem}</p>}{message.anexo_url && <button onClick={() => openAttachment(message)} className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${own ? 'bg-white/15 text-white' : 'bg-neutral-100 text-indigo-700'}`}><FileText className="h-4 w-4" />Abrir anexo</button>}<p className="mt-2 text-[10px] opacity-60">{formatDateTime(message.data_envio)}</p></div></div>; })}</div>{selectedTicket.status !== 'concluido' && <div className="mt-3 space-y-3"><div className="flex items-end gap-2"><button onClick={() => document.getElementById('provider-support-file')?.click()} className="rounded-xl bg-neutral-100 p-3 text-neutral-600" aria-label="Anexar arquivo"><Paperclip className="h-5 w-5" /></button><input id="provider-support-file" type="file" className="hidden" onChange={(event) => setAttachment(event.target.files?.[0] || null)} /><textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} className="min-h-12 flex-1 rounded-xl border border-neutral-200 p-3" placeholder="Digite sua mensagem..." /><button disabled={submitting || (!newMessage.trim() && !attachment)} onClick={sendMessage} className="rounded-xl bg-indigo-600 p-3 text-white disabled:opacity-50" aria-label="Enviar mensagem"><Send className="h-5 w-5" /></button></div>{attachment && <div className="flex items-center justify-between rounded-xl bg-indigo-50 p-3 text-xs font-bold text-indigo-700"><span className="truncate">{attachment.name}</span><button onClick={() => setAttachment(null)} aria-label="Remover anexo"><X className="h-4 w-4" /></button></div>}</div>}</div>}
      </Modal>
    </div>
  );
}

function Status({ status }: { status: TicketStatus }) {
  const style = status === 'aberto' ? 'bg-amber-50 text-amber-700' : status === 'em andamento' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700';
  return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${style}`}>{status}</span>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="mb-1 block text-sm font-bold">{label}</label><input required value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 p-3" /></div>;
}

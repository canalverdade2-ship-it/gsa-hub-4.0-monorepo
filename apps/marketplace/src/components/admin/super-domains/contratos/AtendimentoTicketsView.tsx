import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MessageSquare, Ticket, Clock, CheckCircle2, AlertTriangle, 
  Send, Plus, Paperclip, X, Search, Filter, Phone, Mail, 
  User, Shield, Sparkles, RefreshCw, Zap, ArrowRight, 
  ChevronRight, CornerDownLeft, FileText, Check, Award
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { safeSupabaseQuery } from '../../../../lib/supabaseWrapper';
import { formatDateTime, formatDate, maskPhone } from '../../../../lib/utils';
import { 
  SplitScreenLayout, StatusBadge 
} from '../shared';
import { 
  TicketSacRecord, TicketMessageItem, TicketPrioridade, 
  TicketCategoria, TicketStatus, TicketCanal 
} from './contratos.types';

export interface AtendimentoTicketsViewProps {
  initialTicketId?: string;
  onOpenClient?: (clientId: string) => void;
}

export function AtendimentoTicketsView({ initialTicketId, onOpenClient }: AtendimentoTicketsViewProps) {
  const [tickets, setTickets] = useState<TicketSacRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialTicketId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos');

  // Active chat state
  const [replyMessage, setReplyMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedCannedResponse, setSelectedCannedResponse] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Canned responses
  const cannedResponses = [
    { id: 'c1', label: 'Saudação Padrão', text: 'Olá! Agradecemos pelo seu contato com o Grupo GSA. Como posso ajudar com sua solicitação hoje?' },
    { id: 'c2', label: 'Confirmação de Pagamento', text: 'Confirmamos que a baixa do seu pagamento foi processada com sucesso no sistema. O comprovante foi anexado ao seu dossiê.' },
    { id: 'c3', label: 'Solicitação de Documentos', text: 'Para darmos andamento ao seu contrato, solicitamos o envio de documento com foto (RG ou CNH) e comprovante de endereço atualizado.' },
    { id: 'c4', label: 'Aviso de Encerramento', text: 'Seu chamado foi resolvido pela nossa equipe de atendimento. Caso precise de mais auxílio, basta reabrir este chamado. Tenha um ótimo dia!' }
  ];

  const fetchTickets = async () => {
    setLoading(true);

    try {
      const { data: dbTickets, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && dbTickets && dbTickets.length > 0) {
        // Obter dados de clientes vinculados
        const clientIds = [...new Set(dbTickets.map((t: any) => t.cliente_id).filter(Boolean))];
        let clientMap: Record<string, any> = {};
        if (clientIds.length > 0) {
          const { data: clients } = await supabase
            .from('clientes')
            .select('id, nome, email, telefone')
            .in('id', clientIds);
          if (clients) {
            clients.forEach((c: any) => { clientMap[c.id] = c; });
          }
        }

        // Obter mensagens reais dos tickets
        const ticketIds = dbTickets.map((t: any) => t.id);
        const { data: allMessages } = await supabase
          .from('ticket_mensagens')
          .select('*')
          .in('ticket_id', ticketIds)
          .order('data_envio', { ascending: true });

        const messagesByTicket: Record<string, TicketMessageItem[]> = {};
        if (allMessages) {
          allMessages.forEach((m: any) => {
            if (!messagesByTicket[m.ticket_id]) messagesByTicket[m.ticket_id] = [];
            messagesByTicket[m.ticket_id].push({
              id: m.id,
              ticket_id: m.ticket_id,
              autor_tipo: m.autor_tipo || (m.usuario_id ? 'atendente' : 'cliente'),
              autor_nome: m.autor_nome || (m.autor_tipo === 'atendente' ? 'Atendente' : 'Cliente'),
              texto: m.texto || m.mensagem || '',
              criado_em: m.created_at || m.data_envio || new Date().toISOString()
            });
          });
        }

        const mapped: TicketSacRecord[] = dbTickets.map((t: any) => {
          const cli = clientMap[t.cliente_id];
          const msgs = messagesByTicket[t.id] || [];

          return {
            id: t.id,
            protocolo: t.protocolo || `SAC-${String(t.id).slice(0, 8).toUpperCase()}`,
            cliente_id: t.cliente_id || cli?.id || '',
            cliente_nome: cli?.nome || t.cliente_nome || 'Cliente',
            cliente_email: cli?.email || t.cliente_email || '',
            cliente_telefone: cli?.telefone || t.cliente_telefone || '',
            cliente_nivel_vip: (t.cliente_nivel_vip as any) || 'bronze',
            assunto: t.assunto || t.titulo || 'Atendimento Geral',
            descricao_inicial: t.descricao || t.assunto || '',
            categoria: (t.categoria as TicketCategoria) || 'outro',
            prioridade: (t.prioridade as TicketPrioridade) || 'normal',
            status: (t.status as TicketStatus) || 'aberto',
            canal_origem: (t.canal as TicketCanal) || 'portal_cliente',
            sla_limite_horas: t.sla_limite_horas || 4,
            sla_data_limite: t.sla_data_limite || new Date(Date.now() + 180 * 60 * 1000).toISOString(),
            sla_vencido: t.sla_vencido ?? false,
            atendente_nome: t.atendente_nome || 'Central de Atendimento',
            departamento: t.departamento || 'Central de Atendimento & SAC',
            satisfacao_avaliacao: t.satisfacao_avaliacao,
            mensagens: msgs.length > 0 ? msgs : [
              {
                id: `msg-${t.id}-1`,
                ticket_id: t.id,
                autor_tipo: 'cliente',
                autor_nome: cli?.nome || 'Cliente',
                texto: t.descricao || t.assunto || 'Solicitação de suporte.',
                criado_em: t.created_at || t.data_abertura || new Date().toISOString()
              }
            ],
            criado_em: t.created_at || t.data_abertura || new Date().toISOString(),
            atualizado_em: t.updated_at || t.data_atualizacao || new Date().toISOString(),
            fechado_em: t.fechado_em
          };
        });
        setTickets(mapped);
        if (!selectedTicketId && mapped.length > 0) {
          setSelectedTicketId(mapped[0].id);
        }
      } else {
        setTickets([]);
        setSelectedTicketId(null);
      }
    } catch {
      setTickets([]);
      setSelectedTicketId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  useRealtimeSubscription([
    { table: 'tickets', onChange: fetchTickets },
    { table: 'ticket_mensagens', onChange: fetchTickets }
  ]);

  const selectedTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter !== 'todos' && t.status !== statusFilter) return false;
      if (prioridadeFilter !== 'todos' && t.prioridade !== prioridadeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.protocolo.toLowerCase().includes(q) ||
          t.cliente_nome.toLowerCase().includes(q) ||
          t.assunto.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, prioridadeFilter, searchQuery]);

  const telemetry = useMemo(() => {
    const total = tickets.length;
    const abertos = tickets.filter(t => t.status === 'aberto').length;
    const emAtendimento = tickets.filter(t => t.status === 'em_andamento').length;
    const urgentes = tickets.filter(t => t.prioridade === 'urgente' && t.status !== 'resolvido').length;

    return {
      total,
      abertos,
      emAtendimento,
      urgentes
    };
  }, [tickets]);

  // Scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.mensagens]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;
    if (selectedTicket.status === 'cancelado') { toast.error('Este ticket foi cancelado pelo cliente e está somente para consulta.'); return; }

    setIsSending(true);
    const newMsg: TicketMessageItem = {
      id: `msg-${Date.now()}`,
      ticket_id: selectedTicket.id,
      autor_tipo: 'atendente',
      autor_nome: 'Atendente GSA',
      texto: replyMessage.trim(),
      criado_em: new Date().toISOString().replace('T', ' ').substring(0, 16)
    };

    try {
      await supabase.from('ticket_mensagens').insert([{
        ticket_id: selectedTicket.id,
        autor_tipo: 'atendente',
        autor_nome: 'Atendente GSA',
        mensagem: replyMessage.trim()
      }]);
      await supabase.from('tickets').update({
        status: 'em_andamento',
        updated_at: new Date().toISOString()
      }).eq('id', selectedTicket.id);
    } catch (err) {
      console.warn('Mensagem persistida em memória:', err);
    }

    setTickets(prev => prev.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          status: 'em_andamento',
          mensagens: [...t.mensagens, newMsg],
          atualizado_em: new Date().toISOString()
        };
      }
      return t;
    }));

    setReplyMessage('');
    setIsSending(false);
    toast.success('Mensagem enviada com sucesso!');
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    try {
      await supabase.from('tickets').update({
        status: 'resolvido',
        fechado_em: new Date().toISOString()
      }).eq('id', selectedTicket.id);
    } catch (err) {
      console.warn('Status persistido em memória:', err);
    }

    setTickets(prev => prev.map(t => {
      if (t.id === selectedTicket.id) {
        return {
          ...t,
          status: 'resolvido',
          fechado_em: new Date().toISOString()
        };
      }
      return t;
    }));
    toast.success('Ticket marcado como RESOLVIDO.');
  };

  return (
    <div className="space-y-6">
      {/* Telemetry Header */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Fila Total</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Ticket className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{telemetry.total}</div>
          <div className="mt-1 text-xs text-slate-500">Chamados registrados</div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Aguardando Atendente</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-blue-950">{telemetry.abertos}</div>
          <div className="mt-1 text-xs text-blue-700">Novos chamados na fila</div>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Em Atendimento</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-950">{telemetry.emAtendimento}</div>
          <div className="mt-1 text-xs text-amber-700">Conversas em andamento</div>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">SLA Urgente / Crítico</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-950">{telemetry.urgentes}</div>
          <div className="mt-1 text-xs text-rose-700">Prazo &lt; 1 hora</div>
        </div>
      </div>

      {/* SPLIT SCREEN WORKSTATION (Omnichannel Support Workstation) */}
      <SplitScreenLayout
        masterTitle="Fila Omnichannel de Suporte (SAC)"
        masterSubtitle="Triagem inteligente por SLA e prioridade"
        masterCount={filteredTickets.length}
        masterSearch={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: 'Buscar protocolo, cliente ou assunto...'
        }}
        masterActions={
          <button
            type="button"
            onClick={fetchTickets}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
            title="Atualizar fila"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
        masterFilters={
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-1/2 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="todos">Status: Todos</option>
              <option value="aberto">Abertos</option>
              <option value="em_andamento">Em Atendimento</option>
              <option value="resolvido">Resolvidos</option>
              <option value="cancelado">Cancelados pelo Cliente</option>
            </select>
            <select
              value={prioridadeFilter}
              onChange={(e) => setPrioridadeFilter(e.target.value)}
              className="w-1/2 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white"
            >
              <option value="todos">Prioridade: Todas</option>
              <option value="urgente">Urgente</option>
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
            </select>
          </div>
        }
        masterContent={
          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[calc(100vh-320px)]">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum chamado de atendimento encontrado.
              </div>
            ) : (
              filteredTickets.map(tkt => {
                const isSelected = tkt.id === selectedTicketId;
                return (
                  <div
                    key={tkt.id}
                    onClick={() => setSelectedTicketId(tkt.id)}
                    className={`p-4 transition cursor-pointer flex flex-col gap-2 ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-indigo-700">{tkt.protocolo}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        tkt.prioridade === 'urgente' ? 'bg-rose-100 text-rose-700' :
                        tkt.prioridade === 'alta' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {tkt.prioridade}
                      </span>
                    </div>

                    <div>
                      <div className="font-bold text-slate-900 text-sm truncate">{tkt.cliente_nome}</div>
                      <div className="text-xs text-slate-600 line-clamp-1">{tkt.assunto}</div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                      <span className="capitalize">{tkt.canal_origem.replace('_', ' ')}</span>
                      <StatusBadge status={tkt.status} size="xs" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        }
        selectedId={selectedTicketId}
        detailTitle={selectedTicket ? `${selectedTicket.protocolo} - ${selectedTicket.assunto}` : undefined}
        detailSubtitle={selectedTicket ? `Cliente: ${selectedTicket.cliente_nome} • Atendente: ${selectedTicket.atendente_nome}` : undefined}
        detailBadge={selectedTicket ? <StatusBadge status={selectedTicket.status} size="sm" dot /> : undefined}
        detailActions={
          selectedTicket && !['resolvido', 'cancelado'].includes(selectedTicket.status) && (
            <button
              type="button"
              onClick={handleResolveTicket}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar como Resolvido
            </button>
          )
        }
        detailContent={
          selectedTicket && (
            <div className="flex flex-col h-full bg-slate-50/50">
              {/* Client Dossier Bar */}
              <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 font-bold">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{selectedTicket.cliente_nome}</div>
                    <div className="text-slate-500 font-mono">{maskPhone(selectedTicket.cliente_telefone)} • {selectedTicket.cliente_email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`https://wa.me/55${selectedTicket.cliente_telefone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              </div>

              {/* Chat Timeline */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[calc(100vh-420px)]">
                {selectedTicket.mensagens.map(msg => {
                  const isAgent = msg.autor_tipo === 'atendente';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[11px] font-bold text-slate-600">{msg.autor_nome}</span>
                        <span className="text-[10px] text-slate-400">{msg.criado_em}</span>
                      </div>
                      <div
                        className={`max-w-lg p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                          isAgent
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                        }`}
                      >
                        {msg.texto}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {selectedTicket.status === 'cancelado' && (
                <div className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-xs font-bold text-rose-700">Ticket cancelado pelo cliente. Conversa disponível somente para consulta.</div>
              )}

              {/* Canned Responses Shortcut */}
              <div className="px-5 py-2 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-bold text-slate-400 shrink-0">Respostas Rápidas:</span>
                {cannedResponses.map(cr => (
                  <button
                    key={cr.id}
                    type="button"
                    onClick={() => setReplyMessage(cr.text)}
                    disabled={selectedTicket.status === 'cancelado'}
                    className="whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {cr.label}
                  </button>
                ))}
              </div>

              {/* Message Input Box */}
              <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Digite sua resposta para o cliente..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    disabled={selectedTicket.status === 'cancelado'}
                    className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isSending || selectedTicket.status === 'cancelado'}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </button>
                </div>
              </form>
            </div>
          )
        }
      />
    </div>
  );
}

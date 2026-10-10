import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../../supabase';

type TicketStatusFilter = 'todos' | 'aberto' | 'em andamento' | 'concluido';

export interface TicketItem {
  id: string;
  protocolo?: string;
  cliente_id?: string;
  cliente_nome?: string;
  cliente_telefone?: string;
  assunto?: string;
  categoria?: string;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente';
  status?: 'aberto' | 'em andamento' | 'concluido' | 'fechado';
  created_at?: string;
  updated_at?: string;
  data_criacao?: string;
  ultima_mensagem?: string;
}

export interface TicketMessageItem {
  id: string;
  ticket_id: string;
  autor_tipo?: 'admin' | 'cliente' | 'prestador' | 'suporte';
  autor_nome?: string;
  mensagem: string;
  created_at?: string;
}

export const TicketsModuleScreen = () => {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('aberto');
  const [search, setSearch] = useState('');

  // Selected ticket for chat / details
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [messages, setMessages] = useState<TicketMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // New ticket modal
  const [newTicketModal, setNewTicketModal] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState({
    cliente_nome: '',
    cliente_telefone: '',
    assunto: '',
    categoria: 'Suporte Técnico',
    prioridade: 'media' as 'baixa' | 'media' | 'alta' | 'urgente',
    mensagem_inicial: '',
  });
  const [creatingTicket, setCreatingTicket] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const fetchTickets = useCallback(async () => {
    try {
      let query = supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Erro ao buscar tickets:', error.message);
      } else {
        setTickets((data as TicketItem[]) || []);
      }
    } catch (err: any) {
      console.warn('Erro de conexão com tickets:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Real-time subscription for tickets list
  useEffect(() => {
    const channel = supabase
      .channel('admin-mobile-tickets-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          fetchTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTickets]);

  // Fetch messages when a ticket is opened
  const fetchMessages = useCallback(async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('ticket_mensagens')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data as TicketMessageItem[]) || []);
    } catch (err: any) {
      console.warn('Erro ao carregar mensagens:', err.message);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTicket?.id) {
      fetchMessages(selectedTicket.id);

      // Subscribe to real-time chat messages
      const channel = supabase
        .channel(`chat_ticket_${selectedTicket.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'ticket_mensagens',
            filter: `ticket_id=eq.${selectedTicket.id}`,
          },
          payload => {
            setMessages(prev => [...prev, payload.new as TicketMessageItem]);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tickets',
            filter: `id=eq.${selectedTicket.id}`,
          },
          payload => {
            setSelectedTicket(prev => (prev ? ({ ...prev, ...payload.new } as TicketItem) : null));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedTicket?.id, fetchMessages]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTickets();
  };

  // Send reply
  const handleSendMessage = async (closeTicket = false) => {
    if (!selectedTicket || !newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const text = newMessage.trim();
      const nextStatus = closeTicket ? 'concluido' : selectedTicket.status === 'aberto' ? 'em andamento' : selectedTicket.status;

      // 1. Insert message
      const { error: msgErr } = await supabase.from('ticket_mensagens').insert([
        {
          ticket_id: selectedTicket.id,
          autor_tipo: 'admin',
          autor_nome: 'Suporte Administrativo',
          mensagem: text,
          created_at: new Date().toISOString(),
        },
      ]);
      if (msgErr) throw msgErr;

      // 2. Update ticket status & last message
      const { error: tktErr } = await supabase
        .from('tickets')
        .update({
          status: nextStatus,
          ultima_mensagem: text,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTicket.id);
      if (tktErr) throw tktErr;

      setNewMessage('');
      setSelectedTicket(prev => prev ? { ...prev, status: nextStatus, ultima_mensagem: text } : null);
      setTickets(prev =>
        prev.map(t => (t.id === selectedTicket.id ? { ...t, status: nextStatus, ultima_mensagem: text } : t))
      );
    } catch (err: any) {
      Alert.alert('Erro ao enviar mensagem', err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Change status directly
  const handleChangeTicketStatus = async (newStatus: 'aberto' | 'em andamento' | 'concluido') => {
    if (!selectedTicket) return;
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      setSelectedTicket(prev => prev ? { ...prev, status: newStatus } : null);
      setTickets(prev =>
        prev.map(t => (t.id === selectedTicket.id ? { ...t, status: newStatus } : t))
      );
      Alert.alert('Status Atualizado', `O ticket agora está: ${newStatus.toUpperCase()}`);
    } catch (err: any) {
      Alert.alert('Erro ao atualizar status', err.message);
    }
  };

  // Create new ticket
  const handleCreateTicket = async () => {
    if (!newTicketForm.assunto.trim()) {
      Alert.alert('Validação', 'Informe o assunto do ticket.');
      return;
    }
    setCreatingTicket(true);
    try {
      const protocolo = `TK-${Math.floor(100000 + Math.random() * 900000)}`;

      // Insert ticket
      const { data: tktData, error: tktErr } = await supabase
        .from('tickets')
        .insert([
          {
            protocolo,
            cliente_nome: newTicketForm.cliente_nome.trim() || 'Cliente Geral',
            cliente_telefone: newTicketForm.cliente_telefone.trim() || null,
            assunto: newTicketForm.assunto.trim(),
            categoria: newTicketForm.categoria,
            prioridade: newTicketForm.prioridade,
            status: 'aberto',
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (tktErr) throw tktErr;

      const created = tktData?.[0];

      // If initial message provided, insert message
      if (created && newTicketForm.mensagem_inicial.trim()) {
        await supabase.from('ticket_mensagens').insert([
          {
            ticket_id: created.id,
            autor_tipo: 'admin',
            autor_nome: 'Atendimento GSA',
            mensagem: newTicketForm.mensagem_inicial.trim(),
            created_at: new Date().toISOString(),
          },
        ]);
      }

      Alert.alert('Sucesso', `Ticket #${protocolo} aberto com sucesso!`);
      setNewTicketModal(false);
      setNewTicketForm({
        cliente_nome: '',
        cliente_telefone: '',
        assunto: '',
        categoria: 'Suporte Técnico',
        prioridade: 'media',
        mensagem_inicial: '',
      });
      fetchTickets();
    } catch (err: any) {
      Alert.alert('Erro ao criar ticket', err.message);
    } finally {
      setCreatingTicket(false);
    }
  };

  // Helpers
  const getPriorityStyle = (prioridade?: string) => {
    switch (prioridade) {
      case 'urgente':
        return { bg: '#fee2e2', text: '#b91c1c' };
      case 'alta':
        return { bg: '#ffedd5', text: '#c2410c' };
      case 'media':
        return { bg: '#e0e7ff', text: '#4338ca' };
      default:
        return { bg: '#f1f5f9', text: '#475569' };
    }
  };

  const getStatusStyle = (status?: string) => {
    switch (status) {
      case 'concluido':
      case 'fechado':
        return { bg: '#dcfce7', text: '#15803d' };
      case 'em andamento':
        return { bg: '#dbeafe', text: '#1d4ed8' };
      default:
        return { bg: '#fef3c7', text: '#b45309' };
    }
  };

  // Filter list
  const filteredTickets = tickets.filter(t => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const proto = (t.protocolo || '').toLowerCase();
    const sub = (t.assunto || '').toLowerCase();
    const cli = (t.cliente_nome || '').toLowerCase();
    const cat = (t.categoria || '').toLowerCase();
    return proto.includes(term) || sub.includes(term) || cli.includes(term) || cat.includes(term);
  });

  // Calculate counters
  const countAbertos = tickets.filter(t => t.status === 'aberto').length;
  const countEmAndamento = tickets.filter(t => t.status === 'em andamento').length;
  const countConcluidos = tickets.filter(t => t.status === 'concluido' || t.status === 'fechado').length;

  // Detail / Chat View
  if (selectedTicket) {
    const pStyle = getPriorityStyle(selectedTicket.prioridade);
    const sStyle = getStatusStyle(selectedTicket.status);

    return (
      <SafeAreaView style={styles.container}>
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedTicket(null)}
          >
            <Text style={styles.backBtnText}>← Voltar</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <Text style={styles.chatHeaderTitle} numberOfLines={1}>
              #{selectedTicket.protocolo || String(selectedTicket.id).slice(0, 8)} - {selectedTicket.assunto}
            </Text>
            <Text style={styles.chatHeaderSubtitle} numberOfLines={1}>
              {selectedTicket.cliente_nome || 'Cliente'} • {selectedTicket.cliente_telefone || 'Sem fone'}
            </Text>
          </View>
        </View>

        {/* Status Bar inside Chat */}
        <View style={styles.chatStatusBar}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <View style={[styles.badge, { backgroundColor: sStyle.bg }]}>
              <Text style={[styles.badgeText, { color: sStyle.text }]}>
                {selectedTicket.status ? selectedTicket.status.toUpperCase() : 'ABERTO'}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: pStyle.bg }]}>
              <Text style={[styles.badgeText, { color: pStyle.text }]}>
                {selectedTicket.prioridade ? selectedTicket.prioridade.toUpperCase() : 'MÉDIA'}
              </Text>
            </View>
          </View>

          <View style={styles.statusActionRow}>
            {selectedTicket.status !== 'em andamento' && (
              <TouchableOpacity
                style={[styles.miniStatusBtn, { backgroundColor: '#dbeafe' }]}
                onPress={() => handleChangeTicketStatus('em andamento')}
              >
                <Text style={[styles.miniStatusBtnText, { color: '#1d4ed8' }]}>Atender</Text>
              </TouchableOpacity>
            )}
            {selectedTicket.status !== 'concluido' && (
              <TouchableOpacity
                style={[styles.miniStatusBtn, { backgroundColor: '#dcfce7' }]}
                onPress={() => handleChangeTicketStatus('concluido')}
              >
                <Text style={[styles.miniStatusBtnText, { color: '#15803d' }]}>Resolver</Text>
              </TouchableOpacity>
            )}
            {selectedTicket.status !== 'aberto' && (
              <TouchableOpacity
                style={[styles.miniStatusBtn, { backgroundColor: '#fef3c7' }]}
                onPress={() => handleChangeTicketStatus('aberto')}
              >
                <Text style={[styles.miniStatusBtnText, { color: '#b45309' }]}>Reabrir</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Canned Quick Replies */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cannedRepliesScroll}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {[
            'Olá! Estamos analisando sua solicitação.',
            'Aguardando confirmação dos dados adicionais.',
            'O chamado foi resolvido pela nossa equipe técnica.',
            'Por favor, teste novamente e nos informe.',
          ].map((text, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.cannedBtn}
              onPress={() => setNewMessage(text)}
            >
              <Text style={styles.cannedBtnText} numberOfLines={1}>{text}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Message Thread */}
        {loadingMessages ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color="#4f46e5" />
            <Text style={styles.loadingText}>Carregando mensagens...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.messageScroll}
            contentContainerStyle={styles.messageListContent}
          >
            {messages.length === 0 ? (
              <Text style={styles.emptyMessagesText}>
                Nenhuma mensagem trocada neste ticket ainda.
              </Text>
            ) : (
              messages.map(msg => {
                const isAdmin = msg.autor_tipo === 'admin' || msg.autor_tipo === 'suporte';
                return (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageBubbleWrapper,
                      isAdmin ? styles.bubbleRight : styles.bubbleLeft,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        isAdmin ? styles.bubbleAdmin : styles.bubbleClient,
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageSenderName,
                          isAdmin ? styles.senderAdmin : styles.senderClient,
                        ]}
                      >
                        {msg.autor_nome || (isAdmin ? 'Suporte' : 'Cliente')}
                      </Text>
                      <Text
                        style={[
                          styles.messageText,
                          isAdmin ? styles.messageTextAdmin : styles.messageTextClient,
                        ]}
                      >
                        {msg.mensagem}
                      </Text>
                      <Text
                        style={[
                          styles.messageTime,
                          isAdmin ? styles.timeAdmin : styles.timeClient,
                        ]}
                      >
                        {msg.created_at
                          ? new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Reply Input Box */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatInputContainer}
        >
          <TextInput
            style={styles.chatTextInput}
            placeholder="Digite a resposta de suporte..."
            placeholderTextColor="#94a3b8"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <View style={styles.chatSendRow}>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: '#10b981' }]}
              onPress={() => handleSendMessage(true)}
              disabled={sendingMessage || !newMessage.trim()}
            >
              <Text style={styles.sendBtnText}>Enviar & Resolver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: '#4f46e5' }]}
              onPress={() => handleSendMessage(false)}
              disabled={sendingMessage || !newMessage.trim()}
            >
              {sendingMessage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendBtnText}>Enviar</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Screen Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🎫 Suporte & Helpdesk</Text>
          <Text style={styles.headerSubtitle}>
            Gestão de chamados, atendimento ao cliente e SLA
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newTicketBtn}
          onPress={() => setNewTicketModal(true)}
        >
          <Text style={styles.newTicketBtnText}>+ Novo Ticket</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Counters */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Abertos</Text>
          <Text style={[styles.kpiValue, { color: '#b45309' }]}>{countAbertos}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Em Atendimento</Text>
          <Text style={[styles.kpiValue, { color: '#1d4ed8' }]}>{countEmAndamento}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Resolvidos</Text>
          <Text style={[styles.kpiValue, { color: '#15803d' }]}>{countConcluidos}</Text>
        </View>
      </View>

      {/* Search Box */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por protocolo, cliente ou assunto..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Status Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {(['todos', 'aberto', 'em andamento', 'concluido'] as const).map(st => (
          <TouchableOpacity
            key={st}
            style={[styles.chip, statusFilter === st && styles.chipActive]}
            onPress={() => setStatusFilter(st)}
          >
            <Text style={[styles.chipText, statusFilter === st && styles.chipTextActive]}>
              {st === 'todos' ? 'Todos' : st === 'aberto' ? 'Abertos' : st === 'em andamento' ? 'Em Atendimento' : 'Resolvidos'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tickets List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Carregando chamados...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTickets}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
          renderItem={({ item }) => {
            const pStyle = getPriorityStyle(item.prioridade);
            const sStyle = getStatusStyle(item.status);

            return (
              <TouchableOpacity
                style={styles.ticketCard}
                onPress={() => setSelectedTicket(item)}
              >
                <View style={styles.ticketCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ticketProto}>
                      #{item.protocolo || String(item.id).slice(0, 8)}
                    </Text>
                    <Text style={styles.ticketSubject} numberOfLines={2}>
                      {item.assunto || 'Sem assunto especificado'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.badge, { backgroundColor: sStyle.bg }]}>
                      <Text style={[styles.badgeText, { color: sStyle.text }]}>
                        {item.status ? item.status.toUpperCase() : 'ABERTO'}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: pStyle.bg }]}>
                      <Text style={[styles.badgeText, { color: pStyle.text }]}>
                        {item.prioridade ? item.prioridade.toUpperCase() : 'MÉDIA'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.ticketCardFooter}>
                  <Text style={styles.ticketClientText}>
                    👤 {item.cliente_nome || 'Cliente não identificado'}
                  </Text>
                  <Text style={styles.ticketDateText}>
                    🕒 {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum ticket encontrado</Text>
              <Text style={styles.emptySubtitle}>
                Não há chamados para os filtros selecionados.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal: Novo Ticket */}
      <Modal visible={newTicketModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Abrir Novo Chamado</Text>
              <TouchableOpacity onPress={() => setNewTicketModal(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormScroll}>
              <Text style={styles.inputLabel}>Nome do Solicitante / Cliente *</Text>
              <TextInput
                style={styles.modalInput}
                value={newTicketForm.cliente_nome}
                onChangeText={text => setNewTicketForm(prev => ({ ...prev, cliente_nome: text }))}
                placeholder="Nome do cliente"
              />

              <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={newTicketForm.cliente_telefone}
                onChangeText={text => setNewTicketForm(prev => ({ ...prev, cliente_telefone: text }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Assunto Principal *</Text>
              <TextInput
                style={styles.modalInput}
                value={newTicketForm.assunto}
                onChangeText={text => setNewTicketForm(prev => ({ ...prev, assunto: text }))}
                placeholder="Ex: Dúvida sobre fatura, falha no app..."
              />

              <Text style={styles.inputLabel}>Prioridade</Text>
              <View style={styles.prioritySelectorRow}>
                {(['baixa', 'media', 'alta', 'urgente'] as const).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.pBtn,
                      newTicketForm.prioridade === p && styles.pBtnActive,
                    ]}
                    onPress={() => setNewTicketForm(prev => ({ ...prev, prioridade: p }))}
                  >
                    <Text
                      style={[
                        styles.pBtnText,
                        newTicketForm.prioridade === p && styles.pBtnTextActive,
                      ]}
                    >
                      {p.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Descrição / Mensagem Inicial</Text>
              <TextInput
                style={[styles.modalInput, { height: 90 }]}
                value={newTicketForm.mensagem_inicial}
                onChangeText={text => setNewTicketForm(prev => ({ ...prev, mensagem_inicial: text }))}
                placeholder="Explique o relato da ocorrência..."
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setNewTicketModal(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleCreateTicket}
                disabled={creatingTicket}
              >
                {creatingTicket ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Criar Chamado</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  newTicketBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  newTicketBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginVertical: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 44,
  },
  filterScroll: {
    maxHeight: 42,
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  ticketCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticketProto: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4f46e5',
    marginBottom: 2,
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ticketCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  ticketClientText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  ticketDateText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  // Chat styles
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4f46e5',
  },
  chatHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  chatHeaderSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  chatStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusActionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  miniStatusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  miniStatusBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cannedRepliesScroll: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    maxHeight: 40,
  },
  cannedBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 240,
    justifyContent: 'center',
    minHeight: 32,
  },
  cannedBtnText: {
    fontSize: 11,
    color: '#334155',
  },
  messageScroll: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  messageListContent: {
    padding: 16,
    gap: 10,
  },
  messageBubbleWrapper: {
    flexDirection: 'row',
  },
  bubbleLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRight: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleAdmin: {
    backgroundColor: '#4f46e5',
    borderBottomRightRadius: 2,
  },
  bubbleClient: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageSenderName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  senderAdmin: {
    color: '#c7d2fe',
  },
  senderClient: {
    color: '#64748b',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextAdmin: {
    color: '#ffffff',
  },
  messageTextClient: {
    color: '#0f172a',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeAdmin: {
    color: '#e0e7ff',
  },
  timeClient: {
    color: '#94a3b8',
  },
  emptyMessagesText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    marginVertical: 30,
  },
  chatInputContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 12,
  },
  chatTextInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    maxHeight: 90,
  },
  chatSendRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  sendBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  sendBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748b',
    padding: 4,
  },
  modalFormScroll: {
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 44,
  },
  prioritySelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
  },
  pBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
    justifyContent: 'center',
  },
  pBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  pBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  pBtnTextActive: {
    color: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  modalBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});

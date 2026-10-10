import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { supabase } from '../../../supabase';

export interface SolicitacaoTrocaItem {
  id: string;
  cliente_id?: string | null;
  tipo?: 'troca' | 'devolucao' | string | null;
  status?: string | null;
  motivo?: string | null;
  descricao_detalhada?: string | null;
  metodo_entrega?: string | null;
  endereco_devolucao?: string | null;
  data_agendamento?: string | null;
  rastreio_cliente?: string | null;
  rastreio_admin?: string | null;
  valor_diferenca?: number | null;
  resposta_admin?: string | null;
  created_at?: string | null;
  clientes?: {
    nome?: string | null;
    email?: string | null;
  } | null;
}

export const LojaTrocasModuleScreen = () => {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoTrocaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'pendentes' | 'em_analise' | 'concluidos' | 'todos'>('pendentes');

  // Detail / Resolution Modal
  const [selectedItem, setSelectedItem] = useState<SolicitacaoTrocaItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [respostaAdminInput, setRespostaAdminInput] = useState('');
  const [rastreioAdminInput, setRastreioAdminInput] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchSolicitacoes = useCallback(async () => {
    try {
      let query = supabase
        .from('loja_solicitacoes')
        .select('*, clientes(nome, email)')
        .order('created_at', { ascending: false });

      if (tabFilter === 'pendentes') {
        query = query.in('status', ['pendente', 'aguardando_instrucoes', 'aguardando_devolucao']);
      } else if (tabFilter === 'em_analise') {
        query = query.in('status', ['em_analise', 'devolucao_postada', 'devolucao_recebida', 'agendado']);
      } else if (tabFilter === 'concluidos') {
        query = query.in('status', ['aprovado', 'concluido', 'rejeitado', 'novo_produto_enviado']);
      }

      const { data, error } = await query;
      if (error) {
        // Table might be named loja_trocas in some environments
        const { data: trocasData, error: trocasErr } = await supabase
          .from('loja_trocas')
          .select('*')
          .order('created_at', { ascending: false });
        if (trocasErr) throw error;
        setSolicitacoes((trocasData || []) as SolicitacaoTrocaItem[]);
      } else {
        setSolicitacoes((data || []) as SolicitacaoTrocaItem[]);
      }
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar trocas:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tabFilter]);

  useEffect(() => {
    setLoading(true);
    fetchSolicitacoes();
  }, [fetchSolicitacoes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSolicitacoes();
  };

  const filteredSolicitacoes = solicitacoes.filter((s) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const motivo = (s.motivo || '').toLowerCase();
    const cliente = (s.clientes?.nome || '').toLowerCase();
    const id = (s.id || '').toLowerCase();
    const rastreio = (s.rastreio_cliente || s.rastreio_admin || '').toLowerCase();
    return motivo.includes(term) || cliente.includes(term) || id.includes(term) || rastreio.includes(term);
  });

  const handleOpenDetails = (item: SolicitacaoTrocaItem) => {
    setSelectedItem(item);
    setRespostaAdminInput(item.resposta_admin || '');
    setRastreioAdminInput(item.rastreio_admin || '');
    setDetailModalVisible(true);
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedItem) return;

    setUpdating(true);
    try {
      const payload: any = {
        status: newStatus,
        resposta_admin: respostaAdminInput.trim() || selectedItem.resposta_admin,
        rastreio_admin: rastreioAdminInput.trim() || selectedItem.rastreio_admin,
      };

      const { error } = await supabase
        .from('loja_solicitacoes')
        .update(payload)
        .eq('id', selectedItem.id);

      if (error) {
        // try loja_trocas fallback
        await supabase.from('loja_trocas').update(payload).eq('id', selectedItem.id);
      }

      Alert.alert('Status Atualizado', `Solicitação alterada para ${newStatus.toUpperCase()}`);
      setSelectedItem({ ...selectedItem, ...payload });
      setSolicitacoes((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? { ...s, ...payload } : s))
      );
    } catch (err: any) {
      Alert.alert('Erro ao atualizar', err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedItem) return;
    setUpdating(true);
    try {
      const payload = {
        resposta_admin: respostaAdminInput.trim(),
        rastreio_admin: rastreioAdminInput.trim(),
      };

      const { error } = await supabase
        .from('loja_solicitacoes')
        .update(payload)
        .eq('id', selectedItem.id);

      if (error) {
        await supabase.from('loja_trocas').update(payload).eq('id', selectedItem.id);
      }

      Alert.alert('Sucesso', 'Informações administrativas salvas com sucesso!');
      setSelectedItem({ ...selectedItem, ...payload });
      setSolicitacoes((prev) =>
        prev.map((s) => (s.id === selectedItem.id ? { ...s, ...payload } : s))
      );
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadgeStyle = (status?: string | null) => {
    switch (status) {
      case 'aprovado':
      case 'concluido':
        return { bg: '#dcfce7', text: '#15803d', label: 'Concluído' };
      case 'rejeitado':
        return { bg: '#fee2e2', text: '#b91c1c', label: 'Rejeitado' };
      case 'em_analise':
      case 'devolucao_recebida':
      case 'devolucao_postada':
        return { bg: '#e0e7ff', text: '#4338ca', label: 'Em Análise' };
      default:
        return { bg: '#fef3c7', text: '#b45309', label: 'Pendente' };
    }
  };

  const renderCard = ({ item }: { item: SolicitacaoTrocaItem }) => {
    const isTroca = item.tipo === 'troca';
    const statusInfo = getStatusBadgeStyle(item.status);
    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '';

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => handleOpenDetails(item)}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, isTroca ? styles.typeTroca : styles.typeDevolucao]}>
              <Text style={[styles.typeBadgeText, isTroca ? styles.textTroca : styles.textDevolucao]}>
                {isTroca ? '🔄 TROCA' : '↩️ DEVOLUÇÃO'}
              </Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
                {item.status?.toUpperCase() || statusInfo.label}
              </Text>
            </View>
          </View>

          <Text style={styles.clientName}>
            👤 {item.clientes?.nome || `Cliente #${item.cliente_id?.slice(0, 8) || 'N/I'}`}
          </Text>

          <Text style={styles.motivoText} numberOfLines={2}>
            {item.motivo || item.descricao_detalhada || 'Sem motivo especificado'}
          </Text>

          <View style={styles.metaFooter}>
            <Text style={styles.dateText}>📅 {dateStr}</Text>
            {item.rastreio_admin || item.rastreio_cliente ? (
              <Text style={styles.rastreioText}>📦 Rastreio Ativo</Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtnDetails}
            onPress={() => handleOpenDetails(item)}
          >
            <Text style={styles.actionBtnDetailsText}>Gerenciar & Responder →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pós-Venda: Trocas & Devoluções</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por motivo, cliente ou rastreio..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.chip, tabFilter === 'pendentes' && styles.chipActive]}
            onPress={() => setTabFilter('pendentes')}
          >
            <Text style={[styles.chipText, tabFilter === 'pendentes' && styles.chipTextActive]}>Pendentes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, tabFilter === 'em_analise' && styles.chipActive]}
            onPress={() => setTabFilter('em_analise')}
          >
            <Text style={[styles.chipText, tabFilter === 'em_analise' && styles.chipTextActive]}>Em Análise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, tabFilter === 'concluidos' && styles.chipActive]}
            onPress={() => setTabFilter('concluidos')}
          >
            <Text style={[styles.chipText, tabFilter === 'concluidos' && styles.chipTextActive]}>Concluídos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, tabFilter === 'todos' && styles.chipActive]}
            onPress={() => setTabFilter('todos')}
          >
            <Text style={[styles.chipText, tabFilter === 'todos' && styles.chipTextActive]}>Todos</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando solicitações...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSolicitacoes}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Nenhuma solicitação encontrada</Text>
              <Text style={styles.emptySubtitle}>Todas as solicitações de pós-venda estão em dia.</Text>
            </View>
          }
        />
      )}

      {/* Detail / Action Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gestão de Solicitação</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Protocolo ID:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.id}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipo:</Text>
                  <Text style={styles.detailValueBold}>
                    {selectedItem.tipo === 'troca' ? 'Troca de Produto' : 'Devolução & Reembolso'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Cliente:</Text>
                  <Text style={styles.detailValue}>
                    {selectedItem.clientes?.nome || selectedItem.cliente_id || '-'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Atual:</Text>
                  <Text style={styles.detailValueBold}>
                    {selectedItem.status?.toUpperCase()}
                  </Text>
                </View>

                {selectedItem.motivo ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Motivo Informado pelo Cliente:</Text>
                    <Text style={styles.descText}>{selectedItem.motivo}</Text>
                  </View>
                ) : null}

                {selectedItem.descricao_detalhada ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Descrição Detalhada:</Text>
                    <Text style={styles.descText}>{selectedItem.descricao_detalhada}</Text>
                  </View>
                ) : null}

                {selectedItem.endereco_devolucao ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Endereço para Coleta/Devolução:</Text>
                    <Text style={styles.descText}>{selectedItem.endereco_devolucao}</Text>
                  </View>
                ) : null}

                {selectedItem.rastreio_cliente ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rastreio do Cliente:</Text>
                    <Text style={styles.detailValueBold}>{selectedItem.rastreio_cliente}</Text>
                  </View>
                ) : null}

                {/* Admin Inputs */}
                <Text style={styles.inputLabel}>Código de Rastreio Admin (Novo envio/Reverso)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: BR123456789XP"
                  placeholderTextColor="#94a3b8"
                  value={rastreioAdminInput}
                  onChangeText={setRastreioAdminInput}
                />

                <Text style={styles.inputLabel}>Resposta / Instrução ao Cliente</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Instruções de envio, prazos ou justificativa de decisão..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                  value={respostaAdminInput}
                  onChangeText={setRespostaAdminInput}
                />

                <TouchableOpacity
                  style={[styles.saveNotesBtn, updating && styles.btnDisabled]}
                  onPress={handleSaveNotes}
                  disabled={updating}
                >
                  <Text style={styles.saveNotesBtnText}>Salvar Resposta & Rastreio</Text>
                </TouchableOpacity>

                {/* Workflow Decision Buttons */}
                <Text style={styles.sectionHeader}>Ações de Status do Pós-Venda</Text>
                <View style={styles.decisionGrid}>
                  <TouchableOpacity
                    style={[styles.decisionBtn, { backgroundColor: '#10b981' }]}
                    onPress={() => handleUpdateStatus('aprovado')}
                    disabled={updating}
                  >
                    <Text style={styles.decisionBtnText}>✓ Aprovar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.decisionBtn, { backgroundColor: '#3b82f6' }]}
                    onPress={() => handleUpdateStatus('em_analise')}
                    disabled={updating}
                  >
                    <Text style={styles.decisionBtnText}>🔍 Em Análise</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.decisionBtn, { backgroundColor: '#8b5cf6' }]}
                    onPress={() => handleUpdateStatus('novo_produto_enviado')}
                    disabled={updating}
                  >
                    <Text style={styles.decisionBtnText}>🚚 Produto Enviado</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.decisionBtn, { backgroundColor: '#059669' }]}
                    onPress={() => handleUpdateStatus('concluido')}
                    disabled={updating}
                  >
                    <Text style={styles.decisionBtnText}>✔ Concluir</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.decisionBtn, { backgroundColor: '#ef4444' }]}
                    onPress={() => handleUpdateStatus('rejeitado')}
                    disabled={updating}
                  >
                    <Text style={styles.decisionBtnText}>✕ Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
  },
  searchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterSection: {
    backgroundColor: '#ffffff',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeTroca: {
    backgroundColor: '#dbeafe',
  },
  typeDevolucao: {
    backgroundColor: '#ffedd5',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textTroca: {
    color: '#1d4ed8',
  },
  textDevolucao: {
    color: '#c2410c',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  motivoText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 8,
  },
  metaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  rastreioText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  actionsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    alignItems: 'flex-end',
  },
  actionBtnDetails: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionBtnDetailsText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 18,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    color: '#0f172a',
    maxWidth: '65%',
    textAlign: 'right',
  },
  detailValueBold: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    maxWidth: '65%',
    textAlign: 'right',
  },
  descBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  descText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 14,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0f172a',
  },
  textArea: {
    height: 72,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  saveNotesBtn: {
    backgroundColor: '#2563eb',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  saveNotesBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 20,
    marginBottom: 10,
  },
  decisionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  decisionBtn: {
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: '45%',
    flex: 1,
  },
  decisionBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});

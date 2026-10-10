import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface DemandaItem {
  id: string;
  codigo_demanda?: string;
  titulo?: string;
  descricao?: string;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente' | string;
  status: string;
  valor_repassado?: number;
  prazo_limite?: string;
  data_entrega?: string;
  link_entrega?: string;
  observacoes?: string;
  created_at?: string;
  ordens_servico?: {
    id?: string;
    codigo_os?: string;
    cliente?: { nome?: string } | null;
  } | null;
  colaboradores?: {
    id?: string;
    nome?: string;
  } | null;
  prestadores?: {
    id?: string;
    nome_razao?: string;
  } | null;
}

export const DemandasColaboradorModuleScreen = () => {
  const [data, setData] = useState<DemandaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todas' | 'pendente' | 'em_andamento' | 'aguardando_revisao' | 'concluida' | 'cancelada'>('todas');

  // Selected item for details
  const [selectedItem, setSelectedItem] = useState<DemandaItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // New Demand modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media',
    valor_repassado: '',
    prazo_dias: '3',
  });

  // Action review modal
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const fetchDemandas = useCallback(async () => {
    try {
      let query = supabase
        .from('prestador_demandas')
        .select(`
          id,
          codigo_demanda,
          titulo,
          descricao,
          prioridade,
          status,
          valor_repassado,
          prazo_limite,
          data_entrega,
          link_entrega,
          observacoes,
          created_at,
          ordens_servico:os_id (
            id,
            codigo_os,
            cliente:clientes (
              nome
            )
          ),
          colaboradores:colaborador_id (
            id,
            nome
          ),
          prestadores:prestador_id (
            id,
            nome_razao
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (activeTab !== 'todas') {
        query = query.eq('status', activeTab);
      }

      const { data: result, error } = await query;

      if (error) {
        console.error('Erro ao buscar demandas:', error);
        Alert.alert('Erro', 'Não foi possível carregar as demandas: ' + error.message);
      } else {
        setData((result as DemandaItem[]) || []);
      }
    } catch (err: any) {
      console.error('Exceção ao buscar demandas:', err);
      Alert.alert('Erro', 'Erro inesperado ao consultar demandas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchDemandas();
  }, [fetchDemandas]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDemandas();
  };

  const filteredData = data.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const codigo = (item.codigo_demanda || '').toLowerCase();
    const titulo = (item.titulo || '').toLowerCase();
    const prestador = (item.prestadores?.nome_razao || '').toLowerCase();
    const colab = (item.colaboradores?.nome || '').toLowerCase();
    return codigo.includes(term) || titulo.includes(term) || prestador.includes(term) || colab.includes(term);
  });

  // KPIs
  const pendentesCount = data.filter((i) => i.status === 'pendente').length;
  const emAndamentoCount = data.filter((i) => i.status === 'em_andamento').length;
  const revisaoCount = data.filter((i) => i.status === 'aguardando_revisao').length;

  const handleUpdateStatus = async (item: DemandaItem, newStatus: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('prestador_demandas')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Status da demanda alterado para ${newStatus}!`);
      setDetailModalVisible(false);
      fetchDemandas();
    } catch (err: any) {
      Alert.alert('Erro ao atualizar', err.message || 'Falha ao atualizar status.');
    } finally {
      setSaving(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const obsAtual = selectedItem.observacoes
        ? `${selectedItem.observacoes}\n[Revisão]: ${reviewNotes}`
        : `[Revisão]: ${reviewNotes}`;

      const { error } = await supabase
        .from('prestador_demandas')
        .update({
          status: 'aguardando_revisao',
          observacoes: obsAtual,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Solicitação de revisão enviada!');
      setReviewModalVisible(false);
      setDetailModalVisible(false);
      fetchDemandas();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao enviar revisão.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDemanda = async () => {
    if (!newForm.titulo.trim()) {
      Alert.alert('Atenção', 'Informe o título da demanda.');
      return;
    }

    setSaving(true);
    try {
      const codigoGerado = 'DEM-' + Math.floor(100000 + Math.random() * 900000);
      const repasseNum = Number(newForm.valor_repassado.replace(',', '.')) || 0;
      const diasNum = parseInt(newForm.prazo_dias, 10) || 3;
      const prazoDate = new Date();
      prazoDate.setDate(prazoDate.getDate() + diasNum);

      const { error } = await supabase.from('prestador_demandas').insert([
        {
          codigo_demanda: codigoGerado,
          titulo: newForm.titulo,
          descricao: newForm.descricao,
          prioridade: newForm.prioridade,
          status: 'pendente',
          valor_repassado: repasseNum,
          prazo_limite: prazoDate.toISOString(),
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Demanda ${codigoGerado} despachada com sucesso!`);
      setNewModalVisible(false);
      setNewForm({
        titulo: '',
        descricao: '',
        prioridade: 'media',
        valor_repassado: '',
        prazo_dias: '3',
      });
      fetchDemandas();
    } catch (err: any) {
      Alert.alert('Erro ao criar demanda', err.message || 'Falha ao gravar no banco.');
    } finally {
      setSaving(false);
    }
  };

  const getPriorityStyle = (prioridade?: string) => {
    switch (prioridade?.toLowerCase()) {
      case 'urgente':
        return { bg: '#fee2e2', text: '#dc2626', label: 'URGENTE' };
      case 'alta':
        return { bg: '#ffedd5', text: '#ea580c', label: 'ALTA' };
      case 'baixa':
        return { bg: '#f3f4f6', text: '#4b5563', label: 'BAIXA' };
      default:
        return { bg: '#dbeafe', text: '#2563eb', label: 'MÉDIA' };
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'concluida':
      case 'concluido':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'cancelada':
      case 'cancelado':
        return { bg: '#fee2e2', text: '#dc2626' };
      case 'aguardando_revisao':
        return { bg: '#fef3c7', text: '#d97706' };
      case 'em_andamento':
        return { bg: '#ede9fe', text: '#7c3aed' };
      default:
        return { bg: '#e5e7eb', text: '#374151' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar demanda por título, código ou responsável..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearch('')}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Pendentes</Text>
          <Text style={[styles.kpiValue, { color: '#4b5563' }]}>{pendentesCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Em Andamento</Text>
          <Text style={[styles.kpiValue, { color: '#7c3aed' }]}>{emAndamentoCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Em Revisão</Text>
          <Text style={[styles.kpiValue, { color: '#d97706' }]}>{revisaoCount}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todas', 'pendente', 'em_andamento', 'aguardando_revisao', 'concluida', 'cancelada'] as const).map(
            (tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                  {tab === 'todas'
                    ? 'Todas'
                    : tab === 'pendente'
                    ? 'Pendentes'
                    : tab === 'em_andamento'
                    ? 'Em Andamento'
                    : tab === 'aguardando_revisao'
                    ? 'Em Revisão'
                    : tab === 'concluida'
                    ? 'Concluídas'
                    : 'Canceladas'}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Demanda</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando fila de demandas...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhuma demanda encontrada</Text>
              <Text style={styles.emptySubtitle}>Ajuste os filtros ou crie uma nova demanda operacional.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const priorityStyle = getPriorityStyle(item.prioridade);
            const statusStyle = getStatusColor(item.status);
            const prestadorName = item.prestadores?.nome_razao || item.colaboradores?.nome || 'Não atribuído';

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedItem(item);
                  setDetailModalVisible(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.cardCode}>{item.codigo_demanda || `DEM #${item.id.substring(0, 6)}`}</Text>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.titulo || 'Demanda sem título'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bg }]}>
                      <Text style={[styles.priorityBadgeText, { color: priorityStyle.text }]}>
                        {priorityStyle.label}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.assignedText} numberOfLines={1}>
                    👷 {prestadorName}
                  </Text>
                  {item.ordens_servico?.codigo_os && (
                    <Text style={styles.linkedOsText} numberOfLines={1}>
                      🔗 Vinculada à {item.ordens_servico.codigo_os}
                    </Text>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    Prazo: {item.prazo_limite ? new Date(item.prazo_limite).toLocaleDateString('pt-BR') : 'Sem prazo'}
                  </Text>
                  <Text style={styles.cardPayout}>Repasse: R$ {Number(item.valor_repassado || 0).toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Details Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes da Demanda</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.codigo_demanda || selectedItem.id}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Atual:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedItem.status).bg }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(selectedItem.status).text }]}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Prioridade:</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityStyle(selectedItem.prioridade).bg }]}>
                    <Text style={[styles.priorityBadgeText, { color: getPriorityStyle(selectedItem.prioridade).text }]}>
                      {getPriorityStyle(selectedItem.prioridade).label}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Briefing da Demanda</Text>
                  <Text style={[styles.detailValueBold, { fontSize: 16, marginBottom: 4 }]}>
                    {selectedItem.titulo}
                  </Text>
                  <Text style={styles.detailValue}>
                    {selectedItem.descricao || 'Sem descrição detalhada.'}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Responsável & Prazos</Text>
                  <Text style={styles.detailValue}>
                    Prestador: {selectedItem.prestadores?.nome_razao || 'Aguardando atribuição'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Colaborador: {selectedItem.colaboradores?.nome || 'N/A'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Prazo Limite: {selectedItem.prazo_limite ? new Date(selectedItem.prazo_limite).toLocaleString('pt-BR') : 'N/A'}
                  </Text>
                  <View style={[styles.detailRow, { marginTop: 4 }]}>
                    <Text style={styles.detailLabel}>Valor Repasse:</Text>
                    <Text style={[styles.detailValueBold, { color: '#10b981', fontSize: 17 }]}>
                      R$ {Number(selectedItem.valor_repassado || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {selectedItem.link_entrega && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeader}>Entrega / Resultado</Text>
                    <Text style={[styles.detailValue, { color: '#2563eb' }]}>{selectedItem.link_entrega}</Text>
                  </View>
                )}

                {selectedItem.observacoes && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeader}>Observações / Histórico</Text>
                    <Text style={styles.detailValue}>{selectedItem.observacoes}</Text>
                  </View>
                )}

                {/* Operational Actions */}
                <View style={styles.modalActionGroup}>
                  {selectedItem.status === 'pendente' && (
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={() => handleUpdateStatus(selectedItem, 'em_andamento')}
                    >
                      <Text style={styles.actionButtonText}>▶ Iniciar Atendimento</Text>
                    </TouchableOpacity>
                  )}

                  {selectedItem.status !== 'concluida' && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleUpdateStatus(selectedItem, 'concluida')}
                    >
                      <Text style={styles.actionButtonText}>✓ Aprovar Entrega / Concluir</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => {
                      setReviewNotes('');
                      setReviewModalVisible(true);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>⚠️ Solicitar Ajustes / Revisão</Text>
                  </TouchableOpacity>

                  {selectedItem.status !== 'cancelada' && (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => handleUpdateStatus(selectedItem, 'cancelada')}
                    >
                      <Text style={styles.dangerActionText}>✕ Cancelar Demanda</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Review Modal */}
      <Modal visible={reviewModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Solicitar Revisão</Text>
            <Text style={styles.smallModalDesc}>Informe quais ajustes o prestador deve realizar:</Text>
            <TextInput
              style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Descreva as alterações necessárias..."
              placeholderTextColor="#9ca3af"
              value={reviewNotes}
              onChangeText={setReviewNotes}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReviewModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleReviewSubmit}>
                <Text style={styles.confirmBtnText}>Enviar Revisão</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Demand Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Demanda</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Título da Demanda *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Instalação de Ponto de Rede"
                placeholderTextColor="#9ca3af"
                value={newForm.titulo}
                onChangeText={(t) => setNewForm({ ...newForm, titulo: t })}
              />

              <Text style={styles.formLabel}>Prioridade</Text>
              <View style={styles.categorySelectRow}>
                {(['baixa', 'media', 'alta', 'urgente'] as const).map((prio) => (
                  <TouchableOpacity
                    key={prio}
                    style={[styles.categoryOption, newForm.prioridade === prio && styles.categoryOptionActive]}
                    onPress={() => setNewForm({ ...newForm, prioridade: prio })}
                  >
                    <Text style={[styles.categoryOptionText, newForm.prioridade === prio && styles.categoryOptionTextActive]}>
                      {prio.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Valor Repasse (R$)</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={newForm.valor_repassado}
                onChangeText={(t) => setNewForm({ ...newForm, valor_repassado: t })}
              />

              <Text style={styles.formLabel}>Prazo para Conclusão (Dias)</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor="#9ca3af"
                value={newForm.prazo_dias}
                onChangeText={(t) => setNewForm({ ...newForm, prazo_dias: t })}
              />

              <Text style={styles.formLabel}>Briefing / Descrição Detalhada</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Instruções de execução, requisitos técnicos..."
                placeholderTextColor="#9ca3af"
                value={newForm.descricao}
                onChangeText={(t) => setNewForm({ ...newForm, descricao: t })}
              />

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setNewModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleCreateDemanda}>
                  <Text style={styles.confirmBtnText}>Despachar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#111827',
  },
  clearSearchBtn: {
    marginLeft: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  tabChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabChipActive: {
    backgroundColor: '#17345f',
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  tabChipTextActive: {
    color: '#fff',
  },
  newButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    backgroundColor: '#10b981',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 14,
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 2,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardBody: {
    marginVertical: 4,
    gap: 4,
  },
  assignedText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  linkedOsText: {
    fontSize: 12,
    color: '#2563eb',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  cardDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  cardPayout: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10b981',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  smallModalCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  smallModalDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginVertical: 8,
  },
  modalCloseBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#374151',
    marginVertical: 2,
  },
  detailValueBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  detailSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#17345f',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  modalActionGroup: {
    marginTop: 20,
    gap: 10,
    paddingBottom: 20,
  },
  primaryActionButton: {
    minHeight: 48,
    backgroundColor: '#10b981',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  secondaryActionButton: {
    minHeight: 48,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#7c3aed',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dangerActionButton: {
    minHeight: 48,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerActionText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: 14,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  categorySelectRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  categoryOption: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  categoryOptionActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  categoryOptionText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4b5563',
  },
  categoryOptionTextActive: {
    color: '#fff',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#17345f',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

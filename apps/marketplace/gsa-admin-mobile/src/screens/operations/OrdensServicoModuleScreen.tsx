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

export interface OrdensServicoItem {
  id: string;
  codigo_os?: string;
  cliente_id?: string;
  orcamento_id?: string;
  status: string;
  data_inicio?: string;
  data_fim?: string;
  valor_total?: number;
  garantia_dias?: number;
  motivo_cancelamento?: string;
  observacoes?: string;
  clientes?: {
    id?: string;
    nome?: string;
    cpf?: string;
    cnpj?: string;
    telefone?: string;
    email?: string;
    codigo_cliente?: string;
  } | null;
  orcamentos?: {
    id?: string;
    codigo_orcamento?: string;
    total?: number;
    servicos?: { nome?: string; descricao?: string } | null;
  } | null;
  prestador_demandas?: Array<{
    id: string;
    status: string;
    codigo_demanda?: string;
  }> | null;
}

export const OrdensServicoModuleScreen = () => {
  const [data, setData] = useState<OrdensServicoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'andamento' | 'concluido' | 'cancelado'>('todos');

  // Selected item for details
  const [selectedItem, setSelectedItem] = useState<OrdensServicoItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Cancellation modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // New Note modal
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteText, setNoteText] = useState('');

  // New OS modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome_cliente: '',
    descricao: '',
    valor_total: '',
    garantia_dias: '90',
  });

  const [saving, setSaving] = useState(false);

  const fetchOrdens = useCallback(async () => {
    try {
      let query = supabase
        .from('ordens_servico')
        .select(`
          id,
          codigo_os,
          cliente_id,
          orcamento_id,
          status,
          data_inicio,
          data_fim,
          valor_total,
          garantia_dias,
          motivo_cancelamento,
          observacoes,
          clientes (
            id,
            nome,
            cpf,
            cnpj,
            telefone,
            email,
            codigo_cliente
          ),
          orcamentos:orcamento_id (
            id,
            codigo_orcamento,
            total,
            servicos (
              nome,
              descricao
            )
          ),
          prestador_demandas (
            id,
            status,
            codigo_demanda
          )
        `)
        .order('data_inicio', { ascending: false })
        .limit(100);

      if (activeTab === 'andamento') {
        query = query.in('status', ['andamento', 'em_andamento', 'em_execucao', 'aberta', 'pendente']);
      } else if (activeTab === 'concluido') {
        query = query.in('status', ['concluido', 'concluida', 'finalizado']);
      } else if (activeTab === 'cancelado') {
        query = query.in('status', ['cancelado', 'cancelada']);
      }

      const { data: result, error } = await query;

      if (error) {
        console.warn('Silencioso: erro ao buscar ordens de serviço:', error.message);
      } else {
        setData((result as OrdensServicoItem[]) || []);
      }
    } catch (err: any) {
      console.warn('Silencioso: exceção ao buscar ordens de serviço:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchOrdens();
  }, [fetchOrdens]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrdens();
  };

  const filteredData = data.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const codigo = (item.codigo_os || '').toLowerCase();
    const cliente = (item.clientes?.nome || '').toLowerCase();
    const servico = (item.orcamentos?.servicos?.nome || item.observacoes || '').toLowerCase();
    return codigo.includes(term) || cliente.includes(term) || servico.includes(term);
  });

  // KPIs
  const totalCount = data.length;
  const andamentoCount = data.filter((i) => ['andamento', 'em_andamento', 'em_execucao', 'aberta', 'pendente'].includes(i.status)).length;
  const concluidoCount = data.filter((i) => ['concluido', 'concluida', 'finalizado'].includes(i.status)).length;

  const handleConcludeOS = async (item: OrdensServicoItem) => {
    Alert.alert(
      'Concluir Ordem de Serviço',
      `Deseja marcar a OS ${item.codigo_os || item.id} como Concluída?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              const { error } = await supabase
                .from('ordens_servico')
                .update({
                  status: 'concluido',
                  data_fim: new Date().toISOString(),
                })
                .eq('id', item.id);

              if (error) throw error;

              Alert.alert('Sucesso', 'Ordem de Serviço finalizada com sucesso!');
              setDetailModalVisible(false);
              fetchOrdens();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao concluir OS.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelSubmit = async () => {
    if (!selectedItem) return;
    if (!cancelReason.trim()) {
      Alert.alert('Atenção', 'Informe o motivo do cancelamento.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ordens_servico')
        .update({
          status: 'cancelado',
          motivo_cancelamento: cancelReason,
          data_fim: new Date().toISOString(),
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      // Cascata em demandas vinculadas se houver
      await supabase
        .from('prestador_demandas')
        .update({ status: 'cancelada' })
        .eq('os_id', selectedItem.id);

      Alert.alert('Sucesso', 'Ordem de Serviço cancelada com sucesso.');
      setCancelModalVisible(false);
      setDetailModalVisible(false);
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro ao cancelar', err.message || 'Falha ao processar cancelamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedItem || !noteText.trim()) return;

    setSaving(true);
    try {
      const novaObs = selectedItem.observacoes
        ? `${selectedItem.observacoes}\n[${new Date().toLocaleDateString('pt-BR')}]: ${noteText}`
        : `[${new Date().toLocaleDateString('pt-BR')}]: ${noteText}`;

      const { error } = await supabase
        .from('ordens_servico')
        .update({ observacoes: novaObs })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Observação anexada à OS!');
      setNoteModalVisible(false);
      setSelectedItem({ ...selectedItem, observacoes: novaObs });
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao salvar observação.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOS = async () => {
    const valorNum = Number(newForm.valor_total.replace(',', '.'));
    if (isNaN(valorNum) || valorNum < 0) {
      Alert.alert('Atenção', 'Informe um valor válido.');
      return;
    }

    setSaving(true);
    try {
      const codigoGerado = 'OS-' + Math.floor(100000 + Math.random() * 900000);
      const garantiaNum = parseInt(newForm.garantia_dias, 10) || 90;

      const { error } = await supabase.from('ordens_servico').insert([
        {
          codigo_os: codigoGerado,
          status: 'andamento',
          valor_total: valorNum,
          garantia_dias: garantiaNum,
          observacoes: newForm.descricao,
          data_inicio: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Ordem de Serviço ${codigoGerado} criada!`);
      setNewModalVisible(false);
      setNewForm({
        nome_cliente: '',
        descricao: '',
        valor_total: '',
        garantia_dias: '90',
      });
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro ao criar OS', err.message || 'Falha ao gravar registro.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'concluido':
      case 'concluida':
      case 'finalizado':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'cancelado':
      case 'cancelada':
        return { bg: '#fee2e2', text: '#dc2626' };
      case 'andamento':
      case 'em_andamento':
      case 'em_execucao':
        return { bg: '#dbeafe', text: '#2563eb' };
      default:
        return { bg: '#fef3c7', text: '#d97706' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código OS, cliente ou serviço..."
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
          <Text style={styles.kpiLabel}>Em Execução</Text>
          <Text style={[styles.kpiValue, { color: '#2563eb' }]}>{andamentoCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Concluídas</Text>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{concluidoCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total OS</Text>
          <Text style={[styles.kpiValue, { color: '#17345f' }]}>{totalCount}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todos', 'andamento', 'concluido', 'cancelado'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                {tab === 'todos' ? 'Todas' : tab === 'andamento' ? 'Em Andamento' : tab === 'concluido' ? 'Concluídas' : 'Canceladas'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Nova OS</Text>
        </TouchableOpacity>
      </View>

      {/* List View */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando Ordens de Serviço...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhuma Ordem de Serviço encontrada</Text>
              <Text style={styles.emptySubtitle}>Ajuste a busca ou crie uma nova OS.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusColor(item.status);
            const clientName = item.clientes?.nome || 'Cliente não vinculado';
            const serviceName = item.orcamentos?.servicos?.nome || item.observacoes || 'Serviço sob demanda';
            const valor = item.valor_total || item.orcamentos?.total || 0;

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
                  <View>
                    <Text style={styles.cardCode}>{item.codigo_os || `OS #${item.id.substring(0, 6)}`}</Text>
                    {item.orcamentos?.codigo_orcamento && (
                      <Text style={styles.cardSubCode}>Origem: {item.orcamentos.codigo_orcamento}</Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.clientText} numberOfLines={1}>
                    👤 {clientName}
                  </Text>
                  <Text style={styles.serviceText} numberOfLines={1}>
                    ⚙️ {serviceName}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    Início: {item.data_inicio ? new Date(item.data_inicio).toLocaleDateString('pt-BR') : 'Hoje'}
                  </Text>
                  <Text style={styles.cardTotal}>R$ {Number(valor).toFixed(2)}</Text>
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
              <Text style={styles.modalTitle}>Detalhes da OS</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código OS:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.codigo_os || selectedItem.id}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Operacional:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedItem.status).bg }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(selectedItem.status).text }]}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Cliente</Text>
                  <Text style={styles.detailValue}>Nome: {selectedItem.clientes?.nome || 'Não vinculado'}</Text>
                  <Text style={styles.detailValue}>Documento: {selectedItem.clientes?.cpf || selectedItem.clientes?.cnpj || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Telefone: {selectedItem.clientes?.telefone || 'N/A'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Execução e Prazos</Text>
                  <Text style={styles.detailValue}>
                    Data Início: {selectedItem.data_inicio ? new Date(selectedItem.data_inicio).toLocaleString('pt-BR') : 'N/A'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Data Conclusão: {selectedItem.data_fim ? new Date(selectedItem.data_fim).toLocaleString('pt-BR') : 'Em andamento'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Garantia: {selectedItem.garantia_dias || 90} dias
                  </Text>
                  <View style={[styles.detailRow, { marginTop: 6 }]}>
                    <Text style={styles.detailLabel}>Valor Cobrado:</Text>
                    <Text style={[styles.detailValueBold, { color: '#10b981', fontSize: 18 }]}>
                      R$ {Number(selectedItem.valor_total || selectedItem.orcamentos?.total || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {selectedItem.motivo_cancelamento && (
                  <View style={[styles.detailSection, { backgroundColor: '#fee2e2', padding: 10, borderRadius: 8 }]}>
                    <Text style={[styles.sectionHeader, { color: '#dc2626' }]}>Motivo do Cancelamento</Text>
                    <Text style={{ color: '#991b1b', fontSize: 13 }}>{selectedItem.motivo_cancelamento}</Text>
                  </View>
                )}

                {selectedItem.observacoes && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeader}>Histórico / Observações</Text>
                    <Text style={styles.detailValue}>{selectedItem.observacoes}</Text>
                  </View>
                )}

                {/* Operations Actions */}
                <View style={styles.modalActionGroup}>
                  {!['concluido', 'concluida', 'cancelado', 'cancelada'].includes(selectedItem.status.toLowerCase()) && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleConcludeOS(selectedItem)}
                    >
                      <Text style={styles.actionButtonText}>✓ Concluir Ordem de Serviço</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => {
                      setNoteText('');
                      setNoteModalVisible(true);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>📝 Adicionar Atualização / Nota</Text>
                  </TouchableOpacity>

                  {!['cancelado', 'cancelada'].includes(selectedItem.status.toLowerCase()) && (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => {
                        setCancelReason('');
                        setCancelModalVisible(true);
                      }}
                    >
                      <Text style={styles.dangerActionText}>✕ Cancelar Ordem de Serviço</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Cancellation Sub-Modal */}
      <Modal visible={cancelModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Cancelar Ordem de Serviço</Text>
            <Text style={styles.smallModalDesc}>Informe a justificativa operacional:</Text>
            <TextInput
              style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Descreva o motivo do cancelamento..."
              placeholderTextColor="#9ca3af"
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCancelModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#dc2626' }]}
                disabled={saving}
                onPress={handleCancelSubmit}
              >
                <Text style={styles.confirmBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Note Sub-Modal */}
      <Modal visible={noteModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Adicionar Nota à OS</Text>
            <Text style={styles.smallModalDesc}>Insira uma atualização do serviço:</Text>
            <TextInput
              style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Ex: Peça substituída, testes de bancada realizados..."
              placeholderTextColor="#9ca3af"
              value={noteText}
              onChangeText={setNoteText}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setNoteModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleAddNote}>
                <Text style={styles.confirmBtnText}>Salvar Nota</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New OS Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Ordem de Serviço</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Valor Total (R$) *</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={newForm.valor_total}
                onChangeText={(t) => setNewForm({ ...newForm, valor_total: t })}
              />

              <Text style={styles.formLabel}>Garantia (Dias)</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="90"
                placeholderTextColor="#9ca3af"
                value={newForm.garantia_dias}
                onChangeText={(t) => setNewForm({ ...newForm, garantia_dias: t })}
              />

              <Text style={styles.formLabel}>Descrição do Serviço a Executar</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Escopo do serviço, procedimentos técnicos..."
                placeholderTextColor="#9ca3af"
                value={newForm.descricao}
                onChangeText={(t) => setNewForm({ ...newForm, descricao: t })}
              />

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setNewModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleCreateOS}>
                  <Text style={styles.confirmBtnText}>Abrir OS</Text>
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
    borderLeftColor: '#2563eb',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardCode: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  cardSubCode: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardBody: {
    marginVertical: 4,
    gap: 4,
  },
  clientText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  serviceText: {
    fontSize: 13,
    color: '#6b7280',
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
  cardTotal: {
    fontSize: 16,
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

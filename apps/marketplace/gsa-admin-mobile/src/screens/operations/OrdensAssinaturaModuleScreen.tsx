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

export interface OrdensAssinaturaItem {
  id: string;
  codigo_ordem?: string;
  cliente_id?: string;
  assinatura_id?: string;
  status: string;
  data_inicio?: string;
  data_fim?: string;
  frequencia?: string;
  valor?: number;
  valor_total?: number;
  observacoes?: string;
  clientes?: {
    id?: string;
    nome?: string;
    telefone?: string;
    email?: string;
  } | null;
  assinaturas?: {
    id?: string;
    nome?: string;
    valor?: number;
  } | null;
  faturas?: Array<{
    id: string;
    status: string;
    valor_total: number;
    codigo_fatura?: string;
  }> | null;
}

export const OrdensAssinaturaModuleScreen = () => {
  const [data, setData] = useState<OrdensAssinaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'processamento' | 'concluido' | 'cancelado'>('todos');

  // Selected for detail modal
  const [selectedItem, setSelectedItem] = useState<OrdensAssinaturaItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Extend contract modal
  const [extendModalVisible, setExtendModalVisible] = useState(false);
  const [extendMonths, setExtendMonths] = useState('1');

  // Cancel modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // New Subscription Modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome_plano: '',
    frequencia: 'mensal',
    valor: '',
    observacoes: '',
  });

  const [saving, setSaving] = useState(false);

  const fetchOrdens = useCallback(async () => {
    try {
      let query = supabase
        .from('ordens_assinatura')
        .select(`
          id,
          codigo_ordem,
          cliente_id,
          assinatura_id,
          status,
          data_inicio,
          data_fim,
          frequencia,
          valor,
          valor_total,
          observacoes,
          clientes (
            id,
            nome,
            telefone,
            email
          ),
          assinaturas (
            id,
            nome,
            valor
          ),
          faturas (
            id,
            status,
            valor_total,
            codigo_fatura
          )
        `)
        .order('data_inicio', { ascending: false })
        .limit(100);

      if (activeTab === 'processamento') {
        query = query.in('status', ['em_analise', 'pendente', 'pago', 'processamento']);
      } else if (activeTab === 'concluido') {
        query = query.in('status', ['concluido', 'concluida', 'ativo', 'ativa']);
      } else if (activeTab === 'cancelado') {
        query = query.in('status', ['cancelado', 'cancelada', 'em_cancelamento']);
      }

      const { data: result, error } = await query;

      if (error) {
        console.warn('Silencioso: erro ao buscar ordens de assinatura:', error.message);
      } else {
        setData((result as OrdensAssinaturaItem[]) || []);
      }
    } catch (err: any) {
      console.warn('Silencioso: exceção ao buscar assinaturas:', err);
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
    const codigo = (item.codigo_ordem || '').toLowerCase();
    const cliente = (item.clientes?.nome || '').toLowerCase();
    const plano = (item.assinaturas?.nome || item.observacoes || '').toLowerCase();
    return codigo.includes(term) || cliente.includes(term) || plano.includes(term);
  });

  // KPIs
  const ativasCount = data.filter((i) => ['concluido', 'concluida', 'ativo', 'ativa'].includes(i.status)).length;
  const processamentoCount = data.filter((i) => ['em_analise', 'pendente', 'pago', 'processamento'].includes(i.status)).length;
  const totalMensal = data
    .filter((i) => ['concluido', 'concluida', 'ativo', 'ativa'].includes(i.status))
    .reduce((acc, curr) => acc + (Number(curr.valor || curr.valor_total || curr.assinaturas?.valor) || 0), 0);

  const handleActivate = async (item: OrdensAssinaturaItem) => {
    Alert.alert(
      'Ativar Assinatura',
      `Confirmar ativação da assinatura ${item.codigo_ordem || item.id}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Ativar',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              const { error } = await supabase
                .from('ordens_assinatura')
                .update({ status: 'concluido' })
                .eq('id', item.id);

              if (error) throw error;

              Alert.alert('Sucesso', 'Assinatura ativada com sucesso!');
              setDetailModalVisible(false);
              fetchOrdens();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao ativar assinatura.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleExtendSubmit = async () => {
    if (!selectedItem) return;
    const months = parseInt(extendMonths, 10);
    if (isNaN(months) || months <= 0) {
      Alert.alert('Atenção', 'Informe um número válido de meses.');
      return;
    }

    setSaving(true);
    try {
      const baseDate = selectedItem.data_fim ? new Date(selectedItem.data_fim) : new Date();
      baseDate.setMonth(baseDate.getMonth() + months);
      const novaDataFim = baseDate.toISOString().split('T')[0];

      const { error } = await supabase
        .from('ordens_assinatura')
        .update({ data_fim: novaDataFim })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Assinatura prorrogada até ${new Date(novaDataFim).toLocaleDateString('pt-BR')}!`);
      setExtendModalVisible(false);
      setDetailModalVisible(false);
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao prorrogar assinatura.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!selectedItem) return;
    if (!cancelReason.trim()) {
      Alert.alert('Atenção', 'Informe a justificativa do cancelamento.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ordens_assinatura')
        .update({
          status: 'cancelado',
          observacoes: `Cancelado: ${cancelReason}`,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Assinatura cancelada com sucesso.');
      setCancelModalVisible(false);
      setDetailModalVisible(false);
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao cancelar assinatura.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAssinatura = async () => {
    const valorNum = Number(newForm.valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor mensal válido.');
      return;
    }

    setSaving(true);
    try {
      const codigoGerado = 'OA-' + Math.floor(100000 + Math.random() * 900000);
      const dataInicio = new Date().toISOString().split('T')[0];
      const dataFim = new Date();
      dataFim.setMonth(dataFim.getMonth() + 1);

      const { error } = await supabase.from('ordens_assinatura').insert([
        {
          codigo_ordem: codigoGerado,
          status: 'em_analise',
          frequencia: newForm.frequencia,
          valor: valorNum,
          valor_total: valorNum,
          data_inicio: dataInicio,
          data_fim: dataFim.toISOString().split('T')[0],
          observacoes: newForm.nome_plano ? `Plano: ${newForm.nome_plano}. ${newForm.observacoes}` : newForm.observacoes,
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Ordem de Assinatura ${codigoGerado} cadastrada!`);
      setNewModalVisible(false);
      setNewForm({
        nome_plano: '',
        frequencia: 'mensal',
        valor: '',
        observacoes: '',
      });
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro ao criar assinatura', err.message || 'Falha ao salvar no banco.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'concluido':
      case 'concluida':
      case 'ativo':
      case 'ativa':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'cancelado':
      case 'cancelada':
        return { bg: '#fee2e2', text: '#dc2626' };
      case 'em_cancelamento':
        return { bg: '#fef3c7', text: '#d97706' };
      default:
        return { bg: '#ede9fe', text: '#7c3aed' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código, plano ou cliente..."
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
          <Text style={styles.kpiLabel}>Ativas</Text>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{ativasCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Em Análise</Text>
          <Text style={[styles.kpiValue, { color: '#7c3aed' }]}>{processamentoCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>MRR Recorrente</Text>
          <Text style={[styles.kpiValue, { color: '#17345f' }]}>
            R$ {totalMensal >= 1000 ? `${(totalMensal / 1000).toFixed(1)}k` : totalMensal.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todos', 'processamento', 'concluido', 'cancelado'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                {tab === 'todos' ? 'Todas' : tab === 'processamento' ? 'Processamento' : tab === 'concluido' ? 'Ativas' : 'Canceladas'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Nova</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando assinaturas...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhuma assinatura encontrada</Text>
              <Text style={styles.emptySubtitle}>Ajuste os filtros ou registre um novo contrato recorrente.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusColor(item.status);
            const clientName = item.clientes?.nome || 'Cliente não identificado';
            const planName = item.assinaturas?.nome || item.observacoes || 'Plano de Serviços Contínuos';
            const valor = item.valor || item.valor_total || item.assinaturas?.valor || 0;

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
                    <Text style={styles.cardCode}>{item.codigo_ordem || `ASS #${item.id.substring(0, 6)}`}</Text>
                    <Text style={styles.cardFrequency}>{(item.frequencia || 'mensal').toUpperCase()}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.planText} numberOfLines={1}>
                    📜 {planName}
                  </Text>
                  <Text style={styles.clientText} numberOfLines={1}>
                    👤 {clientName}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    Término: {item.data_fim ? new Date(item.data_fim).toLocaleDateString('pt-BR') : 'Indeterminado'}
                  </Text>
                  <Text style={styles.cardTotal}>R$ {Number(valor).toFixed(2)}/mês</Text>
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
              <Text style={styles.modalTitle}>Detalhes da Assinatura</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Contrato:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.codigo_ordem || selectedItem.id}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedItem.status).bg }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(selectedItem.status).text }]}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Plano e Recorrência</Text>
                  <Text style={styles.detailValue}>Nome: {selectedItem.assinaturas?.nome || 'Plano Personalizado'}</Text>
                  <Text style={styles.detailValue}>Frequência: {selectedItem.frequencia || 'Mensal'}</Text>
                  <View style={[styles.detailRow, { marginTop: 4 }]}>
                    <Text style={styles.detailLabel}>Valor Recorrente:</Text>
                    <Text style={[styles.detailValueBold, { color: '#10b981', fontSize: 17 }]}>
                      R$ {Number(selectedItem.valor || selectedItem.valor_total || selectedItem.assinaturas?.valor || 0).toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.detailValue}>
                    Início: {selectedItem.data_inicio ? new Date(selectedItem.data_inicio).toLocaleDateString('pt-BR') : 'N/A'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Vencimento / Término: {selectedItem.data_fim ? new Date(selectedItem.data_fim).toLocaleDateString('pt-BR') : 'Indeterminado'}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Cliente</Text>
                  <Text style={styles.detailValue}>Nome: {selectedItem.clientes?.nome || 'Não identificado'}</Text>
                  <Text style={styles.detailValue}>Contato: {selectedItem.clientes?.telefone || selectedItem.clientes?.email || 'N/A'}</Text>
                </View>

                {selectedItem.observacoes && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeader}>Observações</Text>
                    <Text style={styles.detailValue}>{selectedItem.observacoes}</Text>
                  </View>
                )}

                {/* Operations Actions */}
                <View style={styles.modalActionGroup}>
                  {!['concluido', 'concluida', 'ativo', 'ativa'].includes(selectedItem.status.toLowerCase()) && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleActivate(selectedItem)}
                    >
                      <Text style={styles.actionButtonText}>✓ Ativar Assinatura</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => {
                      setExtendMonths('1');
                      setExtendModalVisible(true);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>📅 Prorrogar Vigência</Text>
                  </TouchableOpacity>

                  {!['cancelado', 'cancelada'].includes(selectedItem.status.toLowerCase()) && (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => {
                        setCancelReason('');
                        setCancelModalVisible(true);
                      }}
                    >
                      <Text style={styles.dangerActionText}>✕ Cancelar Contrato</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Prorrogar Sub-Modal */}
      <Modal visible={extendModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Prorrogar Vigência</Text>
            <Text style={styles.smallModalDesc}>Quantos meses deseja estender o contrato?</Text>
            <TextInput
              style={styles.formInput}
              keyboardType="numeric"
              placeholder="Ex: 6"
              placeholderTextColor="#9ca3af"
              value={extendMonths}
              onChangeText={setExtendMonths}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setExtendModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleExtendSubmit}>
                <Text style={styles.confirmBtnText}>Prorrogar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel Sub-Modal */}
      <Modal visible={cancelModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Cancelar Assinatura</Text>
            <Text style={styles.smallModalDesc}>Informe o motivo da rescisão ou cancelamento:</Text>
            <TextInput
              style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Motivo..."
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

      {/* New Subscription Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Assinatura</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Nome do Plano / Serviço *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Manutenção Preventiva Mensal"
                placeholderTextColor="#9ca3af"
                value={newForm.nome_plano}
                onChangeText={(t) => setNewForm({ ...newForm, nome_plano: t })}
              />

              <Text style={styles.formLabel}>Frequência de Faturamento</Text>
              <View style={styles.categorySelectRow}>
                {['mensal', 'trimestral', 'anual'].map((freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.categoryOption, newForm.frequencia === freq && styles.categoryOptionActive]}
                    onPress={() => setNewForm({ ...newForm, frequencia: freq })}
                  >
                    <Text style={[styles.categoryOptionText, newForm.frequencia === freq && styles.categoryOptionTextActive]}>
                      {freq.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Valor Recorrente (R$) *</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={newForm.valor}
                onChangeText={(t) => setNewForm({ ...newForm, valor: t })}
              />

              <Text style={styles.formLabel}>Observações do Contrato</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Detalhes sobre cláusulas ou itens cobertos..."
                placeholderTextColor="#9ca3af"
                value={newForm.observacoes}
                onChangeText={(t) => setNewForm({ ...newForm, observacoes: t })}
              />

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setNewModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleCreateAssinatura}>
                  <Text style={styles.confirmBtnText}>Salvar Assinatura</Text>
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
    borderLeftColor: '#7c3aed',
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
  cardFrequency: {
    fontSize: 10,
    color: '#7c3aed',
    fontWeight: 'bold',
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
  planText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  clientText: {
    fontSize: 13,
    color: '#4b5563',
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
    fontSize: 15,
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
    gap: 8,
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
    fontSize: 11,
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

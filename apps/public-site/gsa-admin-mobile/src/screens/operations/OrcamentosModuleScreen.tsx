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

export interface OrcamentoItem {
  id: string;
  codigo_orcamento?: string;
  cliente_id?: string;
  servico_id?: string;
  produto_id?: string;
  assinatura_id?: string;
  total: number;
  valor_servico?: number;
  valor_adicional?: number;
  desconto?: number;
  status: string;
  categoria?: string;
  data_criacao?: string;
  fase_negociacao?: string;
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
  servicos?: { nome?: string } | null;
  produtos?: { nome?: string } | null;
  assinaturas?: { nome?: string } | null;
}

export const OrcamentosModuleScreen = () => {
  const [data, setData] = useState<OrcamentoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'abertos' | 'aprovados' | 'cancelados'>('todos');

  // Selected item for details modal
  const [selectedItem, setSelectedItem] = useState<OrcamentoItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // New Quote modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome_cliente: '',
    categoria: 'servico' as 'servico' | 'produto' | 'assinatura',
    descricao: '',
    total: '',
    desconto: '',
  });

  // Renegotiate modal
  const [renegotiateModalVisible, setRenegotiateModalVisible] = useState(false);
  const [renegotiateValue, setRenegotiateValue] = useState('');

  // Cancel modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [saving, setSaving] = useState(false);

  const fetchOrcamentos = useCallback(async () => {
    try {
      let query = supabase
        .from('orcamentos')
        .select(`
          id,
          codigo_orcamento,
          cliente_id,
          servico_id,
          produto_id,
          assinatura_id,
          total,
          valor_servico,
          valor_adicional,
          desconto,
          status,
          categoria,
          data_criacao,
          fase_negociacao,
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
          servicos (
            nome
          ),
          produtos (
            nome
          ),
          assinaturas (
            nome
          )
        `)
        .order('data_criacao', { ascending: false })
        .limit(100);

      if (activeTab === 'abertos') {
        query = query.in('status', ['aberto', 'pendente', 'negociação', 'em revisão', 'pendência documentos']);
      } else if (activeTab === 'aprovados') {
        query = query.eq('status', 'aprovado');
      } else if (activeTab === 'cancelados') {
        query = query.eq('status', 'cancelado');
      }

      const { data: result, error } = await query;

      if (error) {
        console.error('Erro ao buscar orçamentos:', error);
        Alert.alert('Erro', 'Não foi possível carregar os orçamentos: ' + error.message);
      } else {
        setData((result as OrcamentoItem[]) || []);
      }
    } catch (err: any) {
      console.error('Exceção ao buscar orçamentos:', err);
      Alert.alert('Erro', 'Erro inesperado ao buscar dados.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrcamentos();
  };

  const filteredData = data.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const codigo = (item.codigo_orcamento || '').toLowerCase();
    const cliente = (item.clientes?.nome || '').toLowerCase();
    const doc = (item.clientes?.cpf || item.clientes?.cnpj || '').toLowerCase();
    const servico = (item.servicos?.nome || item.produtos?.nome || item.assinaturas?.nome || '').toLowerCase();
    return codigo.includes(term) || cliente.includes(term) || doc.includes(term) || servico.includes(term);
  });

  // Metrics
  const totalGeral = filteredData.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  const totalAbertosCount = data.filter((i) => ['aberto', 'pendente', 'negociação'].includes(i.status)).length;
  const totalAprovadosCount = data.filter((i) => i.status === 'aprovado').length;

  // Actions
  const handleApprove = async (item: OrcamentoItem) => {
    Alert.alert(
      'Aprovar Orçamento',
      `Deseja aprovar o orçamento ${item.codigo_orcamento || item.id.substring(0, 8)}? Isto gerará a Ordem de Serviço ou pedido correspondente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar Aprovação',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              // 1. Atualizar status do orçamento
              const { error: updateError } = await supabase
                .from('orcamentos')
                .update({ status: 'aprovado' })
                .eq('id', item.id);

              if (updateError) throw updateError;

              // 2. Se for categoria serviço, gerar Ordem de Serviço se ainda não existir
              if (item.categoria === 'servico' || !item.categoria) {
                const codigoOS = 'OS-' + Math.floor(100000 + Math.random() * 900000);
                await supabase.from('ordens_servico').insert([
                  {
                    codigo_os: codigoOS,
                    cliente_id: item.cliente_id,
                    orcamento_id: item.id,
                    status: 'andamento',
                    data_inicio: new Date().toISOString(),
                    valor_total: item.total || 0,
                  },
                ]);
              }

              Alert.alert('Sucesso', 'Orçamento aprovado com sucesso!');
              setDetailModalVisible(false);
              fetchOrcamentos();
            } catch (err: any) {
              Alert.alert('Erro ao aprovar', err.message || 'Falha na comunicação com o servidor.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleRenegotiateSubmit = async () => {
    if (!selectedItem) return;
    const numValue = Number(renegotiateValue.replace(',', '.'));
    if (isNaN(numValue) || numValue <= 0) {
      Alert.alert('Valor Inválido', 'Por favor informe um valor positivo válido.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({
          total: numValue,
          status: 'negociação',
          fase_negociacao: 'cliente',
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Proposta de renegociação salva com sucesso!');
      setRenegotiateModalVisible(false);
      setDetailModalVisible(false);
      fetchOrcamentos();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao renegociar.');
    } finally {
      setSaving(false);
    }
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
        .from('orcamentos')
        .update({
          status: 'cancelado',
          observacoes: `Cancelado: ${cancelReason}`,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Cancelado', 'Orçamento cancelado com sucesso.');
      setCancelModalVisible(false);
      setDetailModalVisible(false);
      fetchOrcamentos();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao cancelar.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrcamento = async () => {
    const totalNum = Number(newForm.total.replace(',', '.'));
    if (isNaN(totalNum) || totalNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor total válido.');
      return;
    }

    setSaving(true);
    try {
      const codigoGerado = 'ORC-' + Math.floor(100000 + Math.random() * 900000);
      const descontoNum = Number(newForm.desconto.replace(',', '.')) || 0;

      const { error } = await supabase.from('orcamentos').insert([
        {
          codigo_orcamento: codigoGerado,
          categoria: newForm.categoria,
          total: totalNum,
          desconto: descontoNum,
          status: 'aberto',
          observacoes: newForm.descricao,
          data_criacao: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Orçamento ${codigoGerado} cadastrado com sucesso!`);
      setNewModalVisible(false);
      setNewForm({
        nome_cliente: '',
        categoria: 'servico',
        descricao: '',
        total: '',
        desconto: '',
      });
      fetchOrcamentos();
    } catch (err: any) {
      Alert.alert('Erro ao criar', err.message || 'Não foi possível salvar o orçamento.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'aprovado':
      case 'pago':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'cancelado':
        return { bg: '#fee2e2', text: '#dc2626' };
      case 'negociação':
      case 'negociacao':
        return { bg: '#ede9fe', text: '#7c3aed' };
      default:
        return { bg: '#fef3c7', text: '#d97706' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Search and Action Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código, cliente ou serviço..."
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
          <Text style={styles.kpiLabel}>Abertos</Text>
          <Text style={[styles.kpiValue, { color: '#d97706' }]}>{totalAbertosCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Aprovados</Text>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{totalAprovadosCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Listado</Text>
          <Text style={[styles.kpiValue, { color: '#17345f' }]}>
            R$ {totalGeral >= 1000 ? `${(totalGeral / 1000).toFixed(1)}k` : totalGeral.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todos', 'abertos', 'aprovados', 'cancelados'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando orçamentos...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum orçamento encontrado</Text>
              <Text style={styles.emptySubtitle}>Tente mudar os filtros ou crie um novo orçamento.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusColor(item.status);
            const clientName = item.clientes?.nome || 'Cliente não identificado';
            const itemDesc = item.servicos?.nome || item.produtos?.nome || item.assinaturas?.nome || item.observacoes || 'Sem descrição';

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
                    <Text style={styles.cardCode}>{item.codigo_orcamento || `ID: ${item.id.substring(0, 8)}`}</Text>
                    <Text style={styles.cardCategory}>{item.categoria ? item.categoria.toUpperCase() : 'SERVIÇO'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                      {item.status ? item.status.toUpperCase() : 'ABERTO'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.clientText} numberOfLines={1}>
                    👤 {clientName}
                  </Text>
                  <Text style={styles.itemDescText} numberOfLines={1}>
                    📦 {itemDesc}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    {item.data_criacao ? new Date(item.data_criacao).toLocaleDateString('pt-BR') : 'Data não reg.'}
                  </Text>
                  <Text style={styles.cardTotal}>R$ {Number(item.total || 0).toFixed(2)}</Text>
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
              <Text style={styles.modalTitle}>Detalhes do Orçamento</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.codigo_orcamento || selectedItem.id}</Text>
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
                  <Text style={styles.sectionHeader}>Cliente</Text>
                  <Text style={styles.detailValue}>Nome: {selectedItem.clientes?.nome || 'Não informado'}</Text>
                  <Text style={styles.detailValue}>Documento: {selectedItem.clientes?.cpf || selectedItem.clientes?.cnpj || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Telefone: {selectedItem.clientes?.telefone || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Email: {selectedItem.clientes?.email || 'N/A'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Financeiro</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Total:</Text>
                    <Text style={[styles.detailValueBold, { color: '#10b981', fontSize: 18 }]}>
                      R$ {Number(selectedItem.total || 0).toFixed(2)}
                    </Text>
                  </View>
                  {Number(selectedItem.desconto || 0) > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Desconto aplicado:</Text>
                      <Text style={styles.detailValue}>R$ {Number(selectedItem.desconto).toFixed(2)}</Text>
                    </View>
                  )}
                  {selectedItem.observacoes ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.detailLabel}>Observações:</Text>
                      <Text style={styles.detailValue}>{selectedItem.observacoes}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Operations Action Buttons */}
                <View style={styles.modalActionGroup}>
                  {selectedItem.status !== 'aprovado' && selectedItem.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleApprove(selectedItem)}
                    >
                      <Text style={styles.actionButtonText}>✓ Aprovar e Gerar OS</Text>
                    </TouchableOpacity>
                  )}

                  {selectedItem.status !== 'aprovado' && selectedItem.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={() => {
                        setRenegotiateValue(String(selectedItem.total || ''));
                        setRenegotiateModalVisible(true);
                      }}
                    >
                      <Text style={styles.secondaryActionText}>🤝 Renegociar Valor</Text>
                    </TouchableOpacity>
                  )}

                  {selectedItem.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => {
                        setCancelReason('');
                        setCancelModalVisible(true);
                      }}
                    >
                      <Text style={styles.dangerActionText}>✕ Cancelar Orçamento</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Renegotiate Sub-Modal */}
      <Modal visible={renegotiateModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Renegociar Orçamento</Text>
            <Text style={styles.smallModalDesc}>Informe a contraproposta de valor total:</Text>
            <TextInput
              style={styles.formInput}
              keyboardType="numeric"
              placeholder="Ex: 1500.00"
              placeholderTextColor="#9ca3af"
              value={renegotiateValue}
              onChangeText={setRenegotiateValue}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRenegotiateModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                disabled={saving}
                onPress={handleRenegotiateSubmit}
              >
                <Text style={styles.confirmBtnText}>Salvar Proposta</Text>
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
            <Text style={styles.modalTitle}>Cancelar Orçamento</Text>
            <Text style={styles.smallModalDesc}>Informe a justificativa do cancelamento:</Text>
            <TextInput
              style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="Motivo do cancelamento..."
              placeholderTextColor="#9ca3af"
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setCancelModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: '#dc2626' }]}
                disabled={saving}
                onPress={handleCancelSubmit}
              >
                <Text style={styles.confirmBtnText}>Confirmar Cancelamento</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Quote Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Orçamento</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setNewModalVisible(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Categoria</Text>
              <View style={styles.categorySelectRow}>
                {(['servico', 'produto', 'assinatura'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryOption,
                      newForm.categoria === cat && styles.categoryOptionActive,
                    ]}
                    onPress={() => setNewForm({ ...newForm, categoria: cat })}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        newForm.categoria === cat && styles.categoryOptionTextActive,
                      ]}
                    >
                      {cat.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Valor Total (R$) *</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={newForm.total}
                onChangeText={(t) => setNewForm({ ...newForm, total: t })}
              />

              <Text style={styles.formLabel}>Desconto (R$)</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={newForm.desconto}
                onChangeText={(t) => setNewForm({ ...newForm, desconto: t })}
              />

              <Text style={styles.formLabel}>Descrição / Itens</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Detalhes do serviço ou produtos incluídos..."
                placeholderTextColor="#9ca3af"
                value={newForm.descricao}
                onChangeText={(t) => setNewForm({ ...newForm, descricao: t })}
              />

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setNewModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  disabled={saving}
                  onPress={handleCreateOrcamento}
                >
                  <Text style={styles.confirmBtnText}>Salvar Orçamento</Text>
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
    borderLeftColor: '#17345f',
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
  cardCategory: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
  itemDescText: {
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

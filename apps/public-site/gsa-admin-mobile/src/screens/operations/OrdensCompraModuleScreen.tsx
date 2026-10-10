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

export interface OrdensCompraItem {
  id: string;
  codigo_ordem?: string;
  cliente_id?: string;
  produto_id?: string;
  status: string;
  quantidade?: number;
  valor_unitario?: number;
  valor_total?: number;
  codigo_rastreio?: string;
  transportadora?: string;
  data_criacao?: string;
  observacoes?: string;
  produtos?: {
    id?: string;
    nome?: string;
    codigo_produto?: string;
    valor?: number;
  } | null;
  clientes?: {
    id?: string;
    nome?: string;
    email?: string;
    telefone?: string;
  } | null;
  orcamentos?: {
    id?: string;
    codigo_orcamento?: string;
    endereco_entrega?: string;
    total?: number;
  } | null;
  faturas?: {
    id?: string;
    status?: string;
    codigo_fatura?: string;
    valor_total?: number;
  } | null;
}

export const OrdensCompraModuleScreen = () => {
  const [data, setData] = useState<OrdensCompraItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'processamento' | 'expedicao' | 'concluido' | 'cancelado'>('todos');

  // Selected item
  const [selectedItem, setSelectedItem] = useState<OrdensCompraItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Dispatch / Tracking Modal
  const [dispatchModalVisible, setDispatchModalVisible] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [courierName, setCourierName] = useState('');

  // Cancel Modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // New Purchase Order Modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome_produto: '',
    quantidade: '1',
    valor_total: '',
    endereco_entrega: '',
    observacoes: '',
  });

  const [saving, setSaving] = useState(false);

  const fetchOrdens = useCallback(async () => {
    try {
      let query = supabase
        .from('ordens_compra')
        .select(`
          id,
          codigo_ordem,
          cliente_id,
          produto_id,
          status,
          quantidade,
          valor_unitario,
          valor_total,
          codigo_rastreio,
          transportadora,
          data_criacao,
          observacoes,
          produtos (
            id,
            nome,
            codigo_produto,
            valor
          ),
          clientes (
            id,
            nome,
            email,
            telefone
          ),
          orcamentos (
            id,
            codigo_orcamento,
            endereco_entrega,
            total
          ),
          faturas (
            id,
            status,
            codigo_fatura,
            valor_total
          )
        `)
        .order('data_criacao', { ascending: false })
        .limit(100);

      if (activeTab === 'processamento') {
        query = query.in('status', ['em_analise', 'pago', 'aprovado', 'pendente']);
      } else if (activeTab === 'expedicao') {
        query = query.in('status', ['em_expedicao', 'em_transporte', 'despachado']);
      } else if (activeTab === 'concluido') {
        query = query.in('status', ['concluido', 'entregue']);
      } else if (activeTab === 'cancelado') {
        query = query.eq('status', 'cancelado');
      }

      const { data: result, error } = await query;

      if (error) {
        console.warn('Silencioso: erro ao buscar ordens de compra:', error.message);
      } else {
        setData((result as OrdensCompraItem[]) || []);
      }
    } catch (err: any) {
      console.warn('Silencioso: exceção ao buscar ordens de compra:', err);
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
    const produto = (item.produtos?.nome || item.observacoes || '').toLowerCase();
    const cliente = (item.clientes?.nome || '').toLowerCase();
    const rastreio = (item.codigo_rastreio || '').toLowerCase();
    return codigo.includes(term) || produto.includes(term) || cliente.includes(term) || rastreio.includes(term);
  });

  // KPIs
  const procCount = data.filter((i) => ['em_analise', 'pago', 'aprovado', 'pendente'].includes(i.status)).length;
  const transpCount = data.filter((i) => ['em_expedicao', 'em_transporte', 'despachado'].includes(i.status)).length;
  const concCount = data.filter((i) => ['concluido', 'entregue'].includes(i.status)).length;

  const handleDispatchSubmit = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ordens_compra')
        .update({
          status: 'em_transporte',
          codigo_rastreio: trackingCode || selectedItem.codigo_rastreio,
          transportadora: courierName || selectedItem.transportadora || 'Correios/Transportadora',
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Pedido despachado e rastreio atualizado!');
      setDispatchModalVisible(false);
      setDetailModalVisible(false);
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao despachar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeliverSubmit = async (item: OrdensCompraItem) => {
    Alert.alert('Confirmar Entrega', 'Marcar este pedido como Entregue/Concluído?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: 'default',
        onPress: async () => {
          setSaving(true);
          try {
            const { error } = await supabase
              .from('ordens_compra')
              .update({ status: 'concluido' })
              .eq('id', item.id);

            if (error) throw error;

            Alert.alert('Sucesso', 'Pedido marcado como Entregue com sucesso!');
            setDetailModalVisible(false);
            fetchOrdens();
          } catch (err: any) {
            Alert.alert('Erro', err.message || 'Falha ao confirmar entrega.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
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
        .from('ordens_compra')
        .update({
          status: 'cancelado',
          observacoes: `Cancelado: ${cancelReason}`,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Ordem de compra cancelada com sucesso.');
      setCancelModalVisible(false);
      setDetailModalVisible(false);
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao cancelar pedido.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrdemCompra = async () => {
    const valorNum = Number(newForm.valor_total.replace(',', '.'));
    const qtdNum = parseInt(newForm.quantidade, 10) || 1;
    if (isNaN(valorNum) || valorNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor total válido.');
      return;
    }

    setSaving(true);
    try {
      const codigoGerado = 'OC-' + Math.floor(100000 + Math.random() * 900000);

      const { error } = await supabase.from('ordens_compra').insert([
        {
          codigo_ordem: codigoGerado,
          status: 'em_analise',
          quantidade: qtdNum,
          valor_total: valorNum,
          valor_unitario: valorNum / qtdNum,
          data_criacao: new Date().toISOString(),
          observacoes: newForm.nome_produto
            ? `Produto: ${newForm.nome_produto}. Endereço: ${newForm.endereco_entrega}. Obs: ${newForm.observacoes}`
            : newForm.observacoes,
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Ordem de Compra ${codigoGerado} criada!`);
      setNewModalVisible(false);
      setNewForm({
        nome_produto: '',
        quantidade: '1',
        valor_total: '',
        endereco_entrega: '',
        observacoes: '',
      });
      fetchOrdens();
    } catch (err: any) {
      Alert.alert('Erro ao criar pedido', err.message || 'Falha ao salvar no banco.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'concluido':
      case 'entregue':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'cancelado':
        return { bg: '#fee2e2', text: '#dc2626' };
      case 'em_expedicao':
      case 'em_transporte':
      case 'despachado':
        return { bg: '#ede9fe', text: '#7c3aed' };
      default:
        return { bg: '#fef3c7', text: '#d97706' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar pedido por código, produto ou rastreio..."
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
          <Text style={styles.kpiLabel}>Processamento</Text>
          <Text style={[styles.kpiValue, { color: '#d97706' }]}>{procCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Em Transporte</Text>
          <Text style={[styles.kpiValue, { color: '#7c3aed' }]}>{transpCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Entregues</Text>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{concCount}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todos', 'processamento', 'expedicao', 'concluido', 'cancelado'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                {tab === 'todos'
                  ? 'Todos'
                  : tab === 'processamento'
                  ? 'Processando'
                  : tab === 'expedicao'
                  ? 'Expedição'
                  : tab === 'concluido'
                  ? 'Entregues'
                  : 'Cancelados'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Pedido</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando ordens de compra...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum pedido de compra encontrado</Text>
              <Text style={styles.emptySubtitle}>Ajuste os filtros ou registre um novo pedido de compra.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusColor(item.status);
            const clientName = item.clientes?.nome || 'Cliente não informado';
            const productName = item.produtos?.nome || item.observacoes || 'Produto sob encomenda';
            const valor = item.valor_total || item.produtos?.valor || 0;

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
                    <Text style={styles.cardCode}>{item.codigo_ordem || `PED #${item.id.substring(0, 6)}`}</Text>
                    <Text style={styles.cardQuantity}>Qtd: {item.quantidade || 1} un.</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.productText} numberOfLines={1}>
                    📦 {productName}
                  </Text>
                  <Text style={styles.clientText} numberOfLines={1}>
                    👤 {clientName}
                  </Text>
                  {item.codigo_rastreio && (
                    <Text style={styles.trackingText} numberOfLines={1}>
                      🚚 Rastreio: {item.codigo_rastreio}
                    </Text>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    {item.data_criacao ? new Date(item.data_criacao).toLocaleDateString('pt-BR') : 'Hoje'}
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
              <Text style={styles.modalTitle}>Detalhes do Pedido de Compra</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código do Pedido:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.codigo_ordem || selectedItem.id}</Text>
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
                  <Text style={styles.sectionHeader}>Produto & Quantidade</Text>
                  <Text style={styles.detailValue}>Item: {selectedItem.produtos?.nome || 'Sob demanda'}</Text>
                  <Text style={styles.detailValue}>Quantidade: {selectedItem.quantidade || 1} unidade(s)</Text>
                  <View style={[styles.detailRow, { marginTop: 4 }]}>
                    <Text style={styles.detailLabel}>Total Pedido:</Text>
                    <Text style={[styles.detailValueBold, { color: '#10b981', fontSize: 18 }]}>
                      R$ {Number(selectedItem.valor_total || selectedItem.produtos?.valor || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Entrega & Logística</Text>
                  <Text style={styles.detailValue}>
                    Destinatário: {selectedItem.clientes?.nome || 'Não identificado'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Endereço: {selectedItem.orcamentos?.endereco_entrega || 'Endereço padrão do cliente'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Transportadora: {selectedItem.transportadora || 'A definir'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Código Rastreio: {selectedItem.codigo_rastreio || 'Aguardando despacho'}
                  </Text>
                </View>

                {selectedItem.observacoes && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionHeader}>Observações</Text>
                    <Text style={styles.detailValue}>{selectedItem.observacoes}</Text>
                  </View>
                )}

                {/* Operations Actions */}
                <View style={styles.modalActionGroup}>
                  {selectedItem.status !== 'concluido' && selectedItem.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={() => {
                        setTrackingCode(selectedItem.codigo_rastreio || '');
                        setCourierName(selectedItem.transportadora || '');
                        setDispatchModalVisible(true);
                      }}
                    >
                      <Text style={styles.secondaryActionText}>🚚 Atualizar Rastreio / Despachar</Text>
                    </TouchableOpacity>
                  )}

                  {selectedItem.status !== 'concluido' && selectedItem.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleDeliverSubmit(selectedItem)}
                    >
                      <Text style={styles.actionButtonText}>✓ Confirmar Entrega</Text>
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
                      <Text style={styles.dangerActionText}>✕ Cancelar Pedido</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Dispatch / Tracking Modal */}
      <Modal visible={dispatchModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Despacho & Rastreio</Text>
            <Text style={styles.smallModalDesc}>Informe os dados de envio do produto:</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Transportadora (Ex: Correios, Jadlog)..."
              placeholderTextColor="#9ca3af"
              value={courierName}
              onChangeText={setCourierName}
            />
            <TextInput
              style={[styles.formInput, { marginTop: 10 }]}
              placeholder="Código de Rastreio (Ex: BR123456789)..."
              placeholderTextColor="#9ca3af"
              value={trackingCode}
              onChangeText={setTrackingCode}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDispatchModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleDispatchSubmit}>
                <Text style={styles.confirmBtnText}>Confirmar Despacho</Text>
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
            <Text style={styles.modalTitle}>Cancelar Pedido</Text>
            <Text style={styles.smallModalDesc}>Informe a justificativa do cancelamento:</Text>
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

      {/* New Purchase Order Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Pedido de Compra</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Nome do Produto *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Teclado Mecânico Pro"
                placeholderTextColor="#9ca3af"
                value={newForm.nome_produto}
                onChangeText={(t) => setNewForm({ ...newForm, nome_produto: t })}
              />

              <Text style={styles.formLabel}>Quantidade</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor="#9ca3af"
                value={newForm.quantidade}
                onChangeText={(t) => setNewForm({ ...newForm, quantidade: t })}
              />

              <Text style={styles.formLabel}>Valor Total (R$) *</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                value={newForm.valor_total}
                onChangeText={(t) => setNewForm({ ...newForm, valor_total: t })}
              />

              <Text style={styles.formLabel}>Endereço de Entrega</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Rua, Número, Bairro, Cidade - UF"
                placeholderTextColor="#9ca3af"
                value={newForm.endereco_entrega}
                onChangeText={(t) => setNewForm({ ...newForm, endereco_entrega: t })}
              />

              <Text style={styles.formLabel}>Observações Gerais</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Detalhes adicionais do pedido..."
                placeholderTextColor="#9ca3af"
                value={newForm.observacoes}
                onChangeText={(t) => setNewForm({ ...newForm, observacoes: t })}
              />

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setNewModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleCreateOrdemCompra}>
                  <Text style={styles.confirmBtnText}>Salvar Pedido</Text>
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
    borderLeftColor: '#f59e0b',
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
  cardQuantity: {
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
  productText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  clientText: {
    fontSize: 13,
    color: '#4b5563',
  },
  trackingText: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: '600',
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

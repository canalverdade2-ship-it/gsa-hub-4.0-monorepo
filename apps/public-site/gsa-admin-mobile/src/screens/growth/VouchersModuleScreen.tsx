import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface Voucher {
  id: string;
  codigo_voucher: string;
  cliente_id?: string | null;
  valor: number;
  data_criacao: string;
  data_validade?: string | null;
  status: 'ativo' | 'usado' | 'cancelado' | string;
  origem?: string | null;
  motivo_cancelamento?: string | null;
  clientes?: { nome: string; email?: string; telefone?: string };
}

export interface VoucherHistoryItem {
  data: string;
  valor: number;
  tipo: string;
  referencia?: string;
  cliente?: string;
}

export const VouchersModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ativos' | 'usados' | 'cancelados'>('ativos');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    cliente_id: '',
    valor: '',
    validade_dias: '30',
    origem: 'promocional',
  });
  const [savingCreate, setSavingCreate] = useState(false);

  // Detail / History Modal
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<VoucherHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Cancel Modal
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [voucherToCancel, setVoucherToCancel] = useState<Voucher | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*, clientes(nome, email, telefone)')
        .order('data_criacao', { ascending: false });

      if (error) {
        const { data: simpleData } = await supabase
          .from('vouchers')
          .select('*')
          .order('data_criacao', { ascending: false });
        setVouchers(simpleData || []);
      } else {
        setVouchers(data || []);
      }

      // Clientes options
      const { data: cliData } = await supabase
        .from('clientes')
        .select('id, nome')
        .order('nome', { ascending: true })
        .limit(100);

      if (cliData) setClientes(cliData);
    } catch (e: any) {
      console.warn('VouchersModule load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Tab mapping
  const currentStatusMap: Record<string, string> = {
    ativos: 'ativo',
    usados: 'usado',
    cancelados: 'cancelado',
  };

  const filteredVouchers = useMemo(() => {
    const targetStatus = currentStatusMap[activeTab] || 'ativo';
    return vouchers.filter((v) => {
      const matchTab = v.status === targetStatus;
      const matchSearch =
        !search ||
        v.codigo_voucher?.toLowerCase().includes(search.toLowerCase()) ||
        v.clientes?.nome?.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [vouchers, activeTab, search]);

  const countAtivos = vouchers.filter((v) => v.status === 'ativo').length;
  const countUsados = vouchers.filter((v) => v.status === 'usado').length;
  const countCancelados = vouchers.filter((v) => v.status === 'cancelado').length;

  // Open Details & fetch history
  const handleOpenDetails = async (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setIsDetailOpen(true);
    setLoadingHistory(true);
    try {
      // 1. Fetch from pagamentos
      const { data: payData } = await supabase
        .from('pagamentos')
        .select('data_pagamento, valor, faturas(codigo_fatura, clientes(nome))')
        .eq('voucher_id', voucher.id);

      // 2. Fetch from extrato_financeiro
      const { data: extratoData } = await supabase
        .from('extrato_financeiro')
        .select('data, valor, descricao, clientes(nome)')
        .or(`referencia_id.eq.${voucher.id},descricao.ilike.%${voucher.codigo_voucher}%`);

      const combined: VoucherHistoryItem[] = [];
      if (payData) {
        payData.forEach((p: any) => {
          combined.push({
            data: p.data_pagamento,
            valor: Number(p.valor || 0),
            tipo: 'Fatura de Serviço',
            referencia: p.faturas?.codigo_fatura,
            cliente: p.faturas?.clientes?.nome,
          });
        });
      }

      if (extratoData) {
        extratoData.forEach((e: any) => {
          combined.push({
            data: e.data,
            valor: Number(e.valor || 0),
            tipo: 'Abatimento Carteira',
            referencia: e.descricao,
            cliente: e.clientes?.nome,
          });
        });
      }

      setHistoryItems(combined);
    } catch (e: any) {
      console.warn('Error fetching voucher history:', e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Create Voucher
  const handleSaveCreate = async () => {
    const valNum = Number(newForm.valor.replace(',', '.'));
    if (!valNum || valNum <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido em Reais.');
      return;
    }

    const dias = parseInt(newForm.validade_dias, 10) || 30;
    const validade = new Date();
    validade.setDate(validade.getDate() + dias);

    // Generate random VOUC-XXXX
    const code = 'VOUC-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    setSavingCreate(true);
    try {
      const { error } = await supabase.from('vouchers').insert([
        {
          codigo_voucher: code,
          cliente_id: newForm.cliente_id || null,
          valor: valNum,
          data_criacao: new Date().toISOString(),
          data_validade: validade.toISOString(),
          status: 'ativo',
          origem: newForm.origem,
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Voucher gerado: ${code} no valor de R$ ${valNum.toFixed(2)}`);
      setIsCreateOpen(false);
      setNewForm({
        cliente_id: '',
        valor: '',
        validade_dias: '30',
        origem: 'promocional',
      });
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao gerar voucher.');
    } finally {
      setSavingCreate(false);
    }
  };

  // Cancel Voucher
  const handleSaveCancel = async () => {
    if (!voucherToCancel) return;
    if (!cancelReason.trim()) {
      Alert.alert('Atenção', 'Informe o motivo do cancelamento.');
      return;
    }

    setSavingCancel(true);
    try {
      const { error } = await supabase
        .from('vouchers')
        .update({
          status: 'cancelado',
          motivo_cancelamento: cancelReason.trim(),
        })
        .eq('id', voucherToCancel.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Voucher cancelado com sucesso.');
      setIsCancelOpen(false);
      setVoucherToCancel(null);
      setCancelReason('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao cancelar voucher.');
    } finally {
      setSavingCancel(false);
    }
  };

  const renderBadge = (status: string) => {
    let bg = '#ecfdf5';
    let text = '#059669';
    if (status === 'usado') {
      bg = '#eff6ff';
      text = '#2563eb';
    } else if (status === 'cancelado') {
      bg = '#fef2f2';
      text = '#dc2626';
    }
    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>DESCONTOS & BENEFÍCIOS</Text>
            <Text style={styles.headerTitle}>Vouchers Digitais</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => setIsCreateOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Gerar novo voucher"
            >
              <Text style={styles.newButtonText}>+ Gerar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={refreshing}
            >
              <Text style={styles.refreshButtonText}>{refreshing ? '...' : '↻'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'ativos' && styles.tabItemActive]}
            onPress={() => setActiveTab('ativos')}
          >
            <Text style={[styles.tabText, activeTab === 'ativos' && styles.tabTextActive]}>
              Ativos ({countAtivos})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'usados' && styles.tabItemActive]}
            onPress={() => setActiveTab('usados')}
          >
            <Text style={[styles.tabText, activeTab === 'usados' && styles.tabTextActive]}>
              Usados ({countUsados})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'cancelados' && styles.tabItemActive]}
            onPress={() => setActiveTab('cancelados')}
          >
            <Text style={[styles.tabText, activeTab === 'cancelados' && styles.tabTextActive]}>
              Cancelados ({countCancelados})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por código do voucher ou cliente..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Carregando vouchers...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredVouchers}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardCode}>{item.codigo_voucher}</Text>
                    <Text style={styles.cardSubtitle}>
                      {item.clientes?.nome ? `Cliente: ${item.clientes.nome}` : 'Voucher Avulso / Geral'}
                    </Text>
                  </View>
                  {renderBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Valor de Desconto:</Text>
                    <Text style={styles.cardValueText}>R$ {Number(item.valor || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Validade:</Text>
                    <Text style={styles.cardColValue}>
                      {item.data_validade
                        ? new Date(item.data_validade).toLocaleDateString('pt-BR')
                        : 'Sem limite'}
                    </Text>
                  </View>
                </View>

                {item.motivo_cancelamento ? (
                  <Text style={styles.cancelNotice}>Motivo: {item.motivo_cancelamento}</Text>
                ) : null}

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButtonOutline}
                    onPress={() => handleOpenDetails(item)}
                  >
                    <Text style={styles.actionButtonOutlineText}>Ver Histórico</Text>
                  </TouchableOpacity>

                  {item.status === 'ativo' && (
                    <TouchableOpacity
                      style={styles.actionButtonDanger}
                      onPress={() => {
                        setVoucherToCancel(item);
                        setCancelReason('');
                        setIsCancelOpen(true);
                      }}
                    >
                      <Text style={styles.actionButtonDangerText}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhum voucher encontrado</Text>
                <Text style={styles.emptySubtitle}>Não há vouchers registrados nesta visualização.</Text>
              </View>
            }
          />
        )}

        {/* Modal: Gerar Novo Voucher */}
        <Modal visible={isCreateOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Emitir Novo Voucher Digital</Text>
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={styles.inputLabel}>Cliente Beneficiário (Opcional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  <TouchableOpacity
                    style={[styles.chipModal, !newForm.cliente_id && styles.chipModalActive]}
                    onPress={() => setNewForm({ ...newForm, cliente_id: '' })}
                  >
                    <Text
                      style={[
                        styles.chipModalText,
                        !newForm.cliente_id && styles.chipModalTextActive,
                      ]}
                    >
                      Avulso / Qualquer Cliente
                    </Text>
                  </TouchableOpacity>
                  {clientes.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chipModal, newForm.cliente_id === c.id && styles.chipModalActive]}
                      onPress={() => setNewForm({ ...newForm, cliente_id: c.id })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          newForm.cliente_id === c.id && styles.chipModalTextActive,
                        ]}
                      >
                        {c.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Valor do Desconto (R$) *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newForm.valor}
                  onChangeText={(t) => setNewForm({ ...newForm, valor: t })}
                  keyboardType="numeric"
                  placeholder="Ex: 50.00"
                />

                <Text style={styles.inputLabel}>Prazo de Validade (Dias)</Text>
                <TextInput
                  style={styles.formInput}
                  value={newForm.validade_dias}
                  onChangeText={(t) => setNewForm({ ...newForm, validade_dias: t })}
                  keyboardType="numeric"
                  placeholder="30"
                />

                <Text style={styles.inputLabel}>Origem da Emissão</Text>
                <View style={styles.chipRowModal}>
                  {['promocional', 'sac', 'parceria', 'fidelidade'].map((orig) => (
                    <TouchableOpacity
                      key={orig}
                      style={[styles.chipModal, newForm.origem === orig && styles.chipModalActive]}
                      onPress={() => setNewForm({ ...newForm, origem: orig })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          newForm.origem === orig && styles.chipModalTextActive,
                        ]}
                      >
                        {orig.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setIsCreateOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleSaveCreate}
                  disabled={savingCreate}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingCreate ? 'Gerando...' : 'Criar Voucher'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Detalhes e Histórico */}
        <Modal visible={isDetailOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Histórico de Utilização</Text>
              {selectedVoucher && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{selectedVoucher.codigo_voucher}</Text>
                  <Text style={styles.summarySub}>
                    Valor: R$ {Number(selectedVoucher.valor || 0).toFixed(2)} • Status:{' '}
                    {selectedVoucher.status.toUpperCase()}
                  </Text>
                </View>
              )}

              {loadingHistory ? (
                <ActivityIndicator size="small" color="#059669" style={{ marginVertical: 20 }} />
              ) : historyItems.length > 0 ? (
                <ScrollView style={{ maxHeight: 250 }}>
                  {historyItems.map((h, idx) => (
                    <View key={idx} style={styles.historyRow}>
                      <View>
                        <Text style={styles.historyTipo}>{h.tipo}</Text>
                        <Text style={styles.historySub}>
                          {h.referencia} • {h.cliente || 'Cliente'}
                        </Text>
                      </View>
                      <Text style={styles.historyValor}>- R$ {h.valor.toFixed(2)}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.emptySubText}>
                  Nenhum registro de utilização encontrado no extrato financeiro.
                </Text>
              )}

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setIsDetailOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Cancelar Voucher */}
        <Modal visible={isCancelOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={[styles.modalTitle, { color: '#dc2626' }]}>Cancelar Voucher</Text>
              {voucherToCancel && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{voucherToCancel.codigo_voucher}</Text>
                  <Text style={styles.summarySub}>
                    Valor: R$ {Number(voucherToCancel.valor || 0).toFixed(2)}
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Motivo do Cancelamento *</Text>
              <TextInput
                style={[styles.formInput, { height: 80 }]}
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Informe a razão técnica ou comercial..."
                multiline
              />

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setIsCancelOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButtonSave, { backgroundColor: '#dc2626' }]}
                  onPress={handleSaveCancel}
                  disabled={savingCancel}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingCancel ? 'Cancelando...' : 'Confirmar Cancelamento'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  newButton: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 20,
    color: '#334155',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabItem: {
    paddingVertical: 10,
    marginRight: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#059669',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#059669',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    height: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardCode: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardCol: {
    flex: 1,
  },
  cardColRight: {
    alignItems: 'flex-end',
  },
  cardColLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  cardValueText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  cardColValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    marginTop: 2,
  },
  cancelNotice: {
    fontSize: 11,
    color: '#b91c1c',
    backgroundColor: '#fef2f2',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionButtonOutline: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonOutlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  actionButtonDanger: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDangerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  summarySub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  chipRowModal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  chipModal: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  chipModalActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#059669',
  },
  chipModalText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  chipModalTextActive: {
    color: '#059669',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalButtonCancel: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  modalButtonSave: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyTipo: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  historySub: {
    fontSize: 10,
    color: '#64748b',
  },
  historyValor: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  emptySubText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginVertical: 16,
  },
});

export default VouchersModuleScreen;

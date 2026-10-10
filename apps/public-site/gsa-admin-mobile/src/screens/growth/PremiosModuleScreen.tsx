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

export interface Premio {
  id: string;
  cliente_id: string;
  codigo_premio: string;
  nome: string;
  tipo: 'servico' | 'produto' | 'assinatura' | string;
  descricao: string;
  data_cadastro: string;
  data_validade: string;
  status: 'pendente' | 'resgatado' | 'cancelado' | string;
  data_resgate?: string;
  data_cancelamento?: string;
  motivo_cancelamento?: string;
  forma_resgate?: 'online' | 'fisico' | null;
  instrucoes_resgate?: string | null;
  clientes?: { nome: string; codigo_cliente?: string; telefone?: string };
}

export interface ClienteOption {
  id: string;
  nome: string;
  codigo_cliente?: string;
}

export const PremiosModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pendente' | 'resgatado' | 'cancelado'>('pendente');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [premios, setPremios] = useState<Premio[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPremio, setNewPremio] = useState({
    cliente_id: '',
    nome: '',
    tipo: 'servico' as 'servico' | 'produto' | 'assinatura',
    descricao: '',
    validade_dias: '30',
  });
  const [savingCreate, setSavingCreate] = useState(false);

  // Redeem Modal
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const [selectedForRedeem, setSelectedForRedeem] = useState<Premio | null>(null);
  const [formaResgate, setFormaResgate] = useState<'online' | 'fisico'>('online');
  const [instrucoesResgate, setInstrucoesResgate] = useState('');
  const [savingRedeem, setSavingRedeem] = useState(false);

  // Cancel Modal
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [selectedForCancel, setSelectedForCancel] = useState<Premio | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Check & cancel expired pendentes
      const now = new Date().toISOString();
      const { data: expirados } = await supabase
        .from('cliente_premios')
        .select('id')
        .eq('status', 'pendente')
        .lt('data_validade', now);

      if (expirados && expirados.length > 0) {
        await supabase
          .from('cliente_premios')
          .update({
            status: 'cancelado',
            data_cancelamento: now,
            motivo_cancelamento: 'Prazo para resgate expirado.',
          })
          .in('id', expirados.map((p) => p.id));
      }

      // 2. Fetch Premios with Client Join
      const { data, error } = await supabase
        .from('cliente_premios')
        .select('*, clientes(nome, codigo_cliente, telefone)')
        .order('data_cadastro', { ascending: false });

      if (error) {
        // Fallback without join
        const { data: simpleData } = await supabase
          .from('cliente_premios')
          .select('*')
          .order('data_cadastro', { ascending: false });
        setPremios(simpleData || []);
      } else {
        setPremios(data || []);
      }

      // 3. Fetch Clientes list for creation
      const { data: cliData } = await supabase
        .from('clientes')
        .select('id, nome, codigo_cliente')
        .order('nome', { ascending: true })
        .limit(100);

      if (cliData) {
        setClientes(cliData);
      }
    } catch (e: any) {
      console.warn('PremiosModule load error:', e.message);
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

  // Filtered list
  const filteredList = useMemo(() => {
    return premios.filter((p) => {
      const matchTab = p.status === activeTab;
      const matchSearch =
        !search ||
        p.nome?.toLowerCase().includes(search.toLowerCase()) ||
        p.codigo_premio?.toLowerCase().includes(search.toLowerCase()) ||
        p.clientes?.nome?.toLowerCase().includes(search.toLowerCase());
      return matchTab && matchSearch;
    });
  }, [premios, activeTab, search]);

  // Counts
  const countPendentes = premios.filter((p) => p.status === 'pendente').length;
  const countResgatados = premios.filter((p) => p.status === 'resgatado').length;
  const countCancelados = premios.filter((p) => p.status === 'cancelado').length;

  // Create Premio
  const handleSaveCreate = async () => {
    if (!newPremio.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do prêmio.');
      return;
    }
    if (!newPremio.cliente_id) {
      Alert.alert('Atenção', 'Selecione um cliente beneficiário.');
      return;
    }

    const dias = parseInt(newPremio.validade_dias, 10) || 30;
    const validade = new Date();
    validade.setDate(validade.getDate() + dias);

    // Generate code PREM-XXXX
    const code = 'PREM-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    setSavingCreate(true);
    try {
      const { error } = await supabase.from('cliente_premios').insert([
        {
          cliente_id: newPremio.cliente_id,
          codigo_premio: code,
          nome: newPremio.nome.trim(),
          tipo: newPremio.tipo,
          descricao: newPremio.descricao.trim() || 'Prêmio concedido pelo GSA HUB',
          data_cadastro: new Date().toISOString(),
          data_validade: validade.toISOString(),
          status: 'pendente',
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Prêmio cadastrado com código ${code}!`);
      setIsCreateOpen(false);
      setNewPremio({
        cliente_id: '',
        nome: '',
        tipo: 'servico',
        descricao: '',
        validade_dias: '30',
      });
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao cadastrar prêmio.');
    } finally {
      setSavingCreate(false);
    }
  };

  // Redeem Premio
  const handleSaveRedeem = async () => {
    if (!selectedForRedeem) return;
    setSavingRedeem(true);
    try {
      const { error } = await supabase
        .from('cliente_premios')
        .update({
          status: 'resgatado',
          data_resgate: new Date().toISOString(),
          forma_resgate: formaResgate,
          instrucoes_resgate: instrucoesResgate.trim() || null,
        })
        .eq('id', selectedForRedeem.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Prêmio resgatado com sucesso!');
      setIsRedeemOpen(false);
      setSelectedForRedeem(null);
      setInstrucoesResgate('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao resgatar prêmio.');
    } finally {
      setSavingRedeem(false);
    }
  };

  // Cancel Premio
  const handleSaveCancel = async () => {
    if (!selectedForCancel) return;
    if (!cancelMotivo.trim()) {
      Alert.alert('Atenção', 'Informe o motivo do cancelamento.');
      return;
    }
    setSavingCancel(true);
    try {
      const { error } = await supabase
        .from('cliente_premios')
        .update({
          status: 'cancelado',
          data_cancelamento: new Date().toISOString(),
          motivo_cancelamento: cancelMotivo.trim(),
        })
        .eq('id', selectedForCancel.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Prêmio cancelado com sucesso.');
      setIsCancelOpen(false);
      setSelectedForCancel(null);
      setCancelMotivo('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao cancelar prêmio.');
    } finally {
      setSavingCancel(false);
    }
  };

  const renderBadge = (status: string) => {
    let bg = '#f1f5f9';
    let text = '#475569';
    if (status === 'pendente') {
      bg = '#eff6ff';
      text = '#2563eb';
    } else if (status === 'resgatado') {
      bg = '#ecfdf5';
      text = '#059669';
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
            <Text style={styles.headerSubtitle}>FIDELIDADE & PONTUAÇÃO</Text>
            <Text style={styles.headerTitle}>Catálogo de Prêmios</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => setIsCreateOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Conceder novo prêmio"
            >
              <Text style={styles.newButtonText}>+ Novo</Text>
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
            style={[styles.tabItem, activeTab === 'pendente' && styles.tabItemActive]}
            onPress={() => setActiveTab('pendente')}
          >
            <Text style={[styles.tabText, activeTab === 'pendente' && styles.tabTextActive]}>
              Pendentes ({countPendentes})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'resgatado' && styles.tabItemActive]}
            onPress={() => setActiveTab('resgatado')}
          >
            <Text style={[styles.tabText, activeTab === 'resgatado' && styles.tabTextActive]}>
              Resgatados ({countResgatados})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'cancelado' && styles.tabItemActive]}
            onPress={() => setActiveTab('cancelado')}
          >
            <Text style={[styles.tabText, activeTab === 'cancelado' && styles.tabTextActive]}>
              Cancelados ({countCancelados})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por prêmio, código ou cliente..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* List Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Carregando prêmios...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.nome}</Text>
                    <Text style={styles.cardSubtitle}>
                      Código: {item.codigo_premio} • Tipo: {String(item.tipo).toUpperCase()}
                    </Text>
                  </View>
                  {renderBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Beneficiário:</Text>
                    <Text style={styles.cardColValue}>{item.clientes?.nome || 'Cliente GSA'}</Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Validade:</Text>
                    <Text style={[styles.cardColValue, { fontWeight: 'bold' }]}>
                      {item.data_validade
                        ? new Date(item.data_validade).toLocaleDateString('pt-BR')
                        : '—'}
                    </Text>
                  </View>
                </View>

                {item.descricao ? (
                  <Text style={styles.descText} numberOfLines={2}>
                    {item.descricao}
                  </Text>
                ) : null}

                {item.status === 'resgatado' && (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoBoxText}>
                      Resgatado em:{' '}
                      {item.data_resgate ? new Date(item.data_resgate).toLocaleDateString('pt-BR') : '—'}{' '}
                      ({item.forma_resgate || 'online'})
                    </Text>
                    {item.instrucoes_resgate ? (
                      <Text style={styles.infoBoxSub}>Instruções: {item.instrucoes_resgate}</Text>
                    ) : null}
                  </View>
                )}

                {item.status === 'cancelado' && (
                  <View style={[styles.infoBox, { backgroundColor: '#fef2f2' }]}>
                    <Text style={[styles.infoBoxText, { color: '#b91c1c' }]}>
                      Motivo: {item.motivo_cancelamento || 'Sem motivo registrado'}
                    </Text>
                  </View>
                )}

                {item.status === 'pendente' && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.actionButtonDanger}
                      onPress={() => {
                        setSelectedForCancel(item);
                        setCancelMotivo('');
                        setIsCancelOpen(true);
                      }}
                    >
                      <Text style={styles.actionButtonDangerText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButtonSuccess}
                      onPress={() => {
                        setSelectedForRedeem(item);
                        setFormaResgate('online');
                        setInstrucoesResgate('');
                        setIsRedeemOpen(true);
                      }}
                    >
                      <Text style={styles.actionButtonSuccessText}>Resgatar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhum prêmio encontrado</Text>
                <Text style={styles.emptySubtitle}>Não há registros para a aba selecionada.</Text>
              </View>
            }
          />
        )}

        {/* Modal: Conceder Novo Prêmio */}
        <Modal visible={isCreateOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Conceder Novo Prêmio</Text>
              <ScrollView style={{ maxHeight: 420 }}>
                <Text style={styles.inputLabel}>Beneficiário (Cliente) *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  {clientes.map((cli) => (
                    <TouchableOpacity
                      key={cli.id}
                      style={[
                        styles.chipModal,
                        newPremio.cliente_id === cli.id && styles.chipModalActive,
                      ]}
                      onPress={() => setNewPremio({ ...newPremio, cliente_id: cli.id })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          newPremio.cliente_id === cli.id && styles.chipModalTextActive,
                        ]}
                      >
                        {cli.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Título do Prêmio *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newPremio.nome}
                  onChangeText={(t) => setNewPremio({ ...newPremio, nome: t })}
                  placeholder="Ex: Desconto de R$ 50 ou Limpeza Completa"
                />

                <Text style={styles.inputLabel}>Tipo</Text>
                <View style={styles.chipRowModal}>
                  {(['servico', 'produto', 'assinatura'] as const).map((tp) => (
                    <TouchableOpacity
                      key={tp}
                      style={[styles.chipModal, newPremio.tipo === tp && styles.chipModalActive]}
                      onPress={() => setNewPremio({ ...newPremio, tipo: tp })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          newPremio.tipo === tp && styles.chipModalTextActive,
                        ]}
                      >
                        {tp.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Validade (Dias)</Text>
                <TextInput
                  style={styles.formInput}
                  value={newPremio.validade_dias}
                  onChangeText={(t) => setNewPremio({ ...newPremio, validade_dias: t })}
                  keyboardType="numeric"
                  placeholder="30"
                />

                <Text style={styles.inputLabel}>Descrição / Regras</Text>
                <TextInput
                  style={[styles.formInput, { height: 70 }]}
                  value={newPremio.descricao}
                  onChangeText={(t) => setNewPremio({ ...newPremio, descricao: t })}
                  placeholder="Regras de utilização do prêmio..."
                  multiline
                />
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
                    {savingCreate ? 'Gravando...' : 'Salvar Prêmio'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Resgatar Prêmio */}
        <Modal visible={isRedeemOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Confirmar Resgate de Prêmio</Text>
              {selectedForRedeem && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{selectedForRedeem.nome}</Text>
                  <Text style={styles.summarySub}>
                    Código: {selectedForRedeem.codigo_premio} • Beneficiário:{' '}
                    {selectedForRedeem.clientes?.nome || 'Cliente'}
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Forma de Resgate</Text>
              <View style={styles.chipRowModal}>
                {(['online', 'fisico'] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chipModal, formaResgate === f && styles.chipModalActive]}
                    onPress={() => setFormaResgate(f)}
                  >
                    <Text
                      style={[
                        styles.chipModalText,
                        formaResgate === f && styles.chipModalTextActive,
                      ]}
                    >
                      {f === 'online' ? '🌐 ONLINE / CUPOM' : '🏢 FÍSICO / BALCÃO'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Instruções ou Código Externo</Text>
              <TextInput
                style={[styles.formInput, { height: 70 }]}
                value={instrucoesResgate}
                onChangeText={setInstrucoesResgate}
                placeholder="Ex: Entregue no balcão da filial ou enviado via WhatsApp"
                multiline
              />

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setIsRedeemOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButtonSave, { backgroundColor: '#059669' }]}
                  onPress={handleSaveRedeem}
                  disabled={savingRedeem}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingRedeem ? 'Processando...' : 'Confirmar Resgate'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Cancelar Prêmio */}
        <Modal visible={isCancelOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={[styles.modalTitle, { color: '#dc2626' }]}>Cancelar Prêmio</Text>
              {selectedForCancel && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{selectedForCancel.nome}</Text>
                  <Text style={styles.summarySub}>
                    Código: {selectedForCancel.codigo_premio}
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Motivo do Cancelamento *</Text>
              <TextInput
                style={[styles.formInput, { height: 80 }]}
                value={cancelMotivo}
                onChangeText={setCancelMotivo}
                placeholder="Informe o motivo para cancelar este benefício..."
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
    color: '#2563eb',
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
    backgroundColor: '#2563eb',
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
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#2563eb',
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
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
  cardColValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    marginTop: 2,
  },
  descText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 8,
    lineHeight: 16,
  },
  infoBox: {
    backgroundColor: '#ecfdf5',
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  infoBoxText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065f46',
  },
  infoBoxSub: {
    fontSize: 10,
    color: '#047857',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionButtonDanger: {
    minHeight: 44,
    paddingHorizontal: 12,
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
  actionButtonSuccess: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  summarySub: {
    fontSize: 11,
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
  },
  chipModalActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  chipModalText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  chipModalTextActive: {
    color: '#2563eb',
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
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default PremiosModuleScreen;

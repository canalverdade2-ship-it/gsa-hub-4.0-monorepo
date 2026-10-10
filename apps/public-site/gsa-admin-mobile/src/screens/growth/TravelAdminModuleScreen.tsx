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

export interface TravelPackage {
  id: string;
  titulo: string;
  destino: string;
  categoria_id?: string | null;
  categoria_nome?: string;
  preco: number;
  dias: number;
  noites: number;
  vagas_disponiveis: number;
  status: 'ativo' | 'inativo' | string;
  descricao?: string | null;
  data_ida?: string | null;
  data_volta?: string | null;
  incluso?: string[] | null;
}

export interface TravelReservation {
  id: string;
  pacote_id?: string | null;
  pacote_titulo?: string;
  cliente_nome: string;
  cliente_email?: string;
  cliente_telefone?: string;
  passageiros_qtd: number;
  valor_total: number;
  status: 'pendente' | 'confirmada' | 'cancelada' | string;
  created_at: string;
}

export const TravelAdminModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pacotes' | 'reservas'>('pacotes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [packages, setPackages] = useState<TravelPackage[]>([]);
  const [reservations, setReservations] = useState<TravelReservation[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; nome: string }>>([]);

  // New Package Modal
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [packageForm, setPackageForm] = useState({
    titulo: '',
    destino: '',
    categoria_id: '',
    preco: '',
    dias: '5',
    noites: '4',
    vagas_disponiveis: '10',
    descricao: '',
  });
  const [savingPackage, setSavingPackage] = useState(false);

  // Reservation Status Modal
  const [selectedReservation, setSelectedReservation] = useState<TravelReservation | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [reservationAction, setReservationAction] = useState<'confirmada' | 'cancelada'>('confirmada');
  const [savingReservation, setSavingReservation] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch Packages
      const { data: pkgData, error: pkgErr } = await supabase
        .from('viagens_pacotes')
        .select('*')
        .order('created_at', { ascending: false });

      if (!pkgErr && pkgData) {
        setPackages(pkgData);
      }

      // 2. Fetch Reservations
      const { data: resData, error: resErr } = await supabase
        .from('viagens_solicitacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (!resErr && resData) {
        setReservations(resData);
      } else {
        // Fallback to viagens_reservas
        const { data: altRes } = await supabase
          .from('viagens_reservas')
          .select('*')
          .order('created_at', { ascending: false });
        if (altRes) setReservations(altRes);
      }

      // 3. Fetch Categories
      const { data: catData } = await supabase
        .from('viagens_categorias')
        .select('id, nome')
        .eq('status', 'ativo')
        .order('nome');

      if (catData) setCategories(catData);
    } catch (e: any) {
      console.warn('TravelAdminModule load error:', e.message);
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

  // KPIs
  const totalPackages = packages.length;
  const activePackages = packages.filter((p) => p.status === 'ativo').length;
  const pendingReservations = reservations.filter((r) => r.status === 'pendente').length;
  const confirmedTotal = reservations
    .filter((r) => r.status === 'confirmada')
    .reduce((sum, r) => sum + Number(r.valor_total || 0), 0);

  // Filtered packages
  const filteredPackages = useMemo(() => {
    return packages.filter((p) => {
      return (
        !search ||
        p.titulo?.toLowerCase().includes(search.toLowerCase()) ||
        p.destino?.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [packages, search]);

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      return (
        !search ||
        r.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
        r.pacote_titulo?.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [reservations, search]);

  // Save new package
  const handleSavePackage = async () => {
    if (!packageForm.titulo.trim() || !packageForm.destino.trim()) {
      Alert.alert('Atenção', 'Informe título e destino do pacote.');
      return;
    }
    const precoNum = Number(packageForm.preco.replace(',', '.'));
    if (!precoNum || precoNum <= 0) {
      Alert.alert('Atenção', 'Informe um preço válido.');
      return;
    }

    setSavingPackage(true);
    try {
      const { error } = await supabase.from('viagens_pacotes').insert([
        {
          titulo: packageForm.titulo.trim(),
          destino: packageForm.destino.trim(),
          categoria_id: packageForm.categoria_id || null,
          preco: precoNum,
          dias: parseInt(packageForm.dias, 10) || 1,
          noites: parseInt(packageForm.noites, 10) || 1,
          vagas_disponiveis: parseInt(packageForm.vagas_disponiveis, 10) || 10,
          descricao: packageForm.descricao.trim() || null,
          status: 'ativo',
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', 'Pacote turístico criado com sucesso!');
      setIsPackageModalOpen(false);
      setPackageForm({
        titulo: '',
        destino: '',
        categoria_id: '',
        preco: '',
        dias: '5',
        noites: '4',
        vagas_disponiveis: '10',
        descricao: '',
      });
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao salvar pacote.');
    } finally {
      setSavingPackage(false);
    }
  };

  // Toggle package status
  const handleTogglePackageStatus = async (pkg: TravelPackage) => {
    const nextStatus = pkg.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('viagens_pacotes')
        .update({ status: nextStatus })
        .eq('id', pkg.id);

      if (error) throw error;
      Alert.alert('Sucesso', `Pacote ${nextStatus === 'ativo' ? 'ativado' : 'desativado'}.`);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao atualizar pacote.');
    }
  };

  // Process reservation
  const handleProcessReservation = async () => {
    if (!selectedReservation) return;
    setSavingReservation(true);
    try {
      // Try update viagens_solicitacoes
      const { error: solErr } = await supabase
        .from('viagens_solicitacoes')
        .update({ status: reservationAction })
        .eq('id', selectedReservation.id);

      if (solErr) {
        // Try viagens_reservas
        const { error: resErr } = await supabase
          .from('viagens_reservas')
          .update({ status: reservationAction })
          .eq('id', selectedReservation.id);
        if (resErr) throw resErr;
      }

      Alert.alert('Sucesso', `Reserva alterada para: ${reservationAction}`);
      setIsReservationModalOpen(false);
      setSelectedReservation(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao processar reserva.');
    } finally {
      setSavingReservation(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    let bg = '#ecfdf5';
    let text = '#059669';
    if (status === 'pendente') {
      bg = '#fffbeb';
      text = '#d97706';
    } else if (status === 'cancelada' || status === 'inativo') {
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
            <Text style={styles.headerSubtitle}>GSA VIAGENS & TURISMO</Text>
            <Text style={styles.headerTitle}>Gestão de Viagens</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {activeTab === 'pacotes' && (
              <TouchableOpacity
                style={styles.newButton}
                onPress={() => setIsPackageModalOpen(true)}
              >
                <Text style={styles.newButtonText}>+ Pacote</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={refreshing}
            >
              <Text style={styles.refreshButtonText}>{refreshing ? '...' : '↻'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPIs Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsContainer}
        >
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Pacotes</Text>
            <Text style={styles.metricValue}>{totalPackages}</Text>
            <Text style={styles.metricSub}>{activePackages} ativos</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Reservas Pendentes</Text>
            <Text style={[styles.metricValue, { color: '#d97706' }]}>{pendingReservations}</Text>
            <Text style={styles.metricSub}>aguardando confirmação</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Faturamento</Text>
            <Text style={[styles.metricValue, { color: '#059669' }]}>
              R$ {confirmedTotal.toFixed(2)}
            </Text>
            <Text style={styles.metricSub}>confirmado</Text>
          </View>
        </ScrollView>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'pacotes' && styles.tabItemActive]}
            onPress={() => setActiveTab('pacotes')}
          >
            <Text style={[styles.tabText, activeTab === 'pacotes' && styles.tabTextActive]}>
              Pacotes Turísticos ({packages.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'reservas' && styles.tabItemActive]}
            onPress={() => setActiveTab('reservas')}
          >
            <Text style={[styles.tabText, activeTab === 'reservas' && styles.tabTextActive]}>
              Reservas / Solicitações ({reservations.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por destino, título ou passageiro..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Carregando viagens...</Text>
          </View>
        ) : activeTab === 'pacotes' ? (
          <FlatList
            data={filteredPackages}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.titulo}</Text>
                    <Text style={styles.cardSubtitle}>
                      Destino: {item.destino} • {item.dias} dias / {item.noites} noites
                    </Text>
                  </View>
                  {renderStatusBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Vagas Restantes:</Text>
                    <Text style={styles.cardColValue}>{item.vagas_disponiveis} vagas</Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Preço por Pessoa:</Text>
                    <Text style={[styles.cardColValue, { fontWeight: '900', color: '#059669', fontSize: 16 }]}>
                      R$ {Number(item.preco || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {item.descricao ? (
                  <Text style={styles.descText} numberOfLines={2}>
                    {item.descricao}
                  </Text>
                ) : null}

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButtonOutline,
                      item.status === 'ativo' && { borderColor: '#fca5a5' },
                    ]}
                    onPress={() => handleTogglePackageStatus(item)}
                  >
                    <Text
                      style={[
                        styles.actionButtonOutlineText,
                        item.status === 'ativo' && { color: '#dc2626' },
                      ]}
                    >
                      {item.status === 'ativo' ? 'Pausar Pacote' : 'Ativar Pacote'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhum pacote turístico encontrado</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={filteredReservations}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.cliente_nome || 'Passageiro'}</Text>
                    <Text style={styles.cardSubtitle}>
                      Pacote: {item.pacote_titulo || 'Viagem Personalizada'} •{' '}
                      {item.passageiros_qtd || 1} passageiro(s)
                    </Text>
                  </View>
                  {renderStatusBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Contato:</Text>
                    <Text style={styles.cardColValue}>{item.cliente_telefone || item.cliente_email || '—'}</Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Total da Reserva:</Text>
                    <Text style={[styles.cardColValue, { fontWeight: '900', color: '#0f172a', fontSize: 16 }]}>
                      R$ {Number(item.valor_total || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButtonPrimary}
                    onPress={() => {
                      setSelectedReservation(item);
                      setReservationAction(item.status === 'pendente' ? 'confirmada' : 'cancelada');
                      setIsReservationModalOpen(true);
                    }}
                  >
                    <Text style={styles.actionButtonPrimaryText}>Gerenciar Status</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhuma solicitação de reserva encontrada</Text>
              </View>
            }
          />
        )}

        {/* Modal: Novo Pacote */}
        <Modal visible={isPackageModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Novo Pacote Turístico</Text>
              <ScrollView style={{ maxHeight: 420 }}>
                <Text style={styles.inputLabel}>Título do Pacote *</Text>
                <TextInput
                  style={styles.formInput}
                  value={packageForm.titulo}
                  onChangeText={(t) => setPackageForm({ ...packageForm, titulo: t })}
                  placeholder="Ex: Fim de Semana em Gramado"
                />

                <Text style={styles.inputLabel}>Destino *</Text>
                <TextInput
                  style={styles.formInput}
                  value={packageForm.destino}
                  onChangeText={(t) => setPackageForm({ ...packageForm, destino: t })}
                  placeholder="Ex: Gramado - RS"
                />

                <Text style={styles.inputLabel}>Categoria de Viagem</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.chipModal,
                        packageForm.categoria_id === c.id && styles.chipModalActive,
                      ]}
                      onPress={() => setPackageForm({ ...packageForm, categoria_id: c.id })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          packageForm.categoria_id === c.id && styles.chipModalTextActive,
                        ]}
                      >
                        {c.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>Preço por Pessoa (R$) *</Text>
                <TextInput
                  style={styles.formInput}
                  value={packageForm.preco}
                  onChangeText={(t) => setPackageForm({ ...packageForm, preco: t })}
                  keyboardType="numeric"
                  placeholder="Ex: 1200.00"
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Dias</Text>
                    <TextInput
                      style={styles.formInput}
                      value={packageForm.dias}
                      onChangeText={(t) => setPackageForm({ ...packageForm, dias: t })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Noites</Text>
                    <TextInput
                      style={styles.formInput}
                      value={packageForm.noites}
                      onChangeText={(t) => setPackageForm({ ...packageForm, noites: t })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Vagas</Text>
                    <TextInput
                      style={styles.formInput}
                      value={packageForm.vagas_disponiveis}
                      onChangeText={(t) => setPackageForm({ ...packageForm, vagas_disponiveis: t })}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Descrição do Pacote</Text>
                <TextInput
                  style={[styles.formInput, { height: 70 }]}
                  value={packageForm.descricao}
                  onChangeText={(t) => setPackageForm({ ...packageForm, descricao: t })}
                  placeholder="Itens inclusos, hotel, passeios..."
                  multiline
                />
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setIsPackageModalOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleSavePackage}
                  disabled={savingPackage}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingPackage ? 'Salvando...' : 'Criar Pacote'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Alterar Status Reserva */}
        <Modal visible={isReservationModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Alterar Status da Reserva</Text>
              {selectedReservation && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{selectedReservation.cliente_nome}</Text>
                  <Text style={styles.summarySub}>
                    Pacote: {selectedReservation.pacote_titulo || 'Viagem'} • R${' '}
                    {Number(selectedReservation.valor_total || 0).toFixed(2)}
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Novo Status</Text>
              <View style={styles.chipRowModal}>
                <TouchableOpacity
                  style={[styles.chipModal, reservationAction === 'confirmada' && styles.chipModalActive]}
                  onPress={() => setReservationAction('confirmada')}
                >
                  <Text
                    style={[
                      styles.chipModalText,
                      reservationAction === 'confirmada' && styles.chipModalTextActive,
                    ]}
                  >
                    Confirmada
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.chipModal,
                    reservationAction === 'cancelada' && { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
                  ]}
                  onPress={() => setReservationAction('cancelada')}
                >
                  <Text
                    style={[
                      styles.chipModalText,
                      reservationAction === 'cancelada' && { color: '#dc2626', fontWeight: 'bold' },
                    ]}
                  >
                    Cancelada
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setIsReservationModalOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleProcessReservation}
                  disabled={savingReservation}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingReservation ? 'Atualizando...' : 'Confirmar'}
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
  metricsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  metricCard: {
    width: 140,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 4,
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
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
  actionButtonPrimary: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimaryText: {
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
});

export default TravelAdminModuleScreen;

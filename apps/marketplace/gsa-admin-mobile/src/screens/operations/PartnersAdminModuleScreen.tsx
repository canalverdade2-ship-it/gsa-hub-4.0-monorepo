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

export interface PartnerItem {
  id: string;
  name: string;
  legal_name?: string;
  category?: string;
  short_description?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  city?: string;
  state?: string;
  service_mode?: 'presencial' | 'online' | 'hibrido' | string;
  benefits?: string;
  featured?: boolean;
  status: string;
  redemption_has_coupon?: boolean;
  redemption_coupon_code?: string;
  redemption_has_voucher?: boolean;
  redemption_has_link?: boolean;
  redemption_link?: string;
  created_at?: string;
}

export const PartnersAdminModuleScreen = () => {
  const [data, setData] = useState<PartnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'ativo' | 'em_analise' | 'inativo'>('todos');

  // Selected item
  const [selectedItem, setSelectedItem] = useState<PartnerItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // New Partner modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    legal_name: '',
    category: '',
    phone: '',
    email: '',
    city: '',
    state: 'SP',
    service_mode: 'hibrido' as 'presencial' | 'online' | 'hibrido',
    benefits: '',
  });

  const [saving, setSaving] = useState(false);

  const fetchPartners = useCallback(async () => {
    try {
      let query = supabase
        .from('parceiros')
        .select('*')
        .neq('status', 'excluido')
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (activeTab === 'ativo') {
        query = query.eq('status', 'ativo');
      } else if (activeTab === 'em_analise') {
        query = query.in('status', ['em_analise', 'pendente']);
      } else if (activeTab === 'inativo') {
        query = query.in('status', ['inativo', 'reprovado', 'suspenso']);
      }

      const { data: result, error } = await query;

      if (error) {
        console.error('Erro ao buscar parceiros:', error);
        Alert.alert('Erro', 'Não foi possível carregar parceiros: ' + error.message);
      } else {
        setData((result as PartnerItem[]) || []);
      }
    } catch (err: any) {
      console.error('Exceção ao buscar parceiros:', err);
      Alert.alert('Erro', 'Erro inesperado ao consultar parceiros.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPartners();
  };

  const filteredData = data.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const nome = (item.name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();
    const cidade = (item.city || '').toLowerCase();
    const tel = (item.phone || item.whatsapp || '').toLowerCase();
    return nome.includes(term) || cat.includes(term) || cidade.includes(term) || tel.includes(term);
  });

  // KPIs
  const ativosCount = data.filter((i) => i.status === 'ativo').length;
  const analiseCount = data.filter((i) => ['em_analise', 'pendente'].includes(i.status)).length;
  const totalCount = data.length;

  const handleUpdateStatus = async (item: PartnerItem, newStatus: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('parceiros')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Status do parceiro atualizado para ${newStatus.toUpperCase()}!`);
      setDetailModalVisible(false);
      fetchPartners();
    } catch (err: any) {
      Alert.alert('Erro ao atualizar status', err.message || 'Falha na comunicação com o banco.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeatured = async (item: PartnerItem) => {
    setSaving(true);
    try {
      const novoFeatured = !item.featured;
      const { error } = await supabase
        .from('parceiros')
        .update({ featured: novoFeatured })
        .eq('id', item.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Destaque ${novoFeatured ? 'ativado' : 'desativado'} com sucesso!`);
      setSelectedItem({ ...item, featured: novoFeatured });
      fetchPartners();
    } catch (err: any) {
      Alert.alert('Erro ao alterar destaque', err.message || 'Falha na atualização.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePartner = async () => {
    if (!newForm.name.trim()) {
      Alert.alert('Atenção', 'Informe o nome fantasia do parceiro.');
      return;
    }

    setSaving(true);
    try {
      const slugGerado = newForm.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const { error } = await supabase.from('parceiros').insert([
        {
          name: newForm.name,
          legal_name: newForm.legal_name || newForm.name,
          slug: `${slugGerado}-${Math.floor(100 + Math.random() * 900)}`,
          category: newForm.category || 'Geral',
          phone: newForm.phone,
          email: newForm.email,
          city: newForm.city,
          state: newForm.state,
          service_mode: newForm.service_mode,
          benefits: newForm.benefits,
          status: 'ativo',
          featured: false,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Parceiro ${newForm.name} cadastrado com sucesso!`);
      setNewModalVisible(false);
      setNewForm({
        name: '',
        legal_name: '',
        category: '',
        phone: '',
        email: '',
        city: '',
        state: 'SP',
        service_mode: 'hibrido',
        benefits: '',
      });
      fetchPartners();
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar parceiro', err.message || 'Falha ao salvar no banco.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ativo':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'inativo':
      case 'reprovado':
        return { bg: '#fee2e2', text: '#dc2626' };
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
          placeholder="Buscar parceiro por nome, categoria ou cidade..."
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
          <Text style={styles.kpiLabel}>Ativos</Text>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{ativosCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Em Análise</Text>
          <Text style={[styles.kpiValue, { color: '#d97706' }]}>{analiseCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total Parceiros</Text>
          <Text style={[styles.kpiValue, { color: '#17345f' }]}>{totalCount}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todos', 'ativo', 'em_analise', 'inativo'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                {tab === 'todos' ? 'Todos' : tab === 'ativo' ? 'Ativos' : tab === 'em_analise' ? 'Em Análise' : 'Inativos'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Parceiro</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando parceiros...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum parceiro encontrado</Text>
              <Text style={styles.emptySubtitle}>Ajuste a busca ou adicione um novo parceiro homologado.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusColor(item.status);

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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.featured && (
                        <View style={styles.featuredBadge}>
                          <Text style={styles.featuredBadgeText}>★ DESTAQUE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardCategory}>{item.category ? item.category.toUpperCase() : 'GERAL'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  {item.benefits ? (
                    <Text style={styles.benefitText} numberOfLines={2}>
                      🎁 {item.benefits}
                    </Text>
                  ) : null}
                  <Text style={styles.locationText} numberOfLines={1}>
                    📍 {item.city ? `${item.city} - ${item.state || 'UF'}` : 'Nacional / Online'} • Modo: {item.service_mode || 'Híbrido'}
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardContact}>
                    {item.phone || item.whatsapp || item.email || 'Sem contato'}
                  </Text>
                  <Text style={styles.cardMore}>Ver Detalhes →</Text>
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
              <Text style={styles.modalTitle}>Detalhes do Parceiro</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nome Parceiro:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Homologado:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedItem.status).bg }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(selectedItem.status).text }]}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Destaque na Rede:</Text>
                  <Text style={[styles.detailValueBold, { color: selectedItem.featured ? '#f59e0b' : '#6b7280' }]}>
                    {selectedItem.featured ? '★ SIM (Em Destaque)' : 'Não'}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Benefício & Oferta</Text>
                  <Text style={[styles.detailValue, { fontWeight: '600', color: '#16a34a' }]}>
                    {selectedItem.benefits || 'Nenhum benefício cadastrado.'}
                  </Text>
                  {selectedItem.short_description ? (
                    <Text style={[styles.detailValue, { marginTop: 4 }]}>{selectedItem.short_description}</Text>
                  ) : null}
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Resgate & Automação</Text>
                  <Text style={styles.detailValue}>
                    Cupom: {selectedItem.redemption_has_coupon ? selectedItem.redemption_coupon_code || 'Sim' : 'Não'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Voucher: {selectedItem.redemption_has_voucher ? 'Sim' : 'Não'}
                  </Text>
                  <Text style={styles.detailValue}>
                    Link Direto: {selectedItem.redemption_has_link ? selectedItem.redemption_link || 'Ativo' : 'Não'}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Contato & Local</Text>
                  <Text style={styles.detailValue}>Razão Social: {selectedItem.legal_name || selectedItem.name}</Text>
                  <Text style={styles.detailValue}>Categoria: {selectedItem.category || 'Geral'}</Text>
                  <Text style={styles.detailValue}>Telefone/WhatsApp: {selectedItem.whatsapp || selectedItem.phone || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Email: {selectedItem.email || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Cidade/UF: {selectedItem.city || 'N/A'} - {selectedItem.state || 'N/A'}</Text>
                </View>

                {/* Operations Actions */}
                <View style={styles.modalActionGroup}>
                  {selectedItem.status !== 'ativo' && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleUpdateStatus(selectedItem, 'ativo')}
                    >
                      <Text style={styles.actionButtonText}>✓ Aprovar / Ativar Parceria</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    disabled={saving}
                    onPress={() => handleToggleFeatured(selectedItem)}
                  >
                    <Text style={styles.secondaryActionText}>
                      {selectedItem.featured ? '★ Remover de Destaque' : '★ Colocar em Destaque'}
                    </Text>
                  </TouchableOpacity>

                  {selectedItem.status === 'ativo' ? (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => handleUpdateStatus(selectedItem, 'inativo')}
                    >
                      <Text style={styles.dangerActionText}>⚠️ Inativar Parceria</Text>
                    </TouchableOpacity>
                  ) : selectedItem.status !== 'reprovado' ? (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => handleUpdateStatus(selectedItem, 'reprovado')}
                    >
                      <Text style={styles.dangerActionText}>✕ Reprovar Parceria</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* New Partner Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cadastrar Novo Parceiro</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Nome Fantasia *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Ótica Visão Clara"
                placeholderTextColor="#9ca3af"
                value={newForm.name}
                onChangeText={(t) => setNewForm({ ...newForm, name: t })}
              />

              <Text style={styles.formLabel}>Razão Social</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Visão Clara Artigos Ópticos LTDA"
                placeholderTextColor="#9ca3af"
                value={newForm.legal_name}
                onChangeText={(t) => setNewForm({ ...newForm, legal_name: t })}
              />

              <Text style={styles.formLabel}>Categoria</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Saúde, Alimentação, Educação, Automotivo"
                placeholderTextColor="#9ca3af"
                value={newForm.category}
                onChangeText={(t) => setNewForm({ ...newForm, category: t })}
              />

              <Text style={styles.formLabel}>Modo de Atendimento</Text>
              <View style={styles.categorySelectRow}>
                {(['presencial', 'online', 'hibrido'] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.categoryOption, newForm.service_mode === mode && styles.categoryOptionActive]}
                    onPress={() => setNewForm({ ...newForm, service_mode: mode })}
                  >
                    <Text style={[styles.categoryOptionText, newForm.service_mode === mode && styles.categoryOptionTextActive]}>
                      {mode.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Benefício Oferecido aos Clientes</Text>
              <TextInput
                style={[styles.formInput, { height: 70, textAlignVertical: 'top' }]}
                multiline
                placeholder="Ex: 20% de desconto nas compras acima de R$ 100,00"
                placeholderTextColor="#9ca3af"
                value={newForm.benefits}
                onChangeText={(t) => setNewForm({ ...newForm, benefits: t })}
              />

              <Text style={styles.formLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="phone-pad"
                placeholder="(00) 00000-0000"
                placeholderTextColor="#9ca3af"
                value={newForm.phone}
                onChangeText={(t) => setNewForm({ ...newForm, phone: t })}
              />

              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="email-address"
                placeholder="contato@parceiro.com"
                placeholderTextColor="#9ca3af"
                value={newForm.email}
                onChangeText={(t) => setNewForm({ ...newForm, email: t })}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.formLabel}>Cidade</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Cidade"
                    placeholderTextColor="#9ca3af"
                    value={newForm.city}
                    onChangeText={(t) => setNewForm({ ...newForm, city: t })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>UF</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="UF"
                    placeholderTextColor="#9ca3af"
                    maxLength={2}
                    value={newForm.state}
                    onChangeText={(t) => setNewForm({ ...newForm, state: t.toUpperCase() })}
                  />
                </View>
              </View>

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setNewModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleCreatePartner}>
                  <Text style={styles.confirmBtnText}>Salvar Parceiro</Text>
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
    borderLeftColor: '#0ea5e9',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  featuredBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  featuredBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#d97706',
  },
  cardCategory: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
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
  benefitText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },
  locationText: {
    fontSize: 12,
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
  cardContact: {
    fontSize: 12,
    color: '#4b5563',
  },
  cardMore: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0ea5e9',
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
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#0369a1',
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
    textAlign: 'center',
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

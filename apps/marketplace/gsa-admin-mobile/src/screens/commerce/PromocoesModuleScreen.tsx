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
  Switch,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface PromocaoItem {
  id: string;
  titulo: string;
  codigo_promocao?: string | null;
  descricao?: string | null;
  tipo?: 'servico' | 'produto' | 'assinatura' | 'geral' | string | null;
  tipo_desconto?: 'valor' | 'porcentagem' | 'nenhum' | string | null;
  valor_desconto?: number | null;
  data_inicio_divulgacao?: string | null;
  data_fim_divulgacao?: string | null;
  status?: 'ativa' | 'inativa' | 'suspensa' | 'encerrada' | string | null;
  prazo_valor?: number | null;
  prazo_unidade?: string | null;
  created_at?: string | null;
}

export const PromocoesModuleScreen = () => {
  const [promocoes, setPromocoes] = useState<PromocaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativas' | 'encerradas' | 'todas'>('ativas');

  // Detail Modal
  const [selectedPromo, setSelectedPromo] = useState<PromocaoItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Form Modal (Create / Edit)
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    titulo: '',
    codigo_promocao: '',
    descricao: '',
    tipo: 'geral',
    tipo_desconto: 'porcentagem',
    valor_desconto: '15',
    data_inicio_divulgacao: new Date().toISOString().split('T')[0],
    data_fim_divulgacao: '',
    status: 'ativa',
  });

  const fetchPromocoes = useCallback(async () => {
    try {
      let query = supabase
        .from('promocoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter === 'ativas') {
        query = query.in('status', ['ativa', 'suspensa']);
      } else if (statusFilter === 'encerradas') {
        query = query.in('status', ['encerrada', 'inativa', 'cancelada']);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPromocoes((data || []) as PromocaoItem[]);
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar promoções:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchPromocoes();
  }, [fetchPromocoes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPromocoes();
  };

  const filteredPromocoes = promocoes.filter((p) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const tit = (p.titulo || '').toLowerCase();
    const cod = (p.codigo_promocao || '').toLowerCase();
    return tit.includes(term) || cod.includes(term);
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      titulo: '',
      codigo_promocao: `CAMP${Math.floor(1000 + Math.random() * 9000)}`,
      descricao: '',
      tipo: 'geral',
      tipo_desconto: 'porcentagem',
      valor_desconto: '15',
      data_inicio_divulgacao: new Date().toISOString().split('T')[0],
      data_fim_divulgacao: '',
      status: 'ativa',
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (p: PromocaoItem) => {
    setIsEditing(true);
    setFormData({
      id: p.id,
      titulo: p.titulo || '',
      codigo_promocao: p.codigo_promocao || '',
      descricao: p.descricao || '',
      tipo: p.tipo || 'geral',
      tipo_desconto: p.tipo_desconto || 'porcentagem',
      valor_desconto: p.valor_desconto != null ? String(p.valor_desconto) : '0',
      data_inicio_divulgacao: p.data_inicio_divulgacao ? p.data_inicio_divulgacao.split('T')[0] : '',
      data_fim_divulgacao: p.data_fim_divulgacao ? p.data_fim_divulgacao.split('T')[0] : '',
      status: p.status || 'ativa',
    });
    setDetailModalVisible(false);
    setFormModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.titulo.trim()) {
      Alert.alert('Validação', 'Informe o título da promoção.');
      return;
    }

    setSaving(true);
    try {
      const valorDesconto = parseFloat(formData.valor_desconto.replace(',', '.')) || 0;

      const payload: any = {
        titulo: formData.titulo.trim(),
        codigo_promocao: formData.codigo_promocao.trim().toUpperCase(),
        descricao: formData.descricao.trim(),
        tipo: formData.tipo,
        tipo_desconto: formData.tipo_desconto,
        valor_desconto: valorDesconto,
        data_inicio_divulgacao: formData.data_inicio_divulgacao
          ? new Date(formData.data_inicio_divulgacao).toISOString()
          : new Date().toISOString(),
        data_fim_divulgacao: formData.data_fim_divulgacao
          ? new Date(formData.data_fim_divulgacao).toISOString()
          : null,
        status: formData.status,
      };

      if (isEditing && formData.id) {
        const { error } = await supabase.from('promocoes').update(payload).eq('id', formData.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Promoção atualizada com sucesso!');
      } else {
        const { error } = await supabase.from('promocoes').insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Promoção criada com sucesso!');
      }

      setFormModalVisible(false);
      fetchPromocoes();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: PromocaoItem) => {
    const isAtiva = item.status === 'ativa';
    const newStatus = isAtiva ? 'suspensa' : 'ativa';
    try {
      const { error } = await supabase
        .from('promocoes')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;

      setPromocoes((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: newStatus } : p))
      );
      if (selectedPromo?.id === item.id) {
        setSelectedPromo({ ...selectedPromo, status: newStatus });
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleDelete = (item: PromocaoItem) => {
    Alert.alert(
      'Confirmar Encerramento',
      `Deseja realmente encerrar a promoção "${item.titulo}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('promocoes')
                .update({ status: 'encerrada' })
                .eq('id', item.id);

              if (error) throw error;
              Alert.alert('Sucesso', 'Promoção encerrada com sucesso.');
              setDetailModalVisible(false);
              fetchPromocoes();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

  const renderCard = ({ item }: { item: PromocaoItem }) => {
    const isAtiva = item.status === 'ativa';
    const isSuspensa = item.status === 'suspensa';
    const discountStr =
      item.tipo_desconto === 'porcentagem'
        ? `${item.valor_desconto ?? 0}% OFF`
        : item.tipo_desconto === 'valor'
        ? `R$ ${(item.valor_desconto ?? 0).toFixed(2).replace('.', ',')} OFF`
        : 'Condição Especial';

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedPromo(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{item.codigo_promocao || 'CAMPANHA'}</Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                isAtiva ? styles.badgeActive : isSuspensa ? styles.badgeSuspended : styles.badgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isAtiva ? styles.textActive : isSuspensa ? styles.textSuspended : styles.textInactive,
                ]}
              >
                {item.status?.toUpperCase() || 'ENCERRADA'}
              </Text>
            </View>
          </View>

          <Text style={styles.promoTitle}>{item.titulo}</Text>

          <View style={styles.tagsRow}>
            <Text style={styles.typeBadge}>🎯 {(item.tipo || 'GERAL').toUpperCase()}</Text>
            <Text style={styles.discountBadge}>{discountStr}</Text>
          </View>

          {item.data_fim_divulgacao ? (
            <Text style={styles.validityText}>
              Validade: até {new Date(item.data_fim_divulgacao).toLocaleDateString('pt-BR')}
            </Text>
          ) : (
            <Text style={styles.validityText}>Campanha Contínua</Text>
          )}
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtnEdit}
            onPress={() => handleOpenEdit(item)}
          >
            <Text style={styles.actionBtnEditText}>Editar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtnToggle, isAtiva ? styles.btnDeactivate : styles.btnActivate]}
            onPress={() => handleToggleStatus(item)}
          >
            <Text style={isAtiva ? styles.btnDeactivateText : styles.btnActivateText}>
              {isAtiva ? 'Suspender' : 'Reativar'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Campanhas Promocionais</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
          <Text style={styles.addBtnText}>+ Nova Campanha</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por título ou código da promoção..."
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
            style={[styles.chip, statusFilter === 'ativas' && styles.chipActive]}
            onPress={() => setStatusFilter('ativas')}
          >
            <Text style={[styles.chipText, statusFilter === 'ativas' && styles.chipTextActive]}>Ativas / Suspensas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'encerradas' && styles.chipActive]}
            onPress={() => setStatusFilter('encerradas')}
          >
            <Text style={[styles.chipText, statusFilter === 'encerradas' && styles.chipTextActive]}>Encerradas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'todas' && styles.chipActive]}
            onPress={() => setStatusFilter('todas')}
          >
            <Text style={[styles.chipText, statusFilter === 'todas' && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando campanhas...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPromocoes}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📢</Text>
              <Text style={styles.emptyTitle}>Nenhuma campanha encontrada</Text>
              <Text style={styles.emptySubtitle}>Crie campanhas sazonais e promoções ativas na loja.</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gestão da Campanha</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedPromo && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Título:</Text>
                  <Text style={styles.detailValueBold}>{selectedPromo.titulo}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código:</Text>
                  <Text style={styles.detailValueBold}>{selectedPromo.codigo_promocao || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Segmento / Tipo:</Text>
                  <Text style={styles.detailValue}>{(selectedPromo.tipo || 'GERAL').toUpperCase()}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Mecânica de Desconto:</Text>
                  <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>
                    {selectedPromo.tipo_desconto === 'porcentagem'
                      ? `${selectedPromo.valor_desconto}%`
                      : selectedPromo.tipo_desconto === 'valor'
                      ? `R$ ${(selectedPromo.valor_desconto || 0).toFixed(2).replace('.', ',')}`
                      : 'Especial'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Início da Divulgação:</Text>
                  <Text style={styles.detailValue}>
                    {selectedPromo.data_inicio_divulgacao
                      ? new Date(selectedPromo.data_inicio_divulgacao).toLocaleDateString('pt-BR')
                      : 'Imediato'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Término da Divulgação:</Text>
                  <Text style={styles.detailValue}>
                    {selectedPromo.data_fim_divulgacao
                      ? new Date(selectedPromo.data_fim_divulgacao).toLocaleDateString('pt-BR')
                      : 'Contínua'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={selectedPromo.status === 'ativa' ? styles.textActive : styles.textInactive}>
                    {selectedPromo.status?.toUpperCase()}
                  </Text>
                </View>

                {selectedPromo.descricao ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Regras & Descrição:</Text>
                    <Text style={styles.descText}>{selectedPromo.descricao}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalEditBtn}
                    onPress={() => handleOpenEdit(selectedPromo)}
                  >
                    <Text style={styles.modalEditBtnText}>Editar Campanha</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedPromo)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Encerrar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Form Modal */}
      <Modal
        visible={formModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Campanha' : 'Nova Campanha'}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setFormModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Título da Promoção *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Semana do Consumidor GSA"
                placeholderTextColor="#94a3b8"
                value={formData.titulo}
                onChangeText={(t) => setFormData({ ...formData, titulo: t })}
              />

              <Text style={styles.inputLabel}>Código Promocional</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: CONSUMIDOR20"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                value={formData.codigo_promocao}
                onChangeText={(t) => setFormData({ ...formData, codigo_promocao: t.toUpperCase() })}
              />

              <Text style={styles.inputLabel}>Tipo de Oferta</Text>
              <View style={styles.tipoSelectRow}>
                {['geral', 'produto', 'servico', 'assinatura'].map((tp) => (
                  <TouchableOpacity
                    key={tp}
                    style={[
                      styles.tipoOptionBtn,
                      formData.tipo === tp && styles.tipoOptionBtnSelected,
                    ]}
                    onPress={() => setFormData({ ...formData, tipo: tp })}
                  >
                    <Text
                      style={[
                        styles.tipoOptionText,
                        formData.tipo === tp && styles.tipoOptionTextSelected,
                      ]}
                    >
                      {tp.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Desconto (%)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="15"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.valor_desconto}
                    onChangeText={(t) => setFormData({ ...formData, valor_desconto: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Término (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="2026-12-31"
                    placeholderTextColor="#94a3b8"
                    value={formData.data_fim_divulgacao}
                    onChangeText={(t) => setFormData({ ...formData, data_fim_divulgacao: t })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Descrição & Regras</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Detalhes sobre a promoção, validade e produtos participantes..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                value={formData.descricao}
                onChangeText={(t) => setFormData({ ...formData, descricao: t })}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Campanha Ativa</Text>
                <Switch
                  value={formData.status === 'ativa'}
                  onValueChange={(val) => setFormData({ ...formData, status: val ? 'ativa' : 'suspensa' })}
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={formData.status === 'ativa' ? '#2563eb' : '#f1f5f9'}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>{isEditing ? 'Salvar Campanha' : 'Cadastrar Campanha'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
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
  codeBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
  },
  badgeSuspended: {
    backgroundColor: '#fef3c7',
  },
  badgeInactive: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textActive: {
    color: '#16a34a',
  },
  textSuspended: {
    color: '#b45309',
  },
  textInactive: {
    color: '#dc2626',
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  typeBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  discountBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  validityText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtnEdit: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnEditText: {
    color: '#4338ca',
    fontWeight: '600',
    fontSize: 12,
  },
  actionBtnToggle: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDeactivate: {
    backgroundColor: '#fef3c7',
  },
  btnDeactivateText: {
    color: '#b45309',
    fontWeight: '600',
    fontSize: 12,
  },
  btnActivate: {
    backgroundColor: '#dcfce7',
  },
  btnActivateText: {
    color: '#15803d',
    fontWeight: '600',
    fontSize: 12,
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
    marginTop: 12,
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
  modalActionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalEditBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalEditBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalDeleteBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeleteBtnText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 10,
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
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  tipoSelectRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    marginBottom: 10,
  },
  tipoOptionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipoOptionBtnSelected: {
    backgroundColor: '#2563eb',
  },
  tipoOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  tipoOptionTextSelected: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

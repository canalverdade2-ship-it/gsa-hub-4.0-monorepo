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

export interface CupomLojaItem {
  id: string;
  codigo?: string | null;
  nome_cupom?: string | null;
  tipo_desconto?: 'porcentagem' | 'valor_fixo' | string | null;
  valor_desconto?: number | null;
  valor_minimo_pedido?: number | null;
  limite_uso?: number | null;
  vezes_usado?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: 'ativo' | 'inativo' | 'expirado' | 'cancelado' | string | null;
  cliente_id?: string | null;
  produto_id?: string | null;
  created_at?: string | null;
  clientes?: { nome?: string | null } | null;
  produtos?: { nome?: string | null } | null;
}

export const CuponsLojaModuleScreen = () => {
  const [cupons, setCupons] = useState<CupomLojaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  // Detail Modal
  const [selectedCupom, setSelectedCupom] = useState<CupomLojaItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Create / Edit Form Modal
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    codigo: '',
    tipo_desconto: 'porcentagem',
    valor_desconto: '',
    valor_minimo_pedido: '',
    limite_uso: '100',
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: '',
    status: 'ativo',
  });

  const fetchCupons = useCallback(async () => {
    try {
      let query = supabase
        .from('cupons_loja')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter === 'ativos') {
        query = query.eq('status', 'ativo');
      } else if (statusFilter === 'inativos') {
        query = query.in('status', ['inativo', 'expirado', 'cancelado']);
      }

      const { data, error } = await query;
      if (error) {
        // Fallback to loja_cupons
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('loja_cupons')
          .select('*')
          .order('created_at', { ascending: false });
        if (fallbackErr) throw error;
        setCupons((fallbackData || []) as CupomLojaItem[]);
      } else {
        setCupons((data || []) as CupomLojaItem[]);
      }
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar cupons:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchCupons();
  }, [fetchCupons]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCupons();
  };

  const filteredCupons = cupons.filter((c) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const code = (c.codigo || c.nome_cupom || '').toLowerCase();
    return code.includes(term);
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      codigo: `DESC${Math.floor(1000 + Math.random() * 9000)}`,
      tipo_desconto: 'porcentagem',
      valor_desconto: '10',
      valor_minimo_pedido: '0',
      limite_uso: '100',
      data_inicio: new Date().toISOString().split('T')[0],
      data_fim: '',
      status: 'ativo',
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (c: CupomLojaItem) => {
    setIsEditing(true);
    setFormData({
      id: c.id,
      codigo: c.codigo || c.nome_cupom || '',
      tipo_desconto: c.tipo_desconto || 'porcentagem',
      valor_desconto: c.valor_desconto != null ? String(c.valor_desconto) : '0',
      valor_minimo_pedido: c.valor_minimo_pedido != null ? String(c.valor_minimo_pedido) : '0',
      limite_uso: c.limite_uso != null ? String(c.limite_uso) : '100',
      data_inicio: c.data_inicio ? c.data_inicio.split('T')[0] : '',
      data_fim: c.data_fim ? c.data_fim.split('T')[0] : '',
      status: c.status || 'ativo',
    });
    setDetailModalVisible(false);
    setFormModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.codigo.trim()) {
      Alert.alert('Validação', 'Informe o código do cupom.');
      return;
    }

    setSaving(true);
    try {
      const valorDesconto = parseFloat(formData.valor_desconto.replace(',', '.')) || 0;
      const valorMinimo = parseFloat(formData.valor_minimo_pedido.replace(',', '.')) || 0;
      const limiteUso = parseInt(formData.limite_uso, 10) || 1;

      const payload: any = {
        codigo: formData.codigo.trim().toUpperCase(),
        nome_cupom: formData.codigo.trim().toUpperCase(),
        tipo_desconto: formData.tipo_desconto,
        valor_desconto: valorDesconto,
        valor_minimo_pedido: valorMinimo,
        limite_uso: limiteUso,
        data_inicio: formData.data_inicio ? new Date(formData.data_inicio).toISOString() : new Date().toISOString(),
        data_fim: formData.data_fim ? new Date(formData.data_fim).toISOString() : null,
        status: formData.status,
      };

      if (isEditing && formData.id) {
        const { error } = await supabase.from('cupons_loja').update(payload).eq('id', formData.id);
        if (error) {
          await supabase.from('loja_cupons').update(payload).eq('id', formData.id);
        }
        Alert.alert('Sucesso', 'Cupom atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('cupons_loja').insert([payload]);
        if (error) {
          await supabase.from('loja_cupons').insert([payload]);
        }
        Alert.alert('Sucesso', 'Cupom criado com sucesso!');
      }

      setFormModalVisible(false);
      fetchCupons();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: CupomLojaItem) => {
    const newStatus = item.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('cupons_loja')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) {
        await supabase.from('loja_cupons').update({ status: newStatus }).eq('id', item.id);
      }

      setCupons((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: newStatus } : c))
      );
      if (selectedCupom?.id === item.id) {
        setSelectedCupom({ ...selectedCupom, status: newStatus });
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleDelete = (item: CupomLojaItem) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja realmente desativar ou excluir o cupom "${item.codigo || item.nome_cupom}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('cupons_loja').delete().eq('id', item.id);
              if (error) {
                await supabase.from('cupons_loja').update({ status: 'inativo' }).eq('id', item.id);
                Alert.alert('Cupom Desativado', 'O cupom foi inativado.');
              } else {
                Alert.alert('Sucesso', 'Cupom excluído com sucesso.');
              }
              setDetailModalVisible(false);
              fetchCupons();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

  const renderCard = ({ item }: { item: CupomLojaItem }) => {
    const isAtivo = item.status === 'ativo';
    const code = item.codigo || item.nome_cupom || 'CUPOM';
    const isPorcentagem = item.tipo_desconto === 'porcentagem';
    const discountText = isPorcentagem
      ? `${item.valor_desconto ?? 0}% OFF`
      : `R$ ${(item.valor_desconto ?? 0).toFixed(2).replace('.', ',')} OFF`;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedCupom(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.codeTicket}>
              <Text style={styles.codeText}>🏷️ {code}</Text>
            </View>

            <View style={[styles.statusBadge, isAtivo ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.statusBadgeText, isAtivo ? styles.textActive : styles.textInactive]}>
                {isAtivo ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>

          <Text style={styles.discountHighlight}>{discountText}</Text>

          <View style={styles.rulesRow}>
            {item.valor_minimo_pedido ? (
              <Text style={styles.ruleBadge}>
                Mínimo: R$ {item.valor_minimo_pedido.toFixed(2).replace('.', ',')}
              </Text>
            ) : null}
            <Text style={styles.ruleBadge}>
              Usos: {item.vezes_usado ?? 0} / {item.limite_uso ?? '∞'}
            </Text>
          </View>

          {item.data_fim ? (
            <Text style={styles.validityText}>
              Validade: até {new Date(item.data_fim).toLocaleDateString('pt-BR')}
            </Text>
          ) : (
            <Text style={styles.validityText}>Sem prazo de expiração definido</Text>
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
            style={[styles.actionBtnToggle, isAtivo ? styles.btnDeactivate : styles.btnActivate]}
            onPress={() => handleToggleStatus(item)}
          >
            <Text style={isAtivo ? styles.btnDeactivateText : styles.btnActivateText}>
              {isAtivo ? 'Desativar' : 'Ativar'}
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
        <Text style={styles.headerTitle}>Cupons de Desconto</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
          <Text style={styles.addBtnText}>+ Novo Cupom</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código de cupom..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCapitalize="characters"
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'ativos' && styles.chipActive]}
            onPress={() => setStatusFilter('ativos')}
          >
            <Text style={[styles.chipText, statusFilter === 'ativos' && styles.chipTextActive]}>Ativos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'inativos' && styles.chipActive]}
            onPress={() => setStatusFilter('inativos')}
          >
            <Text style={[styles.chipText, statusFilter === 'inativos' && styles.chipTextActive]}>Inativos / Expirados</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'todos' && styles.chipActive]}
            onPress={() => setStatusFilter('todos')}
          >
            <Text style={[styles.chipText, statusFilter === 'todos' && styles.chipTextActive]}>Todos</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando cupons...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCupons}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎟️</Text>
              <Text style={styles.emptyTitle}>Nenhum cupom encontrado</Text>
              <Text style={styles.emptySubtitle}>Cadastre códigos promocionais para oferecer descontos na loja.</Text>
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
              <Text style={styles.modalTitle}>Detalhes do Cupom</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedCupom && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código do Cupom:</Text>
                  <Text style={styles.detailValueBold}>
                    {selectedCupom.codigo || selectedCupom.nome_cupom}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipo de Desconto:</Text>
                  <Text style={styles.detailValue}>
                    {selectedCupom.tipo_desconto === 'porcentagem' ? 'Percentual (%)' : 'Valor Fixo (R$)'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Desconto:</Text>
                  <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>
                    {selectedCupom.tipo_desconto === 'porcentagem'
                      ? `${selectedCupom.valor_desconto}%`
                      : `R$ ${(selectedCupom.valor_desconto || 0).toFixed(2).replace('.', ',')}`}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pedido Mínimo:</Text>
                  <Text style={styles.detailValue}>
                    R$ {(selectedCupom.valor_minimo_pedido || 0).toFixed(2).replace('.', ',')}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Limite de Utilizações:</Text>
                  <Text style={styles.detailValue}>{selectedCupom.limite_uso ?? 'Sem limite'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Vezes Utilizado:</Text>
                  <Text style={styles.detailValueBold}>{selectedCupom.vezes_usado ?? 0}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Início da Vigência:</Text>
                  <Text style={styles.detailValue}>
                    {selectedCupom.data_inicio
                      ? new Date(selectedCupom.data_inicio).toLocaleDateString('pt-BR')
                      : 'Imediato'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Término da Vigência:</Text>
                  <Text style={styles.detailValue}>
                    {selectedCupom.data_fim
                      ? new Date(selectedCupom.data_fim).toLocaleDateString('pt-BR')
                      : 'Indeterminado'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={selectedCupom.status === 'ativo' ? styles.textActive : styles.textInactive}>
                    {selectedCupom.status === 'ativo' ? 'Ativo e Válido' : 'Inativo / Expirado'}
                  </Text>
                </View>

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalEditBtn}
                    onPress={() => handleOpenEdit(selectedCupom)}
                  >
                    <Text style={styles.modalEditBtnText}>Editar Cupom</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedCupom)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Excluir / Desativar</Text>
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
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Cupom' : 'Novo Cupom'}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setFormModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Código Promocional *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: PROMO10"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                value={formData.codigo}
                onChangeText={(t) => setFormData({ ...formData, codigo: t.toUpperCase() })}
              />

              <Text style={styles.inputLabel}>Tipo de Desconto</Text>
              <View style={styles.tipoSelectRow}>
                <TouchableOpacity
                  style={[
                    styles.tipoOptionBtn,
                    formData.tipo_desconto === 'porcentagem' && styles.tipoOptionBtnSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, tipo_desconto: 'porcentagem' })}
                >
                  <Text
                    style={[
                      styles.tipoOptionText,
                      formData.tipo_desconto === 'porcentagem' && styles.tipoOptionTextSelected,
                    ]}
                  >
                    PORCENTAGEM (%)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.tipoOptionBtn,
                    formData.tipo_desconto === 'valor_fixo' && styles.tipoOptionBtnSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, tipo_desconto: 'valor_fixo' })}
                >
                  <Text
                    style={[
                      styles.tipoOptionText,
                      formData.tipo_desconto === 'valor_fixo' && styles.tipoOptionTextSelected,
                    ]}
                  >
                    VALOR FIXO (R$)
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>
                    {formData.tipo_desconto === 'porcentagem' ? 'Desconto (%) *' : 'Desconto (R$) *'}
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: 10"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.valor_desconto}
                    onChangeText={(t) => setFormData({ ...formData, valor_desconto: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Pedido Mínimo (R$)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0,00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.valor_minimo_pedido}
                    onChangeText={(t) => setFormData({ ...formData, valor_minimo_pedido: t })}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Limite de Usos</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="100"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.limite_uso}
                    onChangeText={(t) => setFormData({ ...formData, limite_uso: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Data Limite (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="2026-12-31"
                    placeholderTextColor="#94a3b8"
                    value={formData.data_fim}
                    onChangeText={(t) => setFormData({ ...formData, data_fim: t })}
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Cupom Ativo para Uso</Text>
                <Switch
                  value={formData.status === 'ativo'}
                  onValueChange={(val) => setFormData({ ...formData, status: val ? 'ativo' : 'inativo' })}
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={formData.status === 'ativo' ? '#2563eb' : '#f1f5f9'}
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
                  <Text style={styles.submitBtnText}>{isEditing ? 'Salvar Cupom' : 'Criar Cupom'}</Text>
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
  codeTicket: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
  },
  codeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
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
  textInactive: {
    color: '#dc2626',
  },
  discountHighlight: {
    fontSize: 20,
    fontWeight: '900',
    color: '#16a34a',
    marginVertical: 6,
  },
  rulesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  ruleBadge: {
    fontSize: 11,
    color: '#475569',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  validityText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
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
    backgroundColor: '#fee2e2',
  },
  btnDeactivateText: {
    color: '#dc2626',
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
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  tipoSelectRow: {
    flexDirection: 'row',
    gap: 8,
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
    fontSize: 12,
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

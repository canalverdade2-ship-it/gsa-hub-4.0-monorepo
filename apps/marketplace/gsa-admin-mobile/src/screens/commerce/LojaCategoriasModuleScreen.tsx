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

export interface LojaCategoriaItem {
  id: string;
  nome: string;
  slug?: string | null;
  icone?: string | null;
  imagem_url?: string | null;
  ordem?: number | null;
  status?: 'ativo' | 'inativo' | string | null;
  tipo_item?: 'produto' | 'assinatura' | 'servico' | 'todos' | string | null;
  created_at?: string | null;
}

export const LojaCategoriasModuleScreen = () => {
  const [categorias, setCategorias] = useState<LojaCategoriaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativas' | 'inativas' | 'todas'>('ativas');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');

  // Detail Modal
  const [selectedCategoria, setSelectedCategoria] = useState<LojaCategoriaItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Form Modal (Create / Edit)
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    nome: '',
    slug: '',
    icone: '',
    imagem_url: '',
    ordem: '0',
    status: 'ativo',
    tipo_item: 'produto',
  });

  const fetchCategorias = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('loja_categorias')
        .select('*')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });

      if (error) throw error;
      setCategorias((data || []) as LojaCategoriaItem[]);
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar categorias:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCategorias();
  }, [fetchCategorias]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCategorias();
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const filteredCategorias = categorias.filter((c) => {
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (c.nome && c.nome.toLowerCase().includes(term)) ||
      (c.slug && c.slug.toLowerCase().includes(term));

    const isAtivo = c.status === 'ativo';
    const matchesStatus =
      statusFilter === 'todas' ||
      (statusFilter === 'ativas' && isAtivo) ||
      (statusFilter === 'inativas' && !isAtivo);

    const matchesTipo =
      tipoFilter === 'todos' ||
      !c.tipo_item ||
      c.tipo_item.toLowerCase() === tipoFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesTipo;
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      nome: '',
      slug: '',
      icone: '📦',
      imagem_url: '',
      ordem: String(categorias.length * 10),
      status: 'ativo',
      tipo_item: 'produto',
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (c: LojaCategoriaItem) => {
    setIsEditing(true);
    setFormData({
      id: c.id,
      nome: c.nome,
      slug: c.slug || '',
      icone: c.icone || '📦',
      imagem_url: c.imagem_url || '',
      ordem: c.ordem != null ? String(c.ordem) : '0',
      status: c.status || 'ativo',
      tipo_item: c.tipo_item || 'produto',
    });
    setDetailModalVisible(false);
    setFormModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      Alert.alert('Validação', 'Informe o nome da categoria.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        nome: formData.nome.trim(),
        slug: formData.slug.trim() || generateSlug(formData.nome),
        icone: formData.icone.trim() || null,
        imagem_url: formData.imagem_url.trim() || null,
        ordem: parseInt(formData.ordem, 10) || 0,
        status: formData.status,
        tipo_item: formData.tipo_item,
      };

      if (isEditing && formData.id) {
        const { error } = await supabase
          .from('loja_categorias')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Categoria atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('loja_categorias')
          .insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Categoria criada com sucesso!');
      }

      setFormModalVisible(false);
      fetchCategorias();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: LojaCategoriaItem) => {
    const newStatus = item.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('loja_categorias')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;

      setCategorias((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: newStatus } : c))
      );
      if (selectedCategoria?.id === item.id) {
        setSelectedCategoria({ ...selectedCategoria, status: newStatus });
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleDelete = (item: LojaCategoriaItem) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja realmente remover a categoria "${item.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('loja_categorias')
                .delete()
                .eq('id', item.id);

              if (error) {
                // If referenced by products, inactivate instead
                await supabase
                  .from('loja_categorias')
                  .update({ status: 'inativo' })
                  .eq('id', item.id);
                Alert.alert('Categoria Inativada', 'Não foi possível excluir pois há itens vinculados. Status alterado para inativo.');
              } else {
                Alert.alert('Sucesso', 'Categoria removida.');
              }
              setDetailModalVisible(false);
              fetchCategorias();
            } catch (err: any) {
              Alert.alert('Erro ao excluir', err.message);
            }
          },
        },
      ]
    );
  };

  const renderCategoriaCard = ({ item }: { item: LojaCategoriaItem }) => {
    const isAtivo = item.status === 'ativo';

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedCategoria(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>{item.icone || '🏷️'}</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={[styles.statusBadge, isAtivo ? styles.badgeActive : styles.badgeInactive]}>
                <Text style={[styles.statusBadgeText, isAtivo ? styles.textActive : styles.textInactive]}>
                  {isAtivo ? 'Ativa' : 'Inativa'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.categoryName}>{item.nome}</Text>
          {item.slug ? <Text style={styles.slugText}>/{item.slug}</Text> : null}

          <View style={styles.tagsRow}>
            <View style={styles.tipoBadge}>
              <Text style={styles.tipoBadgeText}>
                Tipo: {(item.tipo_item || 'produto').toUpperCase()}
              </Text>
            </View>
            <View style={styles.ordemBadge}>
              <Text style={styles.ordemBadgeText}>Ordem: {item.ordem ?? 0}</Text>
            </View>
          </View>
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
        <Text style={styles.headerTitle}>Departamentos & Categorias</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
          <Text style={styles.addBtnText}>+ Nova Categoria</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome ou slug..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Section */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'ativas' && styles.chipActive]}
            onPress={() => setStatusFilter('ativas')}
          >
            <Text style={[styles.chipText, statusFilter === 'ativas' && styles.chipTextActive]}>Ativas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'inativas' && styles.chipActive]}
            onPress={() => setStatusFilter('inativas')}
          >
            <Text style={[styles.chipText, statusFilter === 'inativas' && styles.chipTextActive]}>Inativas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'todas' && styles.chipActive]}
            onPress={() => setStatusFilter('todas')}
          >
            <Text style={[styles.chipText, statusFilter === 'todas' && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>

          {/* Tipo Chips */}
          <TouchableOpacity
            style={[styles.chipSecondary, tipoFilter === 'todos' && styles.chipSecondaryActive]}
            onPress={() => setTipoFilter('todos')}
          >
            <Text style={[styles.chipSecondaryText, tipoFilter === 'todos' && styles.chipSecondaryTextActive]}>
              Todos Tipos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipSecondary, tipoFilter === 'produto' && styles.chipSecondaryActive]}
            onPress={() => setTipoFilter('produto')}
          >
            <Text style={[styles.chipSecondaryText, tipoFilter === 'produto' && styles.chipSecondaryTextActive]}>
              Produtos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipSecondary, tipoFilter === 'servico' && styles.chipSecondaryActive]}
            onPress={() => setTipoFilter('servico')}
          >
            <Text style={[styles.chipSecondaryText, tipoFilter === 'servico' && styles.chipSecondaryTextActive]}>
              Serviços
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipSecondary, tipoFilter === 'assinatura' && styles.chipSecondaryActive]}
            onPress={() => setTipoFilter('assinatura')}
          >
            <Text style={[styles.chipSecondaryText, tipoFilter === 'assinatura' && styles.chipSecondaryTextActive]}>
              Assinaturas
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando categorias...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCategorias}
          keyExtractor={(item) => item.id}
          renderItem={renderCategoriaCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🏷️</Text>
              <Text style={styles.emptyTitle}>Nenhuma categoria encontrada</Text>
              <Text style={styles.emptySubtitle}>Cadastre departamentos e categorias para organizar seus itens.</Text>
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
              <Text style={styles.modalTitle}>Detalhes da Categoria</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedCategoria && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nome:</Text>
                  <Text style={styles.detailValueBold}>{selectedCategoria.nome}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Slug de URL:</Text>
                  <Text style={styles.detailValue}>/{selectedCategoria.slug || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Ícone / Emoji:</Text>
                  <Text style={styles.detailValue}>{selectedCategoria.icone || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tipo de Itens:</Text>
                  <Text style={styles.detailValueBold}>
                    {(selectedCategoria.tipo_item || 'produto').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Ordem de Exibição:</Text>
                  <Text style={styles.detailValue}>{selectedCategoria.ordem ?? 0}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={selectedCategoria.status === 'ativo' ? styles.textActive : styles.textInactive}>
                    {selectedCategoria.status === 'ativo' ? 'Ativa no Portal' : 'Inativa / Oculta'}
                  </Text>
                </View>

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalEditBtn}
                    onPress={() => handleOpenEdit(selectedCategoria)}
                  >
                    <Text style={styles.modalEditBtnText}>Editar Categoria</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedCategoria)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Excluir</Text>
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
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Categoria' : 'Nova Categoria'}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setFormModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Nome da Categoria *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Informática & Acessórios"
                placeholderTextColor="#94a3b8"
                value={formData.nome}
                onChangeText={(t) => {
                  setFormData({
                    ...formData,
                    nome: t,
                    slug: isEditing ? formData.slug : generateSlug(t),
                  });
                }}
              />

              <Text style={styles.inputLabel}>Slug (URL amigável)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="informatica-acessorios"
                placeholderTextColor="#94a3b8"
                value={formData.slug}
                onChangeText={(t) => setFormData({ ...formData, slug: t })}
              />

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Ícone (Emoji ou Código)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: 💻 ou Package"
                    placeholderTextColor="#94a3b8"
                    value={formData.icone}
                    onChangeText={(t) => setFormData({ ...formData, icone: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Ordem</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.ordem}
                    onChangeText={(t) => setFormData({ ...formData, ordem: t })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Tipo de Item</Text>
              <View style={styles.tipoSelectRow}>
                {['produto', 'servico', 'assinatura', 'todos'].map((tipo) => (
                  <TouchableOpacity
                    key={tipo}
                    style={[
                      styles.tipoOptionBtn,
                      formData.tipo_item === tipo && styles.tipoOptionBtnSelected,
                    ]}
                    onPress={() => setFormData({ ...formData, tipo_item: tipo })}
                  >
                    <Text
                      style={[
                        styles.tipoOptionText,
                        formData.tipo_item === tipo && styles.tipoOptionTextSelected,
                      ]}
                    >
                      {tipo.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Categoria Ativa na Loja</Text>
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
                  <Text style={styles.submitBtnText}>{isEditing ? 'Salvar Alterações' : 'Criar Categoria'}</Text>
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
  chipSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSecondaryActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#6366f1',
  },
  chipSecondaryText: {
    fontSize: 12,
    color: '#475569',
  },
  chipSecondaryTextActive: {
    color: '#4338ca',
    fontWeight: '700',
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
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  categoryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 6,
    marginBottom: 2,
  },
  slugText: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  tipoBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tipoBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  ordemBadge: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ordemBadgeText: {
    fontSize: 11,
    color: '#64748b',
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
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
  },
  tipoOptionBtn: {
    paddingHorizontal: 12,
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

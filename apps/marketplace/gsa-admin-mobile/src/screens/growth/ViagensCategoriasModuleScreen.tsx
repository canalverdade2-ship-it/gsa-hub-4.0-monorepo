import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface ViagemCategoria {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
  status: 'ativo' | 'inativo' | string;
  created_at: string;
}

export const ViagensCategoriasModuleScreen: React.FC = () => {
  const [categories, setCategories] = useState<ViagemCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<ViagemCategoria> | null>(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formOrdem, setFormOrdem] = useState('10');
  const [formStatus, setFormStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('viagens_categorias')
        .select('*')
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCategories(data || []);
    } catch (e: any) {
      console.warn('ViagensCategoriasModule load error:', e.message);
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

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (!editingItem?.id) {
      setFormSlug(generateSlug(val));
    }
  };

  const openNew = () => {
    setEditingItem(null);
    setFormName('');
    setFormSlug('');
    setFormOrdem(String((categories.length + 1) * 10));
    setFormStatus('ativo');
    setModalOpen(true);
  };

  const openEdit = (item: ViagemCategoria) => {
    setEditingItem(item);
    setFormName(item.nome);
    setFormSlug(item.slug);
    setFormOrdem(String(item.ordem || 10));
    setFormStatus(item.status === 'inativo' ? 'inativo' : 'ativo');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert('Atenção', 'Informe o nome da categoria.');
      return;
    }

    const payload = {
      nome: formName.trim(),
      slug: formSlug.trim() || generateSlug(formName),
      ordem: parseInt(formOrdem, 10) || 10,
      status: formStatus,
    };

    setSaving(true);
    try {
      if (editingItem?.id) {
        const { error } = await supabase
          .from('viagens_categorias')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Categoria atualizada!');
      } else {
        const { error } = await supabase.from('viagens_categorias').insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Categoria criada com sucesso!');
      }

      setModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao salvar categoria.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: ViagemCategoria) => {
    const nextStatus = item.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('viagens_categorias')
        .update({ status: nextStatus })
        .eq('id', item.id);
      if (error) throw error;
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao alterar status.');
    }
  };

  const handleDelete = (item: ViagemCategoria) => {
    Alert.alert('Confirmar Exclusão', `Deseja realmente remover a categoria "${item.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('viagens_categorias').delete().eq('id', item.id);
            if (error) throw error;
            Alert.alert('Sucesso', 'Categoria removida.');
            loadData();
          } catch (e: any) {
            Alert.alert('Erro', e.message || 'Falha ao excluir categoria.');
          }
        },
      },
    ]);
  };

  const filteredList = useMemo(() => {
    return categories.filter((c) => {
      return (
        !search ||
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [categories, search]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>GSA VIAGENS</Text>
            <Text style={styles.headerTitle}>Categorias de Destinos</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.newButton}
              onPress={openNew}
              accessibilityRole="button"
              accessibilityLabel="Nova categoria de viagem"
            >
              <Text style={styles.newButtonText}>+ Nova</Text>
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

        {/* Search */}
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por categoria ou slug..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Carregando categorias...</Text>
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
                    <Text style={styles.cardSlug}>slug: /{item.slug}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: item.status === 'ativo' ? '#ecfdf5' : '#fef2f2' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: item.status === 'ativo' ? '#059669' : '#dc2626' },
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <Text style={styles.cardColLabel}>Ordem de Exibição: #{item.ordem}</Text>
                  <Text style={styles.cardColLabel}>
                    Criada em:{' '}
                    {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '—'}
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButtonOutline}
                    onPress={() => handleToggleStatus(item)}
                  >
                    <Text style={styles.actionButtonOutlineText}>
                      {item.status === 'ativo' ? 'Desativar' : 'Ativar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonOutline}
                    onPress={() => openEdit(item)}
                  >
                    <Text style={styles.actionButtonOutlineText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonDanger}
                    onPress={() => handleDelete(item)}
                  >
                    <Text style={styles.actionButtonDangerText}>Excluir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhuma categoria encontrada</Text>
                <Text style={styles.emptySubtitle}>Cadastre categorias como Praia, Serra, Cruzeiro...</Text>
              </View>
            }
          />
        )}

        {/* Modal: Nova / Editar Categoria */}
        <Modal visible={modalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingItem?.id ? 'Editar Categoria' : 'Nova Categoria de Viagem'}
              </Text>
              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={styles.inputLabel}>Nome da Categoria *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formName}
                  onChangeText={handleNameChange}
                  placeholder="Ex: Resorts All Inclusive, Ecoturismo..."
                />

                <Text style={styles.inputLabel}>Slug (Identificador URL)</Text>
                <TextInput
                  style={styles.formInput}
                  value={formSlug}
                  onChangeText={setFormSlug}
                  placeholder="resorts-all-inclusive"
                  autoCapitalize="none"
                />

                <Text style={styles.inputLabel}>Ordem de Prioridade</Text>
                <TextInput
                  style={styles.formInput}
                  value={formOrdem}
                  onChangeText={setFormOrdem}
                  keyboardType="numeric"
                  placeholder="10"
                />

                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.chipRowModal}>
                  {(['ativo', 'inativo'] as const).map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.chipModal, formStatus === st && styles.chipModalActive]}
                      onPress={() => setFormStatus(st)}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          formStatus === st && styles.chipModalTextActive,
                        ]}
                      >
                        {st.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setModalOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {saving ? 'Salvando...' : 'Salvar Categoria'}
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
  cardSlug: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontFamily: 'monospace',
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
  cardColLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionButtonOutline: {
    minHeight: 44,
    paddingHorizontal: 12,
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
    gap: 8,
    marginVertical: 4,
  },
  chipModal: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  chipModalActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#059669',
  },
  chipModalText: {
    fontSize: 11,
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

export default ViagensCategoriasModuleScreen;

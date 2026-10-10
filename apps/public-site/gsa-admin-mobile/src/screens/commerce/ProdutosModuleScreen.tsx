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

export interface ProdutoItem {
  id: string;
  nome: string;
  codigo?: string | null;
  codigo_produto?: string | null;
  preco?: number | null;
  preco_promocional?: number | null;
  em_promocao?: boolean | null;
  estoque?: number | null;
  categoria?: string | null;
  subcategoria?: string | null;
  ativo?: boolean | null;
  status?: string | null;
  tipo_cliente?: string | null;
  descricao?: string | null;
  imagem_url?: string | null;
  created_at?: string | null;
}

export const ProdutosModuleScreen = () => {
  const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todas');

  // Detail Modal State
  const [selectedProduto, setSelectedProduto] = useState<ProdutoItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Form Modal State (Create / Edit)
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    nome: '',
    codigo: '',
    preco: '',
    preco_promocional: '',
    estoque: '',
    categoria: '',
    tipo_cliente: 'ambos',
    descricao: '',
    ativo: true,
  });

  const fetchProdutos = useCallback(async () => {
    try {
      let query = supabase.from('produtos').select('*').order('nome', { ascending: true });

      if (statusFilter === 'ativos') {
        query = query.or('ativo.eq.true,status.eq.ativo');
      } else if (statusFilter === 'inativos') {
        query = query.or('ativo.eq.false,status.eq.inativo');
      }

      const { data, error } = await query;
      if (error) throw error;

      const items = (data || []) as ProdutoItem[];
      setProdutos(items);

      // Extract unique categories
      const cats = Array.from(
        new Set(
          items
            .map((p) => p.categoria?.trim())
            .filter((c): c is string => Boolean(c && c.length > 0))
        )
      ).sort();
      setCategorias(cats);
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar produtos:', err.message || 'Falha na conexão.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchProdutos();
  }, [fetchProdutos]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProdutos();
  };

  const filteredProdutos = produtos.filter((p) => {
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (p.nome && p.nome.toLowerCase().includes(term)) ||
      (p.codigo && p.codigo.toLowerCase().includes(term)) ||
      (p.codigo_produto && p.codigo_produto.toLowerCase().includes(term)) ||
      (p.categoria && p.categoria.toLowerCase().includes(term));

    const matchesCat =
      categoriaFilter === 'todas' ||
      (p.categoria && p.categoria.toLowerCase() === categoriaFilter.toLowerCase());

    return matchesSearch && matchesCat;
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      nome: '',
      codigo: `PRD-${Date.now().toString().slice(-6)}`,
      preco: '',
      preco_promocional: '',
      estoque: '0',
      categoria: categorias[0] || 'Geral',
      tipo_cliente: 'ambos',
      descricao: '',
      ativo: true,
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (item: ProdutoItem) => {
    setIsEditing(true);
    setFormData({
      id: item.id,
      nome: item.nome || '',
      codigo: item.codigo || item.codigo_produto || '',
      preco: item.preco != null ? String(item.preco) : '',
      preco_promocional: item.preco_promocional != null ? String(item.preco_promocional) : '',
      estoque: item.estoque != null ? String(item.estoque) : '0',
      categoria: item.categoria || '',
      tipo_cliente: item.tipo_cliente || 'ambos',
      descricao: item.descricao || '',
      ativo: item.ativo !== false && item.status !== 'inativo',
    });
    setDetailModalVisible(false);
    setFormModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      Alert.alert('Validação', 'Informe o nome do produto.');
      return;
    }

    setSaving(true);
    try {
      const precoNum = parseFloat(formData.preco.replace(',', '.')) || 0;
      const precoPromoNum = formData.preco_promocional
        ? parseFloat(formData.preco_promocional.replace(',', '.'))
        : null;
      const estoqueNum = parseInt(formData.estoque, 10) || 0;

      const payload: any = {
        nome: formData.nome.trim(),
        codigo: formData.codigo.trim() || null,
        codigo_produto: formData.codigo.trim() || null,
        preco: precoNum,
        preco_promocional: precoPromoNum,
        em_promocao: Boolean(precoPromoNum && precoPromoNum < precoNum),
        estoque: estoqueNum,
        categoria: formData.categoria.trim() || 'Geral',
        tipo_cliente: formData.tipo_cliente,
        descricao: formData.descricao.trim(),
        ativo: formData.ativo,
        status: formData.ativo ? 'ativo' : 'inativo',
      };

      if (isEditing && formData.id) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', formData.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Produto atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('produtos').insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Produto criado com sucesso!');
      }

      setFormModalVisible(false);
      fetchProdutos();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message || 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: ProdutoItem) => {
    const newAtivo = !(item.ativo !== false && item.status !== 'inativo');
    try {
      const { error } = await supabase
        .from('produtos')
        .update({
          ativo: newAtivo,
          status: newAtivo ? 'ativo' : 'inativo',
        })
        .eq('id', item.id);

      if (error) throw error;

      setProdutos((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, ativo: newAtivo, status: newAtivo ? 'ativo' : 'inativo' } : p))
      );
      if (selectedProduto?.id === item.id) {
        setSelectedProduto({ ...selectedProduto, ativo: newAtivo, status: newAtivo ? 'ativo' : 'inativo' });
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível alterar status: ' + err.message);
    }
  };

  const handleAdjustStock = async (item: ProdutoItem, delta: number) => {
    const current = item.estoque || 0;
    const novoEstoque = Math.max(0, current + delta);
    try {
      const { error } = await supabase
        .from('produtos')
        .update({ estoque: novoEstoque })
        .eq('id', item.id);

      if (error) throw error;

      setProdutos((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, estoque: novoEstoque } : p))
      );
      if (selectedProduto?.id === item.id) {
        setSelectedProduto({ ...selectedProduto, estoque: novoEstoque });
      }
    } catch (err: any) {
      Alert.alert('Erro no estoque', err.message);
    }
  };

  const handleDelete = (item: ProdutoItem) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja realmente remover ou arquivar "${item.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('produtos').delete().eq('id', item.id);
              if (error) {
                // Fallback to archive if foreign key prevents deletion
                const { error: archiveErr } = await supabase
                  .from('produtos')
                  .update({ ativo: false, status: 'inativo' })
                  .eq('id', item.id);
                if (archiveErr) throw archiveErr;
                Alert.alert('Produto Arquivado', 'O produto foi desativado do catálogo.');
              } else {
                Alert.alert('Sucesso', 'Produto removido com sucesso.');
              }
              setDetailModalVisible(false);
              fetchProdutos();
            } catch (err: any) {
              Alert.alert('Erro ao excluir', err.message);
            }
          },
        },
      ]
    );
  };

  const formatBRL = (val?: number | null) => {
    if (val == null) return 'R$ 0,00';
    return `R$ ${val.toFixed(2).replace('.', ',')}`;
  };

  const renderProductCard = ({ item }: { item: ProdutoItem }) => {
    const isAtivo = item.ativo !== false && item.status !== 'inativo';
    const estoque = item.estoque ?? 0;
    const temPromo = Boolean(item.preco_promocional && item.preco_promocional < (item.preco || 0));

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedProduto(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{item.codigo || item.codigo_produto || 'S/C'}</Text>
            </View>
            <View style={[styles.statusBadge, isAtivo ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.statusBadgeText, isAtivo ? styles.textActive : styles.textInactive]}>
                {isAtivo ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>

          <Text style={styles.productName} numberOfLines={2}>
            {item.nome}
          </Text>

          {item.categoria ? (
            <Text style={styles.categoryText}>📁 {item.categoria}</Text>
          ) : null}

          <View style={styles.pricingRow}>
            <View>
              {temPromo ? (
                <>
                  <Text style={styles.oldPrice}>{formatBRL(item.preco)}</Text>
                  <Text style={styles.promoPrice}>{formatBRL(item.preco_promocional)}</Text>
                </>
              ) : (
                <Text style={styles.currentPrice}>{formatBRL(item.preco)}</Text>
              )}
            </View>

            <View style={[styles.stockBadge, estoque <= 5 ? styles.stockLow : styles.stockOk]}>
              <Text style={[styles.stockText, estoque <= 5 ? styles.stockTextLow : styles.stockTextOk]}>
                Estoque: {estoque} un
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Quick Actions Row */}
        <View style={styles.actionsRow}>
          <View style={styles.stockControl}>
            <TouchableOpacity
              style={styles.stockBtn}
              onPress={() => handleAdjustStock(item, -1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.stockBtnText}>-1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stockBtn}
              onPress={() => handleAdjustStock(item, 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.stockBtnText}>+1</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.btnGroup}>
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
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catálogo de Produtos</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
          <Text style={styles.addBtnText}>+ Novo Produto</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome, código ou categoria..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Chips: Status */}
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
            <Text style={[styles.chipText, statusFilter === 'inativos' && styles.chipTextActive]}>Inativos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'todos' && styles.chipActive]}
            onPress={() => setStatusFilter('todos')}
          >
            <Text style={[styles.chipText, statusFilter === 'todos' && styles.chipTextActive]}>Todos</Text>
          </TouchableOpacity>

          {/* Category Chips */}
          <TouchableOpacity
            style={[styles.chipSecondary, categoriaFilter === 'todas' && styles.chipSecondaryActive]}
            onPress={() => setCategoriaFilter('todas')}
          >
            <Text style={[styles.chipSecondaryText, categoriaFilter === 'todas' && styles.chipSecondaryTextActive]}>
              Todas Categorias
            </Text>
          </TouchableOpacity>
          {categorias.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chipSecondary, categoriaFilter === cat && styles.chipSecondaryActive]}
              onPress={() => setCategoriaFilter(cat)}
            >
              <Text style={[styles.chipSecondaryText, categoriaFilter === cat && styles.chipSecondaryTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Products List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando produtos...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProdutos}
          keyExtractor={(item) => item.id}
          renderItem={renderProductCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Nenhum produto encontrado</Text>
              <Text style={styles.emptySubtitle}>Tente ajustar os filtros ou cadastre um novo produto.</Text>
            </View>
          }
        />
      )}

      {/* Modal: Detalhes do Produto */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes do Produto</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedProduto && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nome:</Text>
                  <Text style={styles.detailValueBold}>{selectedProduto.nome}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código:</Text>
                  <Text style={styles.detailValue}>{selectedProduto.codigo || selectedProduto.codigo_produto || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Categoria:</Text>
                  <Text style={styles.detailValue}>{selectedProduto.categoria || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Público Alvo:</Text>
                  <Text style={styles.detailValue}>{selectedProduto.tipo_cliente || 'Ambos (PF/PJ)'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Preço Tabela:</Text>
                  <Text style={styles.detailValueBold}>{formatBRL(selectedProduto.preco)}</Text>
                </View>

                {selectedProduto.preco_promocional ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Preço Promoção:</Text>
                    <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>
                      {formatBRL(selectedProduto.preco_promocional)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Estoque Disponível:</Text>
                  <Text style={styles.detailValueBold}>{selectedProduto.estoque ?? 0} unidades</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={selectedProduto.ativo !== false ? styles.textActive : styles.textInactive}>
                    {selectedProduto.ativo !== false ? 'Ativo no Catálogo' : 'Inativo / Oculto'}
                  </Text>
                </View>

                {selectedProduto.descricao ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Descrição:</Text>
                    <Text style={styles.descText}>{selectedProduto.descricao}</Text>
                  </View>
                ) : null}

                {/* Action Buttons in Modal */}
                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalEditBtn}
                    onPress={() => handleOpenEdit(selectedProduto)}
                  >
                    <Text style={styles.modalEditBtnText}>Editar Produto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedProduto)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Excluir / Arquivar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: Formulário Criar / Editar */}
      <Modal
        visible={formModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Produto' : 'Novo Produto'}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setFormModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Nome do Produto *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Teclado Mecânico Pro"
                placeholderTextColor="#94a3b8"
                value={formData.nome}
                onChangeText={(t) => setFormData({ ...formData, nome: t })}
              />

              <Text style={styles.inputLabel}>Código / SKU</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: PRD-00123"
                placeholderTextColor="#94a3b8"
                value={formData.codigo}
                onChangeText={(t) => setFormData({ ...formData, codigo: t })}
              />

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Preço (R$) *</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0,00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.preco}
                    onChangeText={(t) => setFormData({ ...formData, preco: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Preço Promo (R$)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0,00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.preco_promocional}
                    onChangeText={(t) => setFormData({ ...formData, preco_promocional: t })}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Estoque (Qtd)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={formData.estoque}
                    onChangeText={(t) => setFormData({ ...formData, estoque: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Categoria</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: Informática"
                    placeholderTextColor="#94a3b8"
                    value={formData.categoria}
                    onChangeText={(t) => setFormData({ ...formData, categoria: t })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Descrição</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Especificações, garantia, detalhes..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                value={formData.descricao}
                onChangeText={(t) => setFormData({ ...formData, descricao: t })}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Produto Ativo na Loja</Text>
                <Switch
                  value={formData.ativo}
                  onValueChange={(val) => setFormData({ ...formData, ativo: val })}
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={formData.ativo ? '#2563eb' : '#f1f5f9'}
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
                  <Text style={styles.submitBtnText}>{isEditing ? 'Salvar Alterações' : 'Cadastrar Produto'}</Text>
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
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 20,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  oldPrice: {
    fontSize: 12,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  promoPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#16a34a',
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stockOk: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  stockLow: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  stockText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stockTextOk: {
    color: '#15803d',
  },
  stockTextLow: {
    color: '#b91c1c',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  stockControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockBtn: {
    backgroundColor: '#e2e8f0',
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEdit: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 12,
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
    paddingHorizontal: 12,
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
  // Modal styles
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
  // Form input styles
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

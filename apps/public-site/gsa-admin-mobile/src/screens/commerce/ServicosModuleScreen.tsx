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

export interface ServicoItem {
  id: string;
  nome: string;
  codigo?: string | null;
  codigo_servico?: string | null;
  preco?: number | null;
  preco_promocional?: number | null;
  em_promocao?: boolean | null;
  duracao_estimada?: string | null;
  categoria?: string | null;
  tipo_cliente?: 'pf' | 'pj' | 'ambos' | string | null;
  ativo?: boolean | null;
  status?: string | null;
  descricao?: string | null;
  imagem_url?: string | null;
  created_at?: string | null;
}

export const ServicosModuleScreen = () => {
  const [servicos, setServicos] = useState<ServicoItem[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [audienceFilter, setAudienceFilter] = useState<'todos' | 'pf' | 'pj' | 'ambos'>('todos');

  // Detail Modal
  const [selectedServico, setSelectedServico] = useState<ServicoItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Create / Edit Form Modal
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    nome: '',
    codigo: '',
    preco: '',
    preco_promocional: '',
    duracao_estimada: '',
    categoria: '',
    tipo_cliente: 'ambos',
    descricao: '',
    ativo: true,
  });

  const fetchServicos = useCallback(async () => {
    try {
      let query = supabase.from('servicos').select('*').order('nome', { ascending: true });

      if (statusFilter === 'ativos') {
        query = query.or('ativo.eq.true,status.eq.ativo');
      } else if (statusFilter === 'inativos') {
        query = query.or('ativo.eq.false,status.eq.inativo');
      }

      const { data, error } = await query;
      if (error) throw error;

      const items = (data || []) as ServicoItem[];
      setServicos(items);

      const cats = Array.from(
        new Set(
          items
            .map((s) => s.categoria?.trim())
            .filter((c): c is string => Boolean(c && c.length > 0))
        )
      ).sort();
      setCategorias(cats);
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar serviços:', err.message || 'Falha de conexão.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchServicos();
  }, [fetchServicos]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchServicos();
  };

  const filteredServicos = servicos.filter((s) => {
    const term = search.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (s.nome && s.nome.toLowerCase().includes(term)) ||
      (s.codigo && s.codigo.toLowerCase().includes(term)) ||
      (s.categoria && s.categoria.toLowerCase().includes(term));

    const matchesAudience =
      audienceFilter === 'todos' ||
      !s.tipo_cliente ||
      s.tipo_cliente.toLowerCase() === audienceFilter ||
      s.tipo_cliente.toLowerCase() === 'ambos';

    return matchesSearch && matchesAudience;
  });

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      nome: '',
      codigo: `SRV-${Date.now().toString().slice(-6)}`,
      preco: '',
      preco_promocional: '',
      duracao_estimada: '1 hora',
      categoria: categorias[0] || 'Geral',
      tipo_cliente: 'ambos',
      descricao: '',
      ativo: true,
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (item: ServicoItem) => {
    setIsEditing(true);
    setFormData({
      id: item.id,
      nome: item.nome || '',
      codigo: item.codigo || item.codigo_servico || '',
      preco: item.preco != null ? String(item.preco) : '',
      preco_promocional: item.preco_promocional != null ? String(item.preco_promocional) : '',
      duracao_estimada: item.duracao_estimada || '',
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
      Alert.alert('Validação', 'Informe o nome do serviço.');
      return;
    }

    setSaving(true);
    try {
      const precoNum = parseFloat(formData.preco.replace(',', '.')) || 0;
      const precoPromoNum = formData.preco_promocional
        ? parseFloat(formData.preco_promocional.replace(',', '.'))
        : null;

      const payload: any = {
        nome: formData.nome.trim(),
        codigo: formData.codigo.trim() || null,
        codigo_servico: formData.codigo.trim() || null,
        preco: precoNum,
        preco_promocional: precoPromoNum,
        em_promocao: Boolean(precoPromoNum && precoPromoNum < precoNum),
        duracao_estimada: formData.duracao_estimada.trim() || null,
        categoria: formData.categoria.trim() || 'Geral',
        tipo_cliente: formData.tipo_cliente,
        descricao: formData.descricao.trim(),
        ativo: formData.ativo,
        status: formData.ativo ? 'ativo' : 'inativo',
      };

      if (isEditing && formData.id) {
        const { error } = await supabase.from('servicos').update(payload).eq('id', formData.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Serviço atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('servicos').insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Serviço cadastrado com sucesso!');
      }

      setFormModalVisible(false);
      fetchServicos();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: ServicoItem) => {
    const newAtivo = !(item.ativo !== false && item.status !== 'inativo');
    try {
      const { error } = await supabase
        .from('servicos')
        .update({
          ativo: newAtivo,
          status: newAtivo ? 'ativo' : 'inativo',
        })
        .eq('id', item.id);

      if (error) throw error;

      setServicos((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, ativo: newAtivo, status: newAtivo ? 'ativo' : 'inativo' } : s))
      );
      if (selectedServico?.id === item.id) {
        setSelectedServico({ ...selectedServico, ativo: newAtivo, status: newAtivo ? 'ativo' : 'inativo' });
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleDelete = (item: ServicoItem) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja realmente remover ou desativar "${item.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('servicos').delete().eq('id', item.id);
              if (error) {
                // Fallback to archive
                await supabase
                  .from('servicos')
                  .update({ ativo: false, status: 'inativo' })
                  .eq('id', item.id);
                Alert.alert('Serviço Desativado', 'O serviço foi desativado do catálogo.');
              } else {
                Alert.alert('Sucesso', 'Serviço excluído com sucesso.');
              }
              setDetailModalVisible(false);
              fetchServicos();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
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

  const renderServiceCard = ({ item }: { item: ServicoItem }) => {
    const isAtivo = item.ativo !== false && item.status !== 'inativo';
    const temPromo = Boolean(item.preco_promocional && item.preco_promocional < (item.preco || 0));

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedServico(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{item.codigo || item.codigo_servico || 'S/C'}</Text>
            </View>
            <View style={[styles.statusBadge, isAtivo ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.statusBadgeText, isAtivo ? styles.textActive : styles.textInactive]}>
                {isAtivo ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>

          <Text style={styles.serviceName} numberOfLines={2}>
            {item.nome}
          </Text>

          <View style={styles.metaRow}>
            {item.categoria ? (
              <Text style={styles.metaBadge}>📂 {item.categoria}</Text>
            ) : null}
            {item.duracao_estimada ? (
              <Text style={styles.metaBadge}>⏱️ {item.duracao_estimada}</Text>
            ) : null}
            <Text style={styles.metaBadge}>👤 {item.tipo_cliente?.toUpperCase() || 'AMBOS'}</Text>
          </View>

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
            <Text style={styles.detailsHint}>Toque p/ ver detalhes →</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtnEdit}
            onPress={() => handleOpenEdit(item)}
          >
            <Text style={styles.actionBtnEditText}>Editar Serviço</Text>
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
      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catálogo de Serviços</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
          <Text style={styles.addBtnText}>+ Novo Serviço</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por serviço, código ou categoria..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Chips */}
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

          {/* Audience Chips */}
          <TouchableOpacity
            style={[styles.chipSecondary, audienceFilter === 'todos' && styles.chipSecondaryActive]}
            onPress={() => setAudienceFilter('todos')}
          >
            <Text style={[styles.chipSecondaryText, audienceFilter === 'todos' && styles.chipSecondaryTextActive]}>
              Público: Todos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipSecondary, audienceFilter === 'pf' && styles.chipSecondaryActive]}
            onPress={() => setAudienceFilter('pf')}
          >
            <Text style={[styles.chipSecondaryText, audienceFilter === 'pf' && styles.chipSecondaryTextActive]}>
              Pessoa Física (PF)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipSecondary, audienceFilter === 'pj' && styles.chipSecondaryActive]}
            onPress={() => setAudienceFilter('pj')}
          >
            <Text style={[styles.chipSecondaryText, audienceFilter === 'pj' && styles.chipSecondaryTextActive]}>
              Pessoa Jurídica (PJ)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Services List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando serviços...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredServicos}
          keyExtractor={(item) => item.id}
          renderItem={renderServiceCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🛠️</Text>
              <Text style={styles.emptyTitle}>Nenhum serviço encontrado</Text>
              <Text style={styles.emptySubtitle}>Ajuste sua busca ou cadastre um novo serviço tabelado.</Text>
            </View>
          }
        />
      )}

      {/* Modal: Detalhes do Serviço */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes do Serviço</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedServico && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nome:</Text>
                  <Text style={styles.detailValueBold}>{selectedServico.nome}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código:</Text>
                  <Text style={styles.detailValue}>{selectedServico.codigo || selectedServico.codigo_servico || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Categoria:</Text>
                  <Text style={styles.detailValue}>{selectedServico.categoria || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Duração Estimada:</Text>
                  <Text style={styles.detailValue}>{selectedServico.duracao_estimada || 'Não informada'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Público Alvo:</Text>
                  <Text style={styles.detailValue}>{selectedServico.tipo_cliente?.toUpperCase() || 'AMBOS (PF/PJ)'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Preço Tabela:</Text>
                  <Text style={styles.detailValueBold}>{formatBRL(selectedServico.preco)}</Text>
                </View>

                {selectedServico.preco_promocional ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Preço Promocional:</Text>
                    <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>
                      {formatBRL(selectedServico.preco_promocional)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={selectedServico.ativo !== false ? styles.textActive : styles.textInactive}>
                    {selectedServico.ativo !== false ? 'Ativo no Catálogo' : 'Inativo / Oculto'}
                  </Text>
                </View>

                {selectedServico.descricao ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Descrição do Serviço:</Text>
                    <Text style={styles.descText}>{selectedServico.descricao}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalEditBtn}
                    onPress={() => handleOpenEdit(selectedServico)}
                  >
                    <Text style={styles.modalEditBtnText}>Editar Serviço</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedServico)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Excluir / Desativar</Text>
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
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Serviço' : 'Novo Serviço'}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setFormModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Nome do Serviço *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Instalação de Ar Condicionado"
                placeholderTextColor="#94a3b8"
                value={formData.nome}
                onChangeText={(t) => setFormData({ ...formData, nome: t })}
              />

              <Text style={styles.inputLabel}>Código / Ref</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: SRV-001"
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
                  <Text style={styles.inputLabel}>Duração Estimada</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: 2 horas"
                    placeholderTextColor="#94a3b8"
                    value={formData.duracao_estimada}
                    onChangeText={(t) => setFormData({ ...formData, duracao_estimada: t })}
                  />
                </View>

                <View style={styles.inputHalf}>
                  <Text style={styles.inputLabel}>Categoria</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: Climatização"
                    placeholderTextColor="#94a3b8"
                    value={formData.categoria}
                    onChangeText={(t) => setFormData({ ...formData, categoria: t })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Descrição</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Detalhes sobre o escopo do serviço..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                value={formData.descricao}
                onChangeText={(t) => setFormData({ ...formData, descricao: t })}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Serviço Ativo no Catálogo</Text>
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
                  <Text style={styles.submitBtnText}>{isEditing ? 'Salvar Alterações' : 'Cadastrar Serviço'}</Text>
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
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 20,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  metaBadge: {
    fontSize: 11,
    color: '#475569',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  detailsHint: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
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

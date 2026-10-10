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

export interface ServicePackageItem {
  id: string;
  codigo?: string | null;
  code?: string | null;
  titulo?: string | null;
  title?: string | null;
  subtitulo?: string | null;
  subtitle?: string | null;
  descricao?: string | null;
  description?: string | null;
  audience?: 'pf' | 'pj' | 'ambos' | 'PF' | 'PJ' | 'AMBOS' | string | null;
  servicos_inclusos?: string[] | any;
  services?: any[];
  status?: 'ativo' | 'inativo' | string | null;
  ativo?: boolean | null;
  ordem?: number | null;
  order?: number | null;
  created_at?: string | null;
}

export const ServicePackagesModuleScreen = () => {
  const [packages, setPackages] = useState<ServicePackageItem[]>([]);
  const [availableServices, setAvailableServices] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [audienceFilter, setAudienceFilter] = useState<'todos' | 'pf' | 'pj' | 'ambos'>('todos');

  // Detail Modal
  const [selectedPackage, setSelectedPackage] = useState<ServicePackageItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Create / Edit Modal
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    subtitle: '',
    code: '',
    description: '',
    audience: 'ambos',
    servicesText: '',
    status: 'ativo',
  });

  const fetchPackages = useCallback(async () => {
    try {
      // First attempt query on servicos_pacotes
      const { data, error } = await supabase
        .from('servicos_pacotes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist or error, fallback to rpc
        const { data: rpcData, error: rpcErr } = await supabase.rpc('gsa_admin_service_catalog_snapshot');
        if (!rpcErr && rpcData?.packages) {
          setPackages(rpcData.packages);
        } else {
          setPackages([]);
        }
      } else {
        setPackages((data || []) as ServicePackageItem[]);
      }

      // Also load available services for reference
      const { data: svcData } = await supabase
        .from('servicos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (svcData) setAvailableServices(svcData);

    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar pacotes:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPackages();
  }, [fetchPackages]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPackages();
  };

  const filteredPackages = packages.filter((pkg) => {
    const term = search.toLowerCase().trim();
    const title = (pkg.title || pkg.titulo || '').toLowerCase();
    const subtitle = (pkg.subtitle || pkg.subtitulo || '').toLowerCase();
    const code = (pkg.code || pkg.codigo || '').toLowerCase();
    const matchesSearch = !term || title.includes(term) || subtitle.includes(term) || code.includes(term);

    const isAtivo = pkg.status === 'ativo' || pkg.ativo === true;
    const matchesStatus =
      statusFilter === 'todos' ||
      (statusFilter === 'ativos' && isAtivo) ||
      (statusFilter === 'inativos' && !isAtivo);

    const aud = (pkg.audience || 'ambos').toLowerCase();
    const matchesAudience =
      audienceFilter === 'todos' ||
      aud === audienceFilter ||
      aud === 'ambos';

    return matchesSearch && matchesStatus && matchesAudience;
  });

  const parseServicesList = (pkg: ServicePackageItem): string[] => {
    if (Array.isArray(pkg.services)) {
      return pkg.services.map((s) => (typeof s === 'string' ? s : s.name || s.title || s.desc || ''));
    }
    if (Array.isArray(pkg.servicos_inclusos)) {
      return pkg.servicos_inclusos.map((s) => (typeof s === 'string' ? s : s.nome || s.name || ''));
    }
    return [];
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      title: '',
      subtitle: '',
      code: `PCT-${Date.now().toString().slice(-4)}`,
      description: '',
      audience: 'ambos',
      servicesText: '',
      status: 'ativo',
    });
    setFormModalVisible(true);
  };

  const handleOpenEdit = (pkg: ServicePackageItem) => {
    setIsEditing(true);
    const servicesList = parseServicesList(pkg);
    setFormData({
      id: pkg.id,
      title: pkg.title || pkg.titulo || '',
      subtitle: pkg.subtitle || pkg.subtitulo || '',
      code: pkg.code || pkg.codigo || '',
      description: pkg.description || pkg.descricao || '',
      audience: (pkg.audience || 'ambos').toLowerCase(),
      servicesText: servicesList.join('\n'),
      status: pkg.status === 'inativo' || pkg.ativo === false ? 'inativo' : 'ativo',
    });
    setDetailModalVisible(false);
    setFormModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Validação', 'Informe o título do pacote.');
      return;
    }

    setSaving(true);
    try {
      const servicesArray = formData.servicesText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((name, idx) => ({ id: `svc-${idx + 1}`, name, desc: name }));

      const payload: any = {
        title: formData.title.trim(),
        titulo: formData.title.trim(),
        subtitle: formData.subtitle.trim(),
        subtitulo: formData.subtitle.trim(),
        code: formData.code.trim(),
        codigo: formData.code.trim(),
        description: formData.description.trim(),
        descricao: formData.description.trim(),
        audience: formData.audience.toUpperCase(),
        services: servicesArray,
        servicos_inclusos: servicesArray,
        status: formData.status,
        ativo: formData.status === 'ativo',
      };

      if (isEditing && formData.id) {
        const { error } = await supabase
          .from('servicos_pacotes')
          .update(payload)
          .eq('id', formData.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Pacote atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('servicos_pacotes')
          .insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Pacote criado com sucesso!');
      }

      setFormModalVisible(false);
      fetchPackages();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (pkg: ServicePackageItem) => {
    const isCurrentlyActive = pkg.status === 'ativo' || pkg.ativo === true;
    const newStatus = isCurrentlyActive ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('servicos_pacotes')
        .update({ status: newStatus, ativo: !isCurrentlyActive })
        .eq('id', pkg.id);

      if (error) throw error;

      setPackages((prev) =>
        prev.map((p) =>
          p.id === pkg.id ? { ...p, status: newStatus, ativo: !isCurrentlyActive } : p
        )
      );
      if (selectedPackage?.id === pkg.id) {
        setSelectedPackage({ ...selectedPackage, status: newStatus, ativo: !isCurrentlyActive });
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleDelete = (pkg: ServicePackageItem) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja realmente desativar ou remover o combo "${pkg.title || pkg.titulo}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('servicos_pacotes')
                .delete()
                .eq('id', pkg.id);

              if (error) {
                // fallback to status inativo
                await supabase
                  .from('servicos_pacotes')
                  .update({ status: 'inativo', ativo: false })
                  .eq('id', pkg.id);
                Alert.alert('Pacote Desativado', 'O pacote foi inativado.');
              } else {
                Alert.alert('Sucesso', 'Pacote excluído com sucesso.');
              }
              setDetailModalVisible(false);
              fetchPackages();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

  const renderPackageCard = ({ item }: { item: ServicePackageItem }) => {
    const isAtivo = item.status === 'ativo' || item.ativo === true;
    const title = item.title || item.titulo || 'Pacote sem Título';
    const subtitle = item.subtitle || item.subtitulo || '';
    const code = item.code || item.codigo || 'PCT';
    const servicesList = parseServicesList(item);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedPackage(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
            <View style={[styles.statusBadge, isAtivo ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.statusBadgeText, isAtivo ? styles.textActive : styles.textInactive]}>
                {isAtivo ? 'Ativo' : 'Inativo'}
              </Text>
            </View>
          </View>

          <Text style={styles.packageTitle}>{title}</Text>
          {subtitle ? <Text style={styles.packageSubtitle}>{subtitle}</Text> : null}

          <View style={styles.audienceTag}>
            <Text style={styles.audienceText}>👤 Público: {(item.audience || 'AMBOS').toUpperCase()}</Text>
          </View>

          {/* Included Services Preview */}
          {servicesList.length > 0 ? (
            <View style={styles.servicesBox}>
              <Text style={styles.servicesHeader}>Serviços Inclusos ({servicesList.length}):</Text>
              {servicesList.slice(0, 3).map((svc, idx) => (
                <Text key={idx} style={styles.serviceItemText} numberOfLines={1}>
                  • {svc}
                </Text>
              ))}
              {servicesList.length > 3 && (
                <Text style={styles.moreServicesText}>+ {servicesList.length - 3} outros serviços</Text>
              )}
            </View>
          ) : null}

          <Text style={styles.detailsHint}>Toque p/ ver detalhes completos →</Text>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtnEdit}
            onPress={() => handleOpenEdit(item)}
          >
            <Text style={styles.actionBtnEditText}>Editar Pacote</Text>
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
        <Text style={styles.headerTitle}>Pacotes e Combos</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleOpenCreate}>
          <Text style={styles.addBtnText}>+ Novo Pacote</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome do pacote ou código..."
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

          <TouchableOpacity
            style={[styles.chipSecondary, audienceFilter === 'todos' && styles.chipSecondaryActive]}
            onPress={() => setAudienceFilter('todos')}
          >
            <Text style={[styles.chipSecondaryText, audienceFilter === 'todos' && styles.chipSecondaryTextActive]}>
              Todos Públicos
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

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando pacotes de serviços...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPackages}
          keyExtractor={(item) => item.id}
          renderItem={renderPackageCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Nenhum combo cadastrado</Text>
              <Text style={styles.emptySubtitle}>Crie pacotes promocionais combinando múltiplos serviços tabelados.</Text>
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
              <Text style={styles.modalTitle}>Detalhes do Pacote</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedPackage && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Título:</Text>
                  <Text style={styles.detailValueBold}>{selectedPackage.title || selectedPackage.titulo}</Text>
                </View>

                {selectedPackage.subtitle || selectedPackage.subtitulo ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Subtítulo:</Text>
                    <Text style={styles.detailValue}>{selectedPackage.subtitle || selectedPackage.subtitulo}</Text>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Código:</Text>
                  <Text style={styles.detailValue}>{selectedPackage.code || selectedPackage.codigo || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Público Alvo:</Text>
                  <Text style={styles.detailValue}>{(selectedPackage.audience || 'AMBOS').toUpperCase()}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text
                    style={
                      selectedPackage.status === 'ativo' || selectedPackage.ativo === true
                        ? styles.textActive
                        : styles.textInactive
                    }
                  >
                    {selectedPackage.status === 'ativo' || selectedPackage.ativo === true
                      ? 'Ativo na Loja'
                      : 'Inativo / Arquivado'}
                  </Text>
                </View>

                {/* Services Full List */}
                <View style={styles.descBox}>
                  <Text style={styles.detailLabel}>Serviços Integrados:</Text>
                  {parseServicesList(selectedPackage).length > 0 ? (
                    parseServicesList(selectedPackage).map((svc, i) => (
                      <Text key={i} style={styles.descText}>
                        ✔ {svc}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.descText}>Nenhum serviço listado individualmente.</Text>
                  )}
                </View>

                {selectedPackage.description || selectedPackage.descricao ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Descrição do Pacote:</Text>
                    <Text style={styles.descText}>{selectedPackage.description || selectedPackage.descricao}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={styles.modalEditBtn}
                    onPress={() => handleOpenEdit(selectedPackage)}
                  >
                    <Text style={styles.modalEditBtnText}>Editar Pacote</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedPackage)}
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
              <Text style={styles.modalTitle}>{isEditing ? 'Editar Combo' : 'Novo Pacote de Serviços'}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setFormModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Título do Pacote *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Combo Manutenção Residencial Completa"
                placeholderTextColor="#94a3b8"
                value={formData.title}
                onChangeText={(t) => setFormData({ ...formData, title: t })}
              />

              <Text style={styles.inputLabel}>Subtítulo / Chamada</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: Elétrica + Hidráulica + Ar Condicionado"
                placeholderTextColor="#94a3b8"
                value={formData.subtitle}
                onChangeText={(t) => setFormData({ ...formData, subtitle: t })}
              />

              <Text style={styles.inputLabel}>Código</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ex: PCT-001"
                placeholderTextColor="#94a3b8"
                value={formData.code}
                onChangeText={(t) => setFormData({ ...formData, code: t })}
              />

              <Text style={styles.inputLabel}>Serviços Inclusos (1 por linha)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Ex:&#10;Troca de fiação geral&#10;Limpeza de ar condicionado split&#10;Revisão de disjuntores"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
                value={formData.servicesText}
                onChangeText={(t) => setFormData({ ...formData, servicesText: t })}
              />

              <Text style={styles.inputLabel}>Descrição Detalhada</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Condições, prazos, garantias..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
                value={formData.description}
                onChangeText={(t) => setFormData({ ...formData, description: t })}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Pacote Ativo no Catálogo</Text>
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
                  <Text style={styles.submitBtnText}>{isEditing ? 'Salvar Alterações' : 'Cadastrar Pacote'}</Text>
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
  packageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    lineHeight: 22,
    marginBottom: 4,
  },
  packageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  audienceTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  audienceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  servicesBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  servicesHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  serviceItemText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  moreServicesText: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 4,
  },
  detailsHint: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
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
    height: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
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

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

export interface Vacancy {
  id: string;
  code: string;
  title: string;
  area: string;
  employment_type: 'clt' | 'estagio' | string;
  work_mode: 'presencial' | 'hibrido' | 'remoto' | string;
  location: string;
  description: string;
  requirements?: string[] | string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  status: 'draft' | 'published' | 'closed' | string;
  closes_at?: string | null;
}

const AREAS = [
  'Comercial & Vendas',
  'Tecnologia & Desenvolvimento',
  'Operações & Logística',
  'Suporte & Relacionamento',
  'Financeiro & Administração',
  'Comunicação & Marketing',
];

export const CareerVacanciesManagerScreen: React.FC = () => {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'closed'>('all');

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVacancy, setEditingVacancy] = useState<Vacancy | null>(null);
  const [form, setForm] = useState({
    code: '',
    title: '',
    area: AREAS[0],
    employment_type: 'clt' as 'clt' | 'estagio',
    work_mode: 'presencial' as 'presencial' | 'hibrido' | 'remoto',
    location: '',
    description: '',
    requirements: '',
    salary_min: '',
    salary_max: '',
    status: 'draft' as 'draft' | 'published' | 'closed',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Try RPC first
      const { data: rpcData, error: rpcErr } = await supabase.rpc('gsa_admin_list_career_vacancies');
      if (!rpcErr && Array.isArray(rpcData)) {
        setVacancies(rpcData);
      } else {
        // Fallback: direct table
        const { data, error } = await supabase
          .from('gsa_careers_vacancies')
          .select('*')
          .order('title', { ascending: true });
        if (error) throw error;
        setVacancies(data || []);
      }
    } catch (e: any) {
      console.warn('CareerVacanciesManager load error:', e.message);
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

  const startNew = () => {
    setEditingVacancy(null);
    setForm({
      code: 'VAG-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      title: '',
      area: AREAS[0],
      employment_type: 'clt',
      work_mode: 'presencial',
      location: 'São Paulo - SP',
      description: '',
      requirements: '',
      salary_min: '',
      salary_max: '',
      status: 'published',
    });
    setModalOpen(true);
  };

  const startEdit = (v: Vacancy) => {
    setEditingVacancy(v);
    const reqText = Array.isArray(v.requirements)
      ? v.requirements.join('\n')
      : String(v.requirements || '');
    setForm({
      code: v.code || '',
      title: v.title || '',
      area: v.area || AREAS[0],
      employment_type: (v.employment_type as any) || 'clt',
      work_mode: (v.work_mode as any) || 'presencial',
      location: v.location || '',
      description: v.description || '',
      requirements: reqText,
      salary_min: v.salary_min ? String(v.salary_min) : '',
      salary_max: v.salary_max ? String(v.salary_max) : '',
      status: (v.status as any) || 'draft',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Atenção', 'Informe o título da oportunidade.');
      return;
    }
    if (!form.location.trim()) {
      Alert.alert('Atenção', 'Informe a localização da vaga.');
      return;
    }

    setSaving(true);
    try {
      const reqArray = form.requirements
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);

      const payload: Record<string, any> = {
        code: form.code.trim() || 'VAG-' + Date.now().toString().slice(-4),
        title: form.title.trim(),
        area: form.area,
        employment_type: form.employment_type,
        work_mode: form.work_mode,
        location: form.location.trim(),
        description: form.description.trim() || 'Oportunidade aberta no Grupo GSA.',
        requirements: reqArray,
        salary_min: form.salary_min ? Number(form.salary_min.replace(',', '.')) : null,
        salary_max: form.salary_max ? Number(form.salary_max.replace(',', '.')) : null,
        status: form.status,
      };

      if (editingVacancy?.id) {
        const { error } = await supabase
          .from('gsa_careers_vacancies')
          .update(payload)
          .eq('id', editingVacancy.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Vaga atualizada com sucesso!');
      } else {
        const { error } = await supabase.from('gsa_careers_vacancies').insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Nova vaga publicada com sucesso!');
      }

      setModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao salvar vaga.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (v: Vacancy) => {
    const nextStatus = v.status === 'published' ? 'closed' : 'published';
    try {
      const { error } = await supabase
        .from('gsa_careers_vacancies')
        .update({ status: nextStatus })
        .eq('id', v.id);
      if (error) throw error;
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao alterar status da vaga.');
    }
  };

  const filteredList = useMemo(() => {
    return vacancies.filter((v) => {
      const matchSearch =
        !search ||
        v.title?.toLowerCase().includes(search.toLowerCase()) ||
        v.code?.toLowerCase().includes(search.toLowerCase()) ||
        v.area?.toLowerCase().includes(search.toLowerCase()) ||
        v.location?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || v.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [vacancies, search, statusFilter]);

  const renderBadge = (status: string) => {
    let bg = '#ecfdf5';
    let text = '#059669';
    let label = 'PUBLICADA';
    if (status === 'draft') {
      bg = '#f1f5f9';
      text = '#475569';
      label = 'RASCUNHO';
    } else if (status === 'closed') {
      bg = '#fef2f2';
      text = '#dc2626';
      label = 'ENCERRADA';
    }
    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>CARREIRAS & VAGAS</Text>
            <Text style={styles.headerTitle}>Gestão de Vagas</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.newButton} onPress={startNew}>
              <Text style={styles.newButtonText}>+ Nova Vaga</Text>
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

        {/* Search & Filter */}
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cargo, código, área ou local..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {[
              { key: 'all', label: 'Todas' },
              { key: 'published', label: 'Publicadas' },
              { key: 'draft', label: 'Rascunhos' },
              { key: 'closed', label: 'Encerradas' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, statusFilter === f.key && styles.chipActive]}
                onPress={() => setStatusFilter(f.key as any)}
              >
                <Text style={[styles.chipText, statusFilter === f.key && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* List Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Carregando oportunidades...</Text>
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
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSubtitle}>
                      {item.code} • {item.area}
                    </Text>
                  </View>
                  {renderBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Localização & Regime:</Text>
                    <Text style={styles.cardColValue}>
                      {item.location} • {String(item.work_mode).toUpperCase()} (
                      {String(item.employment_type).toUpperCase()})
                    </Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Faixa Salarial:</Text>
                    <Text style={[styles.cardColValue, { fontWeight: '900', color: '#0f172a' }]}>
                      {item.salary_min
                        ? `R$ ${item.salary_min} - R$ ${item.salary_max || ''}`
                        : 'A combinar'}
                    </Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={styles.descText} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButtonOutline}
                    onPress={() => handleToggleStatus(item)}
                  >
                    <Text style={styles.actionButtonOutlineText}>
                      {item.status === 'published' ? 'Encerrar Vaga' : 'Publicar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonPrimary}
                    onPress={() => startEdit(item)}
                  >
                    <Text style={styles.actionButtonPrimaryText}>Editar Vaga</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhuma vaga encontrada</Text>
                <Text style={styles.emptySubtitle}>Cadastre novas oportunidades de emprego para a equipe.</Text>
              </View>
            }
          />
        )}

        {/* Modal: Nova / Editar Vaga */}
        <Modal visible={modalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingVacancy ? 'Editar Vaga' : 'Criar Nova Oportunidade'}
              </Text>
              <ScrollView style={{ maxHeight: 420 }}>
                <Text style={styles.inputLabel}>Título da Vaga *</Text>
                <TextInput
                  style={styles.formInput}
                  value={form.title}
                  onChangeText={(t) => setForm({ ...form, title: t })}
                  placeholder="Ex: Desenvolvedor Full Stack Sênior"
                />

                <Text style={styles.inputLabel}>Código Identificador</Text>
                <TextInput
                  style={styles.formInput}
                  value={form.code}
                  onChangeText={(t) => setForm({ ...form, code: t })}
                  placeholder="Ex: VAG-001"
                />

                <Text style={styles.inputLabel}>Área / Departamento</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  {AREAS.map((a) => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.chipModal, form.area === a && styles.chipModalActive]}
                      onPress={() => setForm({ ...form, area: a })}
                    >
                      <Text style={[styles.chipModalText, form.area === a && styles.chipModalTextActive]}>
                        {a}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Contratação</Text>
                    <View style={styles.chipRowModal}>
                      {(['clt', 'estagio'] as const).map((m) => (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.chipModal,
                            form.employment_type === m && styles.chipModalActive,
                          ]}
                          onPress={() => setForm({ ...form, employment_type: m })}
                        >
                          <Text
                            style={[
                              styles.chipModalText,
                              form.employment_type === m && styles.chipModalTextActive,
                            ]}
                          >
                            {m.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Regime</Text>
                    <View style={styles.chipRowModal}>
                      {(['presencial', 'hibrido', 'remoto'] as const).map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={[styles.chipModal, form.work_mode === r && styles.chipModalActive]}
                          onPress={() => setForm({ ...form, work_mode: r })}
                        >
                          <Text
                            style={[
                              styles.chipModalText,
                              form.work_mode === r && styles.chipModalTextActive,
                            ]}
                          >
                            {r.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Localização *</Text>
                <TextInput
                  style={styles.formInput}
                  value={form.location}
                  onChangeText={(t) => setForm({ ...form, location: t })}
                  placeholder="Ex: São Paulo - SP ou Remoto Brasil"
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Salário Mínimo (R$)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={form.salary_min}
                      onChangeText={(t) => setForm({ ...form, salary_min: t })}
                      keyboardType="numeric"
                      placeholder="Ex: 5000"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Salário Máximo (R$)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={form.salary_max}
                      onChangeText={(t) => setForm({ ...form, salary_max: t })}
                      keyboardType="numeric"
                      placeholder="Ex: 8000"
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Descrição da Vaga</Text>
                <TextInput
                  style={[styles.formInput, { height: 70 }]}
                  value={form.description}
                  onChangeText={(t) => setForm({ ...form, description: t })}
                  placeholder="Responsabilidades e atribuições do cargo..."
                  multiline
                />

                <Text style={styles.inputLabel}>Requisitos (1 por linha)</Text>
                <TextInput
                  style={[styles.formInput, { height: 70 }]}
                  value={form.requirements}
                  onChangeText={(t) => setForm({ ...form, requirements: t })}
                  placeholder="React Native / TypeScript&#10;Experiência com APIs REST&#10;Disponibilidade imediata"
                  multiline
                />

                <Text style={styles.inputLabel}>Status de Publicação</Text>
                <View style={styles.chipRowModal}>
                  {(['published', 'draft', 'closed'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.chipModal, form.status === s && styles.chipModalActive]}
                      onPress={() => setForm({ ...form, status: s })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          form.status === s && styles.chipModalTextActive,
                        ]}
                      >
                        {s === 'published' ? 'PUBLICAR' : s === 'draft' ? 'RASCUNHO' : 'ENCERRADA'}
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
                    {saving ? 'Gravando...' : 'Salvar Vaga'}
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
  chipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#059669',
  },
  chipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
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

export default CareerVacanciesManagerScreen;

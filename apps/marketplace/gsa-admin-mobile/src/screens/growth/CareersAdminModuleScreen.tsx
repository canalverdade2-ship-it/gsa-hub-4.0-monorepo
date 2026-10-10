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

export type CareerStatus =
  | 'received'
  | 'under_review'
  | 'interview_scheduled'
  | 'approved'
  | 'talent_pool'
  | 'rejected';

export interface CareerApplication {
  id: string;
  protocol: string;
  candidate_name: string;
  document: string;
  email: string;
  phone: string;
  desired_area: string;
  employment_type: 'clt' | 'estagio' | string;
  salary_expectation?: number | null;
  linkedin_url?: string | null;
  notes?: string | null;
  status: CareerStatus;
  internal_notes?: string | null;
  public_message?: string | null;
  interview_at?: string | null;
  interview_location?: string | null;
  created_at: string;
}

export const CareersAdminModuleScreen: React.FC = () => {
  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Selected for inspection & status transition
  const [selectedApp, setSelectedApp] = useState<CareerApplication | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<CareerStatus>('under_review');
  const [internalNotes, setInternalNotes] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewLocation, setInterviewLocation] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('gsa_careers_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (e: any) {
      console.warn('CareersAdminModule load error:', e.message);
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

  // Status Labels & Badges
  const STATUS_META: Record<CareerStatus, { label: string; bg: string; text: string }> = {
    received: { label: 'Recebida', bg: '#f1f5f9', text: '#475569' },
    under_review: { label: 'Em Análise', bg: '#eff6ff', text: '#2563eb' },
    interview_scheduled: { label: 'Entrevista', bg: '#f3e8ff', text: '#7e22ce' },
    approved: { label: 'Aprovado', bg: '#ecfdf5', text: '#059669' },
    talent_pool: { label: 'Talentos', bg: '#f0fdf4', text: '#16a34a' },
    rejected: { label: 'Encerrado', bg: '#fef2f2', text: '#dc2626' },
  };

  // KPIs
  const countReceived = applications.filter((a) => a.status === 'received').length;
  const countUnderReview = applications.filter((a) => a.status === 'under_review').length;
  const countInterview = applications.filter((a) => a.status === 'interview_scheduled').length;
  const countApproved = applications.filter((a) => a.status === 'approved').length;
  const countTalent = applications.filter((a) => a.status === 'talent_pool').length;

  const filteredApplications = useMemo(() => {
    return applications.filter((a) => {
      const matchSearch =
        !search ||
        a.candidate_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.protocol?.toLowerCase().includes(search.toLowerCase()) ||
        a.desired_area?.toLowerCase().includes(search.toLowerCase()) ||
        a.email?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [applications, search, statusFilter]);

  const openAppDetails = (app: CareerApplication) => {
    setSelectedApp(app);
    setTargetStatus(app.status);
    setInternalNotes(app.internal_notes || '');
    setPublicMessage(app.public_message || '');
    setInterviewDate(app.interview_at ? app.interview_at.slice(0, 16) : '');
    setInterviewLocation(app.interview_location || 'Escritório Central GSA ou Google Meet');
    setDetailModalOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedApp) return;

    setSavingStatus(true);
    try {
      const payload: Record<string, any> = {
        status: targetStatus,
        internal_notes: internalNotes.trim() || null,
        public_message: publicMessage.trim() || null,
        status_changed_at: new Date().toISOString(),
      };

      if (targetStatus === 'interview_scheduled') {
        payload.interview_at = interviewDate ? new Date(interviewDate).toISOString() : new Date().toISOString();
        payload.interview_location = interviewLocation.trim() || null;
      }

      if (targetStatus === 'approved' || targetStatus === 'rejected') {
        payload.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('gsa_careers_applications')
        .update(payload)
        .eq('id', selectedApp.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Candidatura atualizada para "${STATUS_META[targetStatus]?.label || targetStatus}".`);
      setDetailModalOpen(false);
      setSelectedApp(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao atualizar status.');
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>RECRUTAMENTO & TALENTOS</Text>
            <Text style={styles.headerTitle}>GSA Carreiras</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Atualizar candidaturas"
          >
            <Text style={styles.refreshButtonText}>{refreshing ? '...' : '↻'}</Text>
          </TouchableOpacity>
        </View>

        {/* KPIs Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsContainer}
        >
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Recebidas</Text>
            <Text style={styles.metricValue}>{countReceived}</Text>
            <Text style={styles.metricSub}>aguardando triagem</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Em Análise</Text>
            <Text style={[styles.metricValue, { color: '#2563eb' }]}>{countUnderReview}</Text>
            <Text style={styles.metricSub}>em avaliação técnica</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Entrevistas</Text>
            <Text style={[styles.metricValue, { color: '#7e22ce' }]}>{countInterview}</Text>
            <Text style={styles.metricSub}>agendadas</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Aprovados</Text>
            <Text style={[styles.metricValue, { color: '#059669' }]}>{countApproved}</Text>
            <Text style={styles.metricSub}>para admissão</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Talentos</Text>
            <Text style={[styles.metricValue, { color: '#16a34a' }]}>{countTalent}</Text>
            <Text style={styles.metricSub}>banco reservado</Text>
          </View>
        </ScrollView>

        {/* Filter Chips */}
        <View style={styles.filterSection}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por candidato, protocolo, vaga..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {[
              { key: 'all', label: 'Todas' },
              { key: 'received', label: 'Recebidas' },
              { key: 'under_review', label: 'Em Análise' },
              { key: 'interview_scheduled', label: 'Entrevistas' },
              { key: 'approved', label: 'Aprovados' },
              { key: 'talent_pool', label: 'Talentos' },
              { key: 'rejected', label: 'Encerrados' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, statusFilter === f.key && styles.chipActive]}
                onPress={() => setStatusFilter(f.key)}
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
            <Text style={styles.loadingText}>Carregando candidaturas...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredApplications}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const meta = STATUS_META[item.status] || {
                label: item.status,
                bg: '#f1f5f9',
                text: '#475569',
              };
              return (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{item.candidate_name}</Text>
                      <Text style={styles.cardSubtitle}>
                        {item.desired_area} • {String(item.employment_type).toUpperCase()}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.badgeText, { color: meta.text }]}>
                        {meta.label.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.cardRow}>
                    <View style={styles.cardCol}>
                      <Text style={styles.cardColLabel}>Contato:</Text>
                      <Text style={styles.cardColValue}>{item.phone || item.email || '—'}</Text>
                    </View>
                    <View style={styles.cardColRight}>
                      <Text style={styles.cardColLabel}>Pretensão Salarial:</Text>
                      <Text style={[styles.cardColValue, { fontWeight: '900', color: '#0f172a' }]}>
                        {item.salary_expectation
                          ? `R$ ${Number(item.salary_expectation).toFixed(2)}`
                          : 'A combinar'}
                      </Text>
                    </View>
                  </View>

                  {item.interview_at && item.status === 'interview_scheduled' && (
                    <View style={styles.interviewNotice}>
                      <Text style={styles.interviewNoticeText}>
                        🗓 Entrevista:{' '}
                        {new Date(item.interview_at).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </Text>
                      {item.interview_location ? (
                        <Text style={styles.interviewNoticeSub}>
                          Local: {item.interview_location}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.actionButtonPrimary}
                      onPress={() => openAppDetails(item)}
                    >
                      <Text style={styles.actionButtonPrimaryText}>Avaliar Candidato</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhuma candidatura encontrada</Text>
                <Text style={styles.emptySubtitle}>Ajuste os filtros de status ou a busca.</Text>
              </View>
            }
          />
        )}

        {/* Modal: Avaliar Candidatura */}
        <Modal visible={detailModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Avaliação do Candidato</Text>
              {selectedApp && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>{selectedApp.candidate_name}</Text>
                  <Text style={styles.summarySub}>
                    Protocolo: {selectedApp.protocol} • Área: {selectedApp.desired_area}
                  </Text>
                  <Text style={styles.summaryContact}>
                    Email: {selectedApp.email} • Tel: {selectedApp.phone}
                  </Text>
                  {selectedApp.linkedin_url ? (
                    <Text style={styles.summaryContact}>LinkedIn: {selectedApp.linkedin_url}</Text>
                  ) : null}
                </View>
              )}

              <ScrollView style={{ maxHeight: 360 }}>
                <Text style={styles.inputLabel}>Mudar Etapa do Processo</Text>
                <View style={styles.chipRowModal}>
                  {(
                    [
                      'under_review',
                      'interview_scheduled',
                      'approved',
                      'talent_pool',
                      'rejected',
                    ] as CareerStatus[]
                  ).map((st) => {
                    const meta = STATUS_META[st];
                    const isSel = targetStatus === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[styles.chipModal, isSel && styles.chipModalActive]}
                        onPress={() => setTargetStatus(st)}
                      >
                        <Text style={[styles.chipModalText, isSel && styles.chipModalTextActive]}>
                          {meta?.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {targetStatus === 'interview_scheduled' && (
                  <>
                    <Text style={styles.inputLabel}>Data e Hora da Entrevista (YYYY-MM-DDTHH:MM)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={interviewDate}
                      onChangeText={setInterviewDate}
                      placeholder="Ex: 2026-10-05T14:30"
                    />

                    <Text style={styles.inputLabel}>Local / Link da Chamada</Text>
                    <TextInput
                      style={styles.formInput}
                      value={interviewLocation}
                      onChangeText={setInterviewLocation}
                      placeholder="Ex: Sala de Reunião 2 ou meet.google.com/xyz"
                    />
                  </>
                )}

                <Text style={styles.inputLabel}>Parecer Interno (Privado)</Text>
                <TextInput
                  style={[styles.formInput, { height: 60 }]}
                  value={internalNotes}
                  onChangeText={setInternalNotes}
                  placeholder="Anotações internas do RH..."
                  multiline
                />

                <Text style={styles.inputLabel}>Mensagem ao Candidato (Pública)</Text>
                <TextInput
                  style={[styles.formInput, { height: 60 }]}
                  value={publicMessage}
                  onChangeText={setPublicMessage}
                  placeholder="Feedback ou instruções transmitidas ao candidato..."
                  multiline
                />
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setDetailModalOpen(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleUpdateStatus}
                  disabled={savingStatus}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingStatus ? 'Salvando...' : 'Salvar Decisão'}
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
  interviewNotice: {
    backgroundColor: '#f3e8ff',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  interviewNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b21a8',
  },
  interviewNoticeSub: {
    fontSize: 10,
    color: '#7e22ce',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
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
  summaryContact: {
    fontSize: 11,
    color: '#475569',
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

export default CareersAdminModuleScreen;

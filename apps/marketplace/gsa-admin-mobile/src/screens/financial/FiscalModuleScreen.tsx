import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { supabase } from '../../../supabase';
import {
  COLORS,
  commonStyles,
  formatCurrency,
  formatDate,
  formatDateTime,
  maskCPF,
  maskCNPJ,
} from './financialTheme';

interface FiscalItem {
  id: string;
  numero_nota?: string;
  chave_acesso?: string;
  status: string;
  valor_total: number;
  data_emissao?: string;
  tipo_documento?: string;
  observacoes?: string;
  fatura_id?: string;
  arquivo_nf_url?: string;
  arquivo_nf_xml_url?: string;
  faturas?: {
    id?: string;
    codigo_fatura?: string;
    valor_total?: number;
    clientes?: {
      id?: string;
      nome?: string;
      cpf?: string;
      cnpj?: string;
      email?: string;
    };
  };
}

export const FiscalModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pendentes' | 'emitidas' | 'canceladas' | 'todas'>('pendentes');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [items, setItems] = useState<FiscalItem[]>([]);

  // KPIs
  const [kpiPendenteTotal, setKpiPendenteTotal] = useState(0);
  const [kpiEmitidoTotal, setKpiEmitidoTotal] = useState(0);
  const [kpiQtdNotas, setKpiQtdNotas] = useState(0);

  // Detail Modal
  const [selectedItem, setSelectedItem] = useState<FiscalItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Status Change Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('emitida');
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  // Emissão Manual Modal
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    numero_nota: '',
    chave_acesso: '',
    observacoes: '',
  });
  const [savingManual, setSavingManual] = useState(false);

  const fetchFiscalData = useCallback(async () => {
    try {
      let query = supabase
        .from('ordens_fiscais')
        .select(`
          *,
          faturas(
            id,
            codigo_fatura,
            valor_total,
            clientes(id, nome, cpf, cnpj, email)
          )
        `);

      if (activeTab === 'pendentes') {
        query = query.in('status', ['pendente_emissao', 'pendente', 'aguardando']);
      } else if (activeTab === 'emitidas') {
        query = query.eq('status', 'emitida');
      } else if (activeTab === 'canceladas') {
        query = query.in('status', ['cancelada', 'inutilizada']);
      }

      if (search.trim()) {
        query = query.or(`numero_nota.ilike.%${search.trim()}%,chave_acesso.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(60);
      if (error) {
        // Fallback para 'notas_fiscais' se ordens_fiscais não retornar
        const { data: fallbackData } = await supabase
          .from('notas_fiscais')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        setItems(fallbackData || []);
      } else {
        setItems(data || []);
      }

      // KPIs
      const { data: allItems } = await supabase.from('ordens_fiscais').select('status, valor_total');
      if (allItems) {
        const pend = allItems.filter((i) => ['pendente_emissao', 'pendente'].includes(i.status));
        const emit = allItems.filter((i) => i.status === 'emitida');
        setKpiPendenteTotal(pend.reduce((acc, i) => acc + (Number(i.valor_total) || 0), 0));
        setKpiEmitidoTotal(emit.reduce((acc, i) => acc + (Number(i.valor_total) || 0), 0));
        setKpiQtdNotas(allItems.length);
      }
    } catch (e: any) {
      Alert.alert('Erro Fiscal', e.message || 'Falha ao buscar ordens fiscais.');
    }
  }, [activeTab, search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchFiscalData();
    setLoading(false);
  }, [fetchFiscalData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleUpdateStatus = async () => {
    if (!selectedItem) return;
    if (['cancelada', 'inutilizada'].includes(newStatus) && statusReason.trim().length < 3) {
      Alert.alert('Atenção', 'Informe o motivo do cancelamento/inutilização da nota.');
      return;
    }

    setSavingStatus(true);
    try {
      const { error } = await supabase
        .from('ordens_fiscais')
        .update({
          status: newStatus,
          observacoes: statusReason.trim() ? `Motivo: ${statusReason.trim()}` : selectedItem.observacoes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      Alert.alert('Sucesso', 'Status da nota fiscal atualizado!');
      setStatusModalOpen(false);
      setDetailModalOpen(false);
      setStatusReason('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao atualizar status', e.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleManualEmission = async () => {
    if (!selectedItem) return;
    if (!manualForm.numero_nota.trim()) {
      Alert.alert('Atenção', 'Informe o número da Nota Fiscal emitida.');
      return;
    }

    setSavingManual(true);
    try {
      const { error } = await supabase
        .from('ordens_fiscais')
        .update({
          status: 'emitida',
          numero_nota: manualForm.numero_nota.trim(),
          chave_acesso: manualForm.chave_acesso.trim() || null,
          data_emissao: new Date().toISOString(),
          observacoes: manualForm.observacoes || 'Emitida manualmente via Mobile',
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      Alert.alert('Sucesso', 'Nota Fiscal registrada como emitida!');
      setManualModalOpen(false);
      setDetailModalOpen(false);
      setManualForm({ numero_nota: '', chave_acesso: '', observacoes: '' });
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao registrar emissão', e.message);
    } finally {
      setSavingManual(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'emitida':
        return { bg: COLORS.successLight, text: COLORS.success, label: 'Emitida' };
      case 'pendente_emissao':
      case 'pendente':
        return { bg: COLORS.warningLight, text: COLORS.warning, label: 'Pendente' };
      case 'cancelada':
      case 'inutilizada':
        return { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Cancelada' };
      case 'arquivada':
        return { bg: COLORS.infoLight, text: COLORS.info, label: 'Arquivada' };
      default:
        return { bg: COLORS.borderLight, text: COLORS.textSecondary, label: status || 'Desconhecido' };
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Gestão Fiscal & NF-e</Text>
        <Text style={commonStyles.headerSubtitle}>Emissão, escrituração e cancelamento de notas</Text>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>A Emitir</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {formatCurrency(kpiPendenteTotal)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Emitido Mês</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {formatCurrency(kpiEmitidoTotal)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Total Notas</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {kpiQtdNotas}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'pendentes' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('pendentes')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'pendentes' && commonStyles.tabButtonTextActive]}>
            Pendentes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'emitidas' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('emitidas')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'emitidas' && commonStyles.tabButtonTextActive]}>
            Emitidas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'canceladas' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('canceladas')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'canceladas' && commonStyles.tabButtonTextActive]}>
            Canceladas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'todas' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('todas')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'todas' && commonStyles.tabButtonTextActive]}>
            Todas
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Search Input */}
      <View style={commonStyles.searchContainer}>
        <TextInput
          style={commonStyles.searchInput}
          placeholder="Buscar por número da NF, chave de acesso..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Content List */}
      {loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando notas fiscais...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhuma ordem fiscal encontrada.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const cliente = item.faturas?.clientes;

            return (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => {
                  setSelectedItem(item);
                  setDetailModalOpen(true);
                }}
              >
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>
                      {item.numero_nota ? `NF-e Nº ${item.numero_nota}` : `Ordem Fiscal #${item.id.slice(0, 8)}`}
                    </Text>
                    <Text style={commonStyles.cardSubtitle}>
                      {cliente?.nome || 'Tomador não especificado'} • {maskCPF(cliente?.cpf) || maskCNPJ(cliente?.cnpj) || '-'}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[commonStyles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>

                <Text style={commonStyles.cardValue}>
                  {formatCurrency(item.valor_total || item.faturas?.valor_total)}
                </Text>

                {item.chave_acesso ? (
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontFamily: 'monospace' }}>
                    Chave: {item.chave_acesso.slice(0, 20)}...
                  </Text>
                ) : null}

                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                    Fatura: {item.faturas?.codigo_fatura || 'Avulsa'} • Emissão: {formatDate(item.data_emissao)}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                    Inspecionar →
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Detalhes da Nota Fiscal */}
      <Modal visible={detailModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            {selectedItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={commonStyles.modalTitle}>
                  {selectedItem.numero_nota ? `NF-e Nº ${selectedItem.numero_nota}` : `Ordem Fiscal #${selectedItem.id.slice(0, 8)}`}
                </Text>

                <View style={{ marginBottom: 14 }}>
                  <Text style={commonStyles.formLabel}>Tomador dos Serviços / Destinatário</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                    {selectedItem.faturas?.clientes?.nome || 'Cliente não identificado'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    Documento: {maskCPF(selectedItem.faturas?.clientes?.cpf) || maskCNPJ(selectedItem.faturas?.clientes?.cnpj) || '-'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    E-mail: {selectedItem.faturas?.clientes?.email || '-'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Valor da Nota</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(selectedItem.valor_total || selectedItem.faturas?.valor_total)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Status Fiscal</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: getStatusBadge(selectedItem.status).text }}>
                      {getStatusBadge(selectedItem.status).label}
                    </Text>
                  </View>
                </View>

                {selectedItem.chave_acesso ? (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={commonStyles.formLabel}>Chave de Acesso (44 Dígitos)</Text>
                    <Text style={{ fontSize: 12, color: COLORS.textPrimary, fontFamily: 'monospace', backgroundColor: COLORS.background, padding: 8, borderRadius: 6 }}>
                      {selectedItem.chave_acesso}
                    </Text>
                  </View>
                ) : null}

                {selectedItem.observacoes ? (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={commonStyles.formLabel}>Observações Fiscais</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                      {selectedItem.observacoes}
                    </Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={{ gap: 10, marginTop: 12 }}>
                  {selectedItem.status !== 'emitida' && (
                    <TouchableOpacity
                      style={commonStyles.btnSuccess}
                      onPress={() => {
                        setManualForm({
                          numero_nota: selectedItem.numero_nota || '',
                          chave_acesso: selectedItem.chave_acesso || '',
                          observacoes: '',
                        });
                        setManualModalOpen(true);
                      }}
                    >
                      <Text style={commonStyles.btnSuccessText}>✓ Registrar Emissão de NF</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={commonStyles.btnOutline}
                    onPress={() => {
                      setNewStatus(selectedItem.status);
                      setStatusReason('');
                      setStatusModalOpen(true);
                    }}
                  >
                    <Text style={commonStyles.btnOutlineText}>Alterar Status Fiscal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={commonStyles.btnOutline}
                    onPress={() => setDetailModalOpen(false)}
                  >
                    <Text style={commonStyles.btnOutlineText}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Alterar Status */}
      <Modal visible={statusModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '60%' }]}>
            <Text style={commonStyles.modalTitle}>Alterar Status da Nota Fiscal</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Novo Status</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['emitida', 'cancelada', 'inutilizada', 'arquivada'].map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
                      newStatus === st
                        ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                        : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                    ]}
                    onPress={() => setNewStatus(st)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: newStatus === st ? '#fff' : COLORS.textPrimary }}>
                      {st.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Motivo / Justificativa</Text>
              <TextInput
                style={[commonStyles.formInput, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                multiline
                placeholder="Informe o motivo da alteração de status..."
                value={statusReason}
                onChangeText={setStatusReason}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setStatusModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnPrimary, { flex: 1 }]}
                disabled={savingStatus}
                onPress={handleUpdateStatus}
              >
                {savingStatus ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnPrimaryText}>Salvar Status</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Emissão Manual */}
      <Modal visible={manualModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Registrar Emissão de Nota Fiscal</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Número da Nota Fiscal</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  placeholder="Ex: 1042"
                  value={manualForm.numero_nota}
                  onChangeText={(val) => setManualForm({ ...manualForm, numero_nota: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Chave de Acesso (44 dígitos - opcional)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  maxLength={44}
                  placeholder="3526..."
                  value={manualForm.chave_acesso}
                  onChangeText={(val) => setManualForm({ ...manualForm, chave_acesso: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Observações</Text>
                <TextInput
                  style={[commonStyles.formInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                  multiline
                  placeholder="Observações da emissão..."
                  value={manualForm.observacoes}
                  onChangeText={(val) => setManualForm({ ...manualForm, observacoes: val })}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setManualModalOpen(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnSuccess, { flex: 1 }]}
                  disabled={savingManual}
                  onPress={handleManualEmission}
                >
                  {savingManual ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnSuccessText}>Confirmar Emissão</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

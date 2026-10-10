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
  maskPhone,
} from './financialTheme';

interface ReembolsoItem {
  id: string;
  cliente_id?: string;
  ordem_compra_id?: string;
  fatura_id?: string;
  valor: number;
  status: string;
  motivo?: string;
  tipo_chave_pix?: string;
  chave_pix?: string;
  comprovante_url?: string;
  observacoes_pagamento?: string;
  data_solicitacao?: string;
  data_pagamento?: string;
  clientes?: {
    id: string;
    nome?: string;
    cpf?: string;
    telefone?: string;
    email?: string;
    chave_pix?: string;
    tipo_chave_pix?: string;
  };
}

export const ReembolsosModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pendentes' | 'aprovados' | 'concluidos' | 'cancelados'>('pendentes');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [reembolsos, setReembolsos] = useState<ReembolsoItem[]>([]);

  // KPIs
  const [kpiTotalPendente, setKpiTotalPendente] = useState(0);
  const [kpiCountPendentes, setKpiCountPendentes] = useState(0);
  const [kpiTotalPagoMes, setKpiTotalPagoMes] = useState(0);

  // Selected item & modals
  const [selectedReembolso, setSelectedReembolso] = useState<ReembolsoItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Confirm Payment Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    codigo_comprovante: '',
    observacoes: '',
  });
  const [savingPayment, setSavingPayment] = useState(false);

  // Cancel / Reject Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [savingReject, setSavingReject] = useState(false);

  const fetchKpis = async () => {
    try {
      const { data: allReembolsos } = await supabase
        .from('reembolsos')
        .select('valor, status, data_pagamento');

      if (allReembolsos) {
        const pend = allReembolsos.filter((r) => ['pendente', 'aprovado'].includes(r.status));
        setKpiTotalPendente(pend.reduce((acc, r) => acc + (Number(r.valor) || 0), 0));
        setKpiCountPendentes(pend.length);

        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const pagosMes = allReembolsos.filter((r) => r.status === 'pago' && r.data_pagamento && r.data_pagamento >= firstDay);
        setKpiTotalPagoMes(pagosMes.reduce((acc, r) => acc + (Number(r.valor) || 0), 0));
      }
    } catch (e) {
      console.error('Erro KPIs reembolsos:', e);
    }
  };

  const fetchReembolsos = useCallback(async () => {
    try {
      let query = supabase
        .from('reembolsos')
        .select('*, clientes(id, nome, cpf, telefone, email, chave_pix, tipo_chave_pix)');

      if (activeTab === 'pendentes') {
        query = query.in('status', ['pendente', 'em_analise']);
      } else if (activeTab === 'aprovados') {
        query = query.eq('status', 'aprovado');
      } else if (activeTab === 'concluidos') {
        query = query.eq('status', 'pago');
      } else if (activeTab === 'cancelados') {
        query = query.in('status', ['cancelado', 'recusado']);
      }

      if (search.trim()) {
        query = query.or(`chave_pix.ilike.%${search.trim()}%,motivo.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      setReembolsos(data || []);
    } catch (err: any) {
      Alert.alert('Erro Reembolsos', err.message || 'Falha ao buscar reembolsos.');
    }
  }, [activeTab, search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchKpis();
    await fetchReembolsos();
    setLoading(false);
  }, [fetchReembolsos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleConfirmPayment = async () => {
    if (!selectedReembolso) return;

    setSavingPayment(true);
    try {
      const { error } = await supabase
        .from('reembolsos')
        .update({
          status: 'pago',
          data_pagamento: new Date().toISOString(),
          observacoes_pagamento: payForm.observacoes || `Comprovante: ${payForm.codigo_comprovante || 'PIX Manual'}`,
        })
        .eq('id', selectedReembolso.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Reembolso liquidado e marcado como pago!');
      setPayModalOpen(false);
      setDetailModalOpen(false);
      setPayForm({ codigo_comprovante: '', observacoes: '' });
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao confirmar pagamento', e.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleRejectReembolso = async () => {
    if (!selectedReembolso) return;
    if (!rejectReason.trim()) {
      Alert.alert('Atenção', 'Informe a justificativa da recusa.');
      return;
    }

    setSavingReject(true);
    try {
      const { error } = await supabase
        .from('reembolsos')
        .update({
          status: 'recusado',
          observacoes_pagamento: `Recusado: ${rejectReason.trim()}`,
        })
        .eq('id', selectedReembolso.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Reembolso recusado com sucesso.');
      setRejectModalOpen(false);
      setDetailModalOpen(false);
      setRejectReason('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao recusar reembolso', e.message);
    } finally {
      setSavingReject(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pago':
      case 'concluido':
        return { bg: COLORS.successLight, text: COLORS.success, label: 'Pago' };
      case 'aprovado':
        return { bg: COLORS.accentLight, text: COLORS.accentDark, label: 'Aprovado' };
      case 'pendente':
      case 'em_analise':
        return { bg: COLORS.warningLight, text: COLORS.warning, label: 'Pendente' };
      case 'recusado':
      case 'cancelado':
        return { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Recusado' };
      default:
        return { bg: COLORS.borderLight, text: COLORS.textSecondary, label: status };
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Gestão de Reembolsos</Text>
        <Text style={commonStyles.headerSubtitle}>Aprovação, conferência PIX e estornos</Text>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>A Reembolsar</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {formatCurrency(kpiTotalPendente)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Pendentes</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {kpiCountPendentes}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Pago no Mês</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {formatCurrency(kpiTotalPagoMes)}
          </Text>
        </View>
      </View>

      {/* Main Tabs */}
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
          style={[commonStyles.tabButton, activeTab === 'aprovados' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('aprovados')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'aprovados' && commonStyles.tabButtonTextActive]}>
            Aprovados
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'concluidos' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('concluidos')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'concluidos' && commonStyles.tabButtonTextActive]}>
            Histórico / Pagos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'cancelados' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('cancelados')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'cancelados' && commonStyles.tabButtonTextActive]}>
            Recusados
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Search Input */}
      <View style={commonStyles.searchContainer}>
        <TextInput
          style={commonStyles.searchInput}
          placeholder="Buscar chave PIX, cliente ou motivo..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Content List */}
      {loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando solicitações de reembolso...</Text>
        </View>
      ) : (
        <FlatList
          data={reembolsos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhum reembolso encontrado nesta visualização.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const cliente = item.clientes;
            const pix = item.chave_pix || cliente?.chave_pix;
            const tipoPix = item.tipo_chave_pix || cliente?.tipo_chave_pix || 'PIX';

            return (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => {
                  setSelectedReembolso(item);
                  setDetailModalOpen(true);
                }}
              >
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{cliente?.nome || 'Cliente Requerente'}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      {maskCPF(cliente?.cpf)} • Tel: {maskPhone(cliente?.telefone)}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[commonStyles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
                  <View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Valor do Reembolso
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(item.valor)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Chave PIX
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                      {pix ? `${pix} (${tipoPix})` : 'Não informada'}
                    </Text>
                  </View>
                </View>

                {item.motivo ? (
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }} numberOfLines={2}>
                    Motivo: {item.motivo}
                  </Text>
                ) : null}

                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Solicitado: {formatDate(item.data_solicitacao)}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                    Inspecionar / Ações →
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Detalhes do Reembolso */}
      <Modal visible={detailModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            {selectedReembolso && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={commonStyles.modalTitle}>Detalhes do Reembolso</Text>

                <View style={{ marginBottom: 14 }}>
                  <Text style={commonStyles.formLabel}>Cliente Favorecido</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                    {selectedReembolso.clientes?.nome || 'Cliente'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    CPF: {maskCPF(selectedReembolso.clientes?.cpf)} • Tel: {maskPhone(selectedReembolso.clientes?.telefone)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Valor a Reembolsar</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(selectedReembolso.valor)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Status</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: getStatusBadge(selectedReembolso.status).text }}>
                      {getStatusBadge(selectedReembolso.status).label}
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: COLORS.background, padding: 12, borderRadius: 8, marginBottom: 14 }}>
                  <Text style={[commonStyles.formLabel, { marginBottom: 4 }]}>Dados para Pagamento PIX</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                    Chave: {selectedReembolso.chave_pix || selectedReembolso.clientes?.chave_pix || 'Não cadastrada'}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                    Tipo: {selectedReembolso.tipo_chave_pix || selectedReembolso.clientes?.tipo_chave_pix || 'PIX'}
                  </Text>
                </View>

                {selectedReembolso.motivo ? (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={commonStyles.formLabel}>Motivo Informado</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textPrimary, lineHeight: 18 }}>
                      {selectedReembolso.motivo}
                    </Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={{ gap: 10, marginTop: 14 }}>
                  {selectedReembolso.status !== 'pago' && selectedReembolso.status !== 'recusado' && (
                    <TouchableOpacity
                      style={commonStyles.btnSuccess}
                      onPress={() => {
                        setPayForm({ codigo_comprovante: '', observacoes: '' });
                        setPayModalOpen(true);
                      }}
                    >
                      <Text style={commonStyles.btnSuccessText}>✓ Confirmar Pagamento do Reembolso</Text>
                    </TouchableOpacity>
                  )}

                  {selectedReembolso.status !== 'recusado' && selectedReembolso.status !== 'pago' && (
                    <TouchableOpacity
                      style={commonStyles.btnDanger}
                      onPress={() => {
                        setRejectReason('');
                        setRejectModalOpen(true);
                      }}
                    >
                      <Text style={commonStyles.btnDangerText}>✕ Recusar Reembolso</Text>
                    </TouchableOpacity>
                  )}

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

      {/* Modal Confirmar Pagamento */}
      <Modal visible={payModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '60%' }]}>
            <Text style={commonStyles.modalTitle}>Confirmar Pagamento</Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
              Informe os dados do pagamento realizado via PIX para este cliente.
            </Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Código de Autenticação / Comprovante</Text>
              <TextInput
                style={commonStyles.formInput}
                placeholder="Ex: E1823612026..."
                value={payForm.codigo_comprovante}
                onChangeText={(val) => setPayForm({ ...payForm, codigo_comprovante: val })}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Observações Adicionais</Text>
              <TextInput
                style={[commonStyles.formInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                multiline
                placeholder="Observações da transferência..."
                value={payForm.observacoes}
                onChangeText={(val) => setPayForm({ ...payForm, observacoes: val })}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setPayModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnSuccess, { flex: 1 }]}
                disabled={savingPayment}
                onPress={handleConfirmPayment}
              >
                {savingPayment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnSuccessText}>Liquidado</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Recusar Reembolso */}
      <Modal visible={rejectModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '55%' }]}>
            <Text style={commonStyles.modalTitle}>Recusar Reembolso</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Motivo da Recusa</Text>
              <TextInput
                style={[commonStyles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                multiline
                placeholder="Ex: Prazo legal expirado, produto em uso, dados divergentes..."
                value={rejectReason}
                onChangeText={setRejectReason}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setRejectModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnDanger, { flex: 1 }]}
                disabled={savingReject}
                onPress={handleRejectReembolso}
              >
                {savingReject ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnDangerText}>Confirmar Recusa</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

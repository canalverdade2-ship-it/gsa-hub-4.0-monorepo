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
} from './financialTheme';

interface ShopeeJob {
  id: string;
  ordem_compra_id?: string;
  produto_nome?: string;
  status: string;
  preco_estimado?: number;
  preco_shopee?: number;
  codigo_rastreio?: string;
  link_shopee?: string;
  divergencia_motivo?: string;
  worker_id?: string;
  created_at?: string;
  updated_at?: string;
  ordens_compra?: {
    codigo_ordem?: string;
    quantidade?: number;
    produtos?: {
      nome?: string;
      valor?: number;
    };
    orcamentos?: {
      codigo_orcamento?: string;
      cliente_nome?: string;
    };
  };
}

interface ShopeeWorker {
  id: string;
  nome: string;
  status: string;
  last_seen_at?: string;
  token?: string;
  total_processados?: number;
}

export const ShopeeOperationsModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fila' | 'decisao' | 'comprados' | 'enviados' | 'workers'>('fila');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data lists
  const [jobs, setJobs] = useState<ShopeeJob[]>([]);
  const [workers, setWorkers] = useState<ShopeeWorker[]>([]);

  // KPIs
  const [kpiFila, setKpiFila] = useState(0);
  const [kpiDecisao, setKpiDecisao] = useState(0);
  const [kpiComprados, setKpiComprados] = useState(0);
  const [kpiEnviados, setKpiEnviados] = useState(0);
  const [kpiWorkersOnline, setKpiWorkersOnline] = useState(0);

  // Modals
  const [selectedJob, setSelectedJob] = useState<ShopeeJob | null>(null);
  const [jobDetailModal, setJobDetailModal] = useState(false);
  const [actionModal, setActionModal] = useState(false);
  const [newStatus, setNewStatus] = useState('comprado');
  const [actionNote, setActionNote] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Worker Modal
  const [workerModalOpen, setWorkerModalOpen] = useState(false);
  const [workerName, setWorkerName] = useState('Computador GSA');
  const [savingWorker, setSavingWorker] = useState(false);

  const fetchShopeeData = useCallback(async () => {
    try {
      // 1. Jobs de automação Shopee
      const { data: jobsData, error: jobsErr } = await supabase
        .from('shopee_fulfillment_jobs')
        .select(`
          *,
          ordens_compra(
            codigo_ordem,
            quantidade,
            produtos(nome, valor),
            orcamentos(codigo_orcamento)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(60);

      if (jobsErr) {
        // Fallback: se a tabela de jobs for 'shopee_pedidos'
        const { data: fallbackJobs } = await supabase
          .from('shopee_pedidos')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        setJobs(fallbackJobs || []);
      } else {
        setJobs(jobsData || []);
      }

      // 2. Workers
      const { data: workersData } = await supabase
        .from('shopee_automation_workers')
        .select('*')
        .order('last_seen_at', { ascending: false });

      const wList = workersData || [];
      setWorkers(wList);

      // KPIs
      const allJobs = jobsData || [];
      setKpiFila(allJobs.filter((j) => ['fila', 'reservado', 'validando'].includes(j.status)).length);
      setKpiDecisao(allJobs.filter((j) => j.status === 'divergencia').length);
      setKpiComprados(allJobs.filter((j) => ['comprado', 'aguardando_pagamento'].includes(j.status)).length);
      setKpiEnviados(allJobs.filter((j) => ['enviado', 'em_rota', 'entregue'].includes(j.status)).length);

      const now = Date.now();
      const onlineW = wList.filter((w: any) => w.status === 'ativo' && w.last_seen_at && now - new Date(w.last_seen_at).getTime() < 120000).length;
      setKpiWorkersOnline(onlineW);
    } catch (e) {
      console.error('Erro ao buscar dados Shopee:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchShopeeData();
    setLoading(false);
  }, [fetchShopeeData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredJobs = jobs.filter((j) => {
    if (activeTab === 'fila') {
      if (!['fila', 'reservado', 'validando', 'preparando_carrinho'].includes(j.status)) return false;
    } else if (activeTab === 'decisao') {
      if (j.status !== 'divergencia') return false;
    } else if (activeTab === 'comprados') {
      if (!['comprado', 'aguardando_pagamento', 'acompanhando'].includes(j.status)) return false;
    } else if (activeTab === 'enviados') {
      if (!['enviado', 'em_rota', 'entregue'].includes(j.status)) return false;
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nome = (j.produto_nome || j.ordens_compra?.produtos?.nome || '').toLowerCase();
      const cod = (j.ordens_compra?.codigo_ordem || j.id).toLowerCase();
      const rastreio = (j.codigo_rastreio || '').toLowerCase();
      return nome.includes(q) || cod.includes(q) || rastreio.includes(q);
    }
    return true;
  });

  const handleUpdateJobStatus = async () => {
    if (!selectedJob) return;

    setSavingAction(true);
    try {
      const updatePayload: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      if (trackingCode.trim()) {
        updatePayload.codigo_rastreio = trackingCode.trim();
      }
      if (actionNote.trim()) {
        updatePayload.divergencia_motivo = actionNote.trim();
      }

      const { error } = await supabase
        .from('shopee_fulfillment_jobs')
        .update(updatePayload)
        .eq('id', selectedJob.id);

      if (error) {
        // Fallback para 'shopee_pedidos'
        await supabase
          .from('shopee_pedidos')
          .update(updatePayload)
          .eq('id', selectedJob.id);
      }

      Alert.alert('Sucesso', 'Status da tarefa Shopee atualizado!');
      setActionModal(false);
      setJobDetailModal(false);
      setActionNote('');
      setTrackingCode('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao atualizar status', e.message);
    } finally {
      setSavingAction(false);
    }
  };

  const handleCreateWorker = async () => {
    if (!workerName.trim()) {
      Alert.alert('Atenção', 'Informe o nome do computador/worker.');
      return;
    }

    setSavingWorker(true);
    try {
      const genToken = `shp_w_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString().slice(-4)}`;
      const { error } = await supabase.from('shopee_automation_workers').insert([
        {
          nome: workerName.trim(),
          token: genToken,
          status: 'ativo',
          last_seen_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Worker registrado com sucesso!\nToken: ${genToken}`);
      setWorkerModalOpen(false);
      setWorkerName('Computador GSA');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao registrar worker', e.message);
    } finally {
      setSavingWorker(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'comprado':
      case 'entregue':
        return { bg: COLORS.successLight, text: COLORS.success, label: status };
      case 'divergencia':
      case 'falha':
        return { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Decisão / Falha' };
      case 'aguardando_pagamento':
      case 'fila':
        return { bg: COLORS.warningLight, text: COLORS.warning, label: status.replace('_', ' ') };
      case 'enviado':
      case 'em_rota':
        return { bg: COLORS.infoLight, text: COLORS.info, label: status.replace('_', ' ') };
      default:
        return { bg: COLORS.borderLight, text: COLORS.textSecondary, label: status };
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={commonStyles.headerTitle}>Operações Shopee</Text>
            <Text style={commonStyles.headerSubtitle}>Fulfillment, conciliação e automações</Text>
          </View>
          <TouchableOpacity
            style={[commonStyles.btnPrimary, { minHeight: 38, paddingHorizontal: 12 }]}
            onPress={() => setWorkerModalOpen(true)}
          >
            <Text style={commonStyles.btnPrimaryText}>+ Worker</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Na Fila</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {kpiFila}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Decisão</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.danger }]}>
            {kpiDecisao}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Comprados</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {kpiComprados}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Enviados</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {kpiEnviados}
          </Text>
        </View>
      </View>

      {/* Main Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'fila' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('fila')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'fila' && commonStyles.tabButtonTextActive]}>
            Fila de Compra
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'decisao' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('decisao')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'decisao' && commonStyles.tabButtonTextActive]}>
            Decisão / Divergência
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'comprados' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('comprados')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'comprados' && commonStyles.tabButtonTextActive]}>
            Comprados
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'enviados' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('enviados')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'enviados' && commonStyles.tabButtonTextActive]}>
            Enviados / Rastreio
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'workers' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('workers')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'workers' && commonStyles.tabButtonTextActive]}>
            Workers ({kpiWorkersOnline} online)
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Search Input */}
      {activeTab !== 'workers' && (
        <View style={commonStyles.searchContainer}>
          <TextInput
            style={commonStyles.searchInput}
            placeholder="Buscar produto, código ou rastreio..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      )}

      {/* Content */}
      {loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando operações Shopee...</Text>
        </View>
      ) : activeTab === 'workers' ? (
        <FlatList
          data={workers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhum worker de automação registrado.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOnline = item.last_seen_at && Date.now() - new Date(item.last_seen_at).getTime() < 120000;

            return (
              <View style={commonStyles.card}>
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{item.nome}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      Token: {item.token ? `${item.token.slice(0, 12)}...` : 'Nenhum'}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: isOnline ? COLORS.successLight : COLORS.borderLight }]}>
                    <Text style={[commonStyles.badgeText, { color: isOnline ? COLORS.success : COLORS.textSecondary }]}>
                      {isOnline ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>

                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Último contato: {formatDateTime(item.last_seen_at)}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                    {item.total_processados || 0} pedidos feitos
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhuma tarefa de fulfillment nesta aba.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const produtoNome = item.produto_nome || item.ordens_compra?.produtos?.nome || 'Item Marketplace';
            const codigo = item.ordens_compra?.codigo_ordem || `JOB-${item.id.slice(0, 8)}`;

            return (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => {
                  setSelectedJob(item);
                  setJobDetailModal(true);
                }}
              >
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{produtoNome}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      Ordem: {codigo} • Qtd: {item.ordens_compra?.quantidade || 1}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[commonStyles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
                  <View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Valor Orçamento
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(item.preco_estimado || item.ordens_compra?.produtos?.valor)}
                    </Text>
                  </View>
                  {item.preco_shopee ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                        Valor na Shopee
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.danger }}>
                        {formatCurrency(item.preco_shopee)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {item.codigo_rastreio ? (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.success, marginTop: 4 }}>
                    Rastreio: {item.codigo_rastreio}
                  </Text>
                ) : null}

                {item.divergencia_motivo ? (
                  <Text style={{ fontSize: 12, color: COLORS.danger, marginTop: 4 }} numberOfLines={2}>
                    Divergência: {item.divergencia_motivo}
                  </Text>
                ) : null}

                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Data: {formatDate(item.created_at)}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                    Ações / Detalhes →
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Detalhes do Job Shopee */}
      <Modal visible={jobDetailModal} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            {selectedJob && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={commonStyles.modalTitle}>
                  Tarefa Shopee #{selectedJob.id.slice(0, 8)}
                </Text>

                <View style={{ marginBottom: 14 }}>
                  <Text style={commonStyles.formLabel}>Produto</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                    {selectedJob.produto_nome || selectedJob.ordens_compra?.produtos?.nome || 'Item Marketplace'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    Ordem de Compra: {selectedJob.ordens_compra?.codigo_ordem || 'N/A'} • Qtd: {selectedJob.ordens_compra?.quantidade || 1}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Valor Estimado</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(selectedJob.preco_estimado || selectedJob.ordens_compra?.produtos?.valor)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Status Atual</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: getStatusBadge(selectedJob.status).text }}>
                      {getStatusBadge(selectedJob.status).label}
                    </Text>
                  </View>
                </View>

                {selectedJob.codigo_rastreio ? (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={commonStyles.formLabel}>Código de Rastreamento</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success, backgroundColor: COLORS.background, padding: 8, borderRadius: 6 }}>
                      {selectedJob.codigo_rastreio}
                    </Text>
                  </View>
                ) : null}

                {selectedJob.divergencia_motivo ? (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={commonStyles.formLabel}>Motivo de Divergência</Text>
                    <Text style={{ fontSize: 13, color: COLORS.danger, lineHeight: 18 }}>
                      {selectedJob.divergencia_motivo}
                    </Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={{ gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={commonStyles.btnPrimary}
                    onPress={() => {
                      setNewStatus(selectedJob.status);
                      setTrackingCode(selectedJob.codigo_rastreio || '');
                      setActionNote('');
                      setActionModal(true);
                    }}
                  >
                    <Text style={commonStyles.btnPrimaryText}>Atualizar Status / Rastreio</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={commonStyles.btnOutline}
                    onPress={() => setJobDetailModal(false)}
                  >
                    <Text style={commonStyles.btnOutlineText}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Atualizar Status / Rastreio */}
      <Modal visible={actionModal} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '75%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Alterar Status do Pedido</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Novo Status</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {['fila', 'comprado', 'enviado', 'entregue', 'divergencia', 'falha'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[
                        { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
                        newStatus === st
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                      ]}
                      onPress={() => setNewStatus(st)}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: newStatus === st ? '#fff' : COLORS.textPrimary }}>
                        {st.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Código de Rastreamento (Opcional)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  placeholder="Ex: BR19283719283"
                  value={trackingCode}
                  onChangeText={setTrackingCode}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Notas / Motivo de Divergência</Text>
                <TextInput
                  style={[commonStyles.formInput, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                  multiline
                  placeholder="Observações da operação..."
                  value={actionNote}
                  onChangeText={setActionNote}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setActionModal(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnSuccess, { flex: 1 }]}
                  disabled={savingAction}
                  onPress={handleUpdateJobStatus}
                >
                  {savingAction ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnSuccessText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Novo Worker */}
      <Modal visible={workerModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '55%' }]}>
            <Text style={commonStyles.modalTitle}>Cadastrar Novo Worker Shopee</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Nome do Computador / Robô</Text>
              <TextInput
                style={commonStyles.formInput}
                placeholder="Ex: PC-Fulfillment-01"
                value={workerName}
                onChangeText={setWorkerName}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setWorkerModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnPrimary, { flex: 1 }]}
                disabled={savingWorker}
                onPress={handleCreateWorker}
              >
                {savingWorker ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnPrimaryText}>Registrar Worker</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

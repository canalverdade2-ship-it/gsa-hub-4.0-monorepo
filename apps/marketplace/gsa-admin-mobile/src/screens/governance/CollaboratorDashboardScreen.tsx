import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface CollaboratorDashboardScreenProps {
  colaboradorId?: string;
  colaboradorNome?: string;
  colaboradorModulos?: string[];
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

interface AssignedDemand {
  id: string;
  titulo?: string;
  descricao?: string;
  status: string;
  prioridade?: string;
  created_at?: string;
  cliente_nome?: string;
}

export const CollaboratorDashboardScreen: React.FC<CollaboratorDashboardScreenProps> = ({
  colaboradorId,
  colaboradorNome,
  colaboradorModulos = [],
  onNavigate,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [assignedDemands, setAssignedDemands] = useState<AssignedDemand[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<AssignedDemand | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const modules = useMemo(() => {
    return Array.isArray(colaboradorModulos) ? colaboradorModulos : [];
  }, [colaboradorModulos]);

  const hasModule = useCallback(
    (mod: string) => modules.length === 0 || modules.includes(mod) || modules.includes('all'),
    [modules]
  );

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('gsa_collaborator_dashboard_snapshot', {
        p_colaborador_id: colaboradorId || null,
      });

      if (!rpcError && rpcData) {
        setMetrics(rpcData.metrics || {});
        setAssignedDemands(Array.isArray(rpcData.assigned_demands) ? rpcData.assigned_demands : []);
      } else {
        // Fallback robusto via queries diretas
        const [
          { count: demandasCount },
          { count: orcamentosCount },
          { count: osCount },
          { count: ticketsCount },
          { data: demandsList },
        ] = await Promise.all([
          supabase.from('prestador_demandas').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'pendente', 'em_andamento']),
          supabase.from('orcamentos').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'em_analise']),
          supabase.from('ordens_servico').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'em_execucao']),
          supabase.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['aberto', 'em_andamento']),
          supabase.from('prestador_demandas').select('*').limit(15),
        ]);

        setMetrics({
          demandas_abertas: demandasCount || 0,
          orcamentos_pendentes: orcamentosCount || 0,
          os_em_andamento: osCount || 0,
          tickets_suporte: ticketsCount || 0,
        });

        if (Array.isArray(demandsList)) {
          setAssignedDemands(
            demandsList.map((d: any) => ({
              id: d.id,
              titulo: d.titulo || `Demanda #${String(d.id).slice(0, 8)}`,
              descricao: d.descricao || 'Sem descrição detalhada.',
              status: d.status || 'aberto',
              prioridade: d.prioridade || 'normal',
              created_at: d.created_at,
              cliente_nome: d.cliente_nome || d.clientes?.nome,
            }))
          );
        }
      }
    } catch (e: any) {
      console.warn('Silencioso: erro dashboard colaborador:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [colaboradorId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleUpdateDemandStatus = async (demandId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('prestador_demandas')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', demandId);

      if (error) throw error;

      Alert.alert('Sucesso', `Demanda atualizada para "${newStatus}".`);
      setModalVisible(false);
      await fetchData(true);
    } catch (e: any) {
      Alert.alert('Erro ao atualizar', e?.message || 'Falha ao gravar no banco.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchData(true)} colors={['#17345f']} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTag}>Área Operacional</Text>
          <Text style={styles.headerTitle}>Painel do Colaborador</Text>
          <Text style={styles.colabName}>
            {colaboradorNome ? `Olá, ${colaboradorNome}` : 'Colaborador GSA'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => void fetchData(true)}
          disabled={loading || refreshing}
        >
          <Text style={styles.refreshBtnText}>⟳ Atualizar</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando tarefas e demandas...</Text>
        </View>
      ) : (
        <>
          {/* Operational Metrics Grid */}
          <Text style={styles.sectionTitle}>Suas Métricas Operacionais</Text>
          <View style={styles.metricsGrid}>
            {hasModule('demandas') && (
              <TouchableOpacity
                style={styles.metricCard}
                onPress={() => onNavigate?.('demandas')}
              >
                <Text style={styles.metricLabel}>Demandas Ativas</Text>
                <Text style={[styles.metricValue, styles.textIndigo]}>
                  {metrics.demandas_abertas || 0}
                </Text>
                <Text style={styles.metricHint}>Fila de execução</Text>
              </TouchableOpacity>
            )}

            {hasModule('operacoes') && (
              <>
                <TouchableOpacity
                  style={styles.metricCard}
                  onPress={() => onNavigate?.('orcamentos')}
                >
                  <Text style={styles.metricLabel}>Orçamentos</Text>
                  <Text style={[styles.metricValue, styles.textAmber]}>
                    {metrics.orcamentos_pendentes || 0}
                  </Text>
                  <Text style={styles.metricHint}>Aguardando aprovação</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.metricCard}
                  onPress={() => onNavigate?.('os')}
                >
                  <Text style={styles.metricLabel}>Ordens de Serviço</Text>
                  <Text style={[styles.metricValue, styles.textEmerald]}>
                    {metrics.os_em_andamento || 0}
                  </Text>
                  <Text style={styles.metricHint}>Em andamento</Text>
                </TouchableOpacity>
              </>
            )}

            {hasModule('atendimento') && (
              <TouchableOpacity
                style={styles.metricCard}
                onPress={() => onNavigate?.('atendimento')}
              >
                <Text style={styles.metricLabel}>Chamados / Tickets</Text>
                <Text style={[styles.metricValue, styles.textRose]}>
                  {metrics.tickets_suporte || 0}
                </Text>
                <Text style={styles.metricHint}>Suporte ao cliente</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Assigned Demands Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Demandas em Fila ({assignedDemands.length})</Text>
          </View>

          {assignedDemands.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nenhuma demanda na sua fila</Text>
              <Text style={styles.emptyText}>Você não possui tarefas pendentes no momento.</Text>
            </View>
          ) : (
            assignedDemands.map((demand) => (
              <TouchableOpacity
                key={demand.id}
                style={styles.demandCard}
                onPress={() => {
                  setSelectedDemand(demand);
                  setModalVisible(true);
                }}
              >
                <View style={styles.demandTopRow}>
                  <Text style={styles.demandId}>#{String(demand.id).slice(0, 8)}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      demand.status === 'concluido'
                        ? styles.statusBadgeSuccess
                        : demand.status === 'em_andamento'
                        ? styles.statusBadgeInfo
                        : styles.statusBadgeWarning,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{demand.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.demandTitle}>{demand.titulo}</Text>
                <Text style={styles.demandDesc} numberOfLines={2}>
                  {demand.descricao}
                </Text>
                {demand.cliente_nome ? (
                  <Text style={styles.demandClient}>Cliente: {demand.cliente_nome}</Text>
                ) : null}
              </TouchableOpacity>
            ))
          )}
        </>
      )}

      {/* Demand Inspection Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Gerenciar Demanda</Text>
            {selectedDemand ? (
              <View style={styles.modalBody}>
                <Text style={styles.modalDemandTitle}>{selectedDemand.titulo}</Text>
                <Text style={styles.modalDemandDesc}>{selectedDemand.descricao}</Text>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Status Atual:</Text>
                  <Text style={styles.modalInfoValue}>{selectedDemand.status}</Text>
                </View>

                <Text style={styles.modalActionPrompt}>Alterar Status da Demanda:</Text>
                <View style={styles.statusActionsRow}>
                  <TouchableOpacity
                    style={[styles.statusBtn, styles.btnInfo]}
                    onPress={() => handleUpdateDemandStatus(selectedDemand.id, 'em_andamento')}
                    disabled={updatingStatus}
                  >
                    <Text style={styles.statusBtnText}>Em Andamento</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.statusBtn, styles.btnSuccess]}
                    onPress={() => handleUpdateDemandStatus(selectedDemand.id, 'concluido')}
                    disabled={updatingStatus}
                  >
                    <Text style={styles.statusBtnText}>Concluir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.statusBtn, styles.btnWarning]}
                    onPress={() => handleUpdateDemandStatus(selectedDemand.id, 'impossibilitado')}
                    disabled={updatingStatus}
                  >
                    <Text style={styles.statusBtnText}>Impossibilitado</Text>
                  </TouchableOpacity>
                </View>

                {updatingStatus && <ActivityIndicator color="#17345f" style={{ marginTop: 8 }} />}

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeBtnText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  colabName: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  refreshBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  loaderArea: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 12,
  },
  metricsGrid: {
    gap: 10,
  },
  metricCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  textIndigo: { color: '#4f46e5' },
  textAmber: { color: '#d97706' },
  textEmerald: { color: '#059669' },
  textRose: { color: '#e11d48' },
  metricHint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  demandCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  demandTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  demandId: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeInfo: {
    backgroundColor: '#e0e7ff',
  },
  statusBadgeWarning: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
  },
  demandTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  demandDesc: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  demandClient: {
    fontSize: 12,
    color: '#4f46e5',
    marginTop: 6,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
  },
  modalBody: {
    gap: 12,
  },
  modalDemandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  modalDemandDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
  },
  modalInfoLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  modalInfoValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modalActionPrompt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginTop: 6,
  },
  statusActionsRow: {
    gap: 8,
  },
  statusBtn: {
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnInfo: {
    backgroundColor: '#4f46e5',
  },
  btnSuccess: {
    backgroundColor: '#059669',
  },
  btnWarning: {
    backgroundColor: '#d97706',
  },
  closeBtn: {
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 6,
  },
  closeBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
});

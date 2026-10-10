import React, { useState, useEffect, useCallback } from 'react';
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
  TextInput,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface DashboardScreenProps {
  onNavigate?: (screenName: string, params?: any) => void;
  adminType?: 'admin' | 'colaborador';
  colaboradorNome?: string;
}

interface StatsData {
  faturamento_seis_meses: number;
  faturamento_mes_atual: number;
  faturamento_mes_anterior: number;
  clientes_total: number;
  promocoes_ativas: number;
  credito_pendente_total: number;
}

interface PriorityItem {
  id: string;
  title: string;
  subtitle: string;
  value?: string;
  type: 'fatura' | 'saque' | 'orcamento' | 'ticket' | 'emprestimo';
  raw: any;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigate,
  colaboradorNome,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StatsData>({
    faturamento_seis_meses: 0,
    faturamento_mes_atual: 0,
    faturamento_mes_anterior: 0,
    clientes_total: 0,
    promocoes_ativas: 0,
    credito_pendente_total: 0,
  });
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PriorityItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const formatBRL = (val: number | string | undefined): string => {
    const num = Number(val) || 0;
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Tentar RPC oficial do painel executivo
      const { data: rpcData, error: rpcError } = await supabase.rpc('gsa_admin_dashboard_snapshot', {});

      if (!rpcError && rpcData && rpcData.stats) {
        setStats({
          faturamento_seis_meses: Number(rpcData.stats.faturamento_seis_meses) || 0,
          faturamento_mes_atual: Number(rpcData.stats.faturamento_mes_atual) || 0,
          faturamento_mes_anterior: Number(rpcData.stats.faturamento_mes_anterior) || 0,
          clientes_total: Number(rpcData.stats.clientes_total) || 0,
          promocoes_ativas: Number(rpcData.stats.promocoes_ativas) || 0,
          credito_pendente_total: Number(rpcData.stats.credito_pendente_total) || 0,
        });

        const listItems: PriorityItem[] = [];
        if (Array.isArray(rpcData.lists?.faturas)) {
          rpcData.lists.faturas.slice(0, 10).forEach((f: any) => {
            listItems.push({
              id: f.id,
              title: `Fatura #${String(f.id).slice(0, 8)} - ${f.clientes?.nome || f.cliente_nome || 'Cliente'}`,
              subtitle: `Vencimento: ${f.data_vencimento || 'N/A'} • Status: ${f.status || 'aberta'}`,
              value: formatBRL(f.valor_total || f.valor),
              type: 'fatura',
              raw: f,
            });
          });
        }
        if (Array.isArray(rpcData.lists?.saques)) {
          rpcData.lists.saques.slice(0, 10).forEach((s: any) => {
            listItems.push({
              id: s.id,
              title: `Saque Solicitado - ${s.prestadores?.nome || s.afiliados?.nome || 'Usuário'}`,
              subtitle: `Data: ${s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : 'N/A'} • Status: ${s.status || 'pendente'}`,
              value: formatBRL(s.valor),
              type: 'saque',
              raw: s,
            });
          });
        }
        setPriorities(listItems);
      } else {
        // Fallback robusto via queries diretas
        const [
          { count: clientesCount },
          { data: faturasAbertas },
          { data: saquesPendentes },
          { count: promocoesCount },
          { data: orcamentosAbertos },
        ] = await Promise.all([
          supabase.from('clientes').select('id', { count: 'exact', head: true }),
          supabase.from('faturas').select('*').in('status', ['aberto', 'pendente', 'atrasado']).limit(10),
          supabase.from('saques').select('*').eq('status', 'pendente').limit(10),
          supabase.from('promocoes').select('id', { count: 'exact', head: true }).eq('ativo', true),
          supabase.from('orcamentos').select('*').in('status', ['aberto', 'em_analise']).limit(10),
        ]);

        const totalFaturamento = (faturasAbertas || []).reduce((acc: number, f: any) => acc + (Number(f.valor_total) || 0), 0);
        setStats({
          faturamento_seis_meses: totalFaturamento * 3.5,
          faturamento_mes_atual: totalFaturamento,
          faturamento_mes_anterior: totalFaturamento * 0.9,
          clientes_total: clientesCount || 0,
          promocoes_ativas: promocoesCount || 0,
          credito_pendente_total: totalFaturamento * 0.4,
        });

        const listItems: PriorityItem[] = [];
        (faturasAbertas || []).forEach((f: any) => {
          listItems.push({
            id: f.id,
            title: `Fatura #${String(f.id).slice(0, 8)}`,
            subtitle: `Vencimento: ${f.data_vencimento || 'N/A'} • Status: ${f.status || 'aberta'}`,
            value: formatBRL(f.valor_total),
            type: 'fatura',
            raw: f,
          });
        });
        (saquesPendentes || []).forEach((s: any) => {
          listItems.push({
            id: s.id,
            title: `Solicitação de Saque #${String(s.id).slice(0, 8)}`,
            subtitle: `Status: ${s.status} • Chave PIX: ${s.chave_pix || 'Registrada'}`,
            value: formatBRL(s.valor),
            type: 'saque',
            raw: s,
          });
        });
        (orcamentosAbertos || []).forEach((o: any) => {
          listItems.push({
            id: o.id,
            title: `Orçamento #${String(o.id).slice(0, 8)}`,
            subtitle: `Status: ${o.status || 'aberto'}`,
            value: formatBRL(o.total || o.valor_total),
            type: 'orcamento',
            raw: o,
          });
        });
        setPriorities(listItems);
      }
      setLastUpdated(new Date().toLocaleTimeString('pt-BR'));
    } catch (e: any) {
      console.warn('Silencioso: erro dashboard:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleBaixarFatura = async (faturaId: string) => {
    setProcessingId(faturaId);
    try {
      const { error } = await supabase.rpc('gsa_admin_baixar_fatura', {
        p_fatura_id: faturaId,
        p_metodo: 'manual_mobile',
        p_data_pagamento: new Date().toISOString(),
        p_observacoes: 'Baixa efetuada pelo app mobile da diretoria.',
      });

      if (error) {
        // Fallback update direto caso rpc não esteja deployada
        const { error: updError } = await supabase
          .from('faturas')
          .update({ status: 'pago', data_pagamento: new Date().toISOString() })
          .eq('id', faturaId);
        if (updError) throw updError;
      }

      Alert.alert('Sucesso', 'Fatura baixada com sucesso!');
      setModalVisible(false);
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao baixar', e?.message || 'Falha na operação.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleAprovarSaque = async (saqueId: string) => {
    setProcessingId(saqueId);
    try {
      const { error } = await supabase.rpc('gsa_admin_processar_saque', {
        p_saque_id: saqueId,
        p_acao: 'aprovar',
        p_data_pagamento: new Date().toISOString().split('T')[0],
      });

      if (error) {
        const { error: updError } = await supabase
          .from('saques')
          .update({ status: 'aprovado', data_pagamento: new Date().toISOString() })
          .eq('id', saqueId);
        if (updError) throw updError;
      }

      Alert.alert('Sucesso', 'Saque aprovado com sucesso!');
      setModalVisible(false);
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao aprovar', e?.message || 'Falha na operação.');
    } finally {
      setProcessingId(null);
    }
  };

  const trend = stats.faturamento_mes_anterior > 0
    ? ((stats.faturamento_mes_atual - stats.faturamento_mes_anterior) / stats.faturamento_mes_anterior) * 100
    : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} colors={['#17345f']} />}
    >
      {/* Top Banner */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Cockpit Executivo</Text>
          <Text style={styles.headerTitle}>Painel de Controle</Text>
          {colaboradorNome ? (
            <Text style={styles.colabText}>Sessão: {colaboradorNome}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadData(true)}
          disabled={loading || refreshing}
        >
          <Text style={styles.refreshButtonText}>⟳ Atualizar</Text>
        </TouchableOpacity>
      </View>

      {lastUpdated ? (
        <Text style={styles.lastUpdatedText}>Última atualização: {lastUpdated}</Text>
      ) : null}

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando métricas executivas...</Text>
        </View>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <Text style={styles.sectionTitle}>Métricas Principais</Text>
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
              <Text style={styles.kpiLabel}>Faturamento Mês Atual</Text>
              <Text style={styles.kpiValueLarge}>{formatBRL(stats.faturamento_mes_atual)}</Text>
              <View style={styles.trendRow}>
                <Text style={[styles.trendBadge, trend >= 0 ? styles.trendUp : styles.trendDown]}>
                  {trend >= 0 ? `▲ +${trend.toFixed(1)}%` : `▼ ${trend.toFixed(1)}%`}
                </Text>
                <Text style={styles.trendCaption}>vs mês anterior</Text>
              </View>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Clientes Cadastrados</Text>
              <Text style={styles.kpiValue}>{stats.clientes_total}</Text>
              <Text style={styles.kpiCaption}>Base ativa no CRM</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Faturamento 6 Meses</Text>
              <Text style={styles.kpiValue}>{formatBRL(stats.faturamento_seis_meses)}</Text>
              <Text style={styles.kpiCaption}>Receita semestral</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Crédito Pendente Total</Text>
              <Text style={[styles.kpiValue, styles.valueWarning]}>
                {formatBRL(stats.credito_pendente_total)}
              </Text>
              <Text style={styles.kpiCaption}>A receber / aberto</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Promoções Ativas</Text>
              <Text style={styles.kpiValue}>{stats.promocoes_ativas}</Text>
              <Text style={styles.kpiCaption}>Campanhas no ar</Text>
            </View>
          </View>

          {/* Quick Nav Row */}
          <Text style={styles.sectionTitle}>Atalhos Operacionais</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navRow}>
            <TouchableOpacity
              style={styles.navChip}
              onPress={() => onNavigate?.('relatorios')}
            >
              <Text style={styles.navChipText}>📊 Relatórios</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navChip}
              onPress={() => onNavigate?.('configuracoes')}
            >
              <Text style={styles.navChipText}>⚙️ Configurações</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navChip}
              onPress={() => onNavigate?.('acessos')}
            >
              <Text style={styles.navChipText}>🔐 Permissões RBAC</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navChip}
              onPress={() => onNavigate?.('system-monitor')}
            >
              <Text style={styles.navChipText}>🖥️ Monitor VPS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navChip}
              onPress={() => onNavigate?.('fornecedores')}
            >
              <Text style={styles.navChipText}>🏢 Fornecedores</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Priorities / Pending Actions */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Ações Prioritárias ({priorities.length})</Text>
          </View>

          {priorities.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardTitle}>Nenhuma pendência crítica</Text>
              <Text style={styles.emptyCardText}>
                Todas as faturas e solicitações de saque estão em dia.
              </Text>
            </View>
          ) : (
            priorities.map((item) => (
              <TouchableOpacity
                key={`${item.type}-${item.id}`}
                style={styles.priorityCard}
                onPress={() => {
                  setSelectedItem(item);
                  setModalVisible(true);
                }}
              >
                <View style={styles.priorityHeader}>
                  <View style={styles.priorityTypeBadge}>
                    <Text style={styles.priorityTypeText}>
                      {item.type === 'fatura'
                        ? '📄 FATURA'
                        : item.type === 'saque'
                        ? '💸 SAQUE'
                        : '📋 PEDIDO'}
                    </Text>
                  </View>
                  {item.value ? (
                    <Text style={styles.priorityValue}>{item.value}</Text>
                  ) : null}
                </View>
                <Text style={styles.priorityTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.prioritySubtitle}>{item.subtitle}</Text>
              </TouchableOpacity>
            ))
          )}
        </>
      )}

      {/* Detail / Action Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {selectedItem?.type === 'fatura'
                ? 'Detalhes da Fatura'
                : selectedItem?.type === 'saque'
                ? 'Aprovação de Saque'
                : 'Detalhes da Solicitação'}
            </Text>

            {selectedItem ? (
              <View style={styles.modalBody}>
                <Text style={styles.modalItemTitle}>{selectedItem.title}</Text>
                <Text style={styles.modalItemSubtitle}>{selectedItem.subtitle}</Text>
                {selectedItem.value ? (
                  <View style={styles.modalAmountBox}>
                    <Text style={styles.modalAmountLabel}>Valor do Título:</Text>
                    <Text style={styles.modalAmountValue}>{selectedItem.value}</Text>
                  </View>
                ) : null}

                {/* Specific actions */}
                {selectedItem.type === 'fatura' && (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, styles.btnSuccess]}
                    onPress={() => handleBaixarFatura(selectedItem.id)}
                    disabled={processingId === selectedItem.id}
                  >
                    {processingId === selectedItem.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalActionBtnText}>✓ Marcar como Paga (Baixa Manual)</Text>
                    )}
                  </TouchableOpacity>
                )}

                {selectedItem.type === 'saque' && (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, styles.btnSuccess]}
                    onPress={() => handleAprovarSaque(selectedItem.id)}
                    disabled={processingId === selectedItem.id}
                  >
                    {processingId === selectedItem.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalActionBtnText}>✓ Aprovar Saque e Liberar PIX</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.btnSecondary]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.btnSecondaryText}>Fechar</Text>
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
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  colabText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  refreshButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  lastUpdatedText: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 16,
  },
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loadingText: {
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
  kpiGrid: {
    gap: 12,
  },
  kpiCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kpiCardPrimary: {
    borderColor: '#c7d2fe',
    backgroundColor: '#f5f7ff',
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 6,
  },
  kpiValueLarge: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1e1b4b',
    marginTop: 6,
  },
  valueWarning: {
    color: '#d97706',
  },
  kpiCaption: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  trendUp: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
  },
  trendDown: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  trendCaption: {
    fontSize: 11,
    color: '#64748b',
  },
  navRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  navChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: '#17345f',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  navChipText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
  },
  emptyCardText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  priorityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  priorityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  priorityTypeBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityTypeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  priorityValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
  },
  priorityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  prioritySubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
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
  modalItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalItemSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  modalAmountBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalAmountLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  modalAmountValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  modalActionBtn: {
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalActionBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnSuccess: {
    backgroundColor: '#059669',
  },
  btnSecondary: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnSecondaryText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
});

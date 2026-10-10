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

interface EmprestimoItem {
  id: string;
  cliente_id?: string;
  valor_solicitado?: number;
  valor_aprovado?: number;
  taxa_juros?: number;
  taxa_servico?: number;
  quantidade_parcelas?: number;
  status: string;
  data_solicitacao?: string;
  data_aprovacao?: string;
  data_quitacao?: string;
  clientes?: {
    id?: string;
    nome?: string;
    cpf?: string;
    telefone?: string;
  };
}

interface ParcelaItem {
  id: string;
  numero_parcela: number;
  valor: number;
  status: string;
  data_vencimento?: string;
  data_pagamento?: string;
}

export const EmprestimosModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'solicitacoes' | 'propostas' | 'ativos' | 'quitados' | 'simulador'>('ativos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // List data
  const [emprestimos, setEmprestimos] = useState<EmprestimoItem[]>([]);

  // KPIs
  const [kpiTotalAtivo, setKpiTotalAtivo] = useState(0);
  const [kpiVencidas, setKpiVencidas] = useState(0);
  const [kpiReceitaTaxas, setKpiReceitaTaxas] = useState(0);

  // Detail Modal & Parcelas
  const [selectedEmp, setSelectedEmp] = useState<EmprestimoItem | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaItem[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Proposta Modal
  const [propostaModalOpen, setPropostaModalOpen] = useState(false);
  const [propostaForm, setPropostaForm] = useState({
    valorAprovado: '',
    taxaJuros: '3.5',
    maxParcelas: '12',
    taxaServico: '50',
    validadeDias: '7',
  });
  const [savingProposta, setSavingProposta] = useState(false);

  // Simulador State
  const [simuladorValor, setSimuladorValor] = useState('5000');
  const [simuladorParcelas, setSimuladorParcelas] = useState('12');
  const [simuladorTaxa, setSimuladorTaxa] = useState('3.5');

  const fetchKpis = async () => {
    try {
      const [ativosRes, parcelasRes, taxaRes] = await Promise.all([
        supabase.from('emprestimos').select('valor_aprovado, status').not('status', 'in', '("cancelado","recusado")'),
        supabase.from('emprestimo_parcelas').select('status').eq('status', 'vencida'),
        supabase.from('emprestimos').select('taxa_servico').eq('status', 'quitado'),
      ]);

      const ativos = ativosRes.data || [];
      const totalAt = ativos.reduce((acc, e) => acc + (Number(e.valor_aprovado) || 0), 0);
      setKpiTotalAtivo(totalAt);

      setKpiVencidas(parcelasRes.data?.length || 0);

      const rec = (taxaRes.data || []).reduce((acc, t) => acc + (Number(t.taxa_servico) || 0), 0);
      setKpiReceitaTaxas(rec);
    } catch (e) {
      console.error('Erro KPIs emprestimos:', e);
    }
  };

  const fetchEmprestimos = useCallback(async () => {
    try {
      let statusList: string[] = [];
      if (activeTab === 'solicitacoes') {
        statusList = ['analise_inicial', 'pendencia_documentos', 'solicitado'];
      } else if (activeTab === 'propostas') {
        statusList = ['proposta_enviada', 'aguardando_dados_bancarios', 'analise_final'];
      } else if (activeTab === 'ativos') {
        statusList = ['ativo', 'aprovado', 'pendencia_assinatura', 'em_andamento'];
      } else if (activeTab === 'quitados') {
        statusList = ['quitado'];
      }

      let query = supabase
        .from('emprestimos')
        .select('*, clientes(id, nome, cpf, telefone)');

      if (statusList.length > 0) {
        query = query.in('status', statusList);
      }

      if (search.trim()) {
        query = query.or(`status.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      setEmprestimos(data || []);
    } catch (err: any) {
      Alert.alert('Erro Empréstimos', err.message || 'Falha ao consultar empréstimos.');
    }
  }, [activeTab, search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchKpis();
    if (activeTab !== 'simulador') {
      await fetchEmprestimos();
    }
    setLoading(false);
  }, [activeTab, fetchEmprestimos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openEmprestimoDetail = async (emp: EmprestimoItem) => {
    setSelectedEmp(emp);
    setDetailModalOpen(true);
    setLoadingParcelas(true);
    try {
      const { data, error } = await supabase
        .from('emprestimo_parcelas')
        .select('*')
        .eq('emprestimo_id', emp.id)
        .order('numero_parcela');
      if (error) throw error;
      setParcelas(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingParcelas(false);
    }
  };

  const handleDarBaixaParcela = async (parcela: ParcelaItem) => {
    Alert.alert(
      'Baixa na Parcela',
      `Confirmar recebimento da parcela ${parcela.numero_parcela} no valor de ${formatCurrency(parcela.valor)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar Pagamento',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('emprestimo_parcelas')
                .update({
                  status: 'paga',
                  data_pagamento: new Date().toISOString(),
                })
                .eq('id', parcela.id);

              if (error) throw error;
              Alert.alert('Sucesso', 'Parcela baixada como paga!');
              if (selectedEmp) openEmprestimoDetail(selectedEmp);
              loadData();
            } catch (e: any) {
              Alert.alert('Erro ao dar baixa', e.message);
            }
          },
        },
      ]
    );
  };

  const handleQuitarEmprestimo = async () => {
    if (!selectedEmp) return;
    Alert.alert(
      'Quitar Empréstimo',
      `Confirmar a quitação total do contrato deste cliente?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar Quitação',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('emprestimos')
                .update({
                  status: 'quitado',
                  data_quitacao: new Date().toISOString(),
                })
                .eq('id', selectedEmp.id);

              if (error) throw error;

              // Baixar todas as parcelas restantes
              await supabase
                .from('emprestimo_parcelas')
                .update({ status: 'paga', data_pagamento: new Date().toISOString() })
                .eq('emprestimo_id', selectedEmp.id)
                .neq('status', 'paga');

              Alert.alert('Sucesso', 'Empréstimo quitado com sucesso!');
              setDetailModalOpen(false);
              loadData();
            } catch (e: any) {
              Alert.alert('Erro ao quitar', e.message);
            }
          },
        },
      ]
    );
  };

  const handleSendProposta = async () => {
    if (!selectedEmp) return;
    const valAprov = parseFloat(propostaForm.valorAprovado.replace(',', '.'));
    if (isNaN(valAprov) || valAprov <= 0) {
      Alert.alert('Atenção', 'Informe um valor aprovado válido.');
      return;
    }

    setSavingProposta(true);
    try {
      const { error } = await supabase
        .from('emprestimos')
        .update({
          status: 'proposta_enviada',
          valor_aprovado: valAprov,
          taxa_juros: parseFloat(propostaForm.taxaJuros) || 3.5,
          quantidade_parcelas: parseInt(propostaForm.maxParcelas, 10) || 12,
          taxa_servico: parseFloat(propostaForm.taxaServico) || 0,
        })
        .eq('id', selectedEmp.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Proposta de empréstimo enviada ao cliente!');
      setPropostaModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao enviar proposta', e.message);
    } finally {
      setSavingProposta(false);
    }
  };

  // Cálculo Simulador
  const calcularSimulacao = () => {
    const val = parseFloat(simuladorValor.replace(',', '.')) || 0;
    const n = parseInt(simuladorParcelas, 10) || 1;
    const i = (parseFloat(simuladorTaxa.replace(',', '.')) || 0) / 100;

    if (val <= 0 || n <= 0) return { parcela: 0, total: 0, jurosTotal: 0 };
    if (i === 0) {
      const p = val / n;
      return { parcela: p, total: val, jurosTotal: 0 };
    }

    // Fórmula Price: P = V * (i * (1+i)^n) / ((1+i)^n - 1)
    const fator = Math.pow(1 + i, n);
    const parcela = val * ((i * fator) / (fator - 1));
    const total = parcela * n;
    return {
      parcela: Math.round(parcela * 100) / 100,
      total: Math.round(total * 100) / 100,
      jurosTotal: Math.round((total - val) * 100) / 100,
    };
  };

  const simResult = calcularSimulacao();

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ativo':
      case 'aprovado':
      case 'quitado':
        return { bg: COLORS.successLight, text: COLORS.success, label: status };
      case 'analise_inicial':
      case 'solicitado':
      case 'proposta_enviada':
        return { bg: COLORS.warningLight, text: COLORS.warning, label: status.replace('_', ' ') };
      case 'vencida':
      case 'cancelado':
      case 'recusado':
        return { bg: COLORS.dangerLight, text: COLORS.danger, label: status };
      default:
        return { bg: COLORS.infoLight, text: COLORS.info, label: status };
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Empréstimos & Consignado</Text>
        <Text style={commonStyles.headerSubtitle}>Simulação, propostas e gestão de contratos</Text>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Total Ativo</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {formatCurrency(kpiTotalAtivo)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Inadimplência</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.danger }]}>
            {kpiVencidas} parc.
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Receita Taxas</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {formatCurrency(kpiReceitaTaxas)}
          </Text>
        </View>
      </View>

      {/* Main Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'ativos' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('ativos')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'ativos' && commonStyles.tabButtonTextActive]}>
            Contratos Ativos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'solicitacoes' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('solicitacoes')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'solicitacoes' && commonStyles.tabButtonTextActive]}>
            Solicitações
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'propostas' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('propostas')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'propostas' && commonStyles.tabButtonTextActive]}>
            Propostas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'quitados' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('quitados')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'quitados' && commonStyles.tabButtonTextActive]}>
            Quitados
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'simulador' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('simulador')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'simulador' && commonStyles.tabButtonTextActive]}>
            Simulador
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Content */}
      {activeTab === 'simulador' ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={commonStyles.card}>
            <Text style={[commonStyles.cardTitle, { marginBottom: 16 }]}>Simulador de Empréstimo</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Valor Desejado (R$)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={simuladorValor}
                onChangeText={setSimuladorValor}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Número de Parcelas (Meses)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={simuladorParcelas}
                onChangeText={setSimuladorParcelas}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Taxa de Juros Mensal (%)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={simuladorTaxa}
                onChangeText={setSimuladorTaxa}
              />
            </View>

            {/* Resultado do Simulador */}
            <View style={{ backgroundColor: COLORS.background, padding: 16, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={[commonStyles.formLabel, { color: COLORS.primary }]}>Projeção do Contrato</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Valor da Parcela:</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                  {simuladorParcelas}x de {formatCurrency(simResult.parcela)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Total a Pagar:</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                  {formatCurrency(simResult.total)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Juros Totais:</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.warning }}>
                  {formatCurrency(simResult.jurosTotal)}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando contratos de empréstimo...</Text>
        </View>
      ) : (
        <FlatList
          data={emprestimos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhum contrato encontrado nesta aba.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const cliente = item.clientes;

            return (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => openEmprestimoDetail(item)}
              >
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{cliente?.nome || 'Contrato de Empréstimo'}</Text>
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
                      Valor {item.valor_aprovado ? 'Aprovado' : 'Solicitado'}
                    </Text>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(item.valor_aprovado || item.valor_solicitado)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Condições
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                      {item.quantidade_parcelas || 12}x • Juros {item.taxa_juros || 3.5}% a.m.
                    </Text>
                  </View>
                </View>

                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Data: {formatDate(item.data_solicitacao || item.data_aprovacao)}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                    Ver parcelas / ações →
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Detalhes do Empréstimo & Parcelas */}
      <Modal visible={detailModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '90%' }]}>
            {selectedEmp && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={commonStyles.modalTitle}>Contrato de Empréstimo</Text>

                <View style={{ marginBottom: 14 }}>
                  <Text style={commonStyles.formLabel}>Cliente</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                    {selectedEmp.clientes?.nome || 'Cliente'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    CPF: {maskCPF(selectedEmp.clientes?.cpf)}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Valor do Contrato</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(selectedEmp.valor_aprovado || selectedEmp.valor_solicitado)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Taxa / Parcelas</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                      {selectedEmp.quantidade_parcelas || 12}x • {selectedEmp.taxa_juros || 3.5}% a.m.
                    </Text>
                  </View>
                </View>

                {/* Seção de Parcelas */}
                <Text style={[commonStyles.formLabel, { marginBottom: 8 }]}>Cronograma de Parcelas</Text>
                {loadingParcelas ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 10 }} />
                ) : parcelas.length === 0 ? (
                  <Text style={{ fontSize: 13, color: COLORS.textMuted, marginVertical: 6 }}>
                    Nenhuma parcela gerada ainda para este contrato.
                  </Text>
                ) : (
                  parcelas.map((p) => (
                    <View
                      key={p.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: COLORS.background,
                        padding: 10,
                        borderRadius: 8,
                        marginBottom: 6,
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textPrimary }}>
                          Parcela {p.numero_parcela} • {formatCurrency(p.valor)}
                        </Text>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                          Venc: {formatDate(p.data_vencimento)}
                        </Text>
                      </View>
                      {p.status === 'paga' ? (
                        <View style={[commonStyles.badge, { backgroundColor: COLORS.successLight }]}>
                          <Text style={[commonStyles.badgeText, { color: COLORS.success }]}>Paga</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[commonStyles.btnSuccess, { minHeight: 32, paddingHorizontal: 10 }]}
                          onPress={() => handleDarBaixaParcela(p)}
                        >
                          <Text style={[commonStyles.btnSuccessText, { fontSize: 11 }]}>Dar Baixa</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}

                {/* Actions */}
                <View style={{ gap: 10, marginTop: 16 }}>
                  {selectedEmp.status === 'analise_inicial' && (
                    <TouchableOpacity
                      style={commonStyles.btnPrimary}
                      onPress={() => {
                        setPropostaForm({
                          valorAprovado: String(selectedEmp.valor_solicitado || ''),
                          taxaJuros: '3.5',
                          maxParcelas: '12',
                          taxaServico: '50',
                          validadeDias: '7',
                        });
                        setPropostaModalOpen(true);
                      }}
                    >
                      <Text style={commonStyles.btnPrimaryText}>Elaborar Proposta</Text>
                    </TouchableOpacity>
                  )}

                  {selectedEmp.status === 'ativo' && (
                    <TouchableOpacity
                      style={commonStyles.btnSuccess}
                      onPress={handleQuitarEmprestimo}
                    >
                      <Text style={commonStyles.btnSuccessText}>✓ Quitar Empréstimo Total</Text>
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

      {/* Modal Elaborar Proposta */}
      <Modal visible={propostaModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Enviar Proposta de Empréstimo</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Valor Aprovado (R$)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={propostaForm.valorAprovado}
                  onChangeText={(val) => setPropostaForm({ ...propostaForm, valorAprovado: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Taxa de Juros Mensal (%)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={propostaForm.taxaJuros}
                  onChangeText={(val) => setPropostaForm({ ...propostaForm, taxaJuros: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Quantidade Máxima de Parcelas</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={propostaForm.maxParcelas}
                  onChangeText={(val) => setPropostaForm({ ...propostaForm, maxParcelas: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Taxa de Serviço Administrativa (R$)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={propostaForm.taxaServico}
                  onChangeText={(val) => setPropostaForm({ ...propostaForm, taxaServico: val })}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setPropostaModalOpen(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnPrimary, { flex: 1 }]}
                  disabled={savingProposta}
                  onPress={handleSendProposta}
                >
                  {savingProposta ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnPrimaryText}>Enviar Proposta</Text>
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

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
  maskPhone,
} from './financialTheme';

interface CreditoSolicitacao {
  id: string;
  cliente_id?: string;
  status: string;
  limite_solicitado?: number;
  limite_aprovado?: number;
  renda_mensal?: number;
  profissao?: string;
  max_parcelas?: number;
  opcao_pagamento_parcelado?: boolean;
  motivo_negacao?: string;
  created_at?: string;
  clientes?: {
    id: string;
    nome?: string;
    cpf?: string;
    cnpj?: string;
    telefone?: string;
    email?: string;
    limite_credito?: number;
    limite_credito_utilizado?: number;
  };
}

interface ClienteCarteira {
  id: string;
  nome?: string;
  cpf?: string;
  cnpj?: string;
  telefone?: string;
  limite_credito?: number;
  limite_credito_utilizado?: number;
}

export const CreditoModuleScreen: React.FC = () => {
  const [mainTab, setMainTab] = useState<'solicitacoes' | 'carteira' | 'movimentacoes' | 'taxas'>('solicitacoes');
  const [subStatus, setSubStatus] = useState<'analise' | 'documentos_pendentes' | 'liberado' | 'negado'>('analise');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data lists
  const [solicitacoes, setSolicitacoes] = useState<CreditoSolicitacao[]>([]);
  const [clientesCarteira, setClientesCarteira] = useState<ClienteCarteira[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);

  // KPIs
  const [totalLimiteConcedido, setTotalLimiteConcedido] = useState(0);
  const [totalLimiteUtilizado, setTotalLimiteUtilizado] = useState(0);
  const [countSolicitacoesPendentes, setCountSolicitacoesPendentes] = useState(0);

  // Modals
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<CreditoSolicitacao | null>(null);
  const [analiseModalOpen, setAnaliseModalOpen] = useState(false);
  const [analiseForm, setAnaliseForm] = useState({
    decisao: 'aprovar' as 'aprovar' | 'negar' | 'pedir_docs',
    limite_aprovado: '',
    max_parcelas: '12',
    opcao_parcelado: true,
    motivo_negacao: '',
    doc_solicitado: '',
  });
  const [savingAnalise, setSavingAnalise] = useState(false);

  // Manual Limit Change Modal
  const [selectedCliente, setSelectedCliente] = useState<ClienteCarteira | null>(null);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [novoLimite, setNovoLimite] = useState('');
  const [savingLimite, setSavingLimite] = useState(false);

  // Settings
  const [taxas, setTaxas] = useState({
    taxa_avista: '2.5',
    taxa_parcelado: '4.8',
  });
  const [savingTaxas, setSavingTaxas] = useState(false);

  const fetchKpisAndCarteira = async () => {
    try {
      const { data: clients } = await supabase
        .from('clientes')
        .select('id, nome, cpf, cnpj, telefone, limite_credito, limite_credito_utilizado')
        .gt('limite_credito', 0)
        .order('limite_credito', { ascending: false })
        .limit(60);

      if (clients) {
        setClientesCarteira(clients);
        const totalConc = clients.reduce((acc, c) => acc + (Number(c.limite_credito) || 0), 0);
        const totalUt = clients.reduce((acc, c) => acc + (Number(c.limite_credito_utilizado) || 0), 0);
        setTotalLimiteConcedido(totalConc);
        setTotalLimiteUtilizado(totalUt);
      }

      const { count } = await supabase
        .from('loja_credito_solicitacoes')
        .select('id', { count: 'exact', head: true })
        .in('status', ['analise', 'analise_inicial', 'pendente']);
      setCountSolicitacoesPendentes(count || 0);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSolicitacoes = useCallback(async () => {
    try {
      let query = supabase
        .from('loja_credito_solicitacoes')
        .select('*, clientes(id, nome, cpf, cnpj, telefone, email, limite_credito, limite_credito_utilizado)');

      if (subStatus === 'analise') {
        query = query.in('status', ['analise', 'analise_inicial', 'pendente']);
      } else if (subStatus === 'documentos_pendentes') {
        query = query.eq('status', 'documentos_pendentes');
      } else if (subStatus === 'liberado') {
        query = query.in('status', ['liberado', 'aprovado']);
      } else if (subStatus === 'negado') {
        query = query.eq('status', 'negado');
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      if (error) {
        // Fallback para 'credito_solicitacoes' se nome da tabela variar
        const { data: fallback } = await supabase
          .from('credito_solicitacoes')
          .select('*, clientes(id, nome, cpf, cnpj, telefone, email)')
          .order('created_at', { ascending: false })
          .limit(50);
        setSolicitacoes(fallback || []);
      } else {
        setSolicitacoes(data || []);
      }
    } catch (e: any) {
      console.error('Erro solicitacoes credito:', e);
    }
  }, [subStatus]);

  const fetchMovimentacoes = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('loja_credito_movimentacoes')
        .select('*, clientes(id, nome, cpf)')
        .order('created_at', { ascending: false })
        .limit(50);
      setMovimentacoes(data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchKpisAndCarteira();
    if (mainTab === 'solicitacoes') {
      await fetchSolicitacoes();
    } else if (mainTab === 'movimentacoes') {
      await fetchMovimentacoes();
    }
    setLoading(false);
  }, [mainTab, fetchSolicitacoes, fetchMovimentacoes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleProcessDecision = async () => {
    if (!selectedSolicitacao) return;

    setSavingAnalise(true);
    try {
      if (analiseForm.decisao === 'aprovar') {
        const valAprovado = parseFloat(analiseForm.limite_aprovado.replace(',', '.'));
        if (isNaN(valAprovado) || valAprovado <= 0) {
          Alert.alert('Atenção', 'Informe um limite aprovado válido.');
          setSavingAnalise(false);
          return;
        }

        const { error } = await supabase
          .from('loja_credito_solicitacoes')
          .update({
            status: 'liberado',
            limite_aprovado: valAprovado,
            max_parcelas: parseInt(analiseForm.max_parcelas, 10) || 12,
            opcao_pagamento_parcelado: analiseForm.opcao_parcelado,
          })
          .eq('id', selectedSolicitacao.id);

        if (error) throw error;

        // Atualizar limite no cliente
        if (selectedSolicitacao.cliente_id) {
          await supabase
            .from('clientes')
            .update({ limite_credito: valAprovado })
            .eq('id', selectedSolicitacao.cliente_id);
        }

        Alert.alert('Sucesso', `Crédito de ${formatCurrency(valAprovado)} aprovado e liberado ao cliente!`);
      } else if (analiseForm.decisao === 'negar') {
        if (!analiseForm.motivo_negacao.trim()) {
          Alert.alert('Atenção', 'Informe a justificativa da negativa.');
          setSavingAnalise(false);
          return;
        }

        const { error } = await supabase
          .from('loja_credito_solicitacoes')
          .update({
            status: 'negado',
            motivo_negacao: analiseForm.motivo_negacao.trim(),
          })
          .eq('id', selectedSolicitacao.id);

        if (error) throw error;
        Alert.alert('Sucesso', 'Solicitação negada.');
      } else {
        // Pedir Documentos
        const { error } = await supabase
          .from('loja_credito_solicitacoes')
          .update({
            status: 'documentos_pendentes',
            motivo_negacao: `Documentos solicitados: ${analiseForm.doc_solicitado.trim()}`,
          })
          .eq('id', selectedSolicitacao.id);

        if (error) throw error;
        Alert.alert('Sucesso', 'Pendência de documentos registrada.');
      }

      setAnaliseModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro na decisão', e.message);
    } finally {
      setSavingAnalise(false);
    }
  };

  const handleUpdateLimit = async () => {
    if (!selectedCliente) return;
    const val = parseFloat(novoLimite.replace(',', '.'));
    if (isNaN(val) || val < 0) {
      Alert.alert('Atenção', 'Informe um limite numérico válido.');
      return;
    }

    setSavingLimite(true);
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ limite_credito: val })
        .eq('id', selectedCliente.id);

      if (error) throw error;
      Alert.alert('Sucesso', 'Limite de crédito atualizado!');
      setLimitModalOpen(false);
      setNovoLimite('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao atualizar limite', e.message);
    } finally {
      setSavingLimite(false);
    }
  };

  const handleSaveTaxas = async () => {
    setSavingTaxas(true);
    try {
      await Promise.all([
        supabase.from('system_settings').upsert({ key: 'credito_taxa_avista', value: taxas.taxa_avista }),
        supabase.from('system_settings').upsert({ key: 'credito_taxa_parcelado', value: taxas.taxa_parcelado }),
      ]);
      Alert.alert('Sucesso', 'Taxas de crédito atualizadas!');
    } catch (e: any) {
      Alert.alert('Erro ao salvar taxas', e.message);
    } finally {
      setSavingTaxas(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'liberado':
      case 'aprovado':
        return { bg: COLORS.successLight, text: COLORS.success, label: 'Liberado' };
      case 'analise':
      case 'analise_inicial':
      case 'pendente':
        return { bg: COLORS.warningLight, text: COLORS.warning, label: 'Em Análise' };
      case 'documentos_pendentes':
        return { bg: COLORS.infoLight, text: COLORS.info, label: 'Docs Pendentes' };
      case 'negado':
        return { bg: COLORS.dangerLight, text: COLORS.danger, label: 'Negado' };
      default:
        return { bg: COLORS.borderLight, text: COLORS.textSecondary, label: status || 'Outro' };
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Gestão de Crédito GSA</Text>
        <Text style={commonStyles.headerSubtitle}>Limites, análise de concessão e carteira</Text>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Limite Concedido</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {formatCurrency(totalLimiteConcedido)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Em Uso</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {formatCurrency(totalLimiteUtilizado)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Análises Pend.</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.danger }]}>
            {countSolicitacoesPendentes}
          </Text>
        </View>
      </View>

      {/* Main Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'solicitacoes' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('solicitacoes')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'solicitacoes' && commonStyles.tabButtonTextActive]}>
            Solicitações
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'carteira' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('carteira')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'carteira' && commonStyles.tabButtonTextActive]}>
            Carteira de Limites
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'movimentacoes' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('movimentacoes')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'movimentacoes' && commonStyles.tabButtonTextActive]}>
            Extrato de Uso
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'taxas' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('taxas')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'taxas' && commonStyles.tabButtonTextActive]}>
            Taxas & Juros
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sub-tabs for Solicitações */}
      {mainTab === 'solicitacoes' && (
        <View style={{ flexDirection: 'row', backgroundColor: COLORS.card, paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          {(['analise', 'documentos_pendentes', 'liberado', 'negado'] as const).map((sub) => (
            <TouchableOpacity
              key={sub}
              style={[
                { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, minHeight: 32, justifyContent: 'center' },
                subStatus === sub ? { backgroundColor: COLORS.primary } : { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }
              ]}
              onPress={() => setSubStatus(sub)}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: subStatus === sub ? '#fff' : COLORS.textSecondary }}>
                {sub === 'analise' ? 'Em Análise' : sub === 'documentos_pendentes' ? 'Docs Pendentes' : sub === 'liberado' ? 'Liberados' : 'Negados'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      {mainTab === 'taxas' ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={commonStyles.card}>
            <Text style={[commonStyles.cardTitle, { marginBottom: 16 }]}>Configuração de Taxas de Crédito</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Juros / Taxa À Vista (%)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={taxas.taxa_avista}
                onChangeText={(val) => setTaxas({ ...taxas, taxa_avista: val })}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Juros Crédito Parcelado a.m. (%)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={taxas.taxa_parcelado}
                onChangeText={(val) => setTaxas({ ...taxas, taxa_parcelado: val })}
              />
            </View>

            <TouchableOpacity
              style={[commonStyles.btnPrimary, { marginTop: 12 }]}
              disabled={savingTaxas}
              onPress={handleSaveTaxas}
            >
              {savingTaxas ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={commonStyles.btnPrimaryText}>Salvar Parâmetros</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando dados de crédito...</Text>
        </View>
      ) : (
        <FlatList
          data={mainTab === 'solicitacoes' ? solicitacoes : mainTab === 'carteira' ? clientesCarteira : movimentacoes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhum registro encontrado.</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (mainTab === 'solicitacoes') {
              const sol = item as CreditoSolicitacao;
              const badge = getStatusBadge(sol.status);
              const cliente = sol.clientes;

              return (
                <View style={commonStyles.card}>
                  <View style={commonStyles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={commonStyles.cardTitle}>{cliente?.nome || 'Solicitante'}</Text>
                      <Text style={commonStyles.cardSubtitle}>
                        {maskCPF(cliente?.cpf) || maskCNPJ(cliente?.cnpj)} • Tel: {maskPhone(cliente?.telefone)}
                      </Text>
                    </View>
                    <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[commonStyles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                        Limite Solicitado
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.primary }}>
                        {formatCurrency(sol.limite_solicitado)}
                      </Text>
                    </View>
                    {sol.renda_mensal ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                          Renda Informada
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textSecondary }}>
                          {formatCurrency(sol.renda_mensal)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={commonStyles.cardFooter}>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                      Data: {formatDate(sol.created_at)}
                    </Text>
                    <TouchableOpacity
                      style={[commonStyles.btnPrimary, { minHeight: 36, paddingHorizontal: 12 }]}
                      onPress={() => {
                        setSelectedSolicitacao(sol);
                        setAnaliseForm({
                          decisao: 'aprovar',
                          limite_aprovado: String(sol.limite_aprovado || sol.limite_solicitado || ''),
                          max_parcelas: String(sol.max_parcelas || 12),
                          opcao_parcelado: true,
                          motivo_negacao: '',
                          doc_solicitado: '',
                        });
                        setAnaliseModalOpen(true);
                      }}
                    >
                      <Text style={[commonStyles.btnPrimaryText, { fontSize: 12 }]}>Avaliar Análise</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            } else if (mainTab === 'carteira') {
              const c = item as ClienteCarteira;
              const total = Number(c.limite_credito || 0);
              const usado = Number(c.limite_credito_utilizado || 0);
              const disponivel = Math.max(0, total - usado);

              return (
                <View style={commonStyles.card}>
                  <View style={commonStyles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={commonStyles.cardTitle}>{c.nome || 'Cliente'}</Text>
                      <Text style={commonStyles.cardSubtitle}>
                        {maskCPF(c.cpf) || maskCNPJ(c.cnpj)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[commonStyles.btnOutline, { minHeight: 34, paddingHorizontal: 10 }]}
                      onPress={() => {
                        setSelectedCliente(c);
                        setNovoLimite(String(total));
                        setLimitModalOpen(true);
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>Ajustar Limite</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <View>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                        Limite Total
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                        {formatCurrency(total)}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                        Utilizado
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.warning }}>
                        {formatCurrency(usado)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                        Disponível
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.success }}>
                        {formatCurrency(disponivel)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            } else {
              // Movimentações
              return (
                <View style={commonStyles.card}>
                  <View style={commonStyles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={commonStyles.cardTitle}>{item.clientes?.nome || 'Cliente'}</Text>
                      <Text style={commonStyles.cardSubtitle}>{item.descricao || 'Uso de crédito'}</Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: item.tipo === 'credito' ? COLORS.success : COLORS.danger }}>
                      {item.tipo === 'credito' ? '+' : '-'} {formatCurrency(item.valor)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                    {formatDateTime(item.created_at)}
                  </Text>
                </View>
              );
            }
          }}
        />
      )}

      {/* Modal Avaliar Análise de Crédito */}
      <Modal visible={analiseModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Avaliação de Crédito</Text>

              {selectedSolicitacao && (
                <View style={{ backgroundColor: COLORS.background, padding: 12, borderRadius: 8, marginBottom: 14 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                    {selectedSolicitacao.clientes?.nome}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    Limite Solicitado: <Text style={{ fontWeight: '700', color: COLORS.primary }}>{formatCurrency(selectedSolicitacao.limite_solicitado)}</Text>
                  </Text>
                </View>
              )}

              {/* Decisão selector */}
              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Decisão do Avaliador</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['aprovar', 'pedir_docs', 'negar'] as const).map((dec) => (
                    <TouchableOpacity
                      key={dec}
                      style={[
                        { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
                        analiseForm.decisao === dec
                          ? { backgroundColor: dec === 'aprovar' ? COLORS.success : dec === 'negar' ? COLORS.danger : COLORS.primary, borderColor: 'transparent' }
                          : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                      ]}
                      onPress={() => setAnaliseForm({ ...analiseForm, decisao: dec })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: analiseForm.decisao === dec ? '#fff' : COLORS.textPrimary }}>
                        {dec === 'aprovar' ? 'Aprovar' : dec === 'pedir_docs' ? 'Pedir Docs' : 'Negar'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {analiseForm.decisao === 'aprovar' && (
                <>
                  <View style={commonStyles.formGroup}>
                    <Text style={commonStyles.formLabel}>Limite Aprovado (R$)</Text>
                    <TextInput
                      style={commonStyles.formInput}
                      keyboardType="numeric"
                      value={analiseForm.limite_aprovado}
                      onChangeText={(val) => setAnaliseForm({ ...analiseForm, limite_aprovado: val })}
                    />
                  </View>

                  <View style={commonStyles.formGroup}>
                    <Text style={commonStyles.formLabel}>Máximo de Parcelas Permitido</Text>
                    <TextInput
                      style={commonStyles.formInput}
                      keyboardType="numeric"
                      value={analiseForm.max_parcelas}
                      onChangeText={(val) => setAnaliseForm({ ...analiseForm, max_parcelas: val })}
                    />
                  </View>
                </>
              )}

              {analiseForm.decisao === 'negar' && (
                <View style={commonStyles.formGroup}>
                  <Text style={commonStyles.formLabel}>Motivo da Negativa</Text>
                  <TextInput
                    style={[commonStyles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                    multiline
                    placeholder="Ex: Restrição cadastral externa, capacidade financeira insuficiente..."
                    value={analiseForm.motivo_negacao}
                    onChangeText={(val) => setAnaliseForm({ ...analiseForm, motivo_negacao: val })}
                  />
                </View>
              )}

              {analiseForm.decisao === 'pedir_docs' && (
                <View style={commonStyles.formGroup}>
                  <Text style={commonStyles.formLabel}>Documentação Solicitada</Text>
                  <TextInput
                    style={[commonStyles.formInput, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                    multiline
                    placeholder="Ex: Comprovante de residência recente, extrato bancário dos últimos 3 meses..."
                    value={analiseForm.doc_solicitado}
                    onChangeText={(val) => setAnaliseForm({ ...analiseForm, doc_solicitado: val })}
                  />
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setAnaliseModalOpen(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    analiseForm.decisao === 'aprovar'
                      ? commonStyles.btnSuccess
                      : analiseForm.decisao === 'negar'
                      ? commonStyles.btnDanger
                      : commonStyles.btnPrimary,
                    { flex: 1 }
                  ]}
                  disabled={savingAnalise}
                  onPress={handleProcessDecision}
                >
                  {savingAnalise ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnSuccessText}>Confirmar Decisão</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Ajuste Manual de Limite */}
      <Modal visible={limitModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '55%' }]}>
            <Text style={commonStyles.modalTitle}>Ajustar Limite de Crédito</Text>
            {selectedCliente && (
              <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 }}>
                Cliente: <Text style={{ fontWeight: '700' }}>{selectedCliente.nome}</Text>
              </Text>
            )}

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Novo Limite de Crédito Total (R$)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={novoLimite}
                onChangeText={setNovoLimite}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setLimitModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnPrimary, { flex: 1 }]}
                disabled={savingLimite}
                onPress={handleUpdateLimit}
              >
                {savingLimite ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnPrimaryText}>Salvar Limite</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

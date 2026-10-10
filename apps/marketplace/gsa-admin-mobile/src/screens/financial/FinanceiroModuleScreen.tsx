import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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

interface FaturaItem {
  id: string;
  codigo_fatura?: string;
  valor_total: number;
  valor_pago?: number;
  status: string;
  data_vencimento?: string;
  data_emissao?: string;
  descricao?: string;
  categoria?: string;
  cliente_id?: string;
  clientes?: {
    id: string;
    nome?: string;
    cpf?: string;
    cnpj?: string;
    telefone?: string;
    email?: string;
  };
}

interface SaqueItem {
  id: string;
  valor: number;
  status: string;
  tipo_chave_pix?: string;
  chave_pix?: string;
  data_solicitacao?: string;
  data_pagamento?: string;
  motivo_recusa?: string;
  cliente_id?: string;
  clientes?: {
    id: string;
    nome?: string;
    cpf?: string;
    saldo_carteira?: number;
  };
}

interface TransferenciaItem {
  id: string;
  valor: number;
  status: string;
  motivo?: string;
  data_solicitacao?: string;
  cliente_origem?: {
    nome?: string;
    cpf?: string;
  };
  cliente_destino?: {
    nome?: string;
    cpf?: string;
  };
}

export const FinanceiroModuleScreen: React.FC = () => {
  const [mainTab, setMainTab] = useState<'faturas' | 'saques' | 'transferencias'>('faturas');
  const [faturaStatus, setFaturaStatus] = useState<'pendentes' | 'pagos' | 'cancelados'>('pendentes');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [faturas, setFaturas] = useState<FaturaItem[]>([]);
  const [saques, setSaques] = useState<SaqueItem[]>([]);
  const [transferencias, setTransferencias] = useState<TransferenciaItem[]>([]);

  // KPIs
  const [kpiTotalPendente, setKpiTotalPendente] = useState(0);
  const [kpiTotalPagoMes, setKpiTotalPagoMes] = useState(0);
  const [kpiSaquesPendentes, setKpiSaquesPendentes] = useState(0);

  // Selected item modals
  const [selectedFatura, setSelectedFatura] = useState<FaturaItem | null>(null);
  const [faturaDetailModal, setFaturaDetailModal] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // New fatura modal
  const [createFaturaModal, setCreateFaturaModal] = useState(false);
  const [clientesList, setClientesList] = useState<any[]>([]);
  const [newFatura, setNewFatura] = useState({
    cliente_id: '',
    valor_total: '',
    data_vencimento: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    descricao: '',
    categoria: 'servico',
  });
  const [savingFatura, setSavingFatura] = useState(false);

  // Saque action modal
  const [selectedSaque, setSelectedSaque] = useState<SaqueItem | null>(null);
  const [saqueModalOpen, setSaqueModalOpen] = useState(false);
  const [saqueActionType, setSaqueActionType] = useState<'aprovar' | 'recusar'>('aprovar');
  const [saqueMotivo, setSaqueMotivo] = useState('');
  const [processingSaque, setProcessingSaque] = useState(false);

  const fetchKpis = async () => {
    try {
      const { data: pendentes } = await supabase
        .from('faturas')
        .select('valor_total')
        .in('status', ['pendente', 'vencida', 'pendente_pagamento']);
      const totalPend = (pendentes || []).reduce((acc, f) => acc + (Number(f.valor_total) || 0), 0);
      setKpiTotalPendente(totalPend);

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: pagos } = await supabase
        .from('faturas')
        .select('valor_total, valor_pago')
        .eq('status', 'pago')
        .gte('data_pagamento', firstDay);
      const totalPago = (pagos || []).reduce((acc, f) => acc + (Number(f.valor_pago || f.valor_total) || 0), 0);
      setKpiTotalPagoMes(totalPago);

      const { count: saqCount } = await supabase
        .from('saques')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente');
      setKpiSaquesPendentes(saqCount || 0);
    } catch (e) {
      console.error('Erro KPIs financeiro:', e);
    }
  };

  const fetchFaturas = useCallback(async () => {
    try {
      let query = supabase
        .from('faturas')
        .select('*, clientes(id, nome, cpf, cnpj, telefone, email)');

      if (faturaStatus === 'pendentes') {
        query = query.in('status', ['pendente', 'revisada', 'vencida', 'pendente_pagamento', 'aguardando_link']);
      } else if (faturaStatus === 'pagos') {
        query = query.eq('status', 'pago');
      } else if (faturaStatus === 'cancelados') {
        query = query.eq('status', 'cancelado');
      }

      if (search.trim()) {
        query = query.or(`codigo_fatura.ilike.%${search.trim()}%,descricao.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      setFaturas(data || []);
    } catch (err: any) {
      Alert.alert('Erro Faturas', err.message || 'Falha ao buscar faturas.');
    }
  }, [faturaStatus, search]);

  const fetchSaques = useCallback(async () => {
    try {
      let query = supabase
        .from('saques')
        .select('*, clientes(id, nome, cpf, saldo_carteira)');

      if (search.trim()) {
        query = query.or(`chave_pix.ilike.%${search.trim()}%,status.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query.order('data_solicitacao', { ascending: false }).limit(50);
      if (error) throw error;
      setSaques(data || []);
    } catch (err: any) {
      Alert.alert('Erro Saques', err.message || 'Falha ao buscar saques.');
    }
  }, [search]);

  const fetchTransferencias = useCallback(async () => {
    try {
      let query = supabase
        .from('transferencias')
        .select('*, cliente_origem:clientes!cliente_origem_id(nome, cpf), cliente_destino:clientes!cliente_destino_id(nome, cpf)');

      if (search.trim()) {
        query = query.ilike('motivo', `%${search.trim()}%`);
      }

      const { data, error } = await query.order('data_solicitacao', { ascending: false }).limit(50);
      if (error) throw error;
      setTransferencias(data || []);
    } catch (err: any) {
      Alert.alert('Erro Transferências', err.message || 'Falha ao buscar transferências.');
    }
  }, [search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchKpis();
    if (mainTab === 'faturas') {
      await fetchFaturas();
    } else if (mainTab === 'saques') {
      await fetchSaques();
    } else {
      await fetchTransferencias();
    }
    setLoading(false);
  }, [mainTab, fetchFaturas, fetchSaques, fetchTransferencias]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openCreateFatura = async () => {
    setCreateFaturaModal(true);
    try {
      const { data } = await supabase.from('clientes').select('id, nome, cpf').order('nome').limit(40);
      setClientesList(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveFatura = async () => {
    if (!newFatura.cliente_id) {
      Alert.alert('Atenção', 'Selecione um cliente.');
      return;
    }
    const val = parseFloat(newFatura.valor_total.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido.');
      return;
    }

    setSavingFatura(true);
    try {
      const codigoFatura = `FAT-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('faturas').insert([
        {
          cliente_id: newFatura.cliente_id,
          codigo_fatura: codigoFatura,
          valor_total: val,
          data_vencimento: newFatura.data_vencimento,
          data_emissao: new Date().toISOString().split('T')[0],
          descricao: newFatura.descricao || 'Fatura gerada via Mobile',
          categoria: newFatura.categoria,
          status: 'pendente',
        },
      ]);

      if (error) throw error;
      Alert.alert('Sucesso', 'Fatura criada com sucesso!');
      setCreateFaturaModal(false);
      setNewFatura({
        cliente_id: '',
        valor_total: '',
        data_vencimento: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        descricao: '',
        categoria: 'servico',
      });
      loadData();
    } catch (err: any) {
      Alert.alert('Erro ao criar fatura', err.message);
    } finally {
      setSavingFatura(false);
    }
  };

  const handleMarkAsPaid = async (fatura: FaturaItem) => {
    Alert.alert(
      'Confirmar Baixa',
      `Deseja registrar o pagamento integral de ${formatCurrency(fatura.valor_total)} para esta fatura?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar Pagamento',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('faturas')
                .update({
                  status: 'pago',
                  valor_pago: fatura.valor_total,
                  data_pagamento: new Date().toISOString(),
                })
                .eq('id', fatura.id);

              if (error) throw error;
              Alert.alert('Sucesso', 'Fatura marcada como paga!');
              setFaturaDetailModal(false);
              loadData();
            } catch (e: any) {
              Alert.alert('Erro', e.message);
            }
          },
        },
      ]
    );
  };

  const handleCancelFatura = async () => {
    if (!selectedFatura) return;
    if (!cancelReason.trim()) {
      Alert.alert('Atenção', 'Informe o motivo do cancelamento.');
      return;
    }

    try {
      const { error } = await supabase
        .from('faturas')
        .update({
          status: 'cancelado',
          observacoes: `Cancelada via Mobile: ${cancelReason.trim()}`,
        })
        .eq('id', selectedFatura.id);

      if (error) throw error;
      Alert.alert('Sucesso', 'Fatura cancelada.');
      setCancelModalOpen(false);
      setFaturaDetailModal(false);
      setCancelReason('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao cancelar', e.message);
    }
  };

  const handleProcessSaque = async () => {
    if (!selectedSaque) return;
    if (saqueActionType === 'recusar' && !saqueMotivo.trim()) {
      Alert.alert('Atenção', 'Informe a justificativa da recusa.');
      return;
    }

    setProcessingSaque(true);
    try {
      if (saqueActionType === 'aprovar') {
        const { error } = await supabase
          .from('saques')
          .update({
            status: 'pago',
            data_pagamento: new Date().toISOString(),
          })
          .eq('id', selectedSaque.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Saque aprovado e liquidado!');
      } else {
        const { error } = await supabase
          .from('saques')
          .update({
            status: 'recusado',
            motivo_recusa: saqueMotivo.trim(),
          })
          .eq('id', selectedSaque.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Saque recusado.');
      }
      setSaqueModalOpen(false);
      setSaqueMotivo('');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao processar saque', e.message);
    } finally {
      setProcessingSaque(false);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pago':
      case 'aprovado':
        return { bg: COLORS.successLight, text: COLORS.success };
      case 'pendente':
      case 'aguardando_link':
        return { bg: COLORS.warningLight, text: COLORS.warning };
      case 'vencida':
      case 'recusado':
      case 'cancelado':
        return { bg: COLORS.dangerLight, text: COLORS.danger };
      default:
        return { bg: COLORS.infoLight, text: COLORS.info };
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={commonStyles.headerTitle}>Financeiro & Recebíveis</Text>
            <Text style={commonStyles.headerSubtitle}>Livro-caixa, faturas, saques e conciliação</Text>
          </View>
          <TouchableOpacity
            style={[commonStyles.btnPrimary, { minHeight: 38, paddingHorizontal: 12 }]}
            onPress={openCreateFatura}
          >
            <Text style={commonStyles.btnPrimaryText}>+ Fatura</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>A Receber</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {formatCurrency(kpiTotalPendente)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Recebido Mês</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {formatCurrency(kpiTotalPagoMes)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Saques Pend.</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {kpiSaquesPendentes}
          </Text>
        </View>
      </View>

      {/* Main Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'faturas' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('faturas')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'faturas' && commonStyles.tabButtonTextActive]}>
            Faturas & Títulos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'saques' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('saques')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'saques' && commonStyles.tabButtonTextActive]}>
            Solicitações de Saque
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, mainTab === 'transferencias' && commonStyles.tabButtonActive]}
          onPress={() => setMainTab('transferencias')}
        >
          <Text style={[commonStyles.tabButtonText, mainTab === 'transferencias' && commonStyles.tabButtonTextActive]}>
            Transferências
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sub-tabs for Faturas */}
      {mainTab === 'faturas' && (
        <View style={{ flexDirection: 'row', backgroundColor: COLORS.card, paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          {(['pendentes', 'pagos', 'cancelados'] as const).map((sub) => (
            <TouchableOpacity
              key={sub}
              style={[
                { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, minHeight: 32, justifyContent: 'center' },
                faturaStatus === sub ? { backgroundColor: COLORS.primary } : { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }
              ]}
              onPress={() => setFaturaStatus(sub)}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: faturaStatus === sub ? '#fff' : COLORS.textSecondary, textTransform: 'capitalize' }}>
                {sub}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search Input */}
      <View style={commonStyles.searchContainer}>
        <TextInput
          style={commonStyles.searchInput}
          placeholder={mainTab === 'faturas' ? 'Buscar código ou descrição...' : 'Buscar chave PIX ou cliente...'}
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Content List */}
      {loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando registros financeiros...</Text>
        </View>
      ) : mainTab === 'faturas' ? (
        <FlatList<FaturaItem>
          data={faturas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhuma fatura encontrada.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadgeStyle(item.status);
            return (
              <TouchableOpacity
                style={commonStyles.card}
                onPress={() => {
                  setSelectedFatura(item);
                  setFaturaDetailModal(true);
                }}
              >
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{item.codigo_fatura || `FAT-${item.id.slice(0, 8)}`}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      {item.clientes?.nome || 'Cliente não identificado'} • {maskCPF(item.clientes?.cpf) || maskCNPJ(item.clientes?.cnpj)}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[commonStyles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={commonStyles.cardValue}>{formatCurrency(item.valor_total)}</Text>
                {item.descricao ? (
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }} numberOfLines={2}>
                    {item.descricao}
                  </Text>
                ) : null}
                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Vencimento: {formatDate(item.data_vencimento)}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>
                    Ver detalhes →
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : mainTab === 'saques' ? (
        <FlatList<SaqueItem>
          data={saques}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhuma solicitação de saque encontrada.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadgeStyle(item.status);
            return (
              <View style={commonStyles.card}>
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{item.clientes?.nome || 'Cliente Solicitante'}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      Chave: {item.chave_pix || '-'} ({item.tipo_chave_pix || 'PIX'})
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[commonStyles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={commonStyles.cardValue}>{formatCurrency(item.valor)}</Text>
                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Solicitado em: {formatDateTime(item.data_solicitacao)}
                  </Text>
                  {item.status === 'pendente' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[commonStyles.btnOutline, { minHeight: 36, paddingHorizontal: 10 }]}
                        onPress={() => {
                          setSelectedSaque(item);
                          setSaqueActionType('recusar');
                          setSaqueModalOpen(true);
                        }}
                      >
                        <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 12 }}>Recusar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[commonStyles.btnSuccess, { minHeight: 36, paddingHorizontal: 10 }]}
                        onPress={() => {
                          setSelectedSaque(item);
                          setSaqueActionType('aprovar');
                          setSaqueModalOpen(true);
                        }}
                      >
                        <Text style={[commonStyles.btnSuccessText, { fontSize: 12 }]}>Aprovar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList<TransferenciaItem>
          data={transferencias}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhuma transferência encontrada.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadgeStyle(item.status);
            return (
              <View style={commonStyles.card}>
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>
                      {item.cliente_origem?.nome || 'Origem'} ➔ {item.cliente_destino?.nome || 'Destino'}
                    </Text>
                    <Text style={commonStyles.cardSubtitle}>
                      {item.motivo || 'Transferência entre contas'}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[commonStyles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={commonStyles.cardValue}>{formatCurrency(item.valor)}</Text>
                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    Data: {formatDateTime(item.data_solicitacao)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Modal Detalhes da Fatura */}
      <Modal visible={faturaDetailModal} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            {selectedFatura && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={commonStyles.modalTitle}>
                  {selectedFatura.codigo_fatura || `FAT-${selectedFatura.id.slice(0, 8)}`}
                </Text>

                <View style={{ marginBottom: 16 }}>
                  <Text style={commonStyles.formLabel}>Cliente</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>
                    {selectedFatura.clientes?.nome || 'Não informado'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    CPF/CNPJ: {maskCPF(selectedFatura.clientes?.cpf) || maskCNPJ(selectedFatura.clientes?.cnpj) || '-'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
                    Telefone: {selectedFatura.clientes?.telefone || '-'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Valor Total</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(selectedFatura.valor_total)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.formLabel}>Status</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', textTransform: 'capitalize', color: getStatusBadgeStyle(selectedFatura.status).text }}>
                      {selectedFatura.status}
                    </Text>
                  </View>
                </View>

                <View style={{ marginBottom: 16 }}>
                  <Text style={commonStyles.formLabel}>Vencimento / Emissão</Text>
                  <Text style={{ fontSize: 14, color: COLORS.textPrimary }}>
                    Vencimento: {formatDate(selectedFatura.data_vencimento)}
                  </Text>
                  <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>
                    Emissão: {formatDate(selectedFatura.data_emissao)}
                  </Text>
                </View>

                {selectedFatura.descricao ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={commonStyles.formLabel}>Descrição dos Serviços/Itens</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 }}>
                      {selectedFatura.descricao}
                    </Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={{ gap: 10, marginTop: 12 }}>
                  {selectedFatura.status !== 'pago' && selectedFatura.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={commonStyles.btnSuccess}
                      onPress={() => handleMarkAsPaid(selectedFatura)}
                    >
                      <Text style={commonStyles.btnSuccessText}>✓ Dar Baixa (Marcar como Paga)</Text>
                    </TouchableOpacity>
                  )}

                  {selectedFatura.status !== 'cancelado' && (
                    <TouchableOpacity
                      style={commonStyles.btnDanger}
                      onPress={() => setCancelModalOpen(true)}
                    >
                      <Text style={commonStyles.btnDangerText}>✕ Cancelar Fatura</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={commonStyles.btnOutline}
                    onPress={() => setFaturaDetailModal(false)}
                  >
                    <Text style={commonStyles.btnOutlineText}>Fechar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Cancelar Fatura */}
      <Modal visible={cancelModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '60%' }]}>
            <Text style={commonStyles.modalTitle}>Cancelar Fatura</Text>
            <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
              Informe a justificativa operacional para o cancelamento deste título.
            </Text>
            <TextInput
              style={[commonStyles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
              multiline
              numberOfLines={3}
              placeholder="Ex: Pedido cancelado pelo cliente, cobrança duplicada..."
              placeholderTextColor={COLORS.textMuted}
              value={cancelReason}
              onChangeText={setCancelReason}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => {
                  setCancelModalOpen(false);
                  setCancelReason('');
                }}
              >
                <Text style={commonStyles.btnOutlineText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnDanger, { flex: 1 }]}
                onPress={handleCancelFatura}
              >
                <Text style={commonStyles.btnDangerText}>Confirmar Cancelamento</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Nova Fatura */}
      <Modal visible={createFaturaModal} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Nova Fatura / Recebível</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Selecione o Cliente</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  {clientesList.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8, borderWidth: 1 },
                        newFatura.cliente_id === c.id
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                      ]}
                      onPress={() => setNewFatura({ ...newFatura, cliente_id: c.id })}
                    >
                      <Text style={{ fontSize: 13, color: newFatura.cliente_id === c.id ? '#fff' : COLORS.textPrimary, fontWeight: '600' }}>
                        {c.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Valor Total (R$)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  placeholder="0,00"
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.textMuted}
                  value={newFatura.valor_total}
                  onChangeText={(val) => setNewFatura({ ...newFatura, valor_total: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Data de Vencimento (AAAA-MM-DD)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  value={newFatura.data_vencimento}
                  onChangeText={(val) => setNewFatura({ ...newFatura, data_vencimento: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Descrição</Text>
                <TextInput
                  style={[commonStyles.formInput, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                  multiline
                  placeholder="Descrição dos serviços ou produtos faturados"
                  placeholderTextColor={COLORS.textMuted}
                  value={newFatura.descricao}
                  onChangeText={(val) => setNewFatura({ ...newFatura, descricao: val })}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setCreateFaturaModal(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnPrimary, { flex: 1 }]}
                  disabled={savingFatura}
                  onPress={handleSaveFatura}
                >
                  {savingFatura ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnPrimaryText}>Salvar Fatura</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Processar Saque */}
      <Modal visible={saqueModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '65%' }]}>
            <Text style={commonStyles.modalTitle}>
              {saqueActionType === 'aprovar' ? 'Aprovar Solicitação de Saque' : 'Recusar Solicitação de Saque'}
            </Text>
            {selectedSaque && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 14, color: COLORS.textPrimary, fontWeight: '700' }}>
                  {selectedSaque.clientes?.nome || 'Cliente'}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary, marginTop: 4 }}>
                  {formatCurrency(selectedSaque.valor)}
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                  PIX: {selectedSaque.chave_pix} ({selectedSaque.tipo_chave_pix || 'PIX'})
                </Text>
              </View>
            )}

            {saqueActionType === 'recusar' ? (
              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Justificativa da Recusa</Text>
                <TextInput
                  style={[commonStyles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                  multiline
                  placeholder="Ex: Dados PIX incorretos, saldo insuficiente..."
                  placeholderTextColor={COLORS.textMuted}
                  value={saqueMotivo}
                  onChangeText={setSaqueMotivo}
                />
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 }}>
                Confirma a liquidação desta solicitação de saque? O status passará para pago.
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => {
                  setSaqueModalOpen(false);
                  setSaqueMotivo('');
                }}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  saqueActionType === 'aprovar' ? commonStyles.btnSuccess : commonStyles.btnDanger,
                  { flex: 1 }
                ]}
                disabled={processingSaque}
                onPress={handleProcessSaque}
              >
                {processingSaque ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnSuccessText}>
                    {saqueActionType === 'aprovar' ? 'Confirmar Pagamento' : 'Recusar Saque'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

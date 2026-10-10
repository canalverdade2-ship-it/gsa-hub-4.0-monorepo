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

interface CobrancaItem {
  id: string;
  fatura_id?: string;
  cliente_id?: string;
  status: string;
  valor_original: number;
  valor_atualizado?: number;
  multa?: number;
  juros?: number;
  dias_atraso?: number;
  score_risco?: number;
  data_protesto?: string;
  cartorio_protesto?: string;
  created_at?: string;
  faturas?: {
    codigo_fatura?: string;
    data_vencimento?: string;
    valor_total?: number;
  };
  clientes?: {
    id?: string;
    nome?: string;
    cpf?: string;
    cnpj?: string;
    telefone?: string;
    email?: string;
  };
  cobranca_historico?: any[];
  cobranca_acordo_parcelas?: any[];
}

export const CobrancaModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'fila' | 'acordos' | 'protestos' | 'configuracoes'>('fila');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // List data
  const [cobrancas, setCobrancas] = useState<CobrancaItem[]>([]);

  // KPIs
  const [totalInadimplente, setTotalInadimplente] = useState(0);
  const [countEmAberto, setCountEmAberto] = useState(0);
  const [countAcordos, setCountAcordos] = useState(0);
  const [totalRecuperado, setTotalRecuperado] = useState(0);

  // Modals
  const [selectedCobranca, setSelectedCobranca] = useState<CobrancaItem | null>(null);

  // Acordo Modal
  const [acordoModalOpen, setAcordoModalOpen] = useState(false);
  const [acordoForm, setAcordoForm] = useState({
    parcelas: '3',
    desconto: '0',
    dataPrimeiroVenc: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    observacoes: '',
  });
  const [savingAcordo, setSavingAcordo] = useState(false);

  // Historico / Contato Modal
  const [historicoModalOpen, setHistoricoModalOpen] = useState(false);
  const [historicoForm, setHistoricoForm] = useState({
    tipo: 'contato_telefonico',
    descricao: '',
    promessa_pagamento: false,
    data_promessa: '',
  });
  const [savingHistorico, setSavingHistorico] = useState(false);

  // Baixa Manual Modal
  const [baixaModalOpen, setBaixaModalOpen] = useState(false);
  const [baixaForm, setBaixaForm] = useState({
    valor_pago: '',
    forma_pagamento: 'pix',
    observacoes: '',
  });
  const [savingBaixa, setSavingBaixa] = useState(false);

  // Protesto Modal
  const [protestoModalOpen, setProtestoModalOpen] = useState(false);
  const [protestoForm, setProtestoForm] = useState({
    nome_cartorio: '',
    data_protesto: new Date().toISOString().split('T')[0],
  });
  const [savingProtesto, setSavingProtesto] = useState(false);

  // Settings
  const [settings, setSettings] = useState({
    multa_pct: '2',
    juros_mensal_pct: '1',
    dias_para_protesto: '30',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase.from('system_settings').select('key, value');
      if (data) {
        const map = data.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
        setSettings({
          multa_pct: String(map.cobranca_multa_porcentagem || '2'),
          juros_mensal_pct: String(map.cobranca_juros_mensal || '1'),
          dias_para_protesto: String(map.cobranca_dias_protesto || '30'),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDados = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cobrancas')
        .select(`
          *,
          faturas(codigo_fatura, data_vencimento, valor_total),
          clientes(id, nome, cpf, cnpj, telefone, email),
          cobranca_historico(*),
          cobranca_acordo_parcelas(*)
        `)
        .order('score_risco', { ascending: false })
        .limit(60);

      if (error) throw error;

      const items = (data || []).map((c: any) => {
        const vencimento = c.faturas?.data_vencimento ? new Date(c.faturas.data_vencimento) : new Date(c.created_at);
        const diff = Date.now() - vencimento.getTime();
        const diasAtraso = Math.max(0, Math.floor(diff / 86400000));
        const valOriginal = Number(c.valor_original || c.faturas?.valor_total || 0);

        // Dinamicamente calcula juros e multa
        const multaPct = Number(settings.multa_pct) || 2;
        const jurosPctMes = Number(settings.juros_mensal_pct) || 1;
        const multaCalc = diasAtraso > 0 ? (valOriginal * multaPct) / 100 : 0;
        const jurosCalc = diasAtraso > 0 ? (valOriginal * (jurosPctMes / 30) * diasAtraso) / 100 : 0;
        const valAtualizado = valOriginal + multaCalc + jurosCalc;

        return {
          ...c,
          valor_original: valOriginal,
          valor_atualizado: Number(c.valor_atualizado || valAtualizado.toFixed(2)),
          multa: multaCalc,
          juros: jurosCalc,
          dias_atraso: c.dias_atraso || diasAtraso,
        };
      });

      setCobrancas(items);

      // KPIs
      const inadimplentes = items.filter((i) => i.status !== 'quitado');
      const totalInad = inadimplentes.reduce((acc, i) => acc + (Number(i.valor_atualizado) || Number(i.valor_original) || 0), 0);
      setTotalInadimplente(totalInad);
      setCountEmAberto(inadimplentes.length);

      const acordos = items.filter((i) => i.status === 'acordo');
      setCountAcordos(acordos.length);

      const quitados = items.filter((i) => i.status === 'quitado');
      const totalRecup = quitados.reduce((acc, i) => acc + (Number(i.valor_pago || i.valor_original) || 0), 0);
      setTotalRecuperado(totalRecup);
    } catch (err: any) {
      Alert.alert('Erro Cobranças', err.message || 'Falha ao buscar registros.');
    }
  }, [settings.multa_pct, settings.juros_mensal_pct]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchSettings();
    await fetchDados();
    setLoading(false);
  }, [fetchDados]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Filtered Cobranças according to activeTab and search
  const filteredCobrancas = cobrancas.filter((c) => {
    if (activeTab === 'fila') {
      if (c.status === 'quitado' || c.status === 'protestado') return false;
    } else if (activeTab === 'acordos') {
      if (c.status !== 'acordo') return false;
    } else if (activeTab === 'protestos') {
      if (c.status !== 'protestado') return false;
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nome = c.clientes?.nome?.toLowerCase() || '';
      const doc = (c.clientes?.cpf || c.clientes?.cnpj || '').toLowerCase();
      const fatura = (c.faturas?.codigo_fatura || '').toLowerCase();
      return nome.includes(q) || doc.includes(q) || fatura.includes(q);
    }
    return true;
  });

  const handleSaveAcordo = async () => {
    if (!selectedCobranca) return;
    const numParcelas = parseInt(acordoForm.parcelas, 10);
    if (isNaN(numParcelas) || numParcelas < 1) {
      Alert.alert('Atenção', 'Informe ao menos 1 parcela.');
      return;
    }

    setSavingAcordo(true);
    try {
      const valorBase = (selectedCobranca.valor_atualizado || selectedCobranca.valor_original) - (parseFloat(acordoForm.desconto) || 0);
      const valorParcela = Math.round((valorBase / numParcelas) * 100) / 100;

      // Update cobrança status to acordo
      const { error: cobrancaError } = await supabase
        .from('cobrancas')
        .update({
          status: 'acordo',
          valor_acordo: valorBase,
          qtd_parcelas: numParcelas,
          observacoes: acordoForm.observacoes || 'Acordo firmado via Mobile',
        })
        .eq('id', selectedCobranca.id);

      if (cobrancaError) throw cobrancaError;

      // Inserir histórico
      await supabase.from('cobranca_historico').insert([
        {
          cobranca_id: selectedCobranca.id,
          tipo: 'acordo_firmado',
          descricao: `Acordo firmado em ${numParcelas}x de ${formatCurrency(valorParcela)}. Desconto: ${formatCurrency(acordoForm.desconto)}.`,
        },
      ]);

      Alert.alert('Sucesso', 'Acordo registrado com sucesso!');
      setAcordoModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao registrar acordo', e.message);
    } finally {
      setSavingAcordo(false);
    }
  };

  const handleSaveHistorico = async () => {
    if (!selectedCobranca) return;
    if (!historicoForm.descricao.trim()) {
      Alert.alert('Atenção', 'Preencha a descrição do contato.');
      return;
    }

    setSavingHistorico(true);
    try {
      const { error } = await supabase.from('cobranca_historico').insert([
        {
          cobranca_id: selectedCobranca.id,
          tipo: historicoForm.tipo,
          descricao: historicoForm.descricao.trim(),
          promessa_pagamento: historicoForm.promessa_pagamento,
          data_promessa: historicoForm.promessa_pagamento ? historicoForm.data_promessa : null,
        },
      ]);

      if (error) throw error;
      Alert.alert('Sucesso', 'Histórico registrado!');
      setHistoricoModalOpen(false);
      setHistoricoForm({ tipo: 'contato_telefonico', descricao: '', promessa_pagamento: false, data_promessa: '' });
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao registrar histórico', e.message);
    } finally {
      setSavingHistorico(false);
    }
  };

  const handleSaveBaixa = async () => {
    if (!selectedCobranca) return;
    const valPago = parseFloat(baixaForm.valor_pago.replace(',', '.'));
    if (isNaN(valPago) || valPago <= 0) {
      Alert.alert('Atenção', 'Informe um valor pago válido.');
      return;
    }

    setSavingBaixa(true);
    try {
      const { error } = await supabase
        .from('cobrancas')
        .update({
          status: 'quitado',
          valor_pago: valPago,
          forma_pagamento: baixaForm.forma_pagamento,
          data_pagamento: new Date().toISOString(),
        })
        .eq('id', selectedCobranca.id);

      if (error) throw error;

      // Also mark related fatura as paid if applicable
      if (selectedCobranca.fatura_id) {
        await supabase
          .from('faturas')
          .update({ status: 'pago', valor_pago: valPago, data_pagamento: new Date().toISOString() })
          .eq('id', selectedCobranca.fatura_id);
      }

      await supabase.from('cobranca_historico').insert([
        {
          cobranca_id: selectedCobranca.id,
          tipo: 'baixa_manual',
          descricao: `Cobrança quitada via Mobile. Valor: ${formatCurrency(valPago)} (${baixaForm.forma_pagamento}).`,
        },
      ]);

      Alert.alert('Sucesso', 'Cobrança baixada com sucesso!');
      setBaixaModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao baixar cobrança', e.message);
    } finally {
      setSavingBaixa(false);
    }
  };

  const handleSaveProtesto = async () => {
    if (!selectedCobranca) return;
    if (!protestoForm.nome_cartorio.trim()) {
      Alert.alert('Atenção', 'Informe o nome do cartório.');
      return;
    }

    setSavingProtesto(true);
    try {
      const { error } = await supabase
        .from('cobrancas')
        .update({
          status: 'protestado',
          cartorio_protesto: protestoForm.nome_cartorio.trim(),
          data_protesto: protestoForm.data_protesto,
        })
        .eq('id', selectedCobranca.id);

      if (error) throw error;

      await supabase.from('cobranca_historico').insert([
        {
          cobranca_id: selectedCobranca.id,
          tipo: 'protesto_encaminhado',
          descricao: `Título encaminhado para protesto no cartório ${protestoForm.nome_cartorio.trim()} em ${formatDate(protestoForm.data_protesto)}.`,
        },
      ]);

      Alert.alert('Sucesso', 'Título encaminhado para protesto!');
      setProtestoModalOpen(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao registrar protesto', e.message);
    } finally {
      setSavingProtesto(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await Promise.all([
        supabase.from('system_settings').upsert({ key: 'cobranca_multa_porcentagem', value: settings.multa_pct }),
        supabase.from('system_settings').upsert({ key: 'cobranca_juros_mensal', value: settings.juros_mensal_pct }),
        supabase.from('system_settings').upsert({ key: 'cobranca_dias_protesto', value: settings.dias_para_protesto }),
      ]);
      Alert.alert('Sucesso', 'Parâmetros da régua de cobrança atualizados!');
      loadData();
    } catch (e: any) {
      Alert.alert('Erro ao salvar parâmetros', e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Régua de Cobrança</Text>
        <Text style={commonStyles.headerSubtitle}>Inadimplentes, protestos, acordos e notificações</Text>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Inadimplente</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.danger }]}>
            {formatCurrency(totalInadimplente)}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Em Aberto</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {countEmAberto}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Acordos</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {countAcordos}
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Recuperado</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {formatCurrency(totalRecuperado)}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'fila' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('fila')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'fila' && commonStyles.tabButtonTextActive]}>
            Fila de Inadimplência
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'acordos' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('acordos')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'acordos' && commonStyles.tabButtonTextActive]}>
            Acordos Firmados
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'protestos' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('protestos')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'protestos' && commonStyles.tabButtonTextActive]}>
            Protestos Cartorários
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'configuracoes' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('configuracoes')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'configuracoes' && commonStyles.tabButtonTextActive]}>
            Parâmetros da Régua
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Search Input for list tabs */}
      {activeTab !== 'configuracoes' && (
        <View style={commonStyles.searchContainer}>
          <TextInput
            style={commonStyles.searchInput}
            placeholder="Buscar por cliente, documento ou fatura..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      )}

      {/* Content */}
      {activeTab === 'configuracoes' ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={commonStyles.card}>
            <Text style={[commonStyles.cardTitle, { marginBottom: 16 }]}>Configuração da Régua Automática</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Multa por Atraso (%)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={settings.multa_pct}
                onChangeText={(val) => setSettings({ ...settings, multa_pct: val })}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Juros Mensal de Mora (%)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={settings.juros_mensal_pct}
                onChangeText={(val) => setSettings({ ...settings, juros_mensal_pct: val })}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Dias em atraso para protesto</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={settings.dias_para_protesto}
                onChangeText={(val) => setSettings({ ...settings, dias_para_protesto: val })}
              />
            </View>

            <TouchableOpacity
              style={[commonStyles.btnPrimary, { marginTop: 12 }]}
              disabled={savingSettings}
              onPress={handleSaveSettings}
            >
              {savingSettings ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={commonStyles.btnPrimaryText}>Salvar Parâmetros da Régua</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando cobranças...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCobrancas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhuma cobrança encontrada nesta visualização.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const dias = item.dias_atraso || 0;
            const isHighRisk = dias > 30 || (item.score_risco && item.score_risco > 70);

            return (
              <View style={commonStyles.card}>
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{item.clientes?.nome || 'Cliente Inadimplente'}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      {maskCPF(item.clientes?.cpf) || maskCNPJ(item.clientes?.cnpj)} • Tel: {maskPhone(item.clientes?.telefone)}
                    </Text>
                  </View>
                  <View
                    style={[
                      commonStyles.badge,
                      { backgroundColor: isHighRisk ? COLORS.dangerLight : COLORS.warningLight }
                    ]}
                  >
                    <Text
                      style={[
                        commonStyles.badgeText,
                        { color: isHighRisk ? COLORS.danger : COLORS.warning }
                      ]}
                    >
                      {dias} dias atraso
                    </Text>
                  </View>
                </View>

                {/* Values row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
                  <View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Valor Original
                    </Text>
                    <Text style={{ fontSize: 14, color: COLORS.textSecondary, textDecorationLine: 'line-through' }}>
                      {formatCurrency(item.valor_original)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Valor Atualizado (+Juros/Multa)
                    </Text>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.danger }}>
                      {formatCurrency(item.valor_atualizado)}
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: COLORS.background, padding: 8, borderRadius: 6, marginVertical: 6 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>
                    Fatura: <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{item.faturas?.codigo_fatura || 'N/A'}</Text> • Vencimento original: {formatDate(item.faturas?.data_vencimento)}
                  </Text>
                </View>

                {/* Card Action Buttons */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.borderLight }}>
                  <TouchableOpacity
                    style={[commonStyles.btnOutline, { minHeight: 36, paddingHorizontal: 8 }]}
                    onPress={() => {
                      setSelectedCobranca(item);
                      setHistoricoModalOpen(true);
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>+ Histórico / Contato</Text>
                  </TouchableOpacity>

                  {item.status !== 'acordo' && (
                    <TouchableOpacity
                      style={[commonStyles.btnPrimary, { minHeight: 36, paddingHorizontal: 8 }]}
                      onPress={() => {
                        setSelectedCobranca(item);
                        setAcordoForm({
                          parcelas: '3',
                          desconto: '0',
                          dataPrimeiroVenc: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
                          observacoes: '',
                        });
                        setAcordoModalOpen(true);
                      }}
                    >
                      <Text style={[commonStyles.btnPrimaryText, { fontSize: 11 }]}>Firmar Acordo</Text>
                    </TouchableOpacity>
                  )}

                  {item.status !== 'protestado' && (
                    <TouchableOpacity
                      style={[commonStyles.btnOutline, { minHeight: 36, paddingHorizontal: 8, borderColor: COLORS.warning }]}
                      onPress={() => {
                        setSelectedCobranca(item);
                        setProtestoForm({
                          nome_cartorio: '',
                          data_protesto: new Date().toISOString().split('T')[0],
                        });
                        setProtestoModalOpen(true);
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.warning }}>Protestar</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[commonStyles.btnSuccess, { minHeight: 36, paddingHorizontal: 8 }]}
                    onPress={() => {
                      setSelectedCobranca(item);
                      setBaixaForm({
                        valor_pago: String(item.valor_atualizado || item.valor_original),
                        forma_pagamento: 'pix',
                        observacoes: '',
                      });
                      setBaixaModalOpen(true);
                    }}
                  >
                    <Text style={[commonStyles.btnSuccessText, { fontSize: 11 }]}>Dar Baixa</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Modal Firmar Acordo */}
      <Modal visible={acordoModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Firmar Acordo de Cobrança</Text>
              {selectedCobranca && (
                <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 14 }}>
                  Cliente: <Text style={{ fontWeight: '700' }}>{selectedCobranca.clientes?.nome}</Text> • Dívida:{' '}
                  {formatCurrency(selectedCobranca.valor_atualizado)}
                </Text>
              )}

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Quantidade de Parcelas</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={acordoForm.parcelas}
                  onChangeText={(val) => setAcordoForm({ ...acordoForm, parcelas: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Desconto Concedido (R$)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  placeholder="0,00"
                  value={acordoForm.desconto}
                  onChangeText={(val) => setAcordoForm({ ...acordoForm, desconto: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Data do 1º Vencimento (AAAA-MM-DD)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  value={acordoForm.dataPrimeiroVenc}
                  onChangeText={(val) => setAcordoForm({ ...acordoForm, dataPrimeiroVenc: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Observações do Acordo</Text>
                <TextInput
                  style={[commonStyles.formInput, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                  multiline
                  placeholder="Ex: Acordo realizado por telefone com cliente..."
                  value={acordoForm.observacoes}
                  onChangeText={(val) => setAcordoForm({ ...acordoForm, observacoes: val })}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setAcordoModalOpen(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnPrimary, { flex: 1 }]}
                  disabled={savingAcordo}
                  onPress={handleSaveAcordo}
                >
                  {savingAcordo ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnPrimaryText}>Salvar Acordo</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Histórico / Contato */}
      <Modal visible={historicoModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Registrar Contato / Ocorrência</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Tipo de Contato</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {['contato_telefonico', 'whatsapp', 'email', 'notificacao_formal'].map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
                        historicoForm.tipo === t
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                      ]}
                      onPress={() => setHistoricoForm({ ...historicoForm, tipo: t })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: historicoForm.tipo === t ? '#fff' : COLORS.textPrimary }}>
                        {t.replace('_', ' ').toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Descrição do Contato / Relato</Text>
                <TextInput
                  style={[commonStyles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                  multiline
                  placeholder="Ex: Cliente atendeu e solicitou boleto com novo vencimento..."
                  value={historicoForm.descricao}
                  onChangeText={(val) => setHistoricoForm({ ...historicoForm, descricao: val })}
                />
              </View>

              {/* Toggle Promessa */}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}
                onPress={() => setHistoricoForm({ ...historicoForm, promessa_pagamento: !historicoForm.promessa_pagamento })}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: COLORS.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8,
                    backgroundColor: historicoForm.promessa_pagamento ? COLORS.primary : 'transparent',
                  }}
                >
                  {historicoForm.promessa_pagamento && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' }}>
                  Houve Promessa de Pagamento?
                </Text>
              </TouchableOpacity>

              {historicoForm.promessa_pagamento && (
                <View style={commonStyles.formGroup}>
                  <Text style={commonStyles.formLabel}>Data Prometida (AAAA-MM-DD)</Text>
                  <TextInput
                    style={commonStyles.formInput}
                    placeholder="AAAA-MM-DD"
                    value={historicoForm.data_promessa}
                    onChangeText={(val) => setHistoricoForm({ ...historicoForm, data_promessa: val })}
                  />
                </View>
              )}

              {/* Lista de históricos anteriores */}
              {selectedCobranca?.cobranca_historico && selectedCobranca.cobranca_historico.length > 0 && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 10 }}>
                  <Text style={[commonStyles.formLabel, { marginBottom: 8 }]}>Histórico Anterior</Text>
                  {selectedCobranca.cobranca_historico.slice(0, 3).map((h: any, idx: number) => (
                    <View key={idx} style={{ backgroundColor: COLORS.background, padding: 8, borderRadius: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                        {h.tipo?.toUpperCase()} • {formatDateTime(h.created_at)}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.textPrimary, marginTop: 2 }}>{h.descricao}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setHistoricoModalOpen(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Fechar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnPrimary, { flex: 1 }]}
                  disabled={savingHistorico}
                  onPress={handleSaveHistorico}
                >
                  {savingHistorico ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnPrimaryText}>Salvar Histórico</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Baixa Manual */}
      <Modal visible={baixaModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '60%' }]}>
            <Text style={commonStyles.modalTitle}>Baixa Manual de Cobrança</Text>
            {selectedCobranca && (
              <Text style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
                Confirmar recebimento do cliente <Text style={{ fontWeight: '700' }}>{selectedCobranca.clientes?.nome}</Text>
              </Text>
            )}

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Valor Recebido (R$)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={baixaForm.valor_pago}
                onChangeText={(val) => setBaixaForm({ ...baixaForm, valor_pago: val })}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Forma de Pagamento</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['pix', 'cartao', 'dinheiro', 'transferencia'].map((forma) => (
                  <TouchableOpacity
                    key={forma}
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
                      baixaForm.forma_pagamento === forma
                        ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                        : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                    ]}
                    onPress={() => setBaixaForm({ ...baixaForm, forma_pagamento: forma })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: baixaForm.forma_pagamento === forma ? '#fff' : COLORS.textPrimary }}>
                      {forma.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setBaixaModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnSuccess, { flex: 1 }]}
                disabled={savingBaixa}
                onPress={handleSaveBaixa}
              >
                {savingBaixa ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnSuccessText}>Confirmar Baixa</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Protesto */}
      <Modal visible={protestoModalOpen} animationType="fade" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={[commonStyles.modalContent, { maxHeight: '60%' }]}>
            <Text style={commonStyles.modalTitle}>Encaminhar Título a Protesto</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Nome do Cartório / Ofício</Text>
              <TextInput
                style={commonStyles.formInput}
                placeholder="Ex: 1º Cartório de Protesto de Letras"
                value={protestoForm.nome_cartorio}
                onChangeText={(val) => setProtestoForm({ ...protestoForm, nome_cartorio: val })}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Data do Protesto (AAAA-MM-DD)</Text>
              <TextInput
                style={commonStyles.formInput}
                value={protestoForm.data_protesto}
                onChangeText={(val) => setProtestoForm({ ...protestoForm, data_protesto: val })}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={[commonStyles.btnOutline, { flex: 1 }]}
                onPress={() => setProtestoModalOpen(false)}
              >
                <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnDanger, { flex: 1 }]}
                disabled={savingProtesto}
                onPress={handleSaveProtesto}
              >
                {savingProtesto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={commonStyles.btnDangerText}>Confirmar Protesto</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

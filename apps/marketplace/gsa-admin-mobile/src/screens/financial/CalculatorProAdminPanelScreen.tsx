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

interface ToolProduct {
  tool_id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
  preco_centavos: number;
  duracao_acesso_minutos: number;
  modo_bloqueio: 'total' | 'partial';
  gratuito_inicio?: string | null;
  gratuito_fim?: string | null;
}

interface VoucherItem {
  id: string;
  codigo: string;
  tool_id?: string;
  status: string;
  expires_at?: string;
  created_at?: string;
}

interface PaymentItem {
  id: string;
  order_nsu: string;
  tool_id: string;
  cliente_nome?: string;
  valor_centavos: number;
  status: string;
  created_at?: string;
}

const DEFAULT_TOOLS: ToolProduct[] = [
  {
    tool_id: 'termination',
    nome: 'Rescisão Trabalhista Pro',
    codigo: 'FT-01',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'retirement',
    nome: 'Aposentadoria INSS Pro',
    codigo: 'FT-02',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'vacation',
    nome: 'Cálculo de Férias Pro',
    codigo: 'FT-03',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'thirteenth',
    nome: '13º Salário Pro',
    codigo: 'FT-04',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'benefits',
    nome: 'Benefícios do INSS Pro',
    codigo: 'FT-05',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'bpc',
    nome: 'BPC / LOAS Pro',
    codigo: 'FT-06',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    modo_bloqueio: 'total',
  },
];

export const CalculatorProAdminPanelScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ferramentas' | 'vouchers' | 'pagamentos'>('ferramentas');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data lists
  const [tools, setTools] = useState<ToolProduct[]>(DEFAULT_TOOLS);
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  // Modals
  const [selectedTool, setSelectedTool] = useState<ToolProduct | null>(null);
  const [editToolModal, setEditToolModal] = useState(false);
  const [toolForm, setToolForm] = useState({
    preco_reais: '9.90',
    duracao_horas: '24',
    modo_bloqueio: 'total' as 'total' | 'partial',
    ativo: true,
  });
  const [savingTool, setSavingTool] = useState(false);

  // New Voucher Modal
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState({
    tool_id: 'termination',
    codigo: '',
    validade_dias: '30',
  });
  const [savingVoucher, setSavingVoucher] = useState(false);

  const fetchCalculatorData = useCallback(async () => {
    try {
      // 1. Produtos / Configs
      const { data: dbProducts } = await supabase.from('calculator_products').select('*');
      if (dbProducts && dbProducts.length > 0) {
        const merged = DEFAULT_TOOLS.map((def) => {
          const found = dbProducts.find((p: any) => p.tool_id === def.tool_id);
          return found ? { ...def, ...found } : def;
        });
        setTools(merged);
      } else {
        setTools(DEFAULT_TOOLS);
      }

      // 2. Vouchers
      const { data: dbVouchers } = await supabase
        .from('calculator_vouchers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);
      setVouchers(dbVouchers || []);

      // 3. Payments
      const { data: dbPayments } = await supabase
        .from('calculator_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);
      setPayments(dbPayments || []);
    } catch (e) {
      console.error('Erro Calculator Pro:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchCalculatorData();
    setLoading(false);
  }, [fetchCalculatorData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSaveTool = async () => {
    if (!selectedTool) return;
    const precoFloat = parseFloat(toolForm.preco_reais.replace(',', '.'));
    if (isNaN(precoFloat) || precoFloat < 0) {
      Alert.alert('Atenção', 'Informe um preço válido.');
      return;
    }

    setSavingTool(true);
    try {
      const precoCentavos = Math.round(precoFloat * 100);
      const duracaoMinutos = (parseInt(toolForm.duracao_horas, 10) || 24) * 60;

      const { error } = await supabase
        .from('calculator_products')
        .upsert({
          tool_id: selectedTool.tool_id,
          nome: selectedTool.nome,
          preco_centavos: precoCentavos,
          duracao_acesso_minutos: duracaoMinutos,
          modo_bloqueio: toolForm.modo_bloqueio,
          ativo: toolForm.ativo,
        });

      if (error) {
        // Fallback local state if table doesn't have permissions
        setTools(tools.map((t) => (t.tool_id === selectedTool.tool_id ? {
          ...t,
          preco_centavos: precoCentavos,
          duracao_acesso_minutos: duracaoMinutos,
          modo_bloqueio: toolForm.modo_bloqueio,
          ativo: toolForm.ativo,
        } : t)));
      } else {
        await fetchCalculatorData();
      }

      Alert.alert('Sucesso', 'Configuração da ferramenta atualizada!');
      setEditToolModal(false);
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSavingTool(false);
    }
  };

  const handleCreateVoucher = async () => {
    if (!voucherForm.codigo.trim()) {
      Alert.alert('Atenção', 'Informe o código do voucher.');
      return;
    }

    setSavingVoucher(true);
    try {
      const dias = parseInt(voucherForm.validade_dias, 10) || 30;
      const expiresAt = new Date(Date.now() + dias * 86400000).toISOString();

      const { error } = await supabase.from('calculator_vouchers').insert([
        {
          codigo: voucherForm.codigo.trim().toUpperCase(),
          tool_id: voucherForm.tool_id,
          status: 'ativo',
          expires_at: expiresAt,
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', 'Voucher gerado com sucesso!');
      setVoucherModalOpen(false);
      setVoucherForm({ tool_id: 'termination', codigo: '', validade_dias: '30' });
      await fetchCalculatorData();
    } catch (e: any) {
      Alert.alert('Erro ao criar voucher', e.message);
    } finally {
      setSavingVoucher(false);
    }
  };

  // KPIs
  const activeToolsCount = tools.filter((t) => t.ativo).length;
  const vouchersCount = vouchers.length;
  const faturamentoTotal = payments.reduce((acc, p) => acc + (p.valor_centavos / 100), 0);

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={commonStyles.headerTitle}>Painel Calculadoras Pro</Text>
            <Text style={commonStyles.headerSubtitle}>Gestão de ferramentas, preços e vouchers</Text>
          </View>
          <TouchableOpacity
            style={[commonStyles.btnPrimary, { minHeight: 38, paddingHorizontal: 12 }]}
            onPress={() => setVoucherModalOpen(true)}
          >
            <Text style={commonStyles.btnPrimaryText}>+ Voucher</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KPI Cards */}
      <View style={commonStyles.kpiRow}>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Ferramentas</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.primary }]}>
            {activeToolsCount} ativas
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Vouchers</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.warning }]}>
            {vouchersCount} emitidos
          </Text>
        </View>
        <View style={commonStyles.kpiCard}>
          <Text style={commonStyles.kpiLabel}>Faturamento</Text>
          <Text style={[commonStyles.kpiValue, { color: COLORS.success }]}>
            {formatCurrency(faturamentoTotal)}
          </Text>
        </View>
      </View>

      {/* Main Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'ferramentas' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('ferramentas')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'ferramentas' && commonStyles.tabButtonTextActive]}>
            Ferramentas Pro (6)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'vouchers' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('vouchers')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'vouchers' && commonStyles.tabButtonTextActive]}>
            Vouchers de Acesso
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'pagamentos' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('pagamentos')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'pagamentos' && commonStyles.tabButtonTextActive]}>
            Histórico de Pagamentos
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={commonStyles.emptyState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={commonStyles.emptyStateText}>Carregando painel...</Text>
        </View>
      ) : activeTab === 'ferramentas' ? (
        <FlatList
          data={tools}
          keyExtractor={(item) => item.tool_id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const horasAcesso = Math.round(item.duracao_acesso_minutos / 60);

            return (
              <View style={commonStyles.card}>
                <View style={commonStyles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={commonStyles.cardTitle}>{item.nome}</Text>
                    <Text style={commonStyles.cardSubtitle}>
                      Código: {item.codigo} • Bloqueio: {item.modo_bloqueio === 'total' ? 'Total' : 'Parcial'}
                    </Text>
                  </View>
                  <View style={[commonStyles.badge, { backgroundColor: item.ativo ? COLORS.successLight : COLORS.dangerLight }]}>
                    <Text style={[commonStyles.badgeText, { color: item.ativo ? COLORS.success : COLORS.danger }]}>
                      {item.ativo ? 'Ativa' : 'Inativa'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
                  <View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Preço de Acesso
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.primary }}>
                      {formatCurrency(item.preco_centavos / 100)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', fontWeight: '600' }}>
                      Duração Liberada
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                      {horasAcesso} horas
                    </Text>
                  </View>
                </View>

                <View style={commonStyles.cardFooter}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                    {item.gratuito_fim ? `Promoção ativa até ${formatDate(item.gratuito_fim)}` : 'Sem gratuidade ativa'}
                  </Text>
                  <TouchableOpacity
                    style={[commonStyles.btnOutline, { minHeight: 36, paddingHorizontal: 12 }]}
                    onPress={() => {
                      setSelectedTool(item);
                      setToolForm({
                        preco_reais: (item.preco_centavos / 100).toFixed(2),
                        duracao_horas: String(horasAcesso),
                        modo_bloqueio: item.modo_bloqueio,
                        ativo: item.ativo,
                      });
                      setEditToolModal(true);
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>Editar Configuração</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      ) : activeTab === 'vouchers' ? (
        <FlatList
          data={vouchers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhum voucher emitido até o momento.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={commonStyles.card}>
              <View style={commonStyles.cardHeader}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', fontFamily: 'monospace', color: COLORS.primary }}>
                    {item.codigo}
                  </Text>
                  <Text style={commonStyles.cardSubtitle}>
                    Ferramenta: {item.tool_id ? item.tool_id.toUpperCase() : 'Todas as Ferramentas'}
                  </Text>
                </View>
                <View style={[commonStyles.badge, { backgroundColor: item.status === 'ativo' ? COLORS.successLight : COLORS.borderLight }]}>
                  <Text style={[commonStyles.badgeText, { color: item.status === 'ativo' ? COLORS.success : COLORS.textSecondary }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                Expiração: {formatDate(item.expires_at)} • Criado: {formatDate(item.created_at)}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={commonStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={commonStyles.emptyState}>
              <Text style={commonStyles.emptyStateText}>Nenhum pagamento registrado.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={commonStyles.card}>
              <View style={commonStyles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={commonStyles.cardTitle}>{item.cliente_nome || 'Cliente Anônimo'}</Text>
                  <Text style={commonStyles.cardSubtitle}>
                    NSU: {item.order_nsu} • Ferramenta: {item.tool_id}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.success }}>
                  {formatCurrency(item.valor_centavos / 100)}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                Data: {formatDateTime(item.created_at)} • Status: {item.status}
              </Text>
            </View>
          )}
        />
      )}

      {/* Modal Editar Ferramenta */}
      <Modal visible={editToolModal} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Editar {selectedTool?.nome}</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Preço de Acesso (R$)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={toolForm.preco_reais}
                  onChangeText={(val) => setToolForm({ ...toolForm, preco_reais: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Duração do Acesso (Horas)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={toolForm.duracao_horas}
                  onChangeText={(val) => setToolForm({ ...toolForm, duracao_horas: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Modo de Bloqueio</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['total', 'partial'] as const).map((modo) => (
                    <TouchableOpacity
                      key={modo}
                      style={[
                        { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
                        toolForm.modo_bloqueio === modo
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                      ]}
                      onPress={() => setToolForm({ ...toolForm, modo_bloqueio: modo })}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: toolForm.modo_bloqueio === modo ? '#fff' : COLORS.textPrimary }}>
                        {modo === 'total' ? 'Bloqueio Total' : 'Bloqueio Parcial'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12 }}
                onPress={() => setToolForm({ ...toolForm, ativo: !toolForm.ativo })}
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
                    backgroundColor: toolForm.ativo ? COLORS.primary : 'transparent',
                  }}
                >
                  {toolForm.ativo && <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' }}>
                  Ferramenta Ativa para Venda
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setEditToolModal(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnPrimary, { flex: 1 }]}
                  disabled={savingTool}
                  onPress={handleSaveTool}
                >
                  {savingTool ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnPrimaryText}>Salvar Alterações</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Emitir Voucher */}
      <Modal visible={voucherModalOpen} animationType="slide" transparent>
        <View style={commonStyles.modalOverlay}>
          <View style={commonStyles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={commonStyles.modalTitle}>Emitir Novo Voucher</Text>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Código do Cupom/Voucher</Text>
                <TextInput
                  style={[commonStyles.formInput, { textTransform: 'uppercase', fontWeight: '700', letterSpacing: 1 }]}
                  placeholder="EX: PROMO2026"
                  value={voucherForm.codigo}
                  onChangeText={(val) => setVoucherForm({ ...voucherForm, codigo: val })}
                />
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Ferramenta Vinculada</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                  {tools.map((t) => (
                    <TouchableOpacity
                      key={t.tool_id}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8, borderWidth: 1 },
                        voucherForm.tool_id === t.tool_id
                          ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                          : { backgroundColor: COLORS.background, borderColor: COLORS.border }
                      ]}
                      onPress={() => setVoucherForm({ ...voucherForm, tool_id: t.tool_id })}
                    >
                      <Text style={{ fontSize: 12, color: voucherForm.tool_id === t.tool_id ? '#fff' : COLORS.textPrimary, fontWeight: '600' }}>
                        {t.codigo} - {t.nome.slice(0, 14)}...
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={commonStyles.formGroup}>
                <Text style={commonStyles.formLabel}>Validade em Dias</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={voucherForm.validade_dias}
                  onChangeText={(val) => setVoucherForm({ ...voucherForm, validade_dias: val })}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={[commonStyles.btnOutline, { flex: 1 }]}
                  onPress={() => setVoucherModalOpen(false)}
                >
                  <Text style={commonStyles.btnOutlineText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[commonStyles.btnPrimary, { flex: 1 }]}
                  disabled={savingVoucher}
                  onPress={handleCreateVoucher}
                >
                  {savingVoucher ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={commonStyles.btnPrimaryText}>Emitir Voucher</Text>
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

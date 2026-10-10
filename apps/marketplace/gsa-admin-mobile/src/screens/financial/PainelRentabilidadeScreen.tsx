import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../../supabase';
import {
  COLORS,
  commonStyles,
  formatCurrency,
} from './financialTheme';

export const PainelRentabilidadeScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dre' | 'servicos' | 'simulador'>('dre');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Financial Metrics
  const [receitaBruta, setReceitaBruta] = useState(0);
  const [descontosTotal, setDescontosTotal] = useState(0);
  const [abatimentoCarteira, setAbatimentoCarteira] = useState(0);
  const [descontoPontos, setDescontoPontos] = useState(0);
  const [custoPrestadores, setCustoPrestadores] = useState(0);
  const [custoProdutos, setCustoProdutos] = useState(0);

  // Lists
  const [servicosRentaveis, setServicosRentaveis] = useState<any[]>([]);

  // Simulador State
  const [simPrecoVenda, setSimPrecoVenda] = useState('1500');
  const [simCustoPrestador, setSimCustoPrestador] = useState('650');
  const [simImpostosPct, setSimImpostosPct] = useState('6');
  const [simTaxaGatewayPct, setSimTaxaGatewayPct] = useState('3.5');

  const fetchDREData = useCallback(async () => {
    try {
      // 1. Faturas pagas e orçamentos
      const [faturasRes, demandasRes, orcamentosRes] = await Promise.all([
        supabase.from('faturas').select('valor_total, valor_pago, abatimento_carteira_aplicado, desconto_pontos_aplicado, desconto_voucher_aplicado, status'),
        supabase.from('prestador_demandas').select('valor_final, valor_proposto_admin, status'),
        supabase.from('orcamentos').select('valor_servico, valor_produto, valor_adicional, desconto, status'),
      ]);

      const faturas = faturasRes.data || [];
      const totalRec = faturas.reduce((acc, f) => acc + (Number(f.valor_pago || f.valor_total) || 0), 0);
      const totalCarteira = faturas.reduce((acc, f) => acc + (Number(f.abatimento_carteira_aplicado) || 0), 0);
      const totalPontos = faturas.reduce((acc, f) => acc + (Number(f.desconto_pontos_aplicado) || 0), 0);
      const totalVouchers = faturas.reduce((acc, f) => acc + (Number(f.desconto_voucher_aplicado) || 0), 0);

      setReceitaBruta(totalRec);
      setAbatimentoCarteira(totalCarteira);
      setDescontoPontos(totalPontos);
      setDescontosTotal(totalCarteira + totalPontos + totalVouchers);

      // Custos de Prestadores
      const demandas = demandasRes.data || [];
      const totalDemandas = demandas
        .filter((d) => ['concluida', 'ativa', 'em_analise'].includes(d.status))
        .reduce((acc, d) => acc + (Number(d.valor_final || d.valor_proposto_admin) || 0), 0);
      setCustoPrestadores(totalDemandas);

      // Serviços mais rentáveis
      const { data: servicosData } = await supabase
        .from('servicos')
        .select('id, nome, valor')
        .limit(10);

      const mappedServicos = (servicosData || []).map((s: any) => {
        const preco = Number(s.valor || 0);
        const custoEst = Math.round(preco * 0.55 * 100) / 100;
        const margem = preco - custoEst;
        const margemPct = preco > 0 ? Math.round((margem / preco) * 100) : 0;
        return {
          id: s.id,
          nome: s.nome,
          preco,
          custoEst,
          margem,
          margemPct,
        };
      });
      setServicosRentaveis(mappedServicos);
    } catch (e) {
      console.error('Erro DRE:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchDREData();
    setLoading(false);
  }, [fetchDREData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Cálculos DRE
  const receitaLiquida = Math.max(0, receitaBruta - descontosTotal);
  const custosTotais = custoPrestadores + custoProdutos;
  const margemBruta = receitaLiquida - custosTotais;
  const margemPct = receitaLiquida > 0 ? (margemBruta / receitaLiquida) * 100 : 0;

  // Cálculo Simulador
  const calcularSimulador = () => {
    const venda = parseFloat(simPrecoVenda.replace(',', '.')) || 0;
    const custo = parseFloat(simCustoPrestador.replace(',', '.')) || 0;
    const impostoPct = parseFloat(simImpostosPct.replace(',', '.')) || 0;
    const gatewayPct = parseFloat(simTaxaGatewayPct.replace(',', '.')) || 0;

    const impostoValor = (venda * impostoPct) / 100;
    const gatewayValor = (venda * gatewayPct) / 100;
    const custoTotal = custo + impostoValor + gatewayValor;
    const lucroLiquido = venda - custoTotal;
    const margemLiquidaPct = venda > 0 ? (lucroLiquido / venda) * 100 : 0;
    const roi = custo > 0 ? (lucroLiquido / custo) * 100 : 0;

    return {
      impostoValor,
      gatewayValor,
      custoTotal,
      lucroLiquido,
      margemLiquidaPct: margemLiquidaPct.toFixed(1),
      roi: roi.toFixed(1),
    };
  };

  const simResult = calcularSimulador();

  return (
    <View style={commonStyles.container}>
      {/* Header */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Painel de Rentabilidade & DRE</Text>
        <Text style={commonStyles.headerSubtitle}>Margens de contribuição, custos e simulações</Text>
      </View>

      {/* Main Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={commonStyles.tabsScroll}>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'dre' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('dre')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'dre' && commonStyles.tabButtonTextActive]}>
            DRE Consolidado
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'servicos' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('servicos')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'servicos' && commonStyles.tabButtonTextActive]}>
            Por Serviço / Produto
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.tabButton, activeTab === 'simulador' && commonStyles.tabButtonActive]}
          onPress={() => setActiveTab('simulador')}
        >
          <Text style={[commonStyles.tabButtonText, activeTab === 'simulador' && commonStyles.tabButtonTextActive]}>
            Simulador de Margem
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Content */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !refreshing ? (
          <View style={commonStyles.emptyState}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={commonStyles.emptyStateText}>Carregando métricas de rentabilidade...</Text>
          </View>
        ) : activeTab === 'dre' ? (
          <View>
            {/* KPI Destaque: Margem Líquida */}
            <View
              style={[
                commonStyles.card,
                {
                  backgroundColor: COLORS.primary,
                  borderColor: COLORS.primaryDark,
                  paddingVertical: 20,
                  alignItems: 'center',
                },
              ]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
                Margem de Contribuição Operacional
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#ffffff', marginTop: 6 }}>
                {formatCurrency(margemBruta)}
              </Text>
              <View
                style={[
                  commonStyles.badge,
                  { backgroundColor: margemPct >= 20 ? COLORS.success : COLORS.warning, marginTop: 10 },
                ]}
              >
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '800' }}>
                  {margemPct.toFixed(1)}% de Margem Líquida
                </Text>
              </View>
            </View>

            {/* DRE Linha a Linha */}
            <View style={commonStyles.card}>
              <Text style={[commonStyles.cardTitle, { marginBottom: 14 }]}>Demonstrativo de Resultado (DRE)</Text>

              {/* (+) Receita Bruta */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textPrimary }}>
                  (+) Faturamento Bruto
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>
                  {formatCurrency(receitaBruta)}
                </Text>
              </View>

              {/* (-) Deduções */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, color: COLORS.danger }}>
                  (-) Abatimento Carteira de Clientes
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.danger }}>
                  - {formatCurrency(abatimentoCarteira)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
                <Text style={{ fontSize: 13, color: COLORS.danger }}>
                  (-) Desconto Pontos e Cupons
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.danger }}>
                  - {formatCurrency(descontoPontos)}
                </Text>
              </View>

              {/* (=) Receita Líquida */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.background, paddingHorizontal: 8, borderRadius: 6, marginVertical: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.primary }}>
                  (=) Receita Operacional Líquida
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary }}>
                  {formatCurrency(receitaLiquida)}
                </Text>
              </View>

              {/* (-) Custos Diretos */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
                <Text style={{ fontSize: 13, color: COLORS.danger }}>
                  (-) Custos Prestadores & Terceiros
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.danger }}>
                  - {formatCurrency(custoPrestadores)}
                </Text>
              </View>

              {/* (=) Margem Final */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, marginTop: 6, backgroundColor: COLORS.successLight, paddingHorizontal: 10, borderRadius: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.success }}>
                  (=) Margem Operacional Final
                </Text>
                <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.success }}>
                  {formatCurrency(margemBruta)}
                </Text>
              </View>
            </View>
          </View>
        ) : activeTab === 'servicos' ? (
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 }}>
              Rentabilidade por Tipo de Serviço
            </Text>
            {servicosRentaveis.map((s) => (
              <View key={s.id} style={commonStyles.card}>
                <View style={commonStyles.cardHeader}>
                  <Text style={commonStyles.cardTitle}>{s.nome}</Text>
                  <View style={[commonStyles.badge, { backgroundColor: s.margemPct >= 40 ? COLORS.successLight : COLORS.warningLight }]}>
                    <Text style={[commonStyles.badgeText, { color: s.margemPct >= 40 ? COLORS.success : COLORS.warning }]}>
                      {s.margemPct}% Margem
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 }}>
                  <View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase' }}>Preço Venda</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>{formatCurrency(s.preco)}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase' }}>Custo Est.</Text>
                    <Text style={{ fontSize: 14, color: COLORS.danger }}>- {formatCurrency(s.custoEst)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase' }}>Lucro Bruto</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.success }}>{formatCurrency(s.margem)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          /* Simulador de Margem */
          <View style={commonStyles.card}>
            <Text style={[commonStyles.cardTitle, { marginBottom: 16 }]}>Simulador de Margem & Precificação</Text>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Preço de Venda Proposto (R$)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={simPrecoVenda}
                onChangeText={setSimPrecoVenda}
              />
            </View>

            <View style={commonStyles.formGroup}>
              <Text style={commonStyles.formLabel}>Custo Direto do Prestador / Material (R$)</Text>
              <TextInput
                style={commonStyles.formInput}
                keyboardType="numeric"
                value={simCustoPrestador}
                onChangeText={setSimCustoPrestador}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[commonStyles.formGroup, { flex: 1 }]}>
                <Text style={commonStyles.formLabel}>Impostos (%)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={simImpostosPct}
                  onChangeText={setSimImpostosPct}
                />
              </View>
              <View style={[commonStyles.formGroup, { flex: 1 }]}>
                <Text style={commonStyles.formLabel}>Taxa Gateway (%)</Text>
                <TextInput
                  style={commonStyles.formInput}
                  keyboardType="numeric"
                  value={simTaxaGatewayPct}
                  onChangeText={setSimTaxaGatewayPct}
                />
              </View>
            </View>

            {/* Simulação Resultado Card */}
            <View style={{ backgroundColor: COLORS.background, padding: 16, borderRadius: 10, marginTop: 10, borderWidth: 1, borderColor: COLORS.border }}>
              <Text style={[commonStyles.formLabel, { color: COLORS.primary }]}>Resultado da Simulação</Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Impostos Est.:</Text>
                <Text style={{ fontSize: 13, color: COLORS.danger }}>- {formatCurrency(simResult.impostoValor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Taxa de Gateway:</Text>
                <Text style={{ fontSize: 13, color: COLORS.danger }}>- {formatCurrency(simResult.gatewayValor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, paddingBottom: 6 }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Custo Total:</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.danger }}>- {formatCurrency(simResult.custoTotal)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.primary }}>Lucro Líquido:</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.success }}>
                  {formatCurrency(simResult.lucroLiquido)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Margem Líquida:</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.primary }}>{simResult.margemLiquidaPct}%</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Retorno s/ Custo (ROI):</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.success }}>{simResult.roi}%</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

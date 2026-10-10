import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Award, Wallet, Ticket, Calculator, Percent } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, maskCurrency, handleCurrencyInputChange } from '../../lib/utils';
import { fetchReferralSettings } from '../../utils/referralHelpers';

type EstagioRentabilidade = 'simulado' | 'previsto' | 'realizado';

interface PainelRentabilidadeProps {
  tipo: EstagioRentabilidade;
  orcamentoId?: string;
  osId?: string;
  faturaId?: string;
  overrideData?: {
    valor_servico?: number;
    valor_adicional?: number;
    acrescimo?: number;
    desconto?: number;
  };
}

export function PainelRentabilidade({ tipo, orcamentoId, osId, faturaId, overrideData }: PainelRentabilidadeProps) {
  const [loading, setLoading] = useState(true);
  
  // Variaveis Financeiras
  const [receitaBruta, setReceitaBruta] = useState(0);
  const [acrescimo, setAcrescimo] = useState(0);
  const [descontoIdicacao, setDescontoIndicacao] = useState(0);
  const [descontoAdmin, setDescontoAdmin] = useState(0);
  const [custoPrestador, setCustoPrestador] = useState(0);
  const [hasIndicacao, setHasIndicacao] = useState(false);
  
  // Abatimentos Fatura (só aplicável no realizado)
  const [pontosUtilizados, setPontosUtilizados] = useState(0);
  const [carteiraUtilizada, setCarteiraUtilizada] = useState(0);
  const [voucherUtilizado, setVoucherUtilizado] = useState(0);
  const [indicadorLimiteCarteira, setIndicadorLimiteCarteira] = useState(20);
  const [, setIndicadoDescontoPct] = useState(0);
  const [, setIsPrimeiroOrcamento] = useState(false);

  // Controle de Simulador
  const [custoSimulado, setCustoSimulado] = useState(0);

  useEffect(() => {
    fetchRentabilidade();

    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchRentabilidade();
      }, 300);
    };

    const channelId = `admin-rentabilidade-rt-${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faturas' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_demandas' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamentos' }, debouncedFetch)
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [tipo, orcamentoId, osId, faturaId]);

  // Sincronização imediata quando houver overrideData (para modais de edição)
  useEffect(() => {
    if (overrideData) {
      setReceitaBruta((overrideData.valor_servico || 0) + (overrideData.valor_adicional || 0));
      setAcrescimo(overrideData.acrescimo || 0);
      setDescontoAdmin(overrideData.desconto || 0);
    }
  }, [overrideData]);

  const fetchRentabilidade = async () => {
    setLoading(true);
    try {
      let currentOrcamentoId = orcamentoId;
      let currentOsId = osId;
      let currentClienteId = null;

      // Se for Realizado (Fatura), busca os dados da Fatura e descobre a OS/Orçamento
      if (tipo === 'realizado' && faturaId) {
        const { data: fatura } = await supabase
          .from('faturas')
          .select('*, ordens_servico(id, orcamento_id)')
          .eq('id', faturaId)
          .single();
        
        if (fatura) {
          currentOsId = fatura.os_id;
          currentOrcamentoId = fatura.ordens_servico?.orcamento_id;
          currentClienteId = fatura.cliente_id;
          
          setPontosUtilizados(parseFloat(fatura.desconto_pontos_aplicado || '0'));
          setCarteiraUtilizada(parseFloat(fatura.abatimento_carteira_aplicado || '0'));
          setVoucherUtilizado(parseFloat(fatura.desconto_voucher_aplicado || '0'));
        }
      }

      // Se for Previsto ou Realizado e tiver OS, busca custo do prestador
      if ((tipo === 'previsto' || tipo === 'realizado') && currentOsId) {
        const { data: os } = await supabase
          .from('ordens_servico')
          .select('orcamento_id, cliente_id')
          .eq('id', currentOsId)
          .single();
          
        if (os) {
          currentOrcamentoId = os.orcamento_id;
          currentClienteId = os.cliente_id;
        }

        // Buscar demandas aceitas para calcular o custo real
        const { data: demandas } = await supabase
          .from('prestador_demandas')
          .select('valor_final, valor_proposto_admin')
          .eq('os_id', currentOsId)
          .in('status', ['ativa', 'em_analise', 'em_ajuste', 'concluida']);
        
        if (demandas && demandas.length > 0) {
          const totalCusto = demandas.reduce((acc, dem) => acc + parseFloat(dem.valor_final || dem.valor_proposto_admin || '0'), 0);
          setCustoPrestador(totalCusto);
        }
      }

      // Buscar base financeira do Orçamento
      if (currentOrcamentoId) {
        const { data: orcamento } = await supabase
          .from('orcamentos')
          .select('*')
          .eq('id', currentOrcamentoId)
          .single();

        if (orcamento) {
          if (!currentClienteId) currentClienteId = orcamento.cliente_id;
          
          const valorBase = parseFloat(orcamento.valor_servico || '0') + 
                            parseFloat(orcamento.valor_produto || '0') + 
                            parseFloat(orcamento.valor_assinatura || '0') + 
                            parseFloat(orcamento.valor_adicional || '0');
          setReceitaBruta(valorBase);
          setAcrescimo(parseFloat(orcamento.acrescimo || '0'));

          const descontoTotal = parseFloat(orcamento.desconto || '0') + parseFloat(orcamento.promocao_desconto_manual || '0');
          
          // Separar desconto de indicação do desconto admin
          if (orcamento.motivo_desconto?.includes('Indicação')) {
            // Se veio de indicação, vamos assumir que o desconto listado (ou parte dele) foi via indicação.
            // Para simplificar, consideramos o valor_base * 10% (ou checamos o voucher? Vamos jogar no descontoTotal se estiver unificado)
            setDescontoIndicacao(descontoTotal);
            setDescontoAdmin(0);
          } else {
            setDescontoIndicacao(0);
            setDescontoAdmin(descontoTotal);
          }
        }
      }

      // Verificar se o cliente tem uma indicação atrelada para computar o custo do bônus
      if (currentClienteId) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('indicacao_origem_id')
          .eq('id', currentClienteId)
          .single();

        if (cliente?.indicacao_origem_id) {
          const { data: indicacao } = await supabase
            .from('indicacoes')
            .select('bonus_indicador')
            .eq('id', cliente.indicacao_origem_id)
            .single();
            
          if (indicacao) {
            setHasIndicacao(true);
          }
        }
      }

    } catch (err) {
      console.error('Erro ao carregar rentabilidade', err);
    } finally {
      // Buscar teto de bônus do indicador das configurações
      try {
        const settings = await fetchReferralSettings();
        setIndicadorLimiteCarteira(settings.indicador_limite_carteira);
        setIndicadoDescontoPct(settings.indicado_desconto_porcentagem);
      } catch {
        setIndicadorLimiteCarteira(20);
      }
      setLoading(false);
    }
  };

  // Detecção de primeiro orçamento (quando temos orcamentoId)
  useEffect(() => {
    if (!orcamentoId) return;
    const verificar = async () => {
      const { data: orc } = await supabase
        .from('orcamentos')
        .select('cliente_id')
        .eq('id', orcamentoId)
        .single();
      if (!orc?.cliente_id) return;

      const { data: lista } = await supabase
        .from('orcamentos')
        .select('id')
        .eq('cliente_id', orc.cliente_id)
        .not('status', 'eq', 'cancelado');

      setIsPrimeiroOrcamento((lista?.length ?? 0) <= 1);
    };
    verificar();
  }, [orcamentoId]);

  // Funções de Cálculo do DRE
  const subtotalReceita = receitaBruta + acrescimo - descontoIdicacao - descontoAdmin;
  
  // No simulado, o custo do prestador vem do input manual
  const custoOperacional = tipo === 'simulado' ? (custoSimulado || 0) : custoPrestador;
  const custoPagamentos = tipo === 'realizado' ? (pontosUtilizados + carteiraUtilizada + voucherUtilizado) : 0;
  
  // A comissão do indicador é 10% do bruto, limitado ao teto configurado
  const bonusBase = receitaBruta > 0 ? receitaBruta : 0;
  const calculatedBonus = hasIndicacao ? Math.min(bonusBase * 0.1, indicadorLimiteCarteira) : 0;
  
  const totalDespesas = custoOperacional + calculatedBonus + custoPagamentos;
  const lucroLiquido = subtotalReceita - totalDespesas;
  
  const margem = receitaBruta > 0 ? (lucroLiquido / subtotalReceita) * 100 : 0;
  const isLucro = lucroLiquido > 0;

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl bg-neutral-100 p-6">
        <div className="h-6 w-1/3 rounded bg-neutral-200 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-neutral-200"></div>
          <div className="h-4 w-3/4 rounded bg-neutral-200"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-6 md:p-8 shadow-xl shadow-neutral-200/50 ring-1 ring-neutral-100 mb-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-600 bg-clip-text text-transparent flex justify-start items-center gap-2">
            <Calculator className="h-5 w-5 text-indigo-600" />
            Análise de Rentabilidade
          </h2>
          <p className="text-sm font-medium text-neutral-500 mt-1">
            {tipo === 'simulado' && "Simule seus custos para definir o piso de negociação (DRE)."}
            {tipo === 'previsto' && "Lucro esperado baseado no prestador e descontos acordados (DRE)."}
            {tipo === 'realizado' && "Lucro líquido efetivo de caixa desta operação (DRE Final)."}
          </p>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
          tipo === 'simulado' ? 'bg-sky-50 text-sky-600 ring-1 ring-sky-200' :
          tipo === 'previsto' ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' :
          'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
        }`}>
          {tipo}
        </span>
      </div>

      <div className="space-y-6">
        {/* Bloco 1: Receita e Deduções de Venda */}
        <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-neutral-200/60">
          <div className="flex justify-between text-sm mb-3">
            <span className="font-bold text-neutral-700">Valor Bruto do Serviço</span>
            <span className="font-bold text-neutral-900">{formatCurrency(receitaBruta)}</span>
          </div>
          
          {(descontoIdicacao > 0 || descontoAdmin > 0) && (
            <div className="pl-4 border-l-2 border-neutral-200 space-y-2 mt-2">
              {descontoIdicacao > 0 && (
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>(-) Voucher Indicação do Cliente</span>
                  <span className="text-rose-600 font-bold">-{formatCurrency(descontoIdicacao)}</span>
                </div>
              )}
              {descontoAdmin > 0 && (
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>(-) Outros Descontos Concedidos</span>
                  <span className="text-rose-600 font-bold">-{formatCurrency(descontoAdmin)}</span>
                </div>
              )}
              {acrescimo > 0 && (
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>(+) Acréscimo Adicional</span>
                  <span className="text-emerald-600 font-bold">+{formatCurrency(acrescimo)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-neutral-200 flex justify-between text-sm">
            <span className="font-bold text-neutral-600">Subtotal (Receita Base)</span>
            <span className="font-black text-indigo-700">{formatCurrency(subtotalReceita)}</span>
          </div>
        </div>

        {/* Bloco 2: Custos de Operação (Terceiros e Prêmios) */}
        <div className="rounded-2xl border border-rose-100 bg-rose-50/30 p-5">
          <h3 className="text-xs font-black uppercase tracking-wider text-rose-800 mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Custos Operacionais
          </h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-rose-100">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-rose-500" />
                <span className="text-sm font-bold text-neutral-700">Custo c/ Prestador</span>
              </div>
              {tipo === 'simulado' ? (
                <div className="flex items-center">
                  <span className="text-neutral-400 mr-2 text-sm">R$</span>
                  <input 
                    type="text"
                    value={maskCurrency(custoSimulado)}
                    inputMode="decimal"
onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      const num = parseInt(val || "0", 10) / 100;
                      setCustoSimulado(num);
                    }}
                    placeholder="0,00"
                    className="w-24 text-right rounded-lg border border-neutral-200 px-2 py-1 text-sm font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ) : (
                <span className="text-sm font-bold text-rose-600">
                  {custoOperacional > 0 ? `-${formatCurrency(custoOperacional)}` : 'R$ 0,00'}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500 pl-8">(-) Comissão / Prêmio p/ Indicador</span>
              <span className="text-xs font-bold text-neutral-600">
                {calculatedBonus > 0 ? `-${formatCurrency(calculatedBonus)}` : 'R$ 0,00'}
              </span>
            </div>
          </div>
        </div>

        {/* Bloco 3: Formas de Pagamento (Apenas no Realizado) */}
        {tipo === 'realizado' && custoPagamentos > 0 && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-800 mb-3 flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Pagamentos com Benefício
            </h3>
            <div className="space-y-2 text-xs">
              <p className="text-amber-700/70 mb-2">Estes valores reduzem a entrada de dinheiro no caixa, pois o cliente usou moedas digitais do sistema.</p>
              {pontosUtilizados > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span className="flex items-center gap-1.5"><Award className="h-3 w-3" /> Pontos GSA</span>
                  <span className="font-bold text-rose-600">-{formatCurrency(pontosUtilizados)}</span>
                </div>
              )}
              {carteiraUtilizada > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span className="flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Saldo em Carteira</span>
                  <span className="font-bold text-rose-600">-{formatCurrency(carteiraUtilizada)}</span>
                </div>
              )}
              {voucherUtilizado > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span className="flex items-center gap-1.5"><Ticket className="h-3 w-3" /> Voucher Promocional Único</span>
                  <span className="font-bold text-rose-600">-{formatCurrency(voucherUtilizado)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bloco 4: Resultado */}
        <div className={`mt-6 rounded-2xl p-6 ring-1 ${isLucro ? 'bg-emerald-600 ring-emerald-700 shadow-lg shadow-emerald-500/20' : 'bg-rose-600 ring-rose-700 shadow-lg shadow-rose-500/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-emerald-100 text-sm font-medium flex items-center gap-2">
              {isLucro ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              LUCRO LÍQUIDO FINAL
            </span>
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLucro ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'} flex items-center gap-1`}>
              <Percent className="h-3 w-3" />
              Margem: {margem.toFixed(1)}%
            </div>
          </div>
          
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-4xl font-black text-white">{formatCurrency(lucroLiquido)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

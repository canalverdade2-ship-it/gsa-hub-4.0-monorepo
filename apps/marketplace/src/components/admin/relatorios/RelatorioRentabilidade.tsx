import { useState, useEffect, useMemo } from 'react';
import { Download, RefreshCw, TrendingUp, AlertCircle, Percent, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioRentabilidade({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  // Filtro de mês de quitação
  const [mesSelecionado, setMesSelecionado] = useState<string>('');

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      // Buscar Faturas de Crédito pagas (produto)
      const { data: faturasRaw } = await supabase
        .from('faturas')
        .select(`
          id, valor_total, valor_base_original, status, data_pagamento, codigo_fatura, tipo, is_amortizacao_credito,
          clientes (nome),
          ordens_compra (
            orcamentos ( id, codigo_orcamento, total, acrescimo, desconto, status )
          )
        `)
        .in('status', ['pago'])
        .in('tipo', ['produto']); // faturas de compras na loja

      const faturas = faturasRaw || [];

      const listContratos: any[] = [];

      // Processar Crédito (Agrupando faturas por Orçamento)
      // Para saber se o orçamento foi quitado, consideramos faturas de Quitação (FAT-QUIT)
      // ou se o orçamento estiver totalmente pago. Simplificando: vamos pegar orçamentos que possuem faturas FAT-QUIT pagas
      // ou orçamentos onde a soma das faturas pagas >= subtotal.
      
      const mapOrcamentos = new Map();
      faturas.forEach((fat: any) => {
        const orc = fat.ordens_compra?.orcamentos;
        if (!orc) return;

        if (!mapOrcamentos.has(orc.id)) {
          mapOrcamentos.set(orc.id, {
            orcamento: orc,
            cliente: fat.clientes?.nome,
            faturasPagas: [],
            data_quitacao: null,
            teveQuitacaoAntecipada: false
          });
        }
        
        const item = mapOrcamentos.get(orc.id);
        item.faturasPagas.push(fat);
        
        if (fat.codigo_fatura?.includes('FAT-QUIT')) {
          item.teveQuitacaoAntecipada = true;
          item.data_quitacao = fat.data_pagamento; // A data da quitação é a data do pagamento da fat-quit
        }
        if (!item.data_quitacao && fat.data_pagamento) {
          item.data_quitacao = fat.data_pagamento; // vai pegando o último
        }
      });

      Array.from(mapOrcamentos.values()).forEach((item: any) => {
        const recebido = item.faturasPagas.reduce((acc: number, f: any) => acc + Number(f.valor_total || 0), 0);
        const projetado = Number(item.orcamento.total) || 0;
        const acrescimo = Number(item.orcamento.acrescimo) || 0;
        const custoBase = projetado - acrescimo;

        // Vamos considerar apenas se já pagou pelo menos o subtotal ou se teve quitação explícita
        if (recebido >= custoBase || item.teveQuitacaoAntecipada || item.orcamento.status === 'pago') {
          listContratos.push({
            tipo: 'Crédito Loja',
            id: item.orcamento.id,
            codigo: item.orcamento.codigo_orcamento,
            cliente: item.cliente || 'Desconhecido',
            data_quitacao: item.data_quitacao,
            custo_base: custoBase,
            projetado: projetado,
            recebido: recebido,
            lucro_projetado: projetado - custoBase,
            lucro_real: recebido - custoBase,
            margem_real: custoBase > 0 ? ((recebido - custoBase) / custoBase) * 100 : 0
          });
        }
      });

      // Ordenar do mais recente para o mais antigo
      listContratos.sort((a, b) => new Date(b.data_quitacao).getTime() - new Date(a.data_quitacao).getTime());

      // Extrair meses únicos para o filtro
      const mesesSet = new Set<string>();
      listContratos.forEach(c => {
        if (c.data_quitacao) {
          const date = new Date(c.data_quitacao);
          const mesStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          mesesSet.add(mesStr);
        }
      });
      const mesesDisponiveis = Array.from(mesesSet).sort().reverse();

      setDados({
        contratos: listContratos,
        mesesDisponiveis
      });
      
      if (mesesDisponiveis.length > 0 && !mesSelecionado) {
        setMesSelecionado(mesesDisponiveis[0]);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const exportar = () => {
    if (!dados) return;
    const filtrados = mesSelecionado 
      ? dados.contratos.filter((c:any) => c.data_quitacao?.startsWith(mesSelecionado))
      : dados.contratos;

    exportarCSV(
      filtrados.map((c: any) => ({
        Tipo: c.tipo,
        Codigo: c.codigo,
        Cliente: c.cliente,
        Data_Quitacao: c.data_quitacao ? new Date(c.data_quitacao).toLocaleDateString() : '',
        Custo_Principal: c.custo_base,
        Valor_Projetado: c.projetado,
        Valor_Recebido: c.recebido,
        Lucro_Projetado: c.lucro_projetado,
        Lucro_Real: c.lucro_real,
        Margem_Real_Pct: c.margem_real.toFixed(2) + '%'
      })),
      `rentabilidade_real_${mesSelecionado || 'todos'}`
    );
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_,i)=><div key={i} className="h-28 bg-neutral-100 rounded-2xl"/>)}</div>;

  const contratosFiltrados = mesSelecionado 
    ? dados?.contratos?.filter((c:any) => c.data_quitacao?.startsWith(mesSelecionado)) || []
    : dados?.contratos || [];

  // Agregações do filtro atual
  const totCusto = contratosFiltrados.reduce((a:number, c:any) => a + c.custo_base, 0);
  const totProjetado = contratosFiltrados.reduce((a:number, c:any) => a + c.projetado, 0);
  const totRecebido = contratosFiltrados.reduce((a:number, c:any) => a + c.recebido, 0);
  const totLucroProjetado = contratosFiltrados.reduce((a:number, c:any) => a + c.lucro_projetado, 0);
  const totLucroReal = contratosFiltrados.reduce((a:number, c:any) => a + c.lucro_real, 0);
  
  const perdaPorDescontos = totLucroProjetado - totLucroReal;
  const margemMediaReal = totCusto > 0 ? (totLucroReal / totCusto) * 100 : 0;
  const margemMediaProjetada = totCusto > 0 ? (totLucroProjetado / totCusto) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-neutral-900 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-indigo-600" /> Rentabilidade Real
          </h2>
          <p className="text-sm text-neutral-500">Mede o lucro real dos contratos após a quitação (descontando negociações).</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select 
            value={mesSelecionado} 
            onChange={e => setMesSelecionado(e.target.value)}
            className="rounded-xl border border-neutral-200 text-sm font-bold px-3 py-2 bg-white"
          >
            <option value="">Todos os Meses</option>
            {dados?.mesesDisponiveis.map((m: string) => {
              const [ano, mes] = m.split('-');
              return <option key={m} value={m}>{mes}/{ano}</option>
            })}
          </select>
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>Excel/CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs Globais do Mês Selecionado */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <p className="text-xs font-bold text-neutral-500 mb-1 uppercase tracking-wider">Custo Principal</p>
          <p className="text-xl font-black text-neutral-900">{formatarMoeda(totCusto)}</p>
          <p className="text-xs text-neutral-400 mt-1">Valor base dos produtos</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-neutral-500 mb-1 uppercase tracking-wider">Recebido Efetivo</p>
              <p className="text-xl font-black text-emerald-600">{formatarMoeda(totRecebido)}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="h-4 w-4"/></div>
          </div>
          <p className="text-xs text-neutral-400 mt-1">Soma de pagamentos recebidos</p>
        </div>
        <div className="rounded-2xl bg-indigo-600 p-5 shadow-sm text-white">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-indigo-200 mb-1 uppercase tracking-wider">Lucro Real</p>
              <p className="text-2xl font-black">{formatarMoeda(totLucroReal)}</p>
            </div>
            <div className="px-2 py-1 bg-white/20 rounded-lg text-xs font-bold">
              {margemMediaReal.toFixed(1)}% Margem
            </div>
          </div>
          <p className="text-xs text-indigo-200 mt-1">Projetado era {margemMediaProjetada.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl bg-red-50 p-5 shadow-sm ring-1 ring-red-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-red-500 mb-1 uppercase tracking-wider">Perda por Descontos</p>
              <p className="text-xl font-black text-red-600">{formatarMoeda(Math.max(0, perdaPorDescontos))}</p>
            </div>
            <AlertCircle className="h-5 w-5 text-red-400"/>
          </div>
          <p className="text-xs text-red-400 mt-1">Devido a descontos concedidos</p>
        </div>
      </div>

      {/* Tabela de Contratos */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="font-bold text-neutral-900">Contratos Finalizados</h3>
          <span className="text-xs font-bold text-neutral-400">{contratosFiltrados.length} encontrados</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-bold">Data</th>
                <th className="px-4 py-3 font-bold">Tipo / Cód</th>
                <th className="px-4 py-3 font-bold">Cliente</th>
                <th className="px-4 py-3 font-bold text-right">Custo Base</th>
                <th className="px-4 py-3 font-bold text-right">Recebido</th>
                <th className="px-4 py-3 font-bold text-right">Lucro Real</th>
                <th className="px-4 py-3 font-bold text-right">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {contratosFiltrados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-500">Nenhum contrato finalizado neste período.</td></tr>
              ) : contratosFiltrados.map((c: any, i: number) => {
                const perdeuLucro = c.lucro_real < c.lucro_projetado;
                return (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-600">
                      {c.data_quitacao ? new Date(c.data_quitacao).toLocaleDateString() : 'N/D'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-1 ${'bg-purple-100 text-purple-700'}`}>{c.tipo}</span>
                      <p className="font-mono text-xs font-bold text-neutral-900">{c.codigo}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{c.cliente}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{formatarMoeda(c.custo_base)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatarMoeda(c.recebido)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-bold text-neutral-900">{formatarMoeda(c.lucro_real)}</p>
                      {perdeuLucro && (
                        <p className="text-[10px] text-red-500 font-medium line-through">{formatarMoeda(c.lucro_projetado)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${c.margem_real > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {c.margem_real.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

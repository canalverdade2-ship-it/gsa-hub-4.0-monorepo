import { useState, useEffect } from 'react';
import { Download, RefreshCw, ShoppingCart, Package, ArrowLeftRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioLoja({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [faturasRes, produtosRes, solicitacoesRes] = await Promise.all([
        supabase.from('faturas').select(`id, valor_pago, status`).eq('tipo', 'produto').eq('status', 'pago').gte('data_pagamento', inicio).lte('data_pagamento', fim),
        supabase.from('produtos').select(`id, nome, estoque_disponivel, controle_estoque, status`).eq('status', 'ativo'),
        supabase.from('loja_solicitacoes').select(`id, tipo, status, created_at`).gte('created_at', inicio).lte('created_at', fim)
      ]);

      const fat = faturasRes.data || [];
      const prod = produtosRes.data || [];
      const sol = solicitacoesRes.data || [];

      // Receita Loja
      const receitaTotal = fat.reduce((acc, f) => acc + (Number(f.valor_pago) || 0), 0);
      const qtdVendas = fat.length;

      // Estoque
      const produtosEmBaixa = prod.filter(p => p.controle_estoque && (p.estoque_disponivel || 0) <= 5);
      const totalProdutosAtivos = prod.length;

      // Trocas e Devoluções
      const trocas = sol.filter(s => s.tipo === 'troca').length;
      const devolucoes = sol.filter(s => s.tipo === 'devolucao').length;
      const solicitacoesPendentes = sol.filter(s => s.status === 'em_analise').length;

      setDados({
        receitaTotal, qtdVendas,
        produtosEmBaixa, totalProdutosAtivos,
        trocas, devolucoes, solicitacoesPendentes,
        sol, prod
      });

    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_,i)=><div key={i} className="h-28 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.prod || []).map((p: any) => ({
      ID: p.id,
      Nome: p.nome,
      Estoque_Controlado: p.controle_estoque ? 'Sim' : 'Não',
      Estoque_Disponivel: p.estoque_disponivel
    })),
    'relatorio_loja_estoque'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório da Loja</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV Estoque</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 mb-3"><TrendingUp className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.receitaTotal || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Receita com Produtos</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 mb-3"><ShoppingCart className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarNumero(dados?.qtdVendas || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Vendas (Faturas Pagas)</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 mb-3"><TrendingUp className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.qtdVendas > 0 ? dados.receitaTotal / dados.qtdVendas : 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Ticket Médio</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600 mb-3"><Package className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarNumero(dados?.totalProdutosAtivos || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Produtos Ativos</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 mb-3"><ArrowLeftRight className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarNumero(dados?.trocas || 0)} / {formatarNumero(dados?.devolucoes || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Trocas / Devoluções</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Estoque em Baixa */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 overflow-x-auto">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500"/> Alertas de Estoque Baixo (≤ 5)</h3>
          {dados?.produtosEmBaixa?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-400 uppercase border-b border-neutral-100">
                  <th className="pb-2 font-bold">Produto</th>
                  <th className="pb-2 font-bold text-right">Qtd Disponível</th>
                </tr>
              </thead>
              <tbody>
                {dados.produtosEmBaixa.map((p: any) => (
                  <tr key={p.id} className="border-b border-neutral-50 last:border-0">
                    <td className="py-2 font-medium text-neutral-800">{p.nome}</td>
                    <td className="py-2 font-black text-right text-red-500">{p.estoque_disponivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-neutral-50 rounded-xl text-center text-sm text-neutral-500">Nenhum produto com estoque crítico no momento.</div>
          )}
        </div>

        {/* Gestão de Logística Reversa */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-neutral-400"/> Solicitações da Loja</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-100">
              <div>
                <p className="text-xs font-bold text-neutral-800">Trocas Solicitadas</p>
                <p className="text-xs text-neutral-500">No período selecionado</p>
              </div>
              <p className="text-xl font-black text-neutral-700">{formatarNumero(dados?.trocas || 0)}</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 border border-neutral-100">
              <div>
                <p className="text-xs font-bold text-neutral-800">Devoluções Solicitadas</p>
                <p className="text-xs text-neutral-500">No período selecionado</p>
              </div>
              <p className="text-xl font-black text-neutral-700">{formatarNumero(dados?.devolucoes || 0)}</p>
            </div>

            <div className={`flex items-center justify-between p-3 rounded-xl border ${dados?.solicitacoesPendentes > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div>
                <p className={`text-xs font-bold ${dados?.solicitacoesPendentes > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>Pendentes de Análise</p>
                <p className={`text-xs ${dados?.solicitacoesPendentes > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>Fila atual de trabalho</p>
              </div>
              <p className={`text-xl font-black ${dados?.solicitacoesPendentes > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatarNumero(dados?.solicitacoesPendentes || 0)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Download, RefreshCw, CreditCard, Wallet, Activity, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioCredito({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [clientesRes, solicitacoesRes] = await Promise.all([
        supabase.from('clientes').select(`id, nome, limite_credito_total, limite_credito_disponivel`).gt('limite_credito_total', 0),
        supabase.from('loja_credito_solicitacoes').select(`id, tipo_solicitacao, status, limite_solicitado, limite_aprovado, created_at`).gte('created_at', inicio).lte('created_at', fim)
      ]);

      const cli = clientesRes.data || [];
      const sol = solicitacoesRes.data || [];

      // Carteira de Crédito Global
      const creditoTotalConcedido = cli.reduce((acc, c) => acc + (Number(c.limite_credito_total) || 0), 0);
      const creditoTotalDisponivel = cli.reduce((acc, c) => acc + (Number(c.limite_credito_disponivel) || 0), 0);
      const creditoUtilizado = creditoTotalConcedido - creditoTotalDisponivel;
      const clientesComCredito = cli.length;

      // Solicitações no período
      const solicitacoesAprovadas = sol.filter(s => ['pre_aprovado', 'contrato_assinado', 'liberado'].includes(s.status));
      const valorAprovadoPeriodo = solicitacoesAprovadas.reduce((acc, s) => acc + (Number(s.limite_aprovado) || 0), 0);
      
      const solicitacoesPendentes = sol.filter(s => ['analise', 'documentos_pendentes', 'contrato_pendente_assinatura'].includes(s.status)).length;
      const solicitacoesNegadas = sol.filter(s => s.status === 'negado').length;
      
      // Top clientes usando crédito
      const cliOrdenados = [...cli].sort((a, b) => {
        const usoA = (a.limite_credito_total || 0) - (a.limite_credito_disponivel || 0);
        const usoB = (b.limite_credito_total || 0) - (b.limite_credito_disponivel || 0);
        return usoB - usoA;
      }).slice(0, 10);

      setDados({
        creditoTotalConcedido, creditoTotalDisponivel, creditoUtilizado, clientesComCredito,
        valorAprovadoPeriodo, solicitacoesAprovadas: solicitacoesAprovadas.length,
        solicitacoesPendentes, solicitacoesNegadas,
        cliOrdenados, cli, sol
      });

    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_,i)=><div key={i} className="h-28 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.cli || []).map((c: any) => ({
      ID: c.id,
      Nome: c.nome,
      Limite_Total: c.limite_credito_total,
      Limite_Disponivel: c.limite_credito_disponivel,
      Limite_Utilizado: (c.limite_credito_total || 0) - (c.limite_credito_disponivel || 0)
    })),
    'relatorio_credito_concedido'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório de Crédito da Loja</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV Carteira</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 mb-3"><ShieldCheck className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.creditoTotalConcedido || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Limite Global Concedido</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 mb-3"><Activity className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.creditoUtilizado || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Crédito Utilizado (Risco Ativo)</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600 mb-3"><Wallet className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.creditoTotalDisponivel || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Crédito Disponível (Ocioso)</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 mb-3"><CreditCard className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarNumero(dados?.clientesComCredito || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Clientes com Crédito Aprovado</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Utilizadores */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 overflow-x-auto">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500"/> Maiores Utilizadores do Limite</h3>
          {dados?.cliOrdenados?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-400 uppercase border-b border-neutral-100">
                  <th className="pb-2 font-bold">Cliente</th>
                  <th className="pb-2 font-bold text-right">Uso / Total</th>
                </tr>
              </thead>
              <tbody>
                {dados.cliOrdenados.map((c: any) => {
                  const uso = (c.limite_credito_total || 0) - (c.limite_credito_disponivel || 0);
                  const pct = c.limite_credito_total > 0 ? ((uso / c.limite_credito_total) * 100).toFixed(0) : '0';
                  return (
                    <tr key={c.id} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2 font-medium text-neutral-800">{c.nome}</td>
                      <td className="py-2 text-right">
                        <span className="font-black text-emerald-600">{formatarMoeda(uso)}</span>
                        <span className="text-xs text-neutral-400 ml-1">({pct}%)</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-neutral-50 rounded-xl text-center text-sm text-neutral-500">Nenhum limite concedido ainda.</div>
          )}
        </div>

        {/* Funil de Solicitações */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><CreditCard className="h-4 w-4 text-neutral-400"/> Funil de Solicitações (Período)</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div>
                <p className="text-xs font-bold text-blue-800">Limites Aprovados no Período</p>
                <p className="text-xs text-blue-600">Qtd: {dados?.solicitacoesAprovadas || 0}</p>
              </div>
              <p className="text-xl font-black text-blue-600">{formatarMoeda(dados?.valorAprovadoPeriodo || 0)}</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div>
                <p className="text-xs font-bold text-amber-800">Aguardando Análise / Assinatura</p>
                <p className="text-xs text-amber-600">Fila de aprovação</p>
              </div>
              <p className="text-xl font-black text-amber-600">{formatarNumero(dados?.solicitacoesPendentes || 0)}</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100">
              <div>
                <p className="text-xs font-bold text-red-800">Solicitações Negadas</p>
                <p className="text-xs text-red-600">Reprovados na esteira</p>
              </div>
              <p className="text-xl font-black text-red-600">{formatarNumero(dados?.solicitacoesNegadas || 0)}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-neutral-100 text-xs text-neutral-500">
            Representa as análises de crédito da loja solicitadas no período selecionado no topo da tela.
          </div>
        </div>
      </div>
    </div>
  );
}

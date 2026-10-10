import { useState, useEffect } from 'react';
import { Download, RefreshCw, ShieldAlert, AlertTriangle, CheckCircle, FileText, Landmark } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioCobranca({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      // Buscar cobranças
      const { data: cobrancas, error } = await supabase
        .from('cobrancas')
        .select(`
          id, status, valor_original, valor_atualizado, dias_atraso,
          created_at, updated_at
        `)
        .gte('created_at', inicio)
        .lte('created_at', fim);

      if (error) throw error;

      const cobr = cobrancas || [];

      const totalInadimplencia = cobr.filter(c => !['quitado', 'cancelado', 'perdoado'].includes(c.status)).reduce((acc, c) => acc + (Number(c.valor_atualizado) || 0), 0);
      const totalQuitado = cobr.filter(c => c.status === 'quitado').reduce((acc, c) => acc + (Number(c.valor_atualizado) || 0), 0);
      const qtdCobrancas = cobr.length;
      
      const qtdAcordos = cobr.filter(c => ['acordo', 'acordo_quebrado'].includes(c.status)).length;
      const qtdAcordosQuebrados = cobr.filter(c => c.status === 'acordo_quebrado').length;
      const valorAcordos = cobr.filter(c => ['acordo', 'acordo_quebrado'].includes(c.status)).reduce((acc, c) => acc + (Number(c.valor_atualizado) || 0), 0);

      const emCartorio = cobr.filter(c => ['cartorio_enviado', 'cartorio_protestado'].includes(c.status)).length;
      const negativados = cobr.filter(c => c.status === 'negativado').length;

      // Status chart
      const statusCounts: Record<string, number> = {};
      cobr.forEach(c => {
        const s = c.status;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });

      setDados({
        totalInadimplencia, totalQuitado, qtdCobrancas,
        qtdAcordos, qtdAcordosQuebrados, valorAcordos,
        emCartorio, negativados, statusCounts, cobr
      });

    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_,i)=><div key={i} className="h-28 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.cobr || []).map((c: any) => ({
      ID: c.id,
      Status: c.status,
      Valor_Original: c.valor_original,
      Valor_Atualizado: c.valor_atualizado,
      Dias_Atraso: c.dias_atraso,
      Acordo_Ativo: ['acordo', 'acordo_quebrado'].includes(c.status) ? 'Sim' : 'Não',
      Data_Criacao: c.created_at
    })),
    'relatorio_cobranca'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório de Cobrança</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-red-50 text-red-600 mb-3"><AlertTriangle className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.totalInadimplencia || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Inadimplência Ativa</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 mb-3"><CheckCircle className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarMoeda(dados?.totalQuitado || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Valor Recuperado (Quitado)</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 mb-3"><ShieldAlert className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarNumero(dados?.qtdAcordos || 0)} / {formatarNumero(dados?.qtdAcordosQuebrados || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Acordos Ativos / Quebrados</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-violet-50 text-violet-600 mb-3"><Landmark className="h-5 w-5"/></div>
          <p className="text-2xl font-black text-neutral-900">{formatarNumero(dados?.emCartorio || 0)} / {formatarNumero(dados?.negativados || 0)}</p>
          <p className="text-xs text-neutral-500 mt-1">Em Cartório / Negativados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-neutral-400"/> Status das Cobranças</h3>
          <div className="space-y-3">
            {Object.entries(dados?.statusCounts || {}).sort((a: any, b: any) => b[1] - a[1]).map(([key, val]: [string, any]) => {
              const pct = dados?.qtdCobrancas > 0 ? (val / dados.qtdCobrancas * 100).toFixed(1) : '0';
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-neutral-700 uppercase">{key.replace(/_/g, ' ')}</span>
                    <span className="font-bold text-neutral-900">{val} <span className="text-neutral-400 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Acordos overview */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-neutral-400"/> Visão de Acordos</h3>
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 mb-4">
            <p className="text-xs text-amber-800 font-bold mb-1">Volume Negociado em Acordos</p>
            <p className="text-3xl font-black text-amber-600">{formatarMoeda(dados?.valorAcordos || 0)}</p>
          </div>
          
          <div className="text-sm text-neutral-600">
            <p>O volume financeiro acima representa as dívidas que estão atualmente sob uma negociação ativa de acordo. É o valor potencial de recuperação a curto e médio prazo.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

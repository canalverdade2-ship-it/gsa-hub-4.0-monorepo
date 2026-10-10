import { useState, useEffect } from 'react';
import { Download, RefreshCw, MessageSquare, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarNumero, getRangeDatas, exportarCSV, formatarData } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioSuporte({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, cliente_id, assunto, status, data_abertura, data_fechamento')
        .gte('data_abertura', inicio)
        .lte('data_abertura', fim);

      const tick = tickets || [];
      const abertos = tick.filter(t=>t.status==='aberto').length;
      const andamento = tick.filter(t=>t.status==='em andamento').length;
      const concluidos = tick.filter(t=>t.status==='concluido').length;
      const total = tick.length;

      // Tempo médio de resolução
      const resolvidos = tick.filter(t=>t.status==='concluido' && t.data_abertura && t.data_fechamento);
      const tempoMedioMs = resolvidos.length>0
        ? resolvidos.reduce((s,t)=>s+(new Date(t.data_fechamento!).getTime()-new Date(t.data_abertura).getTime()),0)/resolvidos.length
        : 0;
      const tempoMedioDias = (tempoMedioMs/(1000*60*60*24)).toFixed(1);
      const tempoMedioHoras = (tempoMedioMs/(1000*60*60)).toFixed(1);

      // Taxa de resolução
      const taxaResolucao = total>0 ? ((concluidos/total)*100).toFixed(1) : '0';

      // Tickets por cliente (top reclamantes)
      const porCliente: Record<string,number> = {};
      tick.forEach(t=>{ if(t.cliente_id) porCliente[t.cliente_id] = (porCliente[t.cliente_id]||0)+1; });
      const topCli = Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).slice(0,5);

      // Últimos tickets abertos
      const ultimos = [...tick].sort((a,b)=>new Date(b.data_abertura).getTime()-new Date(a.data_abertura).getTime()).slice(0,8);

      setDados({ abertos, andamento, concluidos, total, tempoMedioDias, tempoMedioHoras, taxaResolucao, topCli, ultimos, tick });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.tick||[]).map((t:any)=>({ assunto:t.assunto, status:t.status, abertura:formatarData(t.data_abertura), fechamento:formatarData(t.data_fechamento) })),
    'relatorio_suporte'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório de Suporte & Tickets</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Abertos', valor:dados?.abertos, icon:AlertCircle, color:'text-red-500', bg:'bg-red-50' },
          { label:'Em Andamento', valor:dados?.andamento, icon:Clock, color:'text-amber-600', bg:'bg-amber-50' },
          { label:'Concluídos', valor:dados?.concluidos, icon:CheckCircle, color:'text-emerald-600', bg:'bg-emerald-50' },
          { label:'Total', valor:dados?.total, icon:MessageSquare, color:'text-indigo-600', bg:'bg-indigo-50' },
        ].map((k,i)=>(
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${k.bg} ${k.color} mb-3`}><k.icon className="h-5 w-5"/></div>
            <p className="text-2xl font-black text-neutral-900">{formatarNumero(k.valor||0)}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Métricas SLA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-emerald-50 p-5 text-center">
          <p className="text-3xl font-black text-emerald-600">{dados?.taxaResolucao}%</p>
          <p className="text-sm text-emerald-700 mt-1">Taxa de Resolução</p>
        </div>
        <div className="rounded-2xl bg-blue-50 p-5 text-center">
          <p className="text-3xl font-black text-blue-600">{dados?.tempoMedioDias} dias</p>
          <p className="text-sm text-blue-700 mt-1">Tempo Médio Resolução</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 p-5 text-center">
          <p className="text-3xl font-black text-indigo-600">{dados?.tempoMedioHoras}h</p>
          <p className="text-sm text-indigo-700 mt-1">Em horas</p>
        </div>
      </div>

      {/* Últimos Tickets */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 overflow-x-auto">
        <h3 className="font-bold text-neutral-900 mb-4">🎟️ Tickets do Período</h3>
        {dados?.ultimos?.length === 0
          ? <p className="text-sm text-neutral-400">Nenhum ticket no período selecionado.</p>
          : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-400 uppercase border-b border-neutral-100">
                <th className="pb-2 font-bold">Assunto</th>
                <th className="pb-2 font-bold">Abertura</th>
                <th className="pb-2 font-bold">Status</th>
              </tr></thead>
              <tbody>
                {dados?.ultimos.map((t:any)=>{
                  const statusColor = t.status==='concluido' ? 'bg-emerald-100 text-emerald-700' : t.status==='aberto' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                  return (
                    <tr key={t.id} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2 text-neutral-800 max-w-xs truncate">{t.assunto}</td>
                      <td className="py-2 text-neutral-500">{formatarData(t.data_abertura)}</td>
                      <td className="py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusColor}`}>{t.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  );
}

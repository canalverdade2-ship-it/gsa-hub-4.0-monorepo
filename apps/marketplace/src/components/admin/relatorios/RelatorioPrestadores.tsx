import { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

const STATUS_COLORS: Record<string,string> = { pendente:'text-amber-600 bg-amber-50', ativo:'text-emerald-600 bg-emerald-50', suspenso:'text-orange-600 bg-orange-50', desligado:'text-red-500 bg-red-50', em_analise:'text-blue-600 bg-blue-50', reprovado:'text-rose-600 bg-rose-50' };

export function RelatorioPrestadores({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [prestRes, demRes, fatRes, saqRes] = await Promise.all([
        supabase.from('prestadores').select('id, nome_razao, status, area_servico, created_at'),
        supabase.from('prestador_demandas').select('id, prestador_id, status, valor_final, created_at').gte('created_at', inicio).lte('created_at', fim),
        supabase.from('prestador_faturas').select('id, prestador_id, valor, status, data_pagamento').gte('created_at', inicio).lte('created_at', fim),
        supabase.from('prestador_saques').select('id, prestador_id, valor, status, created_at').gte('created_at', inicio).lte('created_at', fim),
      ]);

      const prest = prestRes.data || [];
      const dem = demRes.data || [];
      const fat = fatRes.data || [];
      const saq = saqRes.data || [];

      // Por status
      const porStatus: Record<string, number> = {};
      prest.forEach(p => { porStatus[p.status] = (porStatus[p.status]||0)+1; });

      // Demandas por status
      const demAberta = dem.filter(d => d.status === 'aberta').length;
      const demAtiva = dem.filter(d => d.status === 'ativa').length;
      const demConcluida = dem.filter(d => d.status === 'concluida').length;
      const demCancelada = dem.filter(d => ['recusada','cancelada'].includes(d.status)).length;
      const valorDemConcluidas = dem.filter(d=>d.status==='concluida').reduce((s,d)=>s+(Number(d.valor_final)||0),0);

      // Faturas prestadores
      const fatPaga = fat.filter(f=>f.status==='pago').reduce((s,f)=>s+(Number(f.valor)||0),0);
      const fatPendente = fat.filter(f=>f.status==='pendente').reduce((s,f)=>s+(Number(f.valor)||0),0);

      // Saques prestadores
      const saqPago = saq.filter(s=>s.status==='pago').reduce((s,v)=>s+(Number(v.valor)||0),0);
      const saqAnalise = saq.filter(s=>s.status==='em_analise').reduce((s,v)=>s+(Number(v.valor)||0),0);

      // Top prestadores por demandas concluídas
      const demPorPrest: Record<string,{nome:string;total:number;valor:number}> = {};
      prest.forEach(p=>{ demPorPrest[p.id] = { nome: p.nome_razao, total:0, valor:0 }; });
      dem.filter(d=>d.status==='concluida').forEach(d=>{
        if(demPorPrest[d.prestador_id]) { demPorPrest[d.prestador_id].total++; demPorPrest[d.prestador_id].valor += Number(d.valor_final)||0; }
      });
      const top5 = Object.values(demPorPrest).sort((a,b)=>b.total-a.total).slice(0,5);

      setDados({ porStatus, demAberta, demAtiva, demConcluida, demCancelada, valorDemConcluidas, fatPaga, fatPendente, saqPago, saqAnalise, top5, totalPrest: prest.length, prest });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-28 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.prest||[]).map((p:any)=>({ nome: p.nome_razao, status: p.status, area: p.area_servico||'—' })),
    'relatorio_prestadores'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório de Prestadores</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* Status prestadores */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🔧 Prestadores por Status ({dados?.totalPrest} total)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(dados?.porStatus||{}).map(([status, total]: [string,any])=>(
            <div key={status} className={`rounded-xl p-4 text-center ${STATUS_COLORS[status]?.split(' ')[1] || 'bg-neutral-100'}`}>
              <p className={`text-2xl font-black ${STATUS_COLORS[status]?.split(' ')[0] || 'text-neutral-800'}`}>{total}</p>
              <p className="text-xs text-neutral-500 mt-1 capitalize">{status.replace('_',' ')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Demandas */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">📋 Demandas do Período</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:'Abertas', valor:dados?.demAberta, color:'text-blue-600' },
            { label:'Ativas', valor:dados?.demAtiva, color:'text-indigo-600' },
            { label:'Concluídas', valor:dados?.demConcluida, color:'text-emerald-600' },
            { label:'Canceladas', valor:dados?.demCancelada, color:'text-red-500' },
          ].map((k,i)=>(
            <div key={i} className="text-center border border-neutral-100 rounded-xl p-4">
              <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <p className="text-sm text-neutral-500">Valor total pago (concluídas): <span className="font-black text-emerald-600 text-base">{formatarMoeda(dados?.valorDemConcluidas||0)}</span></p>
        </div>
      </div>

      {/* Financeiro Prestadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-3">💸 Faturas de Prestadores</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Pagas</span><span className="font-bold text-emerald-600">{formatarMoeda(dados?.fatPaga||0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Pendentes</span><span className="font-bold text-amber-600">{formatarMoeda(dados?.fatPendente||0)}</span></div>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-3">🏦 Saques de Prestadores</h3>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Pagos</span><span className="font-bold text-emerald-600">{formatarMoeda(dados?.saqPago||0)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-neutral-500">Em Análise</span><span className="font-bold text-amber-600">{formatarMoeda(dados?.saqAnalise||0)}</span></div>
          </div>
        </div>
      </div>

      {/* Top 5 Prestadores */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🏆 Top 5 Prestadores por Demandas</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-neutral-400 uppercase border-b border-neutral-100"><th className="pb-2">#</th><th className="pb-2">Prestador</th><th className="pb-2 text-right">Concluídas</th><th className="pb-2 text-right">Valor Total</th></tr></thead>
          <tbody>
            {dados?.top5.map((p: any, i: number)=>(
              <tr key={p.nome} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 text-neutral-400 font-bold">{i+1}</td>
                <td className="py-2 font-medium text-neutral-800">{p.nome}</td>
                <td className="py-2 text-right font-bold text-indigo-600">{p.total}</td>
                <td className="py-2 text-right font-bold text-emerald-600">{formatarMoeda(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

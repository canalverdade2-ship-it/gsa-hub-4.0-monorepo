import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Users, ClipboardList, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas } from './utils/relatorioExport';
import { toast } from 'react-hot-toast';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

interface KPIData {
  receitaTotal: number;
  receitaMesAnterior: number;
  novosCli: number;
  novosMesAnterior: number;
  osConcluidas: number;
  osMesAnterior: number;
  faturasPendentes: number;
  saquesPendentes: number;
  receitaMensal: { mes: string; valor: number }[];
  clientesMensal: { mes: string; total: number }[];
  topServicos: { nome: string; total: number }[];
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function RelatorioExecutivo({ periodo, dataInicio, dataFim }: Props) {
  const [dados, setDados] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ultimaAtt, setUltimaAtt] = useState<Date>(new Date());

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);
      const hoje = new Date();
      const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString();
      const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59).toISOString();

      const [fatuRes, fatAnterior, cliRes, cliAnterior, osRes, osAnterior, pendFat, pendSaq, faturalMensal, cliMensal] = await Promise.all([
        supabase.from('faturas').select('valor_pago').eq('status', 'pago').gte('data_pagamento', inicio).lte('data_pagamento', fim),
        supabase.from('faturas').select('valor_pago').eq('status', 'pago').gte('data_pagamento', inicioMesAnterior).lte('data_pagamento', fimMesAnterior),
        supabase.from('clientes').select('id').gte('data_cadastro', inicio).lte('data_cadastro', fim),
        supabase.from('clientes').select('id').gte('data_cadastro', inicioMesAnterior).lte('data_cadastro', fimMesAnterior),
        supabase.from('ordens_servico').select('id').eq('status', 'concluido').gte('data_fim', inicio).lte('data_fim', fim),
        supabase.from('ordens_servico').select('id').eq('status', 'concluido').gte('data_fim', inicioMesAnterior).lte('data_fim', fimMesAnterior),
        supabase.from('faturas').select('id', { count: 'exact' }).eq('status', 'pendente'),
        supabase.from('saques').select('id', { count: 'exact' }).eq('status', 'pendente'),
        supabase.from('faturas').select('valor_pago, data_pagamento').eq('status', 'pago'),
        supabase.from('clientes').select('data_cadastro'),
      ]);

      const receitaTotal = (fatuRes.data || []).reduce((s, f) => s + (Number(f.valor_pago) || 0), 0);
      const receitaMesAnterior = (fatAnterior.data || []).reduce((s, f) => s + (Number(f.valor_pago) || 0), 0);

      // Receita mensal últimos 12 meses
      const rm: Record<number, number> = {};
      (faturalMensal.data || []).forEach(f => {
        if (!f.data_pagamento) return;
        const m = new Date(f.data_pagamento).getMonth();
        rm[m] = (rm[m] || 0) + (Number(f.valor_pago) || 0);
      });
      const receitaMensal = MESES.map((mes, i) => ({ mes, valor: rm[i] || 0 }));

      // Clientes mensal
      const cm: Record<number, number> = {};
      (cliMensal.data || []).forEach(c => {
        if (!c.data_cadastro) return;
        const m = new Date(c.data_cadastro).getMonth();
        cm[m] = (cm[m] || 0) + 1;
      });
      const clientesMensal = MESES.map((mes, i) => ({ mes, total: cm[i] || 0 }));

      setDados({
        receitaTotal, receitaMesAnterior,
        novosCli: cliRes.data?.length || 0,
        novosMesAnterior: cliAnterior.data?.length || 0,
        osConcluidas: osRes.data?.length || 0,
        osMesAnterior: osAnterior.data?.length || 0,
        faturasPendentes: pendFat.count || 0,
        saquesPendentes: pendSaq.count || 0,
        receitaMensal, clientesMensal,
        topServicos: [],
      });
      setUltimaAtt(new Date());
    } catch(e) { 
      console.error(e); 
      toast.error('Erro ao gerar relatório');
    }
    finally { setLoading(false); }
  };

  const diff = (a: number, b: number) => b === 0 ? null : ((a - b) / b * 100).toFixed(1);

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-neutral-100 rounded-2xl" />)}
    </div>
  );

  const kpis = [
    { label: 'Receita do Período', valor: formatarMoeda(dados?.receitaTotal || 0), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', delta: diff(dados?.receitaTotal||0, dados?.receitaMesAnterior||0) },
    { label: 'Novos Clientes', valor: formatarNumero(dados?.novosCli || 0), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', delta: diff(dados?.novosCli||0, dados?.novosMesAnterior||0) },
    { label: 'OS Concluídas', valor: formatarNumero(dados?.osConcluidas || 0), icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-50', delta: diff(dados?.osConcluidas||0, dados?.osMesAnterior||0) },
    { label: 'Pendências Críticas', valor: formatarNumero((dados?.faturasPendentes||0) + (dados?.saquesPendentes||0)), icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', delta: null },
  ];

  const maxReceita = Math.max(...(dados?.receitaMensal.map(r => r.valor) || [1]));
  const maxClientes = Math.max(...(dados?.clientesMensal.map(c => c.total) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Visão Executiva</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">Atualizado às {ultimaAtt.toLocaleTimeString('pt-BR')}</span>
          <button onClick={carregar} disabled={loading} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${k.bg} ${k.color}`}><k.icon className="h-5 w-5"/></div>
              {k.delta !== null && (
                <span className={`flex items-center gap-1 text-xs font-bold ${Number(k.delta) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {Number(k.delta) >= 0 ? <TrendingUp className="h-3 w-3"/> : <TrendingDown className="h-3 w-3"/>} {k.delta}%
                </span>
              )}
            </div>
            <p className="text-2xl font-black text-neutral-900">{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico Receita Mensal */}
      <div className="rounded-2xl bg-neutral-900 p-6 text-white">
        <h3 className="font-bold text-lg mb-5">📈 Receita Mensal (Ano Corrente)</h3>
        <div className="flex items-end gap-2 h-40">
          {dados?.receitaMensal.map((r, i) => {
            const pct = maxReceita > 0 ? (r.valor / maxReceita) * 100 : 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-white/50">{r.valor > 0 ? `R$${(r.valor/1000).toFixed(0)}k` : ''}</span>
                <div className="w-full rounded-t-lg bg-indigo-500 hover:bg-indigo-400 transition-all" style={{ height: `${Math.max(pct, 2)}%`, minHeight: pct > 0 ? '4px' : '0' }} />
                <span className="text-[9px] font-bold text-white/40">{r.mes}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráfico Clientes */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-lg mb-5 text-neutral-900">👥 Novos Clientes por Mês</h3>
        <div className="flex items-end gap-2 h-32">
          {dados?.clientesMensal.map((c, i) => {
            const pct = maxClientes > 0 ? (c.total / maxClientes) * 100 : 0;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] font-bold text-neutral-400">{c.total > 0 ? c.total : ''}</span>
                <div className="w-full rounded-t-lg bg-blue-400 hover:bg-blue-500 transition-all" style={{ height: `${Math.max(pct, 2)}%`, minHeight: c.total > 0 ? '4px' : '0' }} />
                <span className="text-[9px] font-bold text-neutral-400">{c.mes}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alertas de Pendências */}
      {((dados?.faturasPendentes || 0) + (dados?.saquesPendentes || 0)) > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4"/> Atenção — Pendências</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-2xl font-black text-amber-700">{dados?.faturasPendentes}</p>
              <p className="text-xs text-amber-600">Faturas pendentes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-amber-700">{dados?.saquesPendentes}</p>
              <p className="text-xs text-amber-600">Saques pendentes</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

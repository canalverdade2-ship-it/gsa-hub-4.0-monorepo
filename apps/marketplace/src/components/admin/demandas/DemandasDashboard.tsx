import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { format, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';

interface Props {
  adminType?: 'admin' | 'colaborador';
  colaboradorId?: string;
}

export function DemandasDashboard({ adminType, colaboradorId }: Props) {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'trimestre'>('mes');
  const [dados, setDados] = useState<any>(null);


  const carregar = async () => {
    setLoading(true);
    try {
      const agora = new Date();
      let inicio: Date;
      switch (periodo) {
        case 'semana': inicio = startOfWeek(agora, { weekStartsOn: 1 }); break;
        case 'trimestre': inicio = subMonths(agora, 3); break;
        default: inicio = startOfMonth(agora);
      }
      const inicioISO = inicio.toISOString();

      const [demandasRes, colaboradoresRes] = await Promise.all([
        supabase.from('prestador_demandas').select('id, status, colaborador_id, prestador_id, prioridade, prazo_limite, created_at, data_conclusao, colaborador:colaboradores(nome), prestador:prestadores(nome_razao)'),
        supabase.from('colaboradores').select('id, nome').eq('status', 'ativo'),
      ]);

      const demandas = demandasRes.data || [];
      const colaboradores = colaboradoresRes.data || [];
      const doPeriodo = demandas.filter(d => d.created_at >= inicioISO);

      // Totais gerais
      const total = doPeriodo.length;
      const concluidas = doPeriodo.filter(d => ['concluida', 'finalizada'].includes(d.status)).length;
      const abertas = doPeriodo.filter(d => ['aberta', 'ativa', 'aguardando_atribuicao'].includes(d.status)).length;
      const emAnalise = doPeriodo.filter(d => ['em_analise', 'concluida_interna'].includes(d.status)).length;
      const vencidas = doPeriodo.filter(d => d.prazo_limite && new Date(d.prazo_limite) < agora && !['concluida', 'finalizada'].includes(d.status)).length;

      // SLA
      const slaOk = doPeriodo.filter(d => ['concluida', 'finalizada'].includes(d.status) && d.data_conclusao && d.prazo_limite && new Date(d.data_conclusao) <= new Date(d.prazo_limite)).length;
      const taxaSla = concluidas > 0 ? ((slaOk / concluidas) * 100).toFixed(1) : '0';

      // Por prioridade
      const porPrioridade: Record<string, number> = { urgente: 0, alta: 0, normal: 0, baixa: 0 };
      doPeriodo.forEach(d => { if (d.prioridade && !['concluida', 'finalizada'].includes(d.status)) porPrioridade[d.prioridade] = (porPrioridade[d.prioridade] || 0) + 1; });

      // Por colaborador
      const porColab: Record<string, { nome: string; total: number; concluidas: number; vencidas: number }> = {};
      colaboradores.forEach(c => { porColab[c.id] = { nome: c.nome, total: 0, concluidas: 0, vencidas: 0 }; });
      doPeriodo.forEach(d => {
        if (d.colaborador_id && porColab[d.colaborador_id]) {
          porColab[d.colaborador_id].total++;
          if (['concluida', 'finalizada'].includes(d.status)) porColab[d.colaborador_id].concluidas++;
          if (d.prazo_limite && new Date(d.prazo_limite) < agora && !['concluida', 'finalizada'].includes(d.status)) porColab[d.colaborador_id].vencidas++;
        }
      });
      const rankingColab = Object.values(porColab).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
      const maxColab = Math.max(...rankingColab.map(c => c.total), 1);

      setDados({ total, concluidas, abertas, emAnalise, vencidas, taxaSla, porPrioridade, rankingColab, maxColab });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-neutral-100 rounded-2xl" />)}</div>;

  const PRIO_STYLES: Record<string, string> = {
    urgente: 'bg-red-500', alta: 'bg-orange-500', normal: 'bg-blue-500', baixa: 'bg-neutral-400'
  };
  const PRIO_LABELS: Record<string, string> = {
    urgente: 'üî¥ Urgente', alta: 'üü† Alta', normal: 'üîµ Normal', baixa: '??™ Baixa'
  };

  useEffect(() => { carregar(); }, [periodo]);

  useRealtimeSubscription([
    { table: 'prestador_demandas', onChange: carregar, debounceMs: 300 },
    { table: 'colaboradores', onChange: carregar, debounceMs: 300 },
    { table: 'prestadores', onChange: carregar, debounceMs: 300 },
  ], [periodo]);
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-black text-neutral-900">üìä Performance da Equipe</h2>
        <div className="flex items-center gap-2">
          {(['semana', 'mes', 'trimestre'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)} disabled={loading} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${periodo === p ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
              {p === 'semana' ? 'Semana' : p === 'mes' ? 'MÍs' : 'Trimestre'}
            </button>
          ))}
          <button onClick={carregar} disabled={loading} className="h-9 w-9 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 transition-all disabled:opacity-50">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', valor: dados?.total, icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'ConcluÌdas', valor: dados?.concluidas, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Em Andamento', valor: dados?.abertas, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Em An·lise (Vendas)', valor: dados?.emAnalise, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Vencidas üî¥', valor: dados?.vencidas, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((k, i) => (
          <div key={i} className={`rounded-2xl ${k.bg} p-4`}>
            <k.icon className={`h-5 w-5 ${k.color} mb-2`} />
            <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* SLA */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2">‚è±Ô∏è Cumprimento de SLA</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${Number(dados?.taxaSla) >= 80 ? 'bg-emerald-500' : Number(dados?.taxaSla) >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${dados?.taxaSla || 0}%` }}
            />
          </div>
          <span className={`text-2xl font-black ${Number(dados?.taxaSla) >= 80 ? 'text-emerald-600' : Number(dados?.taxaSla) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {dados?.taxaSla}%
          </span>
        </div>
        <p className="text-xs text-neutral-400 mt-2">% de demandas concluÌdas dentro do prazo</p>
      </div>

      {/* Por Prioridade */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">üö¶ Demandas em Aberto por Prioridade</h3>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(dados?.porPrioridade || {}).map(([prio, total]: any) => (
            <div key={prio} className="text-center rounded-xl bg-neutral-50 p-4">
              <p className={`text-2xl font-black ${prio === 'urgente' ? 'text-red-600' : prio === 'alta' ? 'text-orange-600' : prio === 'normal' ? 'text-blue-600' : 'text-neutral-500'}`}>{total}</p>
              <p className="text-xs text-neutral-400 mt-1">{PRIO_LABELS[prio]}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking colaboradores */}
      {dados?.rankingColab?.length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-5">üèÜ Ranking da Equipe Interna</h3>
          <div className="space-y-4">
            {dados.rankingColab.map((c: any, i: number) => {
              const pct = ((c.total / dados.maxColab) * 100).toFixed(0);
              const taxaConcl = c.total > 0 ? ((c.concluidas / c.total) * 100).toFixed(0) : '0';
              return (
                <div key={c.nome}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-neutral-300 w-4">#{i + 1}</span>
                      <span className="font-bold text-neutral-800">{c.nome}</span>
                      {c.vencidas > 0 && <span className="text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{c.vencidas} vencida(s)</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-neutral-400">{c.concluidas}/{c.total}</span>
                      <span className={`font-black ${Number(taxaConcl) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{taxaConcl}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dados?.rankingColab?.length === 0 && (
        <div className="rounded-2xl bg-neutral-50 p-12 text-center">
          <p className="text-neutral-400 text-sm">Nenhum dado de equipe no perÌodo selecionado.</p>
        </div>
      )}
    </div>
  );
}

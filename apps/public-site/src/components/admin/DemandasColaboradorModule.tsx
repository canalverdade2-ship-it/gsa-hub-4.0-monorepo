import React, { useEffect, useState } from 'react';
import {
  ClipboardList, Plus, RefreshCw, LayoutGrid, List, BarChart3,
  AlertCircle, Clock, CheckCircle2, Layers, DollarSign, TrendingUp
} from 'lucide-react';
import { callAdminRpc } from '../../lib/adminRpc';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { isPast } from 'date-fns';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

import { DemandasKanban } from './demandas/DemandasKanban';
import { DemandasTabela } from './demandas/DemandasTabela';
import { DemandasDashboard } from './demandas/DemandasDashboard';
import { NovaDemandaModal } from './demandas/NovaDemandaModal';
import { DemandasDetalhesModal } from './demandas/DemandasDetalhesModal';

interface Props {
  colaboradorId?: string;
  colaboradorNome?: string;
  adminType?: 'admin' | 'colaborador';
  initialItemId?: string;
  initialTab?: string;
}

type View = 'kanban' | 'tabela' | 'performance';

export function DemandasColaboradorModule({ colaboradorId, colaboradorNome, adminType, initialItemId, initialTab }: Props) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('kanban');
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [prestadores, setPrestadores] = useState<any[]>([]);
  const [selectedDemanda, setSelectedDemanda] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showNovaDemanda, setShowNovaDemanda] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const isAdmin = adminType === 'admin';

  const fetchDemandas = async () => {
    setLoading(true);
    try {
      if (adminType === 'colaborador') {
        const data = await callAdminRpc<any[]>('gsa_collaborator_list_demands');
        setDemandas(Array.isArray(data) ? data : []);
        return;
      }

      const { data, error } = await supabase
        .from('prestador_demandas')
        .select(`
          *,
          ordem_servico:ordens_servico(id, codigo_os, cliente_id, cliente:clientes(id, nome)),
          colaborador:colaboradores(id, nome),
          prestador:prestadores(id, nome_razao)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDemandas(data || []);
    } catch (error) {
      console.error('Erro ao carregar demandas:', error);
      setDemandas([]);
      toast.error('Erro ao carregar demandas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuxiliares = async () => {
    if (!isAdmin) {
      setColaboradores([]);
      setPrestadores([]);
      return;
    }

    try {
      const [colabRes, prestRes] = await Promise.all([
        supabase.from('colaboradores').select('id, nome').eq('status', 'ativo'),
        supabase.from('prestadores').select('id, nome_razao').eq('status', 'ativo'),
      ]);
      setColaboradores(colabRes.data || []);
      setPrestadores(prestRes.data || []);
    } catch (error) {
      console.error('Erro ao buscar auxiliares:', error);
      toast.error('Erro ao buscar colaboradores e prestadores.');
    }
  };

  const refreshHistorico = async (demandaId: string) => {
    try {
      if (adminType === 'colaborador') {
        const data = await callAdminRpc<any[]>('gsa_collaborator_demand_history', {
          p_demanda_id: demandaId,
        });
        setHistorico(Array.isArray(data) ? data : []);
        return;
      }

      const { data, error } = await supabase
        .from('prestador_demandas_historico')
        .select(`
          *,
          origem:colaboradores!colaborador_origem_id(id, nome),
          destino:colaboradores!colaborador_destino_id(id, nome),
          destino_prestador:prestadores!prestador_destino_id(id, nome_razao),
          origem_prestador:prestadores!prestador_origem_id(id, nome_razao)
        `)
        .eq('demanda_id', demandaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistorico(data || []);
    } catch (error) {
      console.error('Erro ao buscar histórico da demanda:', error);
      setHistorico([]);
    }
  };

  const abrirDetalhes = async (demanda: any) => {
    setSelectedDemanda(demanda);
    setShowDetalhes(true);
    await refreshHistorico(demanda.id);
  };

  useEffect(() => {
    void fetchDemandas();
    void fetchAuxiliares();
  }, [colaboradorId, adminType]);

  useEffect(() => {
    if (initialItemId && demandas.length > 0) {
      const demanda = demandas.find((item) => item.id === initialItemId || item.os_id === initialItemId);
      if (demanda) {
        void abrirDetalhes(demanda);
        setHighlightedId(initialItemId);
        window.setTimeout(() => {
          const element = document.getElementById(`demanda-${initialItemId}`);
          if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500);
        window.setTimeout(() => setHighlightedId(null), 4000);
      }
    }
  }, [initialItemId, demandas.length]);

  useRealtimeSubscription([
    { table: 'prestador_demandas', onChange: fetchDemandas, debounceMs: 300 },
    {
      table: 'prestador_demandas_historico',
      onChange: fetchDemandas,
      onPayload: (payload) => {
        if (selectedDemanda && payload.new && (payload.new as any).demanda_id === selectedDemanda.id) {
          void refreshHistorico(selectedDemanda.id);
        }
      },
      debounceMs: 300,
    },
    { table: 'demanda_comentarios', onChange: fetchDemandas, debounceMs: 300 },
    { table: 'os_notas', onChange: fetchDemandas, debounceMs: 300 },
    { table: 'os_suporte_mensagens', onChange: fetchDemandas, debounceMs: 300 },
    { table: 'colaboradores', onChange: fetchAuxiliares, debounceMs: 300 },
    { table: 'prestadores', onChange: fetchAuxiliares, debounceMs: 300 },
  ], [colaboradorId, adminType, selectedDemanda?.id]);

  const emAberto = demandas.filter((d) =>
    ['aguardando_atribuicao', 'aberta', 'em_ajuste'].includes(d.status) || d.status_aceite === 'pendente_aceite'
  ).length;
  const emExecucao = demandas.filter((d) => d.status === 'ativa').length;
  const emAnalise = demandas.filter((d) => d.status === 'em_analise').length;
  const emNegociacao = demandas.filter((d) => ['em_negociacao', 'contraproposta_prestador', 'contraproposta_admin_final'].includes(d.status)).length;
  const vencidas = demandas.filter((d) => d.prazo_limite && isPast(new Date(d.prazo_limite)) && !['concluida', 'concluida_interna', 'finalizada', 'cancelada'].includes(d.status)).length;
  const concluidas = demandas.filter((d) => ['concluida', 'finalizada', 'concluida_interna'].includes(d.status)).length;
  const urgentes = demandas.filter((d) => d.prioridade === 'urgente' && !['concluida', 'concluida_interna', 'finalizada', 'cancelada'].includes(d.status)).length;
  const contrapropostas = demandas.filter((d) => d.status === 'contraproposta_prestador').length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-[#1a1a1a] p-5 md:p-8 rounded-[2rem] text-white relative shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="h-8 w-1 bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)]" />
              <h1 className="text-lg md:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400">
                Gestão Interna de Demandas
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {([
                { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
                { id: 'tabela', label: 'Tabela', icon: List },
                { id: 'performance', label: 'Performance', icon: BarChart3 },
              ] as { id: View; label: string; icon: React.ElementType }[]).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === item.id ? 'bg-white text-indigo-700' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'}`}
                >
                  <item.icon className="h-3.5 w-3.5" />{item.label}
                </button>
              ))}

              <button onClick={() => void fetchDemandas()} className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white transition-all">
                <RefreshCw className="h-4 w-4" />
              </button>

              {isAdmin && (
                <button
                  onClick={() => setShowNovaDemanda(true)}
                  className="flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-900/30"
                >
                  <Plus className="h-4 w-4" /> Nova Demanda
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Em Aberto', valor: emAberto, icon: Layers, color: 'text-white', bg: 'bg-white/10' },
              { label: 'Em Execução', valor: emExecucao, icon: Clock, color: 'text-blue-300', bg: 'bg-blue-500/15' },
              { label: 'Em Análise', valor: emAnalise, icon: TrendingUp, color: 'text-violet-300', bg: 'bg-violet-500/15' },
              { label: 'Concluídas', valor: concluidas, icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
              { label: '💬 Negociação', valor: emNegociacao, icon: DollarSign, color: contrapropostas > 0 ? 'text-yellow-300 animate-pulse' : 'text-yellow-300', bg: 'bg-yellow-500/15' },
              { label: 'Vencidas 🔴', valor: vencidas, icon: AlertCircle, color: 'text-red-300', bg: 'bg-red-500/20' },
            ].map((item, index) => (
              <div key={index} className={`rounded-2xl ${item.bg} px-4 py-3 flex items-center gap-3`}>
                <item.icon className={`h-5 w-5 shrink-0 ${item.color}`} />
                <div>
                  <p className={`text-xl font-black ${item.color}`}>{item.valor}</p>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{item.label}</p>
                </div>
              </div>
            ))}
          </div>

          {contrapropostas > 0 && (
            <div className="flex items-center gap-3 bg-yellow-500/20 border border-yellow-500/30 rounded-2xl px-5 py-3">
              <DollarSign className="h-5 w-5 text-yellow-300 shrink-0 animate-pulse" />
              <p className="text-sm font-bold text-yellow-300">⚡ {contrapropostas} demanda(s) com CONTRAPROPOSTA do prestador aguardando sua resposta!</p>
              <button onClick={() => setView('kanban')} className="ml-auto text-xs font-black bg-yellow-400/20 text-yellow-200 px-3 py-1 rounded-full hover:bg-yellow-400/30 transition-all whitespace-nowrap">Ver Kanban →</button>
            </div>
          )}
          {vencidas > 0 && (
            <div className="flex items-center gap-3 bg-red-500/20 border border-red-500/30 rounded-2xl px-5 py-3">
              <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              <p className="text-sm font-bold text-red-300">⚠️ {vencidas} demanda(s) com prazo vencido! Verifique na aba Tabela → filtro "Vencidas".</p>
            </div>
          )}
          {urgentes > 0 && (
            <div className="flex items-center gap-3 bg-orange-500/20 border border-orange-500/30 rounded-2xl px-5 py-3">
              <AlertCircle className="h-5 w-5 text-orange-400 shrink-0" />
              <p className="text-sm font-bold text-orange-300">🔴 {urgentes} demanda(s) com prioridade URGENTE em aberto.</p>
            </div>
          )}
        </div>
      </div>

      <div>
        {view === 'kanban' && <DemandasKanban demandas={demandas} onVerDetalhes={abrirDetalhes} highlightedId={highlightedId} />}
        {view === 'tabela' && <DemandasTabela demandas={demandas} onVerDetalhes={abrirDetalhes} highlightedId={highlightedId} />}
        {view === 'performance' && <DemandasDashboard adminType={adminType} colaboradorId={colaboradorId} />}
      </div>

      {showDetalhes && selectedDemanda && (
        <DemandasDetalhesModal
          demanda={selectedDemanda}
          initialTab={initialTab}
          historico={historico}
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
          adminType={adminType}
          colaboradores={colaboradores}
          prestadores={prestadores}
          onClose={() => setShowDetalhes(false)}
          onRefresh={fetchDemandas}
          onRefreshHistorico={() => refreshHistorico(selectedDemanda.id)}
        />
      )}

      {showNovaDemanda && (
        <NovaDemandaModal
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
          onClose={() => setShowNovaDemanda(false)}
          onSuccess={fetchDemandas}
        />
      )}
    </div>
  );
}

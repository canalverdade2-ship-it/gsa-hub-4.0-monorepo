import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { formatDateTime } from '../../lib/utils';
import {
  Terminal, CheckCircle2, XCircle, Loader2, Sparkles, Zap, RefreshCw, Activity,
  ShieldCheck, AlertTriangle, PackagePlus, RefreshCcw, PackageX, AlertCircle, ExternalLink
} from 'lucide-react';

interface LogItem {
  id: string;
  automacao_id: string;
  passo: string;
  status: string;
  mensagem: string;
  progresso: number;
  detalhes?: {
    novos?: number;
    atualizados?: number;
    esgotados?: number;
    erros?: string[];
    motivo_erro?: string;
    url_alvo?: string;
    produtos_encontrados?: number;
  };
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  automacao: any;
  onReTrigger?: () => void;
}

export function ScrapingExecutionMonitorModal({ isOpen, onClose, automacao, onReTrigger }: Props) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const lastLog = logs[logs.length - 1];
  
  // O status SÓ é Concluído se ALGUM log da Execução atual for 'sucesso' ou progresso 100%
  const isFinishedSuccess = logs.some(l => l.status === 'sucesso' || l.passo === 'sucesso' || l.progresso === 100);
  const isError = lastLog?.status === 'erro' || lastLog?.passo === 'erro';
  const isFinished = isFinishedSuccess || isError;

  // Extrair Estatísticas dos detalhes dos logs
  const logComDetalhes = [...logs].reverse().find(l => l.detalhes && (l.detalhes.novos !== undefined || l.detalhes.erros));
  const novosCount = logComDetalhes?.detalhes?.novos ?? (isFinishedSuccess ? (automacao?.produtos_count || 0) : 0);
  const atualizadosCount = logComDetalhes?.detalhes?.atualizados ?? 0;
  const esgotadosCount = logComDetalhes?.detalhes?.esgotados ?? 0;
  const listaErros = logComDetalhes?.detalhes?.erros ?? (isError && lastLog ? [lastLog.mensagem] : []);

  // Timer de segundos decorridos
  useEffect(() => {
    if (!isOpen || isFinished) return;

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isFinished]);

  useEffect(() => {
    if (!isOpen || !automacao?.id) return;
    setElapsedSeconds(0);
    fetchLogs();

    const channel = supabase
      .channel(`realtime_scraping_logs_${automacao.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'automacao_scraping_logs',
          filter: `automacao_id=eq.${automacao.id}`,
        },
        () => {
          fetchLogsQuiet();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      fetchLogsQuiet();
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [isOpen, automacao?.id]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchLogsQuiet = async () => {
    try {
      const { data } = await supabase
        .from('automacao_scraping_logs')
        .select('*')
        .eq('automacao_id', automacao.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (data) setLogs([...data].reverse());
    } catch {
      /* silencioso */
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    await fetchLogsQuiet();
    setLoading(false);
  };

  if (!automacao) return null;

  // Progresso real derivado EXCLUSIVAMENTE do banco de dados (sem simulação falsa)
  const currentProgress = isFinishedSuccess ? 100 : (lastLog?.progresso ?? (loading ? 0 : 10));

  const getPassoBadge = (passo: string) => {
    switch (passo) {
      case 'iniciando':
        return <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-mono text-blue-400">INIT</span>;
      case 'webhook':
        return <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-mono text-purple-400">WEBHOOK</span>;
      case 'scraping':
      case 'processando':
        return <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-400">SCRAPING</span>;
      case 'ia_vision':
      case 'vision':
        return <span className="rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] font-mono text-pink-400">IA-GPT4O</span>;
      case 'sync':
        return <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-mono text-cyan-400">DB-SYNC</span>;
      case 'sucesso':
      case 'concluido':
        return <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400">SUCESSO</span>;
      case 'erro':
        return <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-mono text-red-400">ERRO</span>;
      default:
        return <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-mono text-neutral-300">LOG</span>;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Relatório Detalhado de Execução do Robô" size="xl">
      <div className="space-y-5">
        {/* Header da Automação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-neutral-900 p-4 text-white shadow-xl border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30">
              <Activity className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-base">{automacao.nome}</h3>
              <p className="text-xs text-neutral-400">
                {automacao.tipo === 'viagens' ? 'GSA Viagens' : 'GSA Store'} Â· Margem: <span className="text-emerald-400 font-bold">{automacao.margem_lucro}%</span> Â· Sync ID: <span className="font-mono text-indigo-300">{automacao.sync_id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isFinished && (
              <div className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1 text-xs font-mono text-neutral-300 border border-neutral-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                <span>{elapsedSeconds}s decorridos</span>
              </div>
            )}

            {!isFinished ? (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400 border border-amber-500/30">
                Processando...
              </span>
            ) : isError ? (
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400 border border-red-500/30">
                <XCircle className="h-3.5 w-3.5" /> Com Erros
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
              </span>
            )}
          </div>
        </div>

        {/* MTRICAS DE RESULTADO DETALHADAS (KPIs) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-emerald-950 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
              <span>Novos Importados</span>
              <PackagePlus className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-900">{novosCount}</p>
            <p className="text-[10px] text-emerald-700/80">{automacao?.tipo === 'viagens' ? 'Pacotes no GSA Viagens' : 'Inseridos na loja'}</p>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-indigo-950 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
              <span>Preços Atualizados</span>
              <RefreshCcw className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-black text-indigo-900">{atualizadosCount}</p>
            <p className="text-[10px] text-indigo-700/80">Reajuste de margem</p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3.5 text-amber-950 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-amber-700">
              <span>Marcados Esgotados</span>
              <PackageX className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-amber-900">{esgotadosCount}</p>
            <p className="text-[10px] text-amber-700/80">{automacao?.tipo === 'viagens' ? 'Sem vagas' : 'Sumiu da loja alvo'}</p>
          </div>

          <div className={`rounded-2xl border p-3.5 space-y-1 ${listaErros.length > 0 ? 'border-red-200 bg-red-50 text-red-950' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Falhas / Erros</span>
              <AlertTriangle className={`h-4 w-4 ${listaErros.length > 0 ? 'text-red-600' : 'text-neutral-400'}`} />
            </div>
            <p className={`text-2xl font-black ${listaErros.length > 0 ? 'text-red-900' : 'text-neutral-800'}`}>{listaErros.length}</p>
            <p className="text-[10px] opacity-80">{listaErros.length > 0 ? 'Requer atenção' : 'Nenhuma falha'}</p>
          </div>
        </div>

        {/* Caixa de Alerta de Erro Detalhado (se houver erro) */}
        {listaErros.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 font-black text-red-800 text-sm">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" /> Diagnóstico da Falha Encontrada
            </div>
            <div className="space-y-1 pl-7">
              {listaErros.map((err, idx) => (
                <p key={idx} className="font-mono text-red-700 bg-white/80 p-2 rounded-lg border border-red-100 font-semibold leading-relaxed">
                  âš ï¸ {err}
                </p>
              ))}
            </div>
            <p className="text-[11px] text-red-600/80 pl-7">
              Para resolver: utilize a URL direta de um produto ou de uma loja com catálogo HTML público (ex: Shopify, Nuvemshop, WooCommerce, etc.).
            </p>
          </div>
        )}

        {/* Barra de Progresso Real */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-neutral-700">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Progresso Real Confirmado pelo Banco
            </span>
            <span className="font-mono text-indigo-600">{currentProgress}%</span>
          </div>
          <div className="h-3.5 w-full overflow-hidden rounded-full bg-neutral-100 p-0.5 border border-neutral-200 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isError
                  ? 'bg-red-500'
                  : currentProgress >= 100
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 animate-pulse'
              }`}
              style={{ width: `${Math.min(currentProgress, 100)}%` }}
            />
          </div>
        </div>

        {/* Console de Logs em Tempo Real */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs shadow-2xl">
          <div className="mb-3 flex items-center justify-between border-b border-neutral-800 pb-2.5">
            <div className="flex items-center gap-2 text-neutral-400 font-bold">
              <Terminal className="h-4 w-4 text-emerald-400" /> Logs de Execução N8N (Tempo Real)
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchLogs}
                className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 hover:text-white transition"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
              </button>
            </div>
          </div>

          <div ref={logContainerRef} className="h-56 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {loading && logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
                <Loader2 className="h-6 w-6 animate-spin mb-2 text-indigo-400" />
                <p className="text-xs font-mono">Buscando histórico de logs no banco...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-500 space-y-3">
                <Terminal className="h-8 w-8 text-neutral-700" />
                <p className="text-xs font-mono text-neutral-400">Nenhum log gravado ainda para esta Automação.</p>
                {onReTrigger && (
                  <button
                    onClick={onReTrigger}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/30"
                  >
                    <Zap className="h-3.5 w-3.5" /> Disparar Execução Agora
                  </button>
                )}
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5 text-neutral-300 leading-relaxed hover:bg-neutral-900/60 p-1 rounded transition">
                  <span className="text-neutral-600 text-[10px] shrink-0 pt-0.5">
                    {formatDateTime(log.created_at).split(' ')[1] || log.created_at}
                  </span>
                  {getPassoBadge(log.passo)}
                  <span className={`flex-1 ${log.status === 'erro' ? 'text-red-400 font-semibold' : log.status === 'sucesso' ? 'text-emerald-300 font-semibold' : 'text-neutral-200'}`}>
                    {log.mensagem}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rodapé e Ações */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <ShieldCheck className="h-4 w-4 text-indigo-600" /> Transmissão auditada via Supabase Realtime
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {onReTrigger && (
              <button
                onClick={onReTrigger}
                className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
              >
                <Zap className="h-3.5 w-3.5 text-indigo-600" /> Testar Novamente
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition w-full sm:w-auto"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}


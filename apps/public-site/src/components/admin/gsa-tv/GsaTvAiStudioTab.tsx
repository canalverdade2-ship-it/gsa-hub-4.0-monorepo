import React, { useState } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  Film,
  Globe,
  Layers,
  Loader2,
  Mic2,
  Newspaper,
  Play,
  Radio,
  RefreshCw,
  Send,
  Server,
  Sparkles,
  TrendingUp,
  Tv,
  UserCheck,
  Video,
  Wrench,
  Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../../lib/adminRpc';
import { supabase } from '../../../lib/supabase';
import { GsaTvAiLab } from './GsaTvAiLab';

type Props = {
  channelId: string;
  onMutate: (action: string, payload: Record<string, unknown>, successMsg: string) => Promise<any>;
  onRefresh: () => Promise<void> | void;
  onOpenTab?: (tab: string) => void;
};

// Presets de produção profissional conectados ao Google Flow & Google Vids
const AI_PRODUCTION_PRESETS = [
  {
    id: 'gsa_news_main',
    title: 'GSA News — Edição Principal',
    badge: 'Telejornal 20 min',
    icon: Newspaper,
    gradient: 'from-blue-600 via-indigo-700 to-slate-900',
    description: 'Apresentação em dupla obrigatória (Holt e Nyla), pautas do dia, vídeos de apoio gerados no Google Vids, lower thirds dourados e ticker de rodapé.',
    targetSlot: '19:00',
    pipeline: 'Google Flow + Google Vids + Neural TTS',
  },
  {
    id: 'gsa_meio_dia',
    title: 'GSA Meio Dia News',
    badge: 'Edição Almoço 15 min',
    icon: Radio,
    gradient: 'from-amber-500 via-orange-600 to-slate-900',
    description: 'Resumo ágil das notícias da manhã, prestação de serviços para empresas e MEIs, cortes dinâmicos de 6s.',
    targetSlot: '12:00',
    pipeline: 'Google Flow + Google Vids + Neural TTS',
  },
  {
    id: 'gsa_manha',
    title: 'GSA Manhã News',
    badge: 'Abertura do Dia 15 min',
    icon: Clock,
    gradient: 'from-emerald-500 via-teal-700 to-slate-900',
    description: 'Primeira edição com manchetes do agronegócio, previsão do tempo e destaques para o trabalhador.',
    targetSlot: '07:30',
    pipeline: 'Google Flow + Google Vids + Neural TTS',
  },
  {
    id: 'gsa_financeiro',
    title: 'GSA Mercado',
    badge: 'Economia & Negócios 10 min',
    icon: TrendingUp,
    gradient: 'from-green-600 via-emerald-800 to-slate-900',
    description: 'Mercado de capitais, cotação do dólar, inflação, commodities e dicas práticas financeiras.',
    targetSlot: '12:30',
    pipeline: 'Google Flow + Gráficos Financeiros + TTS',
  },
  {
    id: 'gsa_ta_na_rede',
    title: 'GSA Tá na Rede',
    badge: 'Viral & Web 10 min',
    icon: Globe,
    gradient: 'from-purple-600 via-pink-600 to-slate-900',
    description: 'O que viralizou nas redes sociais, inovações em inteligência artificial e os assuntos mais comentados da internet.',
    targetSlot: '17:00',
    pipeline: 'Google Flow + Web Scraping + Vids',
  },
  {
    id: 'gsa_interprogramas',
    title: 'Chamadas "A Seguir" & Minuto GSA',
    badge: 'Interprogramas 15-60s',
    icon: Sparkles,
    gradient: 'from-slate-800 via-slate-900 to-black',
    description: 'A cola da TV: vinhetas de "A Seguir" (15-20s) e pílulas rápidas de 60s para manter o público colado na tela durante os intervalos.',
    targetSlot: 'Intervalos e Transições',
    pipeline: 'Google Flow + Renderizador Automático',
  },
];

export interface ActiveProduction {
  jobId: string;
  presetId: string;
  title: string;
  progress: number;
  stage: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: number;
  errorMessage?: string;
}

export function GsaTvAiStudioTab({ channelId, onMutate, onRefresh, onOpenTab }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'production' | 'pipeline_status' | 'anchors' | 'api'>('production');
  const [generatingId, setGeneratingId] = useState('');
  const [activeProductions, setActiveProductions] = useState<Record<string, ActiveProduction>>({});

  // Restaura o progresso e status dos trabalhos do banco de dados na inicialização
  React.useEffect(() => {
    let mounted = true;
    async function loadRecentJobs() {
      try {
        const { data, error } = await supabase.rpc('gsa_tv_get_recent_ai_jobs');
        if (error) {
          console.error('Erro ao buscar jobs recentes de IA via RPC:', error);
          return;
        }

        if (!mounted || !Array.isArray(data) || data.length === 0) return;

        // Pega o job mais recente por preset_id
        const map: Record<string, ActiveProduction> = {};
        data.forEach((j: any) => {
          const presetId = j.preset_id;
          if (!presetId || map[presetId]) return;
          map[presetId] = {
            jobId: j.id,
            presetId,
            title: j.title || 'Edição GSA TV',
            progress: Math.min(100, Math.max(0, Number(j.progress) || 0)),
            stage: j.current_stage || (j.status === 'completed' ? 'Produção concluída! O vídeo está pronto na Biblioteca de Mídia.' : ''),
            status: j.status === 'completed' ? 'completed' : j.status === 'failed' ? 'failed' : 'running',
            startedAt: new Date(j.created_at).getTime(),
            errorMessage: j.error_message || undefined,
          };
        });

        setActiveProductions((prev) => ({ ...map, ...prev }));
      } catch (err) {
        console.error('Exceção em loadRecentJobs:', err);
      }
    }
    loadRecentJobs();
    return () => {
      mounted = false;
    };
  }, []);

  const handleTriggerProduction = async (preset: typeof AI_PRODUCTION_PRESETS[0]) => {
    if (
      !window.confirm(
        `Disparar a produção autônoma de "${preset.title}" via pipeline Google Flow & Google Vids na VPS? O material será composto com as vozes oficiais e salvo na Biblioteca de Mídia.`,
      )
    )
      return;

    setGeneratingId(preset.id);
    try {
      const res = await onMutate(
        'enqueue_job',
        {
          channel_id: channelId,
          job_type: 'ai_flow_vids_generate',
          payload: {
            preset_id: preset.id,
            title: preset.title,
            pipeline: preset.pipeline,
            engine: 'google_flow_vids_vps',
            anchors: ['Holt', 'Nyla'],
            resolution: '1080p30',
          },
        },
        `Ordem de produção iniciada! O motor autônomo está trabalhando na VPS.`,
      );

      const jobId = res?.id || res?.data?.id;
      if (jobId) {
        // Inicializa o tracker do card com 5%
        setActiveProductions((prev) => ({
          ...prev,
          [preset.id]: {
            jobId,
            presetId: preset.id,
            title: preset.title,
            progress: 5,
            stage: 'Fila do motor de IA na VPS...',
            status: 'queued',
            startedAt: Date.now(),
          },
        }));

        // Inicia polling a cada 1.5s para atualizar barra de progresso
        const pollInterval = window.setInterval(async () => {
          try {
            const data = await callAdminRpc<any>('gsa_tv_get_job_progress', { p_job_id: jobId });
            if (data) {
              const progressNum = Math.min(100, Math.max(0, Number(data.progress) || 0));
              const currentStage = data.current_stage || 'Processando na VPS...';
              const status = data.status;

              setActiveProductions((prev) => ({
                ...prev,
                [preset.id]: {
                  jobId,
                  presetId: preset.id,
                  title: preset.title,
                  progress: progressNum,
                  stage: currentStage,
                  status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'running',
                  startedAt: prev[preset.id]?.startedAt || Date.now(),
                  errorMessage: data.error_message || undefined,
                },
              }));

              if (status === 'completed') {
                window.clearInterval(pollInterval);
                toast.success(`🎉 ${preset.title} produzida com sucesso!`);
                await onRefresh();
              } else if (status === 'failed') {
                window.clearInterval(pollInterval);
                toast.error(`Falha na produção: ${data.error_message || 'Erro no renderizador'}`);
              }
            }
          } catch {
            // Ignora oscilação momentânea durante polling
          }
        }, 1500);
      }
    } finally {
      setGeneratingId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO DO ESTÚDIO IA ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-500/20 p-3 text-purple-300">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white">
                ESTÚDIO IA • GOOGLE FLOW &amp; GOOGLE VIDS
              </h2>
              <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-black text-purple-300 border border-purple-500/30">
                MOTOR ATIVO NA VPS
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Pipeline Integrado: Roteiro, Gravação de Âncoras Virtuais, Cenas de Apoio e Render Broadcast 1080p
            </p>
          </div>
        </div>

        {/* Status Rápido do Pipeline */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-300">Google Flow: Conectado</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-300">Google Vids: Ativo</span>
          </div>
        </div>
      </div>

      {/* ── SUB-NAVEGAÇÃO PRÁTICA ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-xs font-black uppercase tracking-wider">
        <button
          onClick={() => setActiveSubTab('production')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
            activeSubTab === 'production'
              ? 'bg-purple-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Produção em 1 Clique
        </button>
        <button
          onClick={() => setActiveSubTab('anchors')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
            activeSubTab === 'anchors'
              ? 'bg-purple-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Mic2 className="h-3.5 w-3.5" /> Casting de Vozes (TV &amp; Chamadas)
        </button>
        <button
          onClick={() => setActiveSubTab('pipeline_status')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
            activeSubTab === 'pipeline_status'
              ? 'bg-purple-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Cpu className="h-3.5 w-3.5" /> Arquitetura Técnica na VPS
        </button>
        <button
          onClick={() => setActiveSubTab('api')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition ${
            activeSubTab === 'api'
              ? 'bg-purple-700 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bot className="h-3.5 w-3.5" /> Configurar API de IA
        </button>
      </div>

      {activeSubTab === 'api' && <GsaTvAiLab channelId={channelId} />}

      {/* ── 1. PRODUÇÃO EM 1 CLIQUE (CARDS DAS ATRAÇÕES) ──────────────────── */}
      {activeSubTab === 'production' && (
        <div className="space-y-4">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {AI_PRODUCTION_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isBusy = generatingId === preset.id;
              const prod = activeProductions[preset.id];

              return (
                <div
                  key={preset.id}
                  className={`flex flex-col justify-between overflow-hidden rounded-2xl border transition shadow-sm ${
                    prod?.status === 'completed'
                      ? 'border-emerald-400 ring-2 ring-emerald-400/20'
                      : prod
                      ? 'border-indigo-400 ring-2 ring-indigo-400/20 shadow-md'
                      : 'border-slate-200 bg-white hover:border-purple-300 hover:shadow-md'
                  }`}
                >
                  {/* Banner Colorido */}
                  <div className={`bg-gradient-to-br ${preset.gradient} p-5 text-white`}>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">
                        {preset.badge}
                      </span>
                      <Icon className="h-6 w-6 text-white/90" />
                    </div>
                    <h3 className="mt-3 text-base font-black text-white">{preset.title}</h3>
                    <span className="mt-1 block text-[11px] font-semibold text-white/70">
                      Horário na Grade: {preset.targetSlot}
                    </span>
                  </div>

                  {/* Informações e Botão / Painel de Progresso */}
                  <div className="flex-1 flex flex-col justify-between p-5">
                    <div>
                      <p className="text-xs text-slate-600 leading-relaxed">{preset.description}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 rounded-lg px-2.5 py-1">
                        <Zap className="h-3 w-3" />
                        <span>Motor: {preset.pipeline}</span>
                      </div>
                    </div>

                    {/* Tag de Última Geração — destaque no meio do card */}
                    {prod && prod.startedAt ? (
                      <div className="mt-3.5 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold uppercase tracking-wider text-slate-500">
                            Última Geração
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                              prod.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : prod.status === 'failed'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-purple-100 text-purple-800 animate-pulse'
                            }`}
                          >
                            {prod.status === 'completed' ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                Concluído
                              </>
                            ) : prod.status === 'failed' ? (
                              <span>⚠ Falhou</span>
                            ) : (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                                Em Produção
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">
                            {new Date(prod.startedAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {prod.status === 'completed' && (
                            <span className="text-[10px] font-bold text-emerald-600">
                              ✓ Pronto na Biblioteca
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 border-t border-slate-100 pt-4">
                      {prod ? (
                        <div className="space-y-3 rounded-xl bg-slate-950 p-4 text-white shadow-inner border border-white/10">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                              {prod.status === 'completed' ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                  Concluído com Sucesso!
                                </>
                              ) : prod.status === 'failed' ? (
                                <span className="text-rose-400 font-bold">Falha na Produção</span>
                              ) : (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin text-purple-400 shrink-0" />
                                  Produzindo na VPS...
                                </>
                              )}
                            </span>
                            <span className="font-mono font-black text-white text-sm">{prod.progress}%</span>
                          </div>

                          {/* Barra de Progresso Animada */}
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                prod.status === 'completed'
                                  ? 'bg-emerald-400'
                                  : prod.status === 'failed'
                                  ? 'bg-rose-500'
                                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400'
                              }`}
                              style={{ width: `${prod.progress}%` }}
                            />
                          </div>

                          {/* Estágio Atual em Texto */}
                          <p className="text-[11px] text-slate-300 leading-tight">
                            {prod.stage || 'Iniciando pipeline...'}
                          </p>

                          {/* Ações após conclusão ou falha */}
                          {prod.status === 'completed' ? (
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => onOpenTab?.('library')}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 py-2.5 text-xs font-black text-slate-950 transition shadow"
                              >
                                <Play className="h-3.5 w-3.5 fill-current" /> Ver na Biblioteca
                              </button>
                              <button
                                onClick={() => {
                                  setActiveProductions((prev) => {
                                    const next = { ...prev };
                                    delete next[preset.id];
                                    return next;
                                  });
                                }}
                                className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-[11px] font-bold text-slate-300 transition"
                              >
                                Nova
                              </button>
                            </div>
                          ) : prod.status === 'failed' ? (
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => {
                                  setActiveProductions((prev) => {
                                    const next = { ...prev };
                                    delete next[preset.id];
                                    return next;
                                  });
                                  void handleTriggerProduction(preset);
                                }}
                                className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-700 py-2 text-xs font-bold text-white transition shadow"
                              >
                                🔄 Tentar Novamente
                              </button>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic">
                              Acompanhando progresso em tempo real...
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => void handleTriggerProduction(preset)}
                          disabled={Boolean(generatingId)}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-black uppercase tracking-wider text-white shadow transition hover:bg-purple-700 hover:shadow-lg disabled:opacity-50"
                        >
                          {isBusy ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-purple-300" />
                              Conectando à VPS...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 text-purple-300" />
                              Gerar Edição com Google Flow &amp; Vids
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-900">
            <strong>Como a transmissão recebe o conteúdo:</strong> Quando a produção termina, o arquivo final é gravado automaticamente em <code>/media/1/news/...</code> na VPS com áudio 48kHz estéreo, e fica imediatamente disponível na aba <strong>Biblioteca de Mídia</strong> e na <strong>Central Master</strong> para ir ao ar sem intervenção manual.
          </div>
        </div>
      )}

      {/* ── 2. CASTING OFICIAL DE VOZES (4 PAPÉIS DA TV) ────────────────── */}
      {activeSubTab === 'anchors' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-950 flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm text-indigo-900 mb-1">
                🎙️ Elenco Oficial de Vozes da GSA TV (Fish Audio S2.1 Pro Free)
              </h4>
              <p className="text-xs text-indigo-700">
                Todas as 4 vozes abaixo já estão pré-definidas no sistema. Quando uma atração ou chamada é gerada na VPS, o pipeline utiliza automaticamente a voz correspondente sem necessidade de configuração manual.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 text-emerald-800 font-black px-3 py-1 text-[11px] border border-emerald-300">
              4 VOZES ATIVAS
            </span>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {/* 1. CHAMADAS & INSTITUCIONAL */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-400">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-700">
                    Chamadas &amp; Institucional
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Escolhida por Você
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 font-black text-xl">
                    📢
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Chamada Tv</h3>
                    <p className="text-xs text-slate-500">Locutor Oficial de Chamadas • TV Aberta</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                  Voz oficial de chamadas de televisão, ideal para as chamadas da grade, anúncios comerciais e identidade institucional da emissora.
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Demonstração ao Vivo:</span>
                  <audio controls src="/cast/demo_chamadas.mp3" className="w-full h-8" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>ID no Fish Audio:</span>
                  <span className="font-mono font-bold text-slate-700">fe4308a28863...</span>
                </div>
              </div>
            </div>

            {/* 2. VINHETAS & "A SEGUIR" */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-400">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                    Vinhetas &amp; Interprogramas
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Escolhida por Você
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 font-black text-xl">
                    ✨
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Globo TV</h3>
                    <p className="text-xs text-slate-500">Voz Marcante de Rede Aberta</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                  Voz ágil e clássica de televisão. Utilizada nas passagens rápidas de intervalo, chamadas de 15 segundos "A Seguir na GSA TV" e vinhetas dinâmicas.
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Demonstração ao Vivo:</span>
                  <audio controls src="/cast/demo_vinhetas.mp3" className="w-full h-8" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>ID no Fish Audio:</span>
                  <span className="font-mono font-bold text-slate-700">bbfda3cfd1fb...</span>
                </div>
              </div>
            </div>

            {/* 3. TELEJORNAL - ÂNCORA MASCULINO */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-400">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">
                    Telejornal • Âncora Titular Masculino
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Escolhida por Você
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 font-black text-xl">
                    👨‍💼
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Jornalista Titular (Bancada)</h3>
                    <p className="text-xs text-slate-500">Narração Séria, Firme e Noticiosa</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                  Dicção jornalística masculina com presença forte. Conduz a abertura do telejornal, manchetes urgentes, política nacional e o bloco de economia.
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Demonstração ao Vivo:</span>
                  <audio controls src="/cast/demo_ancora_masc.mp3" className="w-full h-8" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>ID no Fish Audio:</span>
                  <span className="font-mono font-bold text-slate-700">fafc0100f947...</span>
                </div>
              </div>
            </div>

            {/* 4. TELEJORNAL - ÂNCORA FEMININA */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm transition hover:border-purple-400">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-black uppercase text-purple-700">
                    Telejornal • Âncora Titular Feminina
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Escolhida por Você
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 font-black text-xl">
                    👩‍💼
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Jornalista Titular (Escalada)</h3>
                    <p className="text-xs text-slate-500">Dicção Clara, Natural e Jornalística</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                  Voz jornalística feminina com sotaque neutro e clareza de estúdio. Conduz a escalada, matérias especiais, previsão do tempo e cidades.
                </p>
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Demonstração ao Vivo:</span>
                  <audio controls src="/cast/demo_ancora_fem.mp3" className="w-full h-8" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>ID no Fish Audio:</span>
                  <span className="font-mono font-bold text-slate-700">74b5a4384563...</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="font-black text-sm text-slate-900 mb-2">Regra Editorial de Bancada em Dupla</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Conforme as diretrizes aprovadas para a <strong>GSA TV</strong>, todo telejornal de grande porte é conduzido obrigatoriamente pelos dois apresentadores titulares: o âncora masculino abre e lê as notícias principais, passando a palavra para a âncora feminina que conduz a escalada e os blocos temáticos, encerrando juntos no final com despedida sincronizada.
            </p>
          </div>
        </div>
      )}

      {/* ── 3. ARQUITETURA TÉCNICA NA VPS (GOOGLE FLOW & GOOGLE VIDS) ─────── */}
      {activeSubTab === 'pipeline_status' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black text-sm text-slate-900 mb-4 flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-600" /> Componentes do Pipeline na VPS Oracle
            </h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-[10px] font-bold uppercase text-slate-500">Workflow &amp; Orquestração</span>
                <p className="mt-1 font-black text-sm text-slate-900">Google Flow (n8n Engine)</p>
                <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Porta 5678 • Ativo
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-[10px] font-bold uppercase text-slate-500">Estúdio de Vídeo &amp; Cenas</span>
                <p className="mt-1 font-black text-sm text-slate-900">Google Vids / AI Browser</p>
                <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Porta 6088/9228 • Ativo
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-[10px] font-bold uppercase text-slate-500">Renderizador de Vídeo</span>
                <p className="mt-1 font-black text-sm text-slate-900">Docker ffplayout</p>
                <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  1080p30 H.264 • Healthy
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-[10px] font-bold uppercase text-slate-500">Banco de Dados &amp; Fila</span>
                <p className="mt-1 font-black text-sm text-slate-900">Control-Plane Postgres</p>
                <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Porta 5432 • Conectado
                </span>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="font-bold text-xs text-slate-800 mb-1">Por que usamos este pipeline em vez da API pura do Gemini?</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                As chamadas diretas de API para modelos de vídeo frequentemente enfrentam limitações de quota, não suportam renderização de cortes rápidos sincronizados a cada 6 segundos e não aplicam os lower thirds nem os relógios gráficos da emissora. Com o <strong>Google Flow + Google Vids</strong> rodando na VPS, o telejornal é montado com B-rolls em alta resolução, narração neural estéreo em 48kHz e pós-produção broadcast profissional sem depender de APIs instáveis de vídeo.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GsaTvAiStudioTab;

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, CheckCircle2, Clock, Copy, Check,
  ExternalLink, ArrowLeft, Ticket, Phone, Mail,
  User, AlertCircle, Loader2, ShieldCheck, Calendar,
  MessageSquare, Sparkles, HelpCircle, X, ArrowRight,
  RefreshCw, Lock, FileText, Send, Paperclip, Upload
} from 'lucide-react';
import {
  consultarProtocolo,
  requestPartnerAppealVerification,
  submitPartnerAppeal,
  uploadAppealEvidenceFile,
} from '../../features/partners/service';
import type { ProtocolConsultResult } from '../../features/partners/types';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

const GSA_SUPPORT_WHATSAPP = '5511920857756';

// Helpers
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function calculateDeadline(iso: string | null | undefined): string {
  if (!iso) return 'Em até 24 horas';
  const created = new Date(iso);
  const deadline = new Date(created.getTime() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(deadline);
}

function getQueryParam(key: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(key) || '';
}

// ── Componente do Cachorrinho Animado ─────────────────────────────────────────
function AnimatedPuppyRunner() {
  return (
    <div className="relative w-full h-11 sm:h-12 overflow-hidden flex items-center select-none pointer-events-none">
      {/* Linha da Pista */}
      <div className="absolute inset-x-2 bottom-1.5 h-0.5 border-b border-dashed border-amber-300/70" />
      
      {/* Cachorrinho que corre para a direita e esquerda */}
      <div
        className="absolute bottom-1 flex items-center"
        style={{
          animation: 'dogPatrolLoop 8s ease-in-out infinite',
        }}
      >
        <svg
          viewBox="0 0 52 38"
          className="w-10 h-8 sm:w-11 sm:h-9 drop-shadow-xs"
          style={{
            animation: 'dogBodyBob 0.3s ease-in-out infinite alternate',
          }}
        >
          {/* Rabinho abanando */}
          <path
            d="M10 20 Q4 13 8 7 Q11 5 13 11 Z"
            fill="#D97706"
            style={{
              transformOrigin: '11px 20px',
              animation: 'dogTailWag 0.18s ease-in-out infinite alternate',
            }}
          />

          {/* Pata Traseira Esquerda */}
          <ellipse
            cx="14"
            cy="31"
            rx="2.5"
            ry="5.5"
            fill="#B45309"
            style={{
              transformOrigin: '14px 26px',
              animation: 'dogLegBack 0.3s ease-in-out infinite alternate',
            }}
          />

          {/* Pata Dianteira Esquerda */}
          <ellipse
            cx="32"
            cy="31"
            rx="2.5"
            ry="5.5"
            fill="#B45309"
            style={{
              transformOrigin: '32px 26px',
              animation: 'dogLegFront 0.3s ease-in-out infinite alternate',
            }}
          />

          {/* Corpo do Cachorrinho */}
          <ellipse cx="23" cy="22" rx="14" ry="9.5" fill="#F59E0B" />
          <ellipse cx="27" cy="22" rx="7" ry="6" fill="#FDE68A" />

          {/* Pata Traseira Direita */}
          <ellipse
            cx="17"
            cy="32"
            rx="2.5"
            ry="5.5"
            fill="#D97706"
            style={{
              transformOrigin: '17px 27px',
              animation: 'dogLegFront 0.3s ease-in-out infinite alternate',
            }}
          />

          {/* Pata Dianteira Direita */}
          <ellipse
            cx="35"
            cy="32"
            rx="2.5"
            ry="5.5"
            fill="#D97706"
            style={{
              transformOrigin: '35px 27px',
              animation: 'dogLegBack 0.3s ease-in-out infinite alternate',
            }}
          />

          {/* Cabeça do Cachorrinho */}
          <circle cx="37" cy="14" r="9" fill="#F59E0B" />

          {/* Orelha fofa balançando */}
          <path
            d="M34 8 Q29 11 31 19 Q35 22 37 14 Z"
            fill="#B45309"
            style={{
              transformOrigin: '34px 9px',
              animation: 'dogEarBounce 0.3s ease-in-out infinite alternate',
            }}
          />

          {/* Olho brilhante */}
          <circle cx="39" cy="12.5" r="1.8" fill="#1E293B" />
          <circle cx="39.6" cy="11.8" r="0.6" fill="#FFFFFF" />

          {/* Focinho */}
          <ellipse cx="43.5" cy="15.5" rx="3.5" ry="2.5" fill="#FEF3C7" />
          <polygon points="44,14 46.5,14 45.25,16" fill="#1E293B" />

          {/* Sorriso e linguinha rosa */}
          <path d="M43 16 Q44.5 17.5 45.5 16" fill="none" stroke="#1E293B" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M43.8 17 Q44.5 19 45.2 17 Z" fill="#F43F5E" />
        </svg>
      </div>

      <style>{`
        @keyframes dogPatrolLoop {
          0% {
            left: 2%;
            transform: scaleX(1);
          }
          38% {
            left: calc(100% - 50px);
            transform: scaleX(1);
          }
          45% {
            left: calc(100% - 50px);
            transform: scaleX(1);
          }
          50% {
            left: calc(100% - 50px);
            transform: scaleX(-1);
          }
          88% {
            left: 2%;
            transform: scaleX(-1);
          }
          95% {
            left: 2%;
            transform: scaleX(-1);
          }
          100% {
            left: 2%;
            transform: scaleX(1);
          }
        }
        @keyframes dogTailWag {
          0% { transform: rotate(-28deg); }
          100% { transform: rotate(32deg); }
        }
        @keyframes dogEarBounce {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-18deg); }
        }
        @keyframes dogLegFront {
          0% { transform: rotate(-30deg); }
          100% { transform: rotate(30deg); }
        }
        @keyframes dogLegBack {
          0% { transform: rotate(30deg); }
          100% { transform: rotate(-30deg); }
        }
        @keyframes dogBodyBob {
          0% { transform: translateY(0); }
          100% { transform: translateY(-3.5px); }
        }
      `}</style>
    </div>
  );
}

export default function ProtocolConsultPage() {
  const [inputCodigo, setInputCodigo] = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<ProtocolConsultResult | null>(null);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [appealCode, setAppealCode] = useState('');
  const [appealChallenge, setAppealChallenge] = useState<string | null>(null);
  const [appealDestination, setAppealDestination] = useState('');
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealFiles, setAppealFiles] = useState<File[]>([]);
  const [appealRequestId, setAppealRequestId] = useState(() => crypto.randomUUID());

  const buscar = useCallback(async (codigo: string, isSilent = false) => {
    const clean = codigo.trim().toUpperCase();
    if (!clean) return;

    if (!isSilent) {
      setLoading(true);
      setErrorMsg(null);
    }

    const res = await consultarProtocolo(clean);

    if (res.success && res.data) {
      setResult(res.data);
      setErrorMsg(null);
    } else {
      if (!isSilent) {
        setResult(null);
        setErrorMsg(res.message || 'Protocolo não encontrado. Verifique o código e tente novamente.');
      }
    }
    setLoading(false);
  }, []);

  const activeProtocolCode = (result?.codigo || (result as any)?.protocolo || inputCodigo || getQueryParam('codigo')).trim().toUpperCase();

  const handleRealtimeChange = useCallback(() => {
    if (activeProtocolCode) {
      void buscar(activeProtocolCode, true);
    }
  }, [activeProtocolCode, buscar]);

  const { status: realtimeStatus } = useRealtimeSubscription({
    table: 'parceiros_resgates_public_status',
    event: 'UPDATE',
    filter: result?.tracking_key ? `tracking_key=eq.${result.tracking_key}` : undefined,
    enabled: Boolean(result?.tracking_key),
    onChange: handleRealtimeChange,
    debounceMs: 50,
  });

  const realtimeLabel = realtimeStatus === 'SUBSCRIBED'
    ? 'Tempo Real'
    : realtimeStatus === 'INITIALIZING'
      ? 'Conectando'
      : 'Reconectando';

  const realtimeDotClass = realtimeStatus === 'SUBSCRIBED'
    ? 'bg-emerald-500 animate-pulse'
    : realtimeStatus === 'INITIALIZING'
      ? 'bg-amber-500 animate-pulse'
      : 'bg-rose-500';

  useEffect(() => {
    const codigoParam = getQueryParam('codigo');
    if (codigoParam) {
      setInputCodigo(codigoParam);
      buscar(codigoParam);
    }
  }, [buscar]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    buscar(inputCodigo);
  };

  const handleCopyProtocol = (codigo: string) => {
    if (!codigo) return;
    navigator.clipboard?.writeText(codigo);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const closeAppeal = () => {
    if (appealBusy) return;
    setAppealOpen(false);
    setAppealError(null);
    setAppealCode('');
    setAppealChallenge(null);
    setAppealDestination('');
    setAppealFiles([]);
  };

  const handleRequestAppealCode = async () => {
    if (!result || appealText.trim().length < 20) {
      setAppealError('Explique a contestação com pelo menos 20 caracteres.');
      return;
    }
    setAppealBusy(true);
    setAppealError(null);
    try {
      const response = await requestPartnerAppealVerification(result.codigo);
      setAppealChallenge(response.challenge_id);
      setAppealDestination(response.destination);
    } catch (error: any) {
      setAppealError(error?.message || 'Não foi possível enviar o código de confirmação.');
    } finally {
      setAppealBusy(false);
    }
  };

  const handleSubmitAppeal = async () => {
    if (!result || !appealChallenge || appealCode.replace(/\D/g, '').length !== 6) {
      setAppealError('Informe o código de seis dígitos enviado ao WhatsApp.');
      return;
    }
    setAppealBusy(true);
    setAppealError(null);
    try {
      const anexos = await Promise.all(
        appealFiles.map((file) => uploadAppealEvidenceFile(file, result.codigo)),
      );
      await submitPartnerAppeal({
        challengeId: appealChallenge,
        code: appealCode,
        contestacao: appealText,
        idempotencyKey: appealRequestId,
        anexos,
      });
      await buscar(result.codigo, true);
      setAppealOpen(false);
      setAppealText('');
      setAppealCode('');
      setAppealChallenge(null);
      setAppealDestination('');
      setAppealFiles([]);
      setAppealRequestId(crypto.randomUUID());
    } catch (error: any) {
      setAppealError(error?.message || 'Não foi possível registrar o recurso.');
    } finally {
      setAppealBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-900">
      
      {/* Background Decorator Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-amber-200/40 via-amber-100/20 to-transparent blur-3xl opacity-70 rounded-full" />
      </div>

      {/* Modern Glass Topbar */}
      <header className="relative z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur-md sticky top-0">
        <div className="mx-auto max-w-2xl px-4 py-3.5 flex items-center justify-between gap-3">
          <a href="/nossos-parceiros" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-amber-400 text-white shadow-sm shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Ticket className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">GSA HUB</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[10px] font-bold text-slate-400">Validação Oficial</span>
              </div>
              <h1 className="text-sm sm:text-base font-black text-slate-900 leading-tight">Consulta de Protocolo</h1>
            </div>
          </a>

          <a
            href="/nossos-parceiros"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-amber-600 bg-slate-100/80 hover:bg-amber-50 border border-slate-200/60 px-3.5 py-1.5 rounded-full transition-all active:scale-95 shadow-2xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Parceiros</span>
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 mx-auto w-full max-w-2xl px-4 py-5 sm:py-6 space-y-3.5">

        {/* 1. Card de Busca / Header do Protocolo */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-xs sm:text-sm font-bold text-slate-700">
                {result ? 'Protocolo em Consulta' : 'Buscar Protocolo de Resgate'}
              </p>
                </div>

                {result.recurso ? (
                  <div className={`rounded-2xl border p-4 ${
                    result.recurso.status === 'em_analise'
                      ? 'border-sky-200 bg-sky-50'
                      : result.recurso.status === 'deferido'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-rose-200 bg-rose-50'
                  }`}>
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 shrink-0 mt-0.5 text-sky-700" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                          {result.recurso.status === 'em_analise'
                            ? 'Recurso em análise'
                            : result.recurso.status === 'deferido'
                              ? 'Recurso aprovado'
                              : 'Recurso recusado — decisão final'}
                        </p>
                        <p className="text-xs text-slate-600">
                          Protocolo: <strong className="font-mono">{result.recurso.protocolo_recurso}</strong>
                        </p>
                        {result.recurso.status === 'em_analise' && (
                          <p className="text-xs text-sky-800">
                            Prazo de análise: <strong>{formatDate(result.recurso.prazo_analise_em)}</strong>
                          </p>
                        )}
                        {result.recurso.status === 'indeferido' && result.recurso.motivo_decisao && (
                          <p className="text-xs text-rose-900 pt-1">
                            <strong>Motivo da decisão:</strong> {result.recurso.motivo_decisao}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAppealOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 px-5 py-3 text-sm font-black text-white shadow-sm transition-all active:scale-[0.99]"
                  >
                    <FileText className="h-4 w-4" />
                    Entrar com recurso
                  </button>
                )}

                {result.eventos?.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                      Histórico do protocolo
                    </p>
                    {result.eventos.map((evento, index) => (
                      <div key={evento.id} className="relative flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="flex flex-col items-center">
                          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${index === result.eventos.length - 1 ? 'bg-amber-500 ring-4 ring-amber-100' : 'bg-slate-300'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
                            <strong className="text-xs text-slate-800">{evento.titulo}</strong>
                            <span className="text-[10px] font-medium text-slate-400">{formatDate(evento.ocorrido_em)}</span>
                          </div>
                          {evento.descricao && <p className="mt-1 text-xs leading-relaxed text-slate-600">{evento.descricao}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputCodigo}
                onChange={e => setInputCodigo(e.target.value.toUpperCase())}
                placeholder="Ex: PROT-RES-2026-XXXXXX"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 pl-4 pr-10 py-2.5 sm:py-3 text-xs sm:text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-2xs"
                autoComplete="off"
                spellCheck={false}
              />
              {inputCodigo && (
                <button
                  type="button"
                  onClick={() => setInputCodigo('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !inputCodigo.trim()}
              className="shrink-0 flex items-center justify-center gap-1.5 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-black text-white shadow-sm shadow-amber-500/20 transition-all active:scale-98 cursor-pointer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>{loading ? 'Buscando…' : 'Consultar'}</span>
            </button>
          </form>
        </div>

        {/* 2. Estado de Erro */}
        {errorMsg && !loading && (
          <div className="rounded-3xl border border-rose-200/90 bg-rose-50/90 p-4 sm:p-5 flex items-start gap-3 shadow-2xs animate-in fade-in duration-200">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-black text-rose-950">Protocolo não encontrado</h3>
              <p className="text-xs text-rose-800 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* 3. Skeleton de Carregamento */}
        {loading && (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 space-y-3 animate-pulse">
            <div className="h-6 w-1/3 rounded-xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-20 rounded-2xl bg-slate-100" />
          </div>
        )}

        {/* 4. RESULTADOS */}
        {result && !loading && (
          <div className="space-y-3.5 animate-in fade-in duration-300">

            {/* ── CARD A: Card do Parceiro com Cachorrinho Animado ── */}
            <div className="rounded-2xl sm:rounded-3xl border border-slate-200/80 bg-white px-4 py-2 sm:py-2.5 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.03)] flex items-center gap-3">
              {result.parceiro_logo ? (
                <img
                  src={result.parceiro_logo}
                  alt={result.parceiro_nome}
                  className="h-8 sm:h-9 w-auto max-w-[110px] object-contain shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-600 shadow-2xs">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              )}

              {/* Animação do Cachorrinho Correndo na Pista */}
              <div className="min-w-0 flex-1">
                <AnimatedPuppyRunner />
              </div>
            </div>

            {/* ── CARD B: Status do Processamento / Liberação ── */}
            {result.status === 'recusado' ? (
              <div className="rounded-3xl border border-rose-200/90 bg-gradient-to-br from-rose-500/10 via-white to-rose-50/50 p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-rose-100/90 border border-rose-200 px-3.5 py-1.5 text-xs font-black text-rose-800 shadow-2xs">
                    <X className="h-4 w-4" />
                    Solicitação Recusada
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-rose-100 p-4">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-rose-500 mb-2">Motivo da Recusa:</h4>
                  <p className="text-sm font-medium text-rose-950 leading-relaxed italic border-l-2 border-rose-400 pl-3">
                    "{result.motivo_recusa || 'Não foi possível aprovar este resgate no momento.'}"
                  </p>
                </div>
              </div>
            ) : result.status === 'concluido' && result.link_ativacao ? (
              <div className="rounded-3xl border border-emerald-200/90 bg-gradient-to-br from-emerald-500/10 via-white to-emerald-50/50 p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100/90 border border-emerald-200 px-3.5 py-1.5 text-xs font-black text-emerald-800 shadow-2xs">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Benefício Liberado com Sucesso</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-slate-400">
                    Ativado em {formatDate(result.data_ativacao)}
                  </span>
                </div>

                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Seu acesso exclusivo está pronto para uso!
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                    Clique no botão abaixo para abrir a página de ativação do parceiro e usufruir de todas as condições especiais.
                  </p>
                </div>

                <a
                  href={result.link_ativacao}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 px-6 py-4 text-sm sm:text-base font-black text-white shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.99] group"
                >
                  <Sparkles className="h-5 w-5 text-amber-300 animate-bounce" />
                  <span>Acessar Benefício do Parceiro</span>
                  <ArrowRight className="h-4 w-4 opacity-80 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            ) : (
              /* Card Modo 24h — Em Processamento com 3 Etapas Animadas */
              <div className="rounded-3xl border border-amber-200/90 bg-gradient-to-br from-amber-500/10 via-white to-amber-50/50 p-4 sm:p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs shrink-0">
                    <Clock className="h-5 w-5 animate-[spin_6s_linear_infinite]" />
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-600"></span>
                    </span>
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-amber-950 leading-tight">
                      Em processamento
                    </h2>
                    <p className="text-xs text-amber-900/80 font-medium mt-0.5">
                      Você receberá o link de ativação via WhatsApp em até <strong>24 horas</strong>.
                    </p>
                  </div>
                </div>

                {/* 3 Etapas com Indicador de Conclusão / Em Andamento / Pendente */}
                <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
                  
                  {/* ETAPA 1: REGISTRADO (100% CONCLUÍDO) */}
                  <div className="relative rounded-2xl border-2 border-emerald-400/90 bg-emerald-50/95 p-2.5 sm:p-3 flex flex-col items-center justify-center shadow-xs transition-all hover:scale-[1.02]">
                    <div className="absolute -top-2 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs border-2 border-white">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <span className="text-[10.5px] sm:text-xs font-black text-emerald-950 leading-tight">
                      1. Registrado
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-700 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Confirmado
                    </span>
                  </div>

                  {/* ETAPA 2: EMISSÃO (EM ANDAMENTO - ANIMADO) */}
                  <div className="relative rounded-2xl border-2 border-amber-400 bg-amber-50/95 p-2.5 sm:p-3 flex flex-col items-center justify-center shadow-md shadow-amber-500/10 ring-2 ring-amber-400/30 transition-all hover:scale-[1.02]">
                    {/* Ping pulsante no topo */}
                    <div className="absolute -top-2 -right-1.5 flex h-5 w-5 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs border-2 border-white">
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </span>
                    </div>
                    
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-1 animate-pulse">
                      <Clock className="h-4 w-4" />
                    </div>
                    <span className="text-[10.5px] sm:text-xs font-black text-amber-950 leading-tight">
                      2. Emissão
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-black text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded-md mt-0.5 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping"></span>
                      Até 24h
                    </span>
                  </div>

                  {/* ETAPA 3: WHATSAPP (PENDENTE / PRÓXIMA) */}
                  <div className="relative rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col items-center justify-center opacity-75 transition-all">
                    <div className="absolute -top-2 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500 shadow-2xs border-2 border-white">
                      <Lock className="h-2.5 w-2.5" />
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-1">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <span className="text-[10.5px] sm:text-xs font-bold text-slate-600 leading-tight">
                      3. WhatsApp
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 mt-0.5">
                      Envio Final
                    </span>
                  </div>

                </div>
              </div>
            )}

            {/* ── CARD C: Dados do Solicitante ── */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">
                  Dados do Solicitante
                </p>
                <span className="text-[10.5px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                  Autenticado
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200/60 shadow-2xs">
                    <User className="h-4 w-4 text-slate-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Titular da Solicitação</p>
                    <p className="text-xs sm:text-sm text-slate-900 font-bold truncate">
                      {result.nome_completo}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200/60 shadow-2xs">
                    <Phone className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">WhatsApp de Contato</p>
                    <p className="text-xs sm:text-sm text-slate-900 font-bold truncate">
                      {result.telefone}
                    </p>
                  </div>
                </div>

                {result.email && (
                  <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50/70 border border-slate-100">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-200/60 shadow-2xs">
                      <Mail className="h-4 w-4 text-amber-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">E-mail Cadastrado</p>
                      <p className="text-xs sm:text-sm text-slate-900 font-bold truncate">
                        {result.email}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── CARD D: Acompanhamento em Tempo Real ── */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">
                  Acompanhamento
                </p>
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-600">
                  <span className={`h-2 w-2 rounded-full ${realtimeDotClass}`} />
                  {realtimeLabel}
                </span>
              </div>

              <div className="space-y-2" aria-live="polite">
                <div className="flex items-center justify-between text-xs sm:text-sm p-3 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-500 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-indigo-500" />
                    Data e Hora da Solicitação:
                  </span>
                  <strong className="text-slate-900 font-bold">{formatDate(result.created_at)}</strong>
                </div>

                <div className={`flex items-center justify-between text-xs sm:text-sm p-3 rounded-2xl border ${
                  result.status === 'concluido'
                    ? 'bg-emerald-50/80 border-emerald-200/60'
                    : result.status === 'recusado'
                      ? 'bg-rose-50/80 border-rose-200/60'
                      : result.status === 'analise'
                        ? 'bg-sky-50/80 border-sky-200/60'
                        : 'bg-amber-50/80 border-amber-200/60'
                }`}>
                  <span className={`flex items-center gap-2 ${
                    result.status === 'concluido'
                      ? 'text-emerald-800'
                      : result.status === 'recusado'
                        ? 'text-rose-800'
                        : result.status === 'analise'
                          ? 'text-sky-800'
                          : 'text-amber-800'
                  }`}>
                    {result.status === 'concluido' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : result.status === 'recusado' ? (
                      <X className="h-4 w-4 text-rose-600" />
                    ) : result.status === 'analise' ? (
                      <RefreshCw className="h-4 w-4 text-sky-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600" />
                    )}
                    Status atual:
                  </span>
                  <strong className={`font-bold ${
                    result.status === 'concluido'
                      ? 'text-emerald-950'
                      : result.status === 'recusado'
                        ? 'text-rose-950'
                        : result.status === 'analise'
                          ? 'text-sky-950'
                          : 'text-amber-950'
                  }`}>
                    {result.status === 'concluido'
                      ? 'Benefício liberado'
                      : result.status === 'recusado'
                        ? 'Solicitação recusada'
                        : result.status === 'analise'
                          ? 'Em análise'
                          : 'Aguardando emissão'}
                  </strong>
                </div>

                {result.data_ativacao && (
                  <div className="flex items-center justify-between text-xs sm:text-sm p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/60">
                    <span className="text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Data de Conclusão:
                    </span>
                    <strong className="text-emerald-950 font-bold">{formatDate(result.data_ativacao)}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* ── CARD E: Suporte Oficial GSA ── */}
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-4 text-center space-y-2">
              <p className="text-xs text-slate-500 font-medium">
                Tem dúvidas sobre este resgate ou precisa de atendimento?
              </p>
              <a
                href={`https://wa.me/${GSA_SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Olá! Preciso de ajuda com meu protocolo de resgate ${result.codigo}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-black text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/70 px-4 py-2 rounded-full transition-all"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>Falar com Suporte GSA</span>
              </a>
            </div>

          </div>
        )}

        {/* 5. Estado Inicial Vazio (Sem busca) */}
        {!result && !loading && !errorMsg && !getQueryParam('codigo') && (
          <div className="rounded-3xl border border-dashed border-slate-300/80 bg-white/80 p-8 text-center space-y-3 shadow-xs">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-3xl bg-amber-50 border border-amber-200 text-amber-600 shadow-2xs">
              <Ticket className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Consulte o Status do Resgate</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                Insira o código do protocolo recebido no momento do resgate para acompanhar a emissão e o envio do link no WhatsApp.
              </p>
            </div>
          </div>
        )}

      </main>

      {appealOpen && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="appeal-title">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">Recurso único</p>
                <h2 id="appeal-title" className="text-lg font-black text-slate-900">Contestar a recusa</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  O recurso será analisado em até cinco dias. Depois de enviado, não será possível apresentar outro recurso para esta solicitação.
                </p>
              </div>
              <button type="button" onClick={closeAppeal} disabled={appealBusy} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="appeal-text" className="text-xs font-bold text-slate-700">Explique por que a solicitação deve ser reavaliada</label>
                <textarea
                  id="appeal-text"
                  value={appealText}
                  onChange={(event) => setAppealText(event.target.value.slice(0, 4000))}
                  disabled={Boolean(appealChallenge) || appealBusy}
                  placeholder="Descreva sua contestação com informações objetivas..."
                  className="mt-1.5 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 disabled:opacity-70"
                />
                <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                  <span>Mínimo de 20 caracteres</span>
                  <span>{appealText.length}/4000</span>
                </div>
              </div>

              {!appealChallenge && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="appeal-files" className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      <Paperclip className="h-3.5 w-3.5" />
                      Documentos Comprobatórios <span className="font-semibold text-slate-400">(opcional)</span>
                    </label>
                    <span className="text-[10px] font-semibold text-slate-400">{appealFiles.length}/3 arquivos</span>
                  </div>
                  <label htmlFor="appeal-files" className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-amber-400 hover:bg-amber-50/40">
                    <Upload className="mb-2 h-5 w-5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-700">Clique para anexar comprovantes opcionais</span>
                    <span className="mt-1 text-[10px] text-slate-400">PNG, JPG ou PDF, até 5 MB por arquivo. Nenhum documento é obrigatório.</span>
                  </label>
                  <input
                    id="appeal-files"
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const selected = Array.from(event.target.files || []);
                      const invalid = selected.find((file) => file.size > 5 * 1024 * 1024);
                      if (invalid) {
                        setAppealError(`O arquivo ${invalid.name} ultrapassa o limite de 5 MB.`);
                        event.target.value = '';
                        return;
                      }
                      setAppealError(null);
                      setAppealFiles((current) => [...current, ...selected].slice(0, 3));
                      event.target.value = '';
                    }}
                  />
                  {appealFiles.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {appealFiles.map((file, index) => (
                        <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                          <span className="min-w-0 truncate text-slate-600">{file.name}</span>
                          <button type="button" onClick={() => setAppealFiles((files) => files.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 font-bold text-rose-600 hover:text-rose-700" aria-label={`Remover ${file.name}`}>Remover</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {appealChallenge && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <label htmlFor="appeal-code" className="text-xs font-bold text-emerald-950">Código enviado para {appealDestination}</label>
                  <input
                    id="appeal-code"
                    value={appealCode}
                    onChange={(event) => setAppealCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-center font-mono text-xl font-black tracking-[0.35em] text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <p className="mt-2 text-[10px] text-emerald-800">O código expira em dez minutos e possui limite de tentativas.</p>
                </div>
              )}

              {appealError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{appealError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={appealChallenge ? handleSubmitAppeal : handleRequestAppealCode}
                disabled={appealBusy || appealText.trim().length < 20 || (Boolean(appealChallenge) && appealCode.length !== 6)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3.5 text-sm font-black text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {appealBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : appealChallenge ? <Send className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                {appealBusy ? 'Processando...' : appealChallenge ? 'Confirmar e enviar recurso' : 'Continuar e receber código'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Minimalista */}
      <footer className="relative z-10 border-t border-slate-200/60 bg-white/50 backdrop-blur-xs py-4 text-center mt-auto">
        <a
          href="/nossos-parceiros"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 font-semibold transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Voltar para Nossos Parceiros</span>
        </a>
      </footer>

    </div>
  );
}

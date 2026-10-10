import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  PauseCircle, 
  Play, 
  Wifi, 
  WifiOff, 
  Clock, 
  Layers, 
  ShieldCheck, 
  MessageSquare,
  Server
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useWhatsAppHealth, type WhatsAppHealthStatus } from '../../hooks/useWhatsAppHealth';
import { StatusBadge } from './super-domains/shared/StatusBadge';

export interface WhatsAppHealthMonitorProps {
  /** Display variant mode */
  variant?: 'card' | 'compact' | 'header-popover';
  /** Additional CSS class names */
  className?: string;
  /** Optional callback after manual refresh */
  onRefresh?: () => void;
  /** Whether to show clear queue button */
  showClearQueue?: boolean;
}

export function WhatsAppHealthMonitor({
  variant = 'card',
  className = '',
  onRefresh,
  showClearQueue = false
}: WhatsAppHealthMonitorProps) {
  const {
    status,
    rawState,
    lastChecked,
    latencyMs,
    isPaused,
    queuedCount,
    checkNow,
    togglePause,
    setPaused,
    clearQueue
  } = useWhatsAppHealth();

  const [isChecking, setIsChecking] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close header popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, []);

  const handleManualCheck = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const state = await checkNow();
      if (state.status === 'connected') {
        toast.success('Status da Evolution API atualizado: Conectado!');
      } else if (state.status === 'connecting') {
        toast('Evolution API em processo de reconexão...', { icon: '🔄' });
      } else {
        toast.error(`Status da Evolution API: ${state.status.toUpperCase()}`);
      }
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao consultar status da Evolution API.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleTogglePause = () => {
    const nextPaused = togglePause();
    if (nextPaused) {
      toast('Disparos do WhatsApp pausados. Novas mensagens serão retidas na fila local.', {
        icon: '⏸️'
      });
    } else {
      toast.success('Disparos retomados! Mensagens na fila serão processadas.');
    }
  };

  const handleClearQueue = () => {
    if (queuedCount === 0) return;
    if (typeof window !== 'undefined' && window.confirm('Deseja realmente limpar todas as mensagens retidas na fila local?')) {
      clearQueue();
      toast.success('Fila local de WhatsApp limpa com sucesso.');
    }
  };

  // Helper status presentation
  const getStatusPresentation = (st: WhatsAppHealthStatus) => {
    switch (st) {
      case 'connected':
        return {
          label: 'Conectado (Open)',
          badgeStatus: 'ativo',
          badgeVariant: 'emerald' as const,
          dotColor: 'bg-emerald-500',
          glowShadow: 'shadow-[0_0_12px_rgba(16,185,129,0.8)]',
          textColor: 'text-emerald-700',
          bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: CheckCircle2,
          description: 'Sessão Baileys ativa e pronta para envios humanizados.'
        };
      case 'connecting':
        return {
          label: 'Conectando...',
          badgeStatus: 'em_andamento',
          badgeVariant: 'amber' as const,
          dotColor: 'bg-amber-500',
          glowShadow: 'shadow-[0_0_12px_rgba(245,158,11,0.8)]',
          textColor: 'text-amber-700',
          bgLight: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: RefreshCw,
          description: 'Restabelecendo sessão WebSocket ou pareando QR Code.'
        };
      case 'disconnected':
        return {
          label: 'Desconectado',
          badgeStatus: 'inativo',
          badgeVariant: 'rose' as const,
          dotColor: 'bg-rose-500',
          glowShadow: 'shadow-[0_0_12px_rgba(244,63,94,0.8)]',
          textColor: 'text-rose-700',
          bgLight: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: WifiOff,
          description: 'Instância Evolution offline ou desconectada pelo WhatsApp.'
        };
      case 'error':
      default:
        return {
          label: 'Erro de Conexão',
          badgeStatus: 'erro',
          badgeVariant: 'rose' as const,
          dotColor: 'bg-red-500',
          glowShadow: 'shadow-[0_0_12px_rgba(239,68,68,0.8)]',
          textColor: 'text-red-700',
          bgLight: 'bg-red-50 text-red-700 border-red-200',
          icon: XCircle,
          description: 'Servidor Evolution ou VPS inacessível após tentativas com backoff.'
        };
    }
  };

  const currentPresentation = getStatusPresentation(status);
  const StatusIcon = currentPresentation.icon;

  // --------------------------------------------------------------------------
  // VARIANT: COMPACT (Pill badge with status dot, latency, and pause badge)
  // --------------------------------------------------------------------------
  if (variant === 'compact') {
    return (
      <div 
        data-testid="whatsapp-health-compact"
        className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs text-xs select-none transition-colors',
          className
        )}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {(status === 'connecting' || status === 'connected') && (
            <span className={clsx(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
            )} />
          )}
          <span className={clsx('relative inline-flex rounded-full h-2.5 w-2.5', currentPresentation.dotColor)} />
        </span>
        <span className="font-bold text-slate-800">
          WhatsApp: <span className={clsx('font-black', currentPresentation.textColor)}>
            {status === 'connected' ? 'Online' : status === 'connecting' ? 'Conectando' : 'Offline'}
          </span>
        </span>
        {latencyMs > 0 && (
          <span className="text-[10px] font-mono font-semibold text-slate-400 border-l border-slate-200 pl-1.5">
            {`${latencyMs}ms`}
          </span>
        )}
        {isPaused && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <PauseCircle className="h-2.5 w-2.5" /> Pausado
          </span>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VARIANT: HEADER-POPOVER (Compact Topbar Button + Floating Popover Modal)
  // --------------------------------------------------------------------------
  if (variant === 'header-popover') {
    return (
      <div className={clsx('relative flex items-center justify-center', className)} ref={popoverRef}>
        <button
          type="button"
          data-testid="whatsapp-health-popover-trigger"
          onClick={() => {
            if (!isOpen) {
              void checkNow();
            }
            setIsOpen(!isOpen);
          }}
          className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
          title={`WhatsApp Evolution API: ${currentPresentation.label}${isPaused ? ' (Disparos Pausados)' : ''}`}
        >
          <MessageSquare className="h-4 w-4 text-neutral-600" />
          {/* Status Dot */}
          <span className={clsx('absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full', currentPresentation.dotColor, currentPresentation.glowShadow)} />
          {status === 'connected' && !isPaused && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400 opacity-50 blur-[2px] animate-ping" />
          )}
          {isPaused && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-amber-500 text-white rounded-full flex items-center justify-center text-[7px] font-black">
              II
            </span>
          )}
        </button>

        {isOpen && (
          <div 
            data-testid="whatsapp-health-popover-menu"
            className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2"
          >
            {/* Popover Header */}
            <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className={clsx('p-2 rounded-xl border', currentPresentation.bgLight)}>
                  <StatusIcon className={clsx('h-4 w-4', isChecking && 'animate-spin')} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    WhatsApp Evolution API
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                    {currentPresentation.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Popover Telemetry Metrics */}
            <div className="p-4 space-y-2.5 bg-white text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <Activity className="h-3.5 w-3.5 text-slate-400" /> Status da Sessão
                </span>
                <StatusBadge 
                  variant={currentPresentation.badgeVariant}
                  dot
                  pulse={status === 'connecting'}
                  size="xs"
                >
                  {currentPresentation.label}
                </StatusBadge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <Wifi className="h-3.5 w-3.5 text-slate-400" /> Latência do Ping
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {latencyMs > 0 ? `${latencyMs}ms` : status === 'error' ? '--' : '0ms'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Última Verificação
                </span>
                <span className="font-bold text-slate-700">
                  {lastChecked ? lastChecked.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Iniciando...'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                  <Layers className="h-3.5 w-3.5 text-slate-400" /> Fila Local Retida
                </span>
                <span className={clsx('font-mono font-bold', queuedCount > 0 ? 'text-amber-600' : 'text-slate-700')}>
                  {`${queuedCount} mensagem${queuedCount !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>

            {/* Pause Dispatch Toggle in Popover */}
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800">
              <div className="flex items-center gap-2">
                {isPaused ? <PauseCircle className="h-4 w-4 text-amber-400 shrink-0" /> : <Play className="h-4 w-4 text-emerald-400 shrink-0" />}
                <div>
                  <p className="text-[11px] font-black leading-none">
                    {isPaused ? 'Disparos Pausados' : 'Disparos Ativos'}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5 leading-none">
                    {isPaused ? 'Mensagens seguras na fila local' : 'Envio contínuo com presença'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="whatsapp-pause-toggle-popover"
                onClick={handleTogglePause}
                className={clsx(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  isPaused ? 'bg-amber-500' : 'bg-emerald-600'
                )}
                aria-pressed={isPaused}
                title={isPaused ? 'Retomar disparos' : 'Pausar disparos'}
              >
                <span
                  className={clsx(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                    isPaused ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Popover Footer: Manual Check */}
            <div className="p-2.5 bg-slate-100 text-center flex items-center justify-center gap-2">
              <button
                type="button"
                data-testid="whatsapp-manual-refresh-popover"
                onClick={handleManualCheck}
                disabled={isChecking}
                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 uppercase tracking-wider transition-colors flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-white cursor-pointer"
              >
                <RefreshCw className={clsx('h-3 w-3', isChecking && 'animate-spin text-indigo-600')} />
                {isChecking ? 'Verificando...' : 'Forçar Nova Verificação'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VARIANT: CARD (Full Metric Dashboard for Infra View)
  // --------------------------------------------------------------------------
  return (
    <div 
      data-testid="whatsapp-health-card"
      className={clsx(
        'bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4',
        className
      )}
    >
      {/* Header with Title, Status & Actions */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className={clsx('p-2.5 rounded-xl border', currentPresentation.bgLight)}>
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                Monitor de Saúde Evolution API (WhatsApp)
              </h3>
              {isPaused && (
                <span 
                  data-testid="whatsapp-paused-badge"
                  className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 shadow-2xs"
                >
                  <PauseCircle className="h-3 w-3" /> Fila Pausada
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Keep-Alive automático via WebSocket, telemetria de latência e gestão de fila local
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showClearQueue && queuedCount > 0 && (
            <button
              type="button"
              data-testid="whatsapp-clear-queue-btn"
              onClick={handleClearQueue}
              className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              title="Limpar mensagens retidas"
            >
              {`Limpar Fila (${queuedCount})`}
            </button>
          )}

          <button
            type="button"
            data-testid="whatsapp-manual-refresh-btn"
            onClick={handleManualCheck}
            disabled={isChecking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Verificar Conexão Agora"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isChecking && 'animate-spin text-indigo-600')} />
            <span>{isChecking ? 'Verificando...' : 'Verificar Agora'}</span>
          </button>
        </div>
      </div>

      {/* Telemetry Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Session Status */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Estado da Sessão</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <StatusBadge 
              data-testid="whatsapp-status-badge"
              variant={currentPresentation.badgeVariant}
              dot
              pulse={status === 'connecting'}
              size="sm"
            >
              {currentPresentation.label}
            </StatusBadge>
          </div>
        </div>

        {/* Card 2: Ping Latency */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Latência do Ping</p>
          <p 
            data-testid="whatsapp-latency-value"
            className="mt-1 text-base font-black text-slate-900 font-mono"
          >
            {latencyMs > 0 ? `${latencyMs} ms` : status === 'error' ? '—' : '0 ms'}
          </p>
        </div>

        {/* Card 3: Last Checked */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Última Checagem</p>
          <p 
            data-testid="whatsapp-last-checked-value"
            className="mt-1 text-xs font-bold text-slate-700 truncate"
          >
            {lastChecked ? lastChecked.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Iniciando...'}
          </p>
        </div>

        {/* Card 4: Queued Messages */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mensagens na Fila</p>
          <p 
            data-testid="whatsapp-queue-count-value"
            className={clsx(
              'mt-1 text-base font-black font-mono',
              queuedCount > 0 ? 'text-amber-600' : 'text-slate-900'
            )}
          >
            {`${queuedCount} retida${queuedCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Control Banner: Pause Dispatch */}
      <div 
        data-testid="whatsapp-pause-control-banner"
        className="flex items-center justify-between p-4 bg-neutral-900 text-white rounded-xl border border-neutral-800 shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            'p-2.5 rounded-lg border',
            isPaused ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
          )}>
            {isPaused ? <PauseCircle className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-black tracking-wide">
              {isPaused ? 'Pausa de Disparos Ativada' : 'Disparos Contínuos Ativos'}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
              {isPaused 
                ? 'Novas mensagens ficam retidas na memória local sem serem descartadas.' 
                : 'Notificações são despachadas em tempo real com atrasos humanizados e rotação de conteúdo.'}
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          type="button"
          data-testid="whatsapp-pause-toggle"
          onClick={handleTogglePause}
          className={clsx(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner',
            isPaused ? 'bg-amber-500' : 'bg-emerald-600'
          )}
          aria-pressed={isPaused}
          title={isPaused ? 'Retomar envios de WhatsApp' : 'Pausar envios de WhatsApp'}
        >
          <span
            className={clsx(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
              isPaused ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>
    </div>
  );
}

export default WhatsAppHealthMonitor;

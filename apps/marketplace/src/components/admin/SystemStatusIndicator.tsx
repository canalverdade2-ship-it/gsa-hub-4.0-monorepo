import { useState, useEffect, useRef } from 'react';
import { Activity, Database, Server, Wifi, ServerOff, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { isLocalDevHost } from '../../lib/utils';

type SystemStatus = 'ok' | 'warning' | 'error';

export function SystemStatusIndicator() {
  const [status, setStatus] = useState<SystemStatus>('ok');
  const [reason, setReason] = useState<string>('Verificando status inicial...');
  const [isOpen, setIsOpen] = useState(false);
  const [latency, setLatency] = useState<number>(0);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fechar popover ao clicar fora
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Verificação inicial apenas no carregamento
    checkStatus();
  }, []);

  const handleToggle = () => {
    if (!isOpen) {
      // Força verificação ao abrir o popover
      setLatency(0);
      setReason('Verificando status...');
      checkStatus();
    }
    setIsOpen(!isOpen);
  };

  const checkStatus = async () => {
    const start = performance.now();
    try {
      if (!navigator.onLine) {
        setStatus('error');
        setReason('Sem conexão com a internet. Verifique sua rede.');
        setLastCheck(new Date());
        return;
      }

      // Simple health check query
      const { data, error } = await supabase.from('clientes').select('id').limit(1);
      const end = performance.now();
      const currentLatency = Math.round(end - start);
      setLatency(currentLatency);
      setLastCheck(new Date());

      const connection = (navigator as any).connection;
      const isSlowNetwork = connection && ['slow-2g', '2g', '3g'].includes(connection.effectiveType);

      if (error) {
        setStatus('error');
        setReason('Falha ao conectar no banco de dados (Supabase).');
      } else if (currentLatency > 1000) {
        setStatus('warning');
        setReason(isSlowNetwork ? 'Sua conexão de internet está lenta ou instável (Ex: 3G).' : 'O banco de dados está operando com alta latência no momento.');
      } else {
        setStatus('ok');
        setReason('Todos os sistemas estão funcionando normalmente.');
      }
    } catch (err) {
      setStatus('error');
      setReason('Erro de conexão desconhecido.');
    }
  };

  const statusConfig = {
    ok: {
      color: 'bg-emerald-500',
      shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.8)]',
      text: 'text-emerald-500',
      label: 'Sistema Operacional',
      icon: CheckCircle
    },
    warning: {
      color: 'bg-amber-500',
      shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.8)]',
      text: 'text-amber-500',
      label: 'Lentidão Detectada',
      icon: AlertTriangle
    },
    error: {
      color: 'bg-red-500',
      shadow: 'shadow-[0_0_12px_rgba(239,68,68,0.8)]',
      text: 'text-red-500',
      label: 'Falha de Conexão',
      icon: XCircle
    }
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="relative flex items-center justify-center" ref={popoverRef}>
      <button 
        onClick={handleToggle}
        className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-neutral-100 transition-colors"
        title="Status do Sistema"
      >
        <span className={`absolute w-4 h-4 rounded-full ${config.color} ${config.shadow} animate-pulse`} />
        {/* Camada extra para dar um efeito de "glow" forte */}
        <span className={`absolute w-4 h-4 rounded-full ${config.color} opacity-50 blur-[3px] animate-ping`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-neutral-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="p-4 border-b border-neutral-50 flex items-start gap-3">
            <div className={`p-2 rounded-xl bg-neutral-50 ${config.text}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 text-sm">{config.label}</h3>
              <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{reason}</p>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3 bg-neutral-50/50">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-neutral-500"><Database className="h-3.5 w-3.5" /> Supabase DB</span>
              <span className={`font-bold ${status === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
                {status === 'error' ? 'Desconectado' : 'Conectado'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-neutral-500"><Wifi className="h-3.5 w-3.5" /> Latência API</span>
              <span className={`font-bold ${status === 'warning' ? 'text-amber-500' : (status === 'error' ? 'text-red-500' : 'text-emerald-500')}`}>
                {status === 'error' ? '--' : `${latency}ms`}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-neutral-500"><Activity className="h-3.5 w-3.5" /> Última Verificação</span>
              <span className="font-bold text-neutral-700">
                {lastCheck.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-neutral-100 text-center">
            <button 
              onClick={() => {
                setLatency(0);
                checkStatus();
              }}
              className="text-[10px] font-bold text-neutral-500 hover:text-neutral-900 uppercase tracking-wider transition-colors"
            >
              Forçar Nova Verificação
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sessionService } from '../lib/sessionService';
import { toast } from 'react-hot-toast';

export function useAutoLogout(
  onLogout: (reason?: string) => void | Promise<void>,
  isSessionActive: boolean,
) {
  const isLoggingOutRef = useRef(false);

  const performLogout = (reason: string = 'superseded') => {
    // evitando duas chamadas concorrentes
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    if (reason === 'superseded') {
      toast.error('Sua sessão foi encerrada porque sua conta foi conectada em outro dispositivo ou local.', {
        id: 'session-superseded-toast',
        duration: 8000,
      });
    }

    // Promise.resolve(onLogout())
    Promise.resolve(onLogout(reason || undefined)).finally(() => {
      isLoggingOutRef.current = false;
    });
  };

  useEffect(() => {
    if (!isSessionActive) return;

    // 1. Ouvinte para eventos de revogação de sessão disparados por RPCs ou validações locais
    const handleRemoteRevocation = (event?: any) => {
      const reason = event?.detail?.reason || 'superseded';
      performLogout(reason);
    };
    window.addEventListener('gsa-session-revoked', handleRemoteRevocation);


    // 2. Heartbeat e verificação periódica de vitalidade da sessão.
    // A tabela de sessões é deliberadamente privada e não integra a publicação
    // Realtime. A RPC valida token e sessão sem expor linhas sensíveis ao navegador.
    const checkSessionLiveness = async () => {
      if (!isSessionActive || isLoggingOutRef.current) return;
      try {
        const current = sessionService.getCurrentSession();
        if (!current?.sessaoId || !current?.sessionToken) {
          performLogout('revoked');
          return;
        }

        const { data, error } = await supabase.rpc('gsa_ping_session', {
          p_sessao_id: current.sessaoId,
          p_session_token: current.sessionToken,
        });

        // Se o banco retornou explicitamente false, a sessão foi desativada por um novo login
        if (!error && data === false) {
          performLogout('superseded');
        }
      } catch {
        // Falhas transitórias de rede não derrubam a sessão
      }
    };

    // Janela de revogação passiva a cada 15 segundos sem interrupção de foco
    const pingInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void checkSessionLiveness();
    }, 15_000);

    return () => {
      window.removeEventListener('gsa-session-revoked', handleRemoteRevocation);
      clearInterval(pingInterval);
    };
  }, [isSessionActive, onLogout]);
}

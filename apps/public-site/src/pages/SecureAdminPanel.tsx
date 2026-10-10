import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { toast } from 'react-hot-toast';
const AdminPanel = lazy(() => import('./AdminPanel').then(m => ({ default: m.AdminPanel })));
import { callAdminRpc } from '../lib/adminRpc';
import { supabase } from '../lib/supabase';
import { sessionService } from '../lib/sessionService';
import { useAppLocation } from '../routing/useAppLocation';
import { navigate } from '../routing/navigationService';
import {
  defaultAdminPath,
  hasAdminModuleAccess,
  normalizeCollaboratorModules,
} from '../security/collaboratorAccess';

interface SecureAdminPanelProps {
  onLogout: () => void;
  adminType: 'admin' | 'colaborador';
  colaboradorId?: string;
  colaboradorNome?: string;
  colaboradorModulos: string[];
  isGsaTv?: boolean;
}

type SecureAdminContext = {
  actor_type?: string;
  actor_id?: string;
  actor_name?: string;
  modules?: string[];
  session_id?: string;
};

export function SecureAdminPanel(props: SecureAdminPanelProps) {
  const route = useAppLocation();
  const logoutRef = useRef(props.onLogout);
  const [name, setName] = useState(props.colaboradorNome);
  const [modules, setModules] = useState(() => normalizeCollaboratorModules(props.colaboradorModulos));
  const [checking, setChecking] = useState(props.adminType === 'colaborador');
  const revokingRef = useRef(false);

  useEffect(() => { logoutRef.current = props.onLogout; }, [props.onLogout]);
  useEffect(() => { setName(props.colaboradorNome); }, [props.colaboradorNome]);
  useEffect(() => { setModules(normalizeCollaboratorModules(props.colaboradorModulos)); }, [props.colaboradorModulos]);

  const persistIdentity = useCallback((nextName: string | undefined, nextModules: string[]) => {
    sessionStorage.setItem('adminType', props.adminType);
    if (props.colaboradorId) sessionStorage.setItem('colaboradorId', props.colaboradorId);
    else sessionStorage.removeItem('colaboradorId');
    if (nextName) sessionStorage.setItem('colaboradorNome', nextName);
    else sessionStorage.removeItem('colaboradorNome');
    sessionStorage.setItem('colaboradorModulos', JSON.stringify(nextModules));
    for (const key of ['adminType', 'colaboradorId', 'colaboradorNome', 'colaboradorModulos']) {
      localStorage.removeItem(key);
    }
  }, [props.adminType, props.colaboradorId]);

  const revoke = useCallback(async (message: string) => {
    if (revokingRef.current) return;
    revokingRef.current = true;
    setModules([]);
    setChecking(true);
    toast.error(message, { duration: 8000 });
    await sessionService.endSession();
    logoutRef.current();
  }, []);

  const refreshAccess = useCallback(async () => {
    if (props.adminType !== 'colaborador') {
      persistIdentity(props.colaboradorNome, normalizeCollaboratorModules(props.colaboradorModulos));
      setChecking(false);
      return;
    }
    if (!props.colaboradorId) {
      await revoke('Sessão de colaborador inválida. Entre novamente.');
      return;
    }

    try {
      const context = await callAdminRpc<SecureAdminContext>('gsa_admin_get_context_secure');
      if (
        context?.actor_type !== 'colaborador'
        || context?.actor_id !== props.colaboradorId
        || !Array.isArray(context?.modules)
      ) {
        await revoke('Sua identidade administrativa não pôde ser confirmada. Entre novamente.');
        return;
      }

      const nextModules = normalizeCollaboratorModules(context.modules);
      const nextName = context.actor_name || props.colaboradorNome;
      setName(nextName);
      setModules(nextModules);
      persistIdentity(nextName, nextModules);
      setChecking(false);
    } catch (error: any) {
      const errorMessage = String(error?.message || error || '');
      const isTransientNetworkError = error instanceof TypeError || /failed to fetch|network|timeout|timed out|load failed/i.test(errorMessage);
      if (isTransientNetworkError) {
        console.warn('Falha temporária de rede ao validar permissões do colaborador:', error);
        setChecking(false);
        return;
      }
      console.warn('Falha ao validar sessão ou permissões do colaborador:', error);
      await revoke('Sua sessão ou suas permissões não puderam ser validadas. Entre novamente.');
    }
  }, [persistIdentity, props.adminType, props.colaboradorId, props.colaboradorModulos, props.colaboradorNome, revoke]);

  useEffect(() => {
    void refreshAccess();
    if (props.adminType !== 'colaborador' || !props.colaboradorId) return;

    const refresh = () => { void refreshAccess(); };
    const channel = supabase
      .channel(`collaborator-access-${props.colaboradorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores', filter: `id=eq.${props.colaboradorId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'colaborador_modulos', filter: `colaborador_id=eq.${props.colaboradorId}` }, refresh)
      .subscribe();

    const interval = window.setInterval(refresh, 60_000);
    const onRevoked = () => { void revoke('Sua sessão administrativa foi encerrada.'); };
    window.addEventListener('gsa-session-revoked', onRevoked);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('gsa-session-revoked', onRevoked);
      supabase.removeChannel(channel).catch(console.error);
    };
  }, [props.adminType, props.colaboradorId, refreshAccess, revoke]);

  useEffect(() => {
    if (checking || route.area !== 'admin') return;
    if (!hasAdminModuleAccess(route.module, props.adminType, modules, route.submodule)) {
      toast.error('Você não possui permissão para acessar este módulo.');
      navigate(defaultAdminPath(props.adminType, modules));
    }
  }, [checking, modules, props.adminType, route.area, route.module, route.submodule]);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-sm font-semibold text-neutral-500">Validando permissões...</div>;
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-neutral-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>}>
      <AdminPanel
        onLogout={props.onLogout}
        adminType={props.adminType}
        colaboradorId={props.colaboradorId}
        colaboradorNomeInicial={name}
        colaboradorModulos={modules}
        isGsaTv={props.isGsaTv}
      />
    </Suspense>
  );
}

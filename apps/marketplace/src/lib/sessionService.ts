import { supabase } from './supabase';

type StoredSession = {
  sessaoId: string;
  sessionToken?: string;
  atorTipo: string;
  atorId: string;
  atorNome: string;
  [key: string]: any;
};

export type AuthGatewayError = Error & {
  code?: string;
  retryAfter?: number;
  status?: number;
};

export type ClientPersonType = 'pf' | 'pj';

const SESSION_STORAGE_KEY = '_gsa_session';
let restoreSessionPromise: Promise<StoredSession | null> | null = null;
let endSessionPromise: Promise<void> | null = null;

function getStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function readStoredSession(): StoredSession | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const stored = storage.getItem(SESSION_STORAGE_KEY) || window.sessionStorage?.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as StoredSession;
  } catch {
    return null;
  }
}

function writeStoredSession(sessionData: StoredSession) {
  const dataStr = JSON.stringify(sessionData);
  getStorage()?.setItem(SESSION_STORAGE_KEY, dataStr);
  window.sessionStorage?.setItem(SESSION_STORAGE_KEY, dataStr);
  localStorage.setItem('sessaoId', sessionData.sessaoId);
}

function clearStoredSession() {
  getStorage()?.removeItem(SESSION_STORAGE_KEY);
  window.sessionStorage?.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem('sessaoId');
  localStorage.removeItem('_gsa_sess');
  localStorage.removeItem('lastPing');
}

function gatewayErrorMessage(code: string, retryAfter: number) {
  if (code === 'too_many_attempts') {
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    return `Muitas tentativas. Aguarde ${minutes} minuto(s) e tente novamente.`;
  }
  if (code === 'origin_not_allowed') {
    return 'Este endereço não está autorizado para acessar o sistema.';
  }
  if (code === 'server_not_configured' || code === 'rate_limit_unavailable') {
    return 'O acesso está temporariamente indisponível. Tente novamente mais tarde.';
  }
  if (code === 'invalid_affiliate_credentials') {
    return 'Este CPF ou CNPJ já possui uma conta GSA. Informe o PIN atual dessa conta.';
  }
  if (code === 'affiliate_email_in_use') {
    return 'Este e-mail já está vinculado a outra conta GSA.';
  }
  if (code === 'affiliate_phone_in_use') {
    return 'Este telefone já está vinculado a outra conta GSA.';
  }
  if (code === 'affiliate_account_blocked') {
    return 'Esta conta está temporariamente bloqueada. Utilize a recuperação de acesso.';
  }
  if (code === 'affiliate_account_unavailable') {
    return 'Este cadastro está indisponível. Procure o atendimento GSA para regularização.';
  }
  if (code === 'affiliate_registration_failed') {
    return 'Não foi possível criar o perfil de afiliado. Confira os dados e tente novamente.';
  }
  return 'Não foi possível concluir a autenticação.';
}

async function createAuthGatewayError(error: any): Promise<AuthGatewayError> {
  const response = error?.context instanceof Response ? error.context as Response : null;
  let payload: { error?: string; retry_after?: number } | null = null;

  if (response) {
    try {
      payload = await response.clone().json();
    } catch {
      payload = null;
    }
  }

  const code = payload?.error || 'authentication_failed';
  const retryAfterHeader = Number(response?.headers.get('retry-after') || 0);
  const retryAfter = Math.max(0, Number(payload?.retry_after || retryAfterHeader || 0));
  const gatewayError = new Error(gatewayErrorMessage(code, retryAfter)) as AuthGatewayError;
  gatewayError.code = code;
  gatewayError.retryAfter = retryAfter;
  gatewayError.status = response?.status;
  return gatewayError;
}

async function invokeAuthGateway(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('gsa-auth-session', {
    body: { action, payload },
  });
  if (error) throw await createAuthGatewayError(error);
  return data as any;
}

async function persistAuthenticatedSession(payload: any, useExistingAuthSession = false): Promise<StoredSession> {
  const rpcSession = payload?.session || payload;
  const sessaoId = rpcSession?.sessao_id;
  const sessionToken = rpcSession?.session_token;
  const atorTipo = rpcSession?.ator_tipo;
  const atorId = rpcSession?.ator_id;
  const atorNome = rpcSession?.ator_nome;
  if (!sessaoId || !sessionToken || !atorTipo || !atorId) {
    throw new Error('A autenticação não retornou uma sessão válida.');
  }

  let authSession: any = null;

  if (useExistingAuthSession) {
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    authSession = refreshedData.session;
    if (refreshError || !authSession?.user) {
      await supabase.rpc('gsa_end_session', {
        p_sessao_id: sessaoId,
        p_session_token: sessionToken,
      });
      throw new Error(refreshError?.message || 'Não foi possível confirmar a sessão de recuperação.');
    }
  } else {
    const tokenHash = rpcSession?.auth?.token_hash;
    const email = rpcSession?.auth?.email;
    const password = rpcSession?.auth?.password;
    
    let authData, authError;

    if (email && password) {
      const res = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      authData = res.data;
      authError = res.error;
    } else if (tokenHash) {
      const res = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });
      authData = res.data;
      authError = res.error;
    } else {
      throw new Error('A autenticação não retornou os dados de ativação.');
    }

    if (authError || !authData.session || !authData.user) {
      await supabase.rpc('gsa_end_session', {
        p_sessao_id: sessaoId,
        p_session_token: sessionToken,
      });
      throw new Error(authError?.message || 'Não foi possível ativar a sessão segura do Supabase.');
    }
    authSession = authData.session;
  }

  const appMetadata = authSession.user.app_metadata || {};
  if (
    appMetadata.gsa_session_id !== sessaoId ||
    appMetadata.gsa_actor_type !== atorTipo ||
    appMetadata.gsa_actor_id !== atorId
  ) {
    await supabase.auth.signOut({ scope: 'local' });
    await supabase.rpc('gsa_end_session', {
      p_sessao_id: sessaoId,
      p_session_token: sessionToken,
    });
    throw new Error('A identidade autenticada não corresponde à sessão GSA.');
  }

  const metadata = rpcSession?.metadata || {};
  const sessionData: StoredSession = {
    sessaoId,
    sessionToken,
    atorTipo,
    atorId,
    atorNome: atorNome || 'Usuário',
    ...metadata,
  };

  writeStoredSession(sessionData);
  return sessionData;
}

async function authenticate(action: string, payload: Record<string, unknown>) {
  const data = await invokeAuthGateway(action, payload);
  if (data?.valid || data?.success) await persistAuthenticatedSession(data);
  return data;
}

async function endStoredSession(): Promise<void> {
  if (endSessionPromise) return endSessionPromise;

  endSessionPromise = (async () => {
    try {
      const sessionData = readStoredSession();
      if (sessionData?.sessaoId && sessionData?.sessionToken) {
        const { error } = await supabase.rpc('gsa_end_session', {
          p_sessao_id: sessionData.sessaoId,
          p_session_token: sessionData.sessionToken,
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Falha ao encerrar a sessão:', error);
    } finally {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session) {
          await supabase.auth.signOut({ scope: 'local' });
        }
      } catch (error) {
        console.warn('Não foi possível confirmar o logout local no Supabase:', error);
      }
      clearStoredSession();
    }
  })().finally(() => {
    endSessionPromise = null;
  });

  return endSessionPromise;
}

async function restoreStoredSession(): Promise<StoredSession | null> {
  try {
    const sessionData = readStoredSession();
    if (!sessionData?.sessaoId || !sessionData?.atorId || !sessionData?.sessionToken) {
      return null;
    }
    if (['colaborador', 'prestador', 'fornecedor'].includes(sessionData.atorTipo)) {
      clearStoredSession();
      return null;
    }

    // 1. Tenta validar no Supabase DB via RPC
    try {
      const { data, error } = await supabase.rpc('gsa_validate_session', {
        p_sessao_id: sessionData.sessaoId,
        p_session_token: sessionData.sessionToken,
      });
      const validation = Array.isArray(data) ? data[0] : data;

      // Se o banco explicitamente retornou que a sessão é inválida (encerrada por novo login)
      if (!error && validation && (validation as any).is_valid === false) {
        clearStoredSession();
        return null;
      }
    } catch (dbErr) {
      console.warn('[sessionService] Falha temporária ao validar sessão no banco:', dbErr);
    }

    // 2. Garante persistência do Supabase Auth de forma resiliente
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData?.session) {
        await supabase.auth.refreshSession();
      }
    } catch {
      // Falha no Supabase Auth não derruba a sessão local do GSA
    }

    // 3. Atualizar dados do cliente se aplicável
    if (sessionData.atorTipo === 'cliente') {
      try {
        const { data: accessData, error: accessError } = await supabase.rpc('gsa_get_client_session_access_state', {
          p_sessao_id: sessionData.sessaoId,
          p_session_token: sessionData.sessionToken,
        });
        if (!accessError && (accessData as any)?.success) {
          sessionData.precisa_trocar_senha = (accessData as any).precisa_trocar_senha;
          writeStoredSession(sessionData);
        }
      } catch {
        // Ignora erro transitório
      }
    }

    return sessionData;
  } catch (error) {
    console.error('Falha ao restaurar a sessão:', error);
    return readStoredSession();
  }
}

export const sessionService = {
  getCurrentSession() {
    return readStoredSession();
  },

  async loginWithPin(documento: string, pin: string, tipo: 'cliente' | 'prestador' | 'fornecedor') {
    return authenticate('login_pin', { documento, pin, tipo });
  },

  async loginColaborador(code: string) {
    return authenticate('login_colaborador', { code });
  },

  async registerAffiliate(payload: {
    documento: string;
    nome: string;
    nome_divulgacao: string;
    email: string;
    telefone: string;
    pin: string;
    pix_tipo: string;
    pix_chave: string;
    termos_versao: string;
    termos_aceitos: boolean;
  }) {
    return authenticate('register_affiliate', payload);
  },

  async requestClientRecovery(documento: string, email: string) {
    return invokeAuthGateway('request_client_recovery', { documento, email });
  },

  async completeClientRecovery(recoveryId: string) {
    const data = await invokeAuthGateway('complete_client_recovery', { recovery_id: recoveryId });
    if (data?.success) await persistAuthenticatedSession(data, true);
    return data;
  },

  async updateClientPin(newPin: string) {
    const sessionData = readStoredSession();
    if (!sessionData?.sessaoId || !sessionData?.sessionToken) {
      throw new Error('Sessão não encontrada');
    }
    const { data, error } = await supabase.rpc('gsa_update_client_pin', {
      p_sessao_id: sessionData.sessaoId,
      p_session_token: sessionData.sessionToken,
      p_new_pin: newPin,
    });
    if (error) throw error;
    if ((data as any)?.success) {
      sessionData.precisa_trocar_senha = false;
      writeStoredSession(sessionData);
    }
    return data as any;
  },

  async getClientSessionAccessState() {
    const sessionData = readStoredSession();
    if (!sessionData?.sessaoId || !sessionData?.sessionToken) return null;
    const { data, error } = await supabase.rpc('gsa_get_client_session_access_state', {
      p_sessao_id: sessionData.sessaoId,
      p_session_token: sessionData.sessionToken,
    });
    if (error || !(data as any)?.success) return null;
    return data as any;
  },

  async setPinAndLogin(
    documento: string,
    telefone: string,
    pin: string,
    tipo: 'cliente',
  ) {
    return authenticate('set_pin_and_login', { documento, telefone, pin, tipo });
  },

  async loginAdmin(code: string) {
    return authenticate('login_admin', { code });
  },

  async requestClientFirstAccess(documento: string, contato: string, pin: string) {
    return authenticate('request_client_first_access', { documento, contato, pin });
  },

  async completeClientFirstAccess(challengeId: string, pin: string) {
    return authenticate('complete_client_first_access', { challengeId, pin });
  },

  async restoreSession() {
    if (!restoreSessionPromise) {
      restoreSessionPromise = restoreStoredSession().finally(() => {
        restoreSessionPromise = null;
      });
    }
    return restoreSessionPromise;
  },

  async endSession() {
    return endStoredSession();
  },

  async pingSession() {
    try {
      const sessionData = readStoredSession();
      if (!sessionData?.sessaoId || !sessionData?.sessionToken) return;
      const { data, error } = await supabase.rpc('gsa_ping_session', {
        p_sessao_id: sessionData.sessaoId,
        p_session_token: sessionData.sessionToken,
      });
      // Apenas revoga se o banco explicitamente retornou false (sessão encerrada)
      if (!error && data === false) {
        await endStoredSession();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gsa-session-revoked', { detail: { reason: 'superseded' } }));
        }
      }
    } catch {
      // Ignora falhas de rede no ping
    }
  },

  async resolveAuthenticatedClientPersonType(clientId: string): Promise<'pf' | 'pj' | null> {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('tipo_pessoa')
        .eq('id', clientId)
        .maybeSingle();
      if (error || !data?.tipo_pessoa) return null;
      const tipo = String(data.tipo_pessoa).toLowerCase();
      if (tipo === 'pj' || tipo === 'juridica' || tipo === 'empresa') return 'pj';
      if (tipo === 'pf' || tipo === 'fisica') return 'pf';
      return null;
    } catch {
      return null;
    }
  },

  setClientPersonType(personType: 'pf' | 'pj') {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('_gsa_client_person_type', personType);
      window.sessionStorage?.setItem('_gsa_client_person_type', personType);
    }
  },

  getClientPersonType(): 'pf' | 'pj' | null {
    if (typeof window === 'undefined') return null;
    return (window.localStorage.getItem('_gsa_client_person_type') as 'pf' | 'pj') ||
           (window.sessionStorage?.getItem('_gsa_client_person_type') as 'pf' | 'pj') || null;
  },
};



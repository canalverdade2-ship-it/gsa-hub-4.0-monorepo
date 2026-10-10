import { supabase } from './supabase';
import { sessionService } from './sessionService';

export type GsaTvCredentialStatus = {
  success: true;
  channel_id: string;
  provider: 'youtube';
  rtmp_server: string;
  stream_key_configured: boolean;
  stream_key_masked: string | null;
  updated_at: string | null;
};

type CredentialAction = 'gsa_tv_credentials_status' | 'gsa_tv_credentials_update';

function credentialErrorMessage(code: string) {
  if (code === 'forbidden') return 'Somente administradores podem gerenciar as credenciais da GSA TV.';
  if (code === 'invalid_rtmp_server') return 'Informe uma URL RTMP ou RTMPS válida.';
  if (code === 'invalid_stream_key') return 'A chave de transmissão informada é inválida.';
  if (code === 'tv_credentials_unavailable') return 'As credenciais da GSA TV estão temporariamente indisponíveis.';
  if (code === 'tv_credentials_save_failed') return 'Não foi possível salvar as credenciais da GSA TV.';
  return 'Não foi possível concluir a operação com as credenciais da GSA TV.';
}
async function invokeCredentials(action: CredentialAction, payload: Record<string, unknown>) {
  const gsaSession = sessionService.getCurrentSession();
  if (
    gsaSession?.atorTipo !== 'admin'
    || !gsaSession.sessaoId
    || !gsaSession.sessionToken
  ) {
    throw new Error('Sua sessão administrativa não pôde ser confirmada. Entre novamente.');
  }

  const { data: authData, error: authError } = await supabase.auth.getSession();
  const accessToken = authData.session?.access_token;
  if (authError || !accessToken) {
    throw new Error('Sua sessão administrativa não pôde ser confirmada. Entre novamente.');
  }

  const { data, error } = await supabase.functions.invoke('gsa-auth-session', {
    body: {
      action,
      payload: {
        ...payload,
        sessao_id: gsaSession.sessaoId,
        session_token: gsaSession.sessionToken,
      },
    },
    // Envia explicitamente o JWT do administrador. Isso evita que a chamada
    // use a chave pública do projeto quando a sessão foi restaurada no painel.
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    const response = (error as any)?.context instanceof Response ? (error as any).context as Response : null;
    let code = '';
    if (response) {
      try {
        const body = await response.clone().json();
        code = String(body?.error || '');
      } catch {
        code = '';
      }
    }
    throw new Error(credentialErrorMessage(code));
  }

  if (!data?.success) throw new Error(credentialErrorMessage(String(data?.error || '')));
  return data as GsaTvCredentialStatus;
}

export function getGsaTvCredentialStatus(channelId = 'ch-main') {
  return invokeCredentials('gsa_tv_credentials_status', { channel_id: channelId });
}
export function updateGsaTvCredentials(
  channelId: string,
  rtmpServer: string,
  streamKey?: string,
) {
  const payload: Record<string, unknown> = {
    channel_id: channelId,
    rtmp_server: rtmpServer.trim(),
  };
  const cleanKey = streamKey?.trim();
  if (cleanKey) payload.stream_key = cleanKey;
  return invokeCredentials('gsa_tv_credentials_update', payload);
}

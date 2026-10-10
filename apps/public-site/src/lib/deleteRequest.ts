import { supabase } from './supabase';
import { sessionService } from './sessionService';
import { toast } from 'react-hot-toast';

/**
 * Intercepta exclusões administrativas.
 * Atores que não são colaboradores podem excluir diretamente.
 * Colaboradores precisam abrir uma solicitação para aprovação.
 */
export async function canDeleteRecord(tabela: string, registro_id: string): Promise<boolean> {
  const storedSession = sessionService.getCurrentSession();
  if (!storedSession?.sessaoId || !storedSession.sessionToken) {
    toast.error('Sessão inválida.');
    return false;
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase
      .rpc('gsa_validate_session', {
        p_sessao_id: storedSession.sessaoId,
        p_session_token: storedSession.sessionToken
      });
    const validatedSession = Array.isArray(sessionData) ? sessionData[0] : sessionData;

    if (sessionError || !validatedSession || !(validatedSession as any).is_valid) {
      toast.error('Sessão expirada ou inválida.');
      return false;
    }

    const actorType = (validatedSession as any).ator_tipo || storedSession.atorTipo;
    const actorId = (validatedSession as any).ator_id || storedSession.atorId;

    if (actorType !== 'colaborador') {
      return true;
    }

    if (!actorId) {
      toast.error('Não foi possível identificar o colaborador.');
      return false;
    }

    const motivo = window.prompt('Exclusão restrita: qual o motivo para solicitar a exclusão deste registro? Sua solicitação será enviada para aprovação administrativa.');

    if (!motivo || motivo.trim() === '') {
      toast.error('Solicitação cancelada. É obrigatório informar o motivo.');
      return false;
    }

    const { error } = await supabase.from('solicitacoes_exclusao').insert([{
      colaborador_id: actorId,
      tabela,
      registro_id,
      motivo: motivo.trim()
    }]);

    if (error) throw error;

    toast.success('Solicitação de exclusão enviada para análise administrativa.');
    return false;
  } catch (err) {
    console.error('Erro ao validar exclusão:', err);
    toast.error('Erro ao processar solicitação.');
    return false;
  }
}

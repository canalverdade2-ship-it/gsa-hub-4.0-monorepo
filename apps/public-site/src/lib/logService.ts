import { supabase } from './supabase';
import { sessionService } from './sessionService';

export type AtorTipo = 'admin' | 'colaborador' | 'cliente' | 'prestador' | 'fornecedor' | 'sistema';

interface LogData {
  ator_tipo: AtorTipo;
  ator_id?: string;
  ator_nome?: string;
  acao: string;
  detalhes?: string;
}


export const logService = {
  /**
   * Registra uma ação no extrato global (sistema_logs) via RPC validada.
   * A sessão é obtida do serviço central para evitar formatos legados e logs sem vínculo.
   */
  async logAction(data: LogData) {
    try {
      const session = sessionService.getCurrentSession();
      if (!session?.sessaoId || !session?.sessionToken) {
        return;
      }
      const { error } = await supabase.rpc('gsa_log_action', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_ator_tipo: data.ator_tipo,
        p_ator_id: data.ator_id || null,
        p_ator_nome: data.ator_nome || null,
        p_acao: data.acao,
        p_detalhes: data.detalhes || null,
      });

      if (error) {
        console.warn('[logService] Não foi possível registrar log:', error.message);
      }
    } catch (error) {
      console.warn('[logService] Falha inesperada no logService:', error);
    }
  },
};

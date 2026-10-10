import { callAdminRpc, createAdminRequestId } from './adminRpc';
import { toast } from 'react-hot-toast';

export interface DemandHistoryParams {
  demandaId: string;
  tipoEvento: 'criacao' | 'transferencia' | 'aceite' | 'entrega' | 'ajuste' | 'recusa' | 'negociacao' | 'finalizacao' | 'cancelamento';
  motivo: string;
  colaboradorOrigemId?: string | null;
  colaboradorDestinoId?: string | null;
  prestadorOrigemId?: string | null;
  prestadorDestinoId?: string | null;
  valorProposto?: number | null;
}

export const demandService = {
  async addDemandHistory({
    demandaId,
    tipoEvento,
    motivo,
    colaboradorOrigemId = null,
    colaboradorDestinoId = null,
    prestadorOrigemId = null,
    prestadorDestinoId = null,
    valorProposto = null
  }: DemandHistoryParams) {
    try {      await callAdminRpc('gsa_admin_add_demand_history', {
        p_demanda_id: demandaId,
        p_tipo_evento: tipoEvento,
        p_motivo: motivo,
        p_colaborador_destino_id: colaboradorDestinoId,
        p_prestador_origem_id: prestadorOrigemId,
        p_prestador_destino_id: prestadorDestinoId,
        p_valor_proposto: valorProposto,
        p_request_id: createAdminRequestId(),
      });

      return { success: true };
    } catch (error) {
      console.error('Unexpected error adding demand history:', error);
      return { success: false, error };
    }
  }
};

import { callAdminRpc } from '../../lib/adminRpc';
import { callClientRpc } from '../../lib/clientRpc';
import type {
  CreateCreditDisputeInput,
  CreditDispute,
  CreditDisputeStatus,
} from './types';

const normalizeDispute = (value: any): CreditDispute => ({
  ...value,
  valor_compra: Number(value?.valor_compra || 0),
  valor_contestado: Number(value?.valor_contestado || 0),
  valor_deferido: Number(value?.valor_deferido || 0),
  anexos: Array.isArray(value?.anexos) ? value.anexos.filter(Boolean) : [],
  eventos: Array.isArray(value?.eventos) ? value.eventos : undefined,
});

export async function listClientCreditDisputes(): Promise<CreditDispute[]> {
  const data = await callClientRpc('gsa_client_credit_disputes');
  return (Array.isArray(data) ? data : []).map(normalizeDispute);
}

export async function getClientCreditDisputeDetails(id: string): Promise<CreditDispute> {
  const data = await callClientRpc('gsa_client_credit_dispute_details', {
    p_contestacao_id: id,
  });
  return normalizeDispute(data);
}
export async function createClientCreditDispute(input: CreateCreditDisputeInput): Promise<{
  success: boolean;
  contestacao_id: string;
  protocolo: string;
  status: CreditDisputeStatus;
}> {
  return callClientRpc('gsa_client_create_credit_dispute', {
    p_movimentacao_id: input.movimentacaoId,
    p_motivo: input.motivo,
    p_descricao: input.descricao.trim(),
    p_anexos: input.anexos || [],
  });
}

export async function cancelClientCreditDispute(id: string): Promise<void> {
  await callClientRpc('gsa_client_cancel_credit_dispute', {
    p_contestacao_id: id,
  });
}

export async function listAdminCreditDisputes(status?: CreditDisputeStatus): Promise<CreditDispute[]> {
  const data = await callAdminRpc<any[]>('gsa_admin_credit_disputes', {
    p_status: status || null,
  });
  return (Array.isArray(data) ? data : []).map(normalizeDispute);
}
export async function getAdminCreditDisputeDetails(id: string): Promise<CreditDispute> {
  const data = await callAdminRpc('gsa_admin_credit_dispute_details', {
    p_contestacao_id: id,
  });
  return normalizeDispute(data);
}

export async function reviewAdminCreditDispute(id: string): Promise<void> {
  await callAdminRpc('gsa_admin_review_credit_dispute', { p_contestacao_id: id });
}

export async function requestAdminCreditDisputeDocuments(id: string, message: string): Promise<void> {
  await callAdminRpc('gsa_admin_request_credit_dispute_documents', {
    p_contestacao_id: id,
    p_mensagem: message.trim(),
  });
}

export async function decideAdminCreditDispute(
  id: string,
  decision: 'deferido' | 'parcialmente_deferido' | 'indeferido',
  reason: string,
  approvedValue?: number,
): Promise<void> {
  await callAdminRpc('gsa_admin_decide_credit_dispute', {
    p_contestacao_id: id,
    p_decisao: decision,
    p_valor_deferido: approvedValue ?? null,
    p_motivo: reason.trim(),
  });
}

import { callAdminRpc } from '../../lib/adminRpc';
import { callClientRpc } from '../../lib/clientRpc';
import type { CreditLimitCancellation, CreditLimitCancellationStatus } from './types';

const normalize = (value: any): CreditLimitCancellation => ({
  ...value,
  limite_total_snapshot: Number(value?.limite_total_snapshot || 0),
  limite_disponivel_snapshot: Number(value?.limite_disponivel_snapshot || 0),
  limite_usado_snapshot: Number(value?.limite_usado_snapshot || 0),
  limite_total_atual: value?.limite_total_atual == null ? undefined : Number(value.limite_total_atual),
  limite_disponivel_atual: value?.limite_disponivel_atual == null ? undefined : Number(value.limite_disponivel_atual),
});

export async function listClientCreditLimitCancellations(): Promise<CreditLimitCancellation[]> {
  const data = await callClientRpc('gsa_client_credit_limit_cancellations');
  return (Array.isArray(data) ? data : []).map(normalize);
}

export async function requestClientCreditLimitCancellation(): Promise<{ id: string; protocolo: string; status: CreditLimitCancellationStatus }> {
  return callClientRpc('gsa_client_request_credit_limit_cancellation');
}

export async function listAdminCreditLimitCancellations(status?: CreditLimitCancellationStatus): Promise<CreditLimitCancellation[]> {
  const data = await callAdminRpc<any[]>('gsa_admin_credit_limit_cancellations', { p_status: status || null });
  return (Array.isArray(data) ? data : []).map(normalize);
}
export async function reviewAdminCreditLimitCancellation(id: string): Promise<void> {
  await callAdminRpc('gsa_admin_review_credit_limit_cancellation', { p_cancelamento_id: id });
}

export async function decideAdminCreditLimitCancellation(
  id: string,
  approve: boolean,
  reason?: string,
): Promise<void> {
  await callAdminRpc('gsa_admin_decide_credit_limit_cancellation', {
    p_cancelamento_id: id,
    p_aprovar: approve,
    p_motivo: reason?.trim() || null,
  });
}

import { callAdminRpc } from '../../lib/adminRpc';
import { callClientRpc } from '../../lib/clientRpc';
import type {
  CreateCreditWithdrawalResult,
  CreditWithdrawal,
  CreditWithdrawalDocument,
  CreditWithdrawalQuote,
  CreditWithdrawalStatus,
} from './types';

const numberOrZero = (value: unknown) => Number(value || 0);

const normalizeQuote = (value: any): CreditWithdrawalQuote => ({
  ...value,
  credito_disponivel_efetivo: numberOrZero(value?.credito_disponivel_efetivo),
  valor_maximo_saque: numberOrZero(value?.valor_maximo_saque),
  dias_cadastro: numberOrZero(value?.dias_cadastro),
  taxa_config_valor: numberOrZero(value?.taxa_config_valor),
  taxa_calculada: numberOrZero(value?.taxa_calculada),
  valor_total_fatura: numberOrZero(value?.valor_total_fatura),
  prazo_analise_horas: numberOrZero(value?.prazo_analise_horas),
  prazo_fatura_dias: numberOrZero(value?.prazo_fatura_dias),
  criterio_cadastro_30d_ok: Boolean(value?.criterio_cadastro_30d_ok),
  criterio_credito_100_ok: Boolean(value?.criterio_credito_100_ok),
  analise_reforcada: Boolean(value?.analise_reforcada),
  pode_solicitar: Boolean(value?.pode_solicitar),
});
const normalizeWithdrawal = (value: any): CreditWithdrawal => ({
  ...value,
  valor_solicitado: numberOrZero(value?.valor_solicitado),
  taxa_config_valor: numberOrZero(value?.taxa_config_valor),
  taxa_calculada: numberOrZero(value?.taxa_calculada),
  valor_total_fatura: numberOrZero(value?.valor_total_fatura),
  limite_disponivel_snapshot: numberOrZero(value?.limite_disponivel_snapshot),
  valor_bloqueado: numberOrZero(value?.valor_bloqueado),
  limite_total_atual: value?.limite_total_atual == null ? undefined : numberOrZero(value.limite_total_atual),
  limite_disponivel_atual: value?.limite_disponivel_atual == null ? undefined : numberOrZero(value.limite_disponivel_atual),
  limite_bloqueado_atual: value?.limite_bloqueado_atual == null ? undefined : numberOrZero(value.limite_bloqueado_atual),
  criterio_cadastro_30d_ok: Boolean(value?.criterio_cadastro_30d_ok),
  criterio_credito_100_ok: Boolean(value?.criterio_credito_100_ok),
  analise_reforcada: Boolean(value?.analise_reforcada),
});

export async function quoteCreditWithdrawal(value: number): Promise<CreditWithdrawalQuote> {
  return normalizeQuote(await callClientRpc('gsa_client_credit_withdrawal_quote', { p_valor: value }));
}

export async function createCreditWithdrawal(
  requestId: string,
  value: number,
  pixType: string,
  pixKey: string,
): Promise<CreateCreditWithdrawalResult> {
  return callClientRpc('gsa_client_create_credit_withdrawal', {
    p_request_id: requestId,
    p_valor: value,
    p_pix_tipo: pixType,
    p_pix_chave: pixKey,
  });
}
export async function submitCreditWithdrawalDocuments(
  id: string,
  photoDocument: CreditWithdrawalDocument,
  addressProof: CreditWithdrawalDocument,
): Promise<void> {
  await callClientRpc('gsa_client_submit_credit_withdrawal_documents', {
    p_saque_id: id,
    p_documento_foto: photoDocument,
    p_comprovante_endereco: addressProof,
  });
}

export async function listClientCreditWithdrawals(): Promise<CreditWithdrawal[]> {
  const data = await callClientRpc('gsa_client_credit_withdrawals');
  return (Array.isArray(data) ? data : []).map(normalizeWithdrawal);
}

export async function cancelClientCreditWithdrawal(id: string): Promise<void> {
  await callClientRpc('gsa_client_cancel_credit_withdrawal', { p_saque_id: id });
}

export async function listAdminCreditWithdrawals(status?: CreditWithdrawalStatus): Promise<CreditWithdrawal[]> {
  const data = await callAdminRpc<any[]>('gsa_admin_credit_withdrawals', { p_status: status || null });
  return (Array.isArray(data) ? data : []).map(normalizeWithdrawal);
}

export async function getAdminCreditWithdrawalDetails(id: string): Promise<CreditWithdrawal> {
  return normalizeWithdrawal(await callAdminRpc('gsa_admin_credit_withdrawal_details', { p_saque_id: id }));
}
export async function decideAdminCreditWithdrawal(id: string, approve: boolean, reason?: string): Promise<void> {
  await callAdminRpc('gsa_admin_decide_credit_withdrawal', {
    p_saque_id: id,
    p_aprovar: approve,
    p_motivo: reason?.trim() || null,
  });
}

export async function confirmAdminCreditWithdrawalPix(id: string, paymentReference: string): Promise<{ fatura_id: string }> {
  return callAdminRpc('gsa_admin_mark_credit_withdrawal_paid', {
    p_saque_id: id,
    p_referencia_pagamento: paymentReference.trim(),
  });
}

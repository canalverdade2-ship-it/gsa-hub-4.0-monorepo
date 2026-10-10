export function getStoreOrderPayment(order: any) {
  const budget = order.orcamentos;
  const isGsaCredit = budget?.forma_pagamento_loja === 'credito_loja';
  const released = ['aprovado', 'pago', 'em_expedicao', 'em_transporte', 'concluido'];
  const creditApproved = isGsaCredit && released.includes(order.status) && released.includes(budget?.status);
  const invoicePaid = (order.faturas || []).some((invoice: any) => invoice.status === 'pago' && !invoice.is_amortizacao_credito);
  return { isGsaCredit, logisticsAllowed: creditApproved || (!isGsaCredit && (invoicePaid || order.status === 'pago')) };
}

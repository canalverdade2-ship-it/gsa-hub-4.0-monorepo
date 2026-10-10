import { describe, expect, it } from 'vitest';
import { getStoreOrderPayment } from '../lib/storeOrderPayment';
describe('Store credit fulfillment', () => {
 it('releases approved credit without waiting for installments', () => {
  expect(getStoreOrderPayment({ status: 'aprovado', orcamentos: {status: 'aprovado',forma_pagamento_loja:'credito_loja'},faturas:[{status:'pendente',is_amortizacao_credito:true}] })).toEqual({isGsaCredit:true,logisticsAllowed:true});
 });
 it('does not release credit merely selected or under analysis', () => {
  expect(getStoreOrderPayment({status:'em_analise',orcamentos:{status:'pendente',forma_pagamento_loja:'credito_loja'}}).logisticsAllowed).toBe(false);
 });
 it('keeps unpaid external payments blocked', () => {
  expect(getStoreOrderPayment({status:'em_analise',orcamentos:{forma_pagamento_loja:'pix'},faturas:[{status:'pendente'}]}).logisticsAllowed).toBe(false);
 });
 it('recognizes a settled invoice beyond the first entry', () => {
  expect(getStoreOrderPayment({status:'aprovado',faturas:[{status:'cancelado'},{status:'pago'}]}).logisticsAllowed).toBe(true);
 });
});

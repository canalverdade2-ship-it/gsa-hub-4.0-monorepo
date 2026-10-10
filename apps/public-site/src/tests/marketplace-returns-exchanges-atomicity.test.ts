import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * ============================================================================
 * POST-SALES AUDIT SUITE: RETURNS, EXCHANGES, INVENTORY RESTOCKING,
 * ATOMIC REFUNDS, LOYALTY REVERSAL & PROPORTIONAL APPORTIONMENT
 * ============================================================================
 * 
 * Verifies the 6 Core Post-Sales Milestones:
 * 1. Restocking on Returns & Cancellations (Parent produtos AND Child produto_variantes)
 * 2. Exchange Item Reservation & Stock Balance
 * 3. Atomic Refund Flow (loja_reembolsos, clientes.saldo_carteira, and ledger records)
 * 4. Loyalty & Referral Bonus Reversal (anti-exploit buy-and-cancel prevention)
 * 5. Partial Return Proportional Apportionment (coupons, promos, points, wallet)
 * 6. Authorization & RLS Hardening on loja_solicitacoes
 * 
 * Also executes static contract checks against Supabase migrations and React components.
 */

import {
  type ProductInventory,
  type VariantInventory,
  type OrderItem,
  type OrderHeader,
  type ReturnSolicitacao,
  type CustomerWalletAndLoyalty,
  type StockHistoryEntry,
  type RefundRecord,
  calculateItemProportionalRefund,
  apportionMultiItemRefund,
  PostSalesStateSimulator,
} from './helpers/marketplacePostSalesSimulator';

// ============================================================================
// 2. AUTOMATED TESTS & VERIFICATION SUITE
// ============================================================================

describe('Marketplace Post-Sales Suite: Returns, Cancellations, Stock & Atomicity', () => {
  let sim: PostSalesStateSimulator;

  beforeEach(() => {
    sim = new PostSalesStateSimulator();

    // Base Products & Variants
    sim.products.set('prod-camisa', {
      id: 'prod-camisa',
      nome: 'Camisa Polo GSA',
      controle_estoque: true,
      estoque_disponivel: 10,
      valor: 100.00,
    });

    sim.variants.set('var-camisa-azul-g', {
      id: 'var-camisa-azul-g',
      produto_id: 'prod-camisa',
      chave: 'azul_g',
      nome: 'Camisa Polo GSA - Azul G',
      estoque_disponivel: 4,
      valor: 100.00,
    });

    sim.products.set('prod-tenis', {
      id: 'prod-tenis',
      nome: 'Tênis Esportivo Pro',
      controle_estoque: true,
      estoque_disponivel: 8,
      valor: 200.00,
    });

    sim.variants.set('var-tenis-42', {
      id: 'var-tenis-42',
      produto_id: 'prod-tenis',
      chave: 'tam_42',
      nome: 'Tênis Esportivo Pro - Tam 42',
      estoque_disponivel: 5,
      valor: 200.00,
    });

    sim.products.set('prod-digital-ebook', {
      id: 'prod-digital-ebook',
      nome: 'Manual de Instalação e Boas Práticas (PDF)',
      controle_estoque: false,
      estoque_disponivel: 0,
      valor: 50.00,
    });

    // Customers
    sim.customers.set('cli-referrer', {
      id: 'cli-referrer',
      nome: 'Carlos Indicador',
      saldo_carteira: 50.00,
      saldo_pontos: 300,
      pontos_totais: 300,
    });

    sim.customers.set('cli-buyer', {
      id: 'cli-buyer',
      nome: 'Ana Compradora',
      saldo_carteira: 20.00,
      saldo_pontos: 150,
      pontos_totais: 150,
      indicador_id: 'cli-referrer',
    });
  });

  // =========================================================================
  // DOMAIN 1: RESTOCKING ON RETURNS & CANCELLATIONS (Parent & Child Variants)
  // =========================================================================
  describe('1. Restocking on Returns & Cancellations', () => {
    it('1.1 When order is cancelled, both parent produtos AND child produto_variantes must be replenished', () => {
      // Simulating a purchase of 2 units of Camisa Azul G
      const prod = sim.products.get('prod-camisa')!;
      const variant = sim.variants.get('var-camisa-azul-g')!;
      prod.estoque_disponivel -= 2;    // was 10 -> now 8
      variant.estoque_disponivel -= 2; // was 4 -> now 2

      sim.orders.set('ord-001', {
        id: 'ord-001',
        codigo_orcamento: 'PED-001',
        cliente_id: 'cli-buyer',
        status: 'pago',
        subtotal_bruto: 200.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 15.00,
        total_liquido: 215.00,
        forma_pagamento_loja: 'pix',
      });

      sim.orderItems.set('ord-001', [{
        id: 'item-001',
        orcamento_id: 'ord-001',
        tipo: 'produto',
        produto_id: 'prod-camisa',
        produto_variante_id: 'var-camisa-azul-g',
        quantidade: 2,
        valor_unitario: 100.00,
        total_bruto: 200.00,
      }]);

      expect(prod.estoque_disponivel).toBe(8);
      expect(variant.estoque_disponivel).toBe(2);

      const cancelRes = sim.cancelOrder('ord-001', 'cliente');
      expect(cancelRes.success).toBe(true);

      // Both must be fully restored
      expect(prod.estoque_disponivel).toBe(10);
      expect(variant.estoque_disponivel).toBe(4);

      // Audit movements logged for both
      const movements = sim.stockHistory.filter(h => h.referencia_id === 'ord-001');
      expect(movements).toHaveLength(2);
      expect(movements.some(m => m.produto_variante_id === 'var-camisa-azul-g' && m.quantidade === 2)).toBe(true);
    });

    it('1.2 When order with non-stock-tracked product is cancelled, stock is not perturbed', () => {
      const digitalProd = sim.products.get('prod-digital-ebook')!;

      sim.orders.set('ord-digital', {
        id: 'ord-digital',
        codigo_orcamento: 'PED-DIGITAL',
        cliente_id: 'cli-buyer',
        status: 'pago',
        subtotal_bruto: 50.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 50.00,
        forma_pagamento_loja: 'pix',
      });

      sim.orderItems.set('ord-digital', [{
        id: 'item-dig',
        orcamento_id: 'ord-digital',
        tipo: 'produto',
        produto_id: 'prod-digital-ebook',
        quantidade: 1,
        valor_unitario: 50.00,
        total_bruto: 50.00,
      }]);

      const cancelRes = sim.cancelOrder('ord-digital', 'cliente');
      expect(cancelRes.success).toBe(true);
      expect(digitalProd.estoque_disponivel).toBe(0);
    });

    it('1.3 When return reaches "concluido", returned merchandise must be returned to inventory (produtos & produto_variantes)', () => {
      const prod = sim.products.get('prod-tenis')!;
      const variant = sim.variants.get('var-tenis-42')!;
      // Purchased 1 unit -> stock decreased
      prod.estoque_disponivel = 7;
      variant.estoque_disponivel = 4;

      sim.orders.set('ord-tenis-01', {
        id: 'ord-tenis-01',
        codigo_orcamento: 'PED-TENIS-01',
        cliente_id: 'cli-buyer',
        status: 'concluido',
        subtotal_bruto: 200.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 200.00,
        forma_pagamento_loja: 'pix',
      });

      sim.orderItems.set('ord-tenis-01', [{
        id: 'item-tenis-01',
        orcamento_id: 'ord-tenis-01',
        tipo: 'produto',
        produto_id: 'prod-tenis',
        produto_variante_id: 'var-tenis-42',
        quantidade: 1,
        valor_unitario: 200.00,
        total_bruto: 200.00,
      }]);

      sim.solicitacoes.set('sol-ret-001', {
        id: 'sol-ret-001',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-tenis-01',
        tipo: 'devolucao',
        status: 'devolucao_recebida',
        itens_devolvidos: [{
          ordem_compra_id: 'oc-001',
          quantidade: 1,
          produto_id: 'prod-tenis',
          produto_variante_id: 'var-tenis-42',
        }],
        valor_diferenca: 0,
      });

      const res = sim.concludeReturn('sol-ret-001', 'credito_carteira');
      expect(res.success).toBe(true);

      // Parent AND child variant inventory must be incremented back
      expect(prod.estoque_disponivel).toBe(8);
      expect(variant.estoque_disponivel).toBe(5);

      // Check inventory audit log
      const hist = sim.stockHistory.find(h => h.referencia_id === 'sol-ret-001' && h.produto_variante_id === 'var-tenis-42');
      expect(hist).toBeDefined();
      expect(hist?.quantidade).toBe(1);
      expect(hist?.tipo).toBe('entrada');
    });

    it('1.4 Idempotency: Cancelling an already cancelled order or concluding an already concluded return must reject double replenishment', () => {
      sim.orders.set('ord-double', {
        id: 'ord-double',
        codigo_orcamento: 'PED-DOUBLE',
        cliente_id: 'cli-buyer',
        status: 'cancelado',
        subtotal_bruto: 100.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 100.00,
        forma_pagamento_loja: 'pix',
      });

      const cancelAgain = sim.cancelOrder('ord-double', 'cliente');
      expect(cancelAgain.success).toBe(false);
      expect(cancelAgain.error).toContain('já está cancelado');
    });
  });

  // =========================================================================
  // DOMAIN 2: EXCHANGE ITEM RESERVATION & STOCK BALANCE
  // =========================================================================
  describe('2. Exchange Item Reservation & Stock Balance', () => {
    it('2.1 Approving exchange for a substitute item must deduct/reserve its stock immediately from inventory', () => {
      const tenis = sim.products.get('prod-tenis')!;
      const tenisVar = sim.variants.get('var-tenis-42')!;
      expect(tenis.estoque_disponivel).toBe(8);
      expect(tenisVar.estoque_disponivel).toBe(5);

      sim.solicitacoes.set('sol-troca-001', {
        id: 'sol-troca-001',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-prev',
        tipo: 'troca',
        status: 'em_analise',
        itens_devolvidos: [{
          ordem_compra_id: 'oc-camisa',
          quantidade: 1,
          produto_id: 'prod-camisa',
          produto_variante_id: 'var-camisa-azul-g',
        }],
        opcao_substituicao: 'outro_produto',
        novos_produtos: [{
          produto_id: 'prod-tenis',
          produto_variante_id: 'var-tenis-42',
          quantidade: 1,
        }],
        valor_diferenca: 100.00,
      });

      const approveRes = sim.approveExchange('sol-troca-001');
      expect(approveRes.success).toBe(true);

      // Substitute item stock must be deducted upon approval
      expect(tenis.estoque_disponivel).toBe(7);
      expect(tenisVar.estoque_disponivel).toBe(4);
    });

    it('2.2 Exchange approval must fail and halt when substitute item lacks sufficient stock', () => {
      const tenisVar = sim.variants.get('var-tenis-42')!;
      tenisVar.estoque_disponivel = 0; // Out of stock

      sim.solicitacoes.set('sol-troca-sem-estoque', {
        id: 'sol-troca-sem-estoque',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-prev',
        tipo: 'troca',
        status: 'em_analise',
        itens_devolvidos: [{
          ordem_compra_id: 'oc-camisa',
          quantidade: 1,
          produto_id: 'prod-camisa',
        }],
        opcao_substituicao: 'outro_produto',
        novos_produtos: [{
          produto_id: 'prod-tenis',
          produto_variante_id: 'var-tenis-42',
          quantidade: 1,
        }],
        valor_diferenca: 100.00,
      });

      const res = sim.approveExchange('sol-troca-sem-estoque');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Estoque insuficiente');
    });

    it('2.3 Complete exchange lifecycle preserves net inventory balance (Returned +1, Substitute -1)', () => {
      const camisa = sim.products.get('prod-camisa')!;
      const camisaVar = sim.variants.get('var-camisa-azul-g')!;
      const tenis = sim.products.get('prod-tenis')!;
      const tenisVar = sim.variants.get('var-tenis-42')!;

      // Initial state
      const initialCamisaStock = camisaVar.estoque_disponivel; // 4
      const initialTenisStock = tenisVar.estoque_disponivel;   // 5

      sim.orders.set('ord-exchange-base', {
        id: 'ord-exchange-base',
        codigo_orcamento: 'PED-EXCH-01',
        cliente_id: 'cli-buyer',
        status: 'concluido',
        subtotal_bruto: 100.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 100.00,
        forma_pagamento_loja: 'pix',
      });

      sim.solicitacoes.set('sol-full-exchange', {
        id: 'sol-full-exchange',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-exchange-base',
        tipo: 'troca',
        status: 'em_analise',
        itens_devolvidos: [{
          ordem_compra_id: 'oc-camisa-ret',
          quantidade: 1,
          produto_id: 'prod-camisa',
          produto_variante_id: 'var-camisa-azul-g',
        }],
        opcao_substituicao: 'outro_produto',
        novos_produtos: [{
          produto_id: 'prod-tenis',
          produto_variante_id: 'var-tenis-42',
          quantidade: 1,
        }],
        valor_diferenca: 100.00,
      });

      // Step 1: Approve exchange -> Substitute item is deducted
      sim.approveExchange('sol-full-exchange');
      expect(tenisVar.estoque_disponivel).toBe(initialTenisStock - 1);

      // Step 2: Conclude exchange -> Returned item is restocked
      sim.concludeReturn('sol-full-exchange', 'credito_carteira');
      expect(camisaVar.estoque_disponivel).toBe(initialCamisaStock + 1);

      // Net inventory across warehouse is perfectly balanced
      expect((camisaVar.estoque_disponivel - initialCamisaStock) + (tenisVar.estoque_disponivel - initialTenisStock)).toBe(0);
    });
  });

  // =========================================================================
  // DOMAIN 3: ATOMIC REFUND FLOW
  // =========================================================================
  describe('3. Atomic Refund Flow & Ledger Integrity', () => {
    it('3.1 Marking return as "concluido" with wallet refund credits clientes.saldo_carteira and inserts ledger records atomically', () => {
      const buyer = sim.customers.get('cli-buyer')!;
      const initialWallet = buyer.saldo_carteira; // 20.00

      sim.orders.set('ord-ref-wallet', {
        id: 'ord-ref-wallet',
        codigo_orcamento: 'PED-REF-W',
        cliente_id: 'cli-buyer',
        status: 'concluido',
        subtotal_bruto: 100.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 100.00,
        forma_pagamento_loja: 'cartao',
      });

      sim.orderItems.set('ord-ref-wallet', [{
        id: 'it-w-01',
        orcamento_id: 'ord-ref-wallet',
        tipo: 'produto',
        produto_id: 'prod-camisa',
        quantidade: 1,
        valor_unitario: 100.00,
        total_bruto: 100.00,
      }]);

      sim.solicitacoes.set('sol-ref-w-01', {
        id: 'sol-ref-w-01',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-ref-wallet',
        tipo: 'devolucao',
        status: 'devolucao_recebida',
        itens_devolvidos: [{
          ordem_compra_id: 'it-w-01',
          quantidade: 1,
          produto_id: 'prod-camisa',
        }],
        valor_diferenca: 0,
      });

      const res = sim.concludeReturn('sol-ref-w-01', 'credito_carteira');
      expect(res.success).toBe(true);

      // Customer wallet must be credited with R$ 100.00
      expect(buyer.saldo_carteira).toBe(initialWallet + 100.00);

      // Ledger must contain credit entry
      const walletEntry = sim.walletLedger.find(l => l.cliente_id === buyer.id && l.descricao.includes('sol-ref-w-01'));
      expect(walletEntry).toBeDefined();
      expect(walletEntry?.valor).toBe(100.00);
      expect(walletEntry?.tipo).toBe('credito');

      // Refund table must have a paid record linked to solicitacao
      const refund = Array.from(sim.refunds.values()).find(r => r.solicitacao_id === 'sol-ref-w-01');
      expect(refund).toBeDefined();
      expect(refund?.status).toBe('pago');
      expect(refund?.metodo_reembolso).toBe('credito_carteira');
      expect(refund?.valor_reembolso).toBe(100.00);
    });

    it('3.2 Marking return as "concluido" with external gateway/PIX creates a pendente refund in loja_reembolsos', () => {
      sim.orders.set('ord-ref-ext', {
        id: 'ord-ref-ext',
        codigo_orcamento: 'PED-REF-EXT',
        cliente_id: 'cli-buyer',
        status: 'concluido',
        subtotal_bruto: 100.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 100.00,
        forma_pagamento_loja: 'pix',
      });

      sim.orderItems.set('ord-ref-ext', [{
        id: 'it-ext-01',
        orcamento_id: 'ord-ref-ext',
        tipo: 'produto',
        produto_id: 'prod-camisa',
        quantidade: 1,
        valor_unitario: 100.00,
        total_bruto: 100.00,
      }]);

      sim.solicitacoes.set('sol-ref-ext-01', {
        id: 'sol-ref-ext-01',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-ref-ext',
        tipo: 'devolucao',
        status: 'devolucao_recebida',
        itens_devolvidos: [{
          ordem_compra_id: 'it-ext-01',
          quantidade: 1,
          produto_id: 'prod-camisa',
        }],
        valor_diferenca: 0,
      });

      const res = sim.concludeReturn('sol-ref-ext-01', 'gateway_externo');
      expect(res.success).toBe(true);

      const refund = Array.from(sim.refunds.values()).find(r => r.solicitacao_id === 'sol-ref-ext-01');
      expect(refund).toBeDefined();
      expect(refund?.status).toBe('pendente');
      expect(refund?.valor_reembolso).toBe(100.00);
    });
  });

  // =========================================================================
  // DOMAIN 4: LOYALTY & REFERRAL BONUS REVERSAL (Anti-Exploit Protection)
  // =========================================================================
  describe('4. Loyalty & Referral Bonus Reversal (Clawback & Anti-Exploit)', () => {
    it('4.1 Cancelling an order revokes points earned on the purchase from buyer', () => {
      const buyer = sim.customers.get('cli-buyer')!;
      const initialPoints = buyer.saldo_pontos; // 150

      sim.orders.set('ord-loyalty-cancel', {
        id: 'ord-loyalty-cancel',
        codigo_orcamento: 'PED-LOYALTY',
        cliente_id: 'cli-buyer',
        status: 'pago',
        subtotal_bruto: 100.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 100.00, // Generated 100 points
        forma_pagamento_loja: 'pix',
      });

      sim.orderItems.set('ord-loyalty-cancel', [{
        id: 'it-loyalty',
        orcamento_id: 'ord-loyalty-cancel',
        tipo: 'produto',
        produto_id: 'prod-camisa',
        quantidade: 1,
        valor_unitario: 100.00,
        total_bruto: 100.00,
      }]);

      // Buyer had 150 + 100 = 250 points after order
      buyer.saldo_pontos += 100;
      buyer.pontos_totais += 100;

      const res = sim.cancelOrder('ord-loyalty-cancel', 'cliente');
      expect(res.success).toBe(true);

      // Points must be clawed back to original 150
      expect(buyer.saldo_pontos).toBe(initialPoints);
      expect(buyer.pontos_totais).toBe(initialPoints);

      const clawbackLog = sim.pointsLedger.find(p => p.cliente_id === buyer.id && p.pontos === -100);
      expect(clawbackLog).toBeDefined();
      expect(clawbackLog?.tipo).toBe('estorno_credito');
    });

    it('4.2 Cancelling an order claws back referral cash bonus from the referrer', () => {
      const referrer = sim.customers.get('cli-referrer')!;
      const initialReferrerWallet = referrer.saldo_carteira; // 50.00

      sim.orders.set('ord-referral-cancel', {
        id: 'ord-referral-cancel',
        codigo_orcamento: 'PED-REF-BONUS',
        cliente_id: 'cli-buyer', // Buyer indicated by cli-referrer
        status: 'pago',
        subtotal_bruto: 200.00,
        desconto_cupom: 0,
        desconto_promocional: 0,
        desconto_pontos: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 200.00,
        forma_pagamento_loja: 'pix',
      });

      sim.orderItems.set('ord-referral-cancel', [{
        id: 'it-ref-b',
        orcamento_id: 'ord-referral-cancel',
        tipo: 'produto',
        produto_id: 'prod-camisa',
        quantidade: 2,
        valor_unitario: 100.00,
        total_bruto: 200.00,
      }]);

      // Referrer was awarded R$ 20.00 cash bonus
      referrer.saldo_carteira += 20.00; // Now 70.00

      const res = sim.cancelOrder('ord-referral-cancel', 'cliente');
      expect(res.success).toBe(true);

      // Referrer cash bonus must be clawed back to original 50.00
      expect(referrer.saldo_carteira).toBe(initialReferrerWallet);

      const debitLedger = sim.walletLedger.find(w => w.cliente_id === referrer.id && w.tipo === 'debito');
      expect(debitLedger).toBeDefined();
      expect(debitLedger?.valor).toBe(20.00);
    });

    it('4.3 Anti-Exploit Loop Test: 5 repeated buy-and-cancel cycles result in exactly 0 net points and 0 net cash gained', () => {
      const buyer = sim.customers.get('cli-buyer')!;
      const referrer = sim.customers.get('cli-referrer')!;

      const startBuyerPoints = buyer.saldo_pontos;
      const startBuyerWallet = buyer.saldo_carteira;
      const startReferrerWallet = referrer.saldo_carteira;

      for (let i = 1; i <= 5; i++) {
        const orderId = `ord-loop-${i}`;
        // Place order
        buyer.saldo_pontos += 100;
        buyer.pontos_totais += 100;
        referrer.saldo_carteira += 10.00;

        sim.orders.set(orderId, {
          id: orderId,
          codigo_orcamento: `PED-LOOP-${i}`,
          cliente_id: 'cli-buyer',
          status: 'pago',
          subtotal_bruto: 100.00,
          desconto_cupom: 0,
          desconto_promocional: 0,
          desconto_pontos: 0,
          abatimento_carteira: 0,
          valor_frete: 0,
          total_liquido: 100.00,
          forma_pagamento_loja: 'pix',
        });

        sim.orderItems.set(orderId, [{
          id: `it-loop-${i}`,
          orcamento_id: orderId,
          tipo: 'produto',
          produto_id: 'prod-camisa',
          quantidade: 1,
          valor_unitario: 100.00,
          total_bruto: 100.00,
        }]);

        // Cancel order immediately
        const cancelRes = sim.cancelOrder(orderId, 'cliente');
        expect(cancelRes.success).toBe(true);
      }

      // Assert zero net drift across all accounts
      expect(buyer.saldo_pontos).toBe(startBuyerPoints);
      expect(buyer.saldo_carteira).toBe(startBuyerWallet);
      expect(referrer.saldo_carteira).toBe(startReferrerWallet);
    });
  });

  // =========================================================================
  // DOMAIN 5: PARTIAL RETURN PROPORTIONAL DISCOUNT APPORTIONMENT
  // =========================================================================
  describe('5. Partial Return Proportional Apportionment', () => {
    it('5.1 Multi-item cart with coupon: Returning 1 of 2 equal items refunds exactly 50% of net paid, NOT full gross price', () => {
      // Item 1: R$ 100, Item 2: R$ 100. Subtotal: R$ 200.
      // Coupon: R$ 80.00 OFF. Net Paid: R$ 120.00.
      const itemGross = 100.00;
      const orderGross = 200.00;
      const totalDiscounts = 80.00;

      const proportionalRefund = calculateItemProportionalRefund(itemGross, orderGross, totalDiscounts);

      // Expected: 100 * (120 / 200) = R$ 60.00
      expect(proportionalRefund).toBe(60.00);
      expect(proportionalRefund).not.toBe(100.00); // Exposes gross price arbitrage exploit
    });

    it('5.2 Multi-item uneven basket: Proportional distribution preserves line ratio', () => {
      // Item A: R$ 100, Item B: R$ 300. Subtotal: R$ 400.
      // 25% order discount (R$ 100 OFF). Net Paid: R$ 300.
      const refundA = calculateItemProportionalRefund(100.00, 400.00, 100.00);
      const refundB = calculateItemProportionalRefund(300.00, 400.00, 100.00);

      expect(refundA).toBe(75.00);
      expect(refundB).toBe(225.00);
      expect(refundA + refundB).toBe(300.00);
    });

    it('5.3 Promotional Buy-X-Get-Y (Leve 3 Pague 2): Each returned unit refunds 1/3 of total paid', () => {
      // 3 items at R$ 60 each = R$ 180 gross. Promo discount = R$ 60. Net Paid = R$ 120.
      const refund1 = calculateItemProportionalRefund(60.00, 180.00, 60.00);
      expect(refund1).toBe(40.00);

      // Apportion all 3 items sequentially
      const { itemRefunds, totalRefund } = apportionMultiItemRefund(
        [
          { id: 'it-1', grossTotal: 60.00 },
          { id: 'it-2', grossTotal: 60.00 },
          { id: 'it-3', grossTotal: 60.00 },
        ],
        180.00,
        60.00
      );

      expect(totalRefund).toBe(120.00);
      expect(itemRefunds.get('it-1')).toBe(40.00);
      expect(itemRefunds.get('it-2')).toBe(40.00);
      expect(itemRefunds.get('it-3')).toBe(40.00);
    });

    it('5.4 Penny balancing: Odd division penny rounding never leaks funds', () => {
      // 3 items at R$ 33.33 gross = R$ 100.00 gross. Discount = R$ 0. Net Paid = R$ 100.
      const { itemRefunds, totalRefund } = apportionMultiItemRefund(
        [
          { id: 'it-1', grossTotal: 33.33 },
          { id: 'it-2', grossTotal: 33.33 },
          { id: 'it-3', grossTotal: 33.34 },
        ],
        100.00,
        0
      );

      expect(totalRefund).toBe(100.00);
      expect(itemRefunds.get('it-1')).toBe(33.33);
      expect(itemRefunds.get('it-2')).toBe(33.33);
      expect(itemRefunds.get('it-3')).toBe(33.34);
    });

    it('5.5 100% Discount via points/coupons results in 0.00 refund credit on return', () => {
      // 1 item of R$ 150 paid 100% by loyalty points (R$ 150 discount)
      const refund = calculateItemProportionalRefund(150.00, 150.00, 150.00);
      expect(refund).toBe(0.00);
    });

    it('5.6 Multi-unit line item partial return: Returning 3 of 10 units calculates exact proportional slice', () => {
      // 10 units at R$ 20 = R$ 200 gross. Order had R$ 50 coupon. Net = R$ 150.
      // Customer returns 3 units = R$ 60 gross.
      const refund3Units = calculateItemProportionalRefund(60.00, 200.00, 50.00);
      // Expected: 60 * (150 / 200) = R$ 45.00
      expect(refund3Units).toBe(45.00);
    });
  });

  // =========================================================================
  // DOMAIN 6: AUTHORIZATION & RLS HARDENING
  // =========================================================================
  describe('6. Authorization & RLS Hardening (loja_solicitacoes)', () => {
    it('6.1 Non-admin client directly updating status to "concluido" must be rejected by RLS policy', () => {
      sim.solicitacoes.set('sol-tamper', {
        id: 'sol-tamper',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-01',
        tipo: 'devolucao',
        status: 'em_analise',
        itens_devolvidos: [],
        valor_diferenca: 150.00,
      });

      // Malicious client opens console and calls supabase.from('loja_solicitacoes').update({ status: 'concluido' })
      const mutation = sim.attemptClientDirectMutation(
        'cliente',
        'cli-buyer',
        'sol-tamper',
        { status: 'concluido' }
      );

      expect(mutation.allowed).toBe(false);
      expect(mutation.error).toContain('RLS VIOLATION');

      // Status must remain em_analise
      expect(sim.solicitacoes.get('sol-tamper')?.status).toBe('em_analise');
    });

    it('6.2 Non-admin client directly tampering with valor_diferenca must be rejected by RLS policy', () => {
      sim.solicitacoes.set('sol-tamper-diff', {
        id: 'sol-tamper-diff',
        cliente_id: 'cli-buyer',
        orcamento_origem_id: 'ord-01',
        tipo: 'troca',
        status: 'em_analise',
        itens_devolvidos: [],
        valor_diferenca: 150.00,
      });

      const mutation = sim.attemptClientDirectMutation(
        'cliente',
        'cli-buyer',
        'sol-tamper-diff',
        { valor_diferenca: 0 } // Attempting to zero out the required payment
      );

      expect(mutation.allowed).toBe(false);
      expect(mutation.error).toContain('RLS VIOLATION');
      expect(sim.solicitacoes.get('sol-tamper-diff')?.valor_diferenca).toBe(150.00);
    });

    it('6.3 Client actor attempting to access or modify another client\'s return request is strictly blocked', () => {
      sim.solicitacoes.set('sol-other-client', {
        id: 'sol-other-client',
        cliente_id: 'cli-other',
        orcamento_origem_id: 'ord-02',
        tipo: 'devolucao',
        status: 'em_analise',
        itens_devolvidos: [],
        valor_diferenca: 0,
      });

      const mutation = sim.attemptClientDirectMutation(
        'cliente',
        'cli-buyer', // Different actor
        'sol-other-client',
        { status: 'concluido' }
      );

      expect(mutation.allowed).toBe(false);
      expect(mutation.error).toContain('Acesso negado');
    });
  });

  // =========================================================================
  // DOMAIN 7: STATIC REPOSITORY CODEBASE CONTRACT AUDITING
  // =========================================================================
  describe('7. Static Codebase Auditing & Known Bug Verification', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

    it('7.1 Verify that cancellation migration 20260714056100 targets parent produtos and lacks produto_variantes (BUG-01 Documentation)', () => {
      const migPath = path.join(migrationsDir, '20260714056100_secure_store_invoice_and_cancellation.sql');
      expect(fs.existsSync(migPath), 'Migration 20260714056100 must exist').toBe(true);

      const content = fs.readFileSync(migPath, 'utf8');

      // Observation B from Explorer: parent produtos is updated
      expect(content).toContain('UPDATE public.produtos p');
      expect(content).toContain('SET estoque_disponivel = p.estoque_disponivel + quantities.quantity');

      // Verifies that original migration lacked child variant restoration
      const hasVariantUpdateInCancel = /UPDATE\s+(?:public\.)?produto_variantes/i.test(
        content.slice(content.indexOf('gsa_client_cancel_store_order'), content.indexOf('gsa_admin_cancel_store_order') + 1500)
      );
      expect(hasVariantUpdateInCancel, 'Legacy cancellation lacks variant restocking (documenting BUG-RET-01)').toBe(false);
    });

    it('7.2 Verify that admin exchange RPC 20260714045000 lacks stock replenishment and refund creation on status "concluido" (BUG-02 Documentation)', () => {
      const migPath = path.join(migrationsDir, '20260714045000_secure_admin_store_exchange_rpc.sql');
      expect(fs.existsSync(migPath), 'Migration 20260714045000 must exist').toBe(true);

      const content = fs.readFileSync(migPath, 'utf8');

      // Verifies gsa_admin_atualizar_solicitacao_loja definition exists
      expect(content).toContain('gsa_admin_atualizar_solicitacao_loja');

      // Verifies absence of stock restoration on return completion in legacy RPC
      expect(content).not.toContain('estoque_disponivel = p.estoque_disponivel +');
      expect(content).not.toContain('INSERT INTO public.loja_reembolsos');
    });

    it('7.3 Verify that admin security migration 20260830030000 currently contains overly permissive FOR ALL policy on loja_solicitacoes (BUG-03 Documentation)', () => {
      const migPath = path.join(migrationsDir, '20260830030000_admin_panel_security_end_to_end.sql');
      expect(fs.existsSync(migPath), 'Migration 20260830030000 must exist').toBe(true);

      const content = fs.readFileSync(migPath, 'utf8');

      // Line 620 from Explorer: FOR ALL TO authenticated on loja_solicitacoes
      expect(content).toContain('CREATE POLICY gsa_client_own_loja_solicitacoes_hardened ON public.loja_solicitacoes FOR ALL TO authenticated');
    });

    it('7.4 Verify that LojaTrocasModule.tsx currently performs direct update without atomic inventory or refund procedure (BUG-04 Documentation)', () => {
      const compPath = path.resolve(process.cwd(), 'src/components/admin/LojaTrocasModule.tsx');
      expect(fs.existsSync(compPath), 'LojaTrocasModule.tsx must exist').toBe(true);

      const content = fs.readFileSync(compPath, 'utf8');

      // Verifies handleUpdateAdvancedStatus performs raw table update
      expect(content).toContain(".from('loja_solicitacoes')");
      expect(content).toContain('status: targetStatus');
    });
  });
});

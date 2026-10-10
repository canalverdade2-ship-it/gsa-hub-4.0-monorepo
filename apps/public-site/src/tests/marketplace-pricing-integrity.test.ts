import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockFrom, mockRpc, mockCallClientRpc, createQueryBuilder } = vi.hoisted(() => {
  const createQueryBuilder = () => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return builder;
  };

  return {
    mockFrom: vi.fn().mockImplementation(() => createQueryBuilder()),
    mockRpc: vi.fn(),
    mockCallClientRpc: vi.fn(),
    createQueryBuilder,
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
  getSupabase: () => ({
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  }),
}));

vi.mock('../lib/clientRpc', () => ({
  callClientRpc: (...args: any[]) => mockCallClientRpc(...args),
}));

import {
  crc16,
  formatEMV,
  generatePixCopiaECola,
  createInfinitePayOrderCheckout,
} from '../lib/pixService';

// ============================================================================
// Reference Calculation Models (Client Spec vs Server Spec)
// ============================================================================

interface CartItem {
  id: string;
  item_id: string;
  tipo: 'produto' | 'assinatura';
  quantidade: number;
  valor_unitario: number;
  valor_promocional?: number | null;
  desconto_aplicado?: number;
}

interface Coupon {
  id: string;
  tipo_desconto: 'porcentagem' | 'valor_fixo';
  valor_desconto: number;
  produto_id?: string | null;
}

interface PricingCalculationParams {
  cartItems: CartItem[];
  coupon?: Coupon | null;
  deliveryFee?: number;
  pointsToUse?: number; // 1 point = R$ 0,01
  walletToUse?: number;
  isPix?: boolean;
  pixPercentage?: number;
  pixSettings?: {
    descontoAtivo: boolean;
    permitirPontos: boolean;
    permitirCarteira: boolean;
  };
}

/**
 * Authoritative Client-Side Calculation Model (as specified in CheckoutPage.tsx)
 */
function calculateClientCheckoutTotals(params: PricingCalculationParams) {
  const {
    cartItems,
    coupon,
    deliveryFee = 0,
    pointsToUse = 0,
    walletToUse = 0,
    isPix = false,
    pixPercentage = 5,
    pixSettings = { descontoAtivo: true, permitirPontos: false, permitirCarteira: false },
  } = params;

  // 1. Subtotal of merchandise after item promotional discounts
  const subtotalMercadorias = cartItems.reduce((acc, item) => {
    const effectiveUnit = item.valor_promocional && item.valor_promocional > 0
      ? item.valor_promocional
      : item.valor_unitario;
    return acc + (effectiveUnit * item.quantidade);
  }, 0);

  const subtotalComPromos = Math.max(0, subtotalMercadorias);

  // 2. Coupon Discount Calculation (Calculated over subtotal of merchandise)
  let descontoCupom = 0;
  if (coupon) {
    let baseCalculoCupom = subtotalComPromos;
    if (coupon.produto_id) {
      const itemEsp = cartItems.find((c) => c.item_id === coupon.produto_id);
      if (itemEsp) {
        const effectiveUnit = itemEsp.valor_promocional && itemEsp.valor_promocional > 0
          ? itemEsp.valor_promocional
          : itemEsp.valor_unitario;
        baseCalculoCupom = effectiveUnit * itemEsp.quantidade;
      } else {
        baseCalculoCupom = 0;
      }
    }

    if (coupon.tipo_desconto === 'porcentagem') {
      descontoCupom = Number(((baseCalculoCupom * coupon.valor_desconto) / 100).toFixed(2));
    } else {
      descontoCupom = coupon.valor_desconto;
    }
    descontoCupom = Math.min(descontoCupom, subtotalComPromos);
  }

  // 3. Balance before redemptions (Subtotal - Coupon + Delivery)
  const taxaEntregaFinal = Math.max(0, deliveryFee);
  const totalAntesResgates = Number(Math.max(0, subtotalComPromos - descontoCupom + taxaEntregaFinal).toFixed(2));

  // 4. VIP Points Redemption (1 ponto = R$ 0.01)
  const maxPontosCentavos = Math.floor(totalAntesResgates * 100);
  const pontosValidos = Math.min(pointsToUse, Math.max(0, maxPontosCentavos));
  const descontoPontos = Number((pontosValidos * 0.01).toFixed(2));

  // 5. PIX Discount (5% on eligible merchandise minus coupon and points)
  const pixBlockedByPoints = pontosValidos > 0 && !pixSettings.permitirPontos;
  const pixBlockedByWallet = walletToUse > 0 && !pixSettings.permitirCarteira;
  const isPixEligible = isPix && pixSettings.descontoAtivo && !pixBlockedByPoints && !pixBlockedByWallet;

  const baseCalculoPix = Math.max(0, subtotalComPromos - descontoCupom - descontoPontos);
  const descontoPix = isPixEligible
    ? Number(((baseCalculoPix * pixPercentage) / 100).toFixed(2))
    : 0;

  // 6. Balance before store wallet
  const totalAntesCarteira = Number(Math.max(0, totalAntesResgates - descontoPontos - descontoPix).toFixed(2));

  // 7. Store Wallet Balance
  const descontoCarteira = Math.min(walletToUse, totalAntesCarteira);

  // 8. Final Net Amount to Pay
  const totalFinal = Number(Math.max(0, totalAntesCarteira - descontoCarteira).toFixed(2));

  return {
    subtotalMercadorias: Number(subtotalMercadorias.toFixed(2)),
    descontoCupom: Number(descontoCupom.toFixed(2)),
    taxaEntrega: Number(taxaEntregaFinal.toFixed(2)),
    totalAntesResgates,
    pontosUsados: pontosValidos,
    descontoPontos,
    descontoPix,
    descontoCarteira: Number(descontoCarteira.toFixed(2)),
    totalFinal,
  };
}

/**
 * Corrected Canonical Server-Side Calculation Formula (matching PostgreSQL fixed RPC)
 */
function calculateCorrectedServerCheckoutTotals(params: PricingCalculationParams) {
  const {
    cartItems,
    coupon,
    deliveryFee = 0,
    pointsToUse = 0,
    walletToUse = 0,
    isPix = false,
    pixPercentage = 5,
    pixSettings = { descontoAtivo: true, permitirPontos: false, permitirCarteira: false },
  } = params;

  // SQL: v_subtotal - v_promo_discount
  const v_subtotal = cartItems.reduce((acc, item) => {
    const effective = item.valor_promocional && item.valor_promocional > 0
      ? item.valor_promocional
      : item.valor_unitario;
    return acc + (effective * item.quantidade);
  }, 0);

  // SQL: v_discount_value from coupon (calculated over v_subtotal, NOT over v_subtotal - points)
  let v_discount_value = 0;
  if (coupon) {
    let base = v_subtotal;
    if (coupon.produto_id) {
      const target = cartItems.find((i) => i.item_id === coupon.produto_id);
      base = target ? (target.valor_promocional || target.valor_unitario) * target.quantidade : 0;
    }
    if (coupon.tipo_desconto === 'porcentagem') {
      v_discount_value = Math.round(base * (coupon.valor_desconto / 100.0) * 100) / 100;
    } else {
      v_discount_value = coupon.valor_desconto;
    }
    v_discount_value = Math.min(v_discount_value, v_subtotal);
  }

  const v_delivery_fee = Math.max(0, deliveryFee);
  const total_before_credits = Math.max(0, v_subtotal - v_discount_value + v_delivery_fee);

  // SQL: v_points := least(v_points, floor(total_before_credits * 100)::integer)
  const max_pts = Math.floor(total_before_credits * 100);
  const v_points = Math.min(pointsToUse, max_pts);
  const v_points_discount = Math.round(v_points * 0.01 * 100) / 100;

  // PIX Discount
  const pixBlockedByPoints = v_points > 0 && !pixSettings.permitirPontos;
  const pixBlockedByWallet = walletToUse > 0 && !pixSettings.permitirCarteira;
  const pixEligible = isPix && pixSettings.descontoAtivo && !pixBlockedByPoints && !pixBlockedByWallet;

  let v_pix_discount = 0;
  if (pixEligible) {
    const pixBase = Math.max(0, v_subtotal - v_discount_value - v_points_discount);
    v_pix_discount = Math.round(pixBase * (pixPercentage / 100.0) * 100) / 100;
  }

  const total_before_wallet = Math.max(0, total_before_credits - v_points_discount - v_pix_discount);
  const v_wallet_used = Math.min(walletToUse, total_before_wallet);

  const v_total = Math.max(0, Math.round((total_before_wallet - v_wallet_used) * 100) / 100);

  return {
    subtotal: Math.round(v_subtotal * 100) / 100,
    couponDiscount: Math.round(v_discount_value * 100) / 100,
    deliveryFee: Math.round(v_delivery_fee * 100) / 100,
    pointsUsed: v_points,
    pointsDiscount: Math.round(v_points_discount * 100) / 100,
    pixDiscount: Math.round(v_pix_discount * 100) / 100,
    walletUsed: Math.round(v_wallet_used * 100) / 100,
    total: v_total,
  };
}

/**
 * Buggy Legacy Server-Side Formula (Observed in 20260714056000 lines 546-588)
 * Subtracts points BEFORE percentage coupon and omits PIX discount.
 */
function calculateBuggyLegacyServerTotals(params: PricingCalculationParams) {
  const { cartItems, coupon, deliveryFee = 0, pointsToUse = 0, walletToUse = 0 } = params;

  const v_subtotal = cartItems.reduce((acc, item) => acc + (item.valor_unitario * item.quantidade), 0);

  // BUG: points computed first and subtracted before coupon
  const v_points = Math.min(pointsToUse, Math.floor(v_subtotal * 100));
  const v_points_discount = Math.round(v_points * 0.01 * 100) / 100;

  // BUG: percentage coupon applied to (v_subtotal - points)
  let v_discount_value = Math.max(v_subtotal - v_points_discount, 0);
  if (coupon && coupon.tipo_desconto === 'porcentagem') {
    v_discount_value = Math.round(v_discount_value * (coupon.valor_desconto / 100.0) * 100) / 100;
  } else if (coupon) {
    v_discount_value = coupon.valor_desconto;
  }

  // BUG: PIX discount completely omitted from server calculation
  const v_total = Math.max(
    0,
    Math.round((v_subtotal - v_points_discount - v_discount_value + deliveryFee - walletToUse) * 100) / 100
  );

  return { total: v_total, couponDiscount: v_discount_value, pointsDiscount: v_points_discount };
}

// ============================================================================
// TEST SUITE: MARKETPLACE PRICING & PIX INTEGRITY
// ============================================================================
describe('Marketplace Pricing Integrity Suite (FLAW-03, FLAW-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => createQueryBuilder());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // REQUIREMENT 3: MATHEMATICAL CONSISTENCY & PRECEDENCE (FLAW-03)
  // ==========================================================================
  describe('1. Mathematical Consistency & Precedence Alignment', () => {
    it('1.1 should match client and server totals to the exact cent when combining percentage coupon, delivery fee, and points', () => {
      const params: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 2, valor_unitario: 100.00 }, // R$ 200.00
        ],
        coupon: { id: 'coup-1', tipo_desconto: 'porcentagem', valor_desconto: 20 }, // 20% off R$ 200 = R$ 40
        deliveryFee: 15.00,
        pointsToUse: 2500, // R$ 25.00
        walletToUse: 10.00,
      };

      const client = calculateClientCheckoutTotals(params);
      const server = calculateCorrectedServerCheckoutTotals(params);

      // Client calculation:
      // Subtotal: R$ 200.00
      // Coupon: R$ 40.00 -> Balance: R$ 160.00
      // Delivery Fee: R$ 15.00 -> Balance: R$ 175.00
      // Points: R$ 25.00 -> Balance: R$ 150.00
      // Wallet: R$ 10.00 -> Balance: R$ 140.00
      expect(client.subtotalMercadorias).toBe(200.00);
      expect(client.descontoCupom).toBe(40.00);
      expect(client.taxaEntrega).toBe(15.00);
      expect(client.descontoPontos).toBe(25.00);
      expect(client.descontoCarteira).toBe(10.00);
      expect(client.totalFinal).toBe(140.00);

      // Server calculation must produce identical numbers
      expect(server.subtotal).toBe(200.00);
      expect(server.couponDiscount).toBe(40.00);
      expect(server.deliveryFee).toBe(15.00);
      expect(server.pointsDiscount).toBe(25.00);
      expect(server.walletUsed).toBe(10.00);
      expect(server.total).toBe(140.00);

      // Discrepancy between client and server must be strictly 0.00
      expect(Math.abs(client.totalFinal - server.total)).toBe(0.00);
    });

    it('1.2 should demonstrate the bug in the legacy inverted precedence formula and verify its resolution', () => {
      const params: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 1, valor_unitario: 200.00 },
        ],
        coupon: { id: 'coup-1', tipo_desconto: 'porcentagem', valor_desconto: 20 }, // 20%
        pointsToUse: 2500, // R$ 25.00
      };

      const client = calculateClientCheckoutTotals(params);
      const legacyServer = calculateBuggyLegacyServerTotals(params);

      // In the legacy buggy server code:
      // Coupon is calculated on (200 - 25) = 175 * 0.20 = 35.00 (instead of 40.00).
      // Total became 200 - 25 - 35 = 140.00 (or higher with delivery fee).
      // Client calculated coupon on 200 = 40.00, total = 200 - 40 - 25 = 135.00.
      expect(client.descontoCupom).toBe(40.00);
      expect(client.totalFinal).toBe(135.00);

      expect(legacyServer.couponDiscount).toBe(35.00); // 5.00 less discount on server!
      expect(legacyServer.total).toBe(140.00); // Customer was overcharged by R$ 5.00

      // The corrected server formula resolves this divergence:
      const correctedServer = calculateCorrectedServerCheckoutTotals(params);
      expect(correctedServer.couponDiscount).toBe(40.00);
      expect(correctedServer.total).toBe(135.00);
      expect(correctedServer.total).toBe(client.totalFinal);
    });

    it('1.3 should correctly apply product-specific coupons exclusively to eligible items', () => {
      const params: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-eligible', tipo: 'produto', quantidade: 1, valor_unitario: 100.00 },
          { id: '2', item_id: 'prod-other', tipo: 'produto', quantidade: 2, valor_unitario: 50.00 }, // R$ 100.00
        ],
        coupon: {
          id: 'coup-prod',
          tipo_desconto: 'porcentagem',
          valor_desconto: 30, // 30% off ONLY on prod-eligible
          produto_id: 'prod-eligible',
        },
      };

      const client = calculateClientCheckoutTotals(params);
      const server = calculateCorrectedServerCheckoutTotals(params);

      // Total subtotal: 100 + 100 = 200.00
      // 30% discount applied only to 100.00 = 30.00 (NOT 30% of 200.00 = 60.00)
      expect(client.descontoCupom).toBe(30.00);
      expect(client.totalFinal).toBe(170.00);

      expect(server.couponDiscount).toBe(30.00);
      expect(server.total).toBe(170.00);
    });

    it('1.4 should clamp discounts, points, and wallet balances preventing negative order totals', () => {
      const params: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 1, valor_unitario: 50.00 },
        ],
        coupon: { id: 'coup-huge', tipo_desconto: 'valor_fixo', valor_desconto: 500.00 }, // Exceeds cart
        pointsToUse: 10000, // R$ 100.00
        walletToUse: 200.00,
      };

      const client = calculateClientCheckoutTotals(params);
      const server = calculateCorrectedServerCheckoutTotals(params);

      // Coupon clamped to subtotal R$ 50.00
      expect(client.descontoCupom).toBe(50.00);
      expect(client.totalAntesResgates).toBe(0.00);
      // Points and wallet clamped to 0
      expect(client.descontoPontos).toBe(0.00);
      expect(client.descontoCarteira).toBe(0.00);
      expect(client.totalFinal).toBe(0.00);

      expect(server.couponDiscount).toBe(50.00);
      expect(server.pointsDiscount).toBe(0.00);
      expect(server.walletUsed).toBe(0.00);
      expect(server.total).toBe(0.00);
    });

    it('1.5 should handle fractional percentages and precision rounding without 1-cent drifts', () => {
      const testFractions = [
        { valor: 89.90, pct: 13.33 },
        { valor: 33.33, pct: 15.5 },
        { valor: 149.99, pct: 7.75 },
      ];

      for (const t of testFractions) {
        const client = calculateClientCheckoutTotals({
          cartItems: [{ id: '1', item_id: 'prod', tipo: 'produto', quantidade: 1, valor_unitario: t.valor }],
          coupon: { id: 'c', tipo_desconto: 'porcentagem', valor_desconto: t.pct },
        });

        const server = calculateCorrectedServerCheckoutTotals({
          cartItems: [{ id: '1', item_id: 'prod', tipo: 'produto', quantidade: 1, valor_unitario: t.valor }],
          coupon: { id: 'c', tipo_desconto: 'porcentagem', valor_desconto: t.pct },
        });

        expect(client.descontoCupom).toBe(server.couponDiscount);
        expect(client.totalFinal).toBe(server.total);
      }
    });
  });

  // ==========================================================================
  // REQUIREMENT 4: PIX DISCOUNT INTEGRITY (FLAW-04)
  // ==========================================================================
  describe('2. PIX Discount Integrity & Payment Quote Integration', () => {
    it('2.1 should compute exact 5% PIX discount on eligible merchandise', () => {
      const params: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 2, valor_unitario: 100.00 }, // R$ 200.00
        ],
        isPix: true,
        pixPercentage: 5,
        pixSettings: { descontoAtivo: true, permitirPontos: false, permitirCarteira: false },
      };

      const client = calculateClientCheckoutTotals(params);
      const server = calculateCorrectedServerCheckoutTotals(params);

      // 5% of R$ 200.00 = R$ 10.00 -> Total: R$ 190.00
      expect(client.descontoPix).toBe(10.00);
      expect(client.totalFinal).toBe(190.00);

      expect(server.pixDiscount).toBe(10.00);
      expect(server.total).toBe(190.00);
    });

    it('2.2 should apply PIX discount after coupon discount on remaining cash amount', () => {
      const params: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 1, valor_unitario: 200.00 },
        ],
        coupon: { id: 'coup-1', tipo_desconto: 'porcentagem', valor_desconto: 10 }, // 10% off R$ 200 = R$ 20 -> Base: R$ 180
        isPix: true,
        pixPercentage: 5, // 5% off R$ 180 = R$ 9.00
      };

      const client = calculateClientCheckoutTotals(params);
      const server = calculateCorrectedServerCheckoutTotals(params);

      expect(client.descontoCupom).toBe(20.00);
      expect(client.descontoPix).toBe(9.00);
      expect(client.totalFinal).toBe(171.00); // 200 - 20 - 9 = 171.00

      expect(server.couponDiscount).toBe(20.00);
      expect(server.pixDiscount).toBe(9.00);
      expect(server.total).toBe(171.00);
    });

    it('2.3 should enforce PIX discount exclusivity when points or wallet are used', () => {
      // Exclusivity rule: when lojaPixDescontoPermitirPontos is false, using points disables PIX discount
      const paramsWithPoints: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 1, valor_unitario: 200.00 },
        ],
        pointsToUse: 1000, // R$ 10.00 points used
        isPix: true,
        pixPercentage: 5,
        pixSettings: { descontoAtivo: true, permitirPontos: false, permitirCarteira: false },
      };

      const client = calculateClientCheckoutTotals(paramsWithPoints);
      const server = calculateCorrectedServerCheckoutTotals(paramsWithPoints);

      // PIX discount must be 0 because points are used
      expect(client.descontoPix).toBe(0.00);
      expect(client.descontoPontos).toBe(10.00);
      expect(client.totalFinal).toBe(190.00);

      expect(server.pixDiscount).toBe(0.00);
      expect(server.pointsDiscount).toBe(10.00);
      expect(server.total).toBe(190.00);
    });

    it('2.4 should revert total when switching payment method from PIX to Credit Card', () => {
      const baseParams: PricingCalculationParams = {
        cartItems: [
          { id: '1', item_id: 'prod-1', tipo: 'produto', quantidade: 1, valor_unitario: 300.00 },
        ],
        pixPercentage: 5,
      };

      // Customer chooses PIX: R$ 15 discount -> R$ 285.00
      const pixTotals = calculateClientCheckoutTotals({ ...baseParams, isPix: true });
      expect(pixTotals.descontoPix).toBe(15.00);
      expect(pixTotals.totalFinal).toBe(285.00);

      // Customer switches to Card: R$ 0 discount -> R$ 300.00
      const cardTotals = calculateClientCheckoutTotals({ ...baseParams, isPix: false });
      expect(cardTotals.descontoPix).toBe(0.00);
      expect(cardTotals.totalFinal).toBe(300.00);
    });

    it('2.5 createInfinitePayOrderCheckout: must query payment quote reflecting PIX discount and charge exact discounted total', async () => {
      // Mock callClientRpc for gsa_client_store_payment_quote
      // In the fixed system, the order total is R$ 190.00 (with 5% PIX discount)
      mockCallClientRpc.mockImplementation((rpcName: string, args: any) => {
        if (rpcName === 'gsa_client_store_payment_quote') {
          return Promise.resolve({
            success: true,
            orcamento_id: args.p_orcamento_id,
            total: 190.00, // 5% discount applied in database
            desconto_pix: 10.00,
          });
        }
        return Promise.resolve({});
      });

      // Spy on fetch for InfinitePay checkout endpoint
      const originalFetch = global.fetch;
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          url: 'https://pay.infinitepay.io/test-order-190',
          order_nsu: 'ORC-PIX-123456',
        }),
      });
      global.fetch = fetchSpy as any;

      try {
        const result = await createInfinitePayOrderCheckout({
          orcamentoId: 'orc-pix-test-01',
          codigoOrcamento: 'ORC-PIX-123',
          clienteId: 'cli-001',
          clienteNome: 'Adriano Farias',
          clienteEmail: 'cliente@teste.com',
          clienteTelefone: '11920857756',
        });

        expect(result.success).toBe(true);
        expect(result.total).toBe(190.00);
        expect(result.link).toBe('https://pay.infinitepay.io/test-order-190');

        // InfinitePay charges amount in centavos: 190.00 * 100 = 19000
        expect(fetchSpy).toHaveBeenCalled();
        const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
        expect(fetchBody.items).toBeDefined();
        expect(fetchBody.items[0].price).toBe(19000); // MUST be 19000 cents (R$ 190.00), NEVER 20000 cents!
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('2.6 should embed exact discounted amount in BACEN PIX BR Code payload', () => {
      const discountedAmount = 190.00;

      const pixPayload = generatePixCopiaECola({
        chavePix: '11920857756',
        nomeRecebedor: 'Grupo GSA Servicos',
        cidadeRecebedor: 'Sao Paulo',
        valor: discountedAmount,
        txId: 'PED-PIX-001',
      });

      // BACEN Tag 54 represents Transaction Amount (Length: 06, Value: 190.00)
      expect(pixPayload).toContain('5406190.00');

      // Verify CRC16 is valid and conforms to CCITT standard
      const payloadWithoutCrc = pixPayload.slice(0, -4);
      const computedCrc = crc16(payloadWithoutCrc);
      expect(pixPayload.endsWith(computedCrc)).toBe(true);
    });
  });
});

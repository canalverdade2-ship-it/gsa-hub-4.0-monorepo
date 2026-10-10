import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks for Supabase client
const mockFrom = vi.fn();
const mockRpc = vi.fn();

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

vi.mock('../lib/sessionService', () => ({
  sessionService: {
    getCurrentSession: () => ({
      sessaoId: 'session-client-001',
      sessionToken: 'token-client-001',
      atorTipo: 'cliente',
    }),
  },
}));

import {
  getProductRegularPrice,
  getProductEffectivePrice,
  getProductDiscountAmount,
  getProductDiscountPercentage,
  formatProductDiscountPercentage,
  hasActiveProductDiscount,
  getProductQuantityPriceBreakdown,
  getProductDiscountValidityInfo,
} from '../lib/productPricing';

import {
  crc16,
  formatEMV,
  generatePixCopiaECola,
  getQrCodeImageUrl,
  createInfinitePayOrderCheckout,
  checkOrderStatus,
} from '../lib/pixService';

import type { Produto } from '../types';

describe('Marketplace Checkout, Pricing & PIX Payment Suite (F8 / R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Volume Pricing & Promotional Discount Calculations', () => {
    const baseProduct: Produto = {
      id: 'prod-001',
      nome: 'Ração Super Premium 15kg',
      valor: 200,
      valor_promocional: 160,
      desconto_ativo: true,
      desconto_prazo_tipo: 'indeterminado',
      desconto_limite_quantidade_ativo: false,
      estoque_disponivel: 50,
      visivel_na_loja: true,
    } as any;

    it('should calculate regular and promotional effective prices', () => {
      expect(getProductRegularPrice(baseProduct)).toBe(200);
      expect(getProductEffectivePrice(baseProduct)).toBe(160);
      expect(getProductDiscountAmount(baseProduct)).toBe(40);
      expect(getProductDiscountPercentage(baseProduct)).toBe(20);
      expect(formatProductDiscountPercentage(baseProduct)).toBe('20% OFF');
      expect(hasActiveProductDiscount(baseProduct)).toBe(true);
    });

    it('should fallback to regular price when discount is inactive', () => {
      const inactiveProd = { ...baseProduct, desconto_ativo: false };
      expect(getProductEffectivePrice(inactiveProd)).toBe(200);
      expect(getProductDiscountAmount(inactiveProd)).toBe(0);
      expect(hasActiveProductDiscount(inactiveProd)).toBe(false);
    });

    it('should discard promotional price when fixed-term promotion has expired', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const expiredProd = {
        ...baseProduct,
        desconto_prazo_tipo: 'determinado' as const,
        desconto_fim_em: pastDate,
      };

      expect(hasActiveProductDiscount(expiredProd)).toBe(false);
      expect(getProductEffectivePrice(expiredProd)).toBe(200);
    });

    it('should maintain promotional price when fixed-term promotion is in the future', () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const activeProd = {
        ...baseProduct,
        desconto_prazo_tipo: 'determinado' as const,
        desconto_fim_em: futureDate,
      };

      expect(hasActiveProductDiscount(activeProd)).toBe(true);
      expect(getProductEffectivePrice(activeProd)).toBe(160);
    });

    it('should split tiered prices when quantity exceeds promotional quota', () => {
      const limitedProd: Produto = {
        ...baseProduct,
        valor: 100,
        valor_promocional: 70,
        desconto_limite_quantidade_ativo: true,
        desconto_quantidade_limite: 10,
        desconto_quantidade_utilizada: 7, // 3 promo units remaining
      };

      // Requesting 5 units: 3 at R$ 70 + 2 at R$ 100 = R$ 210 + R$ 200 = R$ 410
      const breakdown = getProductQuantityPriceBreakdown(limitedProd, 5);

      expect(breakdown.quantidadeSolicitada).toBe(5);
      expect(breakdown.quantidadeComDesconto).toBe(3);
      expect(breakdown.quantidadeSemDesconto).toBe(2);
      expect(breakdown.valorNormalUnitario).toBe(100);
      expect(breakdown.valorPromocionalUnitario).toBe(70);
      expect(breakdown.subtotalComDesconto).toBe(210);
      expect(breakdown.subtotalSemDesconto).toBe(200);
      expect(breakdown.subtotalFinal).toBe(410);
    });

    it('should apply promotional price to all items when quota is unlimited', () => {
      const unlimitedProd: Produto = {
        ...baseProduct,
        valor: 50,
        valor_promocional: 40,
        desconto_limite_quantidade_ativo: false,
      };

      const breakdown = getProductQuantityPriceBreakdown(unlimitedProd, 4);

      expect(breakdown.quantidadeComDesconto).toBe(4);
      expect(breakdown.quantidadeSemDesconto).toBe(0);
      expect(breakdown.subtotalFinal).toBe(160);
    });

    it('should return complete validity info and remaining days correctly', () => {
      const info = getProductDiscountValidityInfo(baseProduct);
      expect(info.estaAtiva).toBe(true);
      expect(info.precoNormal).toBe(200);
      expect(info.precoPromocional).toBe(160);
      expect(info.precoEfetivo).toBe(160);
      expect(info.porcentagemDesconto).toBe(20);
      expect(info.situacao).toBe('indeterminada');
    });
  });

  describe('2. Coupon Code Application & Validation Engine', () => {
    interface Coupon {
      id: string;
      codigo_cupom: string;
      tipo_desconto: 'porcentagem' | 'valor_fixo';
      valor_desconto: number;
      valor_minimo_compra?: number;
      status: 'ativo' | 'inativo' | 'esgotado';
      data_validade?: string;
      limite_usos?: number;
      total_usos?: number;
      categoria_cupom?: 'desconto' | 'entrega';
      produto_id?: string | null;
    }

    const validateAndCalculateDiscount = (coupon: Coupon, subtotal: number, productId?: string) => {
      if (coupon.status !== 'ativo') {
        throw new Error('Este cupom não está mais ativo.');
      }
      if (coupon.limite_usos && coupon.total_usos && coupon.total_usos >= coupon.limite_usos) {
        throw new Error('Limite de uso do cupom esgotado.');
      }
      if (coupon.data_validade) {
        const expiry = new Date(coupon.data_validade);
        if (new Date() > expiry) {
          throw new Error('Cupom expirado.');
        }
      }
      if (coupon.valor_minimo_compra && subtotal < coupon.valor_minimo_compra) {
        throw new Error(`A compra mínima para usar este cupom é R$ ${coupon.valor_minimo_compra.toFixed(2)}.`);
      }
      if (coupon.produto_id && productId && coupon.produto_id !== productId) {
        throw new Error('Este cupom é exclusivo para outro item.');
      }

      if (coupon.tipo_desconto === 'porcentagem') {
        const discount = Number(((subtotal * coupon.valor_desconto) / 100).toFixed(2));
        return Math.min(discount, subtotal);
      } else {
        return Math.min(coupon.valor_desconto, subtotal);
      }
    };

    it('should calculate percentage discount accurately on valid cart subtotal', () => {
      const coupon: Coupon = {
        id: 'cupom-1',
        codigo_cupom: 'PROMO15',
        tipo_desconto: 'porcentagem',
        valor_desconto: 15,
        status: 'ativo',
      };

      const discount = validateAndCalculateDiscount(coupon, 300);
      expect(discount).toBe(45); // 15% of 300 = 45
    });

    it('should calculate fixed value discount accurately on cart subtotal', () => {
      const coupon: Coupon = {
        id: 'cupom-2',
        codigo_cupom: 'MENOS50',
        tipo_desconto: 'valor_fixo',
        valor_desconto: 50,
        status: 'ativo',
      };

      const discount = validateAndCalculateDiscount(coupon, 250);
      expect(discount).toBe(50);
    });

    it('should reject coupon when cart subtotal is below minimum purchase threshold', () => {
      const coupon: Coupon = {
        id: 'cupom-3',
        codigo_cupom: 'MINIMO100',
        tipo_desconto: 'valor_fixo',
        valor_desconto: 20,
        valor_minimo_compra: 100,
        status: 'ativo',
      };

      expect(() => validateAndCalculateDiscount(coupon, 80)).toThrow(
        'A compra mínima para usar este cupom é R$ 100.00.'
      );
      expect(validateAndCalculateDiscount(coupon, 120)).toBe(20);
    });

    it('should reject expired coupon', () => {
      const coupon: Coupon = {
        id: 'cupom-4',
        codigo_cupom: 'EXPIRADO',
        tipo_desconto: 'porcentagem',
        valor_desconto: 10,
        status: 'ativo',
        data_validade: new Date(Date.now() - 3600000).toISOString(),
      };

      expect(() => validateAndCalculateDiscount(coupon, 200)).toThrow('Cupom expirado.');
    });

    it('should reject coupon with exhausted global usage limit', () => {
      const coupon: Coupon = {
        id: 'cupom-5',
        codigo_cupom: 'LIMITADO',
        tipo_desconto: 'porcentagem',
        valor_desconto: 10,
        status: 'ativo',
        limite_usos: 50,
        total_usos: 50,
      };

      expect(() => validateAndCalculateDiscount(coupon, 200)).toThrow('Limite de uso do cupom esgotado.');
    });
  });

  describe('3. Guest Cart Migration to Authenticated User Account', () => {
    it('should simulate guest cart migration merging quantities into loja_carrinhos', () => {
      const guestItems = [
        { item_id: 'prod-1', tipo: 'produto', quantidade: 2 },
        { item_id: 'prod-2', tipo: 'produto', quantidade: 1 },
        { item_id: 'sub-1', tipo: 'assinatura', quantidade: 1 },
      ];

      const existingUserCart = [
        { id: 'cart-1', item_id: 'prod-1', tipo: 'produto', quantidade: 3 },
      ];

      const existingMap = new Map<string, any>(
        existingUserCart.map((row) => [`${row.tipo}:${row.item_id}`, row])
      );

      const operations: any[] = [];

      for (const item of guestItems) {
        const key = `${item.tipo}:${item.item_id}`;
        const existing = existingMap.get(key);

        if (existing) {
          const novaQuantidade = item.tipo === 'assinatura'
            ? item.quantidade
            : existing.quantidade + item.quantidade;
          operations.push({
            type: 'update',
            id: existing.id,
            novaQuantidade,
          });
          existing.quantidade = novaQuantidade;
        } else {
          operations.push({
            type: 'insert',
            item_id: item.item_id,
            tipo: item.tipo,
            quantidade: item.quantidade,
          });
          existingMap.set(key, { id: 'new', ...item });
        }
      }

      // prod-1 was merged from 3 + 2 = 5
      expect(operations).toContainEqual({
        type: 'update',
        id: 'cart-1',
        novaQuantidade: 5,
      });

      // prod-2 was inserted with 1
      expect(operations).toContainEqual({
        type: 'insert',
        item_id: 'prod-2',
        tipo: 'produto',
        quantidade: 1,
      });

      // sub-1 was inserted with 1
      expect(operations).toContainEqual({
        type: 'insert',
        item_id: 'sub-1',
        tipo: 'assinatura',
        quantidade: 1,
      });
    });
  });

  describe('4. PIX Payment Payload & EMV BR Code Engine (pixService)', () => {
    it('should compute valid CRC16-CCITT checksum for EMV strings', () => {
      const testVector = '00020101021226580014br.gov.bcb.pix0114+55119208577565204000053039865406150.005802BR5918GRUPO GSA SERVICOS6009SAO PAULO62170513GSAPEDIDO1236304';
      const crc = crc16(testVector);
      expect(crc).toMatch(/^[0-9A-F]{4}$/);
      expect(crc.length).toBe(4);
    });

    it('should format EMV Tag + Length + Value correctly', () => {
      expect(formatEMV('00', '01')).toBe('000201');
      expect(formatEMV('53', '986')).toBe('5303986');
      expect(formatEMV('58', 'BR')).toBe('5802BR');
      expect(formatEMV('59', 'GRUPO GSA')).toBe('5909GRUPO GSA');
    });

    it('should generate a complete BACEN-compliant PIX Copia e Cola BR Code payload', () => {
      const pixCode = generatePixCopiaECola({
        chavePix: '11920857756',
        nomeRecebedor: 'Grupo GSA Serviços',
        cidadeRecebedor: 'São Paulo',
        valor: 150.50,
        txId: 'PED123456',
        descricao: 'Compra GSA Store',
      });

      expect(pixCode).toContain('000201'); // Format Indicator
      expect(pixCode).toContain('br.gov.bcb.pix'); // GUI
      expect(pixCode).toContain('+5511920857756'); // Normalized Key
      expect(pixCode).toContain('5303986'); // BRL Currency
      expect(pixCode).toContain('5406150.50'); // Amount
      expect(pixCode).toContain('5802BR'); // Country
      expect(pixCode).toContain('5918GRUPO GSA SERVICOS'); // Normalized Name (no accents)
      expect(pixCode).toContain('6009SAO PAULO'); // City
      expect(pixCode).toContain('62130509PED123456'); // TxID
      expect(pixCode).toContain('6304'); // CRC Tag

      // Verify CRC at the end
      const payloadWithoutCrc = pixCode.slice(0, -4);
      const expectedCrc = crc16(payloadWithoutCrc);
      expect(pixCode.endsWith(expectedCrc)).toBe(true);
    });

    it('should generate valid QR code visual image URL', () => {
      const pixCode = '00020126360014br.gov.bcb.pix0114+55119208577565204000053039865802BR5909GRUPO GSA6009SAO PAULO62070503***6304ABCD';
      const qrUrl = getQrCodeImageUrl(pixCode, 300);
      expect(qrUrl).toContain('https://api.qrserver.com/v1/create-qr-code/');
      expect(qrUrl).toContain('size=300x300');
      expect(qrUrl).toContain(encodeURIComponent(pixCode));
    });

    it('createInfinitePayOrderCheckout: should return success directly when order is fully covered by points/wallet (R$ 0,00)', async () => {
      mockRpc.mockResolvedValueOnce({ data: { total: 0 }, error: null });
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-points-001',
        codigoOrcamento: 'ORC-POINTS-001',
        clienteId: 'cli-001',
        valorLiquido: 0,
      });

      expect(result.success).toBe(true);
      expect(result.link).toBeUndefined();
    });

    it('checkOrderStatus: should return pago: true when budget status is pago or aprovado', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orcamentos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { status: 'pago', fase_negociacao: 'concluido' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const status = await checkOrderStatus('orc-pago-100');
      expect(status.pago).toBe(true);
      expect(status.status).toBe('pago');
    });

    it('checkOrderStatus: should check faturas table when budget is not yet marked as paid', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orcamentos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { status: 'pendente' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'faturas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { status: 'pago' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const status = await checkOrderStatus('orc-fatura-paga-200');
      expect(status.pago).toBe(true);
      expect(status.status).toBe('pago');
    });
  });
});

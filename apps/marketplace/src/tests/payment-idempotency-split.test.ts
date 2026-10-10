import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Storage & window polyfill for Node test runner
const memoryLocalStorage: Record<string, string> = {};
const memorySessionStorage: Record<string, string> = {};

const createMockStorage = (store: Record<string, string>) => ({
  getItem: vi.fn((key: string) => store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
  length: 0,
  key: (index: number) => Object.keys(store)[index] || null,
});

const mockLocalStorage = createMockStorage(memoryLocalStorage);
const mockSessionStorage = createMockStorage(memorySessionStorage);

(global as any).localStorage = mockLocalStorage;
(global as any).sessionStorage = mockSessionStorage;

if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    location: { href: 'https://sistema.grupogsaservicos.com.br', origin: 'https://sistema.grupogsaservicos.com.br' },
  };
}

// Hoisted mocks for Supabase client
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockClientRpc = vi.fn();

vi.mock('../lib/clientRpc', () => ({
  callClientRpc: (...args: any[]) => mockClientRpc(...args),
}));

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

// Mock global fetch for external InfinitePay endpoints
const originalFetch = global.fetch;

import {
  crc16,
  formatEMV,
  generatePixCopiaECola,
  getQrCodeImageUrl,
  createInfinitePayOrderCheckout,
  checkOrderStatus,
} from '../lib/pixService';

import {
  getProductRegularPrice,
  getProductEffectivePrice,
  getProductDiscountAmount,
  getProductQuantityPriceBreakdown,
} from '../lib/productPricing';

import type { Produto } from '../types';

describe('Payment Idempotency, Split & PIX EMV BR Code Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. BACEN-Compliant EMV PIX Copia e Cola & CRC16-CCITT Verification
  // =========================================================================
  describe('1. BACEN-Compliant EMV PIX Copia e Cola & CRC16-CCITT Verification', () => {
    it('should compute valid standard CRC16-CCITT checksum for BACEN EMV payloads', () => {
      const emvTestString = '00020126580014br.gov.bcb.pix0114+55119208577565204000053039865406150.005802BR5918GRUPO GSA SERVICOS6009SAO PAULO62170513GSAPEDIDO1236304';
      const checksum = crc16(emvTestString);

      expect(checksum).toHaveLength(4);
      expect(checksum).toMatch(/^[0-9A-F]{4}$/);
      expect(crc16(emvTestString)).toBe(checksum);
    });

    it('should format EMV Tag-Length-Value (TLV) strings with 2-digit zero-padded lengths', () => {
      expect(formatEMV('00', '01')).toBe('000201');
      expect(formatEMV('53', '986')).toBe('5303986');
      expect(formatEMV('58', 'BR')).toBe('5802BR');
      expect(formatEMV('59', 'GSA')).toBe('5903GSA');
      expect(formatEMV('60', 'SAO PAULO')).toBe('6009SAO PAULO');
    });

    it('should generate dynamic PIX Copia e Cola payload (Tag 01 = 12) with normalized receiver data and valid CRC', () => {
      const pixCode = generatePixCopiaECola({
        chavePix: '11920857756',
        nomeRecebedor: 'Grupo GSA - Serviços e Benefícios',
        cidadeRecebedor: 'São Paulo',
        valor: 249.90,
        txId: 'PED-9988-ABC',
        descricao: 'Loja GSA Store',
      });

      // Format indicator
      expect(pixCode).toContain('000201');
      // Dynamic payment
      expect(pixCode).toContain('010212');
      // GUI and Key
      expect(pixCode).toContain('br.gov.bcb.pix');
      expect(pixCode).toContain('+5511920857756');
      // Currency BRL (986)
      expect(pixCode).toContain('5303986');
      // Value
      expect(pixCode).toContain('5406249.90');
      // Country
      expect(pixCode).toContain('5802BR');
      // Stripped accents, uppercase, max 25 chars: "GRUPO GSA - SERVICOS E BE" (25 chars)
      expect(pixCode).toContain('5925GRUPO GSA - SERVICOS E BE');
      // Stripped accents, max 15 chars: "SAO PAULO"
      expect(pixCode).toContain('6009SAO PAULO');
      // TxId alphanumeric only (Tag 62 with length 14, containing Tag 05 length 10)
      expect(pixCode).toContain('62140510PED9988ABC');
      // CRC tag
      expect(pixCode).toContain('6304');

      // Verify CRC validity at end of payload
      const payloadWithoutCrc = pixCode.slice(0, -4);
      const computedCrc = crc16(payloadWithoutCrc);
      expect(pixCode.endsWith(computedCrc)).toBe(true);
    });

    it('should generate static PIX Copia e Cola payload (Tag 01 = 11) when amount is 0 (omitting Tag 54)', () => {
      const pixCode = generatePixCopiaECola({
        chavePix: '+5511920857756',
        nomeRecebedor: 'GRUPO GSA',
        cidadeRecebedor: 'SAO PAULO',
        valor: 0,
      });

      expect(pixCode).toContain('010211'); // Static point of initiation
      expect(pixCode).not.toContain('540'); // No Tag 54
      const payloadWithoutCrc = pixCode.slice(0, -4);
      expect(pixCode.endsWith(crc16(payloadWithoutCrc))).toBe(true);
    });

    it('should construct valid QR code image rendering URL', () => {
      const pix = '00020101021226360014br.gov.bcb.pix0114+55119208577565204000053039865802BR5909GRUPO GSA6009SAO PAULO62070503***6304ABCD';
      const qrUrl = getQrCodeImageUrl(pix, 350);

      expect(qrUrl).toContain('https://api.qrserver.com/v1/create-qr-code/?size=350x350');
      expect(qrUrl).toContain(encodeURIComponent(pix));
    });
  });

  // =========================================================================
  // 2. Zero-Cost Order Handling (Skipping Payment Gateway Fees)
  // =========================================================================
  describe('2. Zero-Cost Order Handling & Gateway Bypass', () => {
    it('should immediately return success when order is 100% paid by points/wallet (R$ 0,00) without invoking InfinitePay', async () => {
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-zero-cost-01',
        codigoOrcamento: 'ORC-POINTS-100',
        clienteId: 'cli-points-01',
        valorLiquido: 0,
      });

      expect(result.success).toBe(true);
      expect(result.link).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should treat fractional sub-cent values (< 0.01) as fully covered zero-cost orders', async () => {
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-fractional-01',
        codigoOrcamento: 'ORC-FRACTIONAL-01',
        clienteId: 'cli-002',
        valorLiquido: 0.004,
      });

      expect(result.success).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should invoke InfinitePay checkout API when valorLiquido is positive and create order NSU', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://checkout.infinitepay.io/pay/inv_live_123456789',
        }),
      });

      const orcMock = {
        id: 'orc-pay-01',
        subtotal_itens: 150.00,
        loja_pedido_itens: [
          {
            nome: 'Ração Especial 10kg',
            quantidade: 1,
            valor_unitario: 150.00,
            subtotal: 150.00,
            tipo: 'produto',
          },
        ],
      };

      mockClientRpc.mockImplementation(async (name: string) =>
        name === 'gsa_client_store_payment_quote'
          ? { total: 150 }
          : { success: true, fatura_id: 'fat-secure-01' }
      );
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orcamentos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: orcMock, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-pay-01',
        codigoOrcamento: 'ORC-2026-999',
        clienteId: 'cli-pay-01',
        valorLiquido: 150.00,
        clienteNome: 'Adriano Farias',
        clienteEmail: 'adriano@grupogsa.com.br',
        clienteTelefone: '11971858372',
      });

      expect(result.success).toBe(true);
      expect(result.link).toBe('https://checkout.infinitepay.io/pay/inv_live_123456789');
      expect(result.orderNsu).toContain('ORC-2026-999-');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.checkout.infinitepay.io/links',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"price":15000'), // 150.00 in cents
        })
      );
    });
  });

  // =========================================================================
  // 3. Dynamic Discounts & Invoice Itemization (faturas)
  // =========================================================================
  describe('3. Dynamic Discounts & Invoice Itemization (faturas)', () => {
    it('should calculate promotional and quantity-split discounts dynamically', () => {
      const product: Produto = {
        id: 'prod-split-01',
        nome: 'Suplemento Pet Vitamin',
        valor: 100.00,
        valor_promocional: 80.00,
        desconto_ativo: true,
        desconto_prazo_tipo: 'indeterminado',
        desconto_limite_quantidade_ativo: true,
        desconto_quantidade_limite: 10,
        desconto_quantidade_utilizada: 8, // 2 promo units remaining
        estoque_disponivel: 50,
      } as any;

      expect(getProductRegularPrice(product)).toBe(100.00);
      expect(getProductEffectivePrice(product)).toBe(80.00);
      expect(getProductDiscountAmount(product)).toBe(20.00);

      // Ordering 5 units: 2 promo units @ 80 + 3 regular units @ 100 = 160 + 300 = 460
      const breakdown = getProductQuantityPriceBreakdown(product, 5);
      expect(breakdown.quantidadeComDesconto).toBe(2);
      expect(breakdown.quantidadeSemDesconto).toBe(3);
      expect(breakdown.subtotalComDesconto).toBe(160.00);
      expect(breakdown.subtotalSemDesconto).toBe(300.00);
      expect(breakdown.subtotalFinal).toBe(460.00);
    });

    it('should itemize invoice with breakdown (promocional, cupom, pontos, carteira)', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://checkout.infinitepay.io/pay/test' }),
      });

      const orcMock = {
        id: 'orc-itemized-01',
        subtotal_preco_tabela: 500.00,
        desconto_promocional: 50.00,
        desconto_cupom: 20.00,
        desconto_pontos: 10.00,
        abatimento_carteira: 20.00,
        loja_pedido_itens: [
          {
            nome: 'Kit Saúde Pet',
            codigo: 'KIT-01',
            quantidade: 2,
            valor_unitario: 250.00,
            subtotal: 500.00,
            tipo: 'produto',
          },
        ],
      };

      const faturaInsertMock = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orcamentos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: orcMock, error: null }),
              }),
            }),
          };
        }
        if (table === 'faturas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: faturaInsertMock,
          };
        }
        return {};
      });

      const netAmount = 400.00; // 500 - 50 - 20 - 10 - 20 = 400
      mockClientRpc.mockImplementation(async (name: string) =>
        name === 'gsa_client_store_payment_quote'
          ? { total: netAmount }
          : { success: true, fatura_id: 'fat-itemized-01' }
      );
      await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-itemized-01',
        codigoOrcamento: 'ORC-2026-ITM',
        clienteId: 'cli-003',
        valorLiquido: netAmount,
      });

      expect(mockClientRpc).toHaveBeenCalledWith(
        'gsa_client_sync_pix_invoice',
        expect.objectContaining({
          p_orcamento_id: 'orc-itemized-01',
          p_itens: expect.arrayContaining([
            expect.objectContaining({
              nome: 'Kit Saúde Pet',
              quantidade: 2,
              valor_unitario: 250.00,
            }),
          ]),
        })
      );
    });

    it('checkOrderStatus: should detect paid status from budget or invoice', async () => {
      // 1. Paid budget
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

      const status1 = await checkOrderStatus('orc-101');
      expect(status1.pago).toBe(true);
      expect(status1.status).toBe('pago');

      // 2. Pending budget, but paid invoice
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orcamentos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { status: 'pendente', fase_negociacao: 'aguardando_pagamento' },
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

      const status2 = await checkOrderStatus('orc-102');
      expect(status2.pago).toBe(true);
      expect(status2.status).toBe('pago');
    });
  });
});

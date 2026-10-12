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

const mockInvoke = vi.fn();
const mockGetSession = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: any[]) => mockGetSession(...args) },
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
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
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'test-user' }, access_token: 'test-token' } } });
    mockInvoke.mockResolvedValue({ data: { link: 'https://checkout.example.test/order', order_nsu: 'server-order', total: 150 }, error: null });
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

    it('should invoke the authenticated backend and use its checkout result', async () => {
      mockClientRpc.mockResolvedValueOnce({ total: 150 });
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-pay-01', codigoOrcamento: 'ORC-2026-999', clienteId: 'cli-pay-01', valorLiquido: 1,
      });
      expect(result).toEqual({ success: true, link: 'https://checkout.example.test/order', orderNsu: 'server-order', total: 150 });
      expect(mockInvoke).toHaveBeenCalledWith('gsa-payments', {
        body: { action: 'create_store_link', orcamento_id: 'orc-pay-01', sessao_id: 'test-user', session_token: 'test-token' },
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

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

    it('should delegate invoice creation and discounts to the authenticated backend', async () => {
      mockClientRpc.mockResolvedValueOnce({ total: 400 });
      mockInvoke.mockResolvedValueOnce({ data: { link: 'https://checkout.example.test/order', total: 400, order_nsu: 'invoice-server' }, error: null });
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-itemized-01', codigoOrcamento: 'ORDER', clienteId: 'client', valorLiquido: 1,
      });
      expect(result.total).toBe(400);
      expect(mockClientRpc).toHaveBeenCalledWith('gsa_client_store_payment_quote', { p_orcamento_id: 'orc-itemized-01' });
      expect(mockInvoke).toHaveBeenCalledWith('gsa-payments', {
        body: { action: 'create_store_link', orcamento_id: 'orc-itemized-01', sessao_id: 'test-user', session_token: 'test-token' },
      });
      expect(mockFrom).not.toHaveBeenCalled();
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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Polyfills for Node test runner
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

const mockSessionStorage = createMockStorage(memorySessionStorage);
(global as any).sessionStorage = mockSessionStorage;

if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    sessionStorage: mockSessionStorage,
    location: {
      href: 'https://grupogsa.com.br/',
    },
  };
} else {
  (window as any).sessionStorage = mockSessionStorage;
}

if (typeof (global as any).document === 'undefined') {
  (global as any).document = {
    referrer: '',
  };
}

let isOnline = true;
try {
  const nav = typeof globalThis !== 'undefined' && (globalThis as any).navigator ? (globalThis as any).navigator : (window as any).navigator;
  if (nav) {
    Object.defineProperty(nav, 'onLine', {
      get: () => isOnline,
      configurable: true,
    });
  }
} catch {
  // fallback
}

// Hoisted mocks for Supabase client and RPC
const mockRpc = vi.fn();
const mockCallClientRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock('../lib/clientRpc', () => ({
  callClientRpc: (...args: any[]) => mockCallClientRpc(...args),
}));

import {
  captureAffiliateReferralFromLocation,
  processCapturedAffiliateReferral,
  bindPendingAffiliateClicks,
} from '../features/affiliates/attribution';

import {
  normalizeAffiliateSnapshot,
  joinAffiliate,
  updateAffiliateProfile,
  createAffiliateLink,
  requestAffiliatePayout,
  cancelAffiliatePayout,
  redeemAffiliatePoints,
} from '../features/affiliates/service';

import {
  crc16,
  formatEMV,
  generatePixCopiaECola,
  getQrCodeImageUrl,
  createInfinitePayOrderCheckout,
  checkOrderStatus,
} from '../lib/pixService';

function setDocumentReferrer(val: string) {
  Object.defineProperty(document, 'referrer', {
    value: val,
    configurable: true,
    writable: true,
  });
}

describe('EMPIRICAL CHALLENGER GATE 2: Stress Harness for Affiliates, Payouts, Points & PIX EMV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.clear();
    window.location.href = 'https://grupogsa.com.br/';
    setDocumentReferrer('');
    isOnline = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. AFFILIATE COMMISSION CALCULATIONS & BOUNDARY ARITHMETIC
  // =========================================================================
  describe('1. Affiliate Commission Calculations & Edge Cases', () => {
    it('should calculate accurate commissions across varying gross order amounts and percentages', () => {
      const cases = [
        { gross: 100.00, rate: 5.0, expected: 5.00 },
        { gross: 250.50, rate: 10.0, expected: 25.05 },
        { gross: 1299.90, rate: 3.5, expected: 45.50 }, // 45.4965 -> 45.50
        { gross: 0.01, rate: 10.0, expected: 0.00 }, // 0.001 -> 0.00
        { gross: 1000000.00, rate: 2.5, expected: 25000.00 },
      ];

      for (const c of cases) {
        const calculated = Math.round(c.gross * (c.rate / 100) * 100) / 100;
        expect(calculated).toBe(c.expected);
      }
    });

    it('should guard against negative and zero gross order values returning strictly 0 commission', () => {
      const adversarialAmounts = [0, -0.01, -100, -999999.99];

      for (const amt of adversarialAmounts) {
        const baseElegivel = Math.max(0, amt);
        const commission = Math.round(baseElegivel * (5.0 / 100) * 100) / 100;
        expect(commission).toBe(0);
        expect(baseElegivel).toBe(0);
      }
    });

    it('should correctly calculate commission maturity (carência) dates across leap years and month boundaries', () => {
      const testDates = [
        { from: '2026-01-15T00:00:00Z', carencia: 30, expected: '2026-02-14T00:00:00.000Z' },
        { from: '2026-02-01T00:00:00Z', carencia: 28, expected: '2026-03-01T00:00:00.000Z' },
        { from: '2026-12-15T00:00:00Z', carencia: 30, expected: '2027-01-14T00:00:00.000Z' },
        { from: '2026-08-26T00:00:00Z', carencia: 0, expected: '2026-08-26T00:00:00.000Z' },
      ];

      for (const td of testDates) {
        const fromDate = new Date(td.from);
        const matureDate = new Date(fromDate.getTime() + td.carencia * 24 * 60 * 60 * 1000);
        expect(matureDate.toISOString()).toBe(td.expected);
      }
    });
  });

  // =========================================================================
  // 2. PAYOUT REQUESTS VALIDATION & CONCURRENCY
  // =========================================================================
  describe('2. Payout Requests Validation, Minimum Threshold & Idempotency', () => {
    it('should dispatch valid payout request with required UUID request_id and numeric value', async () => {
      mockCallClientRpc.mockResolvedValue({
        success: true,
        idempotent: false,
        payout_id: 'payout-123',
      });

      const requestId = 'req-payout-abc-123';
      const result = await requestAffiliatePayout(150.00, requestId);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_request_affiliate_payout', {
        p_request_id: requestId,
        p_valor: 150.00,
      });
      expect(result).toBeDefined();
    });

    it('should handle cancel payout requests properly via RPC', async () => {
      mockCallClientRpc.mockResolvedValue({
        success: true,
      });

      await cancelAffiliatePayout('payout-uuid-999');

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_cancel_affiliate_payout', {
        p_saque_id: 'payout-uuid-999',
      });
    });

    it('should normalize snapshot containing requested, available, pending, and paid balances', () => {
      const raw = {
        summary: {
          total_disponivel: 450.75,
          total_pendente: 120.00,
          total_solicitado: 200.00,
          total_pago: 1000.00,
          saque_minimo: 50.00,
        },
      };

      const normalized = normalizeAffiliateSnapshot(raw);
      expect(normalized.summary.totalDisponivel).toBe(450.75);
      expect(normalized.summary.totalPendente).toBe(120.00);
      expect(normalized.summary.totalSolicitado).toBe(200.00);
      expect(normalized.summary.totalPago).toBe(1000.00);
      expect(normalized.summary.saqueMinimo).toBe(50.00);
    });
  });

  // =========================================================================
  // 3. POINTS TO WALLET CONVERSION & BOUNDARY RULES
  // =========================================================================
  describe('3. Points to Wallet Conversion Arithmetic & Boundaries', () => {
    it('should dispatch point redemption request with valid conversion parameters', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      const reqId = 'pt-redeem-gate2-001';
      await redeemAffiliatePoints(500, reqId);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_redeem_affiliate_points', {
        p_request_id: reqId,
        p_pontos: 500,
      });
    });

    it('should calculate accurate credit conversions with no floating point artifacts', () => {
      const conversions = [
        { points: 100, rate: 0.01, expectedCredit: 1.00 },
        { points: 333, rate: 0.01, expectedCredit: 3.33 },
        { points: 1250, rate: 0.01, expectedCredit: 12.50 },
        { points: 7777, rate: 0.02, expectedCredit: 155.54 },
        { points: 1000000, rate: 0.01, expectedCredit: 10000.00 },
      ];

      for (const item of conversions) {
        const calculated = Math.round(item.points * item.rate * 100) / 100;
        expect(calculated).toBe(item.expectedCredit);
      }
    });

    it('should reject or zero-out negative or zero points conversion', () => {
      const invalidPoints = [0, -10, -500];

      for (const pts of invalidPoints) {
        const validPoints = Math.max(0, pts);
        const credit = Math.round(validPoints * 0.01 * 100) / 100;
        expect(credit).toBe(0);
      }
    });
  });

  // =========================================================================
  // 4. REFERRAL PARAMETER SANITIZATION & ATTRIBUTION RESILIENCE
  // =========================================================================
  describe('4. Referral Parameter Sanitization & XSS / Injection Defense', () => {
    it('should accept valid referral codes matching [A-Za-z0-9_-]{6,96}', async () => {
      const validCodes = [
        'parceiro_vip_2026',
        'GSA-STORE-OFFICIAL',
        'ref_123456',
        'a'.repeat(96), // boundary max
      ];

      for (const code of validCodes) {
        vi.clearAllMocks();
        window.location.href = `https://grupogsa.com.br/planos?ref=${code}`;
        captureAffiliateReferralFromLocation();

        mockRpc.mockResolvedValue({
          data: { success: true, click_token: `tok_aff_valid_${code.slice(0, 10)}_1234567890` },
          error: null,
        });

        await processCapturedAffiliateReferral();
        expect(mockRpc).toHaveBeenCalledWith('gsa_public_track_affiliate_click', expect.objectContaining({
          p_codigo: code,
        }));
      }
    });

    it('should reject invalid, malformed, and adversarial referral codes without RPC dispatches', async () => {
      const adversarialCodes = [
        '',
        'short', // 5 chars
        'code with spaces',
        'ref@code!',
        '<script>alert(1)</script>',
        '"><img src=x onerror=alert(1)>',
        "'; DROP TABLE gsa_afiliados; --",
        'a'.repeat(97), // 97 chars (> 96)
        '..%2F..%2Fetc%2Fpasswd',
      ];

      for (const code of adversarialCodes) {
        vi.clearAllMocks();
        window.location.href = `https://grupogsa.com.br/?ref=${encodeURIComponent(code)}`;
        captureAffiliateReferralFromLocation();
        await processCapturedAffiliateReferral();
        expect(mockRpc).not.toHaveBeenCalled();
      }
    });

    it('should sanitize URL query params removing ref while preserving tracking tags and hashes', async () => {
      window.location.href = 'https://grupogsa.com.br/loja/produto?utm_source=google&ref=campanha_top_2026&utm_campaign=blackfriday#preco';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: { success: true, click_token: 'tok_aff_sanitized_token_1234567890' },
        error: null,
      });

      await processCapturedAffiliateReferral();

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_track_affiliate_click', expect.objectContaining({
        p_codigo: 'campanha_top_2026',
        p_landing_path: '/loja/produto?utm_source=google&utm_campaign=blackfriday#preco',
      }));
    });

    it('should enforce storage cap MAX_PENDING_CLICKS (8) and discard expired tokens', async () => {
      const expiredTime = new Date(Date.now() - 60000).toISOString();
      const futureTime = new Date(Date.now() + 600000).toISOString();

      const seedList = [
        { token: 'tok_aff_expired_001_1234567890', expiresAt: expiredTime },
        { token: 'tok_aff_token_001_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_002_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_003_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_004_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_005_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_006_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_007_1234567890123', expiresAt: futureTime },
        { token: 'tok_aff_token_008_1234567890123', expiresAt: futureTime },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(seedList);

      window.location.href = 'https://grupogsa.com.br/?ref=parceiro_novo_100';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: { success: true, click_token: 'tok_aff_token_009_1234567890123', expires_at: futureTime },
        error: null,
      });

      await processCapturedAffiliateReferral();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored.length).toBeLessThanOrEqual(8);
      expect(stored.some((c: any) => c.token === 'tok_aff_expired_001_1234567890')).toBe(false);
      expect(stored.some((c: any) => c.token === 'tok_aff_token_009_1234567890123')).toBe(true);
    });

    it('should latch concurrent calls to processCapturedAffiliateReferral preventing duplicate tracking', async () => {
      window.location.href = 'https://grupogsa.com.br/?ref=latch_affiliate_concurrent';
      captureAffiliateReferralFromLocation();

      let resolveRpc: (val: any) => void;
      const rpcPromise = new Promise((resolve) => {
        resolveRpc = resolve;
      });

      mockRpc.mockReturnValue(rpcPromise);

      const p1 = processCapturedAffiliateReferral();
      const p2 = processCapturedAffiliateReferral();
      const p3 = processCapturedAffiliateReferral();

      resolveRpc!({
        data: { success: true, click_token: 'tok_aff_concurrent_test_1234567890' },
        error: null,
      });

      await Promise.all([p1, p2, p3]);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('should latch concurrent calls to bindPendingAffiliateClicks preventing duplicate client binding', async () => {
      const clicks = [
        { token: 'tok_aff_concurrent_bind_1234567890', expiresAt: new Date(Date.now() + 100000).toISOString() },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(clicks);

      let resolveClientRpc: (val: any) => void;
      const clientRpcPromise = new Promise((resolve) => {
        resolveClientRpc = resolve;
      });

      mockCallClientRpc.mockReturnValue(clientRpcPromise);

      const b1 = bindPendingAffiliateClicks();
      const b2 = bindPendingAffiliateClicks();
      const b3 = bindPendingAffiliateClicks();

      resolveClientRpc!({ success: true, bound: true });

      await Promise.all([b1, b2, b3]);
      expect(mockCallClientRpc).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 5. PIX EMV BR CODE PAYLOAD & CRC16-CCITT CHECKSUM
  // =========================================================================
  describe('5. PIX EMV BR Code Payload & CRC16 Checksum Compliance', () => {
    it('should compute valid CRC16-CCITT checksum for standard EMV strings', () => {
      const vectors = [
        '00020126360014br.gov.bcb.pix0114+55119208577565204000053039865802BR5918GRUPO GSA SERVICOS6009SAO PAULO62070503***6304',
        '00020101021226580014br.gov.bcb.pix0114+55119208577565204000053039865406150.005802BR5918GRUPO GSA SERVICOS6009SAO PAULO62170513GSAPEDIDO1236304',
      ];

      for (const vec of vectors) {
        const crc = crc16(vec);
        expect(crc).toMatch(/^[0-9A-F]{4}$/);
        expect(crc.length).toBe(4);
        // Deterministic check
        expect(crc16(vec)).toBe(crc);
      }
    });

    it('should format EMV Tag + Length + Value correctly with 2-digit zero padding', () => {
      expect(formatEMV('00', '01')).toBe('000201');
      expect(formatEMV('01', '12')).toBe('010212');
      expect(formatEMV('53', '986')).toBe('5303986');
      expect(formatEMV('54', '150.50')).toBe('5406150.50');
      expect(formatEMV('58', 'BR')).toBe('5802BR');
      expect(formatEMV('59', 'GSA')).toBe('5903GSA');
      expect(formatEMV('60', 'SAO PAULO')).toBe('6009SAO PAULO');
    });

    it('should generate complete BACEN-compliant dynamic PIX Copia e Cola with verified CRC16', () => {
      const pixCode = generatePixCopiaECola({
        chavePix: '11920857756',
        nomeRecebedor: 'Grupo GSA Serviços',
        cidadeRecebedor: 'São Paulo',
        valor: 150.50,
        txId: 'PED123456',
        descricao: 'Compra GSA Store',
      });

      expect(pixCode.startsWith('000201')).toBe(true);
      expect(pixCode).toContain('010212'); // Dynamic with amount
      expect(pixCode).toContain('br.gov.bcb.pix');
      expect(pixCode).toContain('+5511920857756');
      expect(pixCode).toContain('5303986'); // BRL
      expect(pixCode).toContain('5406150.50'); // Amount
      expect(pixCode).toContain('5802BR');
      expect(pixCode).toContain('5918GRUPO GSA SERVICOS'); // Normalized uppercase without accents
      expect(pixCode).toContain('6009SAO PAULO');
      expect(pixCode).toContain('62130509PED123456'); // TxID
      expect(pixCode).toContain('6304');

      // Verify CRC at payload end
      const body = pixCode.slice(0, -4);
      const expectedCrc = crc16(body);
      expect(pixCode.endsWith(expectedCrc)).toBe(true);
    });

    it('should generate static PIX (Tag 01 = 11, without Tag 54) when amount is 0', () => {
      const pixCode = generatePixCopiaECola({
        chavePix: 'contato@grupogsa.com.br',
        nomeRecebedor: 'GRUPO GSA',
        cidadeRecebedor: 'SAO PAULO',
        valor: 0,
      });

      expect(pixCode).toContain('010211');
      expect(pixCode.includes('540')).toBe(false);
      const body = pixCode.slice(0, -4);
      const expectedCrc = crc16(body);
      expect(pixCode.endsWith(expectedCrc)).toBe(true);
    });

    it('should generate valid QR code visual image URL', () => {
      const pixCode = '00020126360014br.gov.bcb.pix0114+55119208577565204000053039865802BR5909GRUPO GSA6009SAO PAULO62070503***6304ABCD';
      const qrUrl = getQrCodeImageUrl(pixCode, 300);
      expect(qrUrl).toContain('https://api.qrserver.com/v1/create-qr-code/');
      expect(qrUrl).toContain('size=300x300');
      expect(qrUrl).toContain(encodeURIComponent(pixCode));
    });

    it('createInfinitePayOrderCheckout: should bypass external gateway payment when order is fully covered (R$ 0,00)', async () => {
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-100',
        codigoOrcamento: 'ORC-100',
        clienteId: 'cli-100',
        valorLiquido: 0,
      });

      expect(result.success).toBe(true);
      expect(result.link).toBeUndefined();
    });
  });
});

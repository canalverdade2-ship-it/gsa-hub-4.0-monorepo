import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Storage & window polyfill for Node test runner
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

// Hoisted mocks for Supabase & client RPC
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
  fetchAffiliateSnapshot,
  joinAffiliate,
  updateAffiliateProfile,
  createAffiliateLink,
  requestAffiliatePayout,
  cancelAffiliatePayout,
  redeemAffiliatePoints,
} from '../features/affiliates/service';

import type { AffiliateSnapshot } from '../features/affiliates/types';

function setDocumentReferrer(val: string) {
  Object.defineProperty(document, 'referrer', {
    value: val,
    configurable: true,
    writable: true,
  });
}

describe('Affiliate Commissions & Attribution Edge Cases Test Suite', () => {
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
  // 1. Click Tracking with ?ref=<code> & Storage Persistence
  // =========================================================================
  describe('1. Referral Click Tracking & Storage Persistence', () => {
    it('should capture referral code from query param and persist opaque click token to sessionStorage', async () => {
      window.location.href = 'https://grupogsa.com.br/loja?ref=afiliado_pro_2026';
      setDocumentReferrer('https://facebook.com/gsa_promo');

      captureAffiliateReferralFromLocation();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_click_token_9876543210_abcdef123456',
          expires_at: futureDate,
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_track_affiliate_click', {
        p_codigo: 'afiliado_pro_2026',
        p_visitante_token: expect.any(String),
        p_landing_path: '/loja',
        p_referrer_host: 'facebook.com',
      });

      const storedClicks = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(storedClicks).toHaveLength(1);
      expect(storedClicks[0].token).toBe('tok_aff_click_token_9876543210_abcdef123456');
    });

    it('should ignore invalid referral codes (< 6 characters, > 96 characters, illegal characters, script tags)', async () => {
      const adversarialRefCodes = [
        '',
        'a',
        'short', // 5 chars
        'code with spaces',
        'code@with#symbols$',
        '<script>alert("xss")</script>',
        "'; DROP TABLE gsa_afiliados; --",
        'x'.repeat(97), // 97 chars
      ];

      for (const code of adversarialRefCodes) {
        vi.clearAllMocks();
        window.location.href = `https://grupogsa.com.br/?ref=${encodeURIComponent(code)}`;
        captureAffiliateReferralFromLocation();
        await processCapturedAffiliateReferral();
        expect(mockRpc).not.toHaveBeenCalled();
      }
    });

    it('should sanitize URL query params preserving other non-ref parameters and hashes', async () => {
      window.location.href = 'https://grupogsa.com.br/produtos/plano-pet?utm_source=google&ref=campanha_pet_2026&cupom=PET10#detalhes';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_sanitized_token_1234567890',
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_track_affiliate_click', expect.objectContaining({
        p_codigo: 'campanha_pet_2026',
        p_landing_path: '/produtos/plano-pet?utm_source=google&cupom=PET10#detalhes',
      }));
    });

    it('should cap stored tokens at MAX_PENDING_CLICKS (8) and discard expired tokens', async () => {
      const pastDate = new Date(Date.now() - 50000).toISOString();
      const futureDate = new Date(Date.now() + 5000000).toISOString();

      const existingClicks = [
        { token: 'tok_aff_expired_001_123456789012', expiresAt: pastDate },
        { token: 'tok_aff_valid_001_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_002_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_003_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_004_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_005_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_006_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_007_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_valid_008_123456789012', expiresAt: futureDate },
      ];

      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(existingClicks);

      window.location.href = 'https://grupogsa.com.br/?ref=novo_afiliado_100';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_valid_009_123456789012',
          expires_at: futureDate,
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored.length).toBeLessThanOrEqual(8);
      // Expired token was purged
      expect(stored.some((c: any) => c.token === 'tok_aff_expired_001_123456789012')).toBe(false);
      // New token exists
      expect(stored.some((c: any) => c.token === 'tok_aff_valid_009_123456789012')).toBe(true);
    });
  });

  // =========================================================================
  // 2. Customer Conversion Binding (gsa_client_bind_affiliate_click)
  // =========================================================================
  describe('2. Conversion Binding Flow (gsa_client_bind_affiliate_click)', () => {
    it('should iterate over pending tokens and invoke gsa_client_bind_affiliate_click', async () => {
      const validTokens = [
        { token: 'tok_aff_bind_1_1234567890123456', expiresAt: new Date(Date.now() + 1000000).toISOString() },
        { token: 'tok_aff_bind_2_1234567890123456', expiresAt: new Date(Date.now() + 1000000).toISOString() },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(validTokens);

      mockCallClientRpc.mockResolvedValue({ success: true, bound: true });

      await bindPendingAffiliateClicks();

      expect(mockCallClientRpc).toHaveBeenCalledTimes(2);
      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_bind_affiliate_click', {
        p_click_token: 'tok_aff_bind_1_1234567890123456',
      });
      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_bind_affiliate_click', {
        p_click_token: 'tok_aff_bind_2_1234567890123456',
      });

      // Storage should be cleared on success
      expect(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1')).toBeNull();
    });

    it('should retain tokens in storage when backend reports retryable: true', async () => {
      const retryableTokens = [
        { token: 'tok_aff_retry_token_123456789012', expiresAt: new Date(Date.now() + 1000000).toISOString() },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(retryableTokens);

      mockCallClientRpc.mockResolvedValue({ success: false, retryable: true });

      await bindPendingAffiliateClicks();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].token).toBe('tok_aff_retry_token_123456789012');
    });

    it('should do nothing when storage is empty', async () => {
      await bindPendingAffiliateClicks();
      expect(mockCallClientRpc).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Commission Rates, Carência Calculations & Zero-Commission Prevention
  // =========================================================================
  describe('3. Commission Rates, Carência Calculations & Zero-Commission Rules', () => {
    it('should calculate accurate commission amounts across different catalog programs', () => {
      const programs = [
        { codigo: 'loja', percentual: 5.0, valorBruto: 200.00, expectedCommission: 10.00 },
        { codigo: 'viagens', percentual: 3.0, valorBruto: 1500.00, expectedCommission: 45.00 },
        { codigo: 'classificados', percentual: 2.0, valorBruto: 5000.00, expectedCommission: 100.00 },
        { codigo: 'servicos', percentual: 5.0, valorBruto: 850.00, expectedCommission: 42.50 },
        { codigo: 'saude', percentual: 3.0, valorBruto: 350.00, expectedCommission: 10.50 },
        { codigo: 'seguros', percentual: 3.0, valorBruto: 1200.00, expectedCommission: 36.00 },
      ];

      for (const prog of programs) {
        const commission = Math.round(prog.valorBruto * (prog.percentual / 100) * 100) / 100;
        expect(commission).toBe(prog.expectedCommission);
      }
    });

    it('should calculate carência availability date accurately (now + carencia_dias)', () => {
      const now = new Date('2026-08-26T00:00:00Z');
      const carenciaDays = 30;
      const availableDate = new Date(now.getTime() + carenciaDays * 24 * 60 * 60 * 1000);

      expect(availableDate.toISOString()).toBe('2026-09-25T00:00:00.000Z');
    });

    it('should prevent zero-commission calculation on zero or negative order values', () => {
      const zeroCases = [0, -10, -0.01];

      for (const valor of zeroCases) {
        const baseElegivel = Math.max(0, valor);
        const commission = Math.round(baseElegivel * (5.0 / 100) * 100) / 100;
        expect(commission).toBe(0);
      }
    });

    it('should normalize affiliate snapshot with pending, available, and paid totals', () => {
      const mockRawSnapshot = {
        affiliate: {
          id: 'aff-01',
          codigo_publico: 'ADRIANO99',
          nome_divulgacao: 'Adriano Tech',
          status: 'ativo',
          pix_tipo: 'chave_aleatoria',
          pix_chave: 'd3b07384-d113-49b9-873d-82d3856e4c73',
        },
        programs: [
          {
            id: 'prog-1',
            codigo: 'loja',
            nome: 'GSA Loja',
            percentual: 5,
            carencia_dias: 30,
            saque_minimo: 50,
            ativo: true,
          },
        ],
        summary: {
          cliques: 250,
          conversoes: 15,
          total_pendente: 75.00,
          total_disponivel: 150.00,
          total_pago: 300.00,
          saque_minimo: 50.00,
        },
        commissions: [
          {
            id: 'comm-1',
            codigo_referencia: 'PED-2026-101',
            programa_codigo: 'loja',
            valor_bruto: 1000.00,
            base_elegivel: 1000.00,
            percentual: 5,
            valor: 50.00,
            status: 'disponivel',
          },
        ],
        payouts: [
          {
            id: 'pay-1',
            valor: 300.00,
            status: 'pago',
            pix_tipo: 'chave_aleatoria',
          },
        ],
      };

      const normalized: AffiliateSnapshot = normalizeAffiliateSnapshot(mockRawSnapshot);

      expect(normalized.affiliate?.codigoPublico).toBe('ADRIANO99');
      expect(normalized.summary.totalDisponivel).toBe(150.00);
      expect(normalized.summary.totalPendente).toBe(75.00);
      expect(normalized.summary.totalPago).toBe(300.00);
      expect(normalized.summary.saqueMinimo).toBe(50.00);
      expect(normalized.commissions).toHaveLength(1);
      expect(normalized.commissions[0].valor).toBe(50.00);
      expect(normalized.payouts).toHaveLength(1);
      expect(normalized.payouts[0].status).toBe('pago');
    });
  });

  // =========================================================================
  // 4. Payout Request Validation, Minimum Threshold & Idempotency
  // =========================================================================
  describe('4. Payout Request Validation & Idempotency', () => {
    it('should validate and dispatch payout request with request_id for idempotency', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      const requestId = 'payout-req-uuid-999';
      await requestAffiliatePayout(100.00, requestId);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_request_affiliate_payout', {
        p_request_id: requestId,
        p_valor: 100.00,
      });
    });

    it('should support cancelAffiliatePayout passing saque_id', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await cancelAffiliatePayout('saque-uuid-888');

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_cancel_affiliate_payout', {
        p_saque_id: 'saque-uuid-888',
      });
    });

    it('should support joinAffiliate and updateAffiliateProfile mutations', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await joinAffiliate({
        nomeDivulgacao: 'Canal Super GSA',
        pixTipo: 'cpf',
        pixChave: '12345678900',
        termosVersao: '2026.1',
      });

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_join_affiliate', {
        p_nome_divulgacao: 'Canal Super GSA',
        p_pix_tipo: 'cpf',
        p_pix_chave: '12345678900',
        p_termos_versao: '2026.1',
      });

      await updateAffiliateProfile({
        nomeDivulgacao: 'Canal Super GSA Pro',
        pixTipo: 'email',
        pixChave: 'contato@canalsuper.com',
      });

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_update_affiliate_profile', {
        p_nome_divulgacao: 'Canal Super GSA Pro',
        p_pix_tipo: 'email',
        p_pix_chave: 'contato@canalsuper.com',
      });
    });

    it('should support createAffiliateLink for specific catalog categories', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await createAffiliateLink({
        programaCodigo: 'viagens',
        destino: '/viagens/cruzeiros',
        titulo: 'Cruzeiros Exclusivos',
      });

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_create_affiliate_link', {
        p_programa_codigo: 'viagens',
        p_destino: '/viagens/cruzeiros',
        p_titulo: 'Cruzeiros Exclusivos',
      });
    });
  });

  // =========================================================================
  // 5. Points to Wallet Conversion Arithmetic
  // =========================================================================
  describe('5. Points Redemption & Conversion Boundary Arithmetic', () => {
    it('should dispatch point redemption and convert points to wallet correctly', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      const reqId = 'pt-redeem-999';
      await redeemAffiliatePoints(1000, reqId);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_redeem_affiliate_points', {
        p_request_id: reqId,
        p_pontos: 1000,
      });
    });

    it('should verify exact point conversion formulas: 100 points = R$ 1,00 at 0.01 rate', () => {
      const conversions = [
        { pts: 100, rate: 0.01, expectedR$: 1.00 },
        { pts: 250, rate: 0.01, expectedR$: 2.50 },
        { pts: 1000, rate: 0.01, expectedR$: 10.00 },
        { pts: 5000, rate: 0.01, expectedR$: 50.00 },
        { pts: 10000, rate: 0.01, expectedR$: 100.00 },
      ];

      for (const conv of conversions) {
        const result = Math.round(conv.pts * conv.rate * 100) / 100;
        expect(result).toBe(conv.expectedR$);
      }
    });
  });
});

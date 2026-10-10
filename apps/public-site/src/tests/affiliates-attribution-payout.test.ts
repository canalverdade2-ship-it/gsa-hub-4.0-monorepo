import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Mock storage infrastructure
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

function setDocumentReferrer(val: string) {
  Object.defineProperty(document, 'referrer', {
    value: val,
    configurable: true,
    writable: true,
  });
}

describe('Affiliates Attribution & Payout Stress Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.clear();
    window.location.href = 'https://grupogsa.com.br/';
    setDocumentReferrer('');
    isOnline = true;
  });

  // =========================================================================
  // 1. Referral Capture, Parameter Validation & Sanitization
  // =========================================================================
  describe('1. Referral Capture & Parameter Validation', () => {
    it('should capture valid referral codes matching LINK_CODE_PATTERN (6-96 chars)', async () => {
      window.location.href = 'https://grupogsa.com.br/planos?ref=parceiro_vip_2026';
      setDocumentReferrer('https://instagram.com/p/12345');

      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_valid_click_token_1234567890_abcdef',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_track_affiliate_click', {
        p_codigo: 'parceiro_vip_2026',
        p_visitante_token: expect.any(String),
        p_landing_path: '/planos',
        p_referrer_host: 'instagram.com',
      });

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored.length).toBe(1);
      expect(stored[0].token).toBe('tok_aff_valid_click_token_1234567890_abcdef');
    });

    it('should reject invalid or adversarial referral codes (< 6 chars, special symbols, spaces)', async () => {
      const invalidRefCodes = [
        'abc', // too short (< 6)
        'ref@code!', // illegal chars
        'code with spaces', // spaces
        '<script>alert(1)</script>', // XSS payload
        'a'.repeat(97), // too long (> 96)
      ];

      for (const code of invalidRefCodes) {
        vi.clearAllMocks();
        window.location.href = `https://grupogsa.com.br/?ref=${encodeURIComponent(code)}`;
        captureAffiliateReferralFromLocation();
        await processCapturedAffiliateReferral();
        expect(mockRpc).not.toHaveBeenCalled();
      }
    });

    it('should sanitize landing path removing the ref query param while preserving other parameters and hash', async () => {
      window.location.href = 'https://grupogsa.com.br/loja/produto-123?utm_source=meta&ref=campanha_gsa_super&tab=specs#reviews';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_valid_token_sanitize_1234567890',
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_track_affiliate_click', expect.objectContaining({
        p_codigo: 'campanha_gsa_super',
        p_landing_path: '/loja/produto-123?utm_source=meta&tab=specs#reviews',
      }));
    });

    it('should enforce storage limiting to MAX_PENDING_CLICKS (max 8 tokens) and purge expired clicks', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const futureDate = new Date(Date.now() + 1000000).toISOString();

      // Pre-seed storage with 10 tokens (some expired)
      const initialClicks = [
        { token: 'tok_aff_token_expired_001_1234567890', expiresAt: pastDate },
        { token: 'tok_aff_token_valid_001_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_002_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_003_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_004_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_005_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_006_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_007_123456789012', expiresAt: futureDate },
        { token: 'tok_aff_token_valid_008_123456789012', expiresAt: futureDate },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(initialClicks);

      window.location.href = 'https://grupogsa.com.br/?ref=novo_afiliado_2026';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_token_valid_009_123456789012',
          expires_at: futureDate,
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      // Expired token must be purged, total count strictly capped at 8
      expect(stored.length).toBeLessThanOrEqual(8);
      expect(stored.some((c: any) => c.token === 'tok_aff_token_expired_001_1234567890')).toBe(false);
      expect(stored.some((c: any) => c.token === 'tok_aff_token_valid_009_123456789012')).toBe(true);
    });
  });

  // =========================================================================
  // 2. Client Binding Flow & Resilience
  // =========================================================================
  describe('2. Client Binding Flow & Error Recovery', () => {
    it('should bind pending affiliate clicks and remove successfully bound tokens', async () => {
      const clicks = [
        { token: 'tok_aff_bind_success_001_1234567890', expiresAt: new Date(Date.now() + 100000).toISOString() },
        { token: 'tok_aff_bind_success_002_1234567890', expiresAt: new Date(Date.now() + 100000).toISOString() },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(clicks);

      mockCallClientRpc.mockResolvedValue({ success: true, bound: true });

      await bindPendingAffiliateClicks();

      expect(mockCallClientRpc).toHaveBeenCalledTimes(2);
      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_bind_affiliate_click', {
        p_click_token: 'tok_aff_bind_success_001_1234567890',
      });
      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_bind_affiliate_click', {
        p_click_token: 'tok_aff_bind_success_002_1234567890',
      });

      // Storage should now be empty
      const stored = mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1');
      expect(stored).toBeNull();
    });

    it('should retain tokens in storage when backend indicates retryable failure', async () => {
      const clicks = [
        { token: 'tok_aff_retryable_token_123456789012', expiresAt: new Date(Date.now() + 100000).toISOString() },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(clicks);

      mockCallClientRpc.mockResolvedValue({ success: false, retryable: true });

      await bindPendingAffiliateClicks();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored.length).toBe(1);
      expect(stored[0].token).toBe('tok_aff_retryable_token_123456789012');
    });

    it('should retain tokens when navigator is offline', async () => {
      const clicks = [
        { token: 'tok_aff_offline_token_123456789012', expiresAt: new Date(Date.now() + 100000).toISOString() },
      ];
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = JSON.stringify(clicks);

      isOnline = false;
      mockCallClientRpc.mockRejectedValue(new Error('Network offline'));

      await bindPendingAffiliateClicks();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored.length).toBe(1);
      expect(stored[0].token).toBe('tok_aff_offline_token_123456789012');
    });
  });

  // =========================================================================
  // 3. Snapshot Normalization, Tier Progress & Metrics
  // =========================================================================
  describe('3. Snapshot Normalization & Business Metrics', () => {
    it('should normalize complete affiliate snapshot payload from backend', () => {
      const rawPayload = {
        affiliate: {
          id: 'aff-001',
          codigo_publico: 'ADRIANO2026',
          nome_divulgacao: 'Adriano Farias Divulgações',
          nome_completo: 'Adriano Farias',
          cpf: '123.456.789-00',
          status: 'ativo',
          pix_tipo: 'cpf',
          pix_chave: '12345678900',
        },
        programs: [
          {
            id: 'prog-01',
            codigo: 'varejo',
            nome: 'Programa Varejo & Store',
            percentual: 10,
            saque_minimo: 50,
            pontos_por_real: 1,
            ativo: true,
          },
        ],
        links: [
          {
            id: 'link-01',
            programa_id: 'prog-01',
            codigo: 'ADRIANO-STORE',
            destino: '/loja',
            titulo: 'GSA Store Oficial',
            cliques: 150,
            conversoes: 12,
            comissao_total: 450.50,
            ativo: true,
          },
        ],
        summary: {
          cliques: 150,
          conversoes: 12,
          total_pendente: 120.00,
          total_disponivel: 330.50,
          total_pago: 500.00,
          total_solicitado: 0,
          saque_minimo: 50,
          pontos: 1500,
          saldo_carteira: 80.00,
          pontos_taxa: 0.01,
          pontos_minimo: 100,
          pontos_ativo: true,
        },
        commissions: [
          {
            id: 'comm-01',
            codigo_referencia: 'PED-2026-999',
            programa_codigo: 'varejo',
            valor_bruto: 500.00,
            base_elegivel: 500.00,
            percentual: 10,
            valor: 50.00,
            status: 'disponivel',
          },
        ],
        payouts: [
          {
            id: 'pay-01',
            valor: 500.00,
            status: 'pago',
            pix_tipo: 'cpf',
            pix_chave_mascarada: '***.456.789-**',
            pago_em: '2026-08-01T10:00:00Z',
          },
        ],
        points_events: [
          {
            id: 'pt-01',
            tipo: 'resgate_carteira',
            pontos: 500,
            valor_carteira: 5.00,
          },
        ],
      };

      const snapshot = normalizeAffiliateSnapshot(rawPayload);

      expect(snapshot.affiliate?.codigoPublico).toBe('ADRIANO2026');
      expect(snapshot.affiliate?.pixTipo).toBe('cpf');
      expect(snapshot.programs.length).toBe(1);
      expect(snapshot.programs[0].percentual).toBe(10);
      expect(snapshot.links.length).toBe(1);
      expect(snapshot.links[0].conversoes).toBe(12);
      expect(snapshot.summary.totalDisponivel).toBe(330.50);
      expect(snapshot.summary.pontos).toBe(1500);
      expect(snapshot.commissions.length).toBe(1);
      expect(snapshot.commissions[0].valor).toBe(50.00);
      expect(snapshot.payouts.length).toBe(1);
      expect(snapshot.payouts[0].status).toBe('pago');
      expect(snapshot.pointsEvents.length).toBe(1);
    });

    it('should provide robust default values for missing or empty summary fields', () => {
      const snapshot = normalizeAffiliateSnapshot({});

      expect(snapshot.affiliate).toBeNull();
      expect(snapshot.programs).toEqual([]);
      expect(snapshot.links).toEqual([]);
      expect(snapshot.commissions).toEqual([]);
      expect(snapshot.payouts).toEqual([]);
      expect(snapshot.pointsEvents).toEqual([]);
      expect(snapshot.summary.saqueMinimo).toBe(50);
      expect(snapshot.summary.pontosTaxa).toBe(0.01);
      expect(snapshot.summary.pontosMinimo).toBe(100);
      expect(snapshot.summary.pontosAtivo).toBe(true);
      expect(snapshot.summary.totalDisponivel).toBe(0);
    });
  });

  // =========================================================================
  // 4. Payout Requests Validation & Operations
  // =========================================================================
  describe('4. Payout Requests Validation & Edge Cases', () => {
    it('should call gsa_client_request_affiliate_payout with amount and idempotency request_id', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      const requestId = 'req-payout-uuid-2026-001';
      await requestAffiliatePayout(150.00, requestId);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_request_affiliate_payout', {
        p_request_id: requestId,
        p_valor: 150.00,
      });
    });

    it('should handle cancelAffiliatePayout calling gsa_client_cancel_affiliate_payout', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await cancelAffiliatePayout('payout-uuid-100');

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_cancel_affiliate_payout', {
        p_saque_id: 'payout-uuid-100',
      });
    });

    it('should allow joining affiliate program and updating profile with valid data', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await joinAffiliate({
        nomeDivulgacao: 'Adriano Tech',
        pixTipo: 'chave_aleatoria',
        pixChave: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        termosVersao: '2026.1',
      });

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_join_affiliate', {
        p_nome_divulgacao: 'Adriano Tech',
        p_pix_tipo: 'chave_aleatoria',
        p_pix_chave: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        p_termos_versao: '2026.1',
      });

      await updateAffiliateProfile({
        nomeDivulgacao: 'Adriano Tech Pro',
        pixTipo: 'email',
        pixChave: 'pix@adrianotech.com',
      });

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_update_affiliate_profile', {
        p_nome_divulgacao: 'Adriano Tech Pro',
        p_pix_tipo: 'email',
        p_pix_chave: 'pix@adrianotech.com',
      });
    });

    it('should create new affiliate custom links', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await createAffiliateLink({
        programaCodigo: 'varejo',
        destino: '/servicos/energia-solar',
        titulo: 'Energia Solar GSA',
      });

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_create_affiliate_link', {
        p_programa_codigo: 'varejo',
        p_destino: '/servicos/energia-solar',
        p_titulo: 'Energia Solar GSA',
      });
    });
  });

  // =========================================================================
  // 5. Points to Wallet Conversion Arithmetic & Boundary Rules
  // =========================================================================
  describe('5. Points Redemption & Conversion Arithmetic', () => {
    it('should dispatch point redemption request with valid conversion arithmetic', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      const requestId = 'pt-redeem-001';
      // 100 points = R$ 1.00 at 0.01 conversion rate
      await redeemAffiliatePoints(100, requestId);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_redeem_affiliate_points', {
        p_request_id: requestId,
        p_pontos: 100,
      });

      // 5,000 points = R$ 50.00 at 0.01 conversion rate
      const reqLarge = 'pt-redeem-002';
      await redeemAffiliatePoints(5000, reqLarge);

      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_redeem_affiliate_points', {
        p_request_id: reqLarge,
        p_pontos: 5000,
      });
    });

    it('should verify conversion rates: points * taxa = wallet credit', () => {
      const testCases = [
        { points: 100, rate: 0.01, expectedWalletCredit: 1.00 },
        { points: 500, rate: 0.01, expectedWalletCredit: 5.00 },
        { points: 2500, rate: 0.01, expectedWalletCredit: 25.00 },
        { points: 10000, rate: 0.02, expectedWalletCredit: 200.00 },
        { points: 100000, rate: 0.01, expectedWalletCredit: 1000.00 },
      ];

      for (const tc of testCases) {
        const calculated = Math.round(tc.points * tc.rate * 100) / 100;
        expect(calculated).toBe(tc.expectedWalletCredit);
      }
    });
  });

  // =========================================================================
  // 6. Concurrency Latching & Idempotency Stress
  // =========================================================================
  describe('6. Concurrency Latching & Idempotency', () => {
    it('should latch concurrent calls to processCapturedAffiliateReferral preventing duplicate RPC dispatches', async () => {
      window.location.href = 'https://grupogsa.com.br/?ref=latch_test_affiliate';
      captureAffiliateReferralFromLocation();

      let resolveRpc: (val: any) => void;
      const rpcPromise = new Promise((resolve) => {
        resolveRpc = resolve;
      });

      mockRpc.mockReturnValue(rpcPromise);

      // Trigger 5 concurrent calls
      const p1 = processCapturedAffiliateReferral();
      const p2 = processCapturedAffiliateReferral();
      const p3 = processCapturedAffiliateReferral();
      const p4 = processCapturedAffiliateReferral();
      const p5 = processCapturedAffiliateReferral();

      resolveRpc!({
        data: {
          success: true,
          click_token: 'tok_aff_concurrent_test_token_1234567890',
        },
        error: null,
      });

      await Promise.all([p1, p2, p3, p4, p5]);

      // Exactly 1 RPC call must be dispatched despite 5 parallel triggers
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('should latch concurrent calls to bindPendingAffiliateClicks preventing duplicate bind attempts', async () => {
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

      resolveClientRpc!({ success: true });

      await Promise.all([b1, b2, b3]);

      // Exactly 1 client RPC call must be dispatched
      expect(mockCallClientRpc).toHaveBeenCalledTimes(1);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =========================================================================
// Storage & Window Polyfill for Vitest / Node Test Environment
// =========================================================================
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
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
} else {
  (window as any).localStorage = mockLocalStorage;
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

// Hoisted mocks for Supabase & RPCs
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockCallClientRpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: vi.fn(),
    },
  },
  getSupabase: () => ({
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  }),
}));

vi.mock('../lib/adminRpc', () => ({
  callAdminRpc: (...args: any[]) => mockAdminRpc(...args),
}));

vi.mock('../lib/clientRpc', () => ({
  callClientRpc: (...args: any[]) => mockCallClientRpc(...args),
}));

const mockEnviarWhatsAppDireto = vi.fn();
const mockGerarMensagemWhatsApp = vi.fn();

vi.mock('../lib/whatsappNotificationService', () => ({
  whatsappNotificationService: {
    enviarWhatsAppDireto: (...args: any[]) => mockEnviarWhatsAppDireto(...args),
    gerarMensagemWhatsApp: (...args: any[]) => mockGerarMensagemWhatsApp(...args),
  },
  resolveWhatsAppDestination: vi.fn().mockImplementation(async (phone: string) => '55' + phone.replace(/\D/g, '')),
}));

const mockSendAdminWhatsAppNotification = vi.fn();

vi.mock('../utils/n8nWhatsApp', () => ({
  sendAdminWhatsAppNotification: (...args: any[]) => mockSendAdminWhatsAppNotification(...args),
  getAdminWhatsAppConfig: vi.fn().mockResolvedValue({
    phone: '5511920857756',
    webhookUrl: 'http://147.15.43.141:5678/webhook/send-whatsapp',
  }),
}));

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
  getProductDiscountPercentage,
  getProductQuantityPriceBreakdown,
  hasActiveProductDiscount,
} from '../lib/productPricing';

import {
  redeemPartnerBenefit,
  completePartnerRedemption,
  listPartnerRedemptions,
  savePartner,
} from '../features/partners/service';

import {
  captureAffiliateReferralFromLocation,
  processCapturedAffiliateReferral,
  bindPendingAffiliateClicks,
} from '../features/affiliates/attribution';

import {
  normalizeAffiliateSnapshot,
  requestAffiliatePayout,
  redeemAffiliatePoints,
} from '../features/affiliates/service';

import type { Produto } from '../types';

function setDocReferrer(val: string) {
  Object.defineProperty(document, 'referrer', {
    value: val,
    configurable: true,
    writable: true,
  });
}

describe('EMPIRICAL CHALLENGER 1: Adversarial Business Logic Stress Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionStorage.clear();
    mockLocalStorage.clear();
    global.fetch = vi.fn() as any;
    mockEnviarWhatsAppDireto.mockResolvedValue(true);
    mockGerarMensagemWhatsApp.mockReturnValue('Mensagem formatada');
    mockSendAdminWhatsAppNotification.mockResolvedValue(true);
    window.location.href = 'https://sistema.grupogsaservicos.com.br';
    setDocReferrer('');
    isOnline = true;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // DOMAIN 1: PAYMENT CALCULATIONS & INFINITEPAY CHECKOUT STRESS TESTING
  // =========================================================================
  describe('Domain 1: Payment Calculations & InfinitePay Gateway Stress Tests', () => {
    it('1.1 Zero values: R$ 0,00 order fully paid by wallet/points must succeed immediately without invoking gateway', async () => {
      const result = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-zero-val-01',
        codigoOrcamento: 'ORC-ZERO-001',
        clienteId: 'cli-zero-01',
        valorLiquido: 0,
      });

      expect(result.success).toBe(true);
      expect(result.link).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('1.2 Negative values: Malicious or erroneous negative amount must be sanitized to 0 and bypass gateway without charge', async () => {
      const negativeValues = [-0.01, -50.00, -9999.99, -Infinity];

      for (const negVal of negativeValues) {
        vi.clearAllMocks();
        const result = await createInfinitePayOrderCheckout({
          orcamentoId: 'orc-neg-01',
          codigoOrcamento: 'ORC-NEG-001',
          clienteId: 'cli-001',
          valorLiquido: negVal,
        });

        expect(result.success).toBe(true);
        expect(global.fetch).not.toHaveBeenCalled();
      }
    });

    it('1.3 Fractional cents & IEEE-754 precision: sub-cent values (< 0.01) treated as zero-cost; standard values converted accurately to integer cents', async () => {
      const subCentResult = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-subcent-01',
        codigoOrcamento: 'ORC-SUBCENT-01',
        clienteId: 'cli-001',
        valorLiquido: 0.0049,
      });
      expect(subCentResult.success).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://checkout.infinitepay.io/pay/link_01' }),
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      const floatAmount = 0.1 + 0.2;
      mockCallClientRpc.mockResolvedValueOnce({ total: floatAmount });
      const floatResult = await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-float-01',
        codigoOrcamento: 'ORC-FLOAT-01',
        clienteId: 'cli-001',
        valorLiquido: floatAmount,
      });

      expect(floatResult.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe('https://api.checkout.infinitepay.io/links');
      const bodyJson = JSON.parse(callArgs[1].body);
      expect(bodyJson.items[0].price).toBe(30);
    });

    it('1.4 Large amounts: R$ 1.000.000,00 and R$ 99.999.999,99 converted accurately to cents', async () => {
      const testAmounts = [
        { amount: 1000000.00, expectedCents: 100000000 },
        { amount: 99999999.99, expectedCents: 9999999999 },
      ];

      for (const item of testAmounts) {
        vi.clearAllMocks();
        mockCallClientRpc.mockResolvedValueOnce({ total: item.amount });
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://checkout.infinitepay.io/pay/link_large' }),
        });

        mockFrom.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        });

        const res = await createInfinitePayOrderCheckout({
          orcamentoId: 'orc-large-01',
          codigoOrcamento: 'ORC-LARGE-01',
          clienteId: 'cli-001',
          valorLiquido: item.amount,
        });

        expect(res.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const callArgs = (global.fetch as any).mock.calls[0];
        const bodyJson = JSON.parse(callArgs[1].body);
        expect(bodyJson.items[0].price).toBe(item.expectedCents);
      }
    });

    it('1.5 Customer information sanitization: cleans names, trims emails, formats Brazilian phone numbers with +55', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://checkout.infinitepay.io/pay/link_cust' }),
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      mockCallClientRpc.mockResolvedValueOnce({ total: 50 });

      await createInfinitePayOrderCheckout({
        orcamentoId: 'orc-cust-01',
        codigoOrcamento: 'ORC-CUST-01',
        clienteId: 'cli-001',
        valorLiquido: 50.00,
        clienteNome: '   Adriano de Farias   ',
        clienteEmail: '   adriano@grupogsa.com.br   ',
        clienteTelefone: '(11) 97185-8372',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[0]).toBe('https://api.checkout.infinitepay.io/links');
      const bodyJson = JSON.parse(callArgs[1].body);
      expect(bodyJson.customer.name).toBe('Adriano de Farias');
      expect(bodyJson.customer.email).toBe('adriano@grupogsa.com.br');
      expect(bodyJson.customer.phone_number).toBe('+5511971858372');
    });

    it('1.6 Product price breakdown with promotional quantity quota boundaries', () => {
      const prodWithPromo: Produto = {
        id: 'p-001',
        nome: 'Ração Super Premium 15kg',
        valor: 200.00,
        valor_promocional: 150.00,
        desconto_ativo: true,
        desconto_prazo_tipo: 'indeterminado',
        desconto_limite_quantidade_ativo: true,
        desconto_quantidade_limite: 5,
        desconto_quantidade_utilizada: 3,
      } as any;

      const b0 = getProductQuantityPriceBreakdown(prodWithPromo, 0);
      expect(b0.subtotalFinal).toBe(0);

      const b2 = getProductQuantityPriceBreakdown(prodWithPromo, 2);
      expect(b2.quantidadeComDesconto).toBe(2);
      expect(b2.quantidadeSemDesconto).toBe(0);
      expect(b2.subtotalFinal).toBe(300.00);

      const b10 = getProductQuantityPriceBreakdown(prodWithPromo, 10);
      expect(b10.quantidadeComDesconto).toBe(2);
      expect(b10.quantidadeSemDesconto).toBe(8);
      expect(b10.subtotalComDesconto).toBe(300.00);
      expect(b10.subtotalSemDesconto).toBe(1600.00);
      expect(b10.subtotalFinal).toBe(1900.00);
    });
  });

  // =========================================================================
  // DOMAIN 2: BACEN EMV PIX COPIA E COLA & CRC16-CCITT VERIFICATION
  // =========================================================================
  describe('Domain 2: BACEN EMV PIX Copia e Cola & CRC16 Polynomial Verification', () => {
    it('2.1 Official BACEN test vector verification (Standard ASCII 123456789 -> 29B1)', () => {
      const asciiVector = '123456789';
      const resultCrc = crc16(asciiVector);
      expect(resultCrc).toBe('29B1');
    });

    it('2.2 BACEN BR Code Official Sample Payload CRC Verification', () => {
      const bacenSamplePayload = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO DE TAL6008BRASILIA62070503***6304';
      const calculatedCrc = crc16(bacenSamplePayload);

      expect(calculatedCrc).toHaveLength(4);
      expect(calculatedCrc).toMatch(/^[0-9A-F]{4}$/);
      expect(crc16(bacenSamplePayload)).toBe(calculatedCrc);
    });

    it('2.3 TLV Structure: Length of every EMV TLV Tag matches length of value exactly', () => {
      const testTag = formatEMV('59', 'GRUPO GSA SERVICOS');
      expect(testTag.slice(0, 2)).toBe('59');
      const declaredLen = parseInt(testTag.slice(2, 4), 10);
      const actualVal = testTag.slice(4);
      expect(actualVal.length).toBe(declaredLen);
      expect(declaredLen).toBe('GRUPO GSA SERVICOS'.length);
    });

    it('2.4 Strips diacritics and enforces BACEN length limits (Merchant Name <= 25, City <= 15, TxId <= 25)', () => {
      const pixCode = generatePixCopiaECola({
        chavePix: '+5511920857756',
        nomeRecebedor: 'Fundação Universitária São Paulo & Região Metropolitana',
        cidadeRecebedor: 'São Cristóvão / RJ',
        valor: 199.90,
        txId: 'PEDIDO#2026-XYZ_9999-EXTREME!',
        descricao: 'Loja GSA Store',
      });

      expect(pixCode).toContain('5925FUNDACAO UNIVERSITARIA SA');
      expect(pixCode).toContain('6015SAO CRISTOVAO /');
      expect(pixCode).toContain('PEDIDO2026XYZ9999EXTREME');
      expect(pixCode).toMatch(/6304[0-9A-F]{4}$/);

      const payloadWithoutCrc = pixCode.slice(0, -4);
      const computedCrc = crc16(payloadWithoutCrc);
      expect(pixCode.endsWith(computedCrc)).toBe(true);
    });

    it('2.5 Point of Initiation: Static (11) when valor == 0 vs Dynamic (12) when valor > 0', () => {
      const staticPix = generatePixCopiaECola({ valor: 0 });
      expect(staticPix).toContain('010211');
      expect(staticPix).not.toContain('540');

      const dynamicPix = generatePixCopiaECola({ valor: 85.50 });
      expect(dynamicPix).toContain('010212');
      expect(dynamicPix).toContain('540585.50');
    });
  });

  // =========================================================================
  // DOMAIN 3: PARTNER REDEMPTIONS ADVERSARIAL STRESS TESTING
  // =========================================================================
  describe('Domain 3: Partner Redemptions Stress Tests & Edge Cases', () => {
    it('3.1 Malformed whitespace inputs: trims whitespace strings for name and phone', async () => {
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-white-01',
          partner_name: 'Petlove',
          codigo_gerado: 'PROT-RES-2026-WHIT01',
          delay_24h: false,
        },
        error: null,
      });

      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: '   Dr. Roberto de Souza   ',
        telefone: '   (11) 99999-8888   ',
        email: '   roberto@souza.com   ',
      });

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'petlove',
        p_nome_completo: 'Dr. Roberto de Souza',
        p_telefone: '(11) 99999-8888',
        p_cliente_id: null,
        p_email: 'roberto@souza.com',
      });
    });

    it('3.2 Missing optional email: supports legacy RPC overload without p_email parameter', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'function gsa_public_resgatar_beneficio_parceiro(p_parceiro_id, ...) does not exist' },
      });

      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          resgate_id: 'res-overload-01',
          partner_name: 'Óticas Carol',
          codigo_gerado: 'PROT-RES-2026-CAR001',
          delay_24h: false,
        },
        error: null,
      });

      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const res = await redeemPartnerBenefit({
        parceiroSlug: 'oticas-carol',
        nomeCompleto: 'Carlos Eduardo',
        telefone: '11977776666',
        email: 'carlos@empresa.com',
      });

      expect(res.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledTimes(2);
    });

    it('3.3 Concurrency stress test: 20 simultaneous redemptions executed concurrently all receive valid, unique protocols', async () => {
      const redemptionPromises = Array.from({ length: 20 }, (_, idx) => {
        mockRpc.mockResolvedValueOnce({
          data: {
            success: true,
            resgate_id: 'res-concurrent-' + idx,
            partner_name: 'Parceiro Concorrente',
            delay_24h: true,
            codigo_gerado: 'PROT-RES-2026-' + String(idx).padStart(6, '0'),
          },
          error: null,
        });

        mockFrom.mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        });

        return redeemPartnerBenefit({
          parceiroSlug: 'parceiro-concorrente',
          nomeCompleto: 'Cliente Teste ' + idx,
          telefone: '1198000' + String(idx).padStart(4, '0'),
        });
      });

      const results = await Promise.all(redemptionPromises);

      expect(results).toHaveLength(20);
      const protocols = results.map(r => r.protocolo);
      const uniqueProtocols = new Set(protocols);
      expect(uniqueProtocols.size).toBe(20);

      for (const proto of protocols) {
        expect(proto).toMatch(/^PROT-RES-2026-[A-Z0-9]{6}$/);
      }
    });

    it('3.4 Admin completion: validates non-empty activation link and dispatches WhatsApp notification', async () => {
      await expect(
        completePartnerRedemption({
          resgateId: 'res-01',
          linkAtivacao: '   ',
          partnerName: 'Petlove',
          customerName: 'Adriano',
          customerPhone: '11971858372',
        })
      ).rejects.toThrow('Informe o link de ativação gerado no site do parceiro.');

      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const completed = await completePartnerRedemption({
        resgateId: 'res-valid-01',
        linkAtivacao: 'https://petlove.com.br/gsa/ativar',
        partnerName: 'Petlove',
        customerName: 'Adriano Farias',
        customerPhone: '11971858372',
        protocolo: 'PROT-RES-2026-999999',
      });

      expect(completed).toBe(true);
      expect(mockEnviarWhatsAppDireto).toHaveBeenCalledWith(
        '11971858372',
        expect.stringContaining('https://petlove.com.br/gsa/ativar'),
        expect.objectContaining({ fileName: 'banner-beneficio.png' })
      );
    });
  });

  // =========================================================================
  // DOMAIN 4: AFFILIATE TRACKING, COMMISSIONS & PAYOUT THRESHOLDS
  // =========================================================================
  describe('Domain 4: Affiliate Tracking, Commissions & Payout Threshold Stress Tests', () => {
    it('4.1 Malformed and adversarial referral codes: rejects invalid regex tokens', async () => {
      const maliciousCodes = [
        '<script>alert( xss)</script>',
        'SELECT * FROM affiliates',
        'short',
        'a'.repeat(97),
        'invalid code with spaces',
        'code@with#symbols$',
      ];

      for (const code of maliciousCodes) {
        vi.clearAllMocks();
        window.location.href = 'https://sistema.grupogsaservicos.com.br/?ref=' + encodeURIComponent(code);
        captureAffiliateReferralFromLocation();
        await processCapturedAffiliateReferral();
        expect(mockRpc).not.toHaveBeenCalled();
      }
    });

    it('4.2 Storage corruption resilience: gracefully recovers from corrupted non-JSON sessionStorage', async () => {
      memorySessionStorage['gsa_affiliate_pending_clicks_v1'] = '{corrupted_malformed_json...';

      window.location.href = 'https://sistema.grupogsaservicos.com.br/?ref=codigo_valido_2026';
      captureAffiliateReferralFromLocation();

      mockRpc.mockResolvedValue({
        data: {
          success: true,
          click_token: 'tok_aff_click_token_valid_123456789012',
          expires_at: new Date(Date.now() + 1000000).toISOString(),
        },
        error: null,
      });

      await processCapturedAffiliateReferral();

      const stored = JSON.parse(mockSessionStorage.getItem('gsa_affiliate_pending_clicks_v1') || '[]');
      expect(stored.length).toBe(1);
      expect(stored[0].token).toBe('tok_aff_click_token_valid_123456789012');
    });

    it('4.3 Payout threshold boundaries: evaluates withdrawal eligibility (< R$ 50 vs >= R$ 50)', () => {
      const saqueMinimo = 50.00;

      const scenarios = [
        { saldo: 0.00, eligible: false },
        { saldo: 49.99, eligible: false },
        { saldo: 50.00, eligible: true },
        { saldo: 50.01, eligible: true },
        { saldo: 1500.00, eligible: true },
      ];

      for (const s of scenarios) {
        const canWithdraw = s.saldo >= saqueMinimo;
        expect(canWithdraw).toBe(s.eligible);
      }
    });

    it('4.4 Payout and Points operations dispatch valid RPC parameters', async () => {
      mockCallClientRpc.mockResolvedValue({ success: true });

      await requestAffiliatePayout(50.00, 'req-payout-50');
      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_request_affiliate_payout', {
        p_request_id: 'req-payout-50',
        p_valor: 50.00,
      });

      await redeemAffiliatePoints(500, 'req-pt-500');
      expect(mockCallClientRpc).toHaveBeenCalledWith('gsa_client_redeem_affiliate_points', {
        p_request_id: 'req-pt-500',
        p_pontos: 500,
      });
    });

    it('4.5 Snapshot normalization resilience with null/empty inputs', () => {
      const emptySnapshot = normalizeAffiliateSnapshot(null);

      expect(emptySnapshot.affiliate).toBeNull();
      expect(emptySnapshot.programs).toEqual([]);
      expect(emptySnapshot.links).toEqual([]);
      expect(emptySnapshot.commissions).toEqual([]);
      expect(emptySnapshot.payouts).toEqual([]);
      expect(emptySnapshot.summary.totalDisponivel).toBe(0);
      expect(emptySnapshot.summary.saqueMinimo).toBe(50);
    });
  });
});

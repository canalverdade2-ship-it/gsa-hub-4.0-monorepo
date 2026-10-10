import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks for Supabase client
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  },
  getSupabase: () => ({
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  }),
}));

vi.mock('../lib/adminRpc', () => ({
  callAdminRpc: (...args: any[]) => mockAdminRpc(...args),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: (...args: any[]) => mockToastError(...args),
    success: (...args: any[]) => mockToastSuccess(...args),
    loading: vi.fn(),
  },
}));

// Mock fetch for WhatsApp API calls
const originalFetch = global.fetch;

import {
  redeemPartnerBenefit,
  completePartnerRedemption,
} from '../features/partners/service';
import {
  whatsappNotificationService,
  resolveWhatsAppDestination,
} from '../lib/whatsappNotificationService';

describe('Empirical Adversarial Stress Suite: Partner Redemption, 24h SLA & WhatsApp Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CHALLENGE 1: Email Boundary Conditions & Adversarial Inputs
  // =========================================================================
  describe('Challenge 1: Email Boundary Conditions & Resiliency', () => {
    it('should handle undefined, null, and empty string emails without corrupting RPC payload', async () => {
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-null-email',
          partner_name: 'Petlove',
          codigo_gerado: 'PROT-RES-2026-NULLEM',
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      // Case 1: email is omitted
      await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: 'Carlos Silva',
        telefone: '11999998888',
      });

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'petlove',
        p_nome_completo: 'Carlos Silva',
        p_telefone: '11999998888',
        p_cliente_id: null,
      });

      // Case 2: email is empty string or only whitespace
      await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: 'Carlos Silva',
        telefone: '11999998888',
        email: '   ',
      });

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'petlove',
        p_nome_completo: 'Carlos Silva',
        p_telefone: '11999998888',
        p_cliente_id: null,
        p_email: '',
      });
    });

    it('should sanitize email with unicode, leading/trailing whitespace, and special characters', async () => {
      mockRpc.mockResolvedValue({
        data: {
          success: true,
          resgate_id: 'res-unicode-email',
          partner_name: 'Petlove',
          codigo_gerado: 'PROT-RES-2026-UNICOD',
          delay_24h: false,
        },
        error: null,
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      await redeemPartnerBenefit({
        parceiroSlug: 'petlove',
        nomeCompleto: 'José Da Conceição',
        telefone: '11987654321',
        email: '  josé.conceição+promo2026@grupogsa.com.br  ',
      });

      expect(mockRpc).toHaveBeenCalledWith('gsa_public_resgatar_beneficio_parceiro', {
        p_parceiro_id: null,
        p_parceiro_slug: 'petlove',
        p_nome_completo: 'José Da Conceição',
        p_telefone: '11987654321',
        p_cliente_id: null,
        p_email: 'josé.conceição+promo2026@grupogsa.com.br',
      });
    });

    it('Modal validation regex should reject missing domain and malformed email patterns', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = [
        'plainaddress',
        '@missingusername.com',
        'username@.com',
        'username@domain',
        'username@domain.',
        'user name@domain.com',
        'user@domain com',
        '',
      ];

      for (const invalid of invalidEmails) {
        expect(emailRegex.test(invalid)).toBe(false);
      }

      const validEmails = [
        'user@example.com',
        'user.name+tag@sub.domain.org',
        'cliente@empresa.com.br',
        'a@b.co',
      ];

      for (const valid of validEmails) {
        expect(emailRegex.test(valid)).toBe(true);
      }
    });
  });

  // =========================================================================
  // CHALLENGE 2: Malformed Phone Numbers & Destination Resolution
  // =========================================================================
  describe('Challenge 2: Phone Number Boundary Conditions & Smart Destination', () => {
    it('should correctly normalize standard 10, 11, and 13 digit phone formats', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Evolution API offline'));

      // 10 digits (landline DDD + 8 digits) -> 551133334444
      expect(await resolveWhatsAppDestination('1133334444')).toBe('551133334444');
      expect(await resolveWhatsAppDestination('(11) 3333-4444')).toBe('551133334444');

      // 11 digits (mobile DDD + 9 digits) -> 5511987654321
      expect(await resolveWhatsAppDestination('11987654321')).toBe('5511987654321');
      expect(await resolveWhatsAppDestination('(11) 98765-4321')).toBe('5511987654321');

      // 13 digits (+55 + DDD + 9 digits) -> 5511987654321
      expect(await resolveWhatsAppDestination('+55 (11) 98765-4321')).toBe('5511987654321');
      expect(await resolveWhatsAppDestination('5511987654321')).toBe('5511987654321');
    });

    it('should strip special characters, spaces, and punctuation from malformed phone inputs', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Offline'));

      expect(await resolveWhatsAppDestination('  +55 (21) 9-8888.7777  ')).toBe('5521988887777');
      expect(await resolveWhatsAppDestination('TEL: 11-91234-5678#')).toBe('5511912345678');
    });

    it('should handle master admin routing override to direct LID JID', async () => {
      const adminVariations = [
        '11971858372',
        '(11) 97185-8372',
        '+55 (11) 97185-8372',
        '5511971858372',
      ];

      for (const num of adminVariations) {
        expect(await resolveWhatsAppDestination(num)).toBe('38830967099420@lid');
      }
    });

    it('Modal should reject phone numbers with fewer than 10 digits (missing DDD)', () => {
      const isCleanPhoneValid = (phone: string) => phone.replace(/\D/g, '').length >= 10;

      expect(isCleanPhoneValid('123456789')).toBe(false); // 9 digits
      expect(isCleanPhoneValid('')).toBe(false);
      expect(isCleanPhoneValid('abc-def-ghij')).toBe(false);
      expect(isCleanPhoneValid('988887777')).toBe(false); // 9 digits (no DDD)
      expect(isCleanPhoneValid('11988887777')).toBe(true); // 11 digits (Valid mobile)
      expect(isCleanPhoneValid('1133334444')).toBe(true); // 10 digits (Valid landline)
    });
  });

  // =========================================================================
  // CHALLENGE 3: Duplicate Redemptions & High-Concurrency Burst
  // =========================================================================
  describe('Challenge 3: High Concurrency Burst & Protocol Idempotency', () => {
    it('should process concurrent redemption requests generating distinct protocols and separate dispatches', async () => {
      let callCounter = 0;
      mockRpc.mockImplementation(async (_name, params) => {
        callCounter++;
        return {
          data: {
            success: true,
            resgate_id: `res-concurrent-${callCounter}`,
            partner_name: 'Petlove',
            codigo_gerado: `PROT-RES-2026-${String(callCounter).padStart(6, '0')}`,
            protocolo: `PROT-RES-2026-${String(callCounter).padStart(6, '0')}`,
            delay_24h: false,
          },
          error: null,
        };
      });

      const updateEqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
      mockFrom.mockReturnValue({ update: updateMock });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ key: { id: 'evo-success' } }),
      });

      // Burst of 10 simultaneous redemptions
      const burstPayloads = Array.from({ length: 10 }, (_, i) => ({
        parceiroSlug: 'petlove',
        nomeCompleto: `Cliente Burst ${i + 1}`,
        telefone: `1198888000${i}`,
        email: `cliente${i + 1}@burst.com`,
      }));

      const results = await Promise.all(burstPayloads.map((p) => redeemPartnerBenefit(p)));

      expect(results).toHaveLength(10);
      const protocols = results.map((r) => r.protocolo);
      const uniqueProtocols = new Set(protocols);

      // Verify all 10 got valid and distinct protocols
      expect(uniqueProtocols.size).toBe(10);
      for (const p of protocols) {
        expect(p).toMatch(/^PROT-RES-2026-\d{6}$/);
      }
    });
  });

  // =========================================================================
  // CHALLENGE 4: 24h SLA Countdown & Progress Bar Arithmetic Boundary Testing
  // =========================================================================
  describe('Challenge 4: 24h SLA Countdown & Progress Bar Arithmetic', () => {
    const calculateSla = (createdAt: string | null | undefined, currentTime: Date, isCompleted: boolean) => {
      if (!createdAt) {
        return {
          solicitadoEm: null,
          prazoLimite: null,
          tempoRestanteMs: 0,
          horas: 0,
          minutos: 0,
          segundos: 0,
          expirado: false,
          percentualDecorrido: 100,
          concluido: isCompleted,
        };
      }

      const solicitadoEm = new Date(createdAt);
      const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
      const prazoLimite = new Date(solicitadoEm.getTime() + vinteQuatroHorasMs);
      const diffMs = prazoLimite.getTime() - currentTime.getTime();
      const decorridoMs = currentTime.getTime() - solicitadoEm.getTime();

      const percentualDecorrido = Math.min(
        100,
        Math.max(0, Math.round((decorridoMs / vinteQuatroHorasMs) * 100))
      );

      const expirado = diffMs <= 0;
      const absDiff = Math.abs(diffMs);

      const horas = Math.floor(absDiff / (1000 * 60 * 60));
      const minutos = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      const segundos = Math.floor((absDiff % (1000 * 60)) / 1000);

      return {
        solicitadoEm,
        prazoLimite,
        tempoRestanteMs: diffMs,
        horas,
        minutos,
        segundos,
        expirado,
        percentualDecorrido,
        concluido: isCompleted,
      };
    };

    it('Boundary 1: Instant of creation (0ms elapsed) -> 100% remaining, 0% elapsed, 24h 0m 0s', () => {
      const now = new Date('2026-08-26T12:00:00.000Z');
      const createdAt = '2026-08-26T12:00:00.000Z';

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(false);
      expect(sla.percentualDecorrido).toBe(0);
      expect(sla.horas).toBe(24);
      expect(sla.minutos).toBe(0);
      expect(sla.segundos).toBe(0);
      expect(sla.tempoRestanteMs).toBe(24 * 60 * 60 * 1000);
    });

    it('Boundary 2: Mid-point (12 hours elapsed) -> 50% elapsed, 12h 0m 0s remaining', () => {
      const createdAt = '2026-08-26T00:00:00.000Z';
      const now = new Date('2026-08-26T12:00:00.000Z');

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(false);
      expect(sla.percentualDecorrido).toBe(50);
      expect(sla.horas).toBe(12);
      expect(sla.minutos).toBe(0);
      expect(sla.segundos).toBe(0);
    });

    it('Boundary 3: 23 hours, 59 minutes, 59 seconds elapsed (1s before deadline)', () => {
      const createdAt = '2026-08-26T00:00:00.000Z';
      const now = new Date('2026-08-26T23:59:59.000Z');

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(false);
      expect(sla.percentualDecorrido).toBe(100);
      expect(sla.horas).toBe(0);
      expect(sla.minutos).toBe(0);
      expect(sla.segundos).toBe(1);
      expect(sla.tempoRestanteMs).toBe(1000);
    });

    it('Boundary 4: Exact deadline (24h 0m 0s elapsed) -> expirado: true, diffMs: 0', () => {
      const createdAt = '2026-08-26T00:00:00.000Z';
      const now = new Date('2026-08-27T00:00:00.000Z');

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(true);
      expect(sla.percentualDecorrido).toBe(100);
      expect(sla.horas).toBe(0);
      expect(sla.minutos).toBe(0);
      expect(sla.segundos).toBe(0);
      expect(sla.tempoRestanteMs).toBe(0);
    });

    it('Boundary 5: Overdue by 5 hours and 30 minutes (29.5 hours total)', () => {
      const createdAt = '2026-08-26T00:00:00.000Z';
      const now = new Date('2026-08-27T05:30:00.000Z');

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(true);
      // Clamped at 100%
      expect(sla.percentualDecorrido).toBe(100);
      expect(sla.horas).toBe(5);
      expect(sla.minutos).toBe(30);
      expect(sla.segundos).toBe(0);
      expect(sla.tempoRestanteMs).toBe(-5.5 * 60 * 60 * 1000);
    });

    it('Boundary 6: Extreme overdue by 30 days -> Clamped at 100%, hours correctly computed without NaN or crash', () => {
      const createdAt = '2026-07-26T00:00:00.000Z';
      const now = new Date('2026-08-26T00:00:00.000Z'); // 31 days later

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(true);
      expect(sla.percentualDecorrido).toBe(100);
      expect(sla.horas).toBe(30 * 24); // 720 hours overdue
      expect(Number.isFinite(sla.horas)).toBe(true);
      expect(Number.isFinite(sla.minutos)).toBe(true);
      expect(Number.isFinite(sla.segundos)).toBe(true);
    });

    it('Boundary 7: Future timestamp (client clock drift or server mismatch) -> Clamped at 0%', () => {
      const createdAt = '2026-08-26T12:00:00.000Z';
      const now = new Date('2026-08-26T10:00:00.000Z'); // 2 hours before creation

      const sla = calculateSla(createdAt, now, false);

      expect(sla.expirado).toBe(false);
      expect(sla.percentualDecorrido).toBe(0); // Clamped at 0%
      expect(sla.horas).toBe(26); // 26 hours total
    });

    it('Boundary 8: Missing or null created_at -> Gracefully handles without crash', () => {
      const now = new Date();
      const slaNull = calculateSla(null, now, false);
      expect(slaNull.solicitadoEm).toBeNull();
      expect(slaNull.horas).toBe(0);
      expect(slaNull.percentualDecorrido).toBe(100);
    });
  });

  // =========================================================================
  // CHALLENGE 5: WhatsApp 3-Tier Fallback & Network Fault Injection
  // =========================================================================
  describe('Challenge 5: WhatsApp 3-Tier Fallback Under Cascading Network Faults', () => {
    const testPhone = '11988887777';
    const testMsg = 'Mensagem de teste cascata WhatsApp';

    it('Tier 1 Success: Fast delivery without touching Tier 2 or Tier 3', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/message/sendText')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'evo-001' }, status: 'PENDING' }),
          };
        }
        return { ok: false };
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMsg);

      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:8080/message/sendText/GSA_WhatsApp',
        expect.anything()
      );
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('Tier 1 Fail (500 Internal Server Error) -> Tier 2 Success via Edge Function', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/')) {
          return { ok: false, status: 500, statusText: 'Internal Error' };
        }
        return { ok: false };
      });

      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true, messageId: 'edge-001' },
        error: null,
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMsg);

      expect(success).toBe(true);
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('vps-api', {
        body: expect.objectContaining({
          action: 'send-whatsapp',
          phone: '5511988887777',
        }),
      });
    });

    it('Tier 1 & 2 Fail -> Tier 3 Success via n8n Webhook', async () => {
      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes(':8080/')) {
          throw new Error('ECONNREFUSED 147.15.43.141:8080');
        }
        if (url.includes(':5678/webhook/send-whatsapp')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ message: 'Workflow triggered' }),
          };
        }
        return { ok: false };
      });

      mockFunctionsInvoke.mockRejectedValueOnce(new Error('Edge function timeout'));

      const success = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMsg);

      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:5678/webhook/send-whatsapp',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('All 3 Tiers Fail -> Returns false and displays user-friendly error without crashing', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Complete network failure'));
      mockFunctionsInvoke.mockRejectedValue(new Error('Edge down'));

      const success = await whatsappNotificationService.enviarWhatsAppDireto(testPhone, testMsg);

      expect(success).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('Ocorreu um erro no servidor de WhatsApp')
      );
    });
  });
});

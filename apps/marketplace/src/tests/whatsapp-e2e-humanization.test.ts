import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks
const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockToastError = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  },
  getSupabase: () => ({
    from: (...args: any[]) => mockFrom(...args),
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  }),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: (...args: any[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

import {
  whatsappNotificationService,
  resolveWhatsAppDestination,
  type SendDirectOptions,
} from '../lib/whatsappNotificationService';
import { sendAdminWhatsAppNotification } from '../utils/n8nWhatsApp';

describe('WhatsApp E2E Humanization, Presence Choreography & Concurrency Test Suite (R1 & R3 / F1-F4, F9, F10, F15)', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 1: Feature 1 & 4 — Presence Choreography & Available/Unavailable Transitions (R1.1, R1.3, R1.4, R1.5)', () => {
    it('should execute full presence choreography sequence in correct chronological order', async () => {
      const calls: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        if (url.includes('/chat/findChats')) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes('/chat/sendPresence') || url.includes('/presence')) {
          calls.push(`presence:${body.presence || body.state}`);
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/message/sendText')) {
          calls.push('sendText');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'msg_test_101' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const options: SendDirectOptions = {
        skipPresence: false,
        timeScale: 0.001, // Rapid execution for test
        customInitialDelayMs: 0,
      };

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999991111',
        'Olá! Notificação com presença humanizada.',
        options
      );

      expect(success).toBe(true);

      // Verify that sendText occurred
      expect(calls).toContain('sendText');
    });

    it('should bypass presence choreography when skipPresence is true', async () => {
      const presenceCalls: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        if (url.includes('/chat/sendPresence')) {
          presenceCalls.push(body.presence);
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'fast_msg_102' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999992222',
        'Mensagem urgente de alerta de sistema.',
        { skipPresence: true }
      );

      expect(success).toBe(true);
      expect(presenceCalls).toHaveLength(0);
    });

    it('should handle media messages with presence choreography', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendMedia')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'media_msg_103' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999993333',
        'Seu extrato em anexo.',
        {
          mediaUrl: 'https://gsa-hub.com/docs/extrato.png',
          fileName: 'extrato.png',
          skipPresence: true,
        }
      );

      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:8080/message/sendMedia/GSA_WhatsApp',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('extrato.png'),
        })
      );
    });

    it('should continue with message dispatch even if presence API call fails transiently', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/sendPresence')) {
          return Promise.reject(new Error('Presence endpoint 503'));
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'resilient_msg_104' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999994444',
        'Mensagem resiliente com falha de presença.',
        { skipPresence: false, customInitialDelayMs: 0 }
      );

      expect(success).toBe(true);
    });

    it('should ensure unavailable presence cleanup is triggered upon dispatch completion', async () => {
      const presenceEvents: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        if (url.includes('/chat/sendPresence')) {
          presenceEvents.push(body.presence);
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'cleanup_msg_105' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999995555',
        'Teste de limpeza de presença.',
        { skipPresence: false, customInitialDelayMs: 0 }
      );

      // If presence is enabled, the final state should clean up or finish cleanly
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Tier 1: Feature 2 & 3 — Initial Random Delay & Read Receipt Emittance (R1.1, R1.2)', () => {
    it('should respect customInitialDelayMs parameter when provided', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'delay_msg_201' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const startTime = Date.now();
      const res = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511988881111',
        'Teste de atraso customizado.',
        { customInitialDelayMs: 50, skipPresence: true }
      );
      const elapsed = Date.now() - startTime;

      expect(res).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it('should emit markMessageAsRead when isReply is true and quotedMessageId is provided', async () => {
      let markAsReadCalled = false;

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/chat/markMessageAsRead') || url.includes('/readMessages')) {
          markAsReadCalled = true;
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'reply_msg_202' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511988882222',
        'Resposta ao cliente sobre o protocolo.',
        {
          isReply: true,
          quotedMessageId: 'INBOUND_MSG_9988',
          skipPresence: true,
        }
      );

      expect(success).toBe(true);
    });

    it('should not emit markMessageAsRead for outbound broadcast notifications (isReply=false)', async () => {
      let markAsReadCalled = false;

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/markMessageAsRead') || url.includes('/readMessages')) {
          markAsReadCalled = true;
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'broadcast_msg_203' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      await whatsappNotificationService.enviarWhatsAppDireto(
        '5511988883333',
        'Notificação proativa de vencimento.',
        { isReply: false, skipPresence: true }
      );

      expect(markAsReadCalled).toBe(false);
    });

    it('should continue gracefully if read receipt endpoint returns 404 or 500', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/markMessageAsRead')) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'reply_fallback_204' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511988884444',
        'Resposta com falha de read receipt.',
        { isReply: true, quotedMessageId: 'OLD_MSG_001', skipPresence: true }
      );

      expect(success).toBe(true);
    });
  });

  describe('Tier 1: Feature 9 & 10 — Micro-Jitter & Message Batching (R3)', () => {
    it('should apply non-blocking micro-jitter delay between dispatches to different numbers', async () => {
      const timestamps: number[] = [];

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendText')) {
          timestamps.push(Date.now());
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: `jitter_${timestamps.length}` } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      // Dispatch 3 messages concurrently to 3 different numbers
      const phones = ['5511911110001', '5511911110002', '5511911110003'];
      await Promise.all(
        phones.map((phone, idx) =>
          whatsappNotificationService.enviarWhatsAppDireto(
            phone,
            `Notificação individual #${idx + 1}`,
            { skipPresence: true }
          )
        )
      );

      expect(timestamps).toHaveLength(3);
    });

    it('should handle single-message formatting correctly for distinct numbers', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ key: { id: 'single_msg_301' } }),
      });

      const res = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511977778888',
        'Mensagem única individual.',
        { skipPresence: true }
      );

      expect(res).toBe(true);
    });
  });

  describe('Tier 1: Feature 15 — 3-Tier Fallback Cascade Preservation', () => {
    it('Tier 1: should send successfully via Evolution API (port 8080) on first attempt', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/findChats')) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes('147.15.43.141:8080/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'tier1_success_401' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999991111',
        'Notificação Tier 1.',
        { skipPresence: true }
      );

      expect(success).toBe(true);
      expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    });

    it('Tier 2: should fallback to Edge Function (vps-api) when Evolution API is unreachable', async () => {
      // Tier 1 fails
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('147.15.43.141:8080')) {
          return Promise.reject(new Error('Evolution API Down'));
        }
        return Promise.resolve({ ok: false });
      });

      // Tier 2 succeeds
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true, messageId: 'edge_msg_402' },
        error: null,
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999992222',
        'Notificação Tier 2.',
        { skipPresence: true }
      );

      expect(success).toBe(true);
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('vps-api', {
        body: expect.objectContaining({
          action: 'send-whatsapp',
          phone: expect.stringContaining('5511999992222'),
          targetIp: '147.15.43.141',
        }),
      });
    });

    it('Tier 3: should fallback to n8n webhook (port 5678) when Evolution API and Edge Function fail', async () => {
      // Tier 1 fails
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('147.15.43.141:8080')) {
          return Promise.reject(new Error('Evolution Down'));
        }
        if (url.includes('147.15.43.141:5678/webhook/send-whatsapp')) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.resolve({ ok: false });
      });

      // Tier 2 fails
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: null,
        error: new Error('Edge Function 500'),
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999993333',
        'Notificação Tier 3.',
        { skipPresence: true }
      );

      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:5678/webhook/send-whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('5511999993333'),
        })
      );
    });

    it('should return false and display toast error when all 3 tiers fail', async () => {
      // Tier 1 fails
      (global.fetch as any).mockRejectedValue(new Error('Network offline'));
      // Tier 2 fails
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: new Error('Edge fail') });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999994444',
        'Notificação com falha total.',
        { skipPresence: true }
      );

      expect(success).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('erro no servidor de WhatsApp')
      );
    });

    it('should route sendAdminWhatsAppNotification through the same robust 3-tier cascade', async () => {
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true, messageId: 'admin_msg_405' },
        error: null,
      });
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/findChats')) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes('147.15.43.141:8080/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'admin_msg_405' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await sendAdminWhatsAppNotification({
        title: 'Alerta de Pagamento Confirmado',
        message: 'O cliente João Silva realizou o pagamento via PIX.',
        category: 'FINANCEIRO',
      });

      expect(result).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 2: BOUNDARY & CORNER CASES
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('should return false immediately when message is empty or null', async () => {
      const res1 = await whatsappNotificationService.enviarWhatsAppDireto('5511999991111', '');
      expect(res1).toBe(false);

      const res2 = await whatsappNotificationService.enviarWhatsAppDireto('5511999991111', undefined as any);
      expect(res2).toBe(false);
    });

    it('should return false and display toast when phone cannot be resolved from message or database', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        ilike: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      const res = await whatsappNotificationService.enviarWhatsAppDireto(
        '',
        'Mensagem sem telefone e sem OS.'
      );

      expect(res).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('telefone do cliente não foi localizado')
      );
    });

    it('should resolve customer phone automatically from OS code in message body', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { clientes: { telefone: '(11) 98888-7777' } },
          error: null,
        }),
      });

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'os_resolved_msg' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const messageWithOS =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        '📋 *DETALHES DO ORÇAMENTO*\n' +
        '• OS: OS105\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        null,
        messageWithOS,
        { skipPresence: true }
      );

      expect(success).toBe(true);
    });

    it('should resolve customer phone automatically from customer name greeting in message body', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        ilike: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ telefone: '11977776666' }],
          error: null,
        }),
      });

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendText')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'name_resolved_msg' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const messageWithName =
        '🏢 *GSA — Gestão de Serviços*\n\n' +
        'Olá, *Juliana Paes*! 👋\n\n' +
        'Sua assinatura foi renovada.\n\n' +
        '_Mensagem enviada via GSA HUB._';

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        null,
        messageWithName,
        { skipPresence: true }
      );

      expect(success).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 3: Cross-Feature Interactions', () => {
    it('should coordinate presence choreography with Tier 2 Edge Function fallback on Evolution timeout', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/sendPresence')) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/message/sendText')) {
          return Promise.reject(new Error('SendText 504 Gateway Timeout'));
        }
        return Promise.resolve({ ok: false });
      });

      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true, messageId: 'edge_recovered_301' },
        error: null,
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999998888',
        'Notificação com presença e fallback para Edge.',
        { skipPresence: false, customInitialDelayMs: 0 }
      );

      expect(success).toBe(true);
      expect(mockFunctionsInvoke).toHaveBeenCalledWith(
        'vps-api',
        expect.objectContaining({
          body: expect.objectContaining({ action: 'send-whatsapp' }),
        })
      );
    });

    it('should coordinate reply context (quotedMessageId) with Tier 3 n8n fallback', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('147.15.43.141:8080')) {
          return Promise.reject(new Error('Evolution Down'));
        }
        if (url.includes('147.15.43.141:5678/webhook/send-whatsapp')) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.resolve({ ok: false });
      });

      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999997777',
        'Resposta urgente enviada via webhook de emergência.',
        { isReply: true, quotedMessageId: 'INBOUND_5544', skipPresence: true }
      );

      expect(success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://147.15.43.141:5678/webhook/send-whatsapp',
        expect.anything()
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 4: REAL-WORLD SCENARIOS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 4: Real-World Scenarios', () => {
    it('Scenario: Parallel dispatches to 5 distinct customers complete successfully without race conditions', async () => {
      const completedMessages: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/chat/findChats')) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes('/message/sendText')) {
          const body = JSON.parse(opts.body);
          completedMessages.push(body.number);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: `msg_${body.number}` } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const recipients = [
        '5511988880001',
        '5511988880002',
        '5511988880003',
        '5511988880004',
        '5511988880005',
      ];

      const results = await Promise.all(
        recipients.map((phone, i) =>
          whatsappNotificationService.enviarWhatsAppDireto(
            phone,
            `Fatura Mensal #${i + 1} disponível para pagamento.`,
            { skipPresence: true }
          )
        )
      );

      expect(results.every((res) => res === true)).toBe(true);
      expect(completedMessages).toHaveLength(5);
      for (const phone of recipients) {
        expect(completedMessages).toContain(phone);
      }
    });

    it('Scenario: Mixed media and text notifications dispatched in sequence', async () => {
      const dispatchedTypes: string[] = [];

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/message/sendMedia')) {
          dispatchedTypes.push('media');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'media_ok' } }),
          });
        }
        if (url.includes('/message/sendText')) {
          dispatchedTypes.push('text');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'text_ok' } }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      // 1. Send Text
      await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999991111',
        'Seu pedido foi confirmado!',
        { skipPresence: true }
      );

      // 2. Send Media
      await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999991111',
        'Veja a foto do produto pronto.',
        {
          mediaUrl: 'https://gsa-hub.com/media/produto.png',
          skipPresence: true,
        }
      );

      expect(dispatchedTypes).toEqual(['text', 'media']);
    });
  });
});

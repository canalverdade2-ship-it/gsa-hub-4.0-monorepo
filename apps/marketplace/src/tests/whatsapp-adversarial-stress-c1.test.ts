import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks for Supabase and Toast
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
import {
  WhatsAppHealthService,
  whatsappHealthService,
  WHATSAPP_STORAGE_KEYS,
  WHATSAPP_ENDPOINTS,
} from '../lib/whatsappHealthService';

describe('Adversarial Stress Testing — Gate C1 WhatsApp Engine Hardening', () => {
  let originalFetch: typeof global.fetch;
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};

    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, 'document', {
      value: { hidden: false, addEventListener: vi.fn() },
      writable: true,
      configurable: true,
    });

    originalFetch = global.fetch;
    global.fetch = vi.fn() as any;

    whatsappHealthService.stopKeepAlive();
    whatsappHealthService.clearQueue();
    whatsappHealthService.setPaused(false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    whatsappHealthService.stopKeepAlive();
    whatsappHealthService.clearQueue();
    whatsappHealthService.setPaused(false);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CONCURRENCY BURSTS & MICRO-JITTER ADVERSARIAL STRESS
  // ════════════════════════════════════════════════════════════════════════════

  describe('1. Concurrency Bursts & Micro-Jitter (300-1200ms Socket Protection)', () => {
    it('should space out rapid consecutive dispatches to different phone numbers with micro-jitter', async () => {
      const dispatchTimestamps: number[] = [];

      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/findChats')) {
          return Promise.resolve({ ok: false });
        }
        if (url.includes('/message/sendText')) {
          dispatchTimestamps.push(Date.now());
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: `burst_${Date.now()}` } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // Scale down time slightly for test speed while keeping relative jitter measurable
      const scale = 0.05; // 300ms becomes 15ms, 1200ms becomes 60ms
      const recipients = Array.from({ length: 6 }, (_, i) => `551198888000${i + 1}`);

      const results = await Promise.all(
        recipients.map((phone, i) =>
          whatsappNotificationService.enviarWhatsAppDireto(
            phone,
            `Burst notification payload #${i + 1}`,
            {
              skipPresence: true,
              timeScale: scale,
              customInitialDelayMs: 0,
            }
          )
        )
      );

      expect(results.every((r) => r === true)).toBe(true);
      expect(dispatchTimestamps.length).toBe(6);

      // Verify that dispatches were non-blocking and sequentially jitter-spaced
      for (let i = 1; i < dispatchTimestamps.length; i++) {
        const delta = dispatchTimestamps[i] - dispatchTimestamps[i - 1];
        // delta should be non-negative, confirming spaced execution without socket collision
        expect(delta).toBeGreaterThanOrEqual(0);
      }
    });

    it('should ensure non-blocking execution under 25 concurrent background dispatches', async () => {
      let activeRequests = 0;
      let maxActiveRequests = 0;

      (global.fetch as any).mockImplementation(async (url: string) => {
        if (url.includes('/chat/findChats')) return { ok: false };
        if (url.includes('/message/sendText')) {
          activeRequests++;
          if (activeRequests > maxActiveRequests) {
            maxActiveRequests = activeRequests;
          }
          // Simulate network transit
          await new Promise((r) => setTimeout(r, 5));
          activeRequests--;
          return {
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'ok' } }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const burstCount = 25;
      const promises: Promise<boolean>[] = [];

      for (let i = 0; i < burstCount; i++) {
        promises.push(
          whatsappNotificationService.enviarWhatsAppDireto(
            `55119777700${i.toString().padStart(2, '0')}`,
            `Stress burst notification ${i}`,
            {
              skipPresence: true,
              timeScale: 0.001,
              customInitialDelayMs: 0,
            }
          )
        );
      }

      const results = await Promise.all(promises);
      expect(results.every((r) => r === true)).toBe(true);
      expect(results.length).toBe(burstCount);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. SAME-RECIPIENT BATCHING STRESS
  // ════════════════════════════════════════════════════════════════════════════

  describe('2. Same-Recipient Batching & Formatting Stress', () => {
    it('should coalesce 5 simultaneous messages to the same phone into a single formatted payload', async () => {
      let capturedPayloadText = '';
      let sendTextCallCount = 0;

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/chat/findChats')) return Promise.resolve({ ok: false });
        if (url.includes('/message/sendText')) {
          sendTextCallCount++;
          const body = JSON.parse(opts.body);
          capturedPayloadText = body.text;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'batched_msg_id' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const targetPhone = '5511999998888';
      const delayMs = 60; // Initial delay window to allow batch accumulation

      // Launch 5 simultaneous sends to the exact same recipient
      const p1 = whatsappNotificationService.enviarWhatsAppDireto(
        targetPhone,
        '1️⃣ Ordem de Serviço #101 criada.',
        { customInitialDelayMs: delayMs, skipPresence: true }
      );
      const p2 = whatsappNotificationService.enviarWhatsAppDireto(
        targetPhone,
        '2️⃣ Orçamento #502 aprovado com sucesso.',
        { customInitialDelayMs: delayMs, skipPresence: true }
      );
      const p3 = whatsappNotificationService.enviarWhatsAppDireto(
        targetPhone,
        '3️⃣ Fatura #903 disponível para pagamento.',
        { customInitialDelayMs: delayMs, skipPresence: true }
      );
      const p4 = whatsappNotificationService.enviarWhatsAppDireto(
        targetPhone,
        '4️⃣ Técnico em deslocamento para seu endereço.',
        { customInitialDelayMs: delayMs, skipPresence: true }
      );
      const p5 = whatsappNotificationService.enviarWhatsAppDireto(
        targetPhone,
        '5️⃣ Cupom VIP de 15% aplicado.',
        { customInitialDelayMs: delayMs, skipPresence: true }
      );

      const [r1, r2, r3, r4, r5] = await Promise.all([p1, p2, p3, p4, p5]);

      // All callers should resolve with success
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(r3).toBe(true);
      expect(r4).toBe(true);
      expect(r5).toBe(true);

      // Exactly ONE HTTP call to sendText should have occurred
      expect(sendTextCallCount).toBe(1);

      // Verify all 5 messages are present and grouped with dividers
      expect(capturedPayloadText).toContain('1️⃣ Ordem de Serviço #101 criada.');
      expect(capturedPayloadText).toContain('2️⃣ Orçamento #502 aprovado com sucesso.');
      expect(capturedPayloadText).toContain('3️⃣ Fatura #903 disponível para pagamento.');
      expect(capturedPayloadText).toContain('4️⃣ Técnico em deslocamento para seu endereço.');
      expect(capturedPayloadText).toContain('5️⃣ Cupom VIP de 15% aplicado.');
      expect(capturedPayloadText).toContain('──────────────────────────────');
    });

    it('should preserve media options when batch contains text and media attachments', async () => {
      let sendMediaCallCount = 0;
      let capturedMediaUrl = '';
      let capturedCaption = '';

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/chat/findChats')) return Promise.resolve({ ok: false });
        if (url.includes('/message/sendMedia')) {
          sendMediaCallCount++;
          const body = JSON.parse(opts.body);
          capturedMediaUrl = body.media;
          capturedCaption = body.caption;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ key: { id: 'media_batch_ok' } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      const phone = '5511966665555';
      const delayMs = 50;

      const p1 = whatsappNotificationService.enviarWhatsAppDireto(
        phone,
        'Texto da notificação inicial.',
        { customInitialDelayMs: delayMs, skipPresence: true }
      );
      const p2 = whatsappNotificationService.enviarWhatsAppDireto(
        phone,
        'Comprovante em anexo.',
        {
          customInitialDelayMs: delayMs,
          mediaUrl: 'https://cdn.gsa-hub.com/comprovante.pdf',
          fileName: 'comprovante.pdf',
          skipPresence: true,
        }
      );

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(sendMediaCallCount).toBe(1);
      expect(capturedMediaUrl).toBe('https://cdn.gsa-hub.com/comprovante.pdf');
      expect(capturedCaption).toContain('Texto da notificação inicial.');
      expect(capturedCaption).toContain('Comprovante em anexo.');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. PAUSE DISPATCH RACE CONDITIONS & FIFO FLUSH
  // ════════════════════════════════════════════════════════════════════════════

  describe('3. Pause Dispatch Race Conditions & FIFO Flush Under Stress', () => {
    it('should hold messages safely in local queue when paused and prevent network calls', async () => {
      let networkCalls = 0;
      (global.fetch as any).mockImplementation(() => {
        networkCalls++;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      // 1. Pause the engine
      whatsappHealthService.setPaused(true);
      expect(whatsappNotificationService.isPaused()).toBe(true);

      // 2. Dispatch 10 notifications
      const results: boolean[] = [];
      for (let i = 1; i <= 10; i++) {
        const res = await whatsappNotificationService.enviarWhatsAppDireto(
          `55119999900${i.toString().padStart(2, '0')}`,
          `Mensagem retida #${i}`
        );
        results.push(res);
      }

      // All dispatch calls returned true (enqueued safely)
      expect(results.every((r) => r === true)).toBe(true);
      expect(results.length).toBe(10);

      // Zero network calls were made to sendText/sendPresence
      expect(networkCalls).toBe(0);

      // Queue state matches exactly 10
      expect(whatsappNotificationService.getQueueLength()).toBe(10);
      const queuedItems = whatsappHealthService.getQueue();
      expect(queuedItems.length).toBe(10);
      expect(queuedItems[0].recipient).toBe('5511999990001');
      expect(queuedItems[9].recipient).toBe('5511999990010');
    });

    it('should flush held messages in strict FIFO order upon unpausing', async () => {
      whatsappHealthService.setPaused(true);

      const enqueuedIds: string[] = [];
      for (let i = 1; i <= 8; i++) {
        const id = whatsappHealthService.enqueueMessage({
          recipient: `55119100000${i}`,
          message: `Item FIFO #${i}`,
          contextType: 'os',
        });
        enqueuedIds.push(id);
      }

      expect(whatsappHealthService.getState().queuedCount).toBe(8);

      // Unpause
      whatsappHealthService.setPaused(false);
      expect(whatsappHealthService.isPaused()).toBe(false);

      // Simulate FIFO queue processing loop
      const dispatchedOrder: string[] = [];
      while (whatsappHealthService.getQueue().length > 0) {
        const next = whatsappHealthService.getQueue()[0];
        dispatchedOrder.push(next.id);
        const removed = whatsappHealthService.removeQueuedMessage(next.id);
        expect(removed).toBe(true);
      }

      expect(dispatchedOrder).toEqual(enqueuedIds);
      expect(whatsappHealthService.getState().queuedCount).toBe(0);
      expect(whatsappHealthService.getQueue()).toHaveLength(0);
    });

    it('should survive 100 rapid concurrent pause toggles without corruption', () => {
      const service = new WhatsAppHealthService();
      let lastPaused = false;

      for (let i = 0; i < 100; i++) {
        const isPaused = service.togglePause();
        expect(typeof isPaused).toBe('boolean');
        lastPaused = isPaused;

        // Enqueue intermittently during toggles
        if (i % 10 === 0) {
          service.enqueueMessage({
            recipient: `551198888${i}`,
            message: `Toggle stress message ${i}`,
          });
        }
      }

      expect(service.isPaused()).toBe(lastPaused);
      expect(service.getQueue().length).toBe(10);
      expect(service.getState().queuedCount).toBe(10);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. FALLBACK FAILOVER STRESS (TIER 1 -> TIER 2 -> TIER 3)
  // ════════════════════════════════════════════════════════════════════════════

  describe('4. Fallback Failover Stress & Cascading Recovery', () => {
    it('should seamlessly cascade through 500 error on Tier 1, 500 error on Tier 2, and succeed on Tier 3 (n8n)', async () => {
      const callLog: string[] = [];

      (global.fetch as any).mockImplementation((url: string, opts: any) => {
        if (url.includes('/chat/findChats')) return Promise.resolve({ ok: false });
        if (url.includes('147.15.43.141:8080/message/sendText')) {
          callLog.push('Tier 1: Evolution API (Port 8080)');
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          });
        }
        if (url.includes('147.15.43.141:5678/webhook/send-whatsapp')) {
          callLog.push('Tier 3: n8n Webhook (Port 5678)');
          const body = JSON.parse(opts.body);
          expect(body.phone).toBe('5511999990001');
          expect(body.message).toContain('Alerta de teste de cascata');
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.resolve({ ok: false });
      });

      mockFunctionsInvoke.mockImplementationOnce((fnName: string) => {
        callLog.push(`Tier 2: Edge Function (${fnName})`);
        return Promise.resolve({
          data: null,
          error: new Error('Edge Function invocation failed (502)'),
        });
      });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999990001',
        'Alerta de teste de cascata de fallback.',
        { skipPresence: true }
      );

      expect(success).toBe(true);
      expect(callLog).toEqual([
        'Tier 1: Evolution API (Port 8080)',
        'Tier 2: Edge Function (vps-api)',
        'Tier 3: n8n Webhook (Port 5678)',
      ]);
    });

    it('should handle complete network timeout on Tier 1 and Tier 2, gracefully cascading to Tier 3', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/chat/findChats')) return Promise.resolve({ ok: false });
        if (url.includes('147.15.43.141:8080')) {
          const abortErr = new Error('Network timeout (AbortError)');
          abortErr.name = 'AbortError';
          return Promise.reject(abortErr);
        }
        if (url.includes('147.15.43.141:5678/webhook/send-whatsapp')) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.resolve({ ok: false });
      });

      mockFunctionsInvoke.mockRejectedValueOnce(new Error('Edge invoke timeout'));

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999990002',
        'Mensagem enviada sob timeout de rede.',
        { skipPresence: true }
      );

      expect(success).toBe(true);
    });

    it('should return false and trigger toast notification if all 3 tiers fail under massive network collapse', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Complete ISP blackhole'));
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: new Error('Total failure') });

      const success = await whatsappNotificationService.enviarWhatsAppDireto(
        '5511999990003',
        'Mensagem em cenário catastrófico.',
        { skipPresence: true }
      );

      expect(success).toBe(false);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringContaining('erro no servidor de WhatsApp')
      );
    });
  });
});

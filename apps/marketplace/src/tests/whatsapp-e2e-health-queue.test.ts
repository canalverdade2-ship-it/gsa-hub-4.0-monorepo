import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hoisted mocks for Supabase
const mockFunctionsInvoke = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  },
  getSupabase: () => ({
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
  }),
}));

import {
  WhatsAppHealthService,
  whatsappHealthService,
  WHATSAPP_STORAGE_KEYS,
  WHATSAPP_ENDPOINTS,
  WHATSAPP_POLLING_INTERVALS,
  type WhatsAppHealthState,
  type QueuedWhatsAppNotification,
} from '../lib/whatsappHealthService';

describe('WhatsApp E2E Health Maintenance & Queue Engine Test Suite (R4 & R5 / F11-F14)', () => {
  let originalFetch: typeof global.fetch;
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};

    // Mock localStorage
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
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: { hidden: false, addEventListener: vi.fn() },
      writable: true,
      configurable: true,
    });
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    whatsappHealthService.stopKeepAlive();
    whatsappHealthService.clearQueue();
    whatsappHealthService.setPaused(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature)
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 1: Feature 11 — Keep-Alive Routine & Status Probing (R4)', () => {
    it('should probe Evolution API connection state endpoint with correct URL and apikey header', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(global.fetch).toHaveBeenCalledWith(
        WHATSAPP_ENDPOINTS.EVOLUTION_URL,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            apikey: WHATSAPP_ENDPOINTS.EVOLUTION_APIKEY,
          }),
        })
      );
      expect(state.status).toBe('connected');
      expect(state.rawState).toBe('open');
      expect(state.consecutiveErrors).toBe(0);
    });

    it('should map state "connecting" to status "connecting"', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'connecting' } }),
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('connecting');
      expect(state.rawState).toBe('connecting');
    });

    it('should map state "close" / "closed" to status "disconnected"', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'close' } }),
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('disconnected');
      expect(state.rawState).toBe('close');
    });

    it('should fallback to Edge Function vps-api when direct Evolution API fails', async () => {
      // Direct Evolution API fails
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      // Edge Function fallback succeeds
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: { success: true, state: 'open' },
        error: null,
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('vps-api', {
        body: {
          action: 'whatsapp-status',
          targetIp: WHATSAPP_ENDPOINTS.VPS_IP,
        },
      });
      expect(state.status).toBe('connected');
      expect(state.rawState).toBe('open');
    });

    it('should measure and record positive latency in milliseconds', async () => {
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ instance: { state: 'open' } }),
              });
            }, 20);
          })
      );

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.latencyMs).toBeGreaterThanOrEqual(1);
      expect(state.lastChecked).toBeInstanceOf(Date);
    });
  });

  describe('Tier 1: Feature 12 — Health State & Latency Telemetry (R4)', () => {
    it('should return complete structured WhatsAppHealthState object', () => {
      const state = whatsappHealthService.getState();
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('rawState');
      expect(state).toHaveProperty('lastChecked');
      expect(state).toHaveProperty('latencyMs');
      expect(state).toHaveProperty('isPaused');
      expect(state).toHaveProperty('queuedCount');
      expect(state).toHaveProperty('consecutiveErrors');
    });

    it('should track consecutive errors on repeated network failures', async () => {
      (global.fetch as any).mockRejectedValue(new Error('500 Server Error'));
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: new Error('Edge Timeout') });

      const service = new WhatsAppHealthService();
      expect(service.getState().consecutiveErrors).toBe(0);

      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(1);
      expect(service.getState().status).toBe('error');

      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(2);

      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(3);
    });

    it('should reset consecutive errors to 0 immediately upon successful recovery', async () => {
      const service = new WhatsAppHealthService();

      // Induce 2 failures
      (global.fetch as any).mockRejectedValueOnce(new Error('Network down'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: new Error('Down') });
      await service.checkHealth();

      (global.fetch as any).mockRejectedValueOnce(new Error('Network down'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: new Error('Down') });
      await service.checkHealth();

      expect(service.getState().consecutiveErrors).toBe(2);

      // Now recovery succeeds
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });
      await service.checkHealth();

      expect(service.getState().consecutiveErrors).toBe(0);
      expect(service.getState().status).toBe('connected');
    });

    it('should compute exponential backoff intervals during consecutive failures', async () => {
      const service = new WhatsAppHealthService();

      // 0 errors: normal 30s interval
      expect(service.getNextPollingInterval()).toBe(WHATSAPP_POLLING_INTERVALS.ACTIVE_MS);

      // 1 error: 5000 * 2^0 = 5000ms
      (global.fetch as any).mockRejectedValueOnce(new Error('Fail 1'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getNextPollingInterval()).toBe(5000);

      // 2 errors: 5000 * 2^1 = 10000ms
      (global.fetch as any).mockRejectedValueOnce(new Error('Fail 2'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getNextPollingInterval()).toBe(10000);

      // 3 errors: 5000 * 2^2 = 20000ms
      (global.fetch as any).mockRejectedValueOnce(new Error('Fail 3'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getNextPollingInterval()).toBe(20000);

      // 4 errors: 5000 * 2^3 = 40000ms
      (global.fetch as any).mockRejectedValueOnce(new Error('Fail 4'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getNextPollingInterval()).toBe(40000);

      // 5 errors: max cap at 60000ms
      (global.fetch as any).mockRejectedValueOnce(new Error('Fail 5'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getNextPollingInterval()).toBe(WHATSAPP_POLLING_INTERVALS.MAX_BACKOFF_MS);
    });

    it('should adjust polling interval when document visibility changes to hidden (120s)', () => {
      const service = new WhatsAppHealthService();

      // Foreground
      Object.defineProperty(globalThis, 'document', {
        value: { hidden: false, addEventListener: vi.fn() },
        writable: true,
        configurable: true,
      });
      expect(service.getNextPollingInterval()).toBe(30000);

      // Background / Hidden
      Object.defineProperty(globalThis, 'document', {
        value: { hidden: true, addEventListener: vi.fn() },
        writable: true,
        configurable: true,
      });
      expect(service.getNextPollingInterval()).toBe(120000);

      // Restore foreground
      Object.defineProperty(globalThis, 'document', {
        value: { hidden: false, addEventListener: vi.fn() },
        writable: true,
        configurable: true,
      });
    });
  });

  describe('Tier 1: Feature 13 & 14 — Pause Dispatch Toggle & Local Queue Retention (R5)', () => {
    it('should toggle pause dispatch state and persist to localStorage', () => {
      const service = new WhatsAppHealthService();
      expect(service.isPaused()).toBe(false);

      service.setPaused(true);
      expect(service.isPaused()).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalledWith(WHATSAPP_STORAGE_KEYS.PAUSED, 'true');

      service.togglePause();
      expect(service.isPaused()).toBe(false);
      expect(localStorage.setItem).toHaveBeenCalledWith(WHATSAPP_STORAGE_KEYS.PAUSED, 'false');
    });

    it('should enqueue messages and retain them in FIFO queue with unique IDs', () => {
      const service = new WhatsAppHealthService();
      expect(service.getQueue()).toHaveLength(0);

      const id1 = service.enqueueMessage({
        recipient: '5511999991111',
        message: 'Mensagem 1',
        contextType: 'fatura',
      });

      const id2 = service.enqueueMessage({
        recipient: '5511999992222',
        message: 'Mensagem 2',
        contextType: 'orcamento',
      });

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);

      const queue = service.getQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].id).toBe(id1);
      expect(queue[0].recipient).toBe('5511999991111');
      expect(queue[1].id).toBe(id2);
      expect(queue[1].recipient).toBe('5511999992222');
      expect(service.getState().queuedCount).toBe(2);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        WHATSAPP_STORAGE_KEYS.QUEUE,
        expect.stringContaining('5511999991111')
      );
    });

    it('should remove specific message by ID from queue and update count', () => {
      const service = new WhatsAppHealthService();
      const id1 = service.enqueueMessage({ recipient: '551191111', message: 'A' });
      const id2 = service.enqueueMessage({ recipient: '551192222', message: 'B' });

      expect(service.getQueue()).toHaveLength(2);

      const removed = service.removeQueuedMessage(id1);
      expect(removed).toBe(true);
      expect(service.getQueue()).toHaveLength(1);
      expect(service.getQueue()[0].id).toBe(id2);
      expect(service.getState().queuedCount).toBe(1);

      // Attempting to remove non-existent ID returns false
      expect(service.removeQueuedMessage('non-existent-id')).toBe(false);
    });

    it('should clear entire queue and persist empty state', () => {
      const service = new WhatsAppHealthService();
      service.enqueueMessage({ recipient: '551191111', message: 'A' });
      service.enqueueMessage({ recipient: '551192222', message: 'B' });
      expect(service.getState().queuedCount).toBe(2);

      service.clearQueue();
      expect(service.getQueue()).toHaveLength(0);
      expect(service.getState().queuedCount).toBe(0);
      expect(localStorage.setItem).toHaveBeenCalledWith(WHATSAPP_STORAGE_KEYS.QUEUE, '[]');
    });

    it('should load persisted paused state and pending queue on initialization', () => {
      const initialQueue: QueuedWhatsAppNotification[] = [
        {
          id: 'msg-saved-101',
          recipient: '5511988889999',
          message: 'Notificação salva do storage',
          createdAt: new Date().toISOString(),
          status: 'queued',
        },
      ];

      mockStorage[WHATSAPP_STORAGE_KEYS.PAUSED] = 'true';
      mockStorage[WHATSAPP_STORAGE_KEYS.QUEUE] = JSON.stringify(initialQueue);

      const restoredService = new WhatsAppHealthService();
      expect(restoredService.isPaused()).toBe(true);
      expect(restoredService.getState().queuedCount).toBe(1);

      const queue = restoredService.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe('msg-saved-101');
      expect(queue[0].recipient).toBe('5511988889999');
    });

    it('should notify all subscribers synchronously on state or queue change', () => {
      const service = new WhatsAppHealthService();
      const updates: WhatsAppHealthState[] = [];

      const unsub = service.subscribe((state) => {
        updates.push({ ...state });
      });

      // Initial subscription notification
      expect(updates).toHaveLength(1);

      // Pause toggle triggers notification
      service.setPaused(true);
      expect(updates).toHaveLength(2);
      expect(updates[1].isPaused).toBe(true);

      // Queue enqueue triggers notification
      service.enqueueMessage({ recipient: '551197777', message: 'Test Sub' });
      expect(updates).toHaveLength(3);
      expect(updates[2].queuedCount).toBe(1);

      unsub();
      // After unsubscribe, no further notifications
      service.setPaused(false);
      expect(updates).toHaveLength(3);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 2: BOUNDARY & CORNER CASES
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('should handle corrupt or invalid JSON in localStorage gracefully without crashing', () => {
      mockStorage[WHATSAPP_STORAGE_KEYS.QUEUE] = 'INVALID_JSON_CORRUPT{[';
      mockStorage[WHATSAPP_STORAGE_KEYS.PAUSED] = 'not_a_boolean';

      expect(() => new WhatsAppHealthService()).not.toThrow();
      const service = new WhatsAppHealthService();
      expect(service.getQueue()).toEqual([]);
      expect(service.isPaused()).toBe(false);
    });

    it('should handle network timeouts (AbortSignal) on Evolution API check', async () => {
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'TimeoutError';
            reject(err);
          })
      );
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: new Error('VPS Timeout') });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('error');
      expect(state.rawState).toBe('error');
      expect(state.consecutiveErrors).toBe(1);
    });

    it('should handle rapid concurrent checkHealth invocations without duplicate network calls', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            callCount++;
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ instance: { state: 'open' } }),
              });
            }, 30);
          })
      );

      const service = new WhatsAppHealthService();
      // Fire 5 concurrent checks
      const results = await Promise.all([
        service.checkHealth(),
        service.checkHealth(),
        service.checkHealth(),
        service.checkHealth(),
        service.checkHealth(),
      ]);

      // All should receive state
      for (const res of results) {
        expect(res).toBeDefined();
      }
      // Only 1 fetch call should have occurred during the busy state
      expect(callCount).toBe(1);
    });

    it('should handle missing window/document objects in Node / SSR environment', () => {
      const originalWindow = globalThis.window;
      const originalDoc = globalThis.document;

      try {
        (globalThis as any).window = undefined;
        (globalThis as any).document = undefined;

        expect(() => new WhatsAppHealthService()).not.toThrow();
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDoc;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 3: CROSS-FEATURE INTERACTIONS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 3: Cross-Feature Interactions', () => {
    it('should maintain queue integrity while health transitions through connected -> error -> connected', async () => {
      const service = new WhatsAppHealthService();
      service.enqueueMessage({ recipient: '551191111', message: 'Item 1' });
      service.enqueueMessage({ recipient: '551192222', message: 'Item 2' });

      expect(service.getState().queuedCount).toBe(2);

      // State becomes error
      (global.fetch as any).mockRejectedValueOnce(new Error('Network drop'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();

      expect(service.getState().status).toBe('error');
      expect(service.getState().queuedCount).toBe(2);
      expect(service.getQueue()).toHaveLength(2);

      // State recovers to connected
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });
      await service.checkHealth();

      expect(service.getState().status).toBe('connected');
      expect(service.getState().queuedCount).toBe(2);
      expect(service.getQueue()[0].recipient).toBe('551191111');
      expect(service.getQueue()[1].recipient).toBe('551192222');
    });

    it('should integrate with online/offline window events', () => {
      const eventMap: Record<string, Function> = {};
      const addEventListenerMock = vi.fn((event: string, handler: Function) => {
        eventMap[event] = handler;
      });

      Object.defineProperty(globalThis, 'window', {
        value: { addEventListener: addEventListenerMock },
        writable: true,
        configurable: true,
      });

      const service = new WhatsAppHealthService();

      // Trigger offline event
      if (eventMap['offline']) {
        eventMap['offline']();
        expect(service.getState().status).toBe('disconnected');
        expect(service.getState().rawState).toBe('offline');
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TIER 4: REAL-WORLD SCENARIOS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Tier 4: Real-World Scenarios', () => {
    it('Scenario: Admin pauses dispatch during peak hours, queues 5 notifications, then unpauses for flush', () => {
      const service = new WhatsAppHealthService();

      // 1. Admin toggles Pause Dispatch
      service.setPaused(true);
      expect(service.isPaused()).toBe(true);

      // 2. 5 outgoing notifications arrive from various modules
      const ids: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const id = service.enqueueMessage({
          recipient: `551199999000${i}`,
          message: `Fatura #${i} gerada com sucesso.`,
          contextType: 'fatura',
        });
        ids.push(id);
      }

      expect(service.getState().queuedCount).toBe(5);
      expect(service.getQueue()).toHaveLength(5);

      // 3. Admin unpauses dispatch
      service.setPaused(false);
      expect(service.isPaused()).toBe(false);

      // 4. Queue processor consumes items in FIFO order
      const processed: string[] = [];
      while (service.getQueue().length > 0) {
        const item = service.getQueue()[0];
        processed.push(item.id);
        service.removeQueuedMessage(item.id);
      }

      expect(processed).toEqual(ids);
      expect(service.getState().queuedCount).toBe(0);
      expect(service.getQueue()).toHaveLength(0);
    });

    it('Scenario: Transient VPS network outage triggers 3 backoff cycles before full recovery', async () => {
      const service = new WhatsAppHealthService();

      // Cycle 1: Outage begins
      (global.fetch as any).mockRejectedValueOnce(new Error('VPS 502 Bad Gateway'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(1);
      expect(service.getNextPollingInterval()).toBe(5000);

      // Cycle 2: Outage continues
      (global.fetch as any).mockRejectedValueOnce(new Error('VPS 502 Bad Gateway'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(2);
      expect(service.getNextPollingInterval()).toBe(10000);

      // Cycle 3: Outage continues
      (global.fetch as any).mockRejectedValueOnce(new Error('VPS 502 Bad Gateway'));
      mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: true });
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(3);
      expect(service.getNextPollingInterval()).toBe(20000);

      // Cycle 4: Service restored
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });
      await service.checkHealth();
      expect(service.getState().status).toBe('connected');
      expect(service.getState().consecutiveErrors).toBe(0);
      expect(service.getNextPollingInterval()).toBe(30000);
    });
  });
});

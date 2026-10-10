import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ----------------------------------------------------------------------------
// Mock DOM and Storage Infrastructure for Node/Vitest
// ----------------------------------------------------------------------------
let memoryLocalStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => memoryLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    memoryLocalStorage[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete memoryLocalStorage[key];
  }),
  clear: vi.fn(() => {
    memoryLocalStorage = {};
  }),
  length: 0,
  key: vi.fn((_i: number) => null),
};

const documentEventListeners: Record<string, Function[]> = {};
const windowEventListeners: Record<string, Function[]> = {};

const mockDocument = {
  hidden: false,
  addEventListener: vi.fn((event: string, cb: Function) => {
    documentEventListeners[event] = documentEventListeners[event] || [];
    documentEventListeners[event].push(cb);
  }),
  removeEventListener: vi.fn((event: string, cb: Function) => {
    if (documentEventListeners[event]) {
      documentEventListeners[event] = documentEventListeners[event].filter(fn => fn !== cb);
    }
  }),
  dispatchEvent: vi.fn((event: { type: string }) => {
    const listeners = documentEventListeners[event.type] || [];
    listeners.forEach(fn => fn(event));
    return true;
  }),
};

const mockWindow = {
  localStorage: mockLocalStorage,
  addEventListener: vi.fn((event: string, cb: Function) => {
    windowEventListeners[event] = windowEventListeners[event] || [];
    windowEventListeners[event].push(cb);
  }),
  removeEventListener: vi.fn((event: string, cb: Function) => {
    if (windowEventListeners[event]) {
      windowEventListeners[event] = windowEventListeners[event].filter(fn => fn !== cb);
    }
  }),
  dispatchEvent: vi.fn((event: { type: string }) => {
    const listeners = windowEventListeners[event.type] || [];
    listeners.forEach(fn => fn(event));
    return true;
  }),
};

(global as any).localStorage = mockLocalStorage;
(global as any).window = mockWindow;
(global as any).document = mockDocument;

if (typeof (global as any).Event === 'undefined') {
  (global as any).Event = class Event {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

// ----------------------------------------------------------------------------
// Hoisted Mocks for Supabase
// ----------------------------------------------------------------------------
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
} from '../lib/whatsappHealthService';
import { useWhatsAppHealth } from '../hooks/useWhatsAppHealth';

describe('WhatsApp Health Service & Keep-Alive Routine Test Suite (R4 / M4)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryLocalStorage = {};
    mockDocument.hidden = false;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn() as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Health Status Resolution (Evolution API + Edge Function Fallback)
  // ==========================================================================
  describe('1. Health Status Resolution', () => {
    it('Tier 1: resolves status to "connected" when Evolution API returns state "open"', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance: {
            instanceName: 'GSA_WhatsApp',
            state: 'open',
          },
        }),
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('connected');
      expect(state.rawState).toBe('open');
      expect(state.consecutiveErrors).toBe(0);
      expect(state.lastChecked).toBeInstanceOf(Date);
      expect(state.latencyMs).toBeGreaterThanOrEqual(0);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        WHATSAPP_ENDPOINTS.EVOLUTION_URL,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            apikey: WHATSAPP_ENDPOINTS.EVOLUTION_APIKEY,
          }),
        })
      );
      expect(memoryLocalStorage[WHATSAPP_STORAGE_KEYS.CONNECTED_AT]).toBeDefined();
    });

    it('Tier 1: resolves status to "connecting" when Evolution API returns state "connecting"', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance: {
            instanceName: 'GSA_WhatsApp',
            state: 'connecting',
          },
        }),
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('connecting');
      expect(state.rawState).toBe('connecting');
      expect(state.consecutiveErrors).toBe(0);
    });

    it('Tier 1: resolves status to "disconnected" when Evolution API returns state "close"', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance: {
            instanceName: 'GSA_WhatsApp',
            state: 'close',
          },
        }),
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('disconnected');
      expect(state.rawState).toBe('close');
      expect(state.consecutiveErrors).toBe(0);
    });

    it('Tier 2: falls back to Edge Function (vps-api) when Evolution API fails with network error', async () => {
      // Tier 1 fails
      (globalThis.fetch as any).mockRejectedValueOnce(new Error('Connection timed out on port 8080'));

      // Tier 2 succeeds
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          state: 'open',
        },
        error: null,
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('connected');
      expect(state.rawState).toBe('open');
      expect(state.consecutiveErrors).toBe(0);
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('vps-api', {
        body: {
          action: 'whatsapp-status',
          targetIp: WHATSAPP_ENDPOINTS.VPS_IP,
        },
      });
    });

    it('Tier 2: resolves status to "disconnected" when Edge Function reports state "close"', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(new Error('502 Bad Gateway'));

      mockFunctionsInvoke.mockResolvedValueOnce({
        data: {
          success: false,
          state: 'close',
        },
        error: null,
      });

      const service = new WhatsAppHealthService();
      const state = await service.checkHealth();

      expect(state.status).toBe('disconnected');
      expect(state.rawState).toBe('close');
    });

    it('Tier 3: resolves status to "error" and increments consecutiveErrors when both Evolution API and Edge Function fail', async () => {
      (globalThis.fetch as any).mockRejectedValueOnce(new Error('Evolution API offline'));
      mockFunctionsInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Edge Function timed out' },
      });

      const service = new WhatsAppHealthService();
      const state1 = await service.checkHealth();

      expect(state1.status).toBe('error');
      expect(state1.rawState).toBe('error');
      expect(state1.consecutiveErrors).toBe(1);

      // Second consecutive failure
      (globalThis.fetch as any).mockRejectedValueOnce(new Error('Evolution API still offline'));
      mockFunctionsInvoke.mockRejectedValueOnce(new Error('Edge function 500'));

      const state2 = await service.checkHealth();
      expect(state2.status).toBe('error');
      expect(state2.consecutiveErrors).toBe(2);

      // Subsequent recovery resets errors
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const state3 = await service.checkHealth();
      expect(state3.status).toBe('connected');
      expect(state3.consecutiveErrors).toBe(0);
    });

    it('shares in-flight checkHealth Promise during concurrent calls', async () => {
      let resolveFetch: any;
      const delayedPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      (globalThis.fetch as any).mockReturnValueOnce(delayedPromise);

      const service = new WhatsAppHealthService();
      const p1 = service.checkHealth();
      const p2 = service.checkHealth();

      expect(p1).toBe(p2); // Same shared promise

      resolveFetch({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.status).toBe('connected');
      expect(res2.status).toBe('connected');
    });
  });

  // ==========================================================================
  // 2. Adaptive Polling Interval & Page Visibility API
  // ==========================================================================
  describe('2. Adaptive Polling Interval & Page Visibility API', () => {
    it('should use 30s polling interval when document is visible and tab is active', () => {
      mockDocument.hidden = false;
      const service = new WhatsAppHealthService();
      expect(service.getNextPollingInterval()).toBe(WHATSAPP_POLLING_INTERVALS.ACTIVE_MS);
      expect(service.getNextPollingInterval()).toBe(30000);
    });

    it('should adapt polling interval to 120s when document is hidden (background tab)', () => {
      mockDocument.hidden = true;
      const service = new WhatsAppHealthService();
      expect(service.getNextPollingInterval()).toBe(WHATSAPP_POLLING_INTERVALS.HIDDEN_MS);
      expect(service.getNextPollingInterval()).toBe(120000);

      mockDocument.hidden = false;
    });

    it('should calculate exponential backoff (5s, 10s, 20s, 40s, max 60s) on consecutive errors', async () => {
      (globalThis.fetch as any).mockRejectedValue(new Error('Offline'));
      mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'Edge error' } });

      const service = new WhatsAppHealthService();

      // Error 1: 5000 * 2^0 = 5000ms
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(1);
      expect(service.getNextPollingInterval()).toBe(5000);

      // Error 2: 5000 * 2^1 = 10000ms
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(2);
      expect(service.getNextPollingInterval()).toBe(10000);

      // Error 3: 5000 * 2^2 = 20000ms
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(3);
      expect(service.getNextPollingInterval()).toBe(20000);

      // Error 4: 5000 * 2^3 = 40000ms
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(4);
      expect(service.getNextPollingInterval()).toBe(40000);

      // Error 5: capped at max 60000ms
      await service.checkHealth();
      expect(service.getState().consecutiveErrors).toBe(5);
      expect(service.getNextPollingInterval()).toBe(60000);
    });

    it('should trigger immediate probe on tab focus visibilitychange event', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const service = new WhatsAppHealthService();
      const checkSpy = vi.spyOn(service, 'checkHealth');

      mockDocument.hidden = false;
      mockDocument.dispatchEvent(new (global as any).Event('visibilitychange'));
      expect(checkSpy).toHaveBeenCalled();
    });

    it('should trigger immediate probe on window online event', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const service = new WhatsAppHealthService();
      const checkSpy = vi.spyOn(service, 'checkHealth');

      mockWindow.dispatchEvent(new (global as any).Event('online'));
      expect(checkSpy).toHaveBeenCalled();
    });

    it('should update state to disconnected on window offline event', () => {
      const service = new WhatsAppHealthService();
      mockWindow.dispatchEvent(new (global as any).Event('offline'));

      const state = service.getState();
      expect(state.status).toBe('disconnected');
      expect(state.rawState).toBe('offline');
    });

    it('should correctly start and stop keep-alive timer loop', () => {
      vi.useFakeTimers();
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const service = new WhatsAppHealthService();
      const checkSpy = vi.spyOn(service, 'checkHealth');

      service.startKeepAlive();
      expect(checkSpy).toHaveBeenCalledTimes(1);

      // Advance 30s
      vi.advanceTimersByTime(30000);
      expect(checkSpy).toHaveBeenCalledTimes(2);

      service.stopKeepAlive();
      vi.advanceTimersByTime(30000);
      expect(checkSpy).toHaveBeenCalledTimes(2); // No extra calls after stop

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // 3. Subscriber Listener Pattern & Real-time Reactivity
  // ==========================================================================
  describe('3. Subscriber Listener Pattern', () => {
    it('should immediately call subscriber with current state upon subscription', () => {
      const service = new WhatsAppHealthService();
      const subscriber = vi.fn();

      const unsubscribe = service.subscribe(subscriber);

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'connected',
          rawState: 'open',
          isPaused: false,
          queuedCount: 0,
        })
      );

      unsubscribe();
    });

    it('should notify all active subscribers when state changes', async () => {
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ instance: { state: 'open' } }),
      });

      const service = new WhatsAppHealthService();
      const sub1 = vi.fn();
      const sub2 = vi.fn();

      const unsub1 = service.subscribe(sub1);
      const unsub2 = service.subscribe(sub2);

      sub1.mockClear();
      sub2.mockClear();

      // Trigger health check
      await service.checkHealth();

      expect(sub1).toHaveBeenCalledTimes(1);
      expect(sub2).toHaveBeenCalledTimes(1);
      expect(sub1).toHaveBeenCalledWith(expect.objectContaining({ status: 'connected' }));

      unsub1();
      unsub2();
    });

    it('should stop notifying subscriber after unsubscribing', () => {
      const service = new WhatsAppHealthService();
      const sub = vi.fn();

      const unsubscribe = service.subscribe(sub);
      sub.mockClear();

      unsubscribe();
      service.setPaused(true);

      expect(sub).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4. Pause Dispatch & Local Queue Management with localStorage Persistence
  // ==========================================================================
  describe('4. Pause Dispatch & Local Queue Management', () => {
    it('should toggle pause dispatch state and persist to localStorage', () => {
      const service = new WhatsAppHealthService();
      const sub = vi.fn();
      service.subscribe(sub);

      expect(service.isPaused()).toBe(false);

      // Set paused = true
      service.setPaused(true);
      expect(service.isPaused()).toBe(true);
      expect(memoryLocalStorage[WHATSAPP_STORAGE_KEYS.PAUSED]).toBe('true');
      expect(sub).toHaveBeenLastCalledWith(expect.objectContaining({ isPaused: true }));

      // Toggle pause -> false
      const toggled = service.togglePause();
      expect(toggled).toBe(false);
      expect(service.isPaused()).toBe(false);
      expect(memoryLocalStorage[WHATSAPP_STORAGE_KEYS.PAUSED]).toBe('false');
      expect(sub).toHaveBeenLastCalledWith(expect.objectContaining({ isPaused: false }));
    });

    it('should enqueue messages, update queue count, and persist to localStorage', () => {
      const service = new WhatsAppHealthService();
      const sub = vi.fn();
      service.subscribe(sub);

      expect(service.getQueue()).toHaveLength(0);

      const msgId = service.enqueueMessage({
        recipient: '5511999998888',
        message: 'Olá, sua OS #1234 foi atualizada.',
        contextType: 'OS_STATUS',
      });

      expect(msgId).toBeDefined();
      expect(service.getQueue()).toHaveLength(1);
      expect(service.getState().queuedCount).toBe(1);

      const queueInStorage = JSON.parse(memoryLocalStorage[WHATSAPP_STORAGE_KEYS.QUEUE]);
      expect(queueInStorage).toHaveLength(1);
      expect(queueInStorage[0]).toMatchObject({
        id: msgId,
        recipient: '5511999998888',
        message: 'Olá, sua OS #1234 foi atualizada.',
        status: 'queued',
      });

      expect(sub).toHaveBeenLastCalledWith(expect.objectContaining({ queuedCount: 1 }));
    });

    it('should remove specific queued message and update storage', () => {
      const service = new WhatsAppHealthService();
      const id1 = service.enqueueMessage({ recipient: '5511999991111', message: 'Msg 1' });
      const id2 = service.enqueueMessage({ recipient: '5511999992222', message: 'Msg 2' });

      expect(service.getQueue()).toHaveLength(2);

      const removed = service.removeQueuedMessage(id1);
      expect(removed).toBe(true);
      expect(service.getQueue()).toHaveLength(1);
      expect(service.getQueue()[0].id).toBe(id2);
      expect(service.getState().queuedCount).toBe(1);

      const queueInStorage = JSON.parse(memoryLocalStorage[WHATSAPP_STORAGE_KEYS.QUEUE]);
      expect(queueInStorage).toHaveLength(1);
      expect(queueInStorage[0].id).toBe(id2);

      // Attempt removing non-existent message returns false
      const nonExistent = service.removeQueuedMessage('unknown_id');
      expect(nonExistent).toBe(false);
    });

    it('should clear queue completely and reset state and storage', () => {
      const service = new WhatsAppHealthService();
      service.enqueueMessage({ recipient: '5511999991111', message: 'Msg 1' });
      service.enqueueMessage({ recipient: '5511999992222', message: 'Msg 2' });

      expect(service.getQueue()).toHaveLength(2);

      service.clearQueue();
      expect(service.getQueue()).toHaveLength(0);
      expect(service.getState().queuedCount).toBe(0);

      const queueInStorage = JSON.parse(memoryLocalStorage[WHATSAPP_STORAGE_KEYS.QUEUE]);
      expect(queueInStorage).toHaveLength(0);
    });

    it('should reload persisted paused state and queued items upon initialization', () => {
      // Simulate existing localStorage data
      memoryLocalStorage[WHATSAPP_STORAGE_KEYS.PAUSED] = 'true';
      memoryLocalStorage[WHATSAPP_STORAGE_KEYS.QUEUE] = JSON.stringify([
        {
          id: 'persisted_msg_1',
          recipient: '5511999993333',
          message: 'Mensagem persistida anterior',
          createdAt: new Date().toISOString(),
          status: 'queued',
        },
      ]);

      const restoredService = new WhatsAppHealthService();

      expect(restoredService.isPaused()).toBe(true);
      expect(restoredService.getState().isPaused).toBe(true);
      expect(restoredService.getState().queuedCount).toBe(1);
      expect(restoredService.getQueue()).toHaveLength(1);
      expect(restoredService.getQueue()[0].id).toBe('persisted_msg_1');
    });

    it('should handle corrupted JSON in localStorage gracefully without crashing', () => {
      memoryLocalStorage[WHATSAPP_STORAGE_KEYS.QUEUE] = '{ corrupt json [';
      const service = new WhatsAppHealthService();

      expect(service.getQueue()).toHaveLength(0);
      expect(service.getState().queuedCount).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Singleton Instance & Hook Integration
  // ==========================================================================
  describe('5. Singleton Instance & Hook Export', () => {
    it('should export singleton instance whatsappHealthService with all core capabilities', () => {
      expect(whatsappHealthService).toBeInstanceOf(WhatsAppHealthService);
      expect(typeof whatsappHealthService.checkHealth).toBe('function');
      expect(typeof whatsappHealthService.checkNow).toBe('function');
      expect(typeof whatsappHealthService.subscribe).toBe('function');
      expect(typeof whatsappHealthService.setPaused).toBe('function');
      expect(typeof whatsappHealthService.togglePause).toBe('function');
      expect(typeof whatsappHealthService.enqueueMessage).toBe('function');
      expect(typeof whatsappHealthService.clearQueue).toBe('function');
      expect(typeof whatsappHealthService.isPaused).toBe('function');
      expect(typeof whatsappHealthService.getQueue).toBe('function');
    });

    it('should export useWhatsAppHealth hook function with comprehensive API surface', () => {
      expect(typeof useWhatsAppHealth).toBe('function');
    });
  });
});

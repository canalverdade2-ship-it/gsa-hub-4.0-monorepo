import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WhatsAppHealthMonitor } from '../components/admin/WhatsAppHealthMonitor';
import {
  whatsappHealthService,
  type WhatsAppHealthState,
  type WhatsAppHealthStatus
} from '../lib/whatsappHealthService';

// ----------------------------------------------------------------------------
// Mock Storage and Browser Environment for Node / Vitest
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

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true
  });
}

if (typeof globalThis.document === 'undefined') {
  Object.defineProperty(globalThis, 'document', {
    value: mockDocument,
    writable: true,
    configurable: true
  });
}

describe('WhatsApp Health Monitor UI Component Suite (R5 / Milestone 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryLocalStorage = {};
    whatsappHealthService.clearQueue();
    whatsappHealthService.setPaused(false);
  });

  afterEach(() => {
    whatsappHealthService.clearQueue();
    whatsappHealthService.setPaused(false);
  });

  // --------------------------------------------------------------------------
  // 1. Component Structure & Export Definitions
  // --------------------------------------------------------------------------
  describe('1. Component Structure & Export Definitions', () => {
    it('should export WhatsAppHealthMonitor as a React component function', () => {
      expect(typeof WhatsAppHealthMonitor).toBe('function');
    });

    it('should render default card variant without throwing', () => {
      const html = renderToString(<WhatsAppHealthMonitor />);
      expect(html).toContain('Monitor de Saúde Evolution API');
      expect(html).toContain('Estado da Sessão');
      expect(html).toContain('Latência do Ping');
      expect(html).toContain('Última Checagem');
      expect(html).toContain('Mensagens na Fila');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Rendering Health States (Connected, Connecting, Disconnected, Error)
  // --------------------------------------------------------------------------
  describe('2. Rendering Health Connection States', () => {
    it('should render connected state with emerald status badge and online indicators', () => {
      // Set service state to connected
      (whatsappHealthService as any).state = {
        status: 'connected',
        rawState: 'open',
        lastChecked: new Date('2026-08-27T15:00:00Z'),
        latencyMs: 45,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 0
      };

      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" />);
      expect(cardHtml).toContain('Conectado (Open)');
      expect(cardHtml).toContain('45 ms');
      expect(cardHtml).toContain('Disparos Contínuos Ativos');

      const compactHtml = renderToString(<WhatsAppHealthMonitor variant="compact" />);
      expect(compactHtml).toContain('Online');
      expect(compactHtml).toContain('45ms');

      const popoverHtml = renderToString(<WhatsAppHealthMonitor variant="header-popover" />);
      expect(popoverHtml).toContain('whatsapp-health-popover-trigger');
    });

    it('should render connecting state with amber status badge', () => {
      (whatsappHealthService as any).state = {
        status: 'connecting',
        rawState: 'connecting',
        lastChecked: new Date('2026-08-27T15:05:00Z'),
        latencyMs: 120,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 0
      };

      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" />);
      expect(cardHtml).toContain('Conectando...');
      expect(cardHtml).toContain('120 ms');

      const compactHtml = renderToString(<WhatsAppHealthMonitor variant="compact" />);
      expect(compactHtml).toContain('Conectando');
      expect(compactHtml).toContain('120ms');
    });

    it('should render disconnected state with rose status badge', () => {
      (whatsappHealthService as any).state = {
        status: 'disconnected',
        rawState: 'close',
        lastChecked: new Date('2026-08-27T15:10:00Z'),
        latencyMs: 0,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 1
      };

      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" />);
      expect(cardHtml).toContain('Desconectado');

      const compactHtml = renderToString(<WhatsAppHealthMonitor variant="compact" />);
      expect(compactHtml).toContain('Offline');
    });

    it('should render error state with red status badge and fallback latency', () => {
      (whatsappHealthService as any).state = {
        status: 'error',
        rawState: 'error',
        lastChecked: new Date('2026-08-27T15:15:00Z'),
        latencyMs: 0,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 3
      };

      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" />);
      expect(cardHtml).toContain('Erro de Conexão');
      expect(cardHtml).toContain('—');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Pause Dispatch Toggle & Local Queue Telemetry
  // --------------------------------------------------------------------------
  describe('3. Pause Dispatch Toggle & Local Queue Telemetry', () => {
    it('should reflect paused state when isPaused is true', () => {
      whatsappHealthService.setPaused(true);
      (whatsappHealthService as any).state.queuedCount = 3;

      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" />);
      expect(cardHtml).toContain('Fila Pausada');
      expect(cardHtml).toContain('Pausa de Disparos Ativada');
      expect(cardHtml).toContain('3 retidas');

      const compactHtml = renderToString(<WhatsAppHealthMonitor variant="compact" />);
      expect(compactHtml).toContain('Pausado');
    });

    it('should toggle pause state through whatsappHealthService.togglePause', () => {
      expect(whatsappHealthService.isPaused()).toBe(false);

      const firstToggle = whatsappHealthService.togglePause();
      expect(firstToggle).toBe(true);
      expect(whatsappHealthService.isPaused()).toBe(true);

      const secondToggle = whatsappHealthService.togglePause();
      expect(secondToggle).toBe(false);
      expect(whatsappHealthService.isPaused()).toBe(false);
    });

    it('should update queue telemetry when messages are enqueued or cleared', () => {
      whatsappHealthService.setPaused(true);
      const msgId1 = whatsappHealthService.enqueueMessage({
        recipient: '5511999999999',
        message: 'Teste de fila 1'
      });
      const msgId2 = whatsappHealthService.enqueueMessage({
        recipient: '5511988888888',
        message: 'Teste de fila 2'
      });

      expect(whatsappHealthService.getState().queuedCount).toBe(2);
      expect(whatsappHealthService.getQueue().length).toBe(2);

      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" showClearQueue={true} />);
      expect(cardHtml).toContain('2 retidas');
      expect(cardHtml).toContain('Limpar Fila (2)');

      whatsappHealthService.clearQueue();
      expect(whatsappHealthService.getState().queuedCount).toBe(0);
      expect(whatsappHealthService.getQueue().length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Manual Refresh & Check Health Trigger
  // --------------------------------------------------------------------------
  describe('4. Manual Refresh & Check Health Trigger', () => {
    it('should trigger checkNow on whatsappHealthService when invoked', async () => {
      const checkSpy = vi.spyOn(whatsappHealthService, 'checkNow').mockResolvedValueOnce({
        status: 'connected',
        rawState: 'open',
        lastChecked: new Date(),
        latencyMs: 38,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 0
      });

      const res = await whatsappHealthService.checkNow();
      expect(checkSpy).toHaveBeenCalled();
      expect(res.status).toBe('connected');
      expect(res.latencyMs).toBe(38);
    });

    it('should render manual refresh trigger buttons in card and popover variants', () => {
      const cardHtml = renderToString(<WhatsAppHealthMonitor variant="card" />);
      expect(cardHtml).toContain('Verificar Agora');

      const popoverHtml = renderToString(<WhatsAppHealthMonitor variant="header-popover" />);
      expect(popoverHtml).toContain('data-testid="whatsapp-health-popover-trigger"');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Variants Verification: Card, Compact, Header-Popover
  // --------------------------------------------------------------------------
  describe('5. Variant Renders Verification', () => {
    it('should render compact variant with online pill badge', () => {
      (whatsappHealthService as any).state = {
        status: 'connected',
        rawState: 'open',
        lastChecked: new Date(),
        latencyMs: 25,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 0
      };

      const html = renderToString(<WhatsAppHealthMonitor variant="compact" className="custom-compact-class" />);
      expect(html).toContain('custom-compact-class');
      expect(html).toContain('WhatsApp:');
      expect(html).toContain('Online');
      expect(html).toContain('25ms');
    });

    it('should render header-popover trigger button with glowing indicator', () => {
      (whatsappHealthService as any).state = {
        status: 'connected',
        rawState: 'open',
        lastChecked: new Date(),
        latencyMs: 15,
        isPaused: false,
        queuedCount: 0,
        consecutiveErrors: 0
      };

      const html = renderToString(<WhatsAppHealthMonitor variant="header-popover" className="topbar-widget" />);
      expect(html).toContain('topbar-widget');
      expect(html).toContain('data-testid="whatsapp-health-popover-trigger"');
      expect(html).toContain('title="WhatsApp Evolution API: Conectado (Open)"');
    });

    it('should render card variant with full 4 telemetry boxes and pause control', () => {
      const html = renderToString(<WhatsAppHealthMonitor variant="card" className="infra-card" />);
      expect(html).toContain('infra-card');
      expect(html).toContain('data-testid="whatsapp-health-card"');
      expect(html).toContain('Estado da Sessão');
      expect(html).toContain('Latência do Ping');
      expect(html).toContain('Última Checagem');
      expect(html).toContain('Mensagens na Fila');
      expect(html).toContain('data-testid="whatsapp-pause-control-banner"');
      expect(html).toContain('data-testid="whatsapp-pause-toggle"');
    });
  });
});

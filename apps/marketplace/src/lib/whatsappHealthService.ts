import { supabase } from './supabase';

export type WhatsAppHealthStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface QueuedWhatsAppNotification {
  id: string;
  recipient: string;
  message: string;
  options?: Record<string, any>;
  contextType?: string;
  createdAt: string;
  status?: 'queued' | 'processing' | 'failed';
  [key: string]: any;
}

export interface WhatsAppHealthState {
  status: WhatsAppHealthStatus;
  rawState: string;
  lastChecked: Date | null;
  latencyMs: number;
  isPaused: boolean;
  queuedCount: number;
  consecutiveErrors: number;
}

export type HealthSubscriber = (state: WhatsAppHealthState) => void;

export const WHATSAPP_STORAGE_KEYS = {
  PAUSED: 'gsa_whatsapp_dispatch_paused',
  QUEUE: 'gsa_whatsapp_pending_queue',
  CONNECTED_AT: 'gsa_whatsapp_connected_at'
} as const;

export const WHATSAPP_ENDPOINTS = {
  EVOLUTION_URL: 'http://147.15.43.141:8080/instance/connectionState/GSA_WhatsApp',
  EVOLUTION_APIKEY: 'gsa_hub_evolution_token_2026',
  VPS_IP: '147.15.43.141'
} as const;

export const WHATSAPP_POLLING_INTERVALS = {
  ACTIVE_MS: 30000,
  HIDDEN_MS: 120000,
  MIN_BACKOFF_MS: 5000,
  MAX_BACKOFF_MS: 60000
} as const;

function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export class WhatsAppHealthService {
  private state: WhatsAppHealthState = {
    status: 'connected',
    rawState: 'open',
    lastChecked: null,
    latencyMs: 0,
    isPaused: false,
    queuedCount: 0,
    consecutiveErrors: 0
  };

  private subscribers: Set<HealthSubscriber> = new Set();
  private timerId: any = null;
  private queue: QueuedWhatsAppNotification[] = [];
  private currentCheckPromise: Promise<WhatsAppHealthState> | null = null;
  private isListeningToEvents = false;

  constructor() {
    this.loadPersistedState();
    this.initEventListeners();
  }

  // --------------------------------------------------------------------------
  // Persistence & Storage
  // --------------------------------------------------------------------------

  private loadPersistedState(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const paused = localStorage.getItem(WHATSAPP_STORAGE_KEYS.PAUSED);
      if (paused !== null) {
        this.state.isPaused = paused === 'true';
      }

      const savedQueue = localStorage.getItem(WHATSAPP_STORAGE_KEYS.QUEUE);
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
          this.state.queuedCount = this.queue.length;
        }
      }
    } catch (err) {
      console.warn('⚠️ [WhatsAppHealthService] Falha ao carregar estado persistido:', err);
    }
  }

  private persistPausedState(paused: boolean): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(WHATSAPP_STORAGE_KEYS.PAUSED, String(paused));
    } catch (err) {
      console.warn('⚠️ [WhatsAppHealthService] Falha ao persistir estado de pausa:', err);
    }
  }

  private persistQueue(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(WHATSAPP_STORAGE_KEYS.QUEUE, JSON.stringify(this.queue));
    } catch (err) {
      console.warn('⚠️ [WhatsAppHealthService] Falha ao persistir fila:', err);
    }
  }

  // --------------------------------------------------------------------------
  // Getters & Subscriber Pattern
  // --------------------------------------------------------------------------

  public getState(): WhatsAppHealthState {
    return { ...this.state };
  }

  public isPaused(): boolean {
    return this.state.isPaused;
  }

  public getQueue(): QueuedWhatsAppNotification[] {
    return [...this.queue];
  }

  public subscribe(cb: HealthSubscriber): () => void {
    this.subscribers.add(cb);
    // Notifica imediatamente com estado atual
    cb(this.getState());

    // Se é o primeiro subscriber, garante que o keep-alive está ativo
    if (this.subscribers.size === 1) {
      this.startKeepAlive();
    }

    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) {
        this.stopKeepAlive();
      }
    };
  }

  private notify(): void {
    const currentState = this.getState();
    for (const subscriber of this.subscribers) {
      try {
        subscriber(currentState);
      } catch (err) {
        console.error('⚠️ [WhatsAppHealthService] Erro no listener:', err);
      }
    }
  }

  private updateState(partial: Partial<WhatsAppHealthState>): void {
    this.state = {
      ...this.state,
      ...partial
    };
    this.notify();
  }

  // --------------------------------------------------------------------------
  // Health Checking Logic (Evolution API + Edge Function Fallback)
  // --------------------------------------------------------------------------

  public checkHealth(): Promise<WhatsAppHealthState> {
    if (this.currentCheckPromise) {
      return this.currentCheckPromise;
    }

    this.currentCheckPromise = this.performHealthCheck().finally(() => {
      this.currentCheckPromise = null;
    });

    return this.currentCheckPromise;
  }

  private async performHealthCheck(): Promise<WhatsAppHealthState> {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      // 1. Tenta direto na Evolution API (Porta 8080)
      let resolvedStatus: WhatsAppHealthStatus | null = null;
      let resolvedRawState: string = 'unknown';

      try {
        const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch : globalThis.fetch;
        const res = await fetchFn(WHATSAPP_ENDPOINTS.EVOLUTION_URL, {
          method: 'GET',
          headers: {
            apikey: WHATSAPP_ENDPOINTS.EVOLUTION_APIKEY,
            'Content-Type': 'application/json'
          },
          signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          resolvedRawState = data?.instance?.state || data?.state || (data?.instance ? 'open' : 'open');
          
          if (resolvedRawState === 'open') {
            resolvedStatus = 'connected';
          } else if (resolvedRawState === 'connecting') {
            resolvedStatus = 'connecting';
          } else {
            resolvedStatus = 'disconnected';
          }
        }
      } catch (evoErr) {
        // Falha no endpoint direto -> tentar fallback
      }

      // 2. Fallback via Edge Function 'vps-api'
      if (!resolvedStatus) {
        try {
          const { data, error } = await supabase.functions.invoke('vps-api', {
            body: {
              action: 'whatsapp-status',
              targetIp: WHATSAPP_ENDPOINTS.VPS_IP
            }
          });

          if (!error && data) {
            resolvedRawState = data?.state || (data?.success ? 'open' : 'close');
            if (resolvedRawState === 'open' || data?.success) {
              resolvedStatus = 'connected';
              resolvedRawState = 'open';
            } else if (resolvedRawState === 'connecting') {
              resolvedStatus = 'connecting';
            } else {
              resolvedStatus = 'disconnected';
            }
          }
        } catch (edgeErr) {
          // Falha também no fallback Edge Function
        }
      }

      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const latency = Math.max(1, Math.round(endTime - startTime));

      if (resolvedStatus) {
        this.updateState({
          status: resolvedStatus,
          rawState: resolvedRawState,
          lastChecked: new Date(),
          latencyMs: latency,
          consecutiveErrors: 0
        });

        if (resolvedStatus === 'connected' && typeof localStorage !== 'undefined') {
          try {
            if (!localStorage.getItem(WHATSAPP_STORAGE_KEYS.CONNECTED_AT)) {
              localStorage.setItem(WHATSAPP_STORAGE_KEYS.CONNECTED_AT, new Date().toISOString());
            }
          } catch {}
        }
      } else {
        // Falha completa em ambos os canais
        const nextErrors = this.state.consecutiveErrors + 1;
        this.updateState({
          status: 'error',
          rawState: 'error',
          lastChecked: new Date(),
          latencyMs: latency,
          consecutiveErrors: nextErrors
        });
      }
    } catch (unexpectedErr) {
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const latency = Math.max(1, Math.round(endTime - startTime));
      this.updateState({
        status: 'error',
        rawState: 'error',
        lastChecked: new Date(),
        latencyMs: latency,
        consecutiveErrors: this.state.consecutiveErrors + 1
      });
    }

    return this.getState();
  }

  // Alias para checkHealth
  public checkNow(): Promise<WhatsAppHealthState> {
    return this.checkHealth();
  }

  // --------------------------------------------------------------------------
  // Keep-Alive Loop & Adaptive Scheduling
  // --------------------------------------------------------------------------

  public startKeepAlive(): void {
    if (this.timerId !== null) return;
    
    // Dispara a primeira checagem imediatamente
    void this.checkHealth();
    this.scheduleNextCheck();
  }

  public stopKeepAlive(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public getNextPollingInterval(): number {
    // Se houver erro, aplica backoff exponencial (5s, 10s, 20s, 40s, max 60s)
    if (this.state.consecutiveErrors > 0) {
      const exponent = Math.max(0, this.state.consecutiveErrors - 1);
      const backoff = WHATSAPP_POLLING_INTERVALS.MIN_BACKOFF_MS * Math.pow(2, exponent);
      return Math.min(backoff, WHATSAPP_POLLING_INTERVALS.MAX_BACKOFF_MS);
    }

    // Se aba estiver em background (hidden), desacelera para 120s
    if (typeof document !== 'undefined' && document.hidden) {
      return WHATSAPP_POLLING_INTERVALS.HIDDEN_MS;
    }

    // Padrão em foreground: 30s
    return WHATSAPP_POLLING_INTERVALS.ACTIVE_MS;
  }

  public scheduleNextCheck(customDelayMs?: number): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const delay = customDelayMs !== undefined ? customDelayMs : this.getNextPollingInterval();

    this.timerId = setTimeout(async () => {
      await this.checkHealth();
      this.scheduleNextCheck();
    }, delay);
  }

  // --------------------------------------------------------------------------
  // Event Listeners (Page Visibility & Network Online)
  // --------------------------------------------------------------------------

  private initEventListeners(): void {
    if (this.isListeningToEvents) return;

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          // Ao retornar o foco para a aba: checagem imediata e restaura intervalo de 30s
          void this.checkHealth();
          this.scheduleNextCheck(WHATSAPP_POLLING_INTERVALS.ACTIVE_MS);
        } else {
          // Ao ocultar a aba: reagenda para 120s
          this.scheduleNextCheck(WHATSAPP_POLLING_INTERVALS.HIDDEN_MS);
        }
      });
      this.isListeningToEvents = true;
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => {
        void this.checkHealth();
        this.scheduleNextCheck(WHATSAPP_POLLING_INTERVALS.ACTIVE_MS);
      });

      window.addEventListener('offline', () => {
        this.updateState({
          status: 'disconnected',
          rawState: 'offline'
        });
      });
    }
  }

  // --------------------------------------------------------------------------
  // Queue & Pause Dispatch Control
  // --------------------------------------------------------------------------

  public setPaused(paused: boolean): void {
    this.state.isPaused = paused;
    this.persistPausedState(paused);
    this.notify();
  }

  public togglePause(): boolean {
    const nextState = !this.state.isPaused;
    this.setPaused(nextState);
    return nextState;
  }

  public enqueueMessage(
    item: Omit<QueuedWhatsAppNotification, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): string {
    const queueItem: QueuedWhatsAppNotification = {
      recipient: item.recipient,
      message: item.message,
      id: item.id || generateUniqueId(),
      createdAt: item.createdAt || new Date().toISOString(),
      status: item.status || 'queued',
      ...item,
    };

    this.queue.push(queueItem);
    this.state.queuedCount = this.queue.length;
    this.persistQueue();
    this.notify();
    return queueItem.id;
  }

  public removeQueuedMessage(id: string): boolean {
    const initialLen = this.queue.length;
    this.queue = this.queue.filter(msg => msg.id !== id);
    if (this.queue.length !== initialLen) {
      this.state.queuedCount = this.queue.length;
      this.persistQueue();
      this.notify();
      return true;
    }
    return false;
  }

  public clearQueue(): void {
    this.queue = [];
    this.state.queuedCount = 0;
    this.persistQueue();
    this.notify();
  }
}

// Singleton Export
export const whatsappHealthService = new WhatsAppHealthService();

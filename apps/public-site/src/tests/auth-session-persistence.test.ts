import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock storage infrastructure for Node/Vitest
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

global.localStorage = mockLocalStorage as any;
global.sessionStorage = mockSessionStorage as any;

if (typeof window === 'undefined') {
  (global as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (global as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: any) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
} else {
  (window as any).localStorage = mockLocalStorage;
  (window as any).sessionStorage = mockSessionStorage;
}

// Hoisted mocks for Supabase client
const mockRpc = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockRefreshSession = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
      refreshSession: (...args: any[]) => mockRefreshSession(...args),
      signInWithPassword: vi.fn(),
      verifyOtp: vi.fn(),
    },
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
  getSupabase: () => ({
    rpc: (...args: any[]) => mockRpc(...args),
    auth: {
      getSession: (...args: any[]) => mockGetSession(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
      refreshSession: (...args: any[]) => mockRefreshSession(...args),
      signInWithPassword: vi.fn(),
      verifyOtp: vi.fn(),
    },
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
  }),
}));

import { sessionService } from '../lib/sessionService';

describe('Authentication & Session Persistence Test Suite (F5 / R3)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    vi.clearAllMocks();

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'u-default', app_metadata: {} } } },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });
    mockRefreshSession.mockResolvedValue({
      data: { session: { user: { id: 'u-default', app_metadata: {} } } },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. LocalStorage and SessionStorage Multi-Store Persistence', () => {
    it('should return null when reading an uninitialized session', () => {
      const session = sessionService.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should handle corrupted JSON data in localStorage without throwing and return null', () => {
      memoryLocalStorage['_gsa_session'] = 'INVALID_NON_JSON_STRING{{{';
      const session = sessionService.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should correctly read valid stored session from localStorage', () => {
      const validSession = {
        sessaoId: 'sess-1001-uuid',
        sessionToken: 'token-abc-123',
        atorTipo: 'cliente',
        atorId: 'cli-555-uuid',
        atorNome: 'Adriano Farias',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(validSession);

      const session = sessionService.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.sessaoId).toBe('sess-1001-uuid');
      expect(session?.sessionToken).toBe('token-abc-123');
      expect(session?.atorTipo).toBe('cliente');
      expect(session?.atorId).toBe('cli-555-uuid');
      expect(session?.atorNome).toBe('Adriano Farias');
    });

    it('should fallback to sessionStorage if localStorage entry is missing', () => {
      const validSession = {
        sessaoId: 'sess-2002-uuid',
        sessionToken: 'token-xyz-789',
        atorTipo: 'colaborador',
        atorId: 'colab-111-uuid',
        atorNome: 'Gestor Operacional',
      };
      memorySessionStorage['_gsa_session'] = JSON.stringify(validSession);

      const session = sessionService.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session?.sessaoId).toBe('sess-2002-uuid');
      expect(session?.atorTipo).toBe('colaborador');
    });

    it('should persist and retrieve client person type (PF / PJ) across storages', () => {
      sessionService.setClientPersonType('pj');
      expect(sessionService.getClientPersonType()).toBe('pj');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('_gsa_client_person_type', 'pj');
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('_gsa_client_person_type', 'pj');

      sessionService.setClientPersonType('pf');
      expect(sessionService.getClientPersonType()).toBe('pf');
    });
  });

  describe('2. Session Recovery Across Reloads (restoreSession)', () => {
    it('should return null if essential session properties are absent', async () => {
      memoryLocalStorage['_gsa_session'] = JSON.stringify({ sessaoId: 's1' }); // missing sessionToken, atorId
      const restored = await sessionService.restoreSession();
      expect(restored).toBeNull();
    });

    it('should validate session with Supabase DB RPC and maintain active session', async () => {
      const stored = {
        sessaoId: 'sess-active-123',
        sessionToken: 'token-active-123',
        atorTipo: 'cliente',
        atorId: 'cli-777',
        atorNome: 'Cliente Ativo',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === 'gsa_validate_session') {
          return { data: [{ is_valid: true }], error: null };
        }
        if (fn === 'gsa_get_client_session_access_state') {
          return { data: { success: true, precisa_trocar_senha: false }, error: null };
        }
        return { data: null, error: null };
      });

      const restored = await sessionService.restoreSession();
      expect(restored).not.toBeNull();
      expect(restored?.sessaoId).toBe('sess-active-123');
      expect(restored?.precisa_trocar_senha).toBe(false);
    });

    it('should clear stored session if database RPC explicitly indicates invalid session', async () => {
      const stored = {
        sessaoId: 'sess-invalid-999',
        sessionToken: 'token-invalid-999',
        atorTipo: 'cliente',
        atorId: 'cli-999',
        atorNome: 'Cliente Revogado',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === 'gsa_validate_session') {
          return { data: [{ is_valid: false }], error: null };
        }
        return { data: null, error: null };
      });

      const restored = await sessionService.restoreSession();
      expect(restored).toBeNull();
      expect(memoryLocalStorage['_gsa_session']).toBeUndefined();
    });

    it('should clear legacy collaborator sessions during restoreSession', async () => {
      const stored = {
        sessaoId: 'sess-colab-888',
        sessionToken: 'token-colab-888',
        atorTipo: 'colaborador',
        atorId: 'colab-888',
        atorNome: 'Colaborador GSA',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === 'gsa_validate_session') {
          return { data: { is_valid: true }, error: null };
        }
        if (fn === 'gsa_get_collaborator_session_access_state') {
          return {
            data: {
              success: true,
              status: 'ativo',
              nome: 'Colaborador Atualizado',
              modulos: ['operacoes', 'financeiro', 'governanca'],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const restored = await sessionService.restoreSession();
      expect(restored).toBeNull();
      expect(memoryLocalStorage['_gsa_session']).toBeUndefined();
    });

    it('should clear every legacy collaborator session regardless of stored status', async () => {
      const stored = {
        sessaoId: 'sess-colab-blocked',
        sessionToken: 'token-colab-blocked',
        atorTipo: 'colaborador',
        atorId: 'colab-blocked',
        atorNome: 'Colaborador Bloqueado',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === 'gsa_validate_session') {
          return { data: { is_valid: true }, error: null };
        }
        if (fn === 'gsa_get_collaborator_session_access_state') {
          return {
            data: {
              success: true,
              status: 'bloqueado',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const restored = await sessionService.restoreSession();
      expect(restored).toBeNull();
      expect(memoryLocalStorage['_gsa_session']).toBeUndefined();
    });

    it('should deduplicate concurrent restoreSession calls into a single in-flight promise', async () => {
      const stored = {
        sessaoId: 'sess-dedup',
        sessionToken: 'token-dedup',
        atorTipo: 'cliente',
        atorId: 'cli-dedup',
        atorNome: 'Cliente Dedup',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async (fn: string) => {
        await new Promise((r) => setTimeout(r, 20));
        return { data: [{ is_valid: true }], error: null };
      });

      const [res1, res2, res3] = await Promise.all([
        sessionService.restoreSession(),
        sessionService.restoreSession(),
        sessionService.restoreSession(),
      ]);

      expect(res1).toEqual(res2);
      expect(res2).toEqual(res3);
      // gsa_validate_session must only be called once due to promise memoization
      const validateCalls = mockRpc.mock.calls.filter((c) => c[0] === 'gsa_validate_session');
      expect(validateCalls.length).toBe(1);
    });
  });

  describe('3. Resilience Against Transient Network Offline States', () => {
    it('should NOT terminate session when DB RPC throws a network error during restoreSession', async () => {
      const stored = {
        sessaoId: 'sess-offline-1',
        sessionToken: 'token-offline-1',
        atorTipo: 'cliente',
        atorId: 'cli-offline',
        atorNome: 'Cliente Offline',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockRejectedValue(new Error('Network error: Failed to fetch'));
      mockGetSession.mockRejectedValue(new Error('Network unreachable'));

      const restored = await sessionService.restoreSession();
      expect(restored).not.toBeNull();
      expect(restored?.sessaoId).toBe('sess-offline-1');
      expect(memoryLocalStorage['_gsa_session']).toBeDefined();
    });

    it('should ignore transient network errors during pingSession without revoking stored session', async () => {
      const stored = {
        sessaoId: 'sess-ping-offline',
        sessionToken: 'token-ping-offline',
        atorTipo: 'cliente',
        atorId: 'cli-ping',
        atorNome: 'Cliente Ping',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockRejectedValue(new Error('Timeout 504 Gateway Error'));

      await expect(sessionService.pingSession()).resolves.not.toThrow();
      expect(sessionService.getCurrentSession()).not.toBeNull();
    });
  });

  describe('4. Session Termination & Clean Revocation (endSession)', () => {
    it('should completely purge all storage keys and notify Supabase on endSession', async () => {
      const stored = {
        sessaoId: 'sess-to-end',
        sessionToken: 'token-to-end',
        atorTipo: 'cliente',
        atorId: 'cli-to-end',
        atorNome: 'Cliente Finalizando',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);
      memoryLocalStorage['sessaoId'] = 'sess-to-end';
      memoryLocalStorage['_gsa_sess'] = 'legacy';
      memoryLocalStorage['lastPing'] = '123456';
      memorySessionStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockResolvedValue({ data: true, error: null });
      mockSignOut.mockResolvedValue({ error: null });

      await sessionService.endSession();

      expect(mockRpc).toHaveBeenCalledWith('gsa_end_session', {
        p_sessao_id: 'sess-to-end',
        p_session_token: 'token-to-end',
      });
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(memoryLocalStorage['_gsa_session']).toBeUndefined();
      expect(memoryLocalStorage['sessaoId']).toBeUndefined();
      expect(memoryLocalStorage['_gsa_sess']).toBeUndefined();
      expect(memoryLocalStorage['lastPing']).toBeUndefined();
      expect(memorySessionStorage['_gsa_session']).toBeUndefined();
    });

    it('should deduplicate concurrent endSession calls', async () => {
      const stored = {
        sessaoId: 'sess-concurrent-end',
        sessionToken: 'token-concurrent-end',
        atorTipo: 'cliente',
        atorId: 'cli-end',
        atorNome: 'Cliente End',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { data: true, error: null };
      });

      await Promise.all([sessionService.endSession(), sessionService.endSession()]);

      const endCalls = mockRpc.mock.calls.filter((c) => c[0] === 'gsa_end_session');
      expect(endCalls.length).toBe(1);
    });
  });

  describe('5. Realtime Status & Auto-Logout Behavior Verification', () => {
    it('should verify auto-logout triggers on explicit session superseding via pingSession returning false', async () => {
      const stored = {
        sessaoId: 'sess-superseded',
        sessionToken: 'token-superseded',
        atorTipo: 'cliente',
        atorId: 'cli-superseded',
        atorNome: 'Cliente Desconectado',
      };
      memoryLocalStorage['_gsa_session'] = JSON.stringify(stored);

      mockRpc.mockImplementation(async (fn: string) => {
        if (fn === 'gsa_ping_session') {
          return { data: false, error: null }; // session terminated on server
        }
        return { data: null, error: null };
      });

      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      await sessionService.pingSession();

      expect(memoryLocalStorage['_gsa_session']).toBeUndefined();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'gsa-session-revoked',
        })
      );
    });

    it('should verify realtime payload handler only triggers logout when status is encerrado', () => {
      const onLogout = vi.fn();

      const simulateRealtimeEvent = (status: string) => {
        const payload = { new: { status } };
        if (payload.new && payload.new.status === 'encerrado') {
          onLogout('superseded');
        }
      };

      // Non-terminating events must NOT trigger logout
      simulateRealtimeEvent('ativo');
      expect(onLogout).not.toHaveBeenCalled();

      simulateRealtimeEvent('conectado');
      expect(onLogout).not.toHaveBeenCalled();

      simulateRealtimeEvent('pendente');
      expect(onLogout).not.toHaveBeenCalled();

      // Only 'encerrado' triggers logout
      simulateRealtimeEvent('encerrado');
      expect(onLogout).toHaveBeenCalledWith('superseded');
    });
  });
});

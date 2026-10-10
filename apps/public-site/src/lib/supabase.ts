import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PRIVATE_CLIENT_BUCKET = 'documentos_cliente';
const PRIVATE_ADMIN_BUCKET = 'gsa-private-documents';
const PRIVATE_ADMIN_PREFIX = `gsa-private://${PRIVATE_ADMIN_BUCKET}/`;
const CLIENT_SESSION_KEY = '_gsa_session';
const MAX_CLIENT_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_CLIENT_FILE_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt',
]);

let supabaseInstance: SupabaseClient | null = null;
let storageProxy: any = null;
let rpcProxy: any = null;

const persistentStorageAdapter = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
      window.sessionStorage.setItem(key, value);
    }
  },
  removeItem(key: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  },
};

const sessionStorageAdapter = persistentStorageAdapter;

function legacySupabaseStorageKey(supabaseUrl: string) {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    if (!hostname.endsWith('.supabase.co')) return null;
    const projectRef = hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

function clearLegacySupabaseLocalStorage(supabaseUrl: string) {
  if (typeof window === 'undefined') return;

  const storageKey = legacySupabaseStorageKey(supabaseUrl);
  if (!storageKey) return;

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key === storageKey || key?.startsWith(`${storageKey}.`)) {
      window.localStorage.removeItem(key);
    }
  }
}

function normalizeStoragePath(path: string): string {
  const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) {
    throw new Error('Caminho de arquivo inválido.');
  }
  return normalized;
}

function sanitizeFileName(fileName: string) {
  return String(fileName || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
    .slice(-160) || 'arquivo';
}

function privateReference(path: string) {
  return `${PRIVATE_ADMIN_PREFIX}${normalizeStoragePath(path)}`;
}

function privateReferencePath(reference?: string | null) {
  if (!reference?.startsWith(PRIVATE_ADMIN_PREFIX)) return null;
  return normalizeStoragePath(reference.slice(PRIVATE_ADMIN_PREFIX.length));
}

function getStoredActor(): { atorTipo?: string; atorId?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLIENT_SESSION_KEY) || window.sessionStorage.getItem(CLIENT_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function validateClientStoragePath(bucket: string, path: string): string {
  const normalized = normalizeStoragePath(path);
  if (bucket !== PRIVATE_CLIENT_BUCKET) return normalized;

  const actor = getStoredActor();
  if (actor?.atorTipo === 'cliente' && actor.atorId) {
    const segments = normalized.split('/');
    const actorInRoot = segments[0] === actor.atorId;
    const actorInOwnedContext = [
      'credito_documentos', 'credito_contratos', 'cliente_documentos',
      'documentos', 'perfil', 'suporte', 'tickets',
    ].includes(segments[0]) && segments[1] === actor.atorId;

    if (!actorInRoot && !actorInOwnedContext) {
      throw new Error('O arquivo não pertence ao cliente autenticado.');
    }
  }

  return normalized;
}

function validateClientUpload(bucket: string, path: string, body: unknown): string {
  const normalized = validateClientStoragePath(bucket, path);
  if (bucket !== PRIVATE_CLIENT_BUCKET) return normalized;

  const actor = getStoredActor();
  if (actor?.atorTipo !== 'cliente') return normalized;

  const blob = body instanceof Blob ? body : null;
  if (!blob || blob.size <= 0 || blob.size > MAX_CLIENT_FILE_SIZE) {
    throw new Error('O arquivo deve possuir no máximo 10 MB.');
  }

  const extension = normalized.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_CLIENT_FILE_EXTENSIONS.has(extension)) {
    throw new Error('Formato de arquivo não permitido.');
  }

  return normalized;
}

function getStorageProxy(client: SupabaseClient): any {
  if (storageProxy) return storageProxy;

  const storage = (client as any).storage;
  storageProxy = new Proxy(storage, {
    get(target, property) {
      if (property !== 'from') {
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      }

      return (bucket: string) => {
        const bucketApi = target.from(bucket);

        if (bucket !== PRIVATE_CLIENT_BUCKET) return bucketApi;

        return new Proxy(bucketApi, {
          get(bucketTarget, bucketProperty) {
            if (bucketProperty === 'getPublicUrl') {
              return (path: string) => {
                const normalized = validateClientStoragePath(bucket, path);
                return {
                  data: {
                    publicUrl: `storage://${bucket}/${normalized}`,
                  },
                };
              };
            }

            if (bucketProperty === 'upload' || bucketProperty === 'update') {
              return (path: string, body: unknown, options?: unknown) => {
                const normalized = validateClientUpload(bucket, path, body);
                return bucketTarget[bucketProperty](normalized, body, options);
              };
            }

            if (bucketProperty === 'remove') {
              return (paths: string[]) => {
                const normalizedPaths = paths.map((path) => validateClientStoragePath(bucket, path));
                return bucketTarget.remove(normalizedPaths);
              };
            }

            if (bucketProperty === 'move' || bucketProperty === 'copy') {
              return (fromPath: string, toPath: string, options?: unknown) => {
                const normalizedFrom = validateClientStoragePath(bucket, fromPath);
                const normalizedTo = validateClientStoragePath(bucket, toPath);
                return bucketTarget[bucketProperty](normalizedFrom, normalizedTo, options);
              };
            }

            const value = bucketTarget[bucketProperty];
            return typeof value === 'function' ? value.bind(bucketTarget) : value;
          },
        });
      };
    },
  });

  return storageProxy;
}

export const SUPABASE_URL_FALLBACK = 'https://api.147-15-43-141.nip.io';
export const SUPABASE_ANON_KEY_FALLBACK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzczOTU2NDA5LCJleHAiOjIwODk1MzI0MDl9.05kQchOXKH2S062F8SJsb-bmnh3pni-RJE1P0jo0Igs';

export const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL_FALLBACK;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Erro Crítico: Credenciais do Supabase não encontradas. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ativar o banco de dados real.',
      );
    }

    clearLegacySupabaseLocalStorage(supabaseUrl);

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: sessionStorageAdapter,
        autoRefreshToken: false,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      realtime: {
        params: {
          eventsPerSecond: 5,
        },
        timeout: 30000,
        heartbeatIntervalMs: 30000,
        reconnectAfterMs: (tries: number) => {
          // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 30s (máximo)
          return Math.min(1000 * Math.pow(2, tries), 30000);
        },
      },
    });
  }
  return supabaseInstance;
};

// Proxy de inicialização preguiçosa ligado 100% ao banco de dados real
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, property) => {
    const client = getSupabase();
    if (property === 'storage') return getStorageProxy(client);
    const value = (client as any)[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set: (_target, property, value) => {
    const client = getSupabase();
    (client as any)[property] = value;
    return true;
  },
  has: (_target, property) => property in getSupabase(),
  ownKeys: () => Reflect.ownKeys(getSupabase()),
  getOwnPropertyDescriptor: (_target, property) => Object.getOwnPropertyDescriptor(getSupabase(), property),
  getPrototypeOf: () => Object.getPrototypeOf(getSupabase()),
});

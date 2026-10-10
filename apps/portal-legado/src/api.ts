export type Row = Record<string, any>;

// Demo fixtures are intentionally limited to local development. Production
// must render only data returned by the authenticated API.
export const isDemoMode = import.meta.env.DEV;

export async function api(path: string, data?: any, method?: string) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  // The local profile switcher is a development convenience, so identify the
  // active portal to the local server without weakening production auth.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const queryRole = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : '';
  const demoRole = pathname.startsWith('/cliente/')
    ? 'client'
    : pathname.startsWith('/admin/')
      ? 'admin'
      : queryRole === 'client' || queryRole === 'admin'
        ? queryRole
        : '';
  const headers: Record<string, string> = {};
  if (data && !isFormData) headers['Content-Type'] = 'application/json';
  if (demoRole) headers['X-GSA-Demo-Role'] = demoRole;
  const response = await fetch('/api' + path, {
    method: method || (data ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: Object.keys(headers).length ? headers : undefined,
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Não foi possível concluir a ação.');
  }
  return result;
}

export const money = (n: any) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0) / 100);

export const date = (v: any) =>
  v ? new Date(String(v).length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR') : '—';

export const when = (v: any) =>
  v ? new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(v)) : '—';

export const dateTime = (v: any) =>
  v ? when(v).replace(', ', ' às ') : '—';

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

export const initials = (name: string = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

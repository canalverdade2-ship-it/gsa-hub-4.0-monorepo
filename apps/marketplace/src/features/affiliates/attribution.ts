import { callClientRpc } from '../../lib/clientRpc';
import { supabase } from '../../lib/supabase';
import { generateUUID } from '../../lib/utils';

const PENDING_CLICK_STORAGE_KEY = 'gsa_affiliate_pending_clicks_v1';
const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{6,96}$/;
const CLICK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,256}$/;
const MAX_PENDING_CLICKS = 8;
const DEFAULT_CLICK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CapturedReferral {
  code: string;
  landingPath: string;
  referrerHost: string | null;
}

interface PendingAffiliateClick {
  token: string;
  expiresAt: string;
}

let capturedReferral: CapturedReferral | null = null;
let processingReferral: Promise<void> | null = null;
let bindingClicks: Promise<void> | null = null;

function safeSessionStorage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function sanitizeLandingPath(url: URL) {
  const params = new URLSearchParams(url.search);
  params.delete('ref');
  const search = params.toString();
  const path = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  return path.startsWith('/') ? path.slice(0, 600) : '/';
}

function sanitizeReferrerHost(referrer: string) {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase().slice(0, 253) || null;
  } catch {
    return null;
  }
}

function normalizeRpcPayload(value: unknown): Record<string, unknown> | null {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === 'object' ? item as Record<string, unknown> : null;
}

function readPendingClicks() {
  const storage = safeSessionStorage();
  if (!storage) return [] as PendingAffiliateClick[];

  try {
    const parsed = JSON.parse(storage.getItem(PENDING_CLICK_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((item): item is PendingAffiliateClick => (
        item
        && typeof item.token === 'string'
        && CLICK_TOKEN_PATTERN.test(item.token)
        && typeof item.expiresAt === 'string'
        && Date.parse(item.expiresAt) > now
      ))
      .slice(-MAX_PENDING_CLICKS);
  } catch {
    storage.removeItem(PENDING_CLICK_STORAGE_KEY);
    return [];
  }
}

function writePendingClicks(clicks: PendingAffiliateClick[]) {
  const storage = safeSessionStorage();
  if (!storage) return;
  if (clicks.length === 0) {
    storage.removeItem(PENDING_CLICK_STORAGE_KEY);
    return;
  }
  storage.setItem(PENDING_CLICK_STORAGE_KEY, JSON.stringify(clicks.slice(-MAX_PENDING_CLICKS)));
}

/**
 * Captures the referral synchronously before React and legacy redirects run.
 * The untrusted link code remains in memory only; persistent storage receives
 * exclusively the opaque click token returned after server validation.
 */
export function captureAffiliateReferralFromLocation() {
  if (typeof window === 'undefined') return;

  const currentUrl = new URL(window.location.href);
  const code = currentUrl.searchParams.get('ref')?.trim() || '';
  if (!LINK_CODE_PATTERN.test(code)) return;

  capturedReferral = {
    code,
    landingPath: sanitizeLandingPath(currentUrl),
    referrerHost: sanitizeReferrerHost(document.referrer),
  };
}

export async function processCapturedAffiliateReferral() {
  if (processingReferral) return processingReferral;
  const referral = capturedReferral;
  if (!referral) return;
  capturedReferral = null;

  processingReferral = (async () => {
    const visitorToken = generateUUID();
    const { data, error } = await supabase.rpc('gsa_public_track_affiliate_click', {
      p_codigo: referral.code,
      p_visitante_token: visitorToken,
      p_landing_path: referral.landingPath,
      p_referrer_host: referral.referrerHost,
    });
    if (error) throw error;

    const payload = normalizeRpcPayload(data);
    const token = typeof payload?.click_token === 'string' ? payload.click_token : '';
    if (payload?.success === false || !CLICK_TOKEN_PATTERN.test(token)) return;

    const rpcExpiry = typeof payload?.expires_at === 'string' ? Date.parse(payload.expires_at) : Number.NaN;
    const expiresAt = new Date(Number.isFinite(rpcExpiry) && rpcExpiry > Date.now()
      ? Math.min(rpcExpiry, Date.now() + DEFAULT_CLICK_TTL_MS)
      : Date.now() + DEFAULT_CLICK_TTL_MS).toISOString();
    const pending = readPendingClicks().filter((item) => item.token !== token);
    pending.push({ token, expiresAt });
    writePendingClicks(pending);
  })().catch((error) => {
    console.warn('Não foi possível validar a indicação de afiliado.', error);
  }).finally(() => {
    processingReferral = null;
  });

  return processingReferral;
}

export async function bindPendingAffiliateClicks() {
  if (bindingClicks) return bindingClicks;
  const pending = readPendingClicks();
  if (pending.length === 0) return;

  bindingClicks = (async () => {
    const remaining: PendingAffiliateClick[] = [];
    for (const click of pending) {
      try {
        const result = normalizeRpcPayload(await callClientRpc('gsa_client_bind_affiliate_click', {
          p_click_token: click.token,
        }));
        if (result?.success === false && result?.retryable === true) remaining.push(click);
      } catch (error) {
        // Keep a valid token when a transient connectivity error prevents binding.
        if (typeof navigator !== 'undefined' && !navigator.onLine) remaining.push(click);
        else console.warn('Não foi possível vincular a indicação ao cliente.', error);
      }
    }
    writePendingClicks(remaining);
  })().finally(() => {
    bindingClicks = null;
  });

  return bindingClicks;
}

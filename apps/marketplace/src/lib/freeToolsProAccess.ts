import { supabase } from './supabase';

export type ProToolId =
  | 'termination'
  | 'retirement'
  | 'vacation'
  | 'thirteenth'
  | 'benefits'
  | 'bpc'
  | 'overtime'
  | 'net_salary'
  | 'mei_limit'
  | 'unemployment'
  | 'fator_r'
  | 'amortization'
  | 'internship_termination'
  | 'prolabore_vs_lucros'
  | 'employee_cost'
  | 'night_shift_rural_urban'
  | 'proportional_salary'
  | 'late_fee_calculator'
  | 'child_support';

export type ProBlockMode = 'total' | 'partial';

export interface ProProductInfo {
  tool_id: ProToolId;
  nome: string;
  preco_centavos: number;
  duracao_acesso_minutos: number;
  gratuito_inicio?: string | null;
  gratuito_fim?: string | null;
  modo_bloqueio?: ProBlockMode;
}

export interface ProAccessStatus {
  success: boolean;
  available: boolean;
  access: boolean;
  source?: string | null;
  logged_in?: boolean;
  client_active?: boolean;
  client_has_paid_invoice?: boolean;
  checkout_available?: boolean;
  product?: ProProductInfo | null;
  session_expires_at?: string | null;
}

const VISITOR_TOKEN_KEY = 'gsa_free_tools_visitor_token';
const PRO_SESSION_PREFIX = 'gsa_free_tools_pro_session_';

function randomHex(bytesLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesLength));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getFreeToolsVisitorToken() {
  let token = localStorage.getItem(VISITOR_TOKEN_KEY) || '';
  if (!/^[a-zA-Z0-9_-]{20,160}$/.test(token)) {
    token = `gsa_${randomHex()}`;
    localStorage.setItem(VISITOR_TOKEN_KEY, token);
  }
  return token;
}

export function getStoredProSession(tool: ProToolId) {
  return sessionStorage.getItem(`${PRO_SESSION_PREFIX}${tool}`) || '';
}

export function storeProSession(tool: ProToolId, token?: string | null) {
  if (token) sessionStorage.setItem(`${PRO_SESSION_PREFIX}${tool}`, token);
}

export function clearStoredProSession(tool: ProToolId) {
  sessionStorage.removeItem(`${PRO_SESSION_PREFIX}${tool}`);
}

async function invoke<T>(action: string, tool: ProToolId, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gsa-free-tools', {
    body: {
      action,
      payload: {
        tool_id: tool,
        visitor_token: getFreeToolsVisitorToken(),
        pro_session_token: getStoredProSession(tool) || undefined,
        ...payload,
      },
    },
  });
  if (error) {
    const response = (error as any)?.context instanceof Response ? (error as any).context as Response : null;
    let message = error.message || 'Não foi possível consultar o acesso Pro.';
    if (response) {
      try {
        const body = await response.clone().json();
        if (body?.error) message = body.error;
      } catch {
        // Mantém a mensagem original.
      }
    }
    throw new Error(message);
  }
  return data as T;
}

export const freeToolsProAccess = {
  async status(tool: ProToolId) {
    const status = await invoke<ProAccessStatus>('status', tool);
    if (!status.access && getStoredProSession(tool)) clearStoredProSession(tool);
    return status;
  },

  async activate(tool: ProToolId) {
    const result = await invoke<{ success: boolean; token?: string; source?: string; expires_at?: string; error?: string }>('activate', tool);
    if (result.token) storeProSession(tool, result.token);
    return result;
  },

  async redeemVoucher(tool: ProToolId, code: string) {
    const result = await invoke<{
      success: boolean;
      error?: string;
      session?: { success?: boolean; token?: string; source?: string; expires_at?: string; error?: string };
    }>('redeem_voucher', tool, { code });
    if (result.session?.token) storeProSession(tool, result.session.token);
    return result;
  },

  async requestWhatsAppVoucher(tool: ProToolId, phone: string) {
    return invoke<{
      success: boolean;
      phone?: string;
      voucher_code?: string;
      error?: string;
      message?: string;
    }>('request_whatsapp_voucher', tool, { phone });
  },

  async consumeSession(tool: ProToolId) {
    const token = getStoredProSession(tool);
    if (!token) return { success: false, consumed: false };
    try {
      const result = await invoke<{ success: boolean; consumed?: boolean }>('consume_pro_usage', tool, {
        pro_session_token: token,
      });
      clearStoredProSession(tool);
      return result;
    } catch {
      clearStoredProSession(tool);
      return { success: false, consumed: false };
    }
  },

  async createCheckout(tool: ProToolId, customer?: { name?: string; email?: string; phone?: string }) {
    return invoke<{ success: boolean; order_nsu?: string; checkout_url?: string; error?: string }>('create_checkout', tool, {
      customer_name: customer?.name || undefined,
      customer_email: customer?.email || undefined,
      customer_phone: customer?.phone || undefined,
    });
  },

  async verifyPayment(tool: ProToolId, params: { orderNsu: string; transactionNsu: string; slug: string }) {
    const result = await invoke<{
      success: boolean;
      paid?: boolean;
      error?: string;
      session?: { success?: boolean; token?: string; expires_at?: string; error?: string };
    }>('verify_payment', tool, {
      order_nsu: params.orderNsu,
      transaction_nsu: params.transactionNsu,
      slug: params.slug,
    });
    if (result.session?.token) storeProSession(tool, result.session.token);
    return result;
  },
};

export function readInfinitePayReturn() {
  const params = new URLSearchParams(window.location.search);
  const tool = params.get('calculator') as ProToolId | null;
  const orderNsu = params.get('order_nsu') || params.get('pro_payment') || '';
  const transactionNsu = params.get('transaction_nsu') || '';
  const slug = params.get('slug') || '';
  if (!tool || !['termination', 'retirement', 'vacation', 'thirteenth', 'benefits', 'bpc'].includes(tool) || !orderNsu) return null;
  return { tool, orderNsu, transactionNsu, slug };
}

export function clearInfinitePayReturnFromUrl() {
  const url = new URL(window.location.href);
  for (const key of ['calculator', 'pro_payment', 'order_nsu', 'transaction_nsu', 'slug', 'receipt_url', 'capture_method']) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

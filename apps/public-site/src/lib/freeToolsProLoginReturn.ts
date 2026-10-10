import type { ProToolId } from './freeToolsProAccess';

const STORAGE_KEY = 'gsa_free_tools_pro_login_return';
const MAX_AGE_MS = 30 * 60 * 1000;
const VALID_TOOLS: ProToolId[] = ['termination', 'retirement', 'vacation'];

interface PendingProLoginReturn {
  tool: ProToolId;
  createdAt: number;
}

export function rememberFreeToolsProLoginReturn(tool: ProToolId) {
  if (typeof window === 'undefined') return;
  const pending: PendingProLoginReturn = { tool, createdAt: Date.now() };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function consumeFreeToolsProLoginReturn(): ProToolId | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as Partial<PendingProLoginReturn>;
    if (!pending.tool || !VALID_TOOLS.includes(pending.tool)) return null;
    if (!pending.createdAt || Date.now() - pending.createdAt > MAX_AGE_MS) return null;
    return pending.tool;
  } catch {
    return null;
  }
}

export function buildFreeToolsProLoginReturnUrl(tool: ProToolId) {
  const params = new URLSearchParams({
    calculator: tool,
    pro_payment: 'client-login',
  });
  return `/servicos-gratuitos?${params.toString()}`;
}

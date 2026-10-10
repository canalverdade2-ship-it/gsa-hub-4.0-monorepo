type ClientErrorContext = {
  componentStack?: string;
  source?: string;
};

type ClientErrorPayload = {
  id: string;
  message: string;
  name: string;
  source: string;
  route: string;
  occurredAt: string;
  userAgent: string;
  componentStack?: string;
  stack?: string;
};

function createReferenceId() {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).substring(2, 10);
  return `GSA-${Date.now().toString(36).toUpperCase()}-${randomPart.toUpperCase()}`;
}

function sanitize(value: string | undefined, maxLength: number) {
  if (!value) return undefined;
  return value
    .replace(/(apikey|authorization|token|password|senha|secret)=?[^\s&]*/gi, '$1=[REDACTED]')
    .slice(0, maxLength);
}

function safeRoute() {
  const parameterNames = [...new URLSearchParams(window.location.search).keys()]
    .filter((name, index, all) => all.indexOf(name) === index)
    .map((name) => encodeURIComponent(name))
    .slice(0, 30);
  const queryShape = parameterNames.length > 0 ? `?${parameterNames.join('&')}` : '';
  return `${window.location.pathname}${queryShape}`.slice(0, 1_000);
}

function send(payload: ClientErrorPayload) {
  const endpoint = import.meta.env.VITE_ERROR_REPORTING_ENDPOINT?.trim();
  if (!endpoint || !/^https:\/\//i.test(endpoint)) return;

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      if (accepted) return;
    }
  } catch {
    // O fallback abaixo cobre navegadores sem suporte ou bloqueios do sendBeacon.
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => undefined);
}

export function reportClientError(error: Error, context: ClientErrorContext = {}) {
  const id = createReferenceId();
  const payload: ClientErrorPayload = {
    id,
    name: sanitize(error.name, 120) || 'Error',
    message: sanitize(error.message, 1_000) || 'Erro não identificado',
    source: sanitize(context.source, 120) || 'frontend',
    route: safeRoute(),
    occurredAt: new Date().toISOString(),
    userAgent: navigator.userAgent.slice(0, 500),
    componentStack: sanitize(context.componentStack, 4_000),
    stack: import.meta.env.DEV ? sanitize(error.stack, 8_000) : undefined,
  };

  if (import.meta.env.DEV) {
    console.error('[ClientError]', payload, error);
  } else {
    console.error(`[ClientError:${id}]`, payload.name, payload.message);
  }

  window.dispatchEvent(new CustomEvent('gsa-client-error', { detail: payload }));
  send(payload);
  return id;
}

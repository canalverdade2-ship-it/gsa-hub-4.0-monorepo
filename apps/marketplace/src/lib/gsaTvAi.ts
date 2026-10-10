import { sessionService } from "./sessionService";
const API = String(
  import.meta.env.VITE_GSA_TV_API_URL ||
    "https://api.147-15-43-141.nip.io/gsa-tv",
).replace(/\/$/, "");
function auth() {
  const s = sessionService.getCurrentSession();
  if (!s?.sessaoId || !s?.sessionToken)
    throw new Error("Sua sessão administrativa expirou. Entre novamente.");
  return {
    "x-gsa-session-id": s.sessaoId,
    "x-gsa-session-token": s.sessionToken,
  };
}
async function request(path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...auth(),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(b?.error || `Operação de IA recusada (${r.status}).`);
  return b;
}
export const getGsaTvAiProviderStatus = () => request("/ai/provider");
export const configureGsaTvAiProvider = (
  apiKey: string,
  defaultModel: string,
  options: Record<string, unknown> = {},
) =>
  request("/ai/provider", {
    method: "PUT",
    body: JSON.stringify({
      api_key: apiKey,
      default_model: defaultModel,
      ...options,
    }),
  });
export const runGsaTvAiProject = (projectId: string) =>
  request(`/ai/projects/${encodeURIComponent(projectId)}/run`, {
    method: "POST",
  });
export const reviewGsaTvAiProject = (
  projectId: string,
  decision: "approved" | "rejected",
  notes: string,
) =>
  request(`/ai/projects/${encodeURIComponent(projectId)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision, notes }),
  });

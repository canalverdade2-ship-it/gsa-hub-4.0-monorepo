import { sessionService } from './sessionService';

const API_BASE = String(import.meta.env.VITE_GSA_TV_API_URL || 'https://api.147-15-43-141.nip.io/gsa-tv').replace(/\/$/, '');

export async function getGsaTvPreviewUrl(): Promise<{ url: string; expires: number }> {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  const response = await fetch(`${API_BASE}/preview/token`, {
    method: 'PUT',
    headers: {
      'x-gsa-session-id': session.sessaoId,
      'x-gsa-session-token': session.sessionToken,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Não foi possível autorizar o preview (${response.status}).`);
  const query = new URLSearchParams({ exp: String(body.expires), token: String(body.token) });
  return { url: `${API_BASE}/preview/${body.playlist || 'stream.m3u8'}?${query}`, expires: Number(body.expires) };
}

function sessionHeaders() {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  return { 'x-gsa-session-id': session.sessaoId, 'x-gsa-session-token': session.sessionToken };
}

export async function getGsaTvMediaPreviewUrl(mediaId: string): Promise<{ url: string; expires: number; duration_s: number; media_kind: string }> {
  const response = await fetch(`${API_BASE}/media/${encodeURIComponent(mediaId)}/preview/token`, { method: 'PUT', headers: sessionHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Não foi possível autorizar a mídia (${response.status}).`);
  const query = new URLSearchParams({ exp: String(body.expires), token: String(body.token) });
  return { url: `${API_BASE}/media-preview/${encodeURIComponent(mediaId)}?${query}`, expires: Number(body.expires), duration_s: Number(body.duration_s || 0), media_kind: String(body.media_kind || '') };
}

export type GsaTvLiveConsoleSnapshot = {
  server_time: string;
  channel: any;
  stream: any;
  playout: any;
  queue: any[];
  history: any[];
  youtube: { state: string; confirmed: boolean; video_id?: string; error?: string };
};

export async function getGsaTvLiveConsoleSnapshot(): Promise<GsaTvLiveConsoleSnapshot> {
  const response = await fetch(`${API_BASE}/live-console/snapshot`, { headers: sessionHeaders(), cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Não foi possível atualizar a mesa (${response.status}).`);
  return body as GsaTvLiveConsoleSnapshot;
}

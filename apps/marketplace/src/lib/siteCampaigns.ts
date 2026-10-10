import { supabase } from './supabase';
import type {
  SiteCampaign,
  SiteCampaignDevice,
  SiteCampaignViewerAudience,
} from '../types/siteCampaigns';

const VIEWER_KEY = 'gsa_site_campaign_viewer_id';
const SESSION_KEY = 'gsa_site_campaign_session_id';

function fallbackIdentifier() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function randomIdentifier() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : fallbackIdentifier();
}

function readOrCreate(storage: Storage, key: string) {
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const created = randomIdentifier();
    storage.setItem(key, created);
    return created;
  } catch {
    return randomIdentifier();
  }
}

export function getSiteCampaignIdentity() {
  return {
    viewerId: readOrCreate(window.localStorage, VIEWER_KEY),
    sessionId: readOrCreate(window.sessionStorage, SESSION_KEY),
  };
}

export function detectSiteCampaignDevice(): SiteCampaignDevice {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

export async function fetchSiteCampaigns(input: {
  page: string;
  device: SiteCampaignDevice;
  audience: SiteCampaignViewerAudience;
  actorId?: string | null;
}): Promise<SiteCampaign[]> {
  try {
    const identity = getSiteCampaignIdentity();
    const { data, error } = await supabase.rpc('gsa_public_site_campaigns', {
      p_page: input.page || '/',
      p_device: input.device,
      p_audience: input.audience,
      p_viewer_hash: identity.viewerId,
      p_session_hash: identity.sessionId,
      p_actor_id: input.actorId || null,
    });

    if (error) return [];
    if (Array.isArray(data)) return data as SiteCampaign[];
    if (data && typeof data === 'object' && Array.isArray((data as { campaigns?: unknown[] }).campaigns)) {
      return (data as { campaigns: SiteCampaign[] }).campaigns;
    }
    return [];
  } catch {
    return [];
  }
}

export async function trackSiteCampaignEvent(input: {
  campaignId: string;
  eventType: 'click' | 'close';
  page: string;
  device: SiteCampaignDevice;
  audience: SiteCampaignViewerAudience;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const identity = getSiteCampaignIdentity();
    await supabase.rpc('gsa_public_site_campaign_event', {
      p_campaign_id: input.campaignId,
      p_event_type: input.eventType,
      p_page: input.page || '/',
      p_device: input.device,
      p_audience: input.audience,
      p_viewer_hash: identity.viewerId,
      p_session_hash: identity.sessionId,
      p_actor_id: input.actorId || null,
      p_metadata: input.metadata || {},
    });
  } catch {
    // Falha silenciosa de telemetria
  }
}

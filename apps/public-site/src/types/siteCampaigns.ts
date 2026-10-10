export type SiteCampaignCategory =
  | 'announcement'
  | 'promotion'
  | 'news'
  | 'alert'
  | 'maintenance'
  | 'event'
  | 'system_update'
  | 'institutional';

export type SiteCampaignFormat =
  | 'popup'
  | 'top_bar'
  | 'inline_banner'
  | 'floating_card'
  | 'fullscreen';

export type SiteCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'ended'
  | 'archived';

export type SiteCampaignTemplate =
  | 'institutional_light'
  | 'institutional_dark'
  | 'promotion'
  | 'alert'
  | 'maintenance'
  | 'launch';

export type SiteCampaignAudience = 'all' | 'guests' | 'authenticated' | 'clients';
export type SiteCampaignViewerAudience = Exclude<SiteCampaignAudience, 'all'>;
export type SiteCampaignDevice = 'desktop' | 'tablet' | 'mobile';
export type SiteCampaignAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'duplicate'
  | 'publish'
  | 'pause'
  | 'resume'
  | 'end'
  | 'archive'
  | 'delete'
  | 'metrics';

export type SiteCampaignFrequency =
  | 'every_visit'
  | 'once_per_session'
  | 'once_per_visitor'
  | 'once_per_day'
  | 'interval_days'
  | 'until_click'
  | 'until_close';

export interface SiteCampaign {
  id: string;
  internal_name: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  category: SiteCampaignCategory;
  format: SiteCampaignFormat;
  template: SiteCampaignTemplate;
  status: SiteCampaignStatus;
  priority: number;
  cta_label?: string | null;
  cta_url?: string | null;
  cta_target: '_self' | '_blank';
  secondary_cta_label?: string | null;
  secondary_cta_url?: string | null;
  image_desktop_url?: string | null;
  image_mobile_url?: string | null;
  image_alt?: string | null;
  target_pages: string[];
  audience: SiteCampaignAudience;
  devices: SiteCampaignDevice[];
  starts_at?: string | null;
  ends_at?: string | null;
  frequency_model: SiteCampaignFrequency;
  frequency_value?: number | null;
  dismissible: boolean;
  dismiss_on_backdrop: boolean;
  dismiss_on_escape: boolean;
  auto_close_seconds?: number | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  published_at?: string | null;
  published_by_name?: string | null;
  metrics?: SiteCampaignMetrics;
}

export interface SiteCampaignMetrics {
  impressions: number;
  clicks: number;
  closes: number;
  unique_viewers: number;
  click_through_rate: number;
}

export interface SiteCampaignHistoryEntry {
  id: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  action: string;
  actor_type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface SiteCampaignAnalyticsRow {
  key: string;
  impressions: number;
  clicks: number;
  closes: number;
  unique_viewers: number;
  click_through_rate: number;
}

export interface SiteCampaignAdminOverview {
  campaigns: SiteCampaign[];
  history: SiteCampaignHistoryEntry[];
  current_permissions?: SiteCampaignAction[];
  analytics: {
    by_device: SiteCampaignAnalyticsRow[];
    by_page: SiteCampaignAnalyticsRow[];
    by_day: SiteCampaignAnalyticsRow[];
  };
  totals: {
    all: number;
    draft: number;
    scheduled: number;
    active: number;
    paused: number;
    ended: number;
    archived: number;
    impressions: number;
    clicks: number;
    click_through_rate: number;
  };
}

export interface SiteCampaignPayload {
  internal_name: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  category: SiteCampaignCategory;
  format: SiteCampaignFormat;
  template: SiteCampaignTemplate;
  priority: number;
  cta_label?: string | null;
  cta_url?: string | null;
  cta_target: '_self' | '_blank';
  secondary_cta_label?: string | null;
  secondary_cta_url?: string | null;
  image_desktop_url?: string | null;
  image_mobile_url?: string | null;
  image_alt?: string | null;
  target_pages: string[];
  audience: SiteCampaignAudience;
  devices: SiteCampaignDevice[];
  starts_at?: string | null;
  ends_at?: string | null;
  frequency_model: SiteCampaignFrequency;
  frequency_value?: number | null;
  dismissible: boolean;
  dismiss_on_backdrop: boolean;
  dismiss_on_escape: boolean;
  auto_close_seconds?: number | null;
}

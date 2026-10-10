export type AdvertisingFormat =
  | 'responsive_banner'
  | 'sponsored_card'
  | 'rectangle'
  | 'sticky_banner'
  | 'hero'
  | 'inline_video'
  | 'floating_video'
  | 'lightbox'
  | 'section_sponsorship'
  | 'sponsored_content'
  | 'takeover';

export type AdvertisingRequestStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'awaiting_information'
  | 'proposal_sent'
  | 'negotiation_requested'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

export type AdvertisingProposalStatus =
  | 'draft'
  | 'sent'
  | 'negotiating'
  | 'final_offer'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type AdvertisingCampaignStatus =
  | 'draft'
  | 'payment_pending'
  | 'payment_overdue'
  | 'creative_review'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type AdvertisingCreativeStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
export type AdvertisingPaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'overdue' | 'refunded' | 'cancelled';

export interface PublicAdvertisement {
  campaign_id: string;
  slug: string;
  name: string;
  advertiser_name: string;
  creative_id: string;
  kind: 'image' | 'video' | 'text';
  storage_path?: string | null;
  asset_url?: string | null;
  target_url?: string | null;
  headline?: string | null;
  body?: string | null;
  alt_text?: string | null;
  placement_code: string;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
}

export interface ServedAdvertisement extends PublicAdvertisement {
  event_token: string;
}

export interface AdvertisingRequest {
  id: string;
  advertiser_id?: string | null;
  protocol: string;
  company_name: string;
  document?: string;
  company_size: string;
  segment: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  website?: string | null;
  objective: string;
  desired_formats: AdvertisingFormat[];
  desired_pages: string[];
  devices: string[];
  desired_start_date?: string | null;
  desired_end_date?: string | null;
  intended_budget: number;
  needs_creative_service: boolean;
  notes?: string | null;
  creative_files?: string[];
  status: AdvertisingRequestStatus;
  created_at: string;
  updated_at?: string;
}

export interface AdvertisingProposalVersion {
  id: string;
  proposal_id: string;
  version: number;
  amount: number;
  duration_days: number;
  starts_on?: string | null;
  ends_on?: string | null;
  formats: AdvertisingFormat[];
  placement_codes: string[];
  placement_shares?: Record<string, number>;
  frequency_model: 'once_per_session' | 'once_per_day' | 'interval_hours' | 'daily_limit' | 'unlimited';
  frequency_value?: number | null;
  impression_limit?: number | null;
  terms?: string | null;
  payment_condition?: string | null;
  created_by_type: 'admin' | 'advertiser';
  created_at: string;
}

export interface AdvertisingNegotiation {
  id: string;
  proposal_id: string;
  actor_type: 'admin' | 'advertiser';
  actor_id?: string | null;
  proposed_amount?: number | null;
  message: string;
  created_at: string;
}

export interface AdvertisingProposal {
  id: string;
  request_id: string;
  company_name?: string;
  advertiser_id?: string | null;
  advertiser_status?: string | null;
  auth_user_id?: string | null;
  status: AdvertisingProposalStatus;
  current_version: number;
  total_amount: number;
  valid_until?: string | null;
  accepted_at?: string | null;
  accepted_version?: number | null;
  accepted_amount?: number | null;
  version?: AdvertisingProposalVersion | null;
  negotiations?: AdvertisingNegotiation[];
  created_at?: string;
}

export interface AdvertisingCreative {
  id: string;
  campaign_id: string;
  kind: 'image' | 'video' | 'text';
  status: AdvertisingCreativeStatus;
  storage_path?: string | null;
  /** Short-lived signed URL returned by trusted overview RPCs. Never persist it. */
  asset_url?: string | null;
  target_url?: string | null;
  headline?: string | null;
  body?: string | null;
  alt_text?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
  rejection_reason?: string | null;
  approved_at?: string | null;
  created_at: string;
}

export interface AdvertisingPayment {
  id: string;
  campaign_id: string;
  proposal_id?: string | null;
  provider: string;
  provider_reference?: string | null;
  amount: number;
  currency: 'BRL';
  status: AdvertisingPaymentStatus;
  payment_method?: string | null;
  checkout_url?: string | null;
  pix_code?: string | null;
  due_at?: string | null;
  paid_at?: string | null;
  overdue_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AdvertisingMetric {
  campaign_id: string;
  placement_id: string;
  metric_date: string;
  requests: number;
  served: number;
  viewable_impressions: number;
  clicks: number;
  video_starts: number;
  video_completions: number;
}

export interface AdvertisingCampaign {
  id: string;
  advertiser_id?: string;
  advertiser_name?: string;
  proposal_id?: string | null;
  name: string;
  slug?: string;
  status: AdvertisingCampaignStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  devices?: string[];
  frequency_model?: string;
  frequency_value?: number | null;
  impression_limit?: number | null;
  served_count?: number;
  paid_at?: string | null;
  activated_at?: string | null;
  paused_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  creatives: AdvertisingCreative[];
  payment?: AdvertisingPayment | null;
  metrics: AdvertisingMetric[];
  created_at?: string;
  updated_at?: string;
}

export interface AdvertisingPlacement {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  route_pattern: string;
  module: string;
  format: AdvertisingFormat;
  position: string;
  devices: string[];
  capacity: number;
  exclusive: boolean;
  base_daily_price: number;
  active: boolean;
}

export interface AdvertiserProfile {
  id: string;
  legal_name: string;
  trade_name?: string | null;
  segment: string;
  website?: string | null;
  responsible_name: string;
  responsible_email: string;
  responsible_phone: string;
  status: string;
  company_name?: string;
  document?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface AdvertiserPortalSnapshot {
  advertiser: AdvertiserProfile;
  requests: AdvertisingRequest[];
  proposals: AdvertisingProposal[];
  campaigns: AdvertisingCampaign[];
}

export interface AdvertisingAdminOverview {
  requests: AdvertisingRequest[];
  proposals: AdvertisingProposal[];
  campaigns: AdvertisingCampaign[];
  placements: AdvertisingPlacement[];
}

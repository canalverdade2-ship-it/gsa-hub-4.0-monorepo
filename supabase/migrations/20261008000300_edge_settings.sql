-- Private settings used only by trusted Supabase Edge Functions.
create table if not exists public.gsa_private_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gsa_private_settings enable row level security;
revoke all on public.gsa_private_settings from anon, authenticated;

create table if not exists public.gsa_govbr_signature_states (
  state text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);
alter table public.gsa_govbr_signature_states enable row level security;
revoke all on public.gsa_govbr_signature_states from anon, authenticated;

create index if not exists gsa_govbr_signature_states_expiry_idx
  on public.gsa_govbr_signature_states(expires_at);

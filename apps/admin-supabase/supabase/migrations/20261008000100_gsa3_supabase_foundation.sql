-- Foundation for the isolated GSA HUB Services panel.
-- Do not apply to the existing GSA 3.0 / production Supabase project.

create table public.gsa_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'client')),
  admin_role text,
  permissions jsonb not null default '[]'::jsonb,
  customer_id uuid,
  full_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gsa_profiles_role_customer_check check (
    (role = 'client' and customer_id is not null) or
    (role = 'admin' and customer_id is null)
  )
);

create table public.gsa_clients (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  person_type text not null check (person_type in ('PF', 'PJ')),
  tax_document text not null unique,
  name text not null,
  email text,
  phone text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gsa_profiles
  add constraint gsa_profiles_customer_fk
  foreign key (customer_id) references public.gsa_clients(id) on delete restrict;

create table public.gsa_services (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  description text not null default '',
  price_cents bigint not null default 0 check (price_cents >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_proposals (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  code text not null unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  service_id uuid references public.gsa_services(id) on delete set null,
  status text not null default 'draft',
  currency char(3) not null default 'BRL',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.gsa_profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_contracts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  code text not null unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  proposal_id uuid references public.gsa_proposals(id) on delete set null,
  status text not null default 'draft',
  start_date date,
  end_date date,
  total_cents bigint not null default 0 check (total_cents >= 0),
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_service_orders (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  code text not null unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  contract_id uuid references public.gsa_contracts(id) on delete set null,
  proposal_id uuid references public.gsa_proposals(id) on delete set null,
  status text not null default 'open',
  stages jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_document_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  order_id uuid references public.gsa_service_orders(id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'pending',
  requested_by uuid references public.gsa_profiles(id),
  reviewed_by uuid references public.gsa_profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_documents (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  request_id uuid references public.gsa_document_requests(id) on delete set null,
  order_id uuid references public.gsa_service_orders(id) on delete set null,
  bucket_id text not null default 'gsa3-private',
  object_path text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  status text not null default 'under_review',
  uploaded_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now()
);

create table public.gsa_invoices (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  contract_id uuid references public.gsa_contracts(id) on delete set null,
  status text not null default 'pending',
  total_cents bigint not null check (total_cents >= 0),
  due_date date,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_support_tickets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  order_id uuid references public.gsa_service_orders(id) on delete set null,
  title text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.gsa_support_tickets(id) on delete cascade,
  author_id uuid not null references public.gsa_profiles(id),
  body text not null,
  attachment_document_id uuid references public.gsa_documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.gsa_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gsa_clients(id) on delete cascade,
  title text not null,
  body text not null default '',
  kind text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.gsa_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gsa_clients(id) on delete cascade,
  title text not null,
  status text not null default 'pending',
  due_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  assigned_to uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_rps_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_client_internal_folders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.gsa_clients(id) on delete cascade,
  name text not null,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  unique (customer_id, name)
);

create table public.gsa_client_internal_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.gsa_clients(id) on delete cascade,
  folder_id uuid references public.gsa_client_internal_folders(id) on delete set null,
  body text not null,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  entry_type text not null,
  amount_cents bigint not null,
  description text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.gsa_profiles(id),
  created_at timestamptz not null default now()
);

create table public.gsa_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.gsa_clients(id) on delete restrict,
  status text not null default 'pending',
  reason text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.gsa_profiles(id),
  reviewed_at timestamptz,
  review_note text
);

create table public.gsa_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.gsa_clients(id) on delete set null,
  invoice_id uuid references public.gsa_invoices(id) on delete set null,
  provider text not null default 'infinitepay',
  provider_reference text unique,
  status text not null default 'pending',
  amount_cents bigint not null check (amount_cents >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_payment_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  active boolean not null default true,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gsa_company_settings (
  id boolean primary key default true check (id),
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.gsa_profiles(id),
  updated_at timestamptz not null default now()
);

create table public.gsa_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.gsa_profiles(id),
  customer_id uuid references public.gsa_clients(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- Transitional import ledger: preserves legacy entities that do not yet have
-- a dedicated table while feature-by-feature conversion is in progress.
create table public.gsa_legacy_records (
  id text not null,
  kind text not null,
  customer_id uuid references public.gsa_clients(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create index gsa_profiles_customer_idx on public.gsa_profiles(customer_id);
create index gsa_proposals_customer_created_idx on public.gsa_proposals(customer_id, created_at desc);
create index gsa_contracts_customer_idx on public.gsa_contracts(customer_id);
create index gsa_orders_customer_idx on public.gsa_service_orders(customer_id);
create index gsa_document_requests_customer_status_idx on public.gsa_document_requests(customer_id, status);
create index gsa_documents_customer_created_idx on public.gsa_documents(customer_id, created_at desc);
create index gsa_invoices_customer_status_idx on public.gsa_invoices(customer_id, status);
create index gsa_tickets_customer_status_idx on public.gsa_support_tickets(customer_id, status);
create index gsa_notifications_customer_created_idx on public.gsa_notifications(customer_id, created_at desc);
create index gsa_tasks_status_due_idx on public.gsa_tasks(status, due_at);
create index gsa_legacy_records_customer_kind_idx on public.gsa_legacy_records(customer_id, kind);
create index gsa_wallet_customer_created_idx on public.gsa_wallet_entries(customer_id, created_at desc);
create index gsa_account_deletion_customer_status_idx on public.gsa_account_deletion_requests(customer_id, status);
create index gsa_payment_customer_created_idx on public.gsa_payment_transactions(customer_id, created_at desc);

create or replace function public.gsa_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gsa_profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.active
  );
$$;

create or replace function public.gsa_current_customer_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.customer_id from public.gsa_profiles p
  where p.id = (select auth.uid()) and p.role = 'client' and p.active
  limit 1;
$$;

revoke all on function public.gsa_is_admin() from public;
revoke all on function public.gsa_current_customer_id() from public;
grant execute on function public.gsa_is_admin() to authenticated;
grant execute on function public.gsa_current_customer_id() to authenticated;

alter table public.gsa_profiles enable row level security;
alter table public.gsa_clients enable row level security;
alter table public.gsa_services enable row level security;
alter table public.gsa_proposals enable row level security;
alter table public.gsa_contracts enable row level security;
alter table public.gsa_service_orders enable row level security;
alter table public.gsa_document_requests enable row level security;
alter table public.gsa_documents enable row level security;
alter table public.gsa_invoices enable row level security;
alter table public.gsa_support_tickets enable row level security;
alter table public.gsa_support_messages enable row level security;
alter table public.gsa_notifications enable row level security;
alter table public.gsa_tasks enable row level security;
alter table public.gsa_calendar_events enable row level security;
alter table public.gsa_audit_log enable row level security;
alter table public.gsa_rps_users enable row level security;
alter table public.gsa_client_internal_folders enable row level security;
alter table public.gsa_client_internal_notes enable row level security;
alter table public.gsa_wallet_entries enable row level security;
alter table public.gsa_account_deletion_requests enable row level security;
alter table public.gsa_payment_transactions enable row level security;
alter table public.gsa_payment_coupons enable row level security;
alter table public.gsa_company_settings enable row level security;

create policy gsa_profiles_read_self_or_admin on public.gsa_profiles
for select to authenticated using (id = (select auth.uid()) or (select public.gsa_is_admin()));
create policy gsa_profiles_admin_manage on public.gsa_profiles
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));

create policy gsa_clients_admin_manage on public.gsa_clients
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_clients_client_read_self on public.gsa_clients
for select to authenticated using (id = (select public.gsa_current_customer_id()));
create policy gsa_services_admin_manage on public.gsa_services
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_services_active_read on public.gsa_services
for select to authenticated using (active);

create policy gsa_proposals_admin_manage on public.gsa_proposals
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_proposals_client_read on public.gsa_proposals
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_contracts_admin_manage on public.gsa_contracts
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_contracts_client_read on public.gsa_contracts
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_orders_admin_manage on public.gsa_service_orders
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_orders_client_read on public.gsa_service_orders
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));

create policy gsa_document_requests_admin_manage on public.gsa_document_requests
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_document_requests_client_read on public.gsa_document_requests
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_documents_admin_manage on public.gsa_documents
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_documents_client_read on public.gsa_documents
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_documents_client_upload_metadata on public.gsa_documents
for insert to authenticated with check (
  customer_id = (select public.gsa_current_customer_id())
  and uploaded_by = (select auth.uid())
  and status = 'under_review'
  and split_part(object_path, '/', 1) = (select public.gsa_current_customer_id())::text
  and (request_id is null or exists (
    select 1 from public.gsa_document_requests r
    where r.id = request_id and r.customer_id = (select public.gsa_current_customer_id())
  ))
  and (order_id is null or exists (
    select 1 from public.gsa_service_orders o
    where o.id = order_id and o.customer_id = (select public.gsa_current_customer_id())
  ))
);
create policy gsa_invoices_admin_manage on public.gsa_invoices
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_invoices_client_read on public.gsa_invoices
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));

create policy gsa_tickets_admin_manage on public.gsa_support_tickets
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_tickets_client_read on public.gsa_support_tickets
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_tickets_client_create on public.gsa_support_tickets
for insert to authenticated with check (
  customer_id = (select public.gsa_current_customer_id()) and status = 'open'
);
create policy gsa_messages_admin_manage on public.gsa_support_messages
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_messages_client_read on public.gsa_support_messages
for select to authenticated using (
  exists (
    select 1 from public.gsa_support_tickets t
    where t.id = ticket_id and t.customer_id = (select public.gsa_current_customer_id())
  )
);
create policy gsa_messages_client_create on public.gsa_support_messages
for insert to authenticated with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.gsa_support_tickets t
    where t.id = ticket_id and t.customer_id = (select public.gsa_current_customer_id())
  )
);

create policy gsa_notifications_admin_manage on public.gsa_notifications
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_notifications_client_read on public.gsa_notifications
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create or replace function public.gsa_client_mark_notification_read(p_notification_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.gsa_notifications n
  set read_at = now()
  where n.id = p_notification_id
    and n.customer_id = (select public.gsa_current_customer_id());
end;
$$;
revoke all on function public.gsa_client_mark_notification_read(uuid) from public;
grant execute on function public.gsa_client_mark_notification_read(uuid) to authenticated;
create policy gsa_tasks_admin_manage on public.gsa_tasks
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_calendar_admin_manage on public.gsa_calendar_events
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_audit_admin_read on public.gsa_audit_log
for select to authenticated using ((select public.gsa_is_admin()));
create policy gsa_rps_admin_manage on public.gsa_rps_users
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_internal_folders_admin_manage on public.gsa_client_internal_folders
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_internal_notes_admin_manage on public.gsa_client_internal_notes
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_wallet_admin_manage on public.gsa_wallet_entries
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_wallet_client_read on public.gsa_wallet_entries
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_deletion_admin_manage on public.gsa_account_deletion_requests
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_deletion_client_read on public.gsa_account_deletion_requests
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_deletion_client_create on public.gsa_account_deletion_requests
for insert to authenticated with check (
  customer_id = (select public.gsa_current_customer_id()) and status = 'pending'
);
create policy gsa_payment_admin_manage on public.gsa_payment_transactions
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_payment_client_read on public.gsa_payment_transactions
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));
create policy gsa_coupon_admin_manage on public.gsa_payment_coupons
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_company_admin_manage on public.gsa_company_settings
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_legacy_records_admin_manage on public.gsa_legacy_records
for all to authenticated using ((select public.gsa_is_admin())) with check ((select public.gsa_is_admin()));
create policy gsa_legacy_records_client_read on public.gsa_legacy_records
for select to authenticated using (customer_id = (select public.gsa_current_customer_id()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gsa3-private', 'gsa3-private', false, 15728640, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy gsa3_storage_client_read on storage.objects
for select to authenticated using (
  bucket_id = 'gsa3-private' and (select public.gsa_is_admin())
  or bucket_id = 'gsa3-private' and (storage.foldername(name))[1] = (select public.gsa_current_customer_id())::text
);
create policy gsa3_storage_client_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'gsa3-private' and (select public.gsa_is_admin())
  or bucket_id = 'gsa3-private' and (storage.foldername(name))[1] = (select public.gsa_current_customer_id())::text
);
create policy gsa3_storage_admin_update on storage.objects
for update to authenticated using (bucket_id = 'gsa3-private' and (select public.gsa_is_admin()))
with check (bucket_id = 'gsa3-private' and (select public.gsa_is_admin()));
create policy gsa3_storage_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'gsa3-private' and (select public.gsa_is_admin()));

grant select on public.gsa_profiles, public.gsa_services, public.gsa_proposals,
  public.gsa_contracts, public.gsa_service_orders, public.gsa_document_requests,
  public.gsa_documents, public.gsa_invoices, public.gsa_support_tickets,
  public.gsa_support_messages, public.gsa_notifications, public.gsa_legacy_records to authenticated;
grant insert, update, delete on public.gsa_profiles, public.gsa_clients, public.gsa_services,
  public.gsa_proposals, public.gsa_contracts, public.gsa_service_orders,
  public.gsa_document_requests, public.gsa_invoices,
  public.gsa_support_tickets, public.gsa_support_messages, public.gsa_notifications,
  public.gsa_tasks, public.gsa_calendar_events to authenticated;
grant select, insert, update, delete on public.gsa_rps_users,
  public.gsa_client_internal_folders, public.gsa_client_internal_notes,
  public.gsa_wallet_entries, public.gsa_account_deletion_requests,
  public.gsa_payment_transactions, public.gsa_payment_coupons,
  public.gsa_company_settings to authenticated;
grant insert on public.gsa_documents to authenticated;
grant update (read_at) on public.gsa_notifications to authenticated;
grant select on public.gsa_clients, public.gsa_tasks, public.gsa_calendar_events,
  public.gsa_audit_log, public.gsa_legacy_records to authenticated;
grant usage, select on sequence public.gsa_audit_log_id_seq to authenticated;

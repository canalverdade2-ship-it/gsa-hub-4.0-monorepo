-- Direct browser access foundation. This is isolated to the new Supabase project.
-- Legacy-shaped records preserve the current UI's domain payloads while features
-- are moved to the normalized tables in the foundation migration.

create or replace function public.gsa_admin_has_module(p_module text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gsa_profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.active
      and (
        coalesce(p.permissions, '[]'::jsonb) ? '*'
        or coalesce(p.permissions, '[]'::jsonb) ? p_module
        or (p_module = 'notices' and coalesce(p.permissions, '[]'::jsonb) ? 'notices')
      )
  );
$$;

alter table public.gsa_profiles add column if not exists email text;
create index if not exists gsa_profiles_role_email_idx on public.gsa_profiles(role,email);

create or replace function public.gsa_record_module(p_kind text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_kind
    when 'clients' then 'clients'
    when 'personal_documents' then 'clients'
    when 'account_deletion_requests' then 'clients'
    when 'internal_folders' then 'clients'
    when 'internal_folder_meta' then 'clients'
    when 'internal_notes' then 'clients'
    when 'services' then 'catalogs'
    when 'rps' then 'catalogs'
    when 'proposals' then 'proposals'
    when 'contracts' then 'contracts'
    when 'orders' then 'orders'
    when 'tasks' then 'tasks'
    when 'calendar_events' then 'calendar'
    when 'invoices' then 'finance'
    when 'wallet_entries' then 'finance'
    when 'payment_setup' then 'settings'
    when 'infinitepay_orders' then 'finance'
    when 'payment_coupons' then 'coupons'
    when 'infinitepay_coupons' then 'coupons'
    when 'documents' then 'documents'
    when 'folders' then 'documents'
    when 'files' then 'documents'
    when 'tickets' then 'support'
    when 'notifications' then 'notices'
    when 'history' then 'reports'
    when 'audit' then 'reports'
    when 'company' then 'settings'
    else 'settings'
  end;
$$;

revoke all on function public.gsa_admin_has_module(text) from public;
grant execute on function public.gsa_admin_has_module(text) to authenticated;

-- Apply module-level authorization to normalized tables as well as the
-- compatibility record store; hiding navigation in React is not security.
drop policy if exists gsa_profiles_admin_manage on public.gsa_profiles;
create policy gsa_profiles_admin_manage on public.gsa_profiles
for all to authenticated using ((select public.gsa_admin_has_module('settings')))
with check ((select public.gsa_admin_has_module('settings')));
drop policy if exists gsa_clients_admin_manage on public.gsa_clients;
create policy gsa_clients_admin_manage on public.gsa_clients
for all to authenticated using ((select public.gsa_admin_has_module('clients')))
with check ((select public.gsa_admin_has_module('clients')));
drop policy if exists gsa_services_admin_manage on public.gsa_services;
create policy gsa_services_admin_manage on public.gsa_services
for all to authenticated using ((select public.gsa_admin_has_module('catalogs')))
with check ((select public.gsa_admin_has_module('catalogs')));
drop policy if exists gsa_proposals_admin_manage on public.gsa_proposals;
create policy gsa_proposals_admin_manage on public.gsa_proposals
for all to authenticated using ((select public.gsa_admin_has_module('proposals')))
with check ((select public.gsa_admin_has_module('proposals')));
drop policy if exists gsa_contracts_admin_manage on public.gsa_contracts;
create policy gsa_contracts_admin_manage on public.gsa_contracts
for all to authenticated using ((select public.gsa_admin_has_module('contracts')))
with check ((select public.gsa_admin_has_module('contracts')));
drop policy if exists gsa_orders_admin_manage on public.gsa_service_orders;
create policy gsa_orders_admin_manage on public.gsa_service_orders
for all to authenticated using ((select public.gsa_admin_has_module('orders')))
with check ((select public.gsa_admin_has_module('orders')));
drop policy if exists gsa_document_requests_admin_manage on public.gsa_document_requests;
create policy gsa_document_requests_admin_manage on public.gsa_document_requests
for all to authenticated using ((select public.gsa_admin_has_module('documents')))
with check ((select public.gsa_admin_has_module('documents')));
drop policy if exists gsa_documents_admin_manage on public.gsa_documents;
create policy gsa_documents_admin_manage on public.gsa_documents
for all to authenticated using ((select public.gsa_admin_has_module('documents')))
with check ((select public.gsa_admin_has_module('documents')));
drop policy if exists gsa_invoices_admin_manage on public.gsa_invoices;
create policy gsa_invoices_admin_manage on public.gsa_invoices
for all to authenticated using ((select public.gsa_admin_has_module('finance')))
with check ((select public.gsa_admin_has_module('finance')));
drop policy if exists gsa_tickets_admin_manage on public.gsa_support_tickets;
create policy gsa_tickets_admin_manage on public.gsa_support_tickets
for all to authenticated using ((select public.gsa_admin_has_module('support')))
with check ((select public.gsa_admin_has_module('support')));
drop policy if exists gsa_messages_admin_manage on public.gsa_support_messages;
create policy gsa_messages_admin_manage on public.gsa_support_messages
for all to authenticated using ((select public.gsa_admin_has_module('support')))
with check ((select public.gsa_admin_has_module('support')));
drop policy if exists gsa_notifications_admin_manage on public.gsa_notifications;
create policy gsa_notifications_admin_manage on public.gsa_notifications
for all to authenticated using ((select public.gsa_admin_has_module('notices')))
with check ((select public.gsa_admin_has_module('notices')));
drop policy if exists gsa_tasks_admin_manage on public.gsa_tasks;
create policy gsa_tasks_admin_manage on public.gsa_tasks
for all to authenticated using ((select public.gsa_admin_has_module('tasks')))
with check ((select public.gsa_admin_has_module('tasks')));
drop policy if exists gsa_calendar_admin_manage on public.gsa_calendar_events;
create policy gsa_calendar_admin_manage on public.gsa_calendar_events
for all to authenticated using ((select public.gsa_admin_has_module('calendar')))
with check ((select public.gsa_admin_has_module('calendar')));
drop policy if exists gsa_audit_admin_read on public.gsa_audit_log;
create policy gsa_audit_admin_read on public.gsa_audit_log
for select to authenticated using ((select public.gsa_admin_has_module('reports')));
drop policy if exists gsa_rps_admin_manage on public.gsa_rps_users;
create policy gsa_rps_admin_manage on public.gsa_rps_users
for all to authenticated using ((select public.gsa_admin_has_module('catalogs')))
with check ((select public.gsa_admin_has_module('catalogs')));
drop policy if exists gsa_internal_folders_admin_manage on public.gsa_client_internal_folders;
create policy gsa_internal_folders_admin_manage on public.gsa_client_internal_folders
for all to authenticated using ((select public.gsa_admin_has_module('clients')))
with check ((select public.gsa_admin_has_module('clients')));
drop policy if exists gsa_internal_notes_admin_manage on public.gsa_client_internal_notes;
create policy gsa_internal_notes_admin_manage on public.gsa_client_internal_notes
for all to authenticated using ((select public.gsa_admin_has_module('clients')))
with check ((select public.gsa_admin_has_module('clients')));
drop policy if exists gsa_wallet_admin_manage on public.gsa_wallet_entries;
create policy gsa_wallet_admin_manage on public.gsa_wallet_entries
for all to authenticated using ((select public.gsa_admin_has_module('finance')))
with check ((select public.gsa_admin_has_module('finance')));
drop policy if exists gsa_deletion_admin_manage on public.gsa_account_deletion_requests;
create policy gsa_deletion_admin_manage on public.gsa_account_deletion_requests
for all to authenticated using ((select public.gsa_admin_has_module('clients')))
with check ((select public.gsa_admin_has_module('clients')));
drop policy if exists gsa_payment_admin_manage on public.gsa_payment_transactions;
create policy gsa_payment_admin_manage on public.gsa_payment_transactions
for all to authenticated using ((select public.gsa_admin_has_module('finance')))
with check ((select public.gsa_admin_has_module('finance')));
drop policy if exists gsa_coupon_admin_manage on public.gsa_payment_coupons;
create policy gsa_coupon_admin_manage on public.gsa_payment_coupons
for all to authenticated using ((select public.gsa_admin_has_module('coupons')))
with check ((select public.gsa_admin_has_module('coupons')));
drop policy if exists gsa_company_admin_manage on public.gsa_company_settings;
create policy gsa_company_admin_manage on public.gsa_company_settings
for all to authenticated using ((select public.gsa_admin_has_module('settings')))
with check ((select public.gsa_admin_has_module('settings')));
create or replace function public.gsa_storage_module(p_object_path text)
returns text
language sql immutable
set search_path = ''
as $$
  select case split_part(p_object_path, '/', 2)
    when 'proposals' then 'proposals'
    when 'contracts' then 'contracts'
    when 'orders' then 'orders'
    when 'documents' then 'documents'
    when 'personal_documents' then 'clients'
    when 'tickets' then 'support'
    when 'invoices' then 'finance'
    else 'documents'
  end;
$$;

drop policy if exists gsa3_storage_client_read on storage.objects;
create policy gsa3_storage_client_read on storage.objects
for select to authenticated using (
  bucket_id = 'gsa3-private' and (select public.gsa_admin_has_module(public.gsa_storage_module(name)))
  or bucket_id = 'gsa3-private' and (storage.foldername(name))[1] = (select public.gsa_current_customer_id())::text
);
drop policy if exists gsa3_storage_client_upload on storage.objects;
create policy gsa3_storage_client_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'gsa3-private' and (select public.gsa_admin_has_module(public.gsa_storage_module(name)))
  or bucket_id = 'gsa3-private' and (storage.foldername(name))[1] = (select public.gsa_current_customer_id())::text
);
drop policy if exists gsa3_storage_admin_update on storage.objects;
create policy gsa3_storage_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'gsa3-private' and (select public.gsa_admin_has_module(public.gsa_storage_module(name))))
with check (bucket_id = 'gsa3-private' and (select public.gsa_admin_has_module(public.gsa_storage_module(name))));
drop policy if exists gsa3_storage_admin_delete on storage.objects;
create policy gsa3_storage_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'gsa3-private' and (select public.gsa_admin_has_module(public.gsa_storage_module(name))));

drop policy if exists gsa_legacy_records_admin_manage on public.gsa_legacy_records;
drop policy if exists gsa_legacy_records_client_read on public.gsa_legacy_records;
alter table public.gsa_legacy_records enable row level security;

create policy gsa_legacy_records_admin_read on public.gsa_legacy_records
for select to authenticated
using ((select public.gsa_admin_has_module(public.gsa_record_module(kind))));
create policy gsa_legacy_records_admin_insert on public.gsa_legacy_records
for insert to authenticated
with check ((select public.gsa_admin_has_module(public.gsa_record_module(kind))));
create policy gsa_legacy_records_admin_update on public.gsa_legacy_records
for update to authenticated
using ((select public.gsa_admin_has_module(public.gsa_record_module(kind))))
with check ((select public.gsa_admin_has_module(public.gsa_record_module(kind))));
create policy gsa_legacy_records_admin_delete on public.gsa_legacy_records
for delete to authenticated
using ((select public.gsa_admin_has_module(public.gsa_record_module(kind))));

-- Client snapshots are assembled in SQL so internal notes, hidden files,
-- internal ticket messages, and operational/audit records never reach the browser.
create or replace function public.gsa_client_portal_state()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_profile public.gsa_profiles%rowtype;
  v_company jsonb := '{}'::jsonb;
  v_state jsonb := '{}'::jsonb;
  v_legacy_customer_id text;
begin
  if v_customer is null then
    raise exception 'Sessão de cliente inválida.' using errcode = '42501';
  end if;

  select * into v_profile from public.gsa_profiles where id = (select auth.uid());
  select legacy_id into v_legacy_customer_id from public.gsa_clients where id = v_customer;
  select settings into v_company from public.gsa_company_settings where id = true;

  select coalesce(jsonb_object_agg(kind, records), '{}'::jsonb) into v_state
  from (
    select r.kind,
      jsonb_agg(
        case r.kind
          when 'orders' then jsonb_set(
            r.payload,
            '{stages}',
            coalesce((select jsonb_agg(stage.value - 'internalNote')
              from jsonb_array_elements(coalesce(r.payload->'stages', '[]'::jsonb)) as stage(value)), '[]'::jsonb),
            true
          )
          when 'tickets' then jsonb_set(
            r.payload,
            '{messages}',
            coalesce((select jsonb_agg(message.value - 'internal')
              from jsonb_array_elements(coalesce(r.payload->'messages', '[]'::jsonb)) as message(value)
              where coalesce((message.value->>'internal')::boolean, false) = false), '[]'::jsonb),
            true
          )
          else r.payload
        end order by r.imported_at desc
      ) as records
    from public.gsa_legacy_records r
    where r.customer_id = v_customer
      and r.kind in ('clients','proposals','contracts','orders','invoices','documents',
                     'personal_documents','folders','files','tickets','notifications',
                     'account_deletion_requests')
      and (r.kind <> 'notifications' or coalesce(r.payload->>'audience', 'client') = 'client')
      and (r.kind not in ('documents','personal_documents','files')
           or coalesce((r.payload->>'visible')::boolean, true))
    group by r.kind
  ) grouped;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_profile.id,
      'name', v_profile.full_name,
      'role', v_profile.role,
      'clientId', v_legacy_customer_id,
      'customerUuid', v_profile.customer_id
    ),
    'company', coalesce(v_company, '{}'::jsonb),
    'clients', coalesce(v_state->'clients', '[]'::jsonb),
    'proposals', coalesce(v_state->'proposals', '[]'::jsonb),
    'contracts', coalesce(v_state->'contracts', '[]'::jsonb),
    'orders', coalesce(v_state->'orders', '[]'::jsonb),
    'invoices', coalesce(v_state->'invoices', '[]'::jsonb),
    'documents', coalesce(v_state->'documents', '[]'::jsonb),
    'personalDocuments', coalesce(v_state->'personal_documents', '[]'::jsonb),
    'folders', coalesce(v_state->'folders', '[]'::jsonb),
    'files', coalesce(v_state->'files', '[]'::jsonb),
    'tickets', coalesce(v_state->'tickets', '[]'::jsonb),
    'accountDeletionRequests', coalesce(v_state->'account_deletion_requests', '[]'::jsonb),
    'notifications', coalesce(v_state->'notifications', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.gsa_client_portal_state() from public;
grant execute on function public.gsa_client_portal_state() to authenticated;

create table if not exists public.gsa_id_counters (
  kind text primary key,
  value bigint not null check (value >= 0),
  updated_at timestamptz not null default now()
);
alter table public.gsa_id_counters enable row level security;
create policy gsa_id_counters_admin_manage on public.gsa_id_counters
for all to authenticated using ((select public.gsa_admin_has_module('settings')))
with check ((select public.gsa_admin_has_module('settings')));
grant select, insert, update on public.gsa_id_counters to authenticated;

create or replace function public.gsa_next_business_id(p_kind text, p_start bigint default 1)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_next bigint;
begin
  if not (select public.gsa_admin_has_module(public.gsa_record_module(p_kind))) then
    raise exception 'Acesso não permitido para gerar este código.' using errcode = '42501';
  end if;
  insert into public.gsa_id_counters(kind, value)
  values (p_kind, greatest(p_start, 1))
  on conflict (kind) do update
    set value = public.gsa_id_counters.value + 1,
        updated_at = now()
  returning value into v_next;
  return v_next;
end;
$$;
revoke all on function public.gsa_next_business_id(text, bigint) from public;
grant execute on function public.gsa_next_business_id(text, bigint) to authenticated;

create or replace function public.gsa_client_decide_proposal(
  p_proposal_id text, p_decision text, p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_record public.gsa_legacy_records%rowtype;
  v_next jsonb;
begin
  if v_customer is null or p_decision not in ('accept', 'reject') then
    raise exception 'Solicitação inválida.' using errcode = '22023';
  end if;
  select * into v_record from public.gsa_legacy_records
    where kind = 'proposals' and customer_id = v_customer
      and (id = p_proposal_id or payload->>'code' = p_proposal_id)
    for update;
  if not found then raise exception 'Proposta não encontrada.' using errcode = 'P0002'; end if;
  if lower(coalesce(v_record.payload->>'status','')) not in ('aguardando aceite','pendente','em análise','revisão solicitada') then
    raise exception 'Esta proposta não aceita mais respostas.' using errcode = '22023';
  end if;
  v_next := v_record.payload || jsonb_build_object(
    'status', case when p_decision = 'accept' then 'Aceita' else 'Recusada' end,
    'acceptedAt', case when p_decision = 'accept' then now() else null end,
    'rejectionReason', case when p_decision = 'reject' then left(trim(coalesce(p_reason,'')),1000) else null end,
    'updatedAt', now()
  );
  update public.gsa_legacy_records set payload = v_next, updated_at = now()
    where kind = 'proposals' and id = v_record.id;
  insert into public.gsa_legacy_records(id,kind,customer_id,payload)
  values ('client-proposal-' || gen_random_uuid()::text, 'notifications', v_customer,
    jsonb_build_object('id',gen_random_uuid()::text,'clientId',v_record.payload->>'clientId',
      'kind','proposals','recordId',v_record.id,'recordCode',v_record.payload->>'code',
      'audience','admin','read',false,
      'message',case when p_decision = 'accept' then 'O cliente aceitou a proposta ' else 'O cliente recusou a proposta ' end || coalesce(v_record.payload->>'code',''),
      'createdAt',now()));
  return v_next;
end;
$$;

create or replace function public.gsa_client_upload_document(
  p_kind text, p_request_id text, p_object_path text, p_file_name text,
  p_mime_type text, p_size bigint
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_record public.gsa_legacy_records%rowtype;
  v_version jsonb;
  v_payload jsonb;
begin
  if v_customer is null or p_kind not in ('documents','personal_documents')
    or split_part(p_object_path, '/', 1) <> v_customer::text
    or p_size <= 0 or p_size > 15728640
    or p_mime_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'Arquivo ou solicitação inválida.' using errcode = '22023';
  end if;
  select * into v_record from public.gsa_legacy_records
    where kind = p_kind and id = p_request_id and customer_id = v_customer
    for update;
  if not found then raise exception 'Solicitação não encontrada.' using errcode = 'P0002'; end if;
  if coalesce(v_record.payload->>'status','Aguardando envio') not in ('Aguardando envio','Rejeitado') then
    raise exception 'Esta solicitação não está aguardando um novo arquivo.' using errcode = '22023';
  end if;
  v_version := jsonb_build_object('fileId',p_object_path,'fileName',left(p_file_name,240),
    'mimeType',p_mime_type,'size',p_size,'uploadedAt',now(),'date',now());
  v_payload := v_record.payload || jsonb_build_object(
    'versions',coalesce(v_record.payload->'versions','[]'::jsonb) || jsonb_build_array(v_version),
    'status','Em análise','rejectionReason',null,'updatedAt',now());
  update public.gsa_legacy_records set payload = v_payload, updated_at = now()
    where kind = p_kind and id = p_request_id;
  insert into public.gsa_legacy_records(id,kind,customer_id,payload)
  values ('upload-' || gen_random_uuid()::text,'notifications',v_customer,
    jsonb_build_object('id',gen_random_uuid()::text,'clientId',v_record.payload->>'clientId',
      'kind','documents','recordId',p_request_id,'audience','admin','read',false,
      'message','Documento enviado para análise: ' || coalesce(v_record.payload->>'title','documento'),
      'createdAt',now()));
  return jsonb_build_object('ok',true,'fileId',p_object_path,'fileName',left(p_file_name,240),'status','Em análise');
end;
$$;

create or replace function public.gsa_client_upload_contract(
  p_contract_id text, p_object_path text, p_file_name text, p_mime_type text, p_size bigint
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_record public.gsa_legacy_records%rowtype;
  v_payload jsonb;
begin
  if v_customer is null or split_part(p_object_path, '/', 1) <> v_customer::text
    or p_mime_type <> 'application/pdf' or p_size <= 0 or p_size > 15728640 then
    raise exception 'Arquivo inválido.' using errcode = '22023';
  end if;
  select * into v_record from public.gsa_legacy_records
    where kind='contracts' and customer_id=v_customer
      and (id=p_contract_id or payload->>'id'=p_contract_id or payload->>'code'=p_contract_id)
    for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if v_record.payload->>'status' = 'Assinado' then raise exception 'Contrato já assinado não pode ser substituído.' using errcode = '22023'; end if;
  v_payload := v_record.payload || jsonb_build_object('fileId',p_object_path,'fileName',left(p_file_name,240),
    'mimeType',p_mime_type,'fileSize',p_size,'status','Em análise','updatedAt',now());
  update public.gsa_legacy_records set payload=v_payload,updated_at=now()
    where kind='contracts' and id=v_record.id;
  return v_payload;
end;
$$;

create or replace function public.gsa_client_create_ticket(p_title text, p_message text, p_order_id text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_legacy_id text;
  v_id text := gen_random_uuid()::text;
  v_code text := 'TCK-' || upper(substr(replace(v_id,'-',''),1,8));
  v_payload jsonb;
begin
  if v_customer is null or length(trim(coalesce(p_title,''))) not between 3 and 160
    or length(trim(coalesce(p_message,''))) not between 3 and 5000 then
    raise exception 'Informe o assunto e a mensagem do chamado.' using errcode = '22023';
  end if;
  select legacy_id into v_legacy_id from public.gsa_clients where id = v_customer;
  v_payload := jsonb_build_object('id',v_id,'code',v_code,'clientId',v_legacy_id,
    'title',trim(p_title),'status','Aberto','orderId',nullif(p_order_id,''),
    'createdAt',now(),'updatedAt',now(),'messages',jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid()::text,'author','Cliente','role','client',
        'text',trim(p_message),'internal',false,'at',now(),'files','[]'::jsonb)));
  insert into public.gsa_legacy_records(id,kind,customer_id,payload) values(v_id,'tickets',v_customer,v_payload);
  insert into public.gsa_legacy_records(id,kind,customer_id,payload) values(
    'ticket-' || gen_random_uuid()::text,'notifications',v_customer,
    jsonb_build_object('id',gen_random_uuid()::text,'clientId',v_legacy_id,'kind','tickets',
      'recordId',v_id,'recordCode',v_code,'audience','admin','read',false,
      'message','Novo chamado aberto: ' || trim(p_title),'createdAt',now()));
  return v_payload;
end;
$$;

create or replace function public.gsa_client_send_ticket_message(
  p_ticket_id text, p_message text, p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_record public.gsa_legacy_records%rowtype;
  v_message jsonb;
  v_payload jsonb;
begin
  if v_customer is null or length(trim(coalesce(p_message,''))) not between 1 and 5000 then
    raise exception 'Mensagem inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb)) <> 'array'
    or exists (select 1 from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) as attachment(value)
      where split_part(attachment.value->>'fileId','/',1) <> v_customer::text) then
    raise exception 'Anexo inválido.' using errcode = '22023';
  end if;
  select * into v_record from public.gsa_legacy_records
    where kind = 'tickets' and id = p_ticket_id and customer_id = v_customer for update;
  if not found then raise exception 'Chamado não encontrado.' using errcode = 'P0002'; end if;
  v_message := jsonb_build_object('id',gen_random_uuid()::text,'author','Cliente','role','client',
    'text',trim(p_message),'internal',false,'at',now(),'files',coalesce(p_attachments,'[]'::jsonb));
  v_payload := v_record.payload || jsonb_build_object('messages',
    coalesce(v_record.payload->'messages','[]'::jsonb) || jsonb_build_array(v_message),'updatedAt',now());
  update public.gsa_legacy_records set payload = v_payload, updated_at = now()
    where kind = 'tickets' and id = p_ticket_id;
  insert into public.gsa_legacy_records(id,kind,customer_id,payload) values(
    'ticket-message-' || gen_random_uuid()::text,'notifications',v_customer,
    jsonb_build_object('id',gen_random_uuid()::text,'clientId',v_record.payload->>'clientId',
      'kind','tickets','recordId',p_ticket_id,'audience','admin','read',false,
      'message','Nova mensagem no chamado ' || coalesce(v_record.payload->>'code',''),'createdAt',now()));
  return v_payload;
end;
$$;

create or replace function public.gsa_client_request_account_deletion(p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
  v_client_legacy_id text;
  v_id text := gen_random_uuid()::text;
  v_payload jsonb;
begin
  if v_customer is null or length(trim(coalesce(p_reason,''))) not between 5 and 1000 then
    raise exception 'Informe o motivo da solicitação.' using errcode = '22023';
  end if;
  select legacy_id into v_client_legacy_id from public.gsa_clients where id = v_customer;
  if exists (select 1 from public.gsa_legacy_records where kind='account_deletion_requests'
    and customer_id=v_customer and payload->>'status'='Pendente') then
    raise exception 'Já existe uma solicitação de exclusão pendente.' using errcode = '23505';
  end if;
  v_payload := jsonb_build_object('id',v_id,'clientId',v_client_legacy_id,
    'status','pending','reason',trim(p_reason),'requestedAt',now());
  insert into public.gsa_legacy_records(id,kind,customer_id,payload) values(v_id,'account_deletion_requests',v_customer,v_payload);
  insert into public.gsa_legacy_records(id,kind,customer_id,payload) values(
    'delete-notice-' || gen_random_uuid()::text,'notifications',v_customer,
    jsonb_build_object('id',gen_random_uuid()::text,'clientId',v_client_legacy_id,'kind','account_deletion',
      'recordId',v_id,'audience','admin','read',false,'message','Cliente solicitou a exclusão da conta.','createdAt',now()));
  return v_payload;
end;
$$;

create or replace function public.gsa_client_mark_record_notification_read(p_notification_id text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_customer uuid := (select public.gsa_current_customer_id());
begin
  if v_customer is null then raise exception 'Sessão de cliente inválida.' using errcode = '42501'; end if;
  update public.gsa_legacy_records r
  set payload = r.payload || jsonb_build_object('read',true,'readAt',now()), updated_at=now()
  where r.kind='notifications' and (r.id=p_notification_id or r.payload->>'id'=p_notification_id) and r.customer_id=v_customer
    and coalesce(r.payload->>'audience','client')='client';
  if not found then raise exception 'Notificação não encontrada.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.gsa_admin_convert_proposal(p_proposal_id text, p_contract jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_proposal public.gsa_legacy_records%rowtype;
  v_customer uuid;
  v_id bigint;
  v_contract_id text;
  v_code text;
  v_contract jsonb;
begin
  if not (select public.gsa_admin_has_module('contracts')) or not (select public.gsa_admin_has_module('proposals')) then
    raise exception 'Acesso não permitido para converter esta proposta.' using errcode='42501';
  end if;
  select * into v_proposal from public.gsa_legacy_records
    where kind='proposals' and (id=p_proposal_id or payload->>'id'=p_proposal_id or payload->>'code'=p_proposal_id)
    for update;
  if not found then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
  if lower(coalesce(v_proposal.payload->>'status','')) <> 'aceita' or coalesce(v_proposal.payload->>'contractId','') <> '' then
    raise exception 'Somente propostas aceitas e ainda não convertidas podem gerar contrato.' using errcode='22023';
  end if;
  select id into v_customer from public.gsa_clients where legacy_id=v_proposal.payload->>'clientId';
  if v_customer is null then raise exception 'Cadastro do cliente associado à proposta não existe.' using errcode='23503'; end if;
  v_id := public.gsa_next_business_id('contracts',1);
  v_contract_id := v_id::text;
  v_code := 'CONT-' || to_char(current_date,'YYYY') || '-' || lpad(v_contract_id,5,'0');
  v_contract := coalesce(p_contract,'{}'::jsonb) || jsonb_build_object(
    'id',v_id,'code',v_code,'clientId',v_proposal.payload->>'clientId',
    'proposalId',v_proposal.payload->>'id','proposalCode',v_proposal.payload->>'code',
    'status',coalesce(p_contract->>'status','Pendente'),'createdAt',now(),'updatedAt',now());
  insert into public.gsa_legacy_records(id,kind,customer_id,payload)
  values(v_contract_id,'contracts',v_customer,v_contract);
  update public.gsa_legacy_records set payload=payload || jsonb_build_object(
    'status','Convertida','contractId',v_id,'convertedAt',now(),'updatedAt',now()),updated_at=now()
  where kind='proposals' and id=v_proposal.id;
  return v_contract;
end;
$$;

create or replace function public.gsa_admin_delete_contract(p_contract_id text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_contract public.gsa_legacy_records%rowtype;
  v_proposal_id text;
begin
  if not (select public.gsa_admin_has_module('contracts')) then
    raise exception 'Acesso não permitido para excluir contratos.' using errcode='42501';
  end if;
  select * into v_contract from public.gsa_legacy_records
    where kind='contracts' and (id=p_contract_id or payload->>'id'=p_contract_id or payload->>'code'=p_contract_id)
    for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode='P0002'; end if;
  v_proposal_id := coalesce(v_contract.payload->>'proposalId','');
  if v_proposal_id <> '' then
    if not (select public.gsa_admin_has_module('proposals')) then
      raise exception 'Também é necessária permissão para atualizar a proposta de origem.' using errcode='42501';
    end if;
    update public.gsa_legacy_records set payload=payload || jsonb_build_object(
      'status','Aceita','contractId',null,'convertedAt',null,'updatedAt',now()),updated_at=now()
    where kind='proposals' and (id=v_proposal_id or payload->>'id'=v_proposal_id);
  end if;
  delete from public.gsa_legacy_records where kind='contracts' and id=v_contract.id;
  return jsonb_build_object('ok',true,'proposalId',v_proposal_id);
end;
$$;

revoke all on function public.gsa_client_decide_proposal(text,text,text) from public;
revoke all on function public.gsa_client_upload_document(text,text,text,text,text,bigint) from public;
revoke all on function public.gsa_client_upload_contract(text,text,text,text,bigint) from public;
revoke all on function public.gsa_client_create_ticket(text,text,text) from public;
revoke all on function public.gsa_client_send_ticket_message(text,text,jsonb) from public;
revoke all on function public.gsa_client_request_account_deletion(text) from public;
revoke all on function public.gsa_client_mark_record_notification_read(text) from public;
revoke all on function public.gsa_admin_convert_proposal(text,jsonb) from public;
revoke all on function public.gsa_admin_delete_contract(text) from public;
grant execute on function public.gsa_client_decide_proposal(text,text,text) to authenticated;
grant execute on function public.gsa_client_upload_document(text,text,text,text,text,bigint) to authenticated;
grant execute on function public.gsa_client_upload_contract(text,text,text,text,bigint) to authenticated;
grant execute on function public.gsa_client_create_ticket(text,text,text) to authenticated;
grant execute on function public.gsa_client_send_ticket_message(text,text,jsonb) to authenticated;
grant execute on function public.gsa_client_request_account_deletion(text) to authenticated;
grant execute on function public.gsa_client_mark_record_notification_read(text) to authenticated;
grant execute on function public.gsa_admin_convert_proposal(text,jsonb) to authenticated;
grant execute on function public.gsa_admin_delete_contract(text) to authenticated;

create or replace function public.gsa_audit_legacy_record_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else old.payload end;
  v_changed boolean := tg_op = 'INSERT' or old.payload is distinct from new.payload;
  v_status_changed boolean := tg_op = 'INSERT' or old.payload->>'status' is distinct from new.payload->>'status';
  v_admin_actor boolean := exists (
    select 1 from public.gsa_profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.active
  );
  v_label text := coalesce(new.payload->>'code', new.payload->>'title', new.payload->>'name', new.id);
  v_message text;
  v_screen text;
begin
  if new.kind = 'notifications' or not v_changed then
    return new;
  end if;

  insert into public.gsa_audit_log(actor_id, customer_id, action, entity_type, entity_id, before_data, after_data)
  values (
    (select auth.uid()), new.customer_id,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    new.kind,
    case when coalesce(new.payload->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$' then (new.payload->>'id')::uuid else null end,
    v_old, new.payload
  );

  if not v_admin_actor or new.customer_id is null then return new; end if;
  if new.kind = 'tickets' and tg_op = 'UPDATE'
    and coalesce((new.payload->'messages'->-1->>'internal')::boolean,false) then return new; end if;
  if tg_op = 'UPDATE' and not v_status_changed and not (new.kind = 'tickets' and old.payload->'messages' is distinct from new.payload->'messages') then return new; end if;
  if new.kind not in ('proposals','contracts','orders','documents','personal_documents','invoices','tickets') then return new; end if;

  v_screen := case new.kind
    when 'proposals' then 'proposals' when 'contracts' then 'contracts'
    when 'orders' then 'orders' when 'documents' then 'documents'
    when 'personal_documents' then 'documents' when 'invoices' then 'finance'
    else 'support' end;
  v_message := case
    when new.kind = 'proposals' and tg_op = 'INSERT' then 'Nova proposta disponível: ' || v_label
    when new.kind in ('documents','personal_documents') and tg_op = 'INSERT' then 'Novo documento solicitado: ' || v_label
    when new.kind = 'contracts' and tg_op = 'INSERT' then 'Novo contrato disponível: ' || v_label
    when new.kind = 'orders' and tg_op = 'INSERT' then 'Nova ordem de serviço: ' || v_label
    when new.kind = 'invoices' and tg_op = 'INSERT' then 'Nova fatura disponível: ' || v_label
    when new.kind = 'tickets' and tg_op = 'UPDATE' then 'Atualização no chamado: ' || v_label
    else 'Atualização em ' || v_label end;

  insert into public.gsa_legacy_records(id,kind,customer_id,payload)
  values ('notice-' || gen_random_uuid()::text, 'notifications', new.customer_id,
    jsonb_build_object('id',gen_random_uuid()::text,'clientId',new.payload->>'clientId',
      'kind',new.kind,'recordId',new.id,'recordCode',coalesce(new.payload->>'code',''),
      'target',jsonb_build_object('screen',v_screen,'detail',coalesce(new.payload->>'code',new.id)),
      'audience','client','read',false,'message',v_message,'createdAt',now()));
  return new;
end;
$$;

drop trigger if exists gsa_legacy_record_audit on public.gsa_legacy_records;
create trigger gsa_legacy_record_audit
after insert or update on public.gsa_legacy_records
for each row execute function public.gsa_audit_legacy_record_change();

-- Only permit read access to a narrow set of client-visible records. All client
-- writes are handled through purpose-built RLS policies/RPCs on normalized tables.
create policy gsa_legacy_records_client_read on public.gsa_legacy_records
for select to authenticated using (
  customer_id = (select public.gsa_current_customer_id())
  and kind in ('clients','proposals','contracts','orders','invoices','documents',
               'personal_documents','folders','files','tickets','notifications',
               'account_deletion_requests')
  and (kind not in ('documents','personal_documents','files')
       or coalesce((payload->>'visible')::boolean, true))
);


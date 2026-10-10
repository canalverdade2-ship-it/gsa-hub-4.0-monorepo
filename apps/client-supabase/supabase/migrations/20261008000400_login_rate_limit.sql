create table if not exists public.gsa_client_login_attempts (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table public.gsa_client_login_attempts enable row level security;
revoke all on public.gsa_client_login_attempts from anon, authenticated;

create or replace function public.gsa_consume_client_login_attempt(p_key_hash text, p_now timestamptz default now())
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if length(coalesce(p_key_hash,'')) <> 64 or p_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Chave de controle inválida.' using errcode='22023';
  end if;
  insert into public.gsa_client_login_attempts(key_hash,window_started_at,attempts)
  values(p_key_hash,p_now,1)
  on conflict(key_hash) do update set
    attempts=case when public.gsa_client_login_attempts.window_started_at < p_now - interval '15 minutes' then 1 else public.gsa_client_login_attempts.attempts + 1 end,
    window_started_at=case when public.gsa_client_login_attempts.window_started_at < p_now - interval '15 minutes' then p_now else public.gsa_client_login_attempts.window_started_at end
  returning attempts into v_attempts;
  return v_attempts;
end;
$$;
revoke all on function public.gsa_consume_client_login_attempt(text,timestamptz) from public, anon, authenticated;
grant execute on function public.gsa_consume_client_login_attempt(text,timestamptz) to service_role;

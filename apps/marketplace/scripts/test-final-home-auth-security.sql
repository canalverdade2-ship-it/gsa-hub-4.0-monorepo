\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

\i supabase/migrations/20260720193000_auth_gateway_rate_limit.sql

CREATE OR REPLACE FUNCTION public.gsa_set_pin_and_login(p_documento text, p_telefone text, p_pin text, p_tipo text)
RETURNS jsonb
LANGUAGE sql
AS $$ SELECT jsonb_build_object('success', true); $$;
GRANT EXECUTE ON FUNCTION public.gsa_set_pin_and_login(text, text, text, text) TO anon, authenticated, service_role;

\i supabase/migrations/20260721125000_disable_unverified_first_access.sql
\i supabase/migrations/20260721125500_prevent_recovery_subject_lockout.sql

DO $test$
DECLARE
  v_result jsonb;
  v_index integer;
BEGIN
  IF has_function_privilege('anon', 'public.gsa_set_pin_and_login(text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.gsa_set_pin_and_login(text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.gsa_set_pin_and_login(text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Primeiro acesso sem OTP ainda possui permissão pública ou de gateway.';
  END IF;

  FOR v_index IN 1..10 LOOP
    v_result := public.gsa_auth_rate_limit_check(repeat('r', 63) || (v_index % 10)::text, 4, 1800, 7200);
    IF NOT coalesce((v_result->>'allowed')::boolean, false) THEN
      RAISE EXCEPTION 'Regra de recuperação criou bloqueio por documento: %', v_result;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.gsa_auth_rate_limits
    WHERE bucket_key LIKE repeat('r', 63) || '%'
  ) THEN
    RAISE EXCEPTION 'Bucket de recuperação por documento foi persistido antes da validação.';
  END IF;

  PERFORM public.gsa_auth_rate_limit_check(repeat('n', 64), 2, 60, 120);
  PERFORM public.gsa_auth_rate_limit_check(repeat('n', 64), 2, 60, 120);
  v_result := public.gsa_auth_rate_limit_check(repeat('n', 64), 2, 60, 120);
  IF coalesce((v_result->>'allowed')::boolean, true) THEN
    RAISE EXCEPTION 'O rate limiting normal deixou de bloquear após a correção.';
  END IF;
END;
$test$;

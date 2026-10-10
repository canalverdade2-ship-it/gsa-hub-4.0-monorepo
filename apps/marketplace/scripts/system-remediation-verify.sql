\set ON_ERROR_STOP on

DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN (
       'get_auth_users_details','get_database_details','get_system_metrics',
       'get_storage_details','get_admin_system_status','get_admin_counts',
       'get_admin_pendency_counts','verify_admin_access','execute_sql'
     )
     AND (has_function_privilege('anon',p.oid,'EXECUTE')
       OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
  IF v_count<>0 THEN RAISE EXCEPTION '% funções críticas ainda expostas',v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
     );
  IF v_count<>0 THEN RAISE EXCEPTION '% SECURITY DEFINER sem search_path fixo',v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname IN ('auth','storage','realtime');
  IF v_count<>0 THEN RAISE EXCEPTION '% tabelas internas ainda publicadas',v_count; END IF;

  SELECT count(*) INTO v_count FROM pg_constraint con
   JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT con.convalidated
     AND c.relname IN ('seguros_cotacoes','seguros_propostas');
  IF v_count<>0 THEN RAISE EXCEPTION '% constraints de seguros não validadas',v_count; END IF;

  IF to_regclass('public.payment_webhook_events') IS NOT NULL
     AND NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.payment_webhook_events'::regclass) THEN
    RAISE EXCEPTION 'payment_webhook_events permanece sem RLS';
  END IF;
END $$;

SELECT 'SYSTEM_REMEDIATION_OK' AS result;

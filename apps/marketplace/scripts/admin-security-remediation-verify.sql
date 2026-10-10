\pset tuples_only on
\pset format unaligned

SELECT 'TABLE|' || t || '|rls=' || c.relrowsecurity
  || '|anon_select=' || has_table_privilege('anon','public.'||t,'SELECT')
  || '|anon_insert=' || has_table_privilege('anon','public.'||t,'INSERT')
  || '|anon_update=' || has_table_privilege('anon','public.'||t,'UPDATE')
  || '|anon_delete=' || has_table_privilege('anon','public.'||t,'DELETE')
FROM unnest(ARRAY[
  'extensions','tenants','schema_migrations','gsa_whatsapp_verifications',
  'gsa_calculator_pro_whatsapp_requests','parceiros'
]) t
JOIN pg_class c ON c.oid=to_regclass('public.'||t)
ORDER BY t;

SELECT 'VIEW|parceiros_publicos|anon_select=' ||
  has_table_privilege('anon','public.parceiros_publicos','SELECT') ||
  '|rows=' || count(*)
FROM public.parceiros_publicos;

SELECT 'FUNCTION|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
  || '|anon=' || has_function_privilege('anon',p.oid,'EXECUTE')
  || '|authenticated=' || has_function_privilege('authenticated',p.oid,'EXECUTE')
  || '|secure_path=' || (coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=public, pg_temp%')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'gsa_admin_trigger_scraping_now','gsa_admin_log_scraping_step',
  'gsa_admin_import_products_batch_v2','gsa_admin_trigger_scraping_now_internal',
  'gsa_admin_log_scraping_step_internal','gsa_admin_import_products_batch_v2_internal'
)
ORDER BY p.proname;

SELECT 'MODULE_POLICY|' || tablename || '|' || policyname || '|' || permissive
FROM pg_policies
WHERE schemaname='public' AND policyname LIKE 'gsa_collaborator_module_%'
  AND tablename IN (
    'carteira_lancamentos','pontos_movimentacoes','notificacoes',
    'gsa_careers_applications','gsa_careers_application_history',
    'viagens_passageiros','viagens_passageiro_documentos','viagens_configuracoes'
  )
ORDER BY tablename;

SELECT 'PASSENGER_TAUTOLOGY|' || count(*)
FROM pg_policies
WHERE schemaname='public' AND tablename='viagens_passageiros'
  AND (coalesce(qual,'') LIKE '%transacao.proposta_id = transacao.proposta_id%'
       OR coalesce(with_check,'') LIKE '%transacao.proposta_id = transacao.proposta_id%');

SELECT 'PUBLIC_SETTING|' || key
FROM public.system_settings
WHERE key IN ('n8n_base_url','whatsapp_n8n_webhook_url','admin_access_code')
  AND (SELECT coalesce(bool_or(coalesce(qual,'') LIKE '%' || quote_literal(key) || '%'),false)
       FROM pg_policies WHERE schemaname='public' AND tablename='system_settings');

SELECT 'ACTIVE_SESSIONS|' || count(*) FROM public.sistema_sessoes WHERE status='ativo';

\pset tuples_only on
\pset format unaligned

SELECT 'FUNCTION|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'gsa_admin_restrict_collaborator_to_module',
    'gsa_admin_trigger_scraping_now',
    'gsa_admin_log_scraping_step',
    'gsa_admin_import_products_batch_v2',
    'gsa_admin_save_scraping_config',
    'gsa_admin_save_travel_category'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT 'COLUMN|' || c.table_name || '|' || c.ordinal_position || '|' || c.column_name || '|' || c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'extensions', 'gsa_whatsapp_verifications', 'parceiros', 'schema_migrations',
    'tenants', 'gsa_calculator_pro_whatsapp_requests', 'system_settings',
    'parceiros_resgates_public_status', 'viagens_configuracoes', 'sistema_sessoes'
  )
ORDER BY c.table_name, c.ordinal_position;

SELECT 'COUNT|' || x.table_name || '|' || x.row_count
FROM (
  SELECT 'extensions' AS table_name, count(*)::text AS row_count FROM public.extensions
  UNION ALL SELECT 'gsa_whatsapp_verifications', count(*)::text FROM public.gsa_whatsapp_verifications
  UNION ALL SELECT 'parceiros', count(*)::text FROM public.parceiros
  UNION ALL SELECT 'schema_migrations', count(*)::text FROM public.schema_migrations
  UNION ALL SELECT 'tenants', count(*)::text FROM public.tenants
  UNION ALL SELECT 'gsa_calculator_pro_whatsapp_requests', count(*)::text FROM public.gsa_calculator_pro_whatsapp_requests
) x
ORDER BY x.table_name;

SELECT 'SETTING_KEY|' || key
FROM public.system_settings
ORDER BY key;

SELECT 'POLICY|' || schemaname || '|' || tablename || '|' || policyname || '|' || permissive || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cobrancas', 'cobranca_historico', 'cobranca_acordo_parcelas',
    'carteira_lancamentos', 'pontos_movimentacoes', 'notificacoes',
    'gsa_careers_applications', 'viagens_passageiros', 'viagens_configuracoes'
  )
ORDER BY tablename, policyname;

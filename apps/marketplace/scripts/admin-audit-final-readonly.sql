\pset tuples_only on
\pset format unaligned

SELECT 'EXEC|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
  || '|anon=' || has_function_privilege('anon', p.oid, 'EXECUTE')
  || '|authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'gsa_admin_trigger_scraping_now', 'gsa_admin_log_scraping_step',
    'gsa_admin_import_products_batch_v2', 'gsa_admin_save_scraping_config',
    'gsa_admin_save_travel_category'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT 'SETTINGS_POLICY|' || policyname || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '')
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'system_settings';

SELECT 'SESSION_STATUS|' || status || '|' || count(*)
FROM public.sistema_sessoes
GROUP BY status
ORDER BY status;

SELECT 'STALE_OPEN_SESSIONS|' || count(*)
FROM public.sistema_sessoes
WHERE encerrado_em IS NULL
  AND ultimo_acesso < now() - interval '24 hours';

SELECT 'COLLABORATOR_MODULE_DUPLICATES|' || count(*)
FROM (
  SELECT colaborador_id, modulo_id
  FROM public.sistema_colaborador_modulos
  GROUP BY colaborador_id, modulo_id
  HAVING count(*) > 1
) d;

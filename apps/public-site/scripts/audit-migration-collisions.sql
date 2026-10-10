BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT json_build_object('kind','history','version',version,'name',name,
  'statement_count',cardinality(statements),'statements_md5',md5(array_to_string(statements,E'\n')))
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260831143000','20260831203000','20260922115000','20260923013000','20260923013100')
ORDER BY version;
SELECT json_build_object('kind','function','name',p.proname,
  'arguments',pg_get_function_identity_arguments(p.oid),'body_md5',md5(p.prosrc),
  'security_definer',p.prosecdef)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'gsa_admin_cancel_partner_redemption','gsa_admin_delete_partner_redemption',
  'gsa_bot_find_partner_redemption','gsa_client_claim_invoice_generation',
  'gsa_admin_ship_store_order','gsa_client_claim_invoice_generation',
  'gsa_client_sync_pix_invoice')
ORDER BY p.proname;
SELECT json_build_object('kind','table','name',name,'exists',to_regclass('public.'||name) IS NOT NULL)
FROM unnest(ARRAY['gsa_tv_programs','gsa_tv_series','gsa_tv_episodes',
  'gsa_tv_schedule_versions','gsa_tv_program_blocks','gsa_tv_rights_records',
  'gsa_tv_execution_log','gsa_tv_watchdog_samples','gsa_tv_graphics']) AS name;
ROLLBACK;

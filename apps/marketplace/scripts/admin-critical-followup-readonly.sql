\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

SELECT 'TABLE_PRIVILEGES', c.relname,
       has_table_privilege('anon',c.oid,'SELECT'),
       has_table_privilege('anon',c.oid,'INSERT'),
       has_table_privilege('anon',c.oid,'UPDATE'),
       has_table_privilege('anon',c.oid,'DELETE'),
       has_table_privilege('authenticated',c.oid,'SELECT'),
       has_table_privilege('authenticated',c.oid,'INSERT'),
       has_table_privilege('authenticated',c.oid,'UPDATE'),
       has_table_privilege('authenticated',c.oid,'DELETE'),
       c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'extensions','gsa_calculator_pro_whatsapp_requests','gsa_whatsapp_verifications',
  'parceiros','schema_migrations','tenants','carteira_lancamentos','pontos_movimentacoes',
  'loja_solicitacoes','gsa_careers_applications','viagens_cancelamentos','notificacoes'
)
ORDER BY c.relname;

SELECT 'FUNCTION_DEF', p.proname, pg_get_function_identity_arguments(p.oid),
       replace(replace(pg_get_functiondef(p.oid),E'\n',' '),E'\r',' ')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'gsa_admin_criar_proposta_saude','gsa_admin_get_classified_detail',
  'gsa_admin_request_classified_adjustments','gsa_admin_update_classified_commission',
  'gsa_admin_save_scraping_config','gsa_admin_save_travel_category',
  'gsa_admin_trigger_scraping_now','gsa_admin_log_scraping_step',
  'gsa_admin_import_products_batch_v2','gsa_admin_restrict_collaborator_to_module'
)
ORDER BY p.proname, 2;

SELECT 'POLICIES', tablename, policyname, permissive, cmd,
       array_to_string(roles,','),coalesce(qual,''),coalesce(with_check,'')
FROM pg_policies
WHERE schemaname='public' AND tablename IN (
  'carteira_lancamentos','pontos_movimentacoes','loja_solicitacoes','gsa_careers_applications',
  'viagens_cancelamentos','viagens_configuracoes','viagens_fornecedores',
  'viagens_passageiro_documentos','viagens_passageiros','viagens_solicitacoes_reserva',
  'viagens_vouchers','notificacoes','suporte_mensagens','cobrancas','cobranca_historico',
  'cobranca_acordo_parcelas'
)
ORDER BY tablename, policyname;

SELECT 'DUPLICATE_ACTIVE_COLLABORATOR_MODULE', colaborador_id, modulo_id, count(*)
FROM public.colaborador_modulos
GROUP BY colaborador_id, modulo_id HAVING count(*)>1;

SELECT 'STALE_ACTIVE_ADMIN_SESSION', ator_tipo, count(*)
FROM public.sistema_sessoes
WHERE ativo=true AND expires_at < now()
  AND ator_tipo IN ('admin','colaborador')
GROUP BY ator_tipo;

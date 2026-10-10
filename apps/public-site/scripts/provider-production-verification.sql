BEGIN TRANSACTION READ ONLY;

DO $provider_production_audit$
DECLARE
  v_missing_migrations text[];
  v_signature text;
  v_oid oid;
  v_definition text;
  v_table text;
  v_trigger text;
  v_policy_count integer;
BEGIN
  SELECT array_agg(required_version ORDER BY required_version)
    INTO v_missing_migrations
  FROM unnest(ARRAY[
    '20260720232900',
    '20260720233000',
    '20260720233100',
    '20260720233200',
    '20260721170000'
  ]::text[]) AS required_version
  WHERE NOT EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations migration
    WHERE migration.version = required_version
  );

  IF COALESCE(array_length(v_missing_migrations, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Migrations obrigatórias do Prestador ausentes: %', v_missing_migrations;
  END IF;

  IF to_regclass('public.prestadores') IS NULL
     OR to_regclass('public.sistema_sessoes') IS NULL
     OR to_regclass('public.gsa_provider_audit_events') IS NULL
     OR to_regclass('public.prestador_demandas') IS NULL
     OR to_regclass('public.prestador_agendamentos') IS NULL
     OR to_regclass('public.prestador_documentos') IS NULL
     OR to_regclass('public.prestador_transacoes') IS NULL
     OR to_regclass('public.prestador_saques') IS NULL
     OR to_regclass('public.tickets') IS NULL
     OR to_regclass('public.ticket_mensagens') IS NULL THEN
    RAISE EXCEPTION 'Uma ou mais tabelas essenciais do Painel do Prestador estão ausentes.';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.gsa_provider_session_access_state()',
    'public.gsa_provider_mark_notification_read(uuid)',
    'public.gsa_provider_mark_all_notifications_read()',
    'public.gsa_provider_financial_snapshot()',
    'public.gsa_provider_dashboard_snapshot()',
    'public.gsa_provider_pendency_snapshot()',
    'public.gsa_provider_request_withdrawal(numeric,text,text)',
    'public.gsa_provider_cancel_withdrawal(uuid,text)',
    'public.gsa_provider_redeem_voucher(uuid)',
    'public.gsa_provider_redeem_prize(uuid)',
    'public.gsa_provider_activate_promotion(uuid)',
    'public.gsa_provider_update_profile(text,text,text,text)',
    'public.gsa_provider_create_schedule(uuid,timestamp with time zone,timestamp with time zone,text)',
    'public.gsa_provider_complete_schedule(uuid)',
    'public.gsa_provider_delete_schedule(uuid)',
    'public.gsa_provider_submit_document(uuid,text[])',
    'public.gsa_provider_transition_demand(uuid,text,jsonb)',
    'public.gsa_provider_create_ticket(text,text,boolean)',
    'public.gsa_provider_send_ticket_message(uuid,text,text,text)',
    'public.gsa_provider_request_profile_change(text,text,text)',
    'public.gsa_provider_request_demand_support(uuid,text)'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'RPC obrigatória ausente: %', v_signature;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
      RAISE EXCEPTION 'RPC obrigatória não está como SECURITY DEFINER: %', v_signature;
    END IF;

    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Papel authenticated sem EXECUTE na RPC: %', v_signature;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Papel anon possui EXECUTE indevido na RPC: %', v_signature;
    END IF;
  END LOOP;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.gsa_provider_context(boolean)',
    'public.gsa_assert_current_provider()',
    'public.gsa_assert_current_provider_active()',
    'public.gsa_provider_write_audit(text,text,uuid,jsonb)',
    'public.gsa_provider_insert_admin_notification(text,text,text,text,uuid,text,jsonb)',
    'public.gsa_guard_provider_direct_write()',
    'public.gsa_guard_provider_schedule()',
    'public.gsa_validate_provider_operational_row()',
    'public.gsa_emit_provider_operational_event()',
    'public.gsa_revoke_provider_sessions_on_access_change()'
  ] LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Helper interno obrigatório ausente: %', v_signature;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Helper interno ainda executável pela API: %', v_signature;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(to_regprocedure('public.gsa_provider_context(boolean)'))
    INTO v_definition;
  IF position('gsa_session_id' in v_definition) = 0
     OR position('public.sistema_sessoes' in v_definition) = 0
     OR position('Acesso do prestador revogado' in v_definition) = 0
     OR position('app.gsa_provider_rpc' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Contexto seguro do prestador não contém todas as validações obrigatórias.';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure('public.gsa_guard_provider_schedule()'))
    INTO v_definition;
  IF position('pg_advisory_xact_lock' in v_definition) = 0
     OR position('Existe conflito com outro agendamento' in v_definition) = 0
     OR position('só pode ser concluído após o horário final' in v_definition) = 0 THEN
    RAISE EXCEPTION 'Proteções de concorrência ou conclusão da agenda estão incompletas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.gsa_provider_dashboard_snapshot()')
      AND provolatile = 'v'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.gsa_provider_pendency_snapshot()')
      AND provolatile = 'v'
  ) THEN
    RAISE EXCEPTION 'Snapshots do prestador não estão marcados como VOLATILE.';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'prestadores', 'tickets', 'ticket_mensagens', 'notificacoes',
    'prestador_suporte_demandas', 'prestador_transacoes', 'prestador_saques',
    'prestador_vouchers', 'prestador_premios', 'prestador_promocoes_ativacoes',
    'prestador_agendamentos', 'prestador_documentos', 'prestador_demandas',
    'prestador_demandas_historico', 'os_notas'
  ] LOOP
    v_trigger := 'trg_guard_provider_direct_' || v_table;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
      JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND table_row.relname = v_table
        AND trigger_row.tgname = v_trigger
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgenabled <> 'D'
    ) THEN
      RAISE EXCEPTION 'Gatilho de bloqueio de escrita direta ausente ou desativado: %.%', v_table, v_trigger;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_provider_schedule' AND NOT tgisinternal AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_gsa_revoke_provider_sessions_update' AND NOT tgisinternal AND tgenabled <> 'D'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_gsa_revoke_provider_sessions_delete' AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Gatilhos de agenda ou revogação de sessão estão ausentes/desativados.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class table_row
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND table_row.relname = 'gsa_provider_audit_events'
      AND table_row.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS não está habilitada na auditoria do prestador.';
  END IF;

  IF has_table_privilege('anon', 'public.gsa_provider_audit_events', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.gsa_provider_audit_events', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Tabela de auditoria do prestador possui privilégio direto indevido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'documentos_prestador' AND public = false
  ) OR NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'entregas_demandas' AND public = false
  ) THEN
    RAISE EXCEPTION 'Buckets privados do Prestador ausentes ou públicos.';
  END IF;

  SELECT count(*)
    INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'provider_private_files_select',
      'provider_private_files_insert',
      'provider_private_files_update',
      'provider_private_files_delete'
    );
  IF v_policy_count <> 4 THEN
    RAISE EXCEPTION 'Políticas privadas do Storage incompletas: % de 4.', v_policy_count;
  END IF;
END;
$provider_production_audit$;

SELECT
  'PROVIDER_PRODUCTION_VERIFIED' AS result,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'gsa_provider_%') AS provider_functions,
  (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_%provider%' AND NOT tgisinternal AND tgenabled <> 'D') AS provider_triggers,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'provider_private_files_%') AS provider_storage_policies;

COMMIT;

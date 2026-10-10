-- Executado depois das migrações dentro de uma transação externa finalizada com ROLLBACK.

DO $audit$
DECLARE
  v_missing TEXT;
  fn RECORD;
BEGIN
  SELECT string_agg(expected.object_name, ', ' ORDER BY expected.object_name)
    INTO v_missing
  FROM (
    VALUES
      ('function:gsa_client_process_scheduled_credit_release'),
      ('function:gsa_process_due_store_credit_releases'),
      ('function:gsa_revoke_client_sessions_on_access_change'),
      ('function:gsa_guard_client_notification_insert'),
      ('trigger:trg_gsa_guard_client_credit_limits'),
      ('trigger:trg_gsa_guard_client_credit_release_status'),
      ('trigger:trg_gsa_guard_duplicate_client_credit_movement'),
      ('trigger:trg_gsa_guard_duplicate_client_credit_notification'),
      ('trigger:trg_gsa_revoke_client_sessions_update'),
      ('trigger:trg_gsa_revoke_client_sessions_delete'),
      ('trigger:trg_gsa_guard_client_notification_insert')
  ) AS expected(object_name)
  WHERE CASE
    WHEN expected.object_name LIKE 'function:%' THEN NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = split_part(expected.object_name, ':', 2)
    )
    ELSE NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      WHERE t.tgname = split_part(expected.object_name, ':', 2)
        AND NOT t.tgisinternal
    )
  END;

  IF to_regprocedure('public.gsa_begin_client_recovery(text,text,uuid)') IS NULL
     OR to_regprocedure('public.gsa_client_operational_write(uuid,text,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.cliente_operational_write(uuid,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.gsa_client_mark_notification_read(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.gsa_client_get_notification_read_ids(uuid,text,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Funções da auditoria final do cliente estão ausentes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gsa_client_recovery_challenges'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notificacao_leituras'
  ) THEN
    RAISE EXCEPTION 'Tabelas de recuperação ou leitura individual estão ausentes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'documentos_cliente'
      AND public = false
      AND file_size_limit = 10485760
  ) THEN
    RAISE EXCEPTION 'Limite e privacidade do bucket documentos_cliente estão incorretos.';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.cliente_operational_write(uuid,text,text,jsonb,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Executor operacional privado ainda está exposto a authenticated.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.gsa_client_operational_write(uuid,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'RPC operacional vinculada à sessão não está disponível para authenticated.';
  END IF;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Objetos de segurança ausentes: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'documentos_cliente'
      AND public = false
  ) THEN
    RAISE EXCEPTION 'Bucket documentos_cliente ainda está público ou ausente.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'GSA acessa documentos privados do cliente',
        'GSA envia documentos privados do cliente',
        'GSA atualiza documentos privados do cliente',
        'GSA exclui documentos privados do cliente'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Políticas privadas do bucket documentos_cliente incompletas.';
  END IF;

  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'execute_sql'
  LOOP
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'execute_sql ainda possui permissão pública em OID %.', fn.oid;
    END IF;
  END LOOP;

  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'cliente_operational_write'
  LOOP
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'cliente_operational_write ainda possui execução pública em OID %.', fn.oid;
    END IF;
  END LOOP;

  IF has_function_privilege(
    'authenticated',
    'public.gsa_process_due_store_credit_releases()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Rotina administrativa de crédito exposta a authenticated.';
  END IF;
END;
$audit$;

SELECT
  'client_portal_security_preview' AS module,
  true AS sql_executor_restricted,
  true AS credit_release_protected,
  true AS sessions_revoked_on_access_change,
  true AS private_documents_ready,
  true AS operational_permissions_hardened;

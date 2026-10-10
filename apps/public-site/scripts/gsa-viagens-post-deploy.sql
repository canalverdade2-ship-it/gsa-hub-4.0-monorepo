-- Verificação pós-implantação do GSA Viagens.
-- Qualquer ausência interrompe o workflow com erro.

DO $$
DECLARE
  v_missing_tables TEXT;
  v_missing_functions TEXT;
  v_missing_buckets TEXT;
  v_missing_policies TEXT;
  v_rls_disabled TEXT;
BEGIN
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name)
    INTO v_missing_tables
  FROM (
    VALUES
      ('viagens_configuracoes'),
      ('viagens_fornecedores'),
      ('viagens_pacotes'),
      ('viagens_pacote_imagens'),
      ('viagens_orcamentos'),
      ('viagens_solicitacoes_reserva'),
      ('viagens_propostas'),
      ('viagens_passageiros'),
      ('viagens_passageiro_documentos'),
      ('viagens_transacoes'),
      ('viagens_vouchers'),
      ('viagens_cancelamentos')
  ) AS expected(name)
  WHERE to_regclass(format('public.%I', expected.name)) IS NULL;

  IF v_missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Tabelas ausentes após implantação: %', v_missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'viagens_propostas'
      AND column_name = 'quantidade_passageiros'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Coluna quantidade_passageiros ausente após hardening.';
  END IF;

  SELECT string_agg(expected.signature, ', ' ORDER BY expected.signature)
    INTO v_missing_functions
  FROM (
    VALUES
      ('public.gsa_accept_travel_proposal(uuid,text,uuid)'),
      ('public.gsa_client_checkout_travel(uuid,text,jsonb)'),
      ('public.gsa_request_travel_cancellation(uuid,text,uuid,text)'),
      ('public.gsa_travel_expected_passengers(jsonb)')
  ) AS expected(signature)
  WHERE to_regprocedure(expected.signature) IS NULL;

  IF v_missing_functions IS NOT NULL THEN
    RAISE EXCEPTION 'Funções ausentes após implantação: %', v_missing_functions;
  END IF;

  SELECT string_agg(expected.name, ', ' ORDER BY expected.name)
    INTO v_missing_buckets
  FROM (
    VALUES ('viagens-documentos'), ('viagens-vouchers')
  ) AS expected(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM storage.buckets bucket
    WHERE bucket.id = expected.name
      AND bucket.public = false
  );

  IF v_missing_buckets IS NOT NULL THEN
    RAISE EXCEPTION 'Buckets privados ausentes ou públicos: %', v_missing_buckets;
  END IF;

  SELECT string_agg(expected.policy_name, ', ' ORDER BY expected.policy_name)
    INTO v_missing_policies
  FROM (
    VALUES
      ('public', 'viagens_orcamentos', 'Visitante insere orcamentos'),
      ('public', 'viagens_orcamentos', 'Cliente insere seus orcamentos'),
      ('public', 'viagens_propostas', 'Cliente ve suas propostas'),
      ('public', 'viagens_passageiros', 'Cliente ve seus passageiros'),
      ('public', 'viagens_passageiros', 'Cliente insere passageiros'),
      ('public', 'viagens_passageiros', 'Cliente atualiza passageiros'),
      ('public', 'viagens_passageiros', 'Cliente deleta passageiros'),
      ('public', 'viagens_passageiro_documentos', 'Cliente insere documentos passageiros'),
      ('public', 'viagens_passageiro_documentos', 'Cliente deleta documentos passageiros'),
      ('public', 'viagens_transacoes', 'Cliente ve suas transacoes'),
      ('public', 'viagens_cancelamentos', 'Cliente ve seus cancelamentos'),
      ('storage', 'objects', 'Cliente envia documentos de viagem'),
      ('storage', 'objects', 'Cliente remove documentos de viagem'),
      ('storage', 'objects', 'Cliente baixa vouchers de viagem')
  ) AS expected(schema_name, table_name, policy_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = expected.schema_name
      AND policy.tablename = expected.table_name
      AND policy.policyname = expected.policy_name
  );

  IF v_missing_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas ausentes após implantação: %', v_missing_policies;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'viagens_orcamentos'
      AND policyname = 'Cliente ou visitante insere orcamentos'
  ) THEN
    RAISE EXCEPTION 'Política combinada insegura ainda existe.';
  END IF;

  SELECT string_agg(class.relname, ', ' ORDER BY class.relname)
    INTO v_rls_disabled
  FROM pg_class class
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public'
    AND class.relname IN (
      'viagens_configuracoes',
      'viagens_fornecedores',
      'viagens_pacotes',
      'viagens_pacote_imagens',
      'viagens_orcamentos',
      'viagens_solicitacoes_reserva',
      'viagens_propostas',
      'viagens_passageiros',
      'viagens_passageiro_documentos',
      'viagens_transacoes',
      'viagens_vouchers',
      'viagens_cancelamentos'
    )
    AND class.relrowsecurity = false;

  IF v_rls_disabled IS NOT NULL THEN
    RAISE EXCEPTION 'RLS desabilitado nas tabelas: %', v_rls_disabled;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'storage.objects'::regclass
      AND tgname = 'trg_gsa_cleanup_deleted_travel_document_metadata'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger de limpeza de documentos ausente.';
  END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.viagens_orcamentos (
  cliente_id,
  nome,
  email,
  telefone,
  protocolo
) VALUES (
  NULL,
  'Auditoria GSA',
  'auditoria@invalid.test',
  '00000000000',
  'GSA-POST-DEPLOY-' || md5(random()::text || clock_timestamp()::text)
);
ROLLBACK;

SELECT
  'gsa_viagens' AS module,
  12 AS expected_tables,
  (
    SELECT count(*)
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname LIKE 'viagens_%'
      AND class.relkind = 'r'
  ) AS travel_tables_found,
  (
    SELECT count(*)
    FROM storage.buckets
    WHERE id IN ('viagens-documentos', 'viagens-vouchers')
      AND public = false
  ) AS private_buckets_found,
  (
    SELECT count(*)
    FROM pg_policies
    WHERE (schemaname = 'public' AND tablename LIKE 'viagens_%')
       OR (schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%viagem%')
  ) AS travel_policies_found,
  true AS anonymous_quote_test,
  to_regprocedure('public.gsa_accept_travel_proposal(uuid,text,uuid)') IS NOT NULL AS accept_rpc_ready,
  to_regprocedure('public.gsa_client_checkout_travel(uuid,text,jsonb)') IS NOT NULL AS checkout_rpc_ready,
  to_regprocedure('public.gsa_request_travel_cancellation(uuid,text,uuid,text)') IS NOT NULL AS cancellation_rpc_ready;

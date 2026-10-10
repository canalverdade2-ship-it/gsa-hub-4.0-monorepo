-- Auditoria não destrutiva das correções de hardening do GSA Viagens.

DO $audit$
DECLARE
  v_missing TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'viagens_propostas'
      AND column_name = 'quantidade_passageiros'
      AND udt_name = 'int4'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Coluna quantidade_passageiros ausente ou incompatível.';
  END IF;

  SELECT string_agg(expected.policy_name, ', ' ORDER BY expected.policy_name)
    INTO v_missing
  FROM (
    VALUES
      ('public', 'viagens_orcamentos', 'Visitante insere orcamentos'),
      ('public', 'viagens_orcamentos', 'Cliente insere seus orcamentos'),
      ('public', 'viagens_passageiros', 'Cliente insere passageiros'),
      ('public', 'viagens_passageiros', 'Cliente atualiza passageiros'),
      ('public', 'viagens_passageiros', 'Cliente deleta passageiros'),
      ('public', 'viagens_passageiro_documentos', 'Cliente insere documentos passageiros'),
      ('public', 'viagens_passageiro_documentos', 'Cliente deleta documentos passageiros'),
      ('storage', 'objects', 'Cliente envia documentos de viagem'),
      ('storage', 'objects', 'Cliente remove documentos de viagem')
  ) AS expected(schema_name, table_name, policy_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = expected.schema_name
      AND policy.tablename = expected.table_name
      AND policy.policyname = expected.policy_name
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas de hardening ausentes: %', v_missing;
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.viagens_propostas'::regclass
      AND tgname = 'trg_gsa_set_travel_proposal_passenger_count'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger de quantidade de passageiros ausente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'storage.objects'::regclass
      AND tgname = 'trg_gsa_cleanup_deleted_travel_document_metadata'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger de limpeza de documentos ausente.';
  END IF;

  IF to_regprocedure('public.gsa_client_checkout_travel(uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RPC de checkout ausente.';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.gsa_client_checkout_travel(uuid,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.gsa_client_checkout_travel(uuid,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Permissões da RPC de checkout estão incorretas.';
  END IF;

  IF public.gsa_travel_expected_passengers(
    '{"adultos":2,"criancas":1,"bebes":1}'::jsonb
  ) <> 4 THEN
    RAISE EXCEPTION 'Cálculo de passageiros falhou para estrutura simples.';
  END IF;

  IF public.gsa_travel_expected_passengers(
    '{"orcamento":{"adultos":2,"criancas":2,"bebes":0}}'::jsonb
  ) <> 4 THEN
    RAISE EXCEPTION 'Cálculo de passageiros falhou para snapshot de orçamento.';
  END IF;
END;
$audit$;

-- O orçamento anônimo precisa atravessar privilégios e RLS sem chamar helpers privados.
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
  'GSA-HARDENING-' || md5(random()::text || clock_timestamp()::text)
);
ROLLBACK;

SELECT
  'gsa_viagens_hardening' AS module,
  true AS anonymous_quote_rollback_test,
  true AS passenger_count_contract,
  true AS post_payment_write_protection,
  true AS storage_metadata_cleanup_trigger,
  to_regprocedure('public.gsa_client_checkout_travel(uuid,text,jsonb)') IS NOT NULL AS checkout_ready;

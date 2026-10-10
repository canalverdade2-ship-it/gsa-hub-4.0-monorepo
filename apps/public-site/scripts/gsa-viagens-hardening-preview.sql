-- Executado dentro de uma transação externa que termina em ROLLBACK.

DO $audit$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'viagens_propostas'
      AND column_name = 'quantidade_passageiros'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Coluna quantidade_passageiros ausente.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'viagens_orcamentos'
      AND policyname = 'Cliente ou visitante insere orcamentos'
  ) THEN
    RAISE EXCEPTION 'Política combinada insegura ainda existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'viagens_orcamentos'
      AND policyname = 'Visitante insere orcamentos'
      AND roles = ARRAY['anon']::name[]
  ) THEN
    RAISE EXCEPTION 'Política de visitante ausente ou com papel incorreto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'viagens_orcamentos'
      AND policyname = 'Cliente insere seus orcamentos'
      AND roles = ARRAY['authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'Política de cliente autenticado ausente ou com papel incorreto.';
  END IF;

  IF public.gsa_travel_expected_passengers(
    '{"adultos":2,"criancas":1,"bebes":1}'::jsonb
  ) <> 4 THEN
    RAISE EXCEPTION 'Cálculo de passageiros incorreto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'storage.objects'::regclass
      AND tgname = 'trg_gsa_cleanup_deleted_travel_document_metadata'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger de limpeza de metadados ausente.';
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
    RAISE EXCEPTION 'Permissões da RPC de checkout incorretas.';
  END IF;
END;
$audit$;

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
  'GSA-PREVIEW-' || md5(random()::text || clock_timestamp()::text)
);
RESET ROLE;

SELECT
  'gsa_viagens_hardening_preview' AS module,
  true AS anonymous_quote_allowed,
  true AS passenger_count_ready,
  true AS storage_cleanup_ready;

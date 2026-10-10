\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE TABLE public.orcamentos (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cliente_id uuid,
  codigo_orcamento text NOT NULL UNIQUE,
  status text,
  categoria text,
  data_criacao date,
  titulo_solicitacao text,
  descricao_solicitacao text,
  nivel_prioridade text,
  observacoes_servico text,
  total numeric,
  valor_servico numeric,
  quantidade integer,
  origem_gsa_store boolean,
  contato_publico jsonb,
  public_request_hash text UNIQUE
);

CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  titulo text,
  mensagem text,
  modulo text,
  tab text,
  item_id text,
  tipo text,
  destinatario_tipo text,
  prioridade text,
  acao_origem text,
  contexto jsonb
);

CREATE TABLE public.gsa_public_budget_rate_limits (
  fingerprint text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE SEQUENCE public.test_budget_code_sequence;
CREATE OR REPLACE FUNCTION public.gsa_generate_code(p_prefix text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT p_prefix || '-' || lpad(nextval('public.test_budget_code_sequence')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.gsa_assert_public_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window interval
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM p_scope, p_key, p_limit, p_window;
END;
$$;

\i supabase/migrations/20260721124500_finalize_public_home_budget.sql

DO $test$
DECLARE
  v_type text;
  v_index integer := 0;
  v_result jsonb;
  v_persisted text;
BEGIN
  FOREACH v_type IN ARRAY ARRAY['site', 'loja', 'sistema', 'aplicativo', 'automacao', 'integracao'] LOOP
    v_index := v_index + 1;
    v_result := public.gsa_public_create_enterprise_budget_v2(
      jsonb_build_object(
        'nome', 'Cliente de Teste ' || v_index,
        'email', 'cliente' || v_index || '@example.com',
        'telefone', '11999999' || lpad(v_index::text, 3, '0'),
        'tipo', v_type,
        'solicitacao', 'Descricao suficientemente longa para validar o projeto do tipo ' || v_type || '.',
        'website', '',
        'started_at', (clock_timestamp() - interval '5 seconds')::text,
        'metadata', jsonb_build_object('source', 'final_home_audit')
      )
    );

    IF NOT coalesce((v_result->>'success')::boolean, false)
       OR coalesce(v_result->>'protocol', '') = '' THEN
      RAISE EXCEPTION 'Tipo % retornou resposta invalida: %', v_type, v_result;
    END IF;

    SELECT codigo_orcamento INTO v_persisted
    FROM public.orcamentos
    WHERE id = (v_result->>'budget_id')::uuid;

    IF v_persisted IS DISTINCT FROM v_result->>'protocol' THEN
      RAISE EXCEPTION 'Protocolo nao corresponde ao codigo persistido para %: % <> %', v_type, v_persisted, v_result->>'protocol';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.orcamentos
    WHERE contato_publico->>'tipo' = 'integracao'
      AND titulo_solicitacao ILIKE '%Integracao entre sistemas%'
  ) THEN
    RAISE EXCEPTION 'A opcao integracao nao foi persistida corretamente.';
  END IF;

  IF has_function_privilege('anon', 'public.gsa_public_create_enterprise_budget_v2(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.gsa_public_create_enterprise_budget_v2(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.gsa_public_create_enterprise_budget(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.gsa_public_create_enterprise_budget_v2(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Permissoes das rotinas de orcamento estao incorretas.';
  END IF;
END;
$test$;

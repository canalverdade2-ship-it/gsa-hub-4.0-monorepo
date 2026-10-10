DO $verification$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.classificados_anuncios') IS NULL THEN v_missing := array_append(v_missing, 'classificados_anuncios'); END IF;
  IF to_regclass('public.classificados_midias') IS NULL THEN v_missing := array_append(v_missing, 'classificados_midias'); END IF;
  IF to_regclass('public.classificados_propostas') IS NULL THEN v_missing := array_append(v_missing, 'classificados_propostas'); END IF;
  IF to_regclass('public.classificados_mensagens') IS NULL THEN v_missing := array_append(v_missing, 'classificados_mensagens'); END IF;
  IF to_regclass('public.classificados_transacoes') IS NULL THEN v_missing := array_append(v_missing, 'classificados_transacoes'); END IF;
  IF to_regclass('public.classificados_comissoes') IS NULL THEN v_missing := array_append(v_missing, 'classificados_comissoes'); END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'Tabelas ausentes: %', array_to_string(v_missing, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.classificados_propostas'::regclass
      AND confrelid = 'public.classificados_anuncios'::regclass
      AND contype = 'f'
  ) THEN RAISE EXCEPTION 'Relacionamento propostas -> anúncios ausente.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.classificados_mensagens'::regclass
      AND confrelid = 'public.classificados_propostas'::regclass
      AND contype = 'f'
  ) THEN RAISE EXCEPTION 'Relacionamento mensagens -> propostas ausente.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.classificados_transacoes'::regclass
      AND confrelid = 'public.classificados_propostas'::regclass
      AND contype = 'f'
  ) THEN RAISE EXCEPTION 'Relacionamento transações -> propostas ausente.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.classificados_transacoes'::regclass
      AND confrelid = 'public.classificados_anuncios'::regclass
      AND contype = 'f'
  ) THEN RAISE EXCEPTION 'Relacionamento transações -> anúncios ausente.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.classificados_comissoes'::regclass
      AND confrelid = 'public.classificados_transacoes'::regclass
      AND contype = 'f'
  ) THEN RAISE EXCEPTION 'Relacionamento comissões -> transações ausente.'; END IF;

  IF to_regprocedure('public.rpc_criar_anuncio_classificado(text,text,text,uuid,numeric,text,jsonb,text,jsonb,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC de criação de anúncio ausente.';
  END IF;
  IF to_regprocedure('public.rpc_criar_proposta_classificado(uuid,uuid,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC de criação de proposta ausente.';
  END IF;
  IF to_regprocedure('public.rpc_enviar_mensagem_classificado(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC de mensagens ausente.';
  END IF;
  IF to_regprocedure('public.rpc_responder_proposta_classificado(uuid,text,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC de resposta de proposta ausente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='ux_classificados_transacoes_proposta'
  ) THEN RAISE EXCEPTION 'Unicidade de transação por proposta ausente.'; END IF;
END;
$verification$;

SELECT 'CLASSIFIEDS_COMPLETE_OPERATIONAL_SCHEMA_VERIFIED' AS verification_status;

BEGIN;

DO $$
DECLARE
  v_provider_id uuid := gen_random_uuid();
  v_error_code text;
BEGIN
  INSERT INTO public.prestadores (
    id, tipo_cadastro, nome_razao, documento, email, telefone, area_servico, status, pin_hash
  ) VALUES (
    v_provider_id, 'cpf', 'PRESTADOR TESTE SEGURANCA', '52998224725',
    'provider-security-test@example.invalid', '11999999998', 'Teste', 'pendente',
    extensions.crypt('4827', extensions.gen_salt('bf'))
  );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', gen_random_uuid()::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'gsa_actor_type', 'prestador',
        'gsa_actor_id', v_provider_id,
        'gsa_session_id', gen_random_uuid()::text
      )
    )::text,
    true
  );

  BEGIN
    PERFORM public.gsa_provider_request_withdrawal(1, 'cpf', '52998224725');
    RAISE EXCEPTION 'FALHA: prestador pendente conseguiu solicitar saque';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE;
    RAISE NOTICE 'OK: prestador pendente bloqueado em operacao financeira (%)', v_error_code;
  END;

  BEGIN
    PERFORM public.gsa_provider_create_schedule(NULL, now() + interval '1 day', now() + interval '1 day 1 hour', 'teste');
    RAISE EXCEPTION 'FALHA: prestador pendente conseguiu criar agenda';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE;
    RAISE NOTICE 'OK: prestador pendente bloqueado em agenda (%)', v_error_code;
  END;
END;
$$;

ROLLBACK;

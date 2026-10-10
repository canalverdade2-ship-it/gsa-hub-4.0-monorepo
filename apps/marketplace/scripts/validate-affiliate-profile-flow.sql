\set ON_ERROR_STOP on
BEGIN;

SELECT
  result->>'id' AS test_client_id,
  result#>>'{session,sessao_id}' AS test_session_id,
  result#>>'{session,session_token}' AS test_session_token,
  result->>'affiliate_id' AS test_affiliate_id,
  result->>'perfil_cliente_ativo' AS initial_client_profile
FROM (
  SELECT public.gsa_register_affiliate_account(
    jsonb_build_object(
      'documento', '52998224725',
      'nome', 'Validacao Automatica Codex',
      'nome_divulgacao', 'Validacao GSA',
      'email', 'validacao.afiliado.codex@example.com',
      'telefone', '11999990001',
      'pin', '4826',
      'pix_tipo', 'cpf',
      'pix_chave', '52998224725',
      'termos_versao', '2026-08-29',
      'termos_aceitos', true
    )
  ) AS result
) registration
\gset

SELECT
  :'initial_client_profile' = 'false' AS starts_without_client_profile,
  public.gsa_client_profile_access_state(
    :'test_session_id'::uuid,
    :'test_session_token'
  )->>'perfil_afiliado_ativo' = 'true' AS affiliate_profile_active;

SELECT public.gsa_affiliate_activate_client_profile(
  :'test_session_id'::uuid,
  :'test_session_token'
)->>'success' = 'true' AS client_profile_activation_succeeded;

SELECT
  perfil_cliente_ativo,
  perfil_cliente_origem,
  cadastro_origem
FROM public.clientes
WHERE id = :'test_client_id'::uuid;

ROLLBACK;

SELECT count(*) = 0 AS test_data_was_rolled_back
FROM public.clientes
WHERE email = 'validacao.afiliado.codex@example.com';

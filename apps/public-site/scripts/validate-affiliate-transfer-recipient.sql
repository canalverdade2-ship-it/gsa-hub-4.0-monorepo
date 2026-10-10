\set ON_ERROR_STOP on
BEGIN;

SELECT
  sender.cliente_id AS sender_client_id,
  target.codigo_publico AS target_code
FROM (
  SELECT cliente_id, created_at
  FROM public.gsa_afiliados
  WHERE status = 'ativo'
  ORDER BY created_at
  LIMIT 1
) sender
CROSS JOIN LATERAL (
  SELECT codigo_publico
  FROM public.gsa_afiliados
  WHERE status = 'ativo' AND cliente_id <> sender.cliente_id
  ORDER BY created_at
  LIMIT 1
) target
\gset

SELECT
  session->>'sessao_id' AS test_session_id,
  session->>'session_token' AS test_session_token
FROM (
  SELECT public.gsa_create_session_internal(
    'cliente',
    :'sender_client_id'::uuid,
    'Validacao de transferencia',
    '{}'::jsonb
  ) AS session
) created_session
\gset

SELECT
  response->'target' ? 'nome_completo' AS has_full_name,
  response->'target' ? 'email' AS has_email,
  response->'target' ? 'telefone' AS has_phone,
  NOT (response->'target' ? 'documento') AND NOT (response->'target' ? 'cpf') AS cpf_is_not_returned,
  response->'target' ? 'codigo_publico' AS has_affiliate_code
FROM (
  SELECT public.gsa_client_lookup_affiliate_transfer_target(
    :'test_session_id'::uuid,
    :'test_session_token',
    :'target_code'
  ) AS response
) lookup;

ROLLBACK;

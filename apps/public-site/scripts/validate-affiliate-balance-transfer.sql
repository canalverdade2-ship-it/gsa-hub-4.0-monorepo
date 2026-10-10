\set ON_ERROR_STOP on
BEGIN;

SELECT
  sender.cliente_id AS sender_client_id,
  receiver.id AS receiver_affiliate_id
FROM (
  SELECT a.id, a.cliente_id, public.gsa_affiliate_available_balance(a.id) AS available
  FROM public.gsa_afiliados a
  WHERE a.status = 'ativo'
  ORDER BY available DESC
  LIMIT 1
) sender
CROSS JOIN LATERAL (
  SELECT a.id
  FROM public.gsa_afiliados a
  WHERE a.status = 'ativo' AND a.id <> sender.id
  LIMIT 1
) receiver
WHERE sender.available >= 1
\gset

SELECT
  session->>'sessao_id' AS test_session_id,
  session->>'session_token' AS test_session_token
FROM (
  SELECT public.gsa_create_session_internal(
    'cliente', :'sender_client_id'::uuid, 'Validacao de transferencia', '{}'::jsonb
  ) AS session
) created_session
\gset

SELECT
  public.gsa_client_transfer_affiliate_balance(
    :'test_session_id'::uuid,
    :'test_session_token',
    gen_random_uuid(),
    :'receiver_affiliate_id'::uuid,
    1.00,
    'Validacao transacional automatica'
  )->>'success' = 'true' AS transfer_succeeded;

ROLLBACK;

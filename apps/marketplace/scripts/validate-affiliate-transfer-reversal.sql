\set ON_ERROR_STOP on
BEGIN;

SELECT
  t.id AS test_transfer_id,
  receiver.cliente_id AS receiver_client_id,
  t.status AS original_status,
  sender_client.saldo_carteira AS sender_balance_before,
  receiver_client.saldo_carteira AS receiver_balance_before
FROM public.gsa_afiliado_transferencias t
JOIN public.gsa_afiliados receiver ON receiver.id = t.destinatario_afiliado_id
JOIN public.gsa_afiliados sender ON sender.id = t.remetente_afiliado_id
JOIN public.clientes receiver_client ON receiver_client.id = receiver.cliente_id
JOIN public.clientes sender_client ON sender_client.id = sender.cliente_id
WHERE t.status = 'concluida'
  AND receiver_client.saldo_carteira >= t.valor
  AND public.gsa_affiliate_available_balance(receiver.id) >= t.valor
ORDER BY t.concluida_em DESC
LIMIT 1
\gset

SELECT
  session->>'sessao_id' AS test_session_id,
  session->>'session_token' AS test_session_token
FROM (
  SELECT public.gsa_create_session_internal(
    'cliente', :'receiver_client_id'::uuid, 'Validacao de estorno', '{}'::jsonb
  ) AS session
) created_session
\gset

SELECT public.gsa_client_reverse_received_affiliate_transfer(
  :'test_session_id'::uuid,
  :'test_session_token',
  :'test_transfer_id'::uuid
)->>'status' = 'estornada' AS reversal_succeeded;

SELECT status = 'estornada' AS status_was_updated
FROM public.gsa_afiliado_transferencias
WHERE id = :'test_transfer_id'::uuid;

ROLLBACK;

SELECT status = :'original_status' AS rollback_preserved_original_status
FROM public.gsa_afiliado_transferencias
WHERE id = :'test_transfer_id'::uuid;

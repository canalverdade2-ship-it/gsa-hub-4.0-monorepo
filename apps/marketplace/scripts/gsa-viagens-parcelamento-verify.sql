-- Auditoria não destrutiva do parcelamento do checkout de viagens.

DO $audit$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'viagens_transacoes'
      AND column_name = 'parcelas'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Coluna viagens_transacoes.parcelas ausente ou incompatível.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'viagens_transacoes'
      AND column_name = 'valor_parcela'
  ) THEN
    RAISE EXCEPTION 'Coluna viagens_transacoes.valor_parcela ausente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'faturas'
      AND column_name = 'metadata'
      AND udt_name = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'Coluna faturas.metadata ausente ou incompatível.';
  END IF;

  IF to_regprocedure('public.gsa_client_checkout_travel(uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RPC gsa_client_checkout_travel ausente.';
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
    RAISE EXCEPTION 'Permissões da RPC de checkout de viagens incorretas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_faturas_viagem_transacao_metadata'
  ) THEN
    RAISE EXCEPTION 'Índice de faturas por transação ausente.';
  END IF;
END;
$audit$;

DO $invoice_contract$
DECLARE
  v_cliente_id UUID;
  v_fatura_id UUID;
BEGIN
  SELECT id
    INTO v_cliente_id
  FROM public.clientes
  ORDER BY id
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Não existe cliente para validar o contrato de faturas.';
  END IF;

  INSERT INTO public.faturas (
    cliente_id,
    valor_total,
    status,
    data_vencimento,
    tipo,
    metadata
  ) VALUES (
    v_cliente_id,
    1.00,
    'pendente',
    CURRENT_DATE,
    'compra_viagem',
    jsonb_build_object(
      'audit', TRUE,
      'parcela_numero', 1,
      'parcelas_total', 2,
      'valor_total_contrato', 2.00
    )
  )
  RETURNING id INTO v_fatura_id;

  DELETE FROM public.faturas WHERE id = v_fatura_id;
END;
$invoice_contract$;

SELECT
  'gsa_viagens_parcelamento' AS module,
  true AS transaction_installments_ready,
  true AS invoice_metadata_ready,
  true AS invoice_insert_contract_ready,
  true AS installment_invoices_ready,
  true AS checkout_rpc_ready;

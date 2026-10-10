DO $$
DECLARE
  v_name text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'fornecedores',
    'fornecedor_produtos',
    'fornecedor_produto_solicitacoes',
    'pedidos_compra_fornecedor',
    'pedido_compra_fornecedor_itens',
    'fornecedor_entregas',
    'fornecedor_entrega_itens',
    'contas_pagar',
    'fornecedor_auditoria',
    'fornecedor_notificacoes'
  ] LOOP
    IF to_regclass('public.' || v_name) IS NULL THEN
      v_missing := array_append(v_missing, 'table:' || v_name);
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'gsa_public_register_supplier',
    'gsa_supplier_session_access_state',
    'gsa_supplier_dashboard_snapshot',
    'gsa_supplier_update_profile',
    'gsa_supplier_request_product',
    'gsa_supplier_mark_order_seen',
    'gsa_supplier_mark_notification_read',
    'gsa_supplier_mark_notifications_read',
    'gsa_supplier_submit_delivery',
    'gsa_admin_supplier_snapshot',
    'gsa_admin_supplier_set_status',
    'gsa_admin_review_supplier_product',
    'gsa_admin_create_supplier_order',
    'gsa_admin_review_supplier_delivery',
    'gsa_admin_update_supplier_payable'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      v_missing := array_append(v_missing, 'function:' || v_name);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'documentos_fornecedor'
      AND public = false
      AND file_size_limit = 10485760
  ) THEN
    v_missing := array_append(v_missing, 'bucket:documentos_fornecedor');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[
        'fornecedores', 'fornecedor_produtos', 'fornecedor_produto_solicitacoes',
        'pedidos_compra_fornecedor', 'pedido_compra_fornecedor_itens',
        'fornecedor_entregas', 'fornecedor_entrega_itens', 'contas_pagar',
        'fornecedor_auditoria', 'fornecedor_notificacoes'
      ])
      AND NOT c.relrowsecurity
  ) THEN
    v_missing := array_append(v_missing, 'security:rls_disabled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'loja_estoque_historico'
      AND column_name = 'entrega_fornecedor_id'
  ) THEN
    v_missing := array_append(v_missing, 'column:loja_estoque_historico.entrega_fornecedor_id');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'supplier_documents_select'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'supplier_documents_insert'
  ) THEN
    v_missing := array_append(v_missing, 'security:supplier_storage_policies');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Supplier production verification failed: %', array_to_string(v_missing, ', ');
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'fornecedores','fornecedor_produtos','fornecedor_produto_solicitacoes',
    'pedidos_compra_fornecedor','pedido_compra_fornecedor_itens','fornecedor_entregas',
    'fornecedor_entrega_itens','contas_pagar','fornecedor_auditoria','fornecedor_notificacoes',
    'produto_fornecedor_config','produtos_fornecedores_config'
  ] LOOP
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION 'Supplier security verification failed: anon privilege on %', v_table;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='Allow All Access' AND tablename = ANY(ARRAY['fornecedores','fornecedor_produtos','fornecedor_produto_solicitacoes','pedidos_compra_fornecedor','pedido_compra_fornecedor_itens','fornecedor_entregas','fornecedor_entrega_itens','contas_pagar','fornecedor_auditoria','fornecedor_notificacoes','produto_fornecedor_config','produtos_fornecedores_config'])) THEN
    RAISE EXCEPTION 'Supplier security verification failed: permissive policy remains';
  END IF;

  IF has_function_privilege('anon','public.gsa_supplier_dashboard_snapshot()','EXECUTE')
     OR has_function_privilege('anon','public.gsa_supplier_submit_delivery(uuid,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Supplier security verification failed: supplier RPC exposed to anon';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'status', 'ok',
  'module', 'supplier',
  'tables', 10,
  'bucket', 'documentos_fornecedor',
  'verified_at', now()
) AS supplier_production_verification;

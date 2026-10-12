-- Schema-only contract fixture captured through Actions on 2026-10-12.
-- Not a deployable migration. No production rows are included.
 gsa_admin_atualizar_solicitacao_loja(uuid, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_atualizar_solicitacao_loja(p_sessao_id uuid, p_session_token text, p_solicitacao_id uuid, p_novo_status text, p_resposta_admin text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor record;
  v_sol loja_solicitacoes%rowtype;
  v_orc orcamentos%rowtype;
  v_cliente clientes%rowtype;
  v_status text := lower(trim(coalesce(p_novo_status, '')));
  v_status_to_save text;
  v_historico jsonb;
  v_diff numeric;
  v_codigo_fatura text;
  v_fatura_id uuid;
  v_tem_fatura_credito boolean := false;
  v_limite_disponivel_novo numeric;
  v_canceladas integer := 0;
BEGIN
  IF v_status NOT IN ('em_analise', 'aprovado', 'rejeitado', 'concluido') THEN
    RAISE EXCEPTION 'Status de solicitacao de loja invalido.';
  END IF;

  SELECT * INTO v_actor FROM public.gsa_admin_session_actor(p_sessao_id, p_session_token) LIMIT 1;

  SELECT * INTO v_sol
  FROM public.loja_solicitacoes
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao de loja nao encontrada.';
  END IF;

  v_status_to_save := v_status;
  v_diff := round(coalesce(v_sol.valor_diferenca, 0), 2);

  IF v_status = 'aprovado' AND v_diff = 0 THEN
    v_status_to_save := 'aguardando_instrucoes';
  END IF;

  IF v_sol.status = v_status_to_save THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'solicitacao_id', p_solicitacao_id,
      'cliente_id', v_sol.cliente_id,
      'status', v_sol.status,
      'codigo_solicitacao', v_sol.codigo_solicitacao,
      'valor_diferenca', v_diff,
      'fatura_diferenca_id', NULL,
      'credito_estornado', false,
      'codigo_orcamento', NULL,
      'total_orcamento', 0,
      'faturas_credito_canceladas', 0
    );
  END IF;

  v_historico := coalesce(v_sol.historico_status::jsonb, '{}'::jsonb) || jsonb_build_object(v_status_to_save, now());

  UPDATE public.loja_solicitacoes
     SET status = v_status_to_save,
         historico_status = v_historico,
         resposta_admin = coalesce(nullif(trim(coalesce(p_resposta_admin, '')), ''), v_sol.resposta_admin),
         updated_at = now()
   WHERE id = p_solicitacao_id;

  IF v_status = 'aprovado' AND v_diff > 0 THEN
    v_codigo_fatura := 'FAT-TROCA-' || coalesce(v_sol.codigo_solicitacao, p_solicitacao_id::text);

    SELECT id INTO v_fatura_id
    FROM public.faturas
    WHERE codigo_fatura = v_codigo_fatura
    LIMIT 1;

    IF v_fatura_id IS NULL THEN
      INSERT INTO public.faturas(
        codigo_fatura,
        cliente_id,
        valor_total,
        valor_final_pendente,
        valor_base_original,
        status,
        tipo,
        gerada_automaticamente,
        is_amortizacao_credito,
        data_vencimento,
        itens_faturados
      )
      VALUES (
        v_codigo_fatura,
        v_sol.cliente_id,
        v_diff,
        v_diff,
        v_diff,
        'pendente',
        'produto',
        true,
        false,
        current_date + 2,
        jsonb_build_array(jsonb_build_object(
          'codigo', 'DIF-' || coalesce(v_sol.codigo_solicitacao, p_solicitacao_id::text),
          'descricao', 'Diferenca de valor na troca de produto (Ref. Solicitacao #' || coalesce(v_sol.codigo_solicitacao, p_solicitacao_id::text) || ')',
          'valor_unitario', v_diff,
          'quantidade', 1,
          'subtotal', v_diff,
          'tipo', 'produto'
        ))
      )
      RETURNING id INTO v_fatura_id;
    END IF;
  END IF;

  IF v_status = 'aprovado' AND v_sol.orcamento_origem_id IS NOT NULL THEN
    SELECT * INTO v_orc
    FROM public.orcamentos
    WHERE id = v_sol.orcamento_origem_id
    FOR UPDATE;

    IF FOUND THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.faturas
        WHERE cliente_id = v_sol.cliente_id
          AND is_amortizacao_credito = true
          AND itens_faturados @> jsonb_build_array(jsonb_build_object('codigo', 'CRE-' || v_orc.codigo_orcamento))
      ) INTO v_tem_fatura_credito;

      IF v_tem_fatura_credito THEN
        SELECT * INTO v_cliente
        FROM public.clientes
        WHERE id = v_sol.cliente_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Cliente da solicitacao nao encontrado.';
        END IF;

        v_limite_disponivel_novo := coalesce(v_cliente.limite_credito_disponivel, 0) + coalesce(v_orc.total, 0);

        UPDATE public.clientes
           SET limite_credito_disponivel = v_limite_disponivel_novo,
               updated_at = now()
         WHERE id = v_sol.cliente_id;

        UPDATE public.faturas
           SET status = 'cancelado',
               motivo_cancelamento = 'Estornado devido a aprovacao da devolucao/troca #' || coalesce(v_sol.codigo_solicitacao, p_solicitacao_id::text),
               data_cancelamento = now()
         WHERE cliente_id = v_sol.cliente_id
           AND is_amortizacao_credito = true
           AND itens_faturados @> jsonb_build_array(jsonb_build_object('codigo', 'CRE-' || v_orc.codigo_orcamento))
           AND status <> 'pago';

        GET DIAGNOSTICS v_canceladas = ROW_COUNT;

        INSERT INTO public.loja_credito_movimentacoes(
          cliente_id,
          tipo,
          valor,
          limite_total_anterior,
          limite_total_novo,
          limite_disponivel_anterior,
          limite_disponivel_novo,
          descricao
        )
        VALUES (
          v_sol.cliente_id,
          'estorno_compra',
          coalesce(v_orc.total, 0),
          coalesce(v_cliente.limite_credito_total, 0),
          coalesce(v_cliente.limite_credito_total, 0),
          coalesce(v_cliente.limite_credito_disponivel, 0),
          v_limite_disponivel_novo,
          'Estorno por Devolucao/Troca Aprovada (Orcamento #' || coalesce(v_orc.codigo_orcamento, v_sol.orcamento_origem_id::text) || ') [POR: ' || v_actor.ator_nome || ']'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'solicitacao_id', p_solicitacao_id,
    'cliente_id', v_sol.cliente_id,
    'status', v_status_to_save,
    'codigo_solicitacao', v_sol.codigo_solicitacao,
    'valor_diferenca', v_diff,
    'fatura_diferenca_id', v_fatura_id,
    'credito_estornado', v_tem_fatura_credito,
    'codigo_orcamento', CASE WHEN v_orc.id IS NOT NULL THEN v_orc.codigo_orcamento ELSE NULL END,
    'total_orcamento', CASE WHEN v_orc.id IS NOT NULL THEN coalesce(v_orc.total, 0) ELSE 0 END,
    'faturas_credito_canceladas', v_canceladas
  );
END;
$$;


--
-- Name: gsa_admin_cancel_store_order(uuid, text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_cancel_store_order(p_sessao_id uuid, p_session_token text, p_request_id uuid, p_ordem_compra_id uuid, p_motivo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor RECORD;
  v_existing JSONB;
  v_ordem public.ordens_compra%ROWTYPE;
  v_item public.ordens_compra%ROWTYPE;
  v_orcamento public.orcamentos%ROWTYPE;
  v_codigo TEXT;
  v_points NUMERIC := 0;
  v_wallet NUMERIC := 0;
  v_paid NUMERIC := 0;
  v_credit BOOLEAN := false;
  v_refund_created BOOLEAN := false;
  v_result JSONB;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_require_admin_actor(p_sessao_id, p_session_token);
  SELECT result INTO v_existing FROM public.gsa_admin_operation_requests WHERE request_id = p_request_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing || jsonb_build_object('already_processed', true); END IF;
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'O motivo do cancelamento é obrigatório.'; END IF;

  SELECT * INTO v_ordem FROM public.ordens_compra WHERE id = p_ordem_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de compra não encontrada.'; END IF;
  IF v_ordem.status = 'cancelado' THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true, 'ordem_id', p_ordem_compra_id);
  END IF;

  IF v_ordem.orcamento_id IS NOT NULL THEN
    SELECT * INTO v_orcamento FROM public.orcamentos WHERE id = v_ordem.orcamento_id FOR UPDATE;
    v_codigo := v_orcamento.codigo_orcamento;
  ELSE
    v_codigo := v_ordem.codigo_ordem;
  END IF;

  FOR v_item IN
    SELECT * FROM public.ordens_compra
    WHERE id = p_ordem_compra_id OR (v_ordem.orcamento_id IS NOT NULL AND orcamento_id = v_ordem.orcamento_id)
    FOR UPDATE
  LOOP
    IF v_item.status <> 'cancelado' AND v_item.estoque_estornado_em IS NULL THEN
      UPDATE public.produtos
      SET estoque_disponivel = COALESCE(estoque_disponivel, 0) + COALESCE(v_item.quantidade, 1)
      WHERE id = v_item.produto_id AND COALESCE(controle_estoque, false);

      IF FOUND THEN
        INSERT INTO public.loja_estoque_historico(
          produto_id, quantidade_anterior, ajuste, quantidade_atual, motivo, colaborador_nome
        )
        SELECT p.id,
               COALESCE(p.estoque_disponivel, 0) - COALESCE(v_item.quantidade, 1),
               COALESCE(v_item.quantidade, 1),
               COALESCE(p.estoque_disponivel, 0),
               format('Estorno do pedido %s: %s', v_codigo, BTRIM(p_motivo)),
               COALESCE(v_actor.actor_type, 'admin')
        FROM public.produtos p WHERE p.id = v_item.produto_id;
      END IF;
    END IF;
  END LOOP;

  IF v_codigo IS NOT NULL THEN
    SELECT COALESCE(SUM(ABS(pontos)), 0) INTO v_points
    FROM public.points_transactions
    WHERE cliente_id = v_ordem.cliente_id
      AND tipo = 'resgate'
      AND pontos < 0
      AND descricao LIKE '%' || v_codigo || '%';

    IF v_points = 0 THEN
      SELECT COALESCE(SUM(ABS(pontos)), 0) INTO v_points
      FROM public.pontos_movimentacoes
      WHERE cliente_id = v_ordem.cliente_id
        AND tipo = 'uso_fatura'
        AND pontos < 0
        AND descricao LIKE '%' || v_codigo || '%';
    END IF;
  END IF;

  IF v_points > 0 THEN
    UPDATE public.clientes SET saldo_pontos = COALESCE(saldo_pontos, 0) + v_points WHERE id = v_ordem.cliente_id;
    INSERT INTO public.points_transactions(cliente_id, tipo, pontos, descricao)
    VALUES (v_ordem.cliente_id, 'estorno', v_points, format('Estorno do pedido %s', v_codigo));
    INSERT INTO public.pontos_movimentacoes(cliente_id, tipo, pontos, saldo_apos, descricao)
    SELECT id, 'estorno', v_points, saldo_pontos, format('Estorno do pedido %s', v_codigo)
    FROM public.clientes WHERE id = v_ordem.cliente_id;
  END IF;

  SELECT COALESCE(SUM(COALESCE(abatimento_carteira_aplicado, 0)), 0),
         COALESCE(SUM(CASE WHEN status = 'pago' THEN COALESCE(NULLIF(valor_pago, 0), valor_total) ELSE 0 END), 0)
  INTO v_wallet, v_paid
  FROM public.faturas
  WHERE ordem_compra_id IN (
    SELECT id FROM public.ordens_compra
    WHERE id = p_ordem_compra_id OR (v_ordem.orcamento_id IS NOT NULL AND orcamento_id = v_ordem.orcamento_id)
  );

  IF v_wallet > 0 THEN
    UPDATE public.clientes SET saldo_carteira = COALESCE(saldo_carteira, 0) + v_wallet WHERE id = v_ordem.cliente_id;
  END IF;

  IF v_codigo IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.faturas f
      WHERE f.cliente_id = v_ordem.cliente_id
        AND COALESCE(f.is_amortizacao_credito, false)
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(f.itens_faturados, '[]'::jsonb)) item
          WHERE item->>'codigo' = 'CRE-' || v_codigo
        )
    ) INTO v_credit;
  END IF;

  IF v_credit AND v_ordem.orcamento_id IS NOT NULL THEN
    UPDATE public.clientes
    SET limite_credito_disponivel = LEAST(
      COALESCE(limite_credito_total, 0),
      COALESCE(limite_credito_disponivel, 0) + COALESCE(v_orcamento.total, 0)
    )
    WHERE id = v_ordem.cliente_id;

    UPDATE public.faturas f
    SET status = 'cancelado',
        valor_final_pendente = 0,
        motivo_cancelamento = format('Cancelada pelo estorno da compra %s', v_codigo),
        data_cancelamento = NOW()
    WHERE f.cliente_id = v_ordem.cliente_id
      AND f.status <> 'pago'
      AND COALESCE(f.is_amortizacao_credito, false)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(f.itens_faturados, '[]'::jsonb)) item
        WHERE item->>'codigo' = 'CRE-' || v_codigo
      );
  END IF;

  UPDATE public.faturas
  SET status = 'cancelado',
      valor_final_pendente = 0,
      motivo_cancelamento = format('Compra cancelada: %s', BTRIM(p_motivo)),
      data_cancelamento = NOW()
  WHERE ordem_compra_id IN (
    SELECT id FROM public.ordens_compra
    WHERE id = p_ordem_compra_id OR (v_ordem.orcamento_id IS NOT NULL AND orcamento_id = v_ordem.orcamento_id)
  )
  AND status <> 'pago';

  IF v_paid > 0 AND NOT EXISTS (
    SELECT 1 FROM public.loja_reembolsos
    WHERE ordem_compra_id = p_ordem_compra_id AND status IN ('pendente', 'processando', 'pago')
  ) THEN
    INSERT INTO public.loja_reembolsos(
      ordem_compra_id, cliente_id, valor_reembolso, motivo_cancelamento, prazo_pagamento, status
    ) VALUES (
      p_ordem_compra_id, v_ordem.cliente_id, v_paid, BTRIM(p_motivo), NOW() + INTERVAL '10 days', 'pendente'
    );
    v_refund_created := true;
  END IF;

  UPDATE public.ordens_compra
  SET status = 'cancelado',
      motivo_cancelamento = BTRIM(p_motivo),
      estoque_estornado_em = COALESCE(estoque_estornado_em, NOW()),
      data_conclusao = NULL
  WHERE id = p_ordem_compra_id
     OR (v_ordem.orcamento_id IS NOT NULL AND orcamento_id = v_ordem.orcamento_id);

  IF v_ordem.orcamento_id IS NOT NULL THEN
    UPDATE public.orcamentos
    SET status = 'cancelado', status_entrega = 'cancelado'
    WHERE id = v_ordem.orcamento_id;

    BEGIN
      PERFORM public.gsa_admin_release_discount_quota(
        p_sessao_id,
        p_session_token,
        v_ordem.orcamento_id
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END IF;

  INSERT INTO public.notificacoes(cliente_id, destinatario_tipo, titulo, mensagem, modulo, tipo, lida, data_criacao)
  VALUES (
    v_ordem.cliente_id, 'cliente', 'Compra cancelada',
    CASE WHEN v_refund_created
      THEN format('A compra %s foi cancelada e um reembolso foi aberto.', v_codigo)
      ELSE format('A compra %s foi cancelada e os saldos aplicáveis foram restaurados.', v_codigo)
    END,
    'produtos', 'ordem_cancelada', false, NOW()
  );

  v_result := jsonb_build_object(
    'success', true,
    'ordem_id', p_ordem_compra_id,
    'orcamento_id', v_ordem.orcamento_id,
    'points_refunded', v_points,
    'wallet_refunded', v_wallet,
    'refund_created', v_refund_created,
    'refund_value', v_paid,
    'credit_restored', v_credit
  );
  INSERT INTO public.gsa_admin_operation_requests(request_id, actor_id, actor_type, operation, resource_id, result)
  VALUES (p_request_id, v_actor.actor_id, v_actor.actor_type, 'cancel_store_order', p_ordem_compra_id, v_result);
  RETURN v_result;
END;
$$;


--
-- Name: gsa_admin_credit_withdrawal_details(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_credit_withdrawal_details(p_sessao_id uuid, p_session_token text, p_saque_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_data jsonb; v_events jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_admin_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT to_jsonb(s)||jsonb_build_object('cliente_nome',c.nome,'cliente_email',c.email,'cliente_telefone',c.telefone,
    'cliente_data_cadastro',c.data_cadastro,'limite_total_atual',COALESCE(c.limite_credito_total,0),'limite_disponivel_atual',COALESCE(c.limite_credito_disponivel,0),
    'limite_bloqueado_atual',COALESCE(c.limite_credito_bloqueado,0)) INTO v_data
  FROM public.loja_credito_saques s JOIN public.clientes c ON c.id=s.cliente_id WHERE s.id=p_saque_id;
  IF v_data IS NULL THEN RAISE EXCEPTION 'Solicitação de saque não encontrada.' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.ocorrido_em,e.id),'[]'::jsonb) INTO v_events
  FROM public.loja_credito_saque_eventos e WHERE e.saque_id=p_saque_id;
  RETURN v_data||jsonb_build_object('eventos',v_events);
END;
$$;


--
-- Name: gsa_admin_credit_withdrawals(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_credit_withdrawals(p_sessao_id uuid, p_session_token text, p_status text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_admin_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(s)||jsonb_build_object('cliente_nome',c.nome,'cliente_email',c.email,'cliente_telefone',c.telefone,
    'cliente_data_cadastro',c.data_cadastro,'limite_total_atual',COALESCE(c.limite_credito_total,0),'limite_disponivel_atual',COALESCE(c.limite_credito_disponivel,0),
    'limite_bloqueado_atual',COALESCE(c.limite_credito_bloqueado,0)) ORDER BY s.created_at DESC),'[]'::jsonb) INTO v_result
  FROM public.loja_credito_saques s JOIN public.clientes c ON c.id=s.cliente_id WHERE p_status IS NULL OR s.status=p_status;
  RETURN v_result;
END;
$$;


--
-- Name: gsa_admin_decide_credit_withdrawal(uuid, text, uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_decide_credit_withdrawal(p_sessao_id uuid, p_session_token text, p_saque_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_req public.loja_credito_saques%rowtype; v_reason text:=trim(COALESCE(p_motivo,''));
BEGIN
  SELECT * INTO v_actor FROM public.gsa_admin_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT * INTO v_req FROM public.loja_credito_saques WHERE id=p_saque_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Solicitação de saque não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_req.status IN ('aprovado','recusado','liberado') THEN RETURN jsonb_build_object('success',true,'idempotent',true,'status',v_req.status); END IF;
  IF v_req.status NOT IN ('em_analise','analise_reforcada') THEN RAISE EXCEPTION 'A solicitação ainda não está pronta para decisão.' USING ERRCODE='22023'; END IF;
  IF v_req.documento_foto IS NULL OR v_req.comprovante_endereco IS NULL THEN RAISE EXCEPTION 'Os documentos obrigatórios ainda não foram enviados.' USING ERRCODE='22023'; END IF;  PERFORM set_config('gsa.system_override','on',true);
  IF NOT p_aprovar THEN
    IF length(v_reason)<5 THEN RAISE EXCEPTION 'Informe o motivo da não aprovação.' USING ERRCODE='22023'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('gsa-store-credit:'||v_req.cliente_id::text,0));
    PERFORM set_config('gsa.credit_release','on',true);
    UPDATE public.clientes SET limite_credito_bloqueado=greatest(round(COALESCE(limite_credito_bloqueado,0)-v_req.valor_bloqueado,2),0) WHERE id=v_req.cliente_id;
    UPDATE public.loja_credito_saques SET status='recusado',valor_bloqueado=0,motivo_decisao=left(v_reason,2000),
      analisado_por=v_actor.ator_id,analisado_por_tipo=v_actor.ator_tipo,analisado_por_nome=v_actor.ator_nome,analisado_em=now(),updated_at=now() WHERE id=v_req.id;
    INSERT INTO public.loja_credito_saque_eventos(saque_id,tipo,titulo,descricao,ator_tipo,ator_id,ator_nome)
    VALUES(v_req.id,'recusa','Saque não aprovado',left(v_reason,2000),v_actor.ator_tipo,v_actor.ator_id,v_actor.ator_nome);
    INSERT INTO public.notificacoes(cliente_id,titulo,mensagem,modulo,tab,item_id,destinatario_tipo,prioridade,acao_origem,contexto)
    VALUES(v_req.cliente_id,'Saque de crédito não aprovado',format('A solicitação %s foi analisada e não aprovada. Consulte o motivo no seu painel.',v_req.protocolo),
      'financeiro','credito',v_req.id::text,'cliente','alta','credito_saque_recusado',jsonb_build_object('saque_id',v_req.id,'protocolo',v_req.protocolo));
    RETURN jsonb_build_object('success',true,'status','recusado');
  END IF;
  UPDATE public.loja_credito_saques SET status='aprovado',motivo_decisao=NULLIF(left(v_reason,2000),''),
    analisado_por=v_actor.ator_id,analisado_por_tipo=v_actor.ator_tipo,analisado_por_nome=v_actor.ator_nome,analisado_em=now(),aprovado_em=now(),updated_at=now() WHERE id=v_req.id;
  INSERT INTO public.loja_credito_saque_eventos(saque_id,tipo,titulo,descricao,ator_tipo,ator_id,ator_nome)
  VALUES(v_req.id,'aprovacao','Saque aprovado para liberação','A análise foi concluída. O valor permanece reservado até a confirmação do pagamento via PIX.',v_actor.ator_tipo,v_actor.ator_id,v_actor.ator_nome);
  INSERT INTO public.notificacoes(cliente_id,titulo,mensagem,modulo,tab,item_id,destinatario_tipo,prioridade,acao_origem,contexto)
  VALUES(v_req.cliente_id,'Saque aprovado para liberação',format('A solicitação %s foi aprovada. O sistema está aguardando a confirmação da liberação via PIX.',v_req.protocolo),
    'financeiro','credito',v_req.id::text,'cliente','alta','credito_saque_aprovado',jsonb_build_object('saque_id',v_req.id,'protocolo',v_req.protocolo));
  RETURN jsonb_build_object('success',true,'status','aprovado');
END;
$$;


--
-- Name: gsa_admin_decide_partner_appeal(uuid, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_decide_partner_appeal(p_sessao_id uuid DEFAULT NULL::uuid, p_session_token text DEFAULT NULL::text, p_recurso_id uuid DEFAULT NULL::uuid, p_decisao text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_context jsonb;
  v_recurso public.parceiros_resgates_recursos%ROWTYPE;
  v_resgate public.parceiros_resgates%ROWTYPE;
  v_decisao text := lower(trim(COALESCE(p_decisao, '')));
  v_motivo text := nullif(trim(COALESCE(p_motivo, '')), '');
  v_actor_id uuid;
  v_first_name text;
BEGIN
  v_context := public.gsa_admin_validate_context(p_sessao_id, p_session_token);
  PERFORM public.gsa_admin_assert_module('parceiros');

  IF v_decisao NOT IN ('deferido', 'indeferido') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_decisao = 'indeferido' AND char_length(COALESCE(v_motivo, '')) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Informe o motivo da recusa do recurso.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_recurso
  FROM public.parceiros_resgates_recursos
  WHERE id = p_recurso_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurso não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_recurso.status <> 'em_analise' THEN
    RAISE EXCEPTION 'Este recurso já foi analisado.' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_resgate
  FROM public.parceiros_resgates
  WHERE id = v_recurso.resgate_id
  FOR UPDATE;

  BEGIN
    v_actor_id := NULLIF(COALESCE(v_context ->> 'ator_id', v_context ->> 'usuario_id', v_context ->> 'colaborador_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_actor_id := NULL;
  END;

  UPDATE public.parceiros_resgates_recursos
     SET status = v_decisao,
         motivo_decisao = v_motivo,
         analisado_em = now(),
         analisado_por = v_actor_id,
         updated_at = now()
   WHERE id = v_recurso.id
  RETURNING * INTO v_recurso;

  IF v_decisao = 'deferido' THEN
    UPDATE public.parceiros_resgates
       SET status = 'pendente',
           alerta_duplicidade = false,
           updated_at = now()
     WHERE id = v_resgate.id;

    INSERT INTO public.parceiros_resgates_eventos(
      resgate_id, recurso_id, tipo, titulo, descricao_publica, detalhes_privados,
      ator_tipo, ator_id, idempotency_key
    ) VALUES (
      v_resgate.id, v_recurso.id, 'recurso_deferido', 'Recurso aprovado',
      'O recurso foi aprovado e a solicitação voltou ao fluxo de andamento.',
      jsonb_build_object('motivo_decisao', v_motivo),
      CASE WHEN COALESCE(v_context ->> 'ator_tipo', '') = 'colaborador' THEN 'colaborador' ELSE 'admin' END,
      v_actor_id, 'appeal-approved:' || v_recurso.id::text
    );
  ELSE
    UPDATE public.parceiros_resgates
       SET updated_at = now()
     WHERE id = v_resgate.id;

    INSERT INTO public.parceiros_resgates_eventos(
      resgate_id, recurso_id, tipo, titulo, descricao_publica, detalhes_privados,
      ator_tipo, ator_id, idempotency_key
    ) VALUES (
      v_resgate.id, v_recurso.id, 'recurso_indeferido', 'Recurso recusado',
      v_motivo,
      jsonb_build_object('motivo_decisao', v_motivo),
      CASE WHEN COALESCE(v_context ->> 'ator_tipo', '') = 'colaborador' THEN 'colaborador' ELSE 'admin' END,
      v_actor_id, 'appeal-denied:' || v_recurso.id::text
    );
  END IF;

  v_first_name := split_part(trim(v_resgate.nome_completo), ' ', 1);
  INSERT INTO public.parceiros_resgates_notificacoes(
    resgate_id, recurso_id, tipo, telefone, mensagem, idempotency_key
  ) VALUES (
    v_resgate.id,
    v_recurso.id,
    CASE WHEN v_decisao = 'deferido' THEN 'recurso_aprovado_cliente' ELSE 'recurso_recusado_cliente' END,
    v_resgate.telefone,
    CASE WHEN v_decisao = 'deferido' THEN
      'Olá, *' || COALESCE(NULLIF(v_first_name, ''), 'Cliente') || '*.' || E'\n\n' ||
      'Seu recurso foi *aprovado*. A solicitação voltou ao fluxo de andamento.' || E'\n\n' ||
      'Protocolo: *' || v_resgate.codigo_gerado || '*'
    ELSE
      'Olá, *' || COALESCE(NULLIF(v_first_name, ''), 'Cliente') || '*.' || E'\n\n' ||
      'Seu recurso foi analisado e não pôde ser aprovado.' || E'\n\n' ||
      '*Motivo:* ' || v_motivo || E'\n\n' ||
      'Protocolo: *' || v_resgate.codigo_gerado || '*'
    END,
    'appeal-decision-client:' || v_recurso.id::text
  );

  PERFORM public.gsa_admin_write_audit(
    'parceiros',
    CASE WHEN v_decisao = 'deferido' THEN 'APROVAR_RECURSO_RESGATE' ELSE 'RECUSAR_RECURSO_RESGATE' END,
    'parceiros_resgates_recursos',
    v_recurso.id,
    jsonb_build_object(
      'resgate_id', v_resgate.id,
      'protocolo', v_resgate.codigo_gerado,
      'decisao', v_decisao,
      'motivo', v_motivo
    )
  );

  RETURN jsonb_build_object('success', true, 'appeal', to_jsonb(v_recurso));
END;
$$;


--
-- Name: gsa_admin_mark_credit_withdrawal_paid(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_admin_mark_credit_withdrawal_paid(p_sessao_id uuid, p_session_token text, p_saque_id uuid, p_referencia_pagamento text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE v_actor record; v_req public.loja_credito_saques%rowtype; v_client public.clientes%rowtype;
  v_ref text:=trim(COALESCE(p_referencia_pagamento,'')); v_limit_before numeric; v_limit_after numeric; v_fatura_id uuid; v_mov_id uuid; v_codigo text;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_admin_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  IF length(v_ref)<3 THEN RAISE EXCEPTION 'Informe a referência/comprovante do pagamento PIX.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_req FROM public.loja_credito_saques WHERE id=p_saque_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Solicitação de saque não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_req.status='liberado' THEN RETURN jsonb_build_object('success',true,'idempotent',true,'status','liberado','fatura_id',v_req.fatura_id); END IF;
  IF v_req.status<>'aprovado' THEN RAISE EXCEPTION 'O saque precisa estar aprovado antes da confirmação do PIX.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gsa-store-credit:'||v_req.cliente_id::text,0));
  SELECT * INTO v_client FROM public.clientes WHERE id=v_req.cliente_id FOR UPDATE;
  IF v_client.id IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_req.valor_bloqueado<=0 OR COALESCE(v_client.limite_credito_bloqueado,0)+0.001<v_req.valor_bloqueado THEN RAISE EXCEPTION 'A reserva financeira deste saque não está íntegra.' USING ERRCODE='22023'; END IF;
  IF COALESCE(v_client.limite_credito_disponivel,0)+0.001<v_req.valor_total_fatura THEN RAISE EXCEPTION 'O limite disponível não comporta mais esta liberação.' USING ERRCODE='22023'; END IF;
  PERFORM set_config('gsa.credit_release','on',true); PERFORM set_config('gsa.system_override','on',true);
  v_limit_before:=round(COALESCE(v_client.limite_credito_disponivel,0),2); v_limit_after:=round(v_limit_before-v_req.valor_total_fatura,2);
  UPDATE public.clientes SET limite_credito_disponivel=v_limit_after,
    limite_credito_bloqueado=greatest(round(COALESCE(limite_credito_bloqueado,0)-v_req.valor_bloqueado,2),0) WHERE id=v_req.cliente_id;
  INSERT INTO public.loja_credito_movimentacoes(cliente_id,tipo,valor,limite_total_anterior,limite_total_novo,limite_disponivel_anterior,limite_disponivel_novo,descricao)
  VALUES(v_req.cliente_id,'saque_credito',v_req.valor_total_fatura,COALESCE(v_client.limite_credito_total,0),COALESCE(v_client.limite_credito_total,0),
    v_limit_before,v_limit_after,format('Saque Crédito GSA %s - Valor R$ %s + taxa R$ %s',v_req.protocolo,to_char(v_req.valor_solicitado,'FM999G999G990D00'),to_char(v_req.taxa_calculada,'FM999G999G990D00')))
  RETURNING id INTO v_mov_id;
  v_codigo:='FAT-SAQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));  INSERT INTO public.faturas(
    codigo_fatura,cliente_id,valor_total,valor_final_pendente,valor_base_original,status,tipo,data_emissao,data_vencimento,
    gerada_automaticamente,is_amortizacao_credito,forma_pagamento_escolhida,itens_faturados,observacoes,metadata
  ) VALUES(
    v_codigo,v_req.cliente_id,v_req.valor_total_fatura,v_req.valor_total_fatura,v_req.valor_total_fatura,'pendente','avulsa',current_date,current_date+30,
    true,true,NULL,jsonb_build_array(
      jsonb_build_object('tipo','saque_credito','descricao','Saque de Crédito GSA','valor_unitario',v_req.valor_solicitado,'quantidade',1,'subtotal',v_req.valor_solicitado),
      jsonb_build_object('tipo','taxa_saque','descricao','Taxa de saque','valor_unitario',v_req.taxa_calculada,'quantidade',1,'subtotal',v_req.taxa_calculada)
    ),format('Fatura do saque de crédito %s. PIX confirmado pela referência %s.',v_req.protocolo,left(v_ref,120)),
    jsonb_build_object('origem','saque_credito','saque_id',v_req.id,'protocolo',v_req.protocolo,'valor_solicitado',v_req.valor_solicitado,
      'taxa_tipo',v_req.taxa_tipo,'taxa_config_valor',v_req.taxa_config_valor,'taxa_calculada',v_req.taxa_calculada,'referencia_pagamento',left(v_ref,500))
  ) RETURNING id INTO v_fatura_id;
  UPDATE public.loja_credito_saques SET status='liberado',valor_bloqueado=0,referencia_pagamento=left(v_ref,500),
    fatura_id=v_fatura_id,movimentacao_id=v_mov_id,liberado_em=now(),updated_at=now() WHERE id=v_req.id;
  INSERT INTO public.loja_credito_saque_eventos(saque_id,tipo,titulo,descricao,ator_tipo,ator_id,ator_nome,metadata)
  VALUES(v_req.id,'liberacao','Saque liberado e fatura gerada',format('O PIX de R$ %s foi confirmado. A fatura de R$ %s vence em 30 dias.',
    to_char(v_req.valor_solicitado,'FM999G999G990D00'),to_char(v_req.valor_total_fatura,'FM999G999G990D00')),v_actor.ator_tipo,v_actor.ator_id,v_actor.ator_nome,
    jsonb_build_object('fatura_id',v_fatura_id,'movimentacao_id',v_mov_id,'referencia_pagamento',left(v_ref,500)));
  INSERT INTO public.notificacoes(cliente_id,titulo,mensagem,modulo,tab,item_id,destinatario_tipo,prioridade,acao_origem,contexto)
  VALUES(v_req.cliente_id,'Saque de crédito liberado',format('O saque %s de R$ %s foi liberado via PIX. A fatura de R$ %s vence em %s.',v_req.protocolo,
    to_char(v_req.valor_solicitado,'FM999G999G990D00'),to_char(v_req.valor_total_fatura,'FM999G999G990D00'),to_char(current_date+30,'DD/MM/YYYY')),
    'financeiro','faturas',v_fatura_id::text,'cliente','alta','credito_saque_liberado',jsonb_build_object('saque_id',v_req.id,'fatura_id',v_fatura_id,'protocolo',v_req.protocolo));
  RETURN jsonb_build_object('success',true,'status','liberado','fatura_id',v_fatura_id,'movimentacao_id',v_mov_id,'data_vencimento',current_date+30);
END;
$_$;


--
-- Name: gsa_begin_partner_appeal_challenge(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_begin_partner_appeal_challenge(p_codigo text, p_challenge_id uuid, p_code_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_resgate public.parceiros_resgates%ROWTYPE;
BEGIN
  IF p_challenge_id IS NULL OR char_length(trim(COALESCE(p_code_hash, ''))) < 32 THEN
    RAISE EXCEPTION 'Desafio inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_resgate
  FROM public.parceiros_resgates
  WHERE upper(trim(codigo_gerado)) = upper(trim(COALESCE(p_codigo, '')))
  FOR UPDATE;

  IF NOT FOUND OR v_resgate.status <> 'recusado' THEN
    RETURN jsonb_build_object('success', false, 'eligible', false);
  END IF;

  IF EXISTS (SELECT 1 FROM public.parceiros_resgates_recursos WHERE resgate_id = v_resgate.id) THEN
    RETURN jsonb_build_object('success', false, 'eligible', false, 'already_used', true);
  END IF;

  DELETE FROM public.parceiros_resgates_recurso_desafios
  WHERE resgate_id = v_resgate.id AND consumed_at IS NULL;

  INSERT INTO public.parceiros_resgates_recurso_desafios(
    id, resgate_id, code_hash, expires_at
  ) VALUES (
    p_challenge_id, v_resgate.id, trim(p_code_hash), now() + interval '10 minutes'
  );

  RETURN jsonb_build_object(
    'success', true,
    'eligible', true,
    'resgate_id', v_resgate.id,
    'telefone', v_resgate.telefone,
    'nome_completo', v_resgate.nome_completo,
    'expires_in', 600
  );
END;
$$;


--
-- Name: gsa_claim_partner_appeal_notifications(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_claim_partner_appeal_notifications(p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rows jsonb;
BEGIN
  PERFORM public.gsa_schedule_partner_appeal_sla_notifications();

  WITH candidates AS (
    SELECT id
    FROM public.parceiros_resgates_notificacoes
    WHERE (
      status IN ('pendente', 'falhou')
      OR (status = 'processando' AND claimed_at < now() - interval '5 minutes')
    )
      AND available_at <= now()
      AND attempts < 6
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ), claimed AS (
    UPDATE public.parceiros_resgates_notificacoes n
       SET status = 'processando',
           attempts = n.attempts + 1,
           claimed_at = now(),
           updated_at = now()
      FROM candidates c
     WHERE n.id = c.id
    RETURNING n.id, n.telefone, n.mensagem, n.tipo, n.attempts
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
    INTO v_rows
    FROM claimed;

  RETURN v_rows;
END;
$$;


--
-- Name: gsa_client_cancel_credit_withdrawal(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_cancel_credit_withdrawal(p_sessao_id uuid, p_session_token text, p_saque_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_req public.loja_credito_saques%rowtype;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_client_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT * INTO v_req FROM public.loja_credito_saques WHERE id=p_saque_id AND cliente_id=v_actor.cliente_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Solicitação de saque não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_req.status='cancelado_cliente' THEN RETURN jsonb_build_object('success',true,'idempotent',true,'status','cancelado_cliente'); END IF;
  IF v_req.status NOT IN ('aguardando_documentos','em_analise','analise_reforcada') THEN RAISE EXCEPTION 'Esta solicitação não pode mais ser cancelada.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gsa-store-credit:'||v_actor.cliente_id::text,0));
  PERFORM set_config('gsa.credit_release','on',true); PERFORM set_config('gsa.system_override','on',true);
  UPDATE public.clientes SET limite_credito_bloqueado=greatest(round(COALESCE(limite_credito_bloqueado,0)-v_req.valor_bloqueado,2),0) WHERE id=v_actor.cliente_id;
  UPDATE public.loja_credito_saques SET status='cancelado_cliente',valor_bloqueado=0,updated_at=now() WHERE id=v_req.id;
  INSERT INTO public.loja_credito_saque_eventos(saque_id,tipo,titulo,descricao,ator_tipo,ator_id,ator_nome)
  VALUES(v_req.id,'cancelamento_cliente','Solicitação cancelada','O cliente cancelou o saque antes da liberação. A reserva do crédito foi removida.','cliente',v_actor.cliente_id,v_actor.cliente_nome);
  INSERT INTO public.notificacoes(cliente_id,titulo,mensagem,modulo,tab,item_id,destinatario_tipo,prioridade,acao_origem,contexto)
  VALUES(NULL,'Saque de crédito cancelado pelo cliente',format('A solicitação %s foi cancelada pelo cliente.',v_req.protocolo),'financeiro','saques_credito',v_req.id::text,'admin','normal','credito_saque_cancelado_cliente',jsonb_build_object('saque_id',v_req.id));
  RETURN jsonb_build_object('success',true,'idempotent',false,'status','cancelado_cliente');
END;
$$;


--
-- Name: gsa_client_cancel_store_order(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_cancel_store_order(p_sessao_id uuid, p_session_token text, p_orcamento_id uuid, p_motivo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_previous_status text;
  v_result jsonb;
BEGIN
  SELECT status INTO v_previous_status
  FROM public.orcamentos
  WHERE id = p_orcamento_id;

  -- O bypass vale somente para esta transação e somente dentro da RPC
  -- SECURITY DEFINER, depois que a função-base validar a sessão e a posse.
  PERFORM set_config('gsa.credit_release', 'on', true);
  PERFORM set_config('gsa.system_override', 'on', true);

  v_result := public.gsa_client_cancel_store_order_before_guard_fix_20260817(
    p_sessao_id, p_session_token, p_orcamento_id, p_motivo
  );

  IF COALESCE(v_previous_status, '') <> 'cancelado'
     AND COALESCE((v_result ->> 'already_cancelled')::boolean, false) IS FALSE THEN
    UPDATE public.produto_variantes variant
    SET estoque_disponivel = variant.estoque_disponivel + restored.quantity,
        updated_at = now()
    FROM (
      SELECT item.produto_variante_id,
             sum(COALESCE(item.quantidade, 1))::integer AS quantity
      FROM public.loja_pedido_itens item
      WHERE item.orcamento_id = p_orcamento_id
        AND item.tipo = 'produto'
        AND item.produto_variante_id IS NOT NULL
      GROUP BY item.produto_variante_id
    ) restored
    WHERE variant.id = restored.produto_variante_id
      AND COALESCE(variant.controle_estoque, false);
  END IF;

  RETURN v_result;
END;
$$;


--
-- Name: gsa_client_cancel_store_order_before_guard_fix_20260817(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_cancel_store_order_before_guard_fix_20260817(p_sessao_id uuid, p_session_token text, p_orcamento_id uuid, p_motivo text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor record;
  v_client public.clientes%rowtype;
  v_order public.orcamentos%rowtype;
  v_reason text := left(trim(coalesce(p_motivo, '')), 500);
  v_has_normalized_items boolean;
  v_has_paid_invoice boolean;
  v_paid_external numeric := 0;
  v_points_discount numeric := 0;
  v_points_to_restore integer := 0;
  v_wallet_to_restore numeric := 0;
  v_new_wallet numeric;
  v_new_points integer;
  v_limit_before numeric;
  v_limit_after numeric;
  v_first_purchase uuid;
  v_first_subscription uuid;
  v_refund_id uuid;
  v_refund_code text;
BEGIN
  IF length(v_reason) < 3 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;

  SELECT * INTO v_actor
  FROM public.gsa_client_session_actor(p_sessao_id, p_session_token)
  LIMIT 1;

  SELECT * INTO v_order
  FROM public.orcamentos
  WHERE id = p_orcamento_id
    AND cliente_id = v_actor.cliente_id
    AND origem_gsa_store IS TRUE
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido da GSA Store não encontrado.'; END IF;
  IF v_order.status = 'cancelado' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'orcamento_id', v_order.id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ordens_compra
    WHERE orcamento_id = p_orcamento_id AND status IN ('em_transporte', 'concluido')
  ) OR EXISTS (
    SELECT 1 FROM public.ordens_servico
    WHERE orcamento_id = p_orcamento_id AND status IN ('andamento', 'concluido')
  ) OR EXISTS (
    SELECT 1 FROM public.ordens_assinatura
    WHERE orcamento_id = p_orcamento_id AND status = 'concluido'
  ) THEN
    RAISE EXCEPTION 'Este pedido já está em execução ou entrega. Use o fluxo de troca, devolução ou suporte.';
  END IF;

  SELECT * INTO v_client FROM public.clientes WHERE id = v_actor.cliente_id FOR UPDATE;

  SELECT EXISTS(
    SELECT 1 FROM public.loja_pedido_itens WHERE orcamento_id = p_orcamento_id
  ) INTO v_has_normalized_items;

  IF v_has_normalized_items THEN
    UPDATE public.produtos p
    SET estoque_disponivel = p.estoque_disponivel + quantities.quantity
    FROM (
      SELECT item.produto_id, sum(item.quantidade)::integer AS quantity
      FROM public.loja_pedido_itens item
      WHERE item.orcamento_id = p_orcamento_id
        AND item.tipo = 'produto'
        AND item.produto_id IS NOT NULL
      GROUP BY item.produto_id
    ) AS quantities
    WHERE p.id = quantities.produto_id
      AND coalesce(p.controle_estoque, false);
  ELSE
    UPDATE public.produtos p
    SET estoque_disponivel = p.estoque_disponivel + quantities.quantity
    FROM (
      SELECT oc.produto_id, sum(coalesce(oc.quantidade, 1))::integer AS quantity
      FROM public.ordens_compra oc
      WHERE oc.orcamento_id = p_orcamento_id
      GROUP BY oc.produto_id
    ) AS quantities
    WHERE p.id = quantities.produto_id
      AND coalesce(p.controle_estoque, false);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.faturas f
    WHERE f.orcamento_id = p_orcamento_id AND f.status = 'pago'
  ) INTO v_has_paid_invoice;

  IF v_order.forma_pagamento_loja = 'credito_loja' AND v_has_paid_invoice THEN
    RAISE EXCEPTION 'Há parcela do Crédito GSA já paga. Solicite cancelamento e acerto pelo fluxo de suporte.';
  END IF;

  SELECT coalesce(sum(f.desconto_pontos_aplicado), 0),
         coalesce(sum(f.abatimento_carteira_aplicado), 0)
  INTO v_points_discount, v_wallet_to_restore
  FROM public.faturas f
  WHERE f.orcamento_id = p_orcamento_id
    AND f.status <> 'cancelado';

  v_points_discount := greatest(v_points_discount, coalesce(v_order.desconto_pontos, 0));
  v_wallet_to_restore := greatest(v_wallet_to_restore, coalesce(v_order.abatimento_carteira, 0));
  v_points_to_restore := round(v_points_discount * 100)::integer;

  IF v_points_to_restore > 0 THEN
    v_new_points := coalesce(v_client.saldo_pontos, 0) + v_points_to_restore;
    UPDATE public.clientes SET saldo_pontos = v_new_points WHERE id = v_actor.cliente_id;
    INSERT INTO public.pontos_movimentacoes(
      cliente_id, tipo, pontos, saldo_apos, descricao, valor_convertido
    ) VALUES (
      v_actor.cliente_id, 'estorno', v_points_to_restore, v_new_points,
      'Estorno de pontos do pedido cancelado #' || coalesce(v_order.codigo_orcamento, v_order.id::text),
      v_points_discount
    );
    INSERT INTO public.points_transactions(cliente_id, tipo, pontos, descricao)
    VALUES (
      v_actor.cliente_id, 'estorno', v_points_to_restore,
      'Estorno de pontos do pedido cancelado #' || coalesce(v_order.codigo_orcamento, v_order.id::text)
    );
  END IF;

  IF v_wallet_to_restore > 0 THEN
    v_new_wallet := round(coalesce(v_client.saldo_carteira, 0) + v_wallet_to_restore, 2);
    UPDATE public.clientes SET saldo_carteira = v_new_wallet WHERE id = v_actor.cliente_id;
    INSERT INTO public.carteira_lancamentos(cliente_id, valor, tipo, descricao)
    VALUES (
      v_actor.cliente_id, v_wallet_to_restore, 'credito',
      'Estorno do pedido cancelado #' || coalesce(v_order.codigo_orcamento, v_order.id::text)
    );
    INSERT INTO public.extrato_financeiro(
      cliente_id, tipo, valor, descricao, referencia_id, modulo_referencia, saldo_resultante
    ) VALUES (
      v_actor.cliente_id, 'entrada', v_wallet_to_restore,
      'Estorno do pedido cancelado #' || coalesce(v_order.codigo_orcamento, v_order.id::text),
      p_orcamento_id, 'gsa_store', v_new_wallet
    );
  END IF;

  IF v_order.forma_pagamento_loja = 'credito_loja' THEN
    v_limit_before := coalesce(v_client.limite_credito_disponivel, 0);
    v_limit_after := least(
      coalesce(v_client.limite_credito_total, 0),
      round(v_limit_before + coalesce(v_order.total, 0), 2)
    );
    UPDATE public.clientes SET limite_credito_disponivel = v_limit_after WHERE id = v_actor.cliente_id;
    INSERT INTO public.loja_credito_movimentacoes(
      cliente_id, tipo, valor,
      limite_total_anterior, limite_total_novo,
      limite_disponivel_anterior, limite_disponivel_novo, descricao
    ) VALUES (
      v_actor.cliente_id, 'estorno_compra', coalesce(v_order.total, 0),
      coalesce(v_client.limite_credito_total, 0), coalesce(v_client.limite_credito_total, 0),
      v_limit_before, v_limit_after,
      'Estorno do pedido cancelado #' || coalesce(v_order.codigo_orcamento, v_order.id::text)
    );
  END IF;

  SELECT coalesce(sum(p.valor), 0)
  INTO v_paid_external
  FROM public.pagamentos p
  JOIN public.faturas f ON f.id = p.fatura_id
  WHERE f.orcamento_id = p_orcamento_id
    AND p.metodo NOT IN ('carteira', 'pontos', 'voucher', 'indicacao');

  SELECT id INTO v_first_purchase FROM public.ordens_compra
  WHERE orcamento_id = p_orcamento_id ORDER BY data_criacao, id LIMIT 1;
  SELECT id INTO v_first_subscription FROM public.ordens_assinatura
  WHERE orcamento_id = p_orcamento_id ORDER BY data_criacao, id LIMIT 1;

  IF v_paid_external > 0 THEN
    v_refund_code := public.gsa_generate_code('REEMB');
    INSERT INTO public.loja_reembolsos(
      codigo_reembolso, ordem_compra_id, ordem_assinatura_id,
      cliente_id, valor_reembolso, motivo_cancelamento,
      prazo_pagamento, status
    ) VALUES (
      v_refund_code, v_first_purchase, v_first_subscription,
      v_actor.cliente_id, round(v_paid_external, 2), v_reason,
      now() + interval '3 days', 'pendente'
    ) RETURNING id INTO v_refund_id;
  END IF;

  UPDATE public.faturas
  SET status = 'cancelado', motivo_cancelamento = v_reason, data_cancelamento = now()
  WHERE orcamento_id = p_orcamento_id
    AND status <> 'cancelado';

  UPDATE public.ordens_compra
  SET status = 'cancelado', motivo_cancelamento = v_reason
  WHERE orcamento_id = p_orcamento_id;
  UPDATE public.ordens_assinatura
  SET status = 'cancelado', motivo_cancelamento = v_reason, data_cancelamento = now()
  WHERE orcamento_id = p_orcamento_id;
  UPDATE public.ordens_servico
  SET status = 'cancelado', motivo_cancelamento = v_reason, data_fim = now()
  WHERE orcamento_id = p_orcamento_id;
  UPDATE public.orcamentos
  SET status = 'cancelado', motivo_cancelamento = v_reason
  WHERE id = p_orcamento_id;

  IF v_order.cupom_desconto_id IS NOT NULL THEN
    UPDATE public.cupons_loja
    SET total_usos = greatest(total_usos - 1, 0),
        status = CASE
          WHEN status = 'usado'
           AND (data_validade IS NULL OR data_validade >= current_date)
           AND greatest(total_usos - 1, 0) < limite_usos
          THEN 'ativo' ELSE status END,
        updated_at = now()
    WHERE id = v_order.cupom_desconto_id;
  END IF;
  IF v_order.cupom_entrega_id IS NOT NULL
     AND v_order.cupom_entrega_id IS DISTINCT FROM v_order.cupom_desconto_id THEN
    UPDATE public.cupons_loja
    SET total_usos = greatest(total_usos - 1, 0),
        status = CASE
          WHEN status = 'usado'
           AND (data_validade IS NULL OR data_validade >= current_date)
           AND greatest(total_usos - 1, 0) < limite_usos
          THEN 'ativo' ELSE status END,
        updated_at = now()
    WHERE id = v_order.cupom_entrega_id;
  END IF;

  DELETE FROM public.promocoes_quantidade_uso WHERE orcamento_id = p_orcamento_id;

  INSERT INTO public.orcamento_timeline(
    orcamento_id, cliente_id, ator_id, ator_tipo, tipo, acao,
    status, titulo, descricao, metadata
  ) VALUES (
    p_orcamento_id, v_actor.cliente_id, v_actor.cliente_id, 'cliente',
    'pedido', 'cancelar', 'cancelado', 'Pedido cancelado',
    'Pedido cancelado pelo cliente. Motivo: ' || v_reason,
    jsonb_build_object('reembolso_id', v_refund_id, 'valor_reembolso', v_paid_external)
  );

  INSERT INTO public.notificacoes(
    cliente_id, titulo, mensagem, modulo, tab, item_id,
    destinatario_tipo, prioridade, acao_origem, contexto
  ) VALUES (
    v_actor.cliente_id, 'Pedido cancelado',
    'O pedido ' || coalesce(v_order.codigo_orcamento, v_order.id::text) || ' foi cancelado.',
    'gsa_store', 'compras', p_orcamento_id::text,
    'cliente', 'normal', 'cancelamento_pedido',
    jsonb_build_object('orcamento_id', p_orcamento_id, 'reembolso_id', v_refund_id)
  );

  INSERT INTO public.notificacoes(
    titulo, mensagem, modulo, tab, item_id,
    destinatario_tipo, prioridade, acao_origem, contexto
  ) VALUES (
    'Pedido cancelado pelo cliente',
    v_actor.cliente_nome || ' cancelou o pedido ' || coalesce(v_order.codigo_orcamento, v_order.id::text) || '.',
    'vendas', 'cancelados', p_orcamento_id::text,
    'admin', CASE WHEN v_paid_external > 0 THEN 'alta' ELSE 'normal' END,
    'cancelamento_pedido',
    jsonb_build_object('orcamento_id', p_orcamento_id, 'reembolso_id', v_refund_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_cancelled', false,
    'orcamento_id', p_orcamento_id,
    'reembolso_id', v_refund_id,
    'valor_reembolso', round(v_paid_external, 2),
    'pontos_estornados', v_points_to_restore,
    'carteira_estornada', v_wallet_to_restore,
    'credito_restaurado', CASE WHEN v_order.forma_pagamento_loja = 'credito_loja'
      THEN round(v_limit_after - v_limit_before, 2) ELSE 0 END
  );
END;
$$;


--
-- Name: gsa_client_create_credit_withdrawal(uuid, text, uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_create_credit_withdrawal(p_sessao_id uuid, p_session_token text, p_request_id uuid, p_valor numeric, p_pix_tipo text, p_pix_chave text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_client public.clientes%rowtype; v_existing public.loja_credito_saques%rowtype;
  v_fee jsonb; v_eff numeric; v_total numeric; v_taxa numeric; v_tipo text; v_cfg numeric; v_id uuid; v_protocol text;
  v_cad_ok boolean; v_cred_ok boolean; v_pix_tipo text:=lower(trim(COALESCE(p_pix_tipo,''))); v_pix text:=trim(COALESCE(p_pix_chave,''));
BEGIN
  SELECT * INTO v_actor FROM public.gsa_client_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Identificador da solicitação inválido.' USING ERRCODE='22023'; END IF;
  IF round(COALESCE(p_valor,0),2)<=0 THEN RAISE EXCEPTION 'Informe um valor de saque maior que zero.' USING ERRCODE='22023'; END IF;
  IF v_pix_tipo NOT IN ('cpf','cnpj','email','telefone','aleatoria') OR length(v_pix)<3 THEN RAISE EXCEPTION 'Informe uma chave PIX válida.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gsa-store-credit:'||v_actor.cliente_id::text,0));
  SELECT * INTO v_client FROM public.clientes WHERE id=v_actor.cliente_id FOR UPDATE;
  SELECT * INTO v_existing FROM public.loja_credito_saques WHERE id=p_request_id AND cliente_id=v_actor.cliente_id;
  IF v_existing.id IS NOT NULL THEN RETURN to_jsonb(v_existing)||jsonb_build_object('success',true,'idempotent',true); END IF;
  IF EXISTS(SELECT 1 FROM public.loja_credito_saques WHERE cliente_id=v_actor.cliente_id AND status IN ('aguardando_documentos','em_analise','analise_reforcada','aprovado')) THEN
    RAISE EXCEPTION 'Já existe uma solicitação de saque de crédito em andamento.' USING ERRCODE='23505';
  END IF;  v_eff:=greatest(round(COALESCE(v_client.limite_credito_disponivel,0)-COALESCE(v_client.limite_credito_bloqueado,0),2),0);
  IF v_eff<=0 THEN RAISE EXCEPTION 'Não há crédito disponível para solicitar saque.' USING ERRCODE='22023'; END IF;
  v_fee:=public.gsa_credit_withdrawal_fee(round(p_valor,2));
  v_total:=(v_fee->>'valor_total_fatura')::numeric; v_taxa:=(v_fee->>'taxa_calculada')::numeric;
  v_tipo:=v_fee->>'taxa_tipo'; v_cfg:=(v_fee->>'taxa_config_valor')::numeric;
  IF v_total>v_eff+0.001 THEN RAISE EXCEPTION 'O valor do saque somado à taxa ultrapassa o crédito disponível.' USING ERRCODE='22023'; END IF;
  v_cad_ok:=COALESCE(v_client.data_cadastro,now())<=now()-interval '30 days'; v_cred_ok:=v_eff>100;
  LOOP v_protocol:='SAQ-CRE-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,6));
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.loja_credito_saques WHERE protocolo=v_protocol); END LOOP;
  PERFORM set_config('gsa.credit_release','on',true); PERFORM set_config('gsa.system_override','on',true);
  UPDATE public.clientes SET limite_credito_bloqueado=round(COALESCE(limite_credito_bloqueado,0)+v_total,2) WHERE id=v_actor.cliente_id;
  INSERT INTO public.loja_credito_saques(
    id,protocolo,cliente_id,valor_solicitado,taxa_tipo,taxa_config_valor,taxa_calculada,valor_total_fatura,
    limite_disponivel_snapshot,valor_bloqueado,criterio_cadastro_30d_ok,criterio_credito_100_ok,analise_reforcada,pix_tipo,pix_chave
  ) VALUES(p_request_id,v_protocol,v_actor.cliente_id,round(p_valor,2),v_tipo,v_cfg,v_taxa,v_total,v_eff,v_total,v_cad_ok,v_cred_ok,NOT(v_cad_ok AND v_cred_ok),v_pix_tipo,v_pix)
  RETURNING id INTO v_id;
  INSERT INTO public.loja_credito_saque_eventos(saque_id,tipo,titulo,descricao,ator_tipo,ator_id,ator_nome,metadata)
  VALUES(v_id,'solicitacao','Solicitação registrada','O valor total da operação foi reservado no Crédito GSA e aguarda o envio dos documentos.','cliente',v_actor.cliente_id,v_actor.cliente_nome,
    jsonb_build_object('valor_solicitado',round(p_valor,2),'taxa',v_taxa,'valor_total_fatura',v_total,'analise_reforcada',NOT(v_cad_ok AND v_cred_ok)));
  INSERT INTO public.notificacoes(cliente_id,titulo,mensagem,modulo,tab,item_id,destinatario_tipo,prioridade,acao_origem,contexto)
  VALUES(v_actor.cliente_id,'Envie os documentos do saque de crédito',
    format('A solicitação %s foi registrada. Envie um documento oficial com foto e um comprovante de endereço para iniciar a análise.',v_protocol),
    'financeiro','credito',v_id::text,'cliente','alta','credito_saque_documentos_pendentes',jsonb_build_object('saque_id',v_id,'protocolo',v_protocol));
  RETURN jsonb_build_object('success',true,'idempotent',false,'id',v_id,'protocolo',v_protocol,'status','aguardando_documentos',
    'valor_solicitado',round(p_valor,2),'taxa_calculada',v_taxa,'valor_total_fatura',v_total,'analise_reforcada',NOT(v_cad_ok AND v_cred_ok));
END;
$$;


--
-- Name: gsa_client_credit_withdrawal_quote(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_credit_withdrawal_quote(p_sessao_id uuid, p_session_token text, p_valor numeric DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_client public.clientes%rowtype; v_fee jsonb; v_eff numeric; v_cfg numeric; v_max numeric; v_age integer;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_client_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT * INTO v_client FROM public.clientes WHERE id=v_actor.cliente_id;
  IF v_client.id IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE='P0002'; END IF;
  v_eff:=greatest(round(COALESCE(v_client.limite_credito_disponivel,0)-COALESCE(v_client.limite_credito_bloqueado,0),2),0);
  v_fee:=public.gsa_credit_withdrawal_fee(greatest(COALESCE(p_valor,0),0));
  v_cfg:=COALESCE((v_fee->>'taxa_config_valor')::numeric,0);
  v_max:=CASE WHEN v_fee->>'taxa_tipo'='fixa' THEN greatest(v_eff-v_cfg,0) ELSE CASE WHEN 100+v_cfg>0 THEN trunc(v_eff*100/(100+v_cfg),2) ELSE 0 END END;
  v_age:=greatest(floor(extract(epoch FROM (now()-COALESCE(v_client.data_cadastro,now())))/86400)::integer,0);  RETURN v_fee || jsonb_build_object(
    'credito_disponivel_efetivo',v_eff,'valor_maximo_saque',greatest(round(v_max,2),0),'dias_cadastro',v_age,
    'criterio_cadastro_30d_ok',COALESCE(v_client.data_cadastro,now())<=now()-interval '30 days',
    'criterio_credito_100_ok',v_eff>100,
    'analise_reforcada',NOT (COALESCE(v_client.data_cadastro,now())<=now()-interval '30 days' AND v_eff>100),
    'pode_solicitar',v_eff>0 AND COALESCE(p_valor,0)>0 AND (v_fee->>'valor_total_fatura')::numeric<=v_eff,
    'prazo_analise_horas',72,'prazo_fatura_dias',30
  );
END;
$$;


--
-- Name: gsa_client_credit_withdrawals(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_credit_withdrawals(p_sessao_id uuid, p_session_token text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_actor record; v_result jsonb;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_client_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(s)-'pix_chave'||jsonb_build_object('pix_chave_mascarada',
    CASE WHEN length(s.pix_chave)<=6 THEN '***' ELSE left(s.pix_chave,3)||'***'||right(s.pix_chave,3) END) ORDER BY s.created_at DESC),'[]'::jsonb)
  INTO v_result FROM public.loja_credito_saques s WHERE s.cliente_id=v_actor.cliente_id;
  RETURN v_result;
END;
$$;


--
-- Name: gsa_client_submit_credit_withdrawal_documents(uuid, text, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_client_submit_credit_withdrawal_documents(p_sessao_id uuid, p_session_token text, p_saque_id uuid, p_documento_foto jsonb, p_comprovante_endereco jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE v_actor record; v_req public.loja_credito_saques%rowtype; v_doc_path text; v_addr_path text; v_status text;
BEGIN
  SELECT * INTO v_actor FROM public.gsa_client_session_actor(p_sessao_id,p_session_token) LIMIT 1;
  SELECT * INTO v_req FROM public.loja_credito_saques WHERE id=p_saque_id AND cliente_id=v_actor.cliente_id FOR UPDATE;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Solicitação de saque não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_req.status IN ('em_analise','analise_reforcada','aprovado','liberado') AND v_req.documento_foto IS NOT NULL AND v_req.comprovante_endereco IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'status',v_req.status,'prazo_analise',v_req.prazo_analise);
  END IF;
  IF v_req.status<>'aguardando_documentos' THEN RAISE EXCEPTION 'Os documentos não podem ser enviados neste status.' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_documento_foto)<>'object' OR jsonb_typeof(p_comprovante_endereco)<>'object' THEN RAISE EXCEPTION 'Envie os dois documentos obrigatórios.' USING ERRCODE='22023'; END IF;
  v_doc_path:=COALESCE(p_documento_foto->>'path',''); v_addr_path:=COALESCE(p_comprovante_endereco->>'path','');
  IF v_doc_path NOT LIKE 'private/client-docs/'||v_actor.cliente_id::text||'/credit-withdrawal/%' OR
     v_addr_path NOT LIKE 'private/client-docs/'||v_actor.cliente_id::text||'/credit-withdrawal/%' THEN
    RAISE EXCEPTION 'Caminho de documento inválido para esta conta.' USING ERRCODE='42501';
  END IF;
  v_status:=CASE WHEN v_req.analise_reforcada THEN 'analise_reforcada' ELSE 'em_analise' END;
  UPDATE public.loja_credito_saques SET documento_foto=p_documento_foto,comprovante_endereco=p_comprovante_endereco,
    status=v_status,prazo_analise=now()+interval '72 hours',updated_at=now() WHERE id=v_req.id;
  INSERT INTO public.loja_credito_saque_eventos(saque_id,tipo,titulo,descricao,ator_tipo,ator_id,ator_nome)
  VALUES(v_req.id,'documentos_enviados',CASE WHEN v_req.analise_reforcada THEN 'Documentos enviados — análise reforçada' ELSE 'Documentos enviados — em análise' END,
    CASE WHEN v_req.analise_reforcada THEN 'Uma ou mais regras de elegibilidade padrão não foram atendidas; o pedido seguirá por análise minuciosa.' ELSE 'Os documentos foram recebidos e a análise foi iniciada.' END,
    'cliente',v_actor.cliente_id,v_actor.cliente_nome);
  PERFORM set_config('gsa.system_override','on',true);  INSERT INTO public.notificacoes(cliente_id,titulo,mensagem,modulo,tab,item_id,destinatario_tipo,prioridade,acao_origem,contexto) VALUES
  (v_actor.cliente_id,CASE WHEN v_req.analise_reforcada THEN 'Saque em análise minuciosa' ELSE 'Saque de crédito em análise' END,
   CASE WHEN v_req.analise_reforcada THEN format('Os documentos da solicitação %s foram recebidos. Como uma ou mais regras de liberação padrão não foram atendidas, o sistema fará uma análise minuciosa em até 72 horas.',v_req.protocolo)
   ELSE format('Os documentos da solicitação %s foram recebidos. O sistema fará a análise em até 72 horas.',v_req.protocolo) END,
   'financeiro','credito',v_req.id::text,'cliente','normal','credito_saque_em_analise',jsonb_build_object('saque_id',v_req.id,'protocolo',v_req.protocolo,'analise_reforcada',v_req.analise_reforcada)),
  (NULL,'Nova solicitação de saque de crédito',
   format('%s solicitou saque de R$ %s. Total da fatura: R$ %s. %s',v_actor.cliente_nome,to_char(v_req.valor_solicitado,'FM999G999G990D00'),to_char(v_req.valor_total_fatura,'FM999G999G990D00'),
     CASE WHEN v_req.analise_reforcada THEN 'Requer análise minuciosa.' ELSE 'Elegibilidade padrão atendida.' END),
   'financeiro','saques_credito',v_req.id::text,'admin',CASE WHEN v_req.analise_reforcada THEN 'alta' ELSE 'normal' END,'credito_saque_documentos_enviados',
   jsonb_build_object('saque_id',v_req.id,'cliente_id',v_actor.cliente_id,'protocolo',v_req.protocolo,'analise_reforcada',v_req.analise_reforcada));
  RETURN jsonb_build_object('success',true,'status',v_status,'prazo_analise',now()+interval '72 hours','analise_reforcada',v_req.analise_reforcada);
END;
$_$;


--
-- Name: gsa_complete_partner_appeal(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_complete_partner_appeal(p_challenge_id uuid, p_code_hash text, p_contestacao text, p_idempotency_key uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_challenge public.parceiros_resgates_recurso_desafios%ROWTYPE;
  v_resgate public.parceiros_resgates%ROWTYPE;
  v_recurso public.parceiros_resgates_recursos%ROWTYPE;
  v_contestacao text := trim(COALESCE(p_contestacao, ''));
  v_protocol text;
  v_admin_phone text;
  v_first_name text;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(v_contestacao) NOT BETWEEN 20 AND 4000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
  END IF;

  SELECT * INTO v_recurso
  FROM public.parceiros_resgates_recursos
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'appeal', jsonb_build_object(
        'id', v_recurso.id,
        'protocolo_recurso', v_recurso.protocolo_recurso,
        'status', v_recurso.status,
        'aberto_em', v_recurso.aberto_em,
        'prazo_analise_em', v_recurso.prazo_analise_em
      )
    );
  END IF;

  SELECT * INTO v_challenge
  FROM public.parceiros_resgates_recurso_desafios
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND OR v_challenge.consumed_at IS NOT NULL OR v_challenge.expires_at <= now() OR v_challenge.attempts >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_code');
  END IF;

  IF v_challenge.code_hash <> trim(COALESCE(p_code_hash, '')) THEN
    UPDATE public.parceiros_resgates_recurso_desafios
       SET attempts = LEAST(attempts + 1, 5)
     WHERE id = v_challenge.id;
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired_code');
  END IF;

  SELECT * INTO v_resgate
  FROM public.parceiros_resgates
  WHERE id = v_challenge.resgate_id
  FOR UPDATE;

  IF NOT FOUND OR v_resgate.status <> 'recusado' THEN
    RETURN jsonb_build_object('success', false, 'error', 'appeal_not_allowed');
  END IF;

  IF EXISTS (SELECT 1 FROM public.parceiros_resgates_recursos WHERE resgate_id = v_resgate.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'appeal_already_used');
  END IF;

  v_protocol := 'REC-' || to_char(clock_timestamp(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.parceiros_resgates_recursos(
    resgate_id, protocolo_recurso, contestacao_cliente, status,
    aberto_em, prazo_analise_em, idempotency_key
  ) VALUES (
    v_resgate.id, v_protocol, v_contestacao, 'em_analise',
    now(), now() + interval '5 days', p_idempotency_key
  ) RETURNING * INTO v_recurso;

  UPDATE public.parceiros_resgates_recurso_desafios
     SET consumed_at = now()
   WHERE id = v_challenge.id;

  INSERT INTO public.parceiros_resgates_eventos(
    resgate_id, recurso_id, tipo, titulo, descricao_publica, ator_tipo,
    idempotency_key, ocorrido_em
  ) VALUES (
    v_resgate.id, v_recurso.id, 'recurso_interposto', 'Recurso apresentado',
    'O recurso foi recebido e será analisado em até cinco dias.', 'cliente',
    'appeal-opened:' || v_recurso.id::text, v_recurso.aberto_em
  );

  v_first_name := split_part(trim(v_resgate.nome_completo), ' ', 1);
  INSERT INTO public.parceiros_resgates_notificacoes(
    resgate_id, recurso_id, tipo, telefone, mensagem, idempotency_key
  ) VALUES (
    v_resgate.id,
    v_recurso.id,
    'recurso_recebido_cliente',
    v_resgate.telefone,
    'Olá, *' || COALESCE(NULLIF(v_first_name, ''), 'Cliente') || '*.' || E'\n\n' ||
    'Seu recurso foi recebido e será analisado em até *5 dias*.' || E'\n\n' ||
    'Protocolo da solicitação: *' || v_resgate.codigo_gerado || '*' || E'\n' ||
    'Protocolo do recurso: *' || v_recurso.protocolo_recurso || '*',
    'appeal-opened-client:' || v_recurso.id::text
  );

  SELECT value INTO v_admin_phone
  FROM public.system_settings
  WHERE key = 'whatsapp_admin_notificacoes'
  LIMIT 1;

  IF NULLIF(regexp_replace(COALESCE(v_admin_phone, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    INSERT INTO public.parceiros_resgates_notificacoes(
      resgate_id, recurso_id, tipo, telefone, mensagem, idempotency_key
    ) VALUES (
      v_resgate.id,
      v_recurso.id,
      'recurso_aberto_admin',
      v_admin_phone,
      'Novo recurso de solicitação recebido.' || E'\n\n' ||
      'Protocolo: *' || v_resgate.codigo_gerado || '*' || E'\n' ||
      'Recurso: *' || v_recurso.protocolo_recurso || '*' || E'\n' ||
      'Prazo: *' || to_char(v_recurso.prazo_analise_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '*',
      'appeal-opened-admin:' || v_recurso.id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'appeal', jsonb_build_object(
      'id', v_recurso.id,
      'protocolo_recurso', v_recurso.protocolo_recurso,
      'status', v_recurso.status,
      'aberto_em', v_recurso.aberto_em,
      'prazo_analise_em', v_recurso.prazo_analise_em
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'appeal_already_used');
END;
$$;


--
-- Name: gsa_credit_withdrawal_fee(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_credit_withdrawal_fee(p_valor numeric) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_tipo text; v_cfg numeric; v_taxa numeric; v_total numeric;
BEGIN
  SELECT COALESCE((SELECT value FROM public.system_settings WHERE key='credito_saque_taxa_tipo'),'percentual') INTO v_tipo;
  IF v_tipo NOT IN ('percentual','fixa') THEN v_tipo:='percentual'; END IF;
  BEGIN SELECT COALESCE((SELECT value::numeric FROM public.system_settings WHERE key='credito_saque_taxa_valor'),0) INTO v_cfg;
  EXCEPTION WHEN invalid_text_representation THEN v_cfg:=0; END;
  v_cfg:=greatest(COALESCE(v_cfg,0),0);
  v_taxa:=CASE WHEN v_tipo='fixa' THEN round(v_cfg,2) ELSE round(greatest(COALESCE(p_valor,0),0)*v_cfg/100,2) END;
  v_total:=round(greatest(COALESCE(p_valor,0),0)+v_taxa,2);
  RETURN jsonb_build_object('taxa_tipo',v_tipo,'taxa_config_valor',v_cfg,'taxa_calculada',v_taxa,'valor_total_fatura',v_total);
END;
$$;


--
-- Name: gsa_finish_partner_appeal_notification(uuid, boolean, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_finish_partner_appeal_notification(p_notification_id uuid, p_success boolean, p_provider_message_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.parceiros_resgates_notificacoes
     SET status = CASE WHEN p_success THEN 'enviado' WHEN attempts >= 6 THEN 'falhou' ELSE 'falhou' END,
         sent_at = CASE WHEN p_success THEN now() ELSE sent_at END,
         provider_message_id = CASE WHEN p_success THEN nullif(trim(COALESCE(p_provider_message_id, '')), '') ELSE provider_message_id END,
         last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, 'Falha não informada'), 1000) END,
         available_at = CASE WHEN p_success THEN available_at ELSE now() + make_interval(mins => LEAST(60, attempts * attempts)) END,
         updated_at = now()
   WHERE id = p_notification_id AND status = 'processando';
END;
$$;


--
-- Name: gsa_notify_admin_partner_appeal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_notify_admin_partner_appeal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_resgate public.parceiros_resgates%ROWTYPE;
BEGIN
  SELECT *
    INTO v_resgate
    FROM public.parceiros_resgates
   WHERE id = NEW.resgate_id;

  INSERT INTO public.notificacoes(
    titulo,
    mensagem,
    modulo,
    tab,
    item_id,
    tipo,
    destinatario_tipo,
    prioridade,
    acao_origem,
    contexto
  )
  SELECT
    'Novo recurso de beneficio recebido',
    COALESCE(NULLIF(trim(v_resgate.nome_completo), ''), 'Cliente') ||
      ' apresentou recurso para a solicitacao ' ||
      COALESCE(NULLIF(trim(v_resgate.codigo_gerado), ''), v_resgate.id::text) || '.',
    'parceiros',
    'resgates',
    NEW.resgate_id::text,
    'sistema',
    'admin',
    'alta',
    'recurso_parceiro_aberto',
    jsonb_build_object(
      'resgate_id', NEW.resgate_id,
      'recurso_id', NEW.id,
      'protocolo_recurso', NEW.protocolo_recurso,
      'prazo_analise_em', NEW.prazo_analise_em
    )
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.notificacoes n
     WHERE n.acao_origem = 'recurso_parceiro_aberto'
       AND n.contexto ->> 'recurso_id' = NEW.id::text
  );

  RETURN NEW;
END;
$$;


--
-- Name: gsa_schedule_partner_appeal_sla_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gsa_schedule_partner_appeal_sla_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_phone text;
  v_inserted integer := 0;
BEGIN
  SELECT value INTO v_admin_phone
  FROM public.system_settings
  WHERE key = 'whatsapp_admin_notificacoes'
  LIMIT 1;

  IF NULLIF(regexp_replace(COALESCE(v_admin_phone, ''), '\D', '', 'g'), '') IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.parceiros_resgates_notificacoes(
    resgate_id, recurso_id, tipo, telefone, mensagem, idempotency_key
  )
  SELECT
    a.resgate_id,
    a.id,
    CASE WHEN a.prazo_analise_em <= now() THEN 'recurso_sla_vencido_admin' ELSE 'recurso_sla_24h_admin' END,
    v_admin_phone,
    CASE WHEN a.prazo_analise_em <= now() THEN
      'Atenção: o prazo de análise do recurso *' || a.protocolo_recurso || '* venceu. Acesse o painel para registrar a decisão.'
    ELSE
      'Lembrete: falta menos de 24 horas para analisar o recurso *' || a.protocolo_recurso || '*.'
    END,
    CASE WHEN a.prazo_analise_em <= now() THEN 'appeal-sla-overdue:' ELSE 'appeal-sla-24h:' END || a.id::text
  FROM public.parceiros_resgates_recursos a
  WHERE a.status = 'em_analise'
    AND a.prazo_analise_em <= now() + interval '24 hours'
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


--
-- Name: parceiros_resgates_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros_resgates_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resgate_id uuid NOT NULL,
    recurso_id uuid,
    tipo text NOT NULL,
    titulo text NOT NULL,
    descricao_publica text,
    detalhes_privados jsonb DEFAULT '{}'::jsonb NOT NULL,
    ator_tipo text DEFAULT 'sistema'::text NOT NULL,
    ator_id uuid,
    idempotency_key text NOT NULL,
    ocorrido_em timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parceiros_resgates_eventos_ator_tipo_check CHECK ((ator_tipo = ANY (ARRAY['cliente'::text, 'admin'::text, 'colaborador'::text, 'sistema'::text])))
);


--
-- Name: parceiros_resgates_public_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros_resgates_public_status (
    resgate_id uuid NOT NULL,
    tracking_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: parceiros_resgates_recurso_desafios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros_resgates_recurso_desafios (
    id uuid NOT NULL,
    resgate_id uuid NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parceiros_resgates_recurso_desafios_attempts_check CHECK (((attempts >= 0) AND (attempts <= 5)))
);


--
-- Name: parceiros_resgates_recursos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros_resgates_recursos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resgate_id uuid NOT NULL,
    protocolo_recurso text NOT NULL,
    contestacao_cliente text NOT NULL,
    status text DEFAULT 'em_analise'::text NOT NULL,
    aberto_em timestamp with time zone DEFAULT now() NOT NULL,
    prazo_analise_em timestamp with time zone NOT NULL,
    analisado_em timestamp with time zone,
    motivo_decisao text,
    analisado_por uuid,
    idempotency_key uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parceiros_resgates_recursos_contestacao_check CHECK (((char_length(TRIM(BOTH FROM contestacao_cliente)) >= 20) AND (char_length(TRIM(BOTH FROM contestacao_cliente)) <= 4000))),
    CONSTRAINT parceiros_resgates_recursos_decisao_check CHECK ((((status = 'em_analise'::text) AND (analisado_em IS NULL) AND (motivo_decisao IS NULL)) OR ((status = 'deferido'::text) AND (analisado_em IS NOT NULL)) OR ((status = 'indeferido'::text) AND (analisado_em IS NOT NULL) AND ((char_length(TRIM(BOTH FROM COALESCE(motivo_decisao, ''::text))) >= 10) AND (char_length(TRIM(BOTH FROM COALESCE(motivo_decisao, ''::text))) <= 2000))))),
    CONSTRAINT parceiros_resgates_recursos_status_check CHECK ((status = ANY (ARRAY['em_analise'::text, 'deferido'::text, 'indeferido'::text])))
);


--
-- Name: parceiros_resgates_eventos parceiros_resgates_eventos_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_eventos
    ADD CONSTRAINT parceiros_resgates_eventos_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: parceiros_resgates_eventos parceiros_resgates_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_eventos
    ADD CONSTRAINT parceiros_resgates_eventos_pkey PRIMARY KEY (id);


--
-- Name: parceiros_resgates_public_status parceiros_resgates_public_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_public_status
    ADD CONSTRAINT parceiros_resgates_public_status_pkey PRIMARY KEY (resgate_id);


--
-- Name: parceiros_resgates_public_status parceiros_resgates_public_status_tracking_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_public_status
    ADD CONSTRAINT parceiros_resgates_public_status_tracking_key_key UNIQUE (tracking_key);


--
-- Name: parceiros_resgates_recurso_desafios parceiros_resgates_recurso_desafios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recurso_desafios
    ADD CONSTRAINT parceiros_resgates_recurso_desafios_pkey PRIMARY KEY (id);


--
-- Name: parceiros_resgates_recursos parceiros_resgates_recursos_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recursos
    ADD CONSTRAINT parceiros_resgates_recursos_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: parceiros_resgates_recursos parceiros_resgates_recursos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recursos
    ADD CONSTRAINT parceiros_resgates_recursos_pkey PRIMARY KEY (id);


--
-- Name: parceiros_resgates_recursos parceiros_resgates_recursos_protocolo_recurso_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recursos
    ADD CONSTRAINT parceiros_resgates_recursos_protocolo_recurso_key UNIQUE (protocolo_recurso);


--
-- Name: parceiros_resgates_recursos parceiros_resgates_recursos_unico_por_resgate; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recursos
    ADD CONSTRAINT parceiros_resgates_recursos_unico_por_resgate UNIQUE (resgate_id);


--
-- Name: parceiros_resgates_eventos parceiros_resgates_eventos_recurso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_eventos
    ADD CONSTRAINT parceiros_resgates_eventos_recurso_id_fkey FOREIGN KEY (recurso_id) REFERENCES public.parceiros_resgates_recursos(id) ON DELETE SET NULL;


--
-- Name: parceiros_resgates_eventos parceiros_resgates_eventos_resgate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_eventos
    ADD CONSTRAINT parceiros_resgates_eventos_resgate_id_fkey FOREIGN KEY (resgate_id) REFERENCES public.parceiros_resgates(id) ON DELETE CASCADE;


--
-- Name: parceiros_resgates_public_status parceiros_resgates_public_status_resgate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_public_status
    ADD CONSTRAINT parceiros_resgates_public_status_resgate_id_fkey FOREIGN KEY (resgate_id) REFERENCES public.parceiros_resgates(id) ON DELETE CASCADE;


--
-- Name: parceiros_resgates_recurso_desafios parceiros_resgates_recurso_desafios_resgate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recurso_desafios
    ADD CONSTRAINT parceiros_resgates_recurso_desafios_resgate_id_fkey FOREIGN KEY (resgate_id) REFERENCES public.parceiros_resgates(id) ON DELETE CASCADE;


--
-- Name: parceiros_resgates_recursos parceiros_resgates_recursos_resgate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_resgates_recursos
    ADD CONSTRAINT parceiros_resgates_recursos_resgate_id_fkey FOREIGN KEY (resgate_id) REFERENCES public.parceiros_resgates(id) ON DELETE CASCADE;


--
-- Name: loja_solicitacoes gsa_client_own_loja_solicitacoes_hardened; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gsa_client_own_loja_solicitacoes_hardened ON public.loja_solicitacoes TO authenticated USING (((public.gsa_jwt_actor_type() = 'cliente'::text) AND (cliente_id = public.gsa_jwt_actor_id()))) WITH CHECK (((public.gsa_jwt_actor_type() = 'cliente'::text) AND (cliente_id = public.gsa_jwt_actor_id())));


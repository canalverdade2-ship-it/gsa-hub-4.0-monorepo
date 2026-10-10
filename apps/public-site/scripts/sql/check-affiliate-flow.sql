DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'gsa_afiliado_programas',
    'gsa_afiliados',
    'gsa_afiliado_links',
    'gsa_afiliado_cliques',
    'gsa_afiliado_atribuicoes',
    'gsa_afiliado_conversoes',
    'gsa_afiliado_comissoes',
    'gsa_afiliado_saques',
    'gsa_afiliado_comissao_eventos',
    'gsa_afiliado_pontos_eventos'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Tabela obrigatoria do GSA Afiliados ausente: %', v_table;
    END IF;
  END LOOP;

  IF to_regprocedure('public.gsa_public_register_affiliate(jsonb)') IS NULL
     OR to_regprocedure('public.gsa_public_track_affiliate_click(text,text,text,text)') IS NULL
     OR to_regprocedure('public.gsa_client_bind_affiliate_click(uuid,text,text)') IS NULL
     OR to_regprocedure('public.gsa_client_affiliate_snapshot(uuid,text)') IS NULL
     OR to_regprocedure('public.gsa_client_create_affiliate_link(uuid,text,text,text,text)') IS NULL
     OR to_regprocedure('public.gsa_client_request_affiliate_payout(uuid,text,uuid,numeric)') IS NULL
     OR to_regprocedure('public.gsa_client_redeem_affiliate_points(uuid,text,uuid,numeric)') IS NULL
     OR to_regprocedure('public.gsa_admin_affiliate_snapshot(uuid,text)') IS NULL
     OR to_regprocedure('public.gsa_admin_update_affiliate_program(uuid,text,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.gsa_admin_set_affiliate_status(uuid,text,uuid,text,text)') IS NULL
     OR to_regprocedure('public.gsa_admin_decide_affiliate_payout(uuid,text,uuid,text,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'Funcoes obrigatorias do GSA Afiliados ausentes.';
  END IF;

  IF (SELECT count(*) FROM public.gsa_afiliado_programas WHERE ativo AND codigo IN ('loja','viagens','classificados','servicos','saude','seguros')) <> 6 THEN
    RAISE EXCEPTION 'Catalogo ativo do GSA Afiliados incompleto.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.gsa_afiliado_programas
    WHERE codigo = 'loja' AND caminho_padrao <> '/marketplace/loja'
  ) THEN
    RAISE EXCEPTION 'Caminhos dos programas de afiliados nao foram reconciliados.';
  END IF;
END;
$$;

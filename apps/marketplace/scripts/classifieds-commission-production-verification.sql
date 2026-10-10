DO $verification$
DECLARE
  v_count integer;
  v_invalid integer;
BEGIN
  IF to_regclass('public.classificados_comissoes_config') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.classificados_comissoes_config não existe.';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.classificados_comissoes_config
   WHERE categoria IN ('imoveis', 'veiculos', 'geral');

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'A configuração deve conter exatamente as três categorias dos Classificados.';
  END IF;

  SELECT count(*)
    INTO v_invalid
    FROM public.classificados_comissoes_config
   WHERE percentual <= 0
      OR percentual > 100
      OR ativo IS DISTINCT FROM true;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'Existe configuração de comissão inválida ou inativa.';
  END IF;

  IF to_regprocedure('public.gsa_admin_update_classified_commission(text,numeric,boolean)') IS NULL THEN
    RAISE EXCEPTION 'RPC administrativa de comissões não existe.';
  END IF;
END;
$verification$;

SELECT 'CLASSIFIEDS_COMMISSION_CONFIG_VERIFIED' AS verification_status;

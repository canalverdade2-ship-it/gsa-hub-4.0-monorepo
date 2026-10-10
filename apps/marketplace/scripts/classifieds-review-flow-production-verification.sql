DO $verification$
BEGIN
  IF to_regclass('public.classificados_ajustes') IS NULL THEN
    RAISE EXCEPTION 'Tabela classificados_ajustes ausente.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.classificados_ajustes'::regclass
      AND confrelid='public.classificados_anuncios'::regclass
      AND contype='f'
  ) THEN
    RAISE EXCEPTION 'Relacionamento ajustes -> anúncios ausente.';
  END IF;
  IF to_regprocedure('public.gsa_admin_get_classified_detail(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RPC administrativa de detalhes completos ausente.';
  END IF;
  IF to_regprocedure('public.gsa_admin_request_classified_adjustments(uuid,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC administrativa de solicitação de ajustes ausente.';
  END IF;
  IF to_regprocedure('public.rpc_reenviar_anuncio_classificado(uuid,text,text,numeric,text,text,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RPC do cliente para reenvio do anúncio ausente.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='classificados_ajustes'
      AND policyname='classificados_ajustes_cliente_select'
  ) THEN
    RAISE EXCEPTION 'Política de leitura dos ajustes pelo anunciante ausente.';
  END IF;
END;
$verification$;
SELECT 'CLASSIFIEDS_REVIEW_ADJUSTMENT_FLOW_VERIFIED' AS verification_status;

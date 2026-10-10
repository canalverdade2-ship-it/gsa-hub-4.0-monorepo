DO $verification$
BEGIN
  IF to_regprocedure('public.rpc_criar_anuncio_classificado(text,text,text,uuid,numeric,text,jsonb,text,jsonb,numeric,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC de criação de anúncio não existe com a assinatura esperada.';
  END IF;

  IF to_regclass('public.classificados_anuncios') IS NULL THEN
    RAISE EXCEPTION 'Tabela de anúncios dos Classificados não existe.';
  END IF;

  IF to_regclass('public.classificados_midias') IS NULL THEN
    RAISE EXCEPTION 'Tabela de mídias dos Classificados não existe.';
  END IF;
END;
$verification$;

SELECT 'CLASSIFIEDS_CREATE_LISTING_RPC_VERIFIED' AS verification_status;

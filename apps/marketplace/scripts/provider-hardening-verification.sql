\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid),
       has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname LIKE 'gsa_provider_%'
    OR p.proname IN (
      'gsa_public_register_provider',
      'gsa_solicitar_pin_whatsapp',
      'gsa_validar_pin_whatsapp'
    )
  )
ORDER BY 1, 2;

SELECT 'provider_registration_old_signature_exists',
       to_regprocedure('public.gsa_public_register_provider(jsonb)') IS NOT NULL;

SELECT 'provider_registration_secure_signature_exists',
       to_regprocedure('public.gsa_public_register_provider(jsonb,text)') IS NOT NULL;

SELECT 'challenge_rls', relrowsecurity
FROM pg_class
WHERE oid = 'public.gsa_provider_registration_challenges'::regclass;

SELECT 'invalid_provider_rows', count(*)
FROM public.prestadores
WHERE status <> 'ativo' AND pin_hash IS NULL AND created_at >= now() - interval '1 day';

SELECT 'negative_provider_transactions', count(*)
FROM public.prestador_transacoes
WHERE valor <= 0;

SELECT 'unsafe_delivery_links', count(*)
FROM public.prestador_demandas
WHERE link_resultado IS NOT NULL
  AND NOT public.gsa_is_safe_provider_result_url(link_resultado);

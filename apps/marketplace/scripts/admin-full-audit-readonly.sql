\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

-- Tabelas públicas sem RLS e com privilégios de API.
SELECT 'TABLE_WITHOUT_RLS', n.nspname, c.relname,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'),
       has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
  AND (
    has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
  )
ORDER BY c.relname;

-- Policies públicas/anon permissivas sem filtro real.
SELECT 'OPEN_POLICY', schemaname, tablename, policyname, cmd,
       array_to_string(roles,','), coalesce(qual,''), coalesce(with_check,'')
FROM pg_policies
WHERE schemaname='public'
  AND ('public'=ANY(roles) OR 'anon'=ANY(roles))
  AND (coalesce(qual,'true') IN ('true','(true)') OR coalesce(with_check,'true') IN ('true','(true)'))
ORDER BY tablename, policyname;

-- Funções administrativas executáveis sem autenticação.
SELECT 'ANON_ADMIN_FUNCTION', p.proname, pg_get_function_identity_arguments(p.oid),
       p.prosecdef, coalesce(array_to_string(p.proconfig,','),'')
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname LIKE 'gsa_admin_%' OR p.proname LIKE 'fn_admin_%')
  AND has_function_privilege('anon',p.oid,'EXECUTE')
ORDER BY p.proname, 2;

-- SECURITY DEFINER administrativo sem search_path fixo.
SELECT 'ADMIN_DEFINER_WITHOUT_PATH', p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND (p.proname LIKE 'gsa_admin_%' OR p.proname LIKE 'fn_admin_%')
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) x WHERE x LIKE 'search_path=%')
ORDER BY p.proname, 2;

-- Policies administrativas de colaborador que não possuem fronteira RESTRICTIVE.
WITH managed AS (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE schemaname='public'
    AND (
      coalesce(qual,'') LIKE '%admin%colaborador%'
      OR coalesce(with_check,'') LIKE '%admin%colaborador%'
      OR policyname LIKE 'gsa_management%'
    )
)
SELECT 'MANAGED_WITHOUT_RESTRICTIVE_MODULE', m.tablename
FROM managed m
WHERE NOT EXISTS (
  SELECT 1 FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=m.tablename
    AND p.permissive='RESTRICTIVE'
    AND (coalesce(p.qual,'') LIKE '%gsa_admin_restrict_collaborator_to_module%'
      OR coalesce(p.with_check,'') LIKE '%gsa_admin_restrict_collaborator_to_module%')
)
ORDER BY m.tablename;

-- Integridade operacional e financeira (somente contagens).
SELECT 'NEGATIVE_FINANCIAL_VALUES', 'faturas', count(*) FROM public.faturas WHERE valor_total < 0
UNION ALL SELECT 'NEGATIVE_FINANCIAL_VALUES','pagamentos',count(*) FROM public.pagamentos WHERE valor < 0
UNION ALL SELECT 'NEGATIVE_FINANCIAL_VALUES','saques',count(*) FROM public.saques WHERE valor < 0
UNION ALL SELECT 'NEGATIVE_FINANCIAL_VALUES','prestador_saques',count(*) FROM public.prestador_saques WHERE valor < 0
UNION ALL SELECT 'NEGATIVE_FINANCIAL_VALUES','emprestimos',count(*) FROM public.emprestimos WHERE valor_solicitado < 0;

SELECT 'ORPHAN_ROWS','ordens_compra_cliente',count(*)
FROM public.ordens_compra o LEFT JOIN public.clientes c ON c.id=o.cliente_id
WHERE o.cliente_id IS NOT NULL AND c.id IS NULL
UNION ALL SELECT 'ORPHAN_ROWS','faturas_cliente',count(*)
FROM public.faturas f LEFT JOIN public.clientes c ON c.id=f.cliente_id
WHERE f.cliente_id IS NOT NULL AND c.id IS NULL
UNION ALL SELECT 'ORPHAN_ROWS','demandas_prestador',count(*)
FROM public.prestador_demandas d LEFT JOIN public.prestadores p ON p.id=d.prestador_id
WHERE d.prestador_id IS NOT NULL AND p.id IS NULL
UNION ALL SELECT 'ORPHAN_ROWS','tickets_cliente',count(*)
FROM public.tickets t LEFT JOIN public.clientes c ON c.id=t.cliente_id
WHERE t.cliente_id IS NOT NULL AND c.id IS NULL;

SELECT 'DUPLICATE_ACTIVE_COLLABORATOR_MODULE', colaborador_id, modulo, count(*)
FROM public.colaborador_modulos
GROUP BY colaborador_id, modulo HAVING count(*)>1;

SELECT 'STALE_ACTIVE_ADMIN_SESSION', ator_tipo, count(*)
FROM public.sistema_sessoes
WHERE ativo=true AND expires_at < now()
  AND ator_tipo IN ('admin','colaborador')
GROUP BY ator_tipo;

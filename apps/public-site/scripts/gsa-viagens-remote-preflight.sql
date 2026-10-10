SELECT
  expected.table_name,
  to_regclass(format('public.%I', expected.table_name)) IS NOT NULL AS exists
FROM (
  VALUES
    ('clientes'),
    ('faturas'),
    ('viagens_orcamentos'),
    ('viagens_pacotes'),
    ('viagens_propostas'),
    ('viagens_passageiros'),
    ('viagens_transacoes'),
    ('viagens_cancelamentos')
) AS expected(table_name)
ORDER BY expected.table_name;

SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clientes', 'faturas')
ORDER BY table_name, ordinal_position;

SELECT
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('clientes', 'faturas')
ORDER BY c.relname, con.conname;

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clientes', 'faturas')
ORDER BY tablename, policyname;

SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('clientes', 'faturas')
ORDER BY event_object_table, trigger_name;

SELECT
  count(*) AS clientes_total,
  count(*) FILTER (
    WHERE c.email IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE lower(u.email) = lower(c.email)
      )
  ) AS clientes_com_email_em_auth,
  (SELECT count(*) FROM auth.users) AS usuarios_auth_total
FROM public.clientes c;

SELECT
  n.nspname AS function_schema,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f'
  AND n.nspname = 'public'
  AND (
    p.prosrc ILIKE '%auth.uid()%'
    OR p.prosrc ILIKE '%auth.uid%'
    OR p.prosrc ILIKE '%clientes%'
  )
ORDER BY n.nspname, p.proname;

SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'viagens_orcamentos',
    'viagens_pacotes',
    'viagens_propostas',
    'viagens_passageiros',
    'viagens_transacoes',
    'viagens_cancelamentos'
  )
ORDER BY table_name, ordinal_position;

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260717220000',
  '20260717221000',
  '20260720120000',
  '20260720123000',
  '20260720130000'
)
ORDER BY version;

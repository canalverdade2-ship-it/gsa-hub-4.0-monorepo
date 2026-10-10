DO $$
DECLARE
  v_bucket_public boolean;
BEGIN
  IF to_regclass('public.gsa_careers_applications') IS NULL THEN
    RAISE EXCEPTION 'Tabela gsa_careers_applications ausente';
  END IF;

  IF to_regclass('public.gsa_careers_application_history') IS NULL THEN
    RAISE EXCEPTION 'Historico de candidaturas ausente';
  END IF;

  IF to_regprocedure('public.gsa_public_submit_career_application(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RPC publica de envio ausente';
  END IF;

  IF to_regprocedure('public.gsa_public_get_career_application(text,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC segura de consulta ausente';
  END IF;

  IF to_regprocedure('public.gsa_admin_list_career_applications(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC administrativa de listagem ausente';
  END IF;

  IF to_regprocedure('public.gsa_admin_update_career_application(uuid,text,uuid,text,text,timestamp with time zone,text)') IS NULL THEN
    RAISE EXCEPTION 'RPC administrativa de atualizacao ausente';
  END IF;

  IF has_table_privilege('anon', 'public.gsa_careers_applications', 'SELECT')
     OR has_table_privilege('anon', 'public.gsa_careers_applications', 'INSERT')
     OR has_table_privilege('authenticated', 'public.gsa_careers_applications', 'SELECT')
     OR has_table_privilege('authenticated', 'public.gsa_careers_applications', 'UPDATE') THEN
    RAISE EXCEPTION 'Tabela de candidaturas ainda possui acesso direto';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gsa_careers_applications'
      AND policyname IN ('gsa_careers_public_select', 'gsa_careers_admin_all')
  ) THEN
    RAISE EXCEPTION 'Politica legada insegura ainda existe';
  END IF;

  SELECT public INTO v_bucket_public
  FROM storage.buckets
  WHERE id = 'gsa-careers-resumes';

  IF v_bucket_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Bucket de curriculos ausente ou publico';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'gsa_careers_resume_public_insert'
  ) THEN
    RAISE EXCEPTION 'Politica de upload controlado ausente';
  END IF;
END $$;

SELECT 'CAREERS_PRODUCTION_VERIFIED' AS result;

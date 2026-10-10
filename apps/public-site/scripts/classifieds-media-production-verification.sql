DO $verification$
DECLARE
  v_bucket storage.buckets%rowtype;
BEGIN
  SELECT *
  INTO v_bucket
  FROM storage.buckets
  WHERE id = 'classificados-midias';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bucket classificados-midias não existe.';
  END IF;

  IF v_bucket.public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Bucket classificados-midias não está público para exibição dos anúncios.';
  END IF;

  IF v_bucket.file_size_limit IS DISTINCT FROM 8388608 THEN
    RAISE EXCEPTION 'Limite do bucket classificados-midias é diferente de 8 MB.';
  END IF;

  IF NOT (v_bucket.allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]) THEN
    RAISE EXCEPTION 'Tipos permitidos do bucket classificados-midias estão incompletos.';
  END IF;

  -- O navegador não deve possuir escrita direta neste bucket. A service role da
  -- Edge Function ignora RLS somente depois de validar Auth, sessão GSA e cliente.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (
        coalesce(qual, '') ILIKE '%classificados-midias%'
        OR coalesce(with_check, '') ILIKE '%classificados-midias%'
        OR policyname ILIKE '%classificados%midias%'
      )
  ) THEN
    RAISE EXCEPTION 'Existe política de escrita direta para o bucket classificados-midias.';
  END IF;
END;
$verification$;

SELECT 'CLASSIFIEDS_MEDIA_STORAGE_VERIFIED' AS verification_status;

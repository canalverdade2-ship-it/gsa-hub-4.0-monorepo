-- Additive compatibility changes; no production rows are removed.
ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS codigo_barras text,
  ADD COLUMN IF NOT EXISTS pix_copia_cola text,
  ADD COLUMN IF NOT EXISTS link_pagamento text,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS servico_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- This helper is invoked by SECURITY DEFINER RPCs, not directly by browsers.
REVOKE EXECUTE ON FUNCTION public.gsa_admin_write_audit(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gsa_admin_write_audit(text,text,text,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Public budget attachments are isolated to a dedicated, non-public bucket.
-- Anonymous users may upload/read only objects below this exact prefix so the
-- browser can create a temporary signed URL; no existing bucket is widened.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orcamentos-anexos',
  'orcamentos-anexos',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public_budget_attachment_insert'
  ) THEN
    CREATE POLICY public_budget_attachment_insert
      ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (
        bucket_id = 'orcamentos-anexos'
        AND (storage.foldername(name))[1] = 'public'
        AND (storage.foldername(name))[2] = 'whatsapp-requests'
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'public_budget_attachment_select'
  ) THEN
    CREATE POLICY public_budget_attachment_select
      ON storage.objects FOR SELECT TO anon, authenticated
      USING (
        bucket_id = 'orcamentos-anexos'
        AND (storage.foldername(name))[1] = 'public'
        AND (storage.foldername(name))[2] = 'whatsapp-requests'
      );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

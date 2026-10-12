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

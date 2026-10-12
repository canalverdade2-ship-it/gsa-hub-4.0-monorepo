import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    public boolean NOT NULL DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text NOT NULL,
    name text NOT NULL,
    owner_id uuid
  );
  CREATE FUNCTION storage.foldername(text)
  RETURNS text[] LANGUAGE sql IMMUTABLE AS 'SELECT string_to_array(\\$1, ''/'')';
  CREATE TABLE public.faturas (id uuid PRIMARY KEY);
  CREATE FUNCTION public.gsa_admin_write_audit(text,text,text,uuid,jsonb)
  RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
`);
const sql = fs.readFileSync(path.resolve('../../infra/migrations/20261012_release_contracts.sql'), 'utf8');
await db.exec(sql);
await db.exec(sql);
const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='faturas'");
for (const name of ['codigo_barras','pix_copia_cola','link_pagamento','forma_pagamento','servico_id','updated_at']) {
  if (!columns.rows.some(row => row.column_name === name)) throw new Error('Missing invoice column: '+name);
}
const bucket = await db.query("SELECT public, file_size_limit FROM storage.buckets WHERE id='orcamentos-anexos'");
if (bucket.rows.length !== 1 || bucket.rows[0].public || Number(bucket.rows[0].file_size_limit) !== 15728640) {
  throw new Error('Public attachment bucket configuration is incorrect');
}
const policies = await db.query("SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'");
for (const name of ['public_budget_attachment_insert','public_budget_attachment_select']) {
  if (!policies.rows.some(row => row.policyname === name)) throw new Error('Missing storage policy: '+name);
}
const grants = await db.query("SELECT has_function_privilege('anon','public.gsa_admin_write_audit(text,text,text,uuid,jsonb)','EXECUTE') AS anon, has_function_privilege('service_role','public.gsa_admin_write_audit(text,text,text,uuid,jsonb)','EXECUTE') AS service");
if (grants.rows[0].anon || !grants.rows[0].service) throw new Error('Audit helper privileges are incorrect');
await db.close();
console.log('RELEASE_MIGRATION_OK: idempotent invoice, storage bucket/policies, and restricted audit helper');

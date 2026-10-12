import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
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
const grants = await db.query("SELECT has_function_privilege('anon','public.gsa_admin_write_audit(text,text,text,uuid,jsonb)','EXECUTE') AS anon, has_function_privilege('service_role','public.gsa_admin_write_audit(text,text,text,uuid,jsonb)','EXECUTE') AS service");
if (grants.rows[0].anon || !grants.rows[0].service) throw new Error('Audit helper privileges are incorrect');
await db.close();
console.log('RELEASE_MIGRATION_OK: idempotent columns and restricted audit helper');

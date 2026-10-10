import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const migration = await readFile(new URL('supabase/migrations/20261008000100_gsa3_supabase_foundation.sql', root), 'utf8');
const db = new PGlite();

try {
  // Minimal stand-ins for Supabase-owned objects so PostgreSQL syntax and the
  // app's RLS policies can be exercised offline without touching any project.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create schema extensions;
    grant usage on schema storage to authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$
      select string_to_array($1, '/')
    $$;
    create table storage.buckets (
      id text primary key, name text not null, public boolean not null default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (
      id bigint generated always as identity primary key,
      bucket_id text not null references storage.buckets(id), name text not null
    );
    alter table storage.objects enable row level security;
    grant all on storage.objects to authenticated;
  `);

  await db.exec(migration);

  const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const clientOneId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const clientTwoId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const customerOneId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const customerTwoId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [adminId, clientOneId, clientTwoId]);
  await db.query(`insert into public.gsa_clients(id, person_type, tax_document, name)
    values ($1, 'PF', '52998224725', 'Cliente Um'), ($2, 'PJ', '11222333000181', 'Cliente Dois')`, [customerOneId, customerTwoId]);
  await db.query(`insert into public.gsa_profiles(id, role, full_name, customer_id)
    values ($1, 'admin', 'Admin', null), ($2, 'client', 'Cliente Um', $4), ($3, 'client', 'Cliente Dois', $5)`,
    [adminId, clientOneId, clientTwoId, customerOneId, customerTwoId]);
  await db.query(`insert into public.gsa_proposals(code, customer_id, status)
    values ('PROP-1', $1, 'sent'), ('PROP-2', $2, 'sent')`, [customerOneId, customerTwoId]);

  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [clientOneId]);
  const ownProposals = await db.query('select code from public.gsa_proposals order by code');
  assert.deepEqual(ownProposals.rows.map((row) => row.code), ['PROP-1'], 'cliente deve ler somente a própria proposta');
  const ownClient = await db.query('select name from public.gsa_clients');
  assert.deepEqual(ownClient.rows.map((row) => row.name), ['Cliente Um'], 'cliente deve ler somente o próprio cadastro');
  await db.query(`insert into public.gsa_support_tickets(customer_id, title, status)
    values ($1, 'Meu atendimento', 'open')`, [customerOneId]);
  await assert.rejects(
    db.query(`insert into public.gsa_support_tickets(customer_id, title, status)
      values ($1, 'Atendimento alheio', 'open')`, [customerTwoId]),
    /row-level security|permission denied/i,
    'cliente não pode criar chamado para outra conta'
  );
  await db.query(`insert into storage.objects(bucket_id, name)
    values ('gsa3-private', $1)`, [`${customerOneId}/documents/test.pdf`]);
  await assert.rejects(
    db.query(`insert into storage.objects(bucket_id, name)
      values ('gsa3-private', $1)`, [`${customerTwoId}/documents/other.pdf`]),
    /row-level security|permission denied/i,
    'cliente não pode enviar arquivos para a pasta de outra conta'
  );

  await db.exec('reset role');
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId]);
  const allProposals = await db.query('select code from public.gsa_proposals order by code');
  assert.deepEqual(allProposals.rows.map((row) => row.code), ['PROP-1', 'PROP-2'], 'admin deve consultar as propostas das contas');
  await db.exec('reset role');

  const bucket = await db.query("select public, file_size_limit from storage.buckets where id = 'gsa3-private'");
  assert.deepEqual(bucket.rows, [{ public: false, file_size_limit: 15728640 }], 'bucket de documentos deve ser privado e limitado a 15 MiB');
  console.log('Supabase foundation: migration válida; RLS e bucket privado passaram nos cenários básicos.');
} finally {
  await db.close();
}

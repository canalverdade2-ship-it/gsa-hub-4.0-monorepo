import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(import.meta.dirname, '..');
const db = new PGlite();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema storage;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text,
    unique(bucket_id,name)
  );
  create function storage.foldername(text) returns text[] language sql immutable as $$
    select string_to_array($1, '/')
  $$;
`);

const migrations = [
  '20261008000100_gsa3_supabase_foundation.sql',
  '20261008000200_direct_browser_data_access.sql',
  '20261008000300_edge_settings.sql',
  '20261008000400_login_rate_limit.sql'
];
for (const migration of migrations) {
  const sql = await readFile(resolve(root, 'supabase', 'migrations', migration), 'utf8');
  await db.exec(sql);
}

const adminId = '11111111-1111-4111-8111-111111111111';
const clientAuthId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const contractAdminId = '44444444-4444-4444-8444-444444444444';
const otherClientAuthId = '55555555-5555-4555-8555-555555555555';
const otherCustomerId = '66666666-6666-4666-8666-666666666666';
await db.query(`insert into auth.users(id,email) values ($1,'admin@example.test'),($2,'client@example.test'),($3,'contracts@example.test'),($4,'other-client@example.test')`, [adminId, clientAuthId, contractAdminId, otherClientAuthId]);
await db.query(`insert into public.gsa_clients(id,legacy_id,person_type,tax_document,name) values ($1,'111','PF','12345678901','Cliente Teste')`, [customerId]);
await db.query(`insert into public.gsa_clients(id,legacy_id,person_type,tax_document,name) values ($1,'222','PF','98765432100','Outro Cliente')`, [otherCustomerId]);
await db.query(`insert into public.gsa_profiles(id,role,admin_role,permissions,full_name,active) values ($1,'admin','Atendimento','["settings","clients"]'::jsonb,'Admin Teste',true)`, [adminId]);
await db.query(`insert into public.gsa_profiles(id,role,admin_role,permissions,customer_id,full_name,active) values ($1,'client','Cliente','[]'::jsonb,$2,'Cliente Teste',true)`, [clientAuthId, customerId]);
await db.query(`insert into public.gsa_profiles(id,role,admin_role,permissions,customer_id,full_name,active) values ($1,'client','Cliente','[]'::jsonb,$2,'Outro Cliente',true)`, [otherClientAuthId, otherCustomerId]);
await db.query(`insert into public.gsa_profiles(id,role,admin_role,permissions,full_name,active) values ($1,'admin','Contratos','["proposals","contracts"]'::jsonb,'Admin Contratos',true)`, [contractAdminId]);

await db.query(`
  insert into public.gsa_legacy_records(id,kind,customer_id,payload) values
    ('client-row','clients',null,'{"id":111,"code":"CL111","name":"Cliente Teste"}'),
    ('proposal-row','proposals',$1,'{"id":7,"code":"PROP-TEST-0007","status":"Aguardando aceite","clientId":"111"}'),
    ('order-row','orders',$1,'{"id":8,"code":"OS108","clientId":"111","stages":[{"name":"Etapa","internalNote":"segredo"}]}'),
    ('ticket-row','tickets',$1,'{"id":"ticket-row","code":"TCK-1","clientId":"111","messages":[{"message":"visível","internal":false},{"message":"interno","internal":true}]}'),
    ('notice-client-row','notifications',$1,'{"id":"notice-client","kind":"proposals","audience":"client","read":false}'),
    ('notice-admin','notifications',$1,'{"id":"notice-admin","kind":"documents","audience":"admin","read":false}'),
    ('other-proposal','proposals',$2,'{"id":9,"code":"PROP-OTHER-0009","status":"Aguardando aceite","clientId":"222"}'),
    ('uploaded-contract','contracts',$1,'{"id":20,"code":"CONT-TEST-20","status":"Pendente","clientId":"111"}');
`, [customerId, otherCustomerId]);

await db.exec(`set role authenticated; set request.jwt.claim.sub = '${adminId}';`);
const moduleGate = await db.query(`select public.gsa_admin_has_module('clients') as clients, public.gsa_admin_has_module('finance') as finance`);
assert(moduleGate.rows[0].clients === true && moduleGate.rows[0].finance === false, 'Admin module permissions are not enforced.');
const visibleKinds = await db.query(`select kind from public.gsa_legacy_records order by kind`);
assert(visibleKinds.rows.some((row) => row.kind === 'clients'), 'Admin with client permission cannot read client records.');
assert(!visibleKinds.rows.some((row) => row.kind === 'proposals'), 'Admin without proposal permission can read proposal records.');
const sequence = await db.query(`select public.gsa_next_business_id('clients',101) as id`);
assert(Number(sequence.rows[0].id) === 101, 'Atomic business id counter did not initialize at its requested start.');
await db.exec('reset role; reset request.jwt.claim.sub;');

await db.exec(`set role authenticated; set request.jwt.claim.sub = '${clientAuthId}';`);
const snapshot = await db.query(`select public.gsa_client_portal_state() as state`);
const state = snapshot.rows[0].state;
assert(state.proposals.length === 1 && state.proposals[0].code === 'PROP-TEST-0007', "Client snapshot returned another client's proposal or missed its own.");
assert(!('internalNote' in state.orders[0].stages[0]), 'Client snapshot leaked an internal order-stage note.');
assert(state.tickets[0].messages.length === 1, 'Client snapshot leaked an internal ticket message.');
assert(state.notifications.length === 1 && state.notifications[0].id === 'notice-client', 'Client snapshot included an admin notification.');
const contractUpload = await db.query(`select public.gsa_client_upload_contract('CONT-TEST-20',$1,'signed-copy.pdf','application/pdf',1024) as contract`, [`${customerId}/contracts/signed-copy.pdf`]);
assert(contractUpload.rows[0].contract.status === 'Em análise', 'Client contract upload was not stored in the Supabase-owned contract record.');
const decision = await db.query(`select public.gsa_client_decide_proposal('proposal-row','accept',null) as proposal`);
assert(decision.rows[0].proposal.status === 'Aceita', 'Client proposal acceptance did not persist.');
await db.query(`select public.gsa_client_mark_record_notification_read('notice-client')`);
const readNotice = await db.query(`select payload->>'read' as read from public.gsa_legacy_records where payload->>'id'='notice-client'`);
assert(readNotice.rows[0].read === 'true', 'Client could not mark their own notification as read.');
await db.exec('reset role; reset request.jwt.claim.sub;');

await db.exec(`set role authenticated; set request.jwt.claim.sub = '${otherClientAuthId}';`);
const otherSnapshot = await db.query(`select public.gsa_client_portal_state() as state`);
assert(otherSnapshot.rows[0].state.proposals.length === 1 && otherSnapshot.rows[0].state.proposals[0].code === 'PROP-OTHER-0009', 'RLS did not isolate the second client to their own proposal.');
await db.exec('reset role; reset request.jwt.claim.sub;');

await db.exec(`set role authenticated; set request.jwt.claim.sub = '${contractAdminId}';`);
const converted = await db.query(`select public.gsa_admin_convert_proposal('PROP-TEST-0007','{"serviceTitle":"Consultoria","total":12000}'::jsonb) as contract`);
assert(converted.rows[0].contract.status === 'Pendente', 'Admin proposal conversion did not create a pending contract.');
const convertedProposal = await db.query(`select payload->>'status' as status from public.gsa_legacy_records where id='proposal-row'`);
assert(convertedProposal.rows[0].status === 'Convertida', 'Proposal did not become converted after contract creation.');
await db.query(`select public.gsa_admin_delete_contract($1)`, [String(converted.rows[0].contract.id)]);
const restoredProposal = await db.query(`select payload->>'status' as status,payload->>'contractId' as contract_id from public.gsa_legacy_records where id='proposal-row'`);
assert(restoredProposal.rows[0].status === 'Aceita' && restoredProposal.rows[0].contract_id === null, 'Deleting the contract did not restore its accepted proposal.');
await db.exec('reset role; reset request.jwt.claim.sub;');

await db.exec('set role service_role;');
const attemptKey = 'a'.repeat(64);
const attempts = [];
for (let index = 0; index < 11; index++) {
  const { rows } = await db.query(`select public.gsa_consume_client_login_attempt($1,'2026-10-08T12:00:00Z') as attempts`, [attemptKey]);
  attempts.push(Number(rows[0].attempts));
}
assert(attempts[0] === 1 && attempts[10] === 11, 'Client login rate limiting did not count attempts atomically.');
await db.exec('reset role;');

await db.close();
console.log(`Supabase migrations and direct-access policies validated (${migrations.length} migrations).`);

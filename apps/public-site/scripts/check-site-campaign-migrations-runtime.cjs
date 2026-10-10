const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { Client } = require('pg');

const root = process.cwd();
const database = 'gsa_site_campaigns_runtime_test';
const runtimeDatabaseUrl = process.env.ADMIN_RUNTIME_DB_URL || process.env.DATABASE_URL;
if (!runtimeDatabaseUrl) {
  console.log('[runtime-db] SKIP: defina ADMIN_RUNTIME_DB_URL para executar este teste no PostgreSQL da VPS/túnel (porta 5433).');
  process.exit(0);
}
const connection = { connectionString: runtimeDatabaseUrl };

const migrations = [
  'supabase/migrations/20260724223000_site_campaigns_schema.sql',
  'supabase/migrations/20260724223100_site_campaigns_public_api.sql',
  'supabase/migrations/20260724223200_site_campaigns_admin_api.sql',
  'supabase/migrations/20260724223300_site_campaigns_security.sql',
  'supabase/migrations/20260724223400_site_campaigns_delete_api.sql',
  'supabase/migrations/20260724223500_site_campaigns_action_permissions.sql',
  'supabase/migrations/20260724223600_site_campaigns_permission_visibility.sql',
  'supabase/migrations/20260724223700_site_campaigns_permission_hardening.sql',
];

const IDS = {
  admin: '00000000-0000-4000-8000-000000000101',
  adminSession: '00000000-0000-4000-8000-000000000102',
  collaborator: '00000000-0000-4000-8000-000000000103',
  collaboratorSession: '00000000-0000-4000-8000-000000000104',
};
const TOKENS = { admin: 'campaign-admin-token', collaborator: 'campaign-collaborator-token' };

const baseline = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN COALESCE(auth.jwt()->>'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (auth.jwt()->>'sub')::uuid
    ELSE NULL
  END
$$;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(auth.jwt()->>'role', ''), 'anon')
$$;

CREATE TABLE public.colaboradores (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  email text,
  telefone text,
  status text NOT NULL DEFAULT 'ativo'
);
CREATE TABLE public.colaborador_modulos (
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  modulo_id text NOT NULL,
  PRIMARY KEY (colaborador_id, modulo_id)
);
CREATE TABLE public.sistema_sessoes (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'ativo',
  ator_tipo text NOT NULL,
  ator_id uuid NOT NULL,
  ator_nome text,
  session_token text NOT NULL,
  expira_em timestamptz
);
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
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gsa_admin_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_actor_type text := v_claims->'app_metadata'->>'gsa_actor_type';
  v_actor_id text := v_claims->'app_metadata'->>'gsa_actor_id';
  v_session_id text := v_claims->'app_metadata'->>'gsa_session_id';
  v_name text;
BEGIN
  IF v_actor_type NOT IN ('admin','colaborador')
     OR v_actor_id IS NULL
     OR v_session_id IS NULL THEN
    RAISE EXCEPTION 'Contexto administrativo inválido' USING ERRCODE = '42501';
  END IF;
  SELECT s.ator_nome INTO v_name
  FROM public.sistema_sessoes s
  WHERE s.id = v_session_id::uuid
    AND s.ator_tipo = v_actor_type
    AND s.ator_id = v_actor_id::uuid
    AND lower(s.status) = 'ativo'
    AND (s.expira_em IS NULL OR s.expira_em > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão administrativa inválida' USING ERRCODE = '42501';
  END IF;
  IF v_actor_type = 'colaborador' AND NOT EXISTS (
    SELECT 1 FROM public.colaboradores c
    WHERE c.id = v_actor_id::uuid AND lower(c.status) = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Colaborador sem acesso' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('actor_type',v_actor_type,'actor_id',v_actor_id,'actor_name',v_name,'name',v_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_validate_context(p_sessao_id uuid DEFAULT NULL, p_session_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_context jsonb := public.gsa_admin_context();
BEGIN
  IF p_sessao_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sistema_sessoes s
    WHERE s.id = p_sessao_id
      AND s.session_token = p_session_token
      AND s.ator_tipo = v_context->>'actor_type'
      AND s.ator_id = (v_context->>'actor_id')::uuid
      AND lower(s.status) = 'ativo'
      AND (s.expira_em IS NULL OR s.expira_em > now())
  ) THEN
    RAISE EXCEPTION 'Token administrativo inválido' USING ERRCODE = '42501';
  END IF;
  RETURN v_context;
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_has_module(p_module text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_context jsonb := public.gsa_admin_context();
BEGIN
  IF v_context->>'actor_type' = 'admin' THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.colaborador_modulos cm
    WHERE cm.colaborador_id = (v_context->>'actor_id')::uuid
      AND cm.modulo_id = p_module
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_assert_module(p_module text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.gsa_admin_has_module(p_module) THEN
    RAISE EXCEPTION 'Módulo não autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;

INSERT INTO public.colaboradores(id,nome,email,status)
VALUES ('${IDS.collaborator}','Colaborador Campanhas','colaborador@example.com','ativo');
INSERT INTO public.sistema_sessoes(id,status,ator_tipo,ator_id,ator_nome,session_token,expira_em)
VALUES
  ('${IDS.adminSession}','ativo','admin','${IDS.admin}','Administrador','${TOKENS.admin}',now()+interval '1 day'),
  ('${IDS.collaboratorSession}','ativo','colaborador','${IDS.collaborator}','Colaborador Campanhas','${TOKENS.collaborator}',now()+interval '1 day');
`;

function claims(type, actorId, sessionId) {
  return JSON.stringify({
    role: type === 'anon' ? 'anon' : 'authenticated',
    sub: type === 'anon' ? undefined : actorId,
    app_metadata: type === 'anon' ? {} : {
      gsa_actor_type: type,
      gsa_actor_id: actorId,
      gsa_session_id: sessionId,
    },
  });
}

async function setClaims(client, type, actorId, sessionId) {
  await client.query("SELECT set_config('request.jwt.claims', $1, false)", [claims(type, actorId, sessionId)]);
}

async function expectError(action, pattern) {
  let caught = null;
  try { await action(); } catch (error) { caught = error; }
  assert.ok(caught, 'Era esperado que a operação falhasse.');
  if (pattern) assert.match(String(caught.message || caught), pattern);
}

async function recreateDatabase() {
  const client = new Client({ ...connection, database: 'postgres' });
  await client.connect();
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`);
    }
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
    await client.query(`DROP DATABASE IF EXISTS ${database}`);
    await client.query(`CREATE DATABASE ${database}`);
  } finally { await client.end(); }
}

async function dropDatabase() {
  const client = new Client({ ...connection, database: 'postgres' });
  await client.connect();
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [database]);
    await client.query(`DROP DATABASE IF EXISTS ${database}`);
  } finally { await client.end(); }
}

async function applyMigrations(client) {
  await client.query(baseline);
  for (const file of migrations) {
    const sql = await readFile(resolve(root, file), 'utf8');
    await client.query(sql);
  }
}

function campaignPayload(overrides = {}) {
  return {
    internal_name: 'Campanha runtime',
    title: 'Campanha de validação',
    subtitle: 'Fluxo completo',
    body: 'Validação automatizada do módulo.',
    category: 'announcement',
    format: 'popup',
    template: 'institutional_light',
    priority: 80,
    cta_label: 'Conhecer',
    cta_url: '/servicos',
    cta_target: '_self',
    secondary_cta_label: null,
    secondary_cta_url: null,
    image_desktop_url: null,
    image_mobile_url: null,
    image_alt: null,
    target_pages: ['*'],
    audience: 'all',
    devices: ['desktop','tablet','mobile'],
    starts_at: null,
    ends_at: null,
    frequency_model: 'once_per_session',
    frequency_value: 1,
    dismissible: true,
    dismiss_on_backdrop: true,
    dismiss_on_escape: true,
    auto_close_seconds: null,
    ...overrides,
  };
}

async function run() {
  await recreateDatabase();
  const client = new Client({ ...connection, database });
  await client.connect();
  try {
    await applyMigrations(client);

    const tables = await client.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('gsa_site_campaigns','gsa_site_campaign_events','gsa_site_campaign_history','gsa_site_campaign_permissions') ORDER BY relname`);
    assert.equal(tables.rowCount, 4);
    assert.ok(tables.rows.every((row) => row.relrowsecurity), 'Todas as tabelas devem ter RLS ativo.');

    const policies = await client.query("SELECT count(*)::int AS total FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'gsa_site_campaign_assets_%'");
    assert.equal(policies.rows[0].total, 4, 'As quatro policies de storage devem existir.');

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    const created = await client.query(
      'SELECT public.gsa_admin_upsert_site_campaign(NULL,$1::jsonb,$2,$3) AS result',
      [JSON.stringify(campaignPayload()), IDS.adminSession, TOKENS.admin],
    );
    const campaignId = created.rows[0].result.campaign.id;
    assert.equal(created.rows[0].result.campaign.status, 'draft');

    await expectError(
      () => client.query('SELECT public.gsa_admin_upsert_site_campaign(NULL,$1::jsonb,$2,$3)', [JSON.stringify(campaignPayload({ internal_name: 'Link inseguro', cta_url: 'javascript:alert(1)' })), IDS.adminSession, TOKENS.admin]),
      /Link inseguro ou inválido/,
    );

    const published = await client.query(
      "SELECT public.gsa_admin_set_site_campaign_status($1,'publish',$2,$3) AS result",
      [campaignId, IDS.adminSession, TOKENS.admin],
    );
    assert.equal(published.rows[0].result.campaign.status, 'active');

    await setClaims(client, 'anon');
    const firstDelivery = await client.query(
      "SELECT public.gsa_public_site_campaigns('/','desktop','clients',$1,$2,NULL) AS result",
      ['visitor-runtime-0001','session-runtime-0001'],
    );
    assert.equal(firstDelivery.rows[0].result.length, 1);
    assert.equal(firstDelivery.rows[0].result[0].id, campaignId);
    assert.equal(firstDelivery.rows[0].result[0].audience, 'all');

    const secondDelivery = await client.query(
      "SELECT public.gsa_public_site_campaigns('/','desktop','guests',$1,$2,NULL) AS result",
      ['visitor-runtime-0001','session-runtime-0001'],
    );
    assert.deepEqual(secondDelivery.rows[0].result, [], 'A frequência por sessão deve impedir nova impressão.');

    const click = await client.query(
      "SELECT public.gsa_public_site_campaign_event($1,'click','/','desktop','guests',$2,$3,NULL,'{}'::jsonb) AS result",
      [campaignId,'visitor-runtime-0001','session-runtime-0001'],
    );
    assert.equal(click.rows[0].result.duplicate, false);
    const duplicateClick = await client.query(
      "SELECT public.gsa_public_site_campaign_event($1,'click','/','desktop','guests',$2,$3,NULL,'{}'::jsonb) AS result",
      [campaignId,'visitor-runtime-0001','session-runtime-0001'],
    );
    assert.equal(duplicateClick.rows[0].result.duplicate, true);

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    const overview = await client.query('SELECT public.gsa_admin_site_campaigns_overview($1,$2) AS result', [IDS.adminSession, TOKENS.admin]);
    assert.equal(overview.rows[0].result.totals.impressions, 1);
    assert.equal(overview.rows[0].result.totals.clicks, 1);
    assert.ok(overview.rows[0].result.current_permissions.includes('publish'));

    const draft = await client.query(
      'SELECT public.gsa_admin_upsert_site_campaign(NULL,$1::jsonb,$2,$3) AS result',
      [JSON.stringify(campaignPayload({ internal_name: 'Rascunho do colaborador', title: 'Permissão granular' })), IDS.adminSession, TOKENS.admin],
    );
    const draftId = draft.rows[0].result.campaign.id;

    await client.query(
      'SELECT public.gsa_admin_set_site_campaign_permissions($1,true,$2::text[],$3,$4)',
      [IDS.collaborator, ['view'], IDS.adminSession, TOKENS.admin],
    );
    await setClaims(client, 'colaborador', IDS.collaborator, IDS.collaboratorSession);
    const collaboratorOverview = await client.query('SELECT public.gsa_admin_site_campaigns_overview($1,$2) AS result', [IDS.collaboratorSession, TOKENS.collaborator]);
    assert.deepEqual(collaboratorOverview.rows[0].result.current_permissions, ['view']);
    assert.equal(collaboratorOverview.rows[0].result.totals.impressions, 0, 'Métricas devem ser ocultadas sem permissão.');
    await expectError(
      () => client.query("SELECT public.gsa_admin_set_site_campaign_status($1,'publish',$2,$3)", [draftId, IDS.collaboratorSession, TOKENS.collaborator]),
      /não possui permissão/i,
    );

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    await client.query(
      'SELECT public.gsa_admin_set_site_campaign_permissions($1,true,$2::text[],$3,$4)',
      [IDS.collaborator, ['view','publish','metrics'], IDS.adminSession, TOKENS.admin],
    );
    await setClaims(client, 'colaborador', IDS.collaborator, IDS.collaboratorSession);
    const collaboratorPublish = await client.query("SELECT public.gsa_admin_set_site_campaign_status($1,'publish',$2,$3) AS result", [draftId, IDS.collaboratorSession, TOKENS.collaborator]);
    assert.equal(collaboratorPublish.rows[0].result.campaign.status, 'active');

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    await client.query("UPDATE public.gsa_site_campaigns SET ends_at=now()-interval '1 second' WHERE id=$1", [campaignId]);
    await client.query('SELECT public.gsa_site_campaign_refresh_states()');
    const ended = await client.query('SELECT status FROM public.gsa_site_campaigns WHERE id=$1', [campaignId]);
    assert.equal(ended.rows[0].status, 'ended');
    const automaticHistory = await client.query("SELECT count(*)::int AS total FROM public.gsa_site_campaign_history WHERE campaign_id=$1 AND action='AUTO_ENDED'", [campaignId]);
    assert.equal(automaticHistory.rows[0].total, 1);

    const disposable = await client.query(
      'SELECT public.gsa_admin_upsert_site_campaign(NULL,$1::jsonb,$2,$3) AS result',
      [JSON.stringify(campaignPayload({ internal_name: 'Rascunho descartável', title: 'Exclusão auditada' })), IDS.adminSession, TOKENS.admin],
    );
    const disposableId = disposable.rows[0].result.campaign.id;
    await client.query('SELECT public.gsa_admin_delete_site_campaign($1,$2,$3)', [disposableId, IDS.adminSession, TOKENS.admin]);
    const deleted = await client.query('SELECT count(*)::int AS total FROM public.gsa_site_campaigns WHERE id=$1', [disposableId]);
    assert.equal(deleted.rows[0].total, 0);
    const deletedHistory = await client.query("SELECT count(*)::int AS total FROM public.gsa_site_campaign_history WHERE campaign_name='Rascunho descartável' AND action='DELETED'");
    assert.equal(deletedHistory.rows[0].total, 1);

    console.log('Migrations e fluxos runtime da Central de Avisos e Campanhas validados com sucesso.');
  } finally {
    await client.end();
    await dropDatabase();
  }
}

run().catch(async (error) => {
  console.error(error);
  try { await dropDatabase(); } catch { /* banco temporário já removido */ }
  process.exitCode = 1;
});

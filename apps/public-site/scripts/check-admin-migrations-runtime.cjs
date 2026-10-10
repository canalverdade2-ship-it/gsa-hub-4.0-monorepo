const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { Client } = require('pg');

const root = process.cwd();
const database = 'gsa_admin_runtime_test';
const runtimeDatabaseUrl = process.env.ADMIN_RUNTIME_DB_URL || process.env.DATABASE_URL;
if (!runtimeDatabaseUrl) {
  console.log('[runtime-db] SKIP: defina ADMIN_RUNTIME_DB_URL para executar este teste no PostgreSQL da VPS/túnel (porta 5433).');
  process.exit(0);
}
const connection = { connectionString: runtimeDatabaseUrl };

const migrations = [
  'supabase/migrations/20260720234500_admin_identity_permissions_hardening.sql',
  'supabase/migrations/20260720235450_enable_admin_extensions.sql',
  'supabase/migrations/20260720235500_admin_secure_operations.sql',
  'supabase/migrations/20260721000500_admin_module_rls_boundaries.sql',
  'supabase/migrations/20260721001500_private_admin_documents.sql',
  'supabase/migrations/20260721002500_secure_admin_settings.sql',
  'supabase/migrations/20260721003000_hash_collaborator_credentials.sql',
];

const IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  adminSession: '00000000-0000-4000-8000-000000000002',
  collaborator: '00000000-0000-4000-8000-000000000003',
  collaboratorSession: '00000000-0000-4000-8000-000000000004',
};
const TOKENS = { admin: 'admin-token', collaborator: 'collaborator-token' };

async function recreateDatabase() {
  const client = new Client({ ...connection, database: 'postgres' });
  await client.connect();
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$;`);
    }
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]);
    await client.query(`DROP DATABASE IF EXISTS ${database}`);
    await client.query(`CREATE DATABASE ${database}`);
  } finally {
    await client.end();
  }
}

async function dropDatabase() {
  const client = new Client({ ...connection, database: 'postgres' });
  await client.connect();
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]);
    await client.query(`DROP DATABASE IF EXISTS ${database}`);
  } finally {
    await client.end();
  }
}

const baseline = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE TABLE public.funcoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, email text, telefone text,
  status text NOT NULL DEFAULT 'ativo', credencial_acesso text UNIQUE, credencial_hash text,
  funcao_id uuid REFERENCES public.funcoes(id), modulos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.colaborador_modulos (
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  modulo_id text NOT NULL, PRIMARY KEY (colaborador_id, modulo_id)
);
CREATE TABLE public.sistema_sessoes (
  id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'ativo', ator_tipo text, ator_id uuid,
  ator_nome text, session_token text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz
);
CREATE TABLE public.solicitacoes_exclusao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  colaborador_id uuid REFERENCES public.colaboradores(id), tabela text NOT NULL,
  registro_id uuid NOT NULL, motivo text, status text NOT NULL DEFAULT 'pendente', data_decisao timestamptz
);
CREATE TABLE public.sistema_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ator_tipo text, ator_id uuid, ator_nome text,
  acao text, detalhes text, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gsa_admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_type text NOT NULL, actor_id uuid NOT NULL,
  module text NOT NULL, action text NOT NULL, target_type text, target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gsa_admin_notification_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_type text NOT NULL, actor_id uuid NOT NULL,
  source_table text NOT NULL, notification_id text NOT NULL, read_at timestamptz,
  dismissed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_type, actor_id, source_table, notification_id)
);
CREATE TABLE public.admin_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), titulo text, mensagem text, modulo text, tab text,
  item_id uuid, tipo text, prioridade text, destinatario_tipo text, colaborador_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), titulo text, mensagem text, modulo text, tab text,
  item_id uuid, tipo text, prioridade text, acao_origem text, destinatario_tipo text,
  colaborador_id uuid, data_criacao timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), razao_social text, cnpj text, telefone text, responsavel text
);
CREATE TABLE public.formas_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, slug text UNIQUE,
  tipo text, instrucoes text, ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.system_settings (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE public.viagens_orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.classificados_anuncios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), titulo text, status text, motivo_rejeicao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.classificados_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposta_id uuid, status_moderacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.classificados_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.classificados_transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.saude_parceiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text, status text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ordens_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cliente_id uuid, codigo_fiscal text,
  status_emissao text, observacoes text, arquivo_nf_url text, arquivo_nf_xml_url text,
  numero_nota text, data_emissao timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.gsa_validate_session(p_sessao_id uuid, p_session_token text)
RETURNS TABLE(is_valid boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sistema_sessoes s
    WHERE s.id = p_sessao_id AND s.session_token = p_session_token
      AND lower(s.status) IN ('ativo','ativa','active')
      AND (s.expira_em IS NULL OR s.expira_em > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_write_audit(
  p_module text, p_action text, p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.gsa_admin_audit_events(
    id, actor_type, actor_id, module, action, target_type, target_id, details
  ) VALUES (
    v_id,
    COALESCE(v_claims->'app_metadata'->>'gsa_actor_type','admin'),
    COALESCE(NULLIF(v_claims->'app_metadata'->>'gsa_actor_id','')::uuid, '${IDS.admin}'::uuid),
    p_module, p_action, p_target_type, p_target_id, COALESCE(p_details,'{}'::jsonb)
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_set_notification_state(
  p_sessao_id uuid DEFAULT NULL, p_session_token text DEFAULT NULL,
  p_notification_id text DEFAULT NULL, p_read boolean DEFAULT true,
  p_dismiss boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_actor_type text := v_claims->'app_metadata'->>'gsa_actor_type';
  v_actor_id uuid := (v_claims->'app_metadata'->>'gsa_actor_id')::uuid;
  v_source text;
  v_original text;
BEGIN
  IF p_notification_id LIKE 'admin_%' THEN
    v_source := 'admin_notificacoes'; v_original := substring(p_notification_id FROM 7);
  ELSIF p_notification_id LIKE 'gen_%' THEN
    v_source := 'notificacoes'; v_original := substring(p_notification_id FROM 5);
  ELSE
    RAISE EXCEPTION 'Identificador inválido';
  END IF;
  INSERT INTO public.gsa_admin_notification_state(
    actor_type, actor_id, source_table, notification_id, read_at, dismissed_at, updated_at
  ) VALUES (
    v_actor_type, v_actor_id, v_source, v_original,
    CASE WHEN p_read THEN now() END, CASE WHEN p_dismiss THEN now() END, now()
  ) ON CONFLICT(actor_type, actor_id, source_table, notification_id) DO UPDATE SET
    read_at = CASE WHEN p_read THEN now() ELSE public.gsa_admin_notification_state.read_at END,
    dismissed_at = CASE WHEN p_dismiss THEN now() ELSE public.gsa_admin_notification_state.dismissed_at END,
    updated_at = now();
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_moderar_mensagem_classificado(
  p_mensagem_id uuid, p_proposta_id uuid, p_acao text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.classificados_mensagens
  SET status_moderacao = CASE WHEN p_acao = 'approve' THEN 'aprovada' ELSE 'rejeitada' END
  WHERE id = p_mensagem_id;
  RETURN jsonb_build_object('success', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_login_colaborador(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.colaboradores%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.colaboradores WHERE credencial_acesso = p_code LIMIT 1;
  IF NOT FOUND OR lower(COALESCE(v_row.status,'ativo')) <> 'ativo' THEN
    RETURN jsonb_build_object('valid', false, 'success', false);
  END IF;
  RETURN jsonb_build_object('valid', true, 'success', true, 'session', jsonb_build_object(
    'ator_tipo','colaborador','ator_id',v_row.id,'ator_nome',v_row.nome
  ));
END;
$$;

INSERT INTO public.colaboradores(id,nome,status,credencial_acesso,modulos)
VALUES ('${IDS.collaborator}','Colaborador legado','ativo','123456','["viagens"]'::jsonb);
INSERT INTO public.colaborador_modulos(colaborador_id,modulo_id)
VALUES ('${IDS.collaborator}','viagens');
INSERT INTO public.sistema_sessoes(id,status,ator_tipo,ator_id,ator_nome,session_token,expira_em)
VALUES
  ('${IDS.adminSession}','ativo','admin','${IDS.admin}','Administrador','${TOKENS.admin}',now()+interval '1 day'),
  ('${IDS.collaboratorSession}','ativo','colaborador','${IDS.collaborator}','Colaborador legado','${TOKENS.collaborator}',now()+interval '1 day');
`;

function claims(type, id, sessionId) {
  return JSON.stringify({ app_metadata: { gsa_actor_type: type, gsa_actor_id: id, gsa_session_id: sessionId } });
}

async function setClaims(client, type, id, sessionId) {
  await client.query("SELECT set_config('request.jwt.claims', $1, false)", [claims(type, id, sessionId)]);
}

async function expectError(operation, label) {
  let failed = false;
  try { await operation(); } catch { failed = true; }
  assert.equal(failed, true, label);
}

async function applyMigrations(client) {
  for (const file of migrations) {
    const sql = await readFile(resolve(root, file), 'utf8');
    try { await client.query(sql); }
    catch (error) { error.message = `${file}: ${error.message}`; throw error; }
  }
}

async function run() {
  await recreateDatabase();
  const client = new Client({ ...connection, database });
  await client.connect();
  try {
    await client.query(baseline);
    await applyMigrations(client);

    await client.query(`
      GRANT USAGE ON SCHEMA public, auth, storage TO authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      ALTER TABLE public.viagens_orcamentos ENABLE ROW LEVEL SECURITY;
      CREATE POLICY test_viagens_permissive ON public.viagens_orcamentos AS PERMISSIVE FOR ALL TO authenticated USING(true) WITH CHECK(true);
      ALTER TABLE public.classificados_anuncios ENABLE ROW LEVEL SECURITY;
      CREATE POLICY test_classificados_permissive ON public.classificados_anuncios AS PERMISSIVE FOR ALL TO authenticated USING(true) WITH CHECK(true);
    `);

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    const context = await client.query('SELECT public.gsa_admin_get_context_secure($1,$2) AS value', [IDS.adminSession, TOKENS.admin]);
    assert.equal(context.rows[0].value.actor_type, 'admin');

    const migrated = await client.query(`
      SELECT credencial_acesso, credencial_hash,
             crypt('123456',credencial_hash)=credencial_hash AS matches
      FROM public.colaboradores WHERE id=$1
    `, [IDS.collaborator]);
    assert.notEqual(migrated.rows[0].credencial_acesso, '123456');
    assert.equal(migrated.rows[0].matches, true);

    const oldLogin = await client.query('SELECT public.gsa_login_colaborador($1) AS value', ['123456']);
    assert.equal(oldLogin.rows[0].value.valid, true);
    const bridgeLogin = await client.query('SELECT public.gsa_login_colaborador($1) AS value', [migrated.rows[0].credencial_acesso]);
    assert.equal(bridgeLogin.rows[0].value.valid, false);

    const created = await client.query(`SELECT public.gsa_admin_save_collaborator(
      $1,$2,NULL,$3::jsonb,$4::text[]
    ) AS value`, [IDS.adminSession, TOKENS.admin, JSON.stringify({ nome: 'Agente Viagens' }), ['viagens']]);
    const newId = created.rows[0].value.id;
    const credential = created.rows[0].value.initial_credential;
    assert.match(credential, /^[A-F0-9]{24}$/);
    const stored = await client.query(`SELECT credencial_acesso,
      crypt($2,credencial_hash)=credencial_hash AS matches
      FROM public.colaboradores WHERE id=$1`, [newId, credential]);
    assert.notEqual(stored.rows[0].credencial_acesso, credential);
    assert.equal(stored.rows[0].matches, true);

    const newSession = '00000000-0000-4000-8000-000000000010';
    const newToken = 'new-collaborator-token';
    await client.query(`INSERT INTO public.sistema_sessoes(
      id,status,ator_tipo,ator_id,ator_nome,session_token,expira_em
    ) VALUES($1,'ativo','colaborador',$2,'Agente Viagens',$3,now()+interval '1 day')`, [newSession, newId, newToken]);
    await setClaims(client, 'colaborador', newId, newSession);
    const permissions = await client.query(`SELECT
      public.gsa_admin_has_module('viagens') AS viagens,
      public.gsa_admin_has_module('saude') AS saude,
      public.gsa_admin_has_module('classificados') AS classificados
    `);
    assert.equal(permissions.rows[0].viagens, true);
    assert.equal(permissions.rows[0].saude, false);
    assert.equal(permissions.rows[0].classificados, false);

    await client.query("INSERT INTO public.viagens_orcamentos(status) VALUES('recebido')");
    await client.query("INSERT INTO public.classificados_anuncios(titulo,status) VALUES('restrito','aguardando_revisao')");
    await client.query('SET ROLE authenticated');
    const travelCount = await client.query('SELECT count(*)::integer AS value FROM public.viagens_orcamentos');
    const classifiedCount = await client.query('SELECT count(*)::integer AS value FROM public.classificados_anuncios');
    await client.query('RESET ROLE');
    assert.equal(travelCount.rows[0].value, 1);
    assert.equal(classifiedCount.rows[0].value, 0);

    const values = [];
    const params = [];
    for (let index = 0; index < 120; index += 1) {
      const base = index * 3;
      values.push(`($${base + 1},$${base + 2},$${base + 3},'colaborador')`);
      params.push(`Aviso ${index}`, newId, 'viagens');
    }
    await client.query(`INSERT INTO public.admin_notificacoes(
      titulo,colaborador_id,modulo,destinatario_tipo
    ) VALUES ${values.join(',')}`, params);
    await client.query("INSERT INTO public.admin_notificacoes(titulo,modulo,destinatario_tipo) VALUES('Somente admin','acessos','admin')");
    const notifications = await client.query('SELECT public.gsa_admin_list_notifications($1,$2,500) AS value', [newSession, newToken]);
    assert.equal(notifications.rows[0].value.length, 120);
    assert.equal(notifications.rows[0].value.some((item) => item.titulo === 'Somente admin'), false);
    const marked = await client.query('SELECT public.gsa_admin_mark_all_notifications($1,$2,false) AS value', [newSession, newToken]);
    assert.equal(marked.rows[0].value.processed, 120);

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    await client.query('SELECT public.gsa_admin_update_settings_secure($1,$2,$3::jsonb)', [IDS.adminSession, TOKENS.admin, JSON.stringify([{ key: 'valor_minimo_saque', value: '75' }])]);
    const setting = await client.query("SELECT value FROM public.system_settings WHERE key='valor_minimo_saque'");
    assert.equal(setting.rows[0].value, '75');
    await expectError(() => client.query('SELECT public.gsa_admin_update_settings_secure($1,$2,$3::jsonb)', [IDS.adminSession, TOKENS.admin, JSON.stringify([{ key: 'admin_access_code', value: 'segredo' }])]), 'Chave fora da allowlist deve falhar.');

    await setClaims(client, 'colaborador', newId, newSession);
    await client.query("UPDATE public.colaboradores SET status='suspenso' WHERE id=$1", [newId]);
    await expectError(() => client.query('SELECT public.gsa_admin_context()'), 'Colaborador suspenso deve perder o contexto.');

    console.log('Migrations administrativas: PostgreSQL, sessão, credenciais, RLS, notificações e allowlist validados.');
  } finally {
    await client.end();
    await dropDatabase();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

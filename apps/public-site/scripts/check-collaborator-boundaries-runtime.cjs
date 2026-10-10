const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { Client } = require('pg');

const database = 'gsa_collaborator_boundaries_test';
const runtimeDatabaseUrl = process.env.ADMIN_RUNTIME_DB_URL || process.env.DATABASE_URL;
if (!runtimeDatabaseUrl) {
  console.log('[runtime-db] SKIP: defina ADMIN_RUNTIME_DB_URL para executar este teste no PostgreSQL da VPS/túnel (porta 5433).');
  process.exit(0);
}
const connection = { connectionString: runtimeDatabaseUrl };

const IDS = {
  admin: '10000000-0000-4000-8000-000000000001',
  adminSession: '10000000-0000-4000-8000-000000000002',
  provider: '10000000-0000-4000-8000-000000000003',
  providerSession: '10000000-0000-4000-8000-000000000004',
  demand: '10000000-0000-4000-8000-000000000005',
  demandSession: '10000000-0000-4000-8000-000000000006',
  access: '10000000-0000-4000-8000-000000000007',
  accessSession: '10000000-0000-4000-8000-000000000008',
  client: '10000000-0000-4000-8000-000000000009',
  providerRecord: '10000000-0000-4000-8000-000000000010',
  order: '10000000-0000-4000-8000-000000000011',
  ownDemand: '10000000-0000-4000-8000-000000000012',
  otherDemand: '10000000-0000-4000-8000-000000000013',
  ownHistory: '10000000-0000-4000-8000-000000000014',
  otherHistory: '10000000-0000-4000-8000-000000000015',
};

const TOKENS = {
  admin: 'admin-boundary-token',
  provider: 'provider-boundary-token',
  demand: 'demand-boundary-token',
  access: 'access-boundary-token',
};

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

function claims(type, id, sessionId) {
  return JSON.stringify({ app_metadata: { gsa_actor_type: type, gsa_actor_id: id, gsa_session_id: sessionId } });
}

async function setClaims(client, type, id, sessionId) {
  await client.query("SELECT set_config('request.jwt.claims', $1, false)", [claims(type, id, sessionId)]);
}

async function expectError(operation, label) {
  let failed = false;
  try {
    await operation();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}

const baseline = String.raw`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE TABLE public.colaboradores (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  modulos jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE public.colaborador_modulos (
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  modulo_id text NOT NULL,
  PRIMARY KEY (colaborador_id, modulo_id)
);
CREATE TABLE public.sistema_sessoes (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  ator_tipo text,
  ator_id uuid,
  ator_nome text,
  session_token text NOT NULL,
  expira_em timestamptz
);
CREATE TABLE public.gsa_admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL,
  actor_id uuid NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  telefone text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.prestadores (
  id uuid PRIMARY KEY,
  nome_razao text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.prestador_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid REFERENCES public.prestadores(id),
  status text
);
CREATE TABLE public.ordens_servico (
  id uuid PRIMARY KEY,
  codigo_os text,
  cliente_id uuid REFERENCES public.clientes(id),
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id),
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.prestador_demandas (
  id uuid PRIMARY KEY,
  titulo text,
  descricao text,
  status text,
  prioridade text,
  prazo_limite timestamptz,
  os_id uuid REFERENCES public.ordens_servico(id),
  colaborador_id uuid REFERENCES public.colaboradores(id),
  prestador_id uuid REFERENCES public.prestadores(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.prestador_demandas_historico (
  id uuid PRIMARY KEY,
  demanda_id uuid NOT NULL REFERENCES public.prestador_demandas(id) ON DELETE CASCADE,
  tipo_evento text,
  motivo text,
  colaborador_origem_id uuid REFERENCES public.colaboradores(id),
  colaborador_destino_id uuid REFERENCES public.colaboradores(id),
  prestador_destino_id uuid REFERENCES public.prestadores(id),
  prestador_origem_id uuid REFERENCES public.prestadores(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.faturas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
CREATE TABLE public.saques (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
CREATE TABLE public.emprestimos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, valor_solicitado numeric);
CREATE TABLE public.cobrancas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
CREATE TABLE public.tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);
CREATE TABLE public.ordens_fiscais (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status_emissao text);

CREATE OR REPLACE FUNCTION public.gsa_admin_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_claims jsonb := auth.jwt();
  v_type text := COALESCE(v_claims->'app_metadata'->>'gsa_actor_type', '');
  v_actor_id uuid := NULLIF(v_claims->'app_metadata'->>'gsa_actor_id', '')::uuid;
  v_session_id uuid := NULLIF(v_claims->'app_metadata'->>'gsa_session_id', '')::uuid;
  v_status text;
  v_name text;
  v_modules jsonb := '[]'::jsonb;
BEGIN
  IF v_type NOT IN ('admin', 'colaborador') OR v_actor_id IS NULL OR v_session_id IS NULL THEN
    RAISE EXCEPTION 'Sessão administrativa inválida.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sistema_sessoes s
    WHERE s.id = v_session_id AND s.ator_tipo = v_type AND s.ator_id = v_actor_id
      AND s.status = 'ativo' AND (s.expira_em IS NULL OR s.expira_em > now())
  ) THEN
    RAISE EXCEPTION 'Sessão administrativa revogada.' USING ERRCODE = '42501';
  END IF;
  IF v_type = 'colaborador' THEN
    SELECT c.status, c.nome,
           COALESCE(jsonb_agg(cm.modulo_id) FILTER (WHERE cm.modulo_id IS NOT NULL), '[]'::jsonb)
      INTO v_status, v_name, v_modules
      FROM public.colaboradores c
      LEFT JOIN public.colaborador_modulos cm ON cm.colaborador_id = c.id
     WHERE c.id = v_actor_id
     GROUP BY c.id, c.status, c.nome;
    IF v_status <> 'ativo' THEN
      RAISE EXCEPTION 'Acesso do colaborador revogado.' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_name := 'Administrador';
  END IF;
  RETURN jsonb_build_object(
    'actor_type', v_type,
    'actor_id', v_actor_id,
    'actor_name', v_name,
    'session_id', v_session_id,
    'modules', v_modules
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_validate_context(p_sessao_id uuid DEFAULT NULL, p_session_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_context jsonb := public.gsa_admin_context();
BEGIN
  IF p_sessao_id IS NULL OR COALESCE(p_session_token, '') = '' THEN
    RAISE EXCEPTION 'Identificação completa da sessão é obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_sessao_id::text <> v_context->>'session_id' OR NOT EXISTS (
    SELECT 1 FROM public.sistema_sessoes s
    WHERE s.id = p_sessao_id AND s.session_token = p_session_token AND s.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'Sessão administrativa inválida ou expirada.' USING ERRCODE = '42501';
  END IF;
  RETURN v_context;
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_has_module(p_module text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_context jsonb := public.gsa_admin_context();
BEGIN
  IF v_context->>'actor_type' = 'admin' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_context->'modules') granted(value) WHERE granted.value = p_module);
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_assert_module(p_module text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.gsa_admin_has_module(p_module) THEN
    RAISE EXCEPTION 'Módulo não autorizado.' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_restrict_collaborator_to_module(p_module text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(auth.jwt()->'app_metadata'->>'gsa_actor_type', '') <> 'colaborador' THEN RETURN true; END IF;
  RETURN public.gsa_admin_has_module(p_module);
END;
$$;
CREATE OR REPLACE FUNCTION public.gsa_current_actor_type() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt()->'app_metadata'->>'gsa_actor_type', '')
$$;
CREATE OR REPLACE FUNCTION public.gsa_current_actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt()->'app_metadata'->>'gsa_actor_id', '')::uuid
$$;
CREATE OR REPLACE FUNCTION public.gsa_sync_colaborador_modules(p_colaborador_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_modules jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(modulo_id ORDER BY modulo_id), '[]'::jsonb) INTO v_modules
  FROM public.colaborador_modulos WHERE colaborador_id = p_colaborador_id;
  UPDATE public.colaboradores SET modulos = v_modules WHERE id = p_colaborador_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_get_pendency_counts_secure(p_sessao_id uuid DEFAULT NULL, p_session_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.gsa_admin_context();
  RETURN jsonb_build_object(
    'cadastro_prestadores_pendentes', 0,
    'cadastro_prestadores_analise', 0,
    'vendas_demandas_internas', 0,
    'vendas_demandas_ativas', 0
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.gsa_admin_dashboard_snapshot(p_sessao_id uuid DEFAULT NULL, p_session_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.gsa_admin_context();
  RETURN jsonb_build_object('permissions', jsonb_build_object(
    'cadastro', public.gsa_admin_has_module('cadastro'),
    'operacoes', public.gsa_admin_has_module('operacoes')
  ), 'lists', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.gsa_admin_sensitive_change_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER trg_existing_provider_audit AFTER INSERT OR UPDATE OR DELETE ON public.prestadores
FOR EACH ROW EXECUTE FUNCTION public.gsa_admin_sensitive_change_audit();
CREATE TRIGGER trg_existing_demand_audit AFTER INSERT OR UPDATE OR DELETE ON public.prestador_demandas
FOR EACH ROW EXECUTE FUNCTION public.gsa_admin_sensitive_change_audit();

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissive_clients ON public.clientes AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY collaborator_module_guard_clients ON public.clientes AS RESTRICTIVE FOR ALL TO authenticated
USING (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('cadastro'))
WITH CHECK (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('cadastro'));

ALTER TABLE public.prestadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissive_providers ON public.prestadores AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY collaborator_module_guard_prestadores ON public.prestadores AS RESTRICTIVE FOR ALL TO authenticated
USING (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('prestadores'))
WITH CHECK (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('prestadores'));
CREATE POLICY gsa_collaborator_module_prestadores ON public.prestadores AS RESTRICTIVE FOR ALL TO authenticated
USING (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('cadastro'))
WITH CHECK (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('cadastro'));

ALTER TABLE public.prestador_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissive_provider_docs ON public.prestador_documentos AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY gsa_collaborator_module_prestador_documentos ON public.prestador_documentos AS RESTRICTIVE FOR ALL TO authenticated
USING (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('cadastro'))
WITH CHECK (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('cadastro'));

ALTER TABLE public.prestador_demandas ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissive_demands ON public.prestador_demandas AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY collaborator_assigned_demands_only ON public.prestador_demandas AS RESTRICTIVE FOR ALL TO authenticated
USING (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('operacoes') OR (public.gsa_admin_has_module('demandas') AND colaborador_id = public.gsa_current_actor_id()))
WITH CHECK (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('operacoes') OR (public.gsa_admin_has_module('demandas') AND colaborador_id = public.gsa_current_actor_id()));
CREATE POLICY gsa_collaborator_module_prestador_demandas ON public.prestador_demandas AS RESTRICTIVE FOR ALL TO authenticated
USING (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('operacoes'))
WITH CHECK (public.gsa_current_actor_type() <> 'colaborador' OR public.gsa_admin_has_module('operacoes'));

ALTER TABLE public.prestador_demandas_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissive_history ON public.prestador_demandas_historico AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.colaboradores(id, nome, status) VALUES
  ('${IDS.provider}', 'Colaborador Prestadores', 'ativo'),
  ('${IDS.demand}', 'Colaborador Demandas', 'ativo'),
  ('${IDS.access}', 'Colaborador Acessos', 'ativo');
INSERT INTO public.colaborador_modulos(colaborador_id, modulo_id) VALUES
  ('${IDS.provider}', 'prestadores'),
  ('${IDS.demand}', 'demandas'),
  ('${IDS.access}', 'acessos');
INSERT INTO public.sistema_sessoes(id, status, ator_tipo, ator_id, ator_nome, session_token, expira_em) VALUES
  ('${IDS.adminSession}', 'ativo', 'admin', '${IDS.admin}', 'Administrador', '${TOKENS.admin}', now() + interval '1 day'),
  ('${IDS.providerSession}', 'ativo', 'colaborador', '${IDS.provider}', 'Colaborador Prestadores', '${TOKENS.provider}', now() + interval '1 day'),
  ('${IDS.demandSession}', 'ativo', 'colaborador', '${IDS.demand}', 'Colaborador Demandas', '${TOKENS.demand}', now() + interval '1 day'),
  ('${IDS.accessSession}', 'ativo', 'colaborador', '${IDS.access}', 'Colaborador Acessos', '${TOKENS.access}', now() + interval '1 day');
INSERT INTO public.clientes(id, nome, telefone, status) VALUES ('${IDS.client}', 'Cliente Sigiloso', '11999999999', 'ativo');
INSERT INTO public.prestadores(id, nome_razao, status) VALUES ('${IDS.providerRecord}', 'Prestador Auditável', 'pendente');
INSERT INTO public.ordens_servico(id, codigo_os, cliente_id, status) VALUES ('${IDS.order}', 'OS-SEGURA', '${IDS.client}', 'andamento');
INSERT INTO public.orcamentos(cliente_id, status) VALUES ('${IDS.client}', 'aberto');
INSERT INTO public.prestador_demandas(id, titulo, status, prioridade, os_id, colaborador_id) VALUES
  ('${IDS.ownDemand}', 'Demanda própria', 'aberta', 'normal', '${IDS.order}', '${IDS.demand}'),
  ('${IDS.otherDemand}', 'Demanda alheia', 'aberta', 'urgente', '${IDS.order}', '${IDS.provider}');
INSERT INTO public.prestador_demandas_historico(id, demanda_id, tipo_evento, motivo, colaborador_origem_id) VALUES
  ('${IDS.ownHistory}', '${IDS.ownDemand}', 'criacao', 'Histórico próprio', '${IDS.demand}'),
  ('${IDS.otherHistory}', '${IDS.otherDemand}', 'criacao', 'Histórico alheio', '${IDS.provider}');

GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
`;

async function run() {
  await recreateDatabase();
  const client = new Client({ ...connection, database });
  await client.connect();
  try {
    await client.query(baseline);
    const migration = await readFile(resolve(process.cwd(), 'supabase/migrations/20260721130000_harden_collaborator_authorization.sql'), 'utf8');
    await client.query(migration);

    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);
    assert.equal((await client.query("SELECT public.gsa_admin_has_module('acessos') AS value")).rows[0].value, true);
    await expectError(
      () => client.query('INSERT INTO public.colaborador_modulos(colaborador_id, modulo_id) VALUES($1, $2)', [IDS.provider, 'acessos']),
      'Nem o administrador deve atribuir o papel crítico de acessos a um colaborador.',
    );

    await setClaims(client, 'colaborador', IDS.access, IDS.accessSession);
    assert.equal((await client.query("SELECT public.gsa_admin_has_module('acessos') AS value")).rows[0].value, false);
    assert.equal((await client.query('SELECT count(*)::integer AS value FROM public.colaborador_modulos WHERE colaborador_id=$1', [IDS.access])).rows[0].value, 0);
    await expectError(() => client.query("SELECT public.gsa_admin_assert_module('acessos')"), 'Colaborador legado não pode manter Gestão de Acessos.');

    await setClaims(client, 'colaborador', IDS.provider, IDS.providerSession);
    const providerPermissions = await client.query(`SELECT
      public.gsa_admin_has_module('prestadores') AS prestadores,
      public.gsa_admin_has_module('cadastro') AS cadastro,
      public.gsa_admin_has_module('operacoes') AS operacoes
    `);
    assert.equal(providerPermissions.rows[0].prestadores, true);
    assert.equal(providerPermissions.rows[0].cadastro, false);
    assert.equal(providerPermissions.rows[0].operacoes, false);

    await client.query('SET ROLE authenticated');
    const providerVisible = await client.query('SELECT count(*)::integer AS value FROM public.prestadores');
    const clientsHidden = await client.query('SELECT count(*)::integer AS value FROM public.clientes');
    await client.query('RESET ROLE');
    assert.equal(providerVisible.rows[0].value, 1);
    assert.equal(clientsHidden.rows[0].value, 0);

    const providerDashboard = await client.query('SELECT public.gsa_collaborator_dashboard_snapshot($1,$2) AS value', [IDS.providerSession, TOKENS.provider]);
    assert.equal(providerDashboard.rows[0].value.metrics.prestadoresPendentes, 1);
    assert.equal(Object.hasOwn(providerDashboard.rows[0].value.metrics, 'clientes'), false);
    await expectError(
      () => client.query('SELECT public.gsa_admin_dashboard_snapshot($1,$2)', [IDS.providerSession, 'token-incorreto']),
      'Snapshot administrativo deve validar o segredo da sessão.',
    );

    await setClaims(client, 'colaborador', IDS.demand, IDS.demandSession);
    const demandPermissions = await client.query(`SELECT
      public.gsa_admin_has_module('demandas') AS demandas,
      public.gsa_admin_has_module('operacoes') AS operacoes
    `);
    assert.equal(demandPermissions.rows[0].demandas, true);
    assert.equal(demandPermissions.rows[0].operacoes, false);

    await client.query('SET ROLE authenticated');
    const ownDemands = await client.query('SELECT count(*)::integer AS value FROM public.prestador_demandas');
    const ownHistory = await client.query('SELECT count(*)::integer AS value FROM public.prestador_demandas_historico');
    await client.query('RESET ROLE');
    assert.equal(ownDemands.rows[0].value, 1);
    assert.equal(ownHistory.rows[0].value, 1);

    const demandList = await client.query('SELECT public.gsa_collaborator_list_demands($1,$2,500) AS value', [IDS.demandSession, TOKENS.demand]);
    assert.equal(demandList.rows[0].value.length, 1);
    assert.equal(demandList.rows[0].value[0].id, IDS.ownDemand);
    assert.equal(JSON.stringify(demandList.rows[0].value).includes('11999999999'), false);

    const demandHistory = await client.query('SELECT public.gsa_collaborator_demand_history($1,$2,$3,500) AS value', [IDS.demandSession, TOKENS.demand, IDS.ownDemand]);
    assert.equal(demandHistory.rows[0].value.length, 1);
    await expectError(
      () => client.query('SELECT public.gsa_collaborator_demand_history($1,$2,$3,500)', [IDS.demandSession, TOKENS.demand, IDS.otherDemand]),
      'Histórico de demanda alheia deve ser recusado.',
    );

    const demandDashboard = await client.query('SELECT public.gsa_collaborator_dashboard_snapshot($1,$2) AS value', [IDS.demandSession, TOKENS.demand]);
    assert.equal(demandDashboard.rows[0].value.metrics.demandas, 1);
    assert.equal(Object.hasOwn(demandDashboard.rows[0].value.metrics, 'orcamentos'), false);
    await expectError(
      () => client.query('SELECT public.gsa_admin_get_pendency_counts_secure($1,$2)', [IDS.demandSession, 'token-incorreto']),
      'Contagens administrativas devem validar o segredo da sessão.',
    );

    await client.query('SET ROLE authenticated');
    await client.query("UPDATE public.prestador_demandas SET status='ativa' WHERE id=$1", [IDS.ownDemand]);
    await client.query('RESET ROLE');
    const demandAudit = await client.query("SELECT module FROM public.gsa_admin_audit_events WHERE target_type='prestador_demandas' ORDER BY created_at DESC LIMIT 1");
    assert.equal(demandAudit.rows[0].module, 'demandas');

    await setClaims(client, 'colaborador', IDS.provider, IDS.providerSession);
    await client.query('SET ROLE authenticated');
    await client.query("UPDATE public.prestadores SET status='em_analise' WHERE id=$1", [IDS.providerRecord]);
    await client.query('RESET ROLE');
    const providerAudit = await client.query("SELECT module FROM public.gsa_admin_audit_events WHERE target_type='prestadores' ORDER BY created_at DESC LIMIT 1");
    assert.equal(providerAudit.rows[0].module, 'prestadores');

    console.log('Fronteiras do colaborador: escalada, aliases, RLS, RPCs, token e auditoria validados em PostgreSQL real.');
  } finally {
    await client.end();
    await dropDatabase();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

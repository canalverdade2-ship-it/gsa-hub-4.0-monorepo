import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { routes } from '../src/routing/routeCatalog';
import { matchRoute } from '../src/routing/routeMatcher';
import { adminModulePath, canAccessAdminModule, normalizeAdminModule } from '../src/routing/adminAccess';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const landing = read('src/pages/Careers/CareersLandingPage.tsx');
const access = read('src/pages/Careers/CareersAccessPage.tsx');
const admin = read('src/components/admin/CareersAdminModule.tsx');
const vacanciesAdmin = read('src/components/admin/CareerVacanciesManager.tsx');
const migration = read('supabase/migrations/20260722235959_harden_gsa_careers_flow.sql');
const evolutionMigration = read('supabase/migrations/20260831103000_careers_vacancies_and_notifications.sql');
const notifications = read('supabase/functions/gsa-careers-notifications/index.ts');

assert.equal(routes.public.careers(), '/trabalhe-conosco');
assert.equal(routes.login.careers(), '/trabalhe-conosco/acesso');
assert.equal(routes.admin.trabalheConosco(), '/admin/trabalhe-conosco');
assert.equal(matchRoute('/trabalhe-conosco', '', '').module, 'trabalhe-conosco');
assert.equal(matchRoute('/trabalhe-conosco/acesso', '', '').itemId, 'acesso');
assert.equal(matchRoute('/admin/trabalhe-conosco', '', '').area, 'admin');
assert.equal(normalizeAdminModule('careers'), 'trabalhe-conosco');
assert.equal(adminModulePath('trabalhe-conosco'), '/admin/trabalhe-conosco');
assert.equal(canAccessAdminModule('admin', [], 'trabalhe-conosco'), true);
assert.equal(canAccessAdminModule('colaborador', ['trabalhe-conosco'], 'trabalhe-conosco'), true);
assert.equal(canAccessAdminModule('colaborador', [], 'trabalhe-conosco'), false);

for (const [name, source] of [
  ['landing', landing],
  ['access', access],
  ['admin', admin],
] as const) {
  assert.equal(source.includes("localStorage.getItem('gsa_career_apps')"), false, `${name} não pode usar fallback local`);
  assert.equal(source.includes("localStorage.setItem('gsa_career_apps')"), false, `${name} não pode persistir candidatura localmente`);
  assert.equal(source.includes(".from('gsa_careers_applications')"), false, `${name} não pode acessar a tabela diretamente`);
}

assert.match(landing, /gsa_public_submit_career_application/);
assert.match(landing, /gsa_public_list_career_vacancies/);
assert.match(landing, /vacancy_id/);
assert.match(landing, /gsa_public_confirm_career_resume/);
assert.match(landing, /gsa-careers-resumes/);
assert.match(landing, /Nenhum protocolo foi gerado/);
assert.doesNotMatch(landing, /Math\.random\(\).*RH-/s);
assert.doesNotMatch(landing, /readAsDataURL/);

assert.match(access, /gsa_public_get_career_application/);
assert.match(access, /p_protocol/);
assert.match(access, /p_document/);
assert.doesNotMatch(access, /select\('\*'\)/);

assert.match(admin, /callAdminRpc/);
assert.match(admin, /gsa_admin_list_career_applications/);
assert.match(admin, /gsa_admin_get_career_application/);
assert.match(admin, /gsa_admin_update_career_application/);
assert.match(admin, /gsa_admin_get_career_resume_reference/);
assert.match(admin, /createSignedUrl/);
assert.doesNotMatch(admin, /Status da candidatura atualizado com sucesso!/);
assert.match(admin, /dispatchCareerStatusNotification/);

assert.match(vacanciesAdmin, /gsa_admin_list_career_vacancies/);
assert.match(vacanciesAdmin, /gsa_admin_upsert_career_vacancy/);
assert.doesNotMatch(vacanciesAdmin, /\.from\('gsa_careers_vacancies'\)/);

assert.match(evolutionMigration, /CREATE TABLE IF NOT EXISTS public\.gsa_careers_vacancies/);
assert.match(evolutionMigration, /CREATE TABLE IF NOT EXISTS public\.gsa_careers_notification_outbox/);
assert.match(evolutionMigration, /gsa_careers_status_notification_trigger/);
assert.match(evolutionMigration, /gsa_public_list_career_vacancies/);
assert.match(evolutionMigration, /gsa_admin_upsert_career_vacancy/);
assert.match(evolutionMigration, /gsa_admin_confirm_career_notification/);
assert.match(evolutionMigration, /REVOKE ALL ON public\.gsa_careers_notification_outbox/);
assert.match(notifications, /RESEND_API_KEY/);
assert.match(notifications, /delivery_status: 'sent'/);
assert.match(notifications, /next_attempt_at/);

assert.match(migration, /DROP POLICY IF EXISTS gsa_careers_public_select/);
assert.match(migration, /REVOKE ALL ON TABLE public\.gsa_careers_applications FROM anon, authenticated/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.gsa_careers_application_history/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.gsa_public_get_career_application/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.gsa_admin_update_career_application/);
assert.match(migration, /CREATE POLICY gsa_careers_resume_public_insert/);
assert.match(migration, /public = false/);
assert.match(migration, /gsa_careers_validate_cpf/);
assert.match(migration, /Transicao de status nao permitida/);
assert.doesNotMatch(migration, /TO anon, authenticated\s+USING \(true\)/);

console.log('CAREERS_CONTRACTS_OK');

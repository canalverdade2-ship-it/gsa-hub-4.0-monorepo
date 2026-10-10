import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchRoute } from '../src/routing/routeMatcher';
import { isRouteAllowed } from '../src/routing/routeSecurity';

const read = (path: string) => readFileSync(path, 'utf8');
const loginHub = read('src/components/public/LoginHub.tsx');
const loginPage = read('src/pages/ClientLoginPage.tsx');
const businessRegistrationPage = read('src/pages/BusinessRegistrationPage.tsx');
const app = read('src/App.tsx');
const businessDashboard = read('src/components/business/BusinessDashboard.tsx');

assert.match(loginHub, /Área do Cliente Pessoa Física — PF/, 'O seletor deve identificar claramente o acesso PF.');
assert.match(loginHub, /Área do Cliente Empresa — PJ/, 'O seletor deve identificar claramente o acesso PJ.');
assert.doesNotMatch(loginPage, /<Modal|AccessibleDialog/, 'As páginas exclusivas de login não podem voltar a usar modal.');
assert.doesNotMatch(businessRegistrationPage, /<Modal|AccessibleDialog/, 'O cadastro empresarial deve permanecer como página exclusiva.');
assert.match(businessRegistrationPage, /gsa_public_register_client/, 'O cadastro empresarial deve usar o fluxo público seguro existente.');
assert.match(businessRegistrationPage, /tipo_pessoa:\s*'pj'/, 'O cadastro empresarial deve permanecer fixo como Pessoa Jurídica.');
assert.match(loginPage, /resolveAuthenticatedClientPersonType/, 'O login deve confirmar o tipo real da conta autenticada.');
assert.match(app, /portalVariant="business"/, 'O aplicativo deve montar o shell empresarial na área PJ.');
assert.match(app, /routes\.login\.businessRegistration\(\)/, 'O botão empresarial deve navegar para a página exclusiva de cadastro.');
assert.doesNotMatch(app, /onRegister=\{\(\) => navigate\(`\$\{routes\.login\.root\(\)\}\?mode=register&type=pj`\)\}/, 'O cadastro PJ não pode voltar ao modal legado.');
assert.match(businessDashboard, /GSA HUB Empresas/, 'O dashboard empresarial deve preservar a identidade exclusiva.');

const personalLogin = matchRoute('/login/pessoa-fisica', '', '');
assert.equal(personalLogin.area, 'login');
assert.equal(personalLogin.module, 'pessoa-fisica');

const businessRecovery = matchRoute('/login/empresa/recuperar-senha', '', '');
assert.equal(businessRecovery.area, 'login');
assert.equal(businessRecovery.module, 'empresa');
assert.equal(businessRecovery.submodule, 'recuperar-senha');

const businessRegistration = matchRoute('/login/empresa/cadastro', '', '');
assert.equal(businessRegistration.area, 'login');
assert.equal(businessRegistration.module, 'empresa');
assert.equal(businessRegistration.submodule, 'cadastro');

const legacyBusinessRegistration = matchRoute('/login', '?mode=register&type=pj', '');
assert.equal(legacyBusinessRegistration.module, 'empresa');
assert.equal(legacyBusinessRegistration.submodule, 'cadastro');

const businessOperation = matchRoute('/empresa/operacoes/orcamentos/operacao-1', '', '');
assert.equal(businessOperation.area, 'business');
assert.equal(businessOperation.module, 'servicos_assinaturas');
assert.equal(businessOperation.submodule, 'orcamentos');
assert.equal(businessOperation.itemId, 'operacao-1');

assert.equal(isRouteAllowed('business', { clientId: 'cliente-pj', clientPersonType: 'pj' }), true);
assert.equal(isRouteAllowed('business', { clientId: 'cliente-pf', clientPersonType: 'pf' }), false);
assert.equal(isRouteAllowed('client', { clientId: 'cliente-pj', clientPersonType: 'pj' }), false);
assert.equal(isRouteAllowed('client', { clientId: 'cliente-pf', clientPersonType: 'pf' }), true);

console.log('Separação dos portais PF e PJ validada com sucesso.');

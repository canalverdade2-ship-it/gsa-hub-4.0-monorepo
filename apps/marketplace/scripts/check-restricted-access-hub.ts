import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routes } from '../src/routing/routeCatalog';
import { matchRoute } from '../src/routing/routeMatcher';

const read = (path: string) => readFileSync(path, 'utf8');
const loginHub = read('src/components/public/LoginHub.tsx');
const restrictedPage = read('src/pages/RestrictedAccessHubPage.tsx');
const providerPage = read('src/pages/ProviderAccessPage.tsx');
const providerLanding = read('src/pages/Prestador/ProviderLandingPage.tsx');
const home = read('src/pages/Home.tsx');
const app = read('src/App.tsx');

assert.match(loginHub, /Área do Prestador/, 'O seletor principal deve exibir a Área do Prestador.');
assert.match(loginHub, /onClick=\{onProviderAccess\}/, 'A Área do Prestador deve abrir sua página exclusiva.');
assert.match(loginHub, /Acesso Restrito/, 'O seletor principal deve exibir o acesso restrito.');
assert.match(loginHub, /Exclusivo para Gestão e Colaborador GSA/, 'O acesso restrito deve identificar claramente seu público.');
assert.match(loginHub, /onClick=\{onRestrictedAccess\}/, 'O acesso restrito deve abrir sua página exclusiva.');

assert.doesNotMatch(home, /RestrictedAccessModal/, 'A página pública não deve mais montar o modal de acesso restrito.');
assert.doesNotMatch(restrictedPage, /<Modal|RestrictedAccessModal/, 'A Área Restrita deve ser uma página exclusiva.');
assert.match(restrictedPage, /Colaborador GSA/, 'A Área Restrita deve oferecer o acesso de Colaborador.');
assert.match(restrictedPage, /Gestão GSA/, 'A Área Restrita deve oferecer o acesso de Gestão.');
assert.doesNotMatch(restrictedPage, /Prestador GSA|Fornecedor GSA/, 'Prestador e Fornecedor não podem aparecer como perfis da Área Restrita.');
assert.match(restrictedPage, /loginAdmin/, 'A página restrita deve autenticar a Gestão.');
assert.match(restrictedPage, /loginColaborador/, 'A página restrita deve autenticar o Colaborador.');

assert.doesNotMatch(providerPage, /<Modal|RestrictedAccessModal/, 'A Área do Prestador deve ser uma página exclusiva.');
assert.match(providerPage, /Área do Prestador/, 'A página deve possuir a identidade da Área do Prestador.');
assert.match(providerPage, /loginWithPin[\s\S]*'prestador'/, 'O login deve usar a autenticação já existente do prestador.');
assert.match(providerPage, /gsa_public_register_provider/, 'O cadastro deve usar o fluxo público seguro de prestadores.');
assert.match(providerPage, /Cadastre-se como prestador/, 'A página deve permitir novo cadastro de prestador.');
assert.match(providerPage, /confirmação de identidade e a aprovação do cadastro/, 'O primeiro acesso deve manter a liberação segura.');

assert.match(providerLanding, /Rede de Prestadores GSA HUB/, 'A apresentação deve possuir identidade institucional própria.');
assert.match(providerLanding, /Seu trabalho encontra estrutura para crescer/, 'A apresentação deve comunicar a proposta de valor ao prestador.');
assert.match(providerLanding, /PORTAL_FEATURES/, 'A página institucional deve apresentar os recursos reais da área logada.');
assert.match(providerLanding, /PROCESS_STEPS/, 'A página institucional deve explicar o processo de credenciamento.');
assert.match(providerLanding, /onLogin/, 'A apresentação deve oferecer acesso para prestadores aprovados.');
assert.match(providerLanding, /onRegister/, 'A apresentação deve encaminhar novos prestadores ao cadastro.');
assert.doesNotMatch(providerLanding, /loginWithPin|gsa_public_register_provider/, 'Login e cadastro devem permanecer em páginas próprias, fora da apresentação institucional.');

assert.match(app, /RestrictedAccessHubPage/, 'O aplicativo deve montar a página exclusiva da Área Restrita.');
assert.match(app, /ProviderAccessPage/, 'O aplicativo deve montar a página exclusiva da Área do Prestador.');
assert.match(app, /ProviderLandingPage/, 'O aplicativo deve montar a apresentação institucional do Prestador.');
assert.match(app, /\['acesso-restrito', 'admin', 'colaborador'\]\.includes\(route\.module\)/, 'As rotas restritas devem usar a página exclusiva.');
assert.match(app, /route\.module === 'prestador'/, 'A rota do prestador deve usar sua página exclusiva.');
assert.match(app, /routes\.provider\.home\(\)/, 'O seletor principal deve abrir primeiro a apresentação institucional.');
assert.match(app, /routes\.login\.providerRegistration\(\)/, 'O seletor de cadastro deve navegar para a rota exclusiva.');

assert.equal(routes.login.restricted(), '/login/acesso-restrito');
assert.equal(routes.login.provider(), '/login/prestador');
assert.equal(routes.login.providerRegistration(), '/login/prestador/cadastro');
assert.equal(routes.provider.home(), '/prestador');
assert.equal(routes.login.collaborator(), '/login/colaborador');
assert.equal(routes.login.admin(), '/login/admin');
assert.equal(routes.login.supplier(), '/fornecedor/login');

const restrictedRoute = matchRoute('/login/acesso-restrito', '', '');
assert.equal(restrictedRoute.area, 'login');
assert.equal(restrictedRoute.module, 'acesso-restrito');

const providerLoginRoute = matchRoute('/login/prestador', '', '');
assert.equal(providerLoginRoute.area, 'login');
assert.equal(providerLoginRoute.module, 'prestador');
assert.equal(providerLoginRoute.submodule, undefined);

const providerRegistrationRoute = matchRoute('/login/prestador/cadastro', '', '');
assert.equal(providerRegistrationRoute.area, 'login');
assert.equal(providerRegistrationRoute.module, 'prestador');
assert.equal(providerRegistrationRoute.submodule, 'cadastro');

const providerInstitutionalRoute = matchRoute('/prestador', '', '');
assert.equal(providerInstitutionalRoute.area, 'provider');
assert.equal(providerInstitutionalRoute.module, 'home');

for (const [path, module] of [
  ['/login/colaborador', 'colaborador'],
  ['/login/admin', 'admin'],
] as const) {
  const route = matchRoute(path, '', '');
  assert.equal(route.area, 'login');
  assert.equal(route.module, module);
}

const supplierRoute = matchRoute('/fornecedor/login', '', '');
assert.equal(supplierRoute.area, 'supplier');
assert.equal(supplierRoute.module, 'login');

console.log('Áreas exclusivas de acesso restrito e prestador validadas com sucesso.');

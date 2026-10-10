import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const files = {
  router: resolve(root, 'src/components/client/marketplace/MarketplaceGSAStore.tsx'),
  health: resolve(root, 'src/components/client/marketplace/protection/HealthMarketplaceLandingPage.tsx'),
  insurance: resolve(root, 'src/components/client/marketplace/protection/InsuranceMarketplaceLandingPage.tsx'),
  operational: resolve(root, 'src/components/client/marketplace/protection/ProtectionMarketplace.tsx'),
  rollback: resolve(root, 'docs/reversao-identidade-saude-seguros.md'),
};

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[protection-identity] ${message}`);
}

for (const [name, path] of Object.entries(files)) {
  assertContract(existsSync(path), `Arquivo obrigatório ausente: ${name} (${path})`);
}

const router = readFileSync(files.router, 'utf8');
const health = readFileSync(files.health, 'utf8');
const insurance = readFileSync(files.insurance, 'utf8');
const operational = readFileSync(files.operational, 'utf8');
const rollback = readFileSync(files.rollback, 'utf8');

assertContract(router.includes("import { HealthMarketplaceLandingPage }"), 'A página própria de Saúde não está importada no roteador do Marketplace.');
assertContract(router.includes("import { InsuranceMarketplaceLandingPage }"), 'A página própria de Seguros não está importada no roteador do Marketplace.');
assertContract(router.includes("currentModule === 'saude'"), 'O domínio Saúde não possui roteamento dedicado.');
assertContract(router.includes("currentModule === 'seguros'"), 'O domínio Seguros não possui roteamento dedicado.');
assertContract(router.includes('<HealthMarketplaceLandingPage'), 'A raiz de Saúde não entrega a experiência própria.');
assertContract(router.includes('<InsuranceMarketplaceLandingPage'), 'A raiz de Seguros não entrega a experiência própria.');
assertContract(router.includes('<ProtectionMarketplace'), 'Os fluxos operacionais compartilhados deixaram de ser preservados.');

for (const [label, source] of [['Saúde', health], ['Seguros', insurance]] as const) {
  assertContract(!source.includes('MarketplaceSubmoduleCard'), `${label} voltou a depender do card genérico do Marketplace como arquitetura principal.`);
  assertContract(!source.includes("from './ProtectionMarketplace'"), `${label} voltou a depender diretamente da página configurável antiga.`);
  assertContract(source.includes('onBackToMarketplace'), `${label} perdeu o retorno seguro ao Marketplace.`);
  assertContract(source.includes('onRequireAuth'), `${label} perdeu o controle de acesso para áreas protegidas.`);
}

assertContract(health.includes('Cuidado com orientação humana'), 'A identidade textual própria de Saúde não foi encontrada.');
assertContract(health.includes('Comece por quem precisa de cuidado'), 'A jornada específica de Saúde não foi encontrada.');
assertContract(insurance.includes('Mapa de proteção'), 'A arquitetura específica de Seguros não foi encontrada.');
assertContract(insurance.includes('risco que precisa ser compreendido'), 'A identidade textual própria de Seguros não foi encontrada.');

assertContract(operational.includes("export function ProtectionMarketplace"), 'O componente operacional compartilhado não está disponível.');
assertContract(rollback.includes('3a7b1693db6f17ccd3405af0e471443c28d6bba9'), 'O arquivo de reversão não registra o commit-base protegido.');
assertContract(rollback.includes('agent/identidade-saude-seguros'), 'O arquivo de reversão não registra a branch isolada.');

console.log('Contratos de identidade de GSA Saúde e GSA Seguros validados com sucesso.');

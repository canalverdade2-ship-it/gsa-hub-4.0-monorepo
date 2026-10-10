import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { routes } from '../src/routing/routeCatalog';
import { matchRoute } from '../src/routing/routeMatcher';

const root = process.cwd();

async function read(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

const marketplace = await read('src/components/client/marketplace/protection/ProtectionMarketplace.tsx');
const admin = await read('src/components/admin/ProtectionAdminModule.tsx');
const insuranceMigration = await read('supabase/migrations/20260724200000_protection_direct_quote_cleanup.sql');
const healthMigration = await read('supabase/migrations/20260724213000_saude_direct_quote_cleanup.sql');

for (const marker of [
  "label: 'GSA Saúde'",
  "label: 'GSA Seguros'",
  'actionLabel="Solicitar cotação"',
  'initialCategory={legacyCategoryKey}',
  'Tipo de plano selecionado',
  'Modalidade selecionada',
  "origem: 'marketplace_categoria'",
  'Escolher outra categoria',
  "normalizedSubmodule.startsWith('planos-')",
  "normalizedSubmodule.startsWith('modalidade-')",
]) {
  assert.ok(marketplace.includes(marker), `Fluxo público direto incompleto: ${marker}`);
}

for (const obsolete of [
  'ProtectionMarketplaceLegacy',
  'InsuranceDirectQuoteMarketplace',
  'gsa_public_listar_planos_saude',
  'saude_planos_publicos',
  'seguros_ofertas_publicas',
  "params.get('oferta')",
  'oferta_slug',
  'OfferCard',
  'OfferDetail',
]) {
  assert.ok(!marketplace.includes(obsolete), `Referência de catálogo ainda presente no marketplace: ${obsolete}`);
}

assert.ok(admin.includes("label: 'GSA Saúde'"), 'Painel direto não contempla GSA Saúde.');
assert.ok(admin.includes("label: 'GSA Seguros'"), 'Painel direto não contempla GSA Seguros.');
assert.ok(admin.includes('gsa_admin_list_resource'), 'O painel não lista os recursos operacionais.');
assert.ok(admin.includes('gsa_admin_save_protection_entity'), 'O painel não mantém parceiros.');
assert.ok(admin.includes('gsa_admin_create_protection_proposal'), 'O painel não cria propostas.');
assert.ok(!admin.includes("| 'produtos'"), 'O tipo de aba administrativa ainda inclui produtos.');
assert.ok(!admin.includes("tab: 'produtos'"), 'O painel ainda renderiza cartão de produtos.');
assert.ok(!admin.includes("label: 'Produtos'"), 'O painel ainda expõe catálogo.');
assert.ok(!admin.includes('produto_id'), 'A criação de proposta ainda depende de produto cadastrado.');
assert.ok(admin.includes("p_kind: 'parceiro'"), 'A manutenção de parceiros deve continuar ativa.');

for (const marker of [
  'DROP VIEW IF EXISTS public.seguros_ofertas_publicas CASCADE',
  'ALTER TABLE IF EXISTS public.seguros_propostas DROP COLUMN IF EXISTS produto_id',
  'gsa_client_seguros_criar_cotacao',
]) {
  assert.ok(insuranceMigration.includes(marker), `Migração de Seguros sem o contrato: ${marker}`);
}

for (const marker of [
  'O GSA Saúde passa a operar exclusivamente por solicitação de cotação.',
  'O GSA Viagens permanece integralmente com cadastro e catálogo de pacotes.',
  'gsa_client_saude_criar_cotacao',
  'DROP VIEW IF EXISTS public.saude_planos_publicos CASCADE',
  'ALTER TABLE IF EXISTS public.saude_propostas DROP COLUMN IF EXISTS produto_id CASCADE',
  "v_kind <> 'parceiro'",
  'gsa_catalogo_legado_arquivo',
  "'saude_produtos'",
  "p_payload - ARRAY['request_id', 'consentimento']",
]) {
  assert.ok(healthMigration.includes(marker), `Migração de Saúde sem o contrato: ${marker}`);
}

assert.ok(!healthMigration.includes("WHEN 'saude_produtos'"), 'A API administrativa ainda permite listar produtos de Saúde.');
assert.ok(!healthMigration.includes('viagens_pacotes'), 'A migration de Saúde não pode alterar pacotes de Viagens.');
assert.ok(!healthMigration.includes('gsa_admin_travel_create_package'), 'A migration de Saúde não pode alterar RPCs de Viagens.');

const healthDirectRoute = matchRoute(`${routes.marketplace.saude.cotacao()}/odontologico`, '', '');
assert.equal(healthDirectRoute.area, 'marketplace');
assert.equal(healthDirectRoute.module, 'saude');
assert.equal(healthDirectRoute.submodule, 'cotacao');
assert.equal(healthDirectRoute.itemId, 'odontologico');

const healthLegacyRoute = matchRoute(routes.marketplace.saude.odontologico(), '', '');
assert.equal(healthLegacyRoute.area, 'marketplace');
assert.equal(healthLegacyRoute.module, 'saude');
assert.equal(healthLegacyRoute.submodule, 'planos-odontologico');
assert.equal(healthLegacyRoute.itemId, undefined);

const insuranceRoute = matchRoute(`${routes.marketplace.seguros.cotacao()}/residencial`, '', '');
assert.equal(insuranceRoute.area, 'marketplace');
assert.equal(insuranceRoute.module, 'seguros');
assert.equal(insuranceRoute.submodule, 'cotacao');
assert.equal(insuranceRoute.itemId, 'residencial');

const travelRoute = matchRoute(routes.marketplace.travelPackages.ofertasNacionais(), '', '');
assert.equal(travelRoute.area, 'marketplace');
assert.equal(travelRoute.module, 'pacotes-viagem');
assert.equal(travelRoute.submodule, 'ofertas-nacionais');
assert.ok(routes.marketplace.travelPackages.pacote('recife').endsWith('/ofertas/recife'));

console.log('GSA Saúde e Seguros em cotação direta; catálogo de GSA Viagens preservado.');

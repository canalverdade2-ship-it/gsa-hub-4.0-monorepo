import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const wizardPath = path.join(root, 'src/components/client/marketplace/classifieds/CreateListingWizard.tsx');
const detailPath = path.join(root, 'src/components/client/marketplace/classifieds/ClassifiedDetailPage.tsx');
const storagePath = path.join(root, 'src/lib/classifiedStorage.ts');
const gatewayPath = path.join(root, 'supabase/functions/gsa-classified-media/index.ts');
const migrationPath = path.join(root, 'supabase/migrations/20260721183000_classifieds_media_storage_production.sql');
const verificationPath = path.join(root, 'scripts/classifieds-media-production-verification.sql');

for (const filePath of [wizardPath, detailPath, storagePath, gatewayPath, migrationPath, verificationPath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo obrigatório dos Classificados ausente: ${path.relative(root, filePath)}`);
  }
}

const wizard = fs.readFileSync(wizardPath, 'utf8');
const detail = fs.readFileSync(detailPath, 'utf8');
const storage = fs.readFileSync(storagePath, 'utf8');
const gateway = fs.readFileSync(gatewayPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');
const verification = fs.readFileSync(verificationPath, 'utf8');

const forbiddenWizardPatterns = [
  /Simular Upload/i,
  /Mocked/i,
  /para demonstração/i,
  /prompt\s*\(/,
  /Cole a URL de uma imagem/i,
];

for (const pattern of forbiddenWizardPatterns) {
  if (pattern.test(wizard)) {
    throw new Error(`Fluxo de demonstração voltou ao cadastro de anúncio: ${pattern}`);
  }
}

const requiredWizardContracts = [
  'type="file"',
  'accept="image/jpeg,image/png,image/webp"',
  'multiple',
  'uploadClassifiedImage',
  'removeClassifiedImage',
  'removeClassifiedImages',
  'CLASSIFIEDS_MAX_IMAGES',
  'CLASSIFIEDS_MAX_IMAGE_SIZE_MB',
  'formData.midias.length === 0',
  'p_midias: formData.midias.map',
];

for (const contract of requiredWizardContracts) {
  if (!wizard.includes(contract)) {
    throw new Error(`Contrato de upload real ausente no wizard: ${contract}`);
  }
}

const requiredProposalContracts = [
  "supabase.rpc('rpc_criar_proposta_classificado'",
  'p_valor_proposta: amount',
  'notificationService.notifyAdmin(',
  "'propostas'",
  "tab: 'propostas'",
  'navigate(routes.marketplace.classifieds.negociacoes())',
  'Proposta registrada nos Classificados GSA.',
  'negociação protegida dos Classificados',
];

for (const contract of requiredProposalContracts) {
  if (!detail.includes(contract)) {
    throw new Error(`Contrato de proposta moderada ausente nos Classificados: ${contract}`);
  }
}

const forbiddenProposalPatterns = [
  /Em breve:\s*Enviar proposta/i,
  /TODO:\s*Abrir modal de Proposta/i,
  /alert\s*\(\s*['"]Em breve/i,
];

for (const pattern of forbiddenProposalPatterns) {
  if (pattern.test(detail)) {
    throw new Error(`Fluxo não operacional voltou à proposta dos Classificados: ${pattern}`);
  }
}

const requiredClientStorageContracts = [
  "CLASSIFIEDS_MEDIA_BUCKET = 'classificados-midias'",
  "new Set(['image/jpeg', 'image/png', 'image/webp'])",
  "supabase.functions.invoke('gsa-classified-media'",
  "body.append('action', 'upload')",
  "body.append('client_id', clientId)",
  "body.append('draft_id', draftId)",
  "body: { action: 'delete', paths: normalized }",
];

for (const contract of requiredClientStorageContracts) {
  if (!storage.includes(contract)) {
    throw new Error(`Contrato do cliente de mídias ausente: ${contract}`);
  }
}

if (/\.storage\.from\s*\(/.test(storage)) {
  throw new Error('O navegador não pode gravar diretamente no Storage dos Classificados.');
}

const requiredGatewayContracts = [
  "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
  'admin.auth.getUser(accessToken)',
  "metadata.gsa_actor_type !== 'cliente'",
  "admin.rpc('gsa_validate_session'",
  'p_sessao_id: declaredSessionId',
  'p_session_token: declaredSessionToken',
  'validatedActorId !== clientId',
  "validatedActorType !== 'cliente'",
  ".from('clientes')",
  'validImageSignature(file)',
  'file.size > MAX_IMAGE_BYTES',
  'pathBelongsToClient(path, authenticated.clientId)',
];

for (const contract of requiredGatewayContracts) {
  if (!gateway.includes(contract)) {
    throw new Error(`Contrato do gateway seguro de mídias ausente: ${contract}`);
  }
}

const requiredMigrationContracts = [
  "'classificados-midias'",
  '8388608',
  "ARRAY['image/jpeg', 'image/png', 'image/webp']",
  'public = EXCLUDED.public',
];

for (const contract of requiredMigrationContracts) {
  if (!migration.includes(contract)) {
    throw new Error(`Contrato da migration de Storage ausente: ${contract}`);
  }
}

const forbiddenDirectWritePolicies = [
  /CREATE\s+POLICY[\s\S]*?FOR\s+INSERT/i,
  /CREATE\s+POLICY[\s\S]*?FOR\s+UPDATE/i,
  /CREATE\s+POLICY[\s\S]*?FOR\s+DELETE/i,
];

for (const pattern of forbiddenDirectWritePolicies) {
  if (pattern.test(migration)) {
    throw new Error('A migration não pode liberar escrita direta do navegador no bucket de Classificados.');
  }
}

const requiredVerificationContracts = [
  "WHERE id = 'classificados-midias'",
  "cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')",
  "RAISE EXCEPTION 'Existe política de escrita direta para o bucket classificados-midias.'",
  "SELECT 'CLASSIFIEDS_MEDIA_STORAGE_VERIFIED' AS verification_status",
];

for (const contract of requiredVerificationContracts) {
  if (!verification.includes(contract)) {
    throw new Error(`Contrato de verificação da produção ausente: ${contract}`);
  }
}

console.log('Classificados validados para upload e proposta moderada reais em produção.');

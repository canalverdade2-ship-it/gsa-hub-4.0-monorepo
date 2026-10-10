const { readFileSync, writeFileSync, unlinkSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const sourcePath = resolve(process.cwd(), 'scripts/check-admin-migrations-runtime.cjs');
const generatedPath = resolve(process.cwd(), 'scripts/.check-admin-migrations-runtime.generated.cjs');
const source = readFileSync(sourcePath, 'utf8');

const marker = source.includes("const migrations = [\r\n") ? "const migrations = [\r\n" : "const migrations = [\n";
const hardeningEntry = source.includes("  'supabase/migrations/20260720234500_admin_identity_permissions_hardening.sql',\r\n") ? "  'supabase/migrations/20260720234500_admin_identity_permissions_hardening.sql',\r\n" : "  'supabase/migrations/20260720234500_admin_identity_permissions_hardening.sql',\n";
const extensionsEntry = source.includes("  'supabase/migrations/20260720235450_enable_admin_extensions.sql',\r\n") ? "  'supabase/migrations/20260720235450_enable_admin_extensions.sql',\r\n" : "  'supabase/migrations/20260720235450_enable_admin_extensions.sql',\n";
const hashEntry = source.includes("  'supabase/migrations/20260721003000_hash_collaborator_credentials.sql',\r\n") ? "  'supabase/migrations/20260721003000_hash_collaborator_credentials.sql',\r\n" : "  'supabase/migrations/20260721003000_hash_collaborator_credentials.sql',\n";
const unsafeSuspensionScenarioRaw = `    await setClaims(client, 'colaborador', newId, newSession);\n    await client.query("UPDATE public.colaboradores SET status='suspenso' WHERE id=$1", [newId]);\n    await expectError(() => client.query('SELECT public.gsa_admin_context()'), 'Colaborador suspenso deve perder o contexto.');\n`;
const safeSuspensionScenarioRaw = `    await setClaims(client, 'admin', IDS.admin, IDS.adminSession);\n    await client.query("UPDATE public.colaboradores SET status='suspenso' WHERE id=$1", [newId]);\n    await setClaims(client, 'colaborador', newId, newSession);\n    await expectError(() => client.query('SELECT public.gsa_admin_context()'), 'Colaborador suspenso deve perder o contexto.');\n`;
const unsafeSuspensionScenario = source.includes("\r\n") ? unsafeSuspensionScenarioRaw.replace(/\n/g, "\r\n") : unsafeSuspensionScenarioRaw;
const safeSuspensionScenario = source.includes("\r\n") ? safeSuspensionScenarioRaw.replace(/\n/g, "\r\n") : safeSuspensionScenarioRaw;

for (const required of [marker, hardeningEntry, extensionsEntry, hashEntry, unsafeSuspensionScenario]) {
  if (!source.includes(required)) {
    throw new Error(`Não foi possível localizar a âncora da sequência de migrations: ${required.trim()}`);
  }
}

let generated = source.replace(
  marker,
  `${marker}  'supabase/migrations/20260720234400_admin_security_baseline_compat.sql',\n`,
);

generated = generated.replace(
  hardeningEntry,
  `${hardeningEntry}  'supabase/migrations/20260720235300_admin_security_state_restore.sql',\n`,
);

generated = generated.replace(
  extensionsEntry,
  `  'supabase/migrations/20260720235425_admin_protection_schema_compat.sql',\n${extensionsEntry}`,
);

generated = generated.replace(
  hashEntry,
  `${hashEntry}  'supabase/migrations/20260721003500_ticket_status_compat.sql',\n  'supabase/migrations/20260721003600_minimize_admin_dashboard_payload.sql',\n  'supabase/migrations/20260721003700_sensitive_admin_audit_triggers.sql',\n  'supabase/migrations/20260721003800_admin_session_token_validation_compat.sql',\n`,
);

generated = generated.replace(unsafeSuspensionScenario, safeSuspensionScenario);

writeFileSync(generatedPath, generated);
try {
  const result = spawnSync(process.execPath, [generatedPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  try { unlinkSync(generatedPath); } catch { /* arquivo temporário já removido */ }
}

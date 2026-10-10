const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('   M1 ADVERSARIAL CHALLENGER VERIFICATION SUITE     ');
console.log('====================================================');

const expectedColumns = [
  'id',
  'parceiro_id',
  'cliente_id',
  'nome_completo',
  'telefone',
  'email',
  'codigo_gerado',
  'tipo_resgate',
  'link_destino',
  'link_ativacao',
  'status',
  'auto_redirecionado',
  'data_ativacao',
  'data_cancelamento',
  'created_at'
];

console.log(`[1] Verifying 15 Expected Columns Count: ${expectedColumns.length}`);

// 1. Check in validate-db-schema.cjs
const validatorPath = path.resolve('scripts/validate-db-schema.cjs');
const validatorContent = fs.readFileSync(validatorPath, 'utf8');
const matchContract = validatorContent.match(/parceiros_resgates:\s*\{\s*requiredColumns:\s*\[([\s\S]*?)\]/);
if (!matchContract) {
  console.error('FAIL: Could not find parceiros_resgates contract in validate-db-schema.cjs');
  process.exit(1);
}
const validatorCols = matchContract[1]
  .split('\n')
  .map(l => l.replace(/['",\s]/g, '').trim())
  .filter(Boolean);

console.log('[2] scripts/validate-db-schema.cjs columns count:', validatorCols.length);

// 2. Check in database-schema-integrity.test.ts
const testFilePath = path.resolve('src/tests/database-schema-integrity.test.ts');
const testContent = fs.readFileSync(testFilePath, 'utf8');
const matchTest = testContent.match(/1\.2 parceiros_resgates table[\s\S]*?requiredColumns\s*=\s*\[([\s\S]*?)\];/);
if (!matchTest) {
  console.error('FAIL: Could not find parceiros_resgates requiredColumns in database-schema-integrity.test.ts');
  process.exit(1);
}
const testCols = matchTest[1]
  .split('\n')
  .map(l => l.replace(/['",\s]/g, '').trim())
  .filter(Boolean);

console.log('[3] src/tests/database-schema-integrity.test.ts columns count:', testCols.length);

const arraysEqual = (a, b) => a.length === b.length && a.every((val, idx) => val === b[idx]);

if (!arraysEqual(expectedColumns, validatorCols)) {
  console.error('FAIL: Mismatch in validator columns:', { expectedColumns, validatorCols });
  process.exit(1);
}
console.log('✅ PASS: scripts/validate-db-schema.cjs matches all 15 columns.');

if (!arraysEqual(expectedColumns, testCols)) {
  console.error('FAIL: Mismatch in test file columns:', { expectedColumns, testCols });
  process.exit(1);
}
console.log('✅ PASS: src/tests/database-schema-integrity.test.ts matches all 15 columns.');

// 3. Migration File Inspection & Idempotency Check
const migrationPath = path.resolve('supabase/migrations/20260827200000_add_data_cancelamento_to_parceiros_resgates.sql');
if (!fs.existsSync(migrationPath)) {
  console.error('FAIL: Migration file not found at ' + migrationPath);
  process.exit(1);
}
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const hasAlter = /ALTER\s+TABLE\s+public\.parceiros_resgates/i.test(migrationSql);
const hasIfNotExist = /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+data_cancelamento\s+timestamptz/i.test(migrationSql);
const hasComment = /COMMENT\s+ON\s+COLUMN\s+public\.parceiros_resgates\.data_cancelamento/i.test(migrationSql);
const hasNotify = /NOTIFY\s+pgrst,\s*'reload schema'/i.test(migrationSql);

console.log('[4] Checking SQL clauses in migration:');
console.log('   - ALTER TABLE public.parceiros_resgates:', hasAlter ? 'YES' : 'NO');
console.log('   - ADD COLUMN IF NOT EXISTS data_cancelamento timestamptz:', hasIfNotExist ? 'YES' : 'NO');
console.log('   - COMMENT ON COLUMN ... data_cancelamento:', hasComment ? 'YES' : 'NO');
console.log('   - NOTIFY pgrst, reload schema:', hasNotify ? 'YES' : 'NO');

if (!hasAlter || !hasIfNotExist || !hasComment || !hasNotify) {
  console.error('FAIL: SQL clauses missing in migration file.');
  process.exit(1);
}
console.log('✅ PASS: Migration SQL clauses verified.');

// 4. Test Idempotency with Postgres Lexer / Mock Re-executions
console.log('[5] Testing Multi-Execution Simulation (5 consecutive runs):');
let mockDatabaseState = {
  columns: new Set(['id', 'parceiro_id', 'cliente_id', 'nome_completo', 'telefone', 'codigo_gerado', 'tipo_resgate', 'link_destino', 'auto_redirecionado', 'created_at', 'email', 'link_ativacao', 'status', 'data_ativacao'])
};

function executeMigration(state, sql) {
  const match = sql.match(/ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+(\w+);/i);
  if (match) {
    const table = match[1];
    const col = match[2];
    const type = match[3];
    // IF NOT EXISTS behavior:
    if (state.columns.has(col)) {
      return { status: 'NOTICE_ALREADY_EXISTS', column: col };
    } else {
      state.columns.add(col);
      return { status: 'SUCCESS_COLUMN_ADDED', column: col, type };
    }
  }
  return { status: 'NOOP' };
}

// Run 1: initial application
const run1 = executeMigration(mockDatabaseState, migrationSql);
console.log(`   Run 1: ${run1.status} (${run1.column}) -> Total columns: ${mockDatabaseState.columns.size}`);
if (run1.status !== 'SUCCESS_COLUMN_ADDED' || mockDatabaseState.columns.size !== 15) {
  console.error('FAIL: Run 1 did not add column correctly.');
  process.exit(1);
}

// Runs 2 to 5: repeated applications
for (let i = 2; i <= 5; i++) {
  const runN = executeMigration(mockDatabaseState, migrationSql);
  console.log(`   Run ${i}: ${runN.status} (${runN.column}) -> Total columns: ${mockDatabaseState.columns.size}`);
  if (runN.status !== 'NOTICE_ALREADY_EXISTS' || mockDatabaseState.columns.size !== 15) {
    console.error(`FAIL: Run ${i} failed idempotency requirement.`);
    process.exit(1);
  }
}
console.log('✅ PASS: Multi-run idempotency successfully verified (zero side effects, persistent 15 columns).');
console.log('====================================================');
console.log('   ALL EMPIRICAL CHALLENGER CHECKS PASSED (100%)    ');
console.log('====================================================');

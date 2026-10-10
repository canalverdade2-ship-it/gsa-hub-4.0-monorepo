import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const panel = read('src/components/admin/CalculatorProAdminPanel.tsx');
const migration = read('supabase/migrations/20260724130000_repair_calculator_pro_products.sql');

for (const toolId of ['termination', 'retirement', 'vacation']) {
  assert.match(panel, new RegExp(toolId), `Painel sem configuração padrão para ${toolId}`);
  assert.match(migration, new RegExp(toolId), `Migração sem inicialização de ${toolId}`);
}

assert.match(panel, /gsa_admin_ensure_calculator_pro_products/);
assert.match(panel, /Configurações locais exibidas/);
assert.match(panel, /Inicializar configurações/);
assert.match(migration, /ON CONFLICT \(tool_id\) DO NOTHING/);
assert.match(migration, /gsa_admin_save_calculator_pro_product/);

console.log('Contrato de inicialização e recuperação das Calculadoras Pro validado.');

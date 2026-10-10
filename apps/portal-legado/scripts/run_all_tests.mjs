import assert from 'node:assert/strict';
import { taxValid, cents, commercial, installments, date } from '../server/domain.mjs';
import { db, all, get, put, next, addUser, verify, hash, hasAdminPermission, normalizeAdminPermissions, publicUser } from '../server/store.mjs';

console.log('🧪 Iniciando Bateria de Testes Automatizados — GSA HUB 3.0...\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Domínio & Validações
test('taxValid: Validação de CPF válido e inválido', () => {
  assert.equal(taxValid('52998224725'), true);
  assert.equal(taxValid('11111111111'), false);
  assert.equal(taxValid('12345678900'), false);
});

test('taxValid: Validação de CNPJ válido e inválido', () => {
  assert.equal(taxValid('11222333000181'), true);
  assert.equal(taxValid('00000000000191'), true);
  assert.equal(taxValid('00000000000000'), false);
  assert.equal(taxValid('12345678901234'), false);
});

test('cents: Conversão monetária sem perda de ponto flutuante', () => {
  assert.equal(cents(1500.0), 150000);
  assert.equal(cents(19.99), 1999);
  assert.equal(cents(0), 0);
});

test('commercial: Cálculo comercial de proposta com base, extra e desconto', () => {
  const service = { price: 150000 };
  const prop = commercial(
    {
      base: 1500,
      extra: 200,
      extraName: 'Taxa de certificado digital',
      discount: 10,
      discountType: 'percent'
    },
    service
  );

  assert.equal(prop.base, 150000);
  assert.equal(prop.extra, 20000);
  assert.equal(prop.subtotal, 170000);
  assert.equal(prop.discount, 17000);
  assert.equal(prop.total, 153000); // Exato R$ 1.530,00 da Imagem 2!
});

test('installments: Divisão de parcelas com rateio exato de centavos residuais', () => {
  const insts = installments(10001, 3, '2026-10-10');
  assert.equal(insts.length, 3);
  const sum = insts.reduce((acc, i) => acc + i.amount, 0);
  assert.equal(sum, 10001); // 10001 centavos divididos em 3334, 3334, 3333 = 10001 exatos
});

// 2. Banco e Persistência
test('store: Banco SQLite em modo WAL', () => {
  const pragma = db.prepare('PRAGMA journal_mode').get();
  assert.equal(pragma.journal_mode.toLowerCase(), 'wal');
});

test('store: Seed inicial criou OS105 com 6 etapas', () => {
  const orders = all('orders');
  const os105 = orders.find((o) => o.code === 'OS105');
  assert.ok(os105, 'OS105 deve existir no banco');
  assert.equal(os105.stages.length, 6, 'OS105 deve possuir 6 etapas');
  assert.equal(os105.stages[0].name, 'Recebimento da documentação');
  assert.equal(os105.stages[5].name, 'Serviço concluído');
});

test('store: Seed inicial criou Contrato CONT-2024-00157 com R$ 1.530,00', () => {
  const contracts = all('contracts');
  const c157 = contracts.find((c) => c.code === 'CONT-2024-00157');
  assert.ok(c157, 'Contrato CONT-2024-00157 deve existir');
  assert.equal(c157.total, 153000);
});

test('auth: Criptografia de senhas com scrypt e salt', () => {
  const h = hash('SenhaForte@2026');
  assert.ok(verify('SenhaForte@2026', h));
  assert.ok(!verify('SenhaErrada@123', h));
});

test('permissions: Função administrativa limita módulos e mantém o painel inicial', () => {
  const permissions = normalizeAdminPermissions(['clients', 'clients', 'module-inexistente']);
  assert.deepEqual(permissions, ['dashboard', 'clients']);
  const operator = { role: 'admin', permissions: JSON.stringify(permissions) };
  assert.equal(hasAdminPermission(operator, 'dashboard'), true);
  assert.equal(hasAdminPermission(operator, 'clients'), true);
  assert.equal(hasAdminPermission(operator, 'finance'), false);
  assert.equal(hasAdminPermission({ role: 'client', permissions: ['*'] }, 'finance'), false);
});

test('permissions: Usuário público não expõe senha e entrega permissões normalizadas', () => {
  const safe = publicUser({ id: 'u-test', name: 'Operador', email: 'operador@teste.local', role: 'admin', adminRole: 'Financeiro', permissions: '["finance"]', password: 'segredo' });
  assert.equal('password' in safe, false);
  assert.equal(safe.adminRole, 'Financeiro');
  assert.deepEqual(safe.permissions, ['dashboard', 'finance']);
});

console.log(`\n🎉 Todos os ${passed}/${total} testes automatizados foram aprovados com sucesso!`);

'use strict';

const assert = require('node:assert/strict');
const { createScrapingScheduler, isDue, normalizeTimes, zonedParts } = require('../scraping_scheduler.cjs');
const base = {
  id: '11111111-1111-1111-1111-111111111111', nome: 'Teste', ativo: true,
  frequencia: 'diario', horarios: ['09:00'], dias_semana: [], data_inicio: null, data_fim: null,
  created_at: '2026-08-01T12:00:00Z',
};
const atNine = new Date('2026-08-31T12:00:20Z');

assert.deepEqual(zonedParts(atNine), { date: '2026-08-31', time: '09:00', day: 31, weekday: 'segunda' });
assert.deepEqual(normalizeTimes(['09:00', '9:00', '09:00', '25:00']), ['09:00']);
assert.equal(isDue(base, atNine)?.localTime, '09:00');
assert.equal(isDue({ ...base, ativo: false }, atNine), null);
assert.equal(isDue({ ...base, data_inicio: '2026-09-01' }, atNine), null);
assert.equal(isDue({ ...base, data_fim: '2026-08-30' }, atNine), null);
assert.ok(isDue({ ...base, frequencia: 'semanal', dias_semana: ['segunda'] }, atNine));
assert.equal(isDue({ ...base, frequencia: 'semanal', dias_semana: ['terca'] }, atNine), null);
assert.ok(isDue({ ...base, frequencia: 'mensal', data_inicio: '2026-07-31' }, atNine));
assert.equal(isDue({ ...base, frequencia: 'mensal', data_inicio: '2026-07-30' }, atNine), null);

async function main() {
  const enqueued = [];
  const scheduler = createScrapingScheduler({
    listConfigs: async () => [base], listRecentLogs: async () => [],
    enqueue: async (_config, slot) => enqueued.push(slot.key), logger: { info() {}, error() {} },
  });
  await scheduler.tick(atNine);
  await scheduler.tick(atNine);
  assert.equal(enqueued.length, 1, 'o mesmo slot não pode ser disparado duas vezes no processo');

  const persisted = createScrapingScheduler({
    listConfigs: async () => [base],
    listRecentLogs: async () => [{ detalhes: { schedule_key: isDue(base, atNine).key } }],
    enqueue: async () => assert.fail('slot persistido não pode ser reenfileirado'),
    logger: { info() {}, error() {} },
  });
  await persisted.tick(atNine);
  console.log('Agendador de scraping validado com sucesso.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

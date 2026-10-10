import { supabase, logValidation } from './base';

async function findActiveRecords() {
  // Find Client
  const { data: clients, error: cErr } = await supabase
    .from('clientes')
    .select('id, nome, cpf')
    .eq('status', 'ativo')
    .limit(1);

  if (cErr || !clients?.length) {
    logValidation('Nenhum cliente ativo encontrado para teste.', 'error');
  } else {
    console.log(`CLIENTE_ID=${clients[0].id}`);
    console.log(`CLIENTE_NOME=${clients[0].nome}`);
  }

  // Find Prestador
  const { data: prestadores, error: pErr } = await supabase
    .from('prestadores')
    .select('id, nome_razao')
    .eq('status', 'ativo')
    .limit(1);

  if (pErr || !prestadores?.length) {
    logValidation('Nenhum prestador ativo encontrado para teste.', 'error');
  } else {
    console.log(`PRESTADOR_ID=${prestadores[0].id}`);
    console.log(`PRESTADOR_NOME=${prestadores[0].nome_razao}`);
  }
}

findActiveRecords();

import { supabase, logValidation } from './base';

async function findActivePrestador() {
  const { data, error } = await supabase
    .from('prestadores')
    .select('id, nome_razao')
    .eq('status', 'ativo')
    .limit(1)
    .single();

  if (error) {
    logValidation(`Erro ao buscar prestador: ${error.message}`, 'error');
    process.exit(1);
  }

  console.log(`PRESTADOR_ID=${data.id}`);
  console.log(`PRESTADOR_NOME=${data.nome_razao}`);
}

findActivePrestador();

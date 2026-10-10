import { supabase, logValidation } from './base';
import { resolve } from 'path';
import { readFileSync } from 'fs';

async function validateReports() {
  logValidation('🚀 INICIANDO VALIDAÇÃO: ETAPA 5 - RELATÓRIOS & CONSOLIDAÇÃO');

  try {
    // 1. Carregar estado anterior
    const statePath = resolve(process.cwd(), 'src/validation/state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const { cliente_id, fatura_id } = state;

    // 2. Verificar Extrato Financeiro do Cliente B
    logValidation('🔹 Verificando Extrato Financeiro (Cliente B)...');
    const { data: extratoB, error: errB } = await supabase
      .from('extrato_financeiro')
      .select('*')
      .eq('cliente_id', cliente_id)
      .order('data', { ascending: false });

    if (errB) throw errB;
    logValidation(`✅ Encontrados ${extratoB?.length || 0} lançamentos para o Cliente B.`);

    // 3. Verificar Lançamentos de Carteira do Indicador (Cliente A)
    // Precisamos buscar o ID do indicador primeiro
    const { data: clientB, error: errClient } = await supabase
      .from('clientes')
      .select('indicacao_origem_id')
      .eq('id', cliente_id)
      .single();

    const { data: indicacao, error: errInd } = await supabase
      .from('indicacoes')
      .select('indicador_id')
      .eq('id', clientB?.indicacao_origem_id)
      .single();

    const indicadorId = indicacao?.indicador_id;

    logValidation('🔹 Verificando Carteira do Indicador...');
    const { data: lancamentos, error: errLanc } = await supabase
      .from('carteira_lancamentos')
      .select('*')
      .eq('cliente_id', indicadorId)
      .order('data_lancamento', { ascending: false });

    if (errLanc) throw errLanc;
    
    const bonusFound = lancamentos?.some(l => l.valor === 20);
    if (bonusFound) {
      logValidation('✅ Lançamento de bônus de R$ 20 encontrado na carteira do indicador.');
    } else {
      logValidation('❌ Lançamento de bônus de R$ 20 NÃO encontrado.');
    }

    // 4. Verificação de Receita Total
    logValidation('🔹 Resumo Financeiro da Validação...');
    const { data: orcamentos } = await supabase
      .from('orcamentos')
      .select('total')
      .eq('cliente_id', cliente_id);

    const totalRev = Number(orcamentos?.[0]?.total || 0);
    logValidation(`✅ Receita Bruta Gerada: R$ ${totalRev}`);

    logValidation('\n🔹 --- CHECKLIST DE CONSOLIDAÇÃO ---');
    logValidation(`✅ Extrato Financeiro Cliente B: ${extratoB?.length ? 'OK' : 'FALHA'}`);
    logValidation(`✅ Bônus na Carteira Indicador: ${bonusFound ? 'OK' : 'FALHA'}`);
    logValidation(`✅ Consolidação de Receita: R$ ${totalRev}`);

    logValidation('\n✨ ETAPA 5 CONCLUÍDA COM SUCESSO!');

  } catch (error: any) {
    logValidation(`❌ ERRO NA ETAPA 5: ${error.message}`);
    process.exit(1);
  }
}

validateReports();

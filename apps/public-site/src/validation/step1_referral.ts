import { supabase, logValidation, clearTestData } from './base';

const TEST_INDICATOR_CPF = '00011122233';
const TEST_INDICATED_PHONE = '11999998888';

async function validateReferralFlow() {
  console.log('\n🚀 INICIANDO VALIDAÇÃO: FLUXO DE INDICAÇÃO\n');

  try {
    // 1. Limpar dados anteriores de teste
    await clearTestData('clientes', 'cpf', TEST_INDICATOR_CPF);
    await clearTestData('indicacoes', 'whatsapp_indicado', TEST_INDICATED_PHONE);

    // 2. Criar Cliente Indicador (Master)
    logValidation('Criando Cliente Indicador...', 'info');
    const { data: indicator, error: iErr } = await supabase
      .from('clientes')
      .insert([{
        nome: 'VALIDAÇÃO INDICADOR',
        cpf: TEST_INDICATOR_CPF,
        telefone: '11988887777',
        status: 'ativo',
        codigo_cliente: 'VAL-IND-001'
      }])
      .select()
      .single();

    if (iErr) throw new Error(`Falha ao criar indicador: ${iErr.message}`);
    logValidation(`Indicador criado: ${indicator.nome} (ID: ${indicator.id})`, 'success');

    // 3. Criar uma Indicação
    logValidation('Criando Indicação para Novo Cliente...', 'info');
    const { data: indicacao, error: indErr } = await supabase
      .from('indicacoes')
      .insert([{
        indicador_id: indicator.id,
        indicado_nome: 'VALIDAÇÃO INDICADO',
        whatsapp_indicado: TEST_INDICATED_PHONE,
        status: 'aberta'
      }])
      .select()
      .single();

    if (indErr) throw new Error(`Falha ao criar indicação: ${indErr.message}`);
    logValidation(`Indicação registrada (ID: ${indicacao.id})`, 'success');

    // 4. Cadastrar o Cliente Indicado (Fluxo de Cadastro por Indicação)
    logValidation('Registrando Cliente Indicado...', 'info');
    const { data: indicado, error: regErr } = await supabase
      .from('clientes')
      .insert([{
        nome: 'VALIDAÇÃO INDICADO',
        telefone: TEST_INDICATED_PHONE,
        cpf: '99988877766',
        indicacao_origem_id: indicacao.id,
        status: 'ativo',
        codigo_cliente: 'VAL-IND-002'
      }])
      .select()
      .single();

    if (regErr) throw new Error(`Falha ao registrar indicado: ${regErr.message}`);
    logValidation(`Indicado registrado: ${indicado.nome} (ID: ${indicado.id})`, 'success');

    // 5. Vincular Voucher se existir (Simulando lógica do Home.tsx:306)
    if (indicacao.voucher_id) {
        logValidation('Vinculando voucher ao cliente indicado...', 'info');
        await supabase.from('vouchers').update({ cliente_id: indicado.id }).eq('id', indicacao.voucher_id);
    }

    // 6. Validar Vínculos
    logValidation('Validando integridade dos vínculos...', 'info');
    const { data: check, error: checkErr } = await supabase
      .from('clientes')
      .select('indicacao_origem_id')
      .eq('id', indicado.id)
      .single();

    if (check?.indicacao_origem_id === indicacao.id) {
       logValidation('Vínculo entre Cliente e Indicação: OK', 'success');
    } else {
       logValidation('Vínculo entre Cliente e Indicação: FALHA', 'error');
    }

    // 7. Atualizar status da indicação
    await supabase.from('indicacoes').update({ data_cadastro_indicado: new Date().toISOString() }).eq('id', indicacao.id);
    logValidation('Status da indicação atualizado para "cadastrado"', 'success');

    console.log('\n✨ ETAPA 2 CONCLUÍDA COM SUCESSO!\n');

  } catch (error: any) {
    logValidation(error.message, 'error');
    process.exit(1);
  }
}

validateReferralFlow();

import { supabase, logValidation, clearTestData } from './base';
import { generateCode } from '../lib/utils';
import { processReferralBonus } from '../utils/referral';
import { processGamificationPoints } from '../utils/gamification';

const TEST_INDICATOR_ID = '0349d3d1-2013-458d-bc78-d29119143685'; // Cliente A
const TEST_CLIENT_ID = '66aa524e-9ee5-46a7-a691-fade0b61f317';    // Cliente B
const TEST_PRESTADOR_DOC = '11222333000199';

async function validateFinanceGamification() {
  console.log('\n🚀 INICIANDO VALIDAÇÃO: ETAPA 3 - FINANCEIRO & GAMIFICAÇÃO\n');

  try {
    // 1. Garantir que temos um prestador
    logValidation('Verificando Prestador de Teste...', 'info');
    const { data: prestador } = await supabase
      .from('prestadores')
      .select('id')
      .eq('documento', TEST_PRESTADOR_DOC)
      .single();

    if (!prestador) throw new Error('Prestador não encontrado. Execute a Etapa 2 primeiro ou verifique os dados.');

    // 2. Criar Fatura de Teste (Fluxo rápido)
    logValidation('Criando Fatura para validação financeira...', 'info');
    const fatCode = generateCode('VAL-FIN');
    const { data: fatura, error: fatErr } = await supabase
      .from('faturas')
      .insert([{
        codigo_fatura: fatCode,
        cliente_id: TEST_CLIENT_ID,
        valor_total: 1000,
        valor_final_pendente: 1000,
        status: 'pendente',
        tipo: 'servico',
        data_vencimento: new Date().toISOString().split('T')[0]
      }])
      .select()
      .single();

    if (fatErr) throw new Error(`Erro ao criar fatura: ${fatErr.message}`);
    logValidation(`Fatura criada: ${fatura.codigo_fatura}`, 'success');

    // 3. Processar Pagamento Manual (Simulando FinanceiroModule:635)
    logValidation('Processando Baixa de Pagamento...', 'info');
    const { error: payErr } = await supabase
      .from('faturas')
      .update({
        status: 'pago',
        valor_pago: 1000,
        data_pagamento: new Date().toISOString(),
        observacoes: 'BAIXA MANUAL - VALIDAÇÃO AUTOMATIZADA'
      })
      .eq('id', fatura.id);

    if (payErr) throw new Error(`Erro no pagamento: ${payErr.message}`);
    
    await supabase.from('pagamentos').insert([{
      fatura_id: fatura.id,
      valor: 1000,
      metodo: 'pix',
      data_pagamento: new Date().toISOString()
    }]);
    logValidation('Pagamento registrado como PAGO.', 'success');

    // 4. Validar Bônus de Indicação (Referral)
    logValidation('Executando Processamento de Bônus de Indicação...', 'info');
    // Precisamos garantir que a indicação está vinculada
    const { data: clientB } = await supabase
        .from('clientes')
        .select('indicacao_origem_id')
        .eq('id', TEST_CLIENT_ID)
        .single();
    
    logValidation(`Vínculo de indicação encontrado: ${clientB?.indicacao_origem_id}`, 'info');

    const referralResult = await processReferralBonus(fatura.id);
    logValidation('Bônus de indicação processado.', 'success');

    // 5. Validar Gamificação (Pontos)
    logValidation('Executando Processamento de Pontos de Gamificação...', 'info');
    const pointsResult = await processGamificationPoints(TEST_CLIENT_ID, 1000, fatura.id, 'Pagamento Fatura Validação');
    logValidation('Pontos de gamificação processados.', 'success');

    // 6. VERIFICAÇÃO FINAL
    logValidation('--- CHECKLIST DE INTEGRIDADE ---', 'info');

    // Check Indicator Wallet
    const { data: indicator } = await supabase
        .from('clientes')
        .select('saldo_carteira')
        .eq('id', TEST_INDICATOR_ID)
        .single();
    logValidation(`Saldo Carteira Indicador (Cliente A): R$ ${indicator?.saldo_carteira}`, 'success');

    // Check Client Points
    const { data: clientPoints } = await supabase
        .from('clientes')
        .select('saldo_pontos, pontos_totais')
        .eq('id', TEST_CLIENT_ID)
        .single();
    logValidation(`Saldo Pontos Cliente (Cliente B): ${clientPoints?.saldo_pontos} pontos`, 'success');

    // Check notifications
    const { count: notifCount } = await supabase
        .from('notificacoes')
        .select('*', { count: 'exact', head: true })
        .in('cliente_id', [TEST_INDICATOR_ID, TEST_CLIENT_ID]);
    logValidation(`Notificações geradas: ${notifCount}`, 'success');

    console.log('\n✨ ETAPA 3 CONCLUÍDA COM SUCESSO!\n');

  } catch (error: any) {
    logValidation(error.message, 'error');
    process.exit(1);
  }
}

validateFinanceGamification();

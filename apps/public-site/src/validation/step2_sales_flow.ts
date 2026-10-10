import { supabase, logValidation, clearTestData } from './base';
import { generateCode } from '../lib/utils';
import * as fs from 'fs';
import * as path from 'path';

const TEST_CLIENT_ID = '66aa524e-9ee5-46a7-a691-fade0b61f317';
const TEST_PRESTADOR_DOC = '11222333000199';

async function validateSalesFlow() {
  console.log('\n🚀 INICIANDO VALIDAÇÃO: FLUXO DE VENDAS E PRODUÇÃO\n');

  try {
    // 1. Criar Prestador de Teste (Equipe GSA Teste)
    logValidation('Etapa 1: Criando Prestador de Teste...', 'info');
    await clearTestData('prestadores', 'documento', TEST_PRESTADOR_DOC);
    
    logValidation(`Inserindo prestador em "prestadores" com documento ${TEST_PRESTADOR_DOC}...`, 'info');
    const { data: prestador, error: pErr } = await supabase
      .from('prestadores')
      .insert([{
        nome_razao: 'PRESTADOR VALIDAÇÃO',
        documento: TEST_PRESTADOR_DOC,
        status: 'ativo',
        tipo_cadastro: 'cnpj',
        email: 'teste@gsa.com',
        telefone: '11999990000'
      }])
      .select()
      .single();

    if (pErr) throw new Error(`Falha ao criar prestador: ${pErr.message}`);
    logValidation(`Prestador criado: ${prestador.nome_razao}`, 'success');

    // 2. Criar Orçamento de Serviço
    logValidation('Criando Novo Orçamento de Serviço...', 'info');
    const orcCode = generateCode('VAL-ORC');
    const { data: orcamento, error: orcErr } = await supabase
      .from('orcamentos')
      .insert([{
        codigo_orcamento: orcCode,
        cliente_id: TEST_CLIENT_ID,
        categoria: 'servico',
        status: 'aberto',
        total: 2500,
        valor_servico: 2500,
        observacoes_servico: 'Serviço de Validação do Fluxo de Vendas'
      }])
      .select()
      .single();

    if (orcErr) throw new Error(`Falha ao criar orçamento: ${orcErr.message}`);
    logValidation(`Orçamento criado: ${orcamento.codigo_orcamento} (ID: ${orcamento.id})`, 'success');

    // 3. Aprovar Orçamento (Simulando handleApprove de OrcamentosModule)
    logValidation('Etapa 3: Aprovando Orçamento...', 'info');
    const { error: appErr } = await supabase
      .from('orcamentos')
      .update({ status: 'aprovado' })
      .eq('id', orcamento.id);

    if (appErr) throw new Error(`Falha ao aprovar orçamento: ${appErr.message}`);

    // 4. Criar OS e Demanda (A aplicação faz isso via UI, aqui fazemos via código para validar a lógica)
    logValidation('Gerando OS e Demanda...', 'info');
    const osCode = generateCode('VAL-OS');
    const { data: os, error: osErr } = await supabase
      .from('ordens_servico')
      .insert([{
        codigo_os: osCode,
        orcamento_id: orcamento.id,
        cliente_id: TEST_CLIENT_ID,
        status: 'andamento',
        data_inicio: new Date().toISOString()
      }])
      .select()
      .single();

    if (osErr) throw new Error(`Falha ao criar OS: ${osErr.message}`);
    logValidation(`OS gerada: ${os.codigo_os} (ID: ${os.id})`, 'success');

    logValidation('Inserindo demanda em "prestador_demandas"...', 'info');
    const { data: demanda, error: demErr } = await supabase
      .from('prestador_demandas')
      .insert([{
        titulo: 'Demanda de Validação',
        descricao: `Teste de fluxo para OS ${os.codigo_os}`,
        os_id: os.id,
        status: 'aberta'
      }])
      .select()
      .single();

    if (demErr) throw new Error(`Falha ao criar demanda: ${demErr.message}`);
    logValidation(`Demanda aberta (ID: ${demanda.id})`, 'success');

    // 5. Direcionar Demanda ao Prestador
    logValidation('Direcionando demanda ao prestador...', 'info');
    const { error: assignErr } = await supabase
      .from('prestador_demandas')
      .update({ 
        prestador_id: prestador.id,
        status: 'ativa',
        valor_proposto_admin: 1500,
        data_inicio: new Date().toISOString(),
        prazo_entrega: '2026-12-31',
        descricao: `Teste de validação direcionado ao prestador ${prestador.nome_razao}`
      })
      .eq('id', demanda.id);

    if (assignErr) throw new Error(`Falha ao atribuir demanda: ${assignErr.message}`);
    logValidation('Demanda atribuída e ativa.', 'success');

    // 6. Simular Finalização (Simulando confirmFinalizeDemanda de PrestadoresDemandas)
    logValidation('Finalizando Demanda e Gerando Fatura...', 'info');
    
    // 6.1 Status Demanda -> Concluída
    await supabase.from('prestador_demandas').update({ status: 'concluida', data_conclusao: new Date().toISOString() }).eq('id', demanda.id);
    
    // 6.2 Crédito Prestador
    await supabase.from('prestador_transacoes').insert({
      prestador_id: prestador.id,
      demanda_id: demanda.id,
      tipo: 'credito',
      valor: 1500,
      descricao: `Validação OS ${os.codigo_os}`,
      status: 'concluido'
    });

    // 6.3 OS -> Concluída
    await supabase.from('ordens_servico').update({ status: 'concluido', data_fim: new Date().toISOString() }).eq('id', os.id);

    // 6.4 Gerar Fatura
    const fatCode = generateCode('VAL-FAT');
    const vDate = new Date();
    vDate.setDate(vDate.getDate() + 10); // 10 dias

    const { data: fatura, error: fatErr } = await supabase
      .from('faturas')
      .insert([{
        codigo_fatura: fatCode,
        os_id: os.id,
        cliente_id: TEST_CLIENT_ID,
        valor_total: 2500,
        valor_final_pendente: 2500,
        status: 'pendente',
        tipo: 'servico',
        data_vencimento: vDate.toISOString().split('T')[0]
      }])
      .select()
      .single();

    if (fatErr) throw new Error(`Falha ao gerar fatura: ${fatErr.message}`);
    logValidation(`Fatura gerada: ${fatura.codigo_fatura} (Vencimento: ${fatura.data_vencimento})`, 'success');

    console.log('\n✨ ETAPA 2 CONCLUÍDA COM SUCESSO!\n');
    console.log(`FATURA_ID_TESTE=${fatura.id}`);

    const state = {
      fatura_id: fatura.id,
      cliente_id: TEST_CLIENT_ID,
      valor_total: fatura.valor_total
    };
    fs.writeFileSync(path.join(process.cwd(), 'src/validation/state.json'), JSON.stringify(state, null, 2));
    logValidation('Estado salvo em src/validation/state.json', 'success');

  } catch (error: any) {
    logValidation(error.message, 'error');
    process.exit(1);
  }
}

validateSalesFlow();

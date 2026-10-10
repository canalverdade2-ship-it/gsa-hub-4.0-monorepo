import { supabase } from './base';
import * as fs from 'fs';

async function runMasterBlock3() {
    const state = JSON.parse(fs.readFileSync('src/validation/state.json', 'utf8'));
    const { cliente_id } = state;

    const logValidation = (msg: string) => {
        console.log(`🔹 ${msg}`);
    };

    console.log('🔹 🚀 INICIANDO MASTER VALIDATION: BLOCO 3 (ETAPAS 11-15)');

    try {
        // --- ETAPA 11: GESTÃO DE PRESTADORES E DEMANDAS ---
        logValidation('\n🔹 ETAPA 11: Validando Prestadores e Demandas...');
        
        // 1. Criar Prestador
        const randomDoc = Math.floor(Math.random() * 90000000000 + 10000000000).toString();
        const { data: prestador, error: pError } = await supabase
            .from('prestadores')
            .insert([{
                nome_razao: 'PRESTADOR TESTE MASTER',
                documento: randomDoc,
                email: `prestador.${randomDoc}@gsa.com.br`,
                telefone: '11999998888',
                cep: '01001000',
                status: 'ativo',
                tipo_cadastro: 'cpf',
                area_servico: 'TI e Suporte'
            }])
            .select()
            .single();
        if (pError) throw pError;

        // 2. Criar Demanda
        const { data: demanda, error: dError } = await supabase
            .from('prestador_demandas')
            .insert([{
                titulo: 'MANUTENÇÃO DE SISTEMA TESTE',
                descricao: 'Demanda gerada automaticamente para validação do fluxo de repasse.',
                status: 'aberta',
                valor_proposto_admin: 250.00,
                prestador_id: prestador.id
            }])
            .select()
            .single();
        if (dError) throw dError;
        logValidation(`✅ Prestador e Demanda #${demanda.id.substring(0,6)} criados.`);

        // --- ETAPA 12: MÓDULO FISCAL ---
        logValidation('\n🔹 ETAPA 12: Validando Módulo Fiscal...');
        const { data: fiscal, error: fError } = await supabase
            .from('ordens_fiscais')
            .insert([{
                codigo_fiscal: 'FISC-' + Math.floor(Math.random() * 1000),
                cliente_id,
                cliente_nome: 'Cliente Teste Master',
                tipo_compra: 'servico',
                descricao_item: 'Serviço de Validação Técnica',
                valor_total: 250.00,
                status_emissao: 'pendente_emissao',
                status_pagamento: 'pago'
            }])
            .select()
            .single();
        if (fError) throw fError;
        logValidation(`✅ Ordem Fiscal ${fiscal.codigo_fiscal} gerada como pendente.`);

        // --- ETAPA 13: SISTEMA DE NOTIFICAÇÕES ---
        logValidation('\n🔹 ETAPA 13: Validando Notificações...');
        const { error: nError } = await supabase
            .from('notificacoes')
            .insert([{
                titulo: '⚠️ ALERTA DE VALIDAÇÃO MASTER',
                mensagem: 'O sistema de automação está validando as notificações em tempo real.',
                tipo: 'sistema',
                modulo: 'dashboard',
                lida: false
            }]);
        if (nError) throw nError;
        logValidation(`✅ Notificação de sistema enviada com sucesso.`);

        // --- ETAPA 14: CONFIGURAÇÕES DA EMPRESA ---
        logValidation('\n🔹 ETAPA 14: Validando Dados da Empresa...');
        const { data: empresa, error: eFetchError } = await supabase
            .from('empresa')
            .select('*')
            .limit(1)
            .maybeSingle();

        if (empresa) {
            const { error: eUpdateError } = await supabase
                .from('empresa')
                .update({ razao_social: 'GRUPO GSA GESTÃO DE SERVIÇOS' })
                .eq('id', empresa.id);
            if (eUpdateError) throw eUpdateError;
            logValidation(`✅ Dados da empresa "${empresa.razao_social}" validados/atualizados.`);
        } else {
            logValidation(`⚠️ Nenhuma empresa cadastrada para atualizar, etapa ignorada.`);
        }

        // --- ETAPA 15: AUDITORIA E LOGS ---
        logValidation('\n🔹 ETAPA 15: Validando Logs de Auditoria...');
        const { error: hError } = await supabase
            .from('sistema_logs')
            .insert([{
                ator_tipo: 'admin',
                ator_nome: 'Validador Master',
                acao: 'VALIDAÇÃO DE INTEGRIDADE GSA',
                detalhes: 'Log gerado pelo script master para validar a rastreabilidade de ações administrativa no barramento central.'
            }]);
        if (hError) throw hError;
        logValidation(`✅ Log de auditoria registrado no barramento central (sistema_logs).`);

        // Salvar IDs novos no state
        state.prestador_id = prestador.id;
        state.demanda_id = demanda.id;
        fs.writeFileSync('src/validation/state.json', JSON.stringify(state, null, 2));

        console.log('\n✅ --- BLOCO 3 CONCLUÍDO COM SUCESSO (ETAPAS 11-15) ---\n');

    } catch (error) {
        console.error('\n❌ ERRO NO MASTER BLOCO 3:', error.message || error);
        process.exit(1);
    }
}

runMasterBlock3();

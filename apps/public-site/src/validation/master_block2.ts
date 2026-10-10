import { supabase } from './base';
import * as fs from 'fs';

async function runMasterBlock2() {
    const state = JSON.parse(fs.readFileSync('src/validation/state.json', 'utf8'));
    const { cliente_id } = state;

    const logValidation = (msg: string) => {
        console.log(`🔹 ${msg}`);
    };

    console.log('🔹 🚀 INICIANDO MASTER VALIDATION: BLOCO 2 (ETAPAS 6-10)');

    try {
        // --- ETAPA 6: ASSINATURAS RECORRENTES ---
        logValidation('\n🔹 ETAPA 6: Validando Assinaturas Recorrentes...');
        
        // 1. Criar Plano
        const { data: plano, error: planoErr } = await supabase
            .from('assinaturas')
            .insert([{
                nome: 'PLANO TESTE MASTER',
                valor: 150.00,
                status: 'ativo',
                descricao: 'Plano gerado via validação automatizada'
            }])
            .select()
            .single();
        if (planoErr) throw planoErr;

        // 2. Criar Ordem de Assinatura
        const { data: assinatura, error: assError } = await supabase
            .from('ordens_assinatura')
            .insert([{
                cliente_id,
                assinatura_id: plano.id,
                status: 'concluido',
                prazo_meses: 12
            }])
            .select()
            .single();
        if (assError) throw assError;

        // 3. Criar Fatura
        const { data: faturaAss, error: fatError } = await supabase
            .from('faturas')
            .insert([{
                cliente_id,
                ordem_assinatura_id: assinatura.id,
                valor_total: 150.00,
                status: 'pendente',
                data_vencimento: new Date().toISOString(),
                tipo: 'assinatura'
            }])
            .select()
            .single();
        if (fatError) throw fatError;
        logValidation(`✅ Assinatura e Fatura #${faturaAss.id.substring(0,6)} geradas.`);

        // --- ETAPA 7: GESTÃO DE ESTOQUE ---
        logValidation('\n🔹 ETAPA 7: Validando Gestão de Estoque...');
        const { data: produto, error: prodError } = await supabase
            .from('produtos')
            .select('*')
            .limit(1)
            .single();

        if (prodError || !produto) {
            logValidation('⚠️ Nenhum produto encontrado para testar estoque, pulando...');
        } else {
            const novoEstoque = (produto.estoque || 0) + 50;
            const { error: stockError } = await supabase
                .from('produtos')
                .update({ estoque: novoEstoque })
                .eq('id', produto.id);

            if (stockError) throw stockError;
            logValidation(`✅ Estoque do produto "${produto.nome}" atualizado: ${produto.estoque || 0} -> ${novoEstoque}`);
        }

        // --- ETAPA 8: SUPORTE E TICKETS ---
        logValidation('\n🔹 ETAPA 8: Validando Suporte (Tickets)...');
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert([{
                cliente_id,
                assunto: 'DÚVIDA TESTE VALIDAÇÃO',
                descricao: 'Solicitação de suporte gerada automaticamente.',
                status: 'aberto',
                data_abertura: new Date().toISOString()
            }])
            .select()
            .single();

        if (ticketError) throw ticketError;

        const { error: msgError } = await supabase
            .from('ticket_mensagens')
            .insert([{
                ticket_id: ticket.id,
                autor_id: cliente_id,
                autor_nome: 'Cliente Teste',
                mensagem: 'Olá, gostaria de testar o chat de suporte.',
                tipo: 'cliente'
            }]);

        if (msgError) throw msgError;
        logValidation(`✅ Ticket #${ticket.id.substring(0,6)} e mensagem inicial criados.`);

        // --- ETAPA 9: PROMOÇÕES ---
        logValidation('\n🔹 ETAPA 9: Validando Promoções...');
        const dataFim = new Date();
        dataFim.setDate(dataFim.getDate() + 30);

        const { data: promo, error: promoError } = await supabase
            .from('promocoes')
            .insert([{
                titulo: 'PROMOÇÃO TESTE MASTER',
                descricao: 'Desconto em serviços de teste.',
                tipo: 'geral',
                status: 'ativa',
                data_inicio_divulgacao: new Date().toISOString(),
                data_fim_divulgacao: dataFim.toISOString(),
                prazo_validade_meses: 1
            }])
            .select()
            .single();

        if (promoError) throw promoError;
        logValidation(`✅ Promoção "${promo.titulo}" cadastrada.`);

        // --- ETAPA 10: FIDELIDADE E STATUS VIP ---
        logValidation('\n🔹 ETAPA 10: Validando Fidelidade VIP...');
        const { data: cliente, error: cliError } = await supabase
            .from('clientes')
            .select('saldo_pontos')
            .eq('id', cliente_id)
            .single();

        if (cliError) throw cliError;

        const novosPontos = (cliente.saldo_pontos || 0) + 1500;
        const { error: vipError } = await supabase
            .from('clientes')
            .update({ saldo_pontos: novosPontos })
            .eq('id', cliente_id);

        if (vipError) throw vipError;
        logValidation(`✅ Pontos de fidelidade atualizados: ${cliente.saldo_pontos || 0} -> ${novosPontos}.`);

        console.log('\n✅ --- BLOCO 2 CONCLUÍDO COM SUCESSO (ETAPAS 6-10) ---\n');

    } catch (error) {
        console.error('\n❌ ERRO NO MASTER BLOCO 2:', error.message || error);
        process.exit(1);
    }
}

runMasterBlock2();

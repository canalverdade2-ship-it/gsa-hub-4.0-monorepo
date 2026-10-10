import { supabase } from '../lib/supabase';
import { logService } from '../lib/logService';

/**
 * Processa a baixa de uma promoção vinculada a uma fatura que acaba de ser paga.
 * @param faturaId ID da fatura que foi marcada como paga
 */
export async function processPromotionUsage(faturaId: string) {
  try {
    if (import.meta.env.DEV) console.log(`[Promocoes] Iniciando processamento de uso para fatura: ${faturaId}`);

    // 1. Buscar dados da fatura e vínculos com orçamentos
    const { data: fatura, error: faturaError } = await supabase
      .from('faturas')
      .select(`
        id,
        cliente_id,
        os_id,
        ordem_compra_id,
        ordem_assinatura_id,
        ordens_servico (orcamento_id, orcamentos(promocao_id)),
        ordens_compra (orcamento_id, orcamentos(promocao_id)),
        ordens_assinatura (orcamento_id, orcamentos(promocao_id))
      `)
      .eq('id', faturaId)
      .single();

    if (faturaError || !fatura) {
      console.error('[Promocoes] Erro ao buscar fatura:', faturaError);
      return;
    }

    // 2. Extrair promocao_id e orcamento_id dos possíveis vínculos
    const osData = fatura.ordens_servico;
    const ocData = fatura.ordens_compra;
    const oaData = fatura.ordens_assinatura;

    const mainOS = Array.isArray(osData) ? osData[0] : osData;
    const mainOC = Array.isArray(ocData) ? ocData[0] : ocData;
    const mainOA = Array.isArray(oaData) ? oaData[0] : oaData;

    const orcamentoId = mainOS?.orcamento_id || mainOC?.orcamento_id || mainOA?.orcamento_id;
    const osOrcamento = Array.isArray(mainOS?.orcamentos) ? mainOS.orcamentos[0] : mainOS?.orcamentos;
    const ocOrcamento = Array.isArray(mainOC?.orcamentos) ? mainOC.orcamentos[0] : mainOC?.orcamentos;
    const oaOrcamento = Array.isArray(mainOA?.orcamentos) ? mainOA.orcamentos[0] : mainOA?.orcamentos;
    const promocaoId = osOrcamento?.promocao_id || ocOrcamento?.promocao_id || oaOrcamento?.promocao_id;

    if (!promocaoId || !orcamentoId) {
      if (import.meta.env.DEV) console.log(`[Promocoes] Fatura ${faturaId} não possui promoção vinculada ao orçamento.`);
      return;
    }

    if (import.meta.env.DEV) console.log(`[Promocoes] Promoção detectada: ${promocaoId} no orçamento: ${orcamentoId}`);

    // 3. Buscar a ativação desta promoção para este cliente que esteja 'ativa'
    // Tentamos primeiro pelo orcamento_id (se já estiver vinculado)
    const { data: ativByOrc, error: ativByOrcError } = await supabase
      .from('cliente_promocoes')
      .select('id')
      .eq('orcamento_id', orcamentoId)
      .eq('status', 'ativa')
      .maybeSingle();

    if (ativByOrc) {
      await markAsUsed(ativByOrc.id, orcamentoId, fatura.cliente_id);
      return;
    }

    // Se não achou por orcamento_id, busca a promoção 'ativa' genérica do cliente
    const { data: ativacao, error: ativError } = await supabase
      .from('cliente_promocoes')
      .select('id')
      .eq('cliente_id', fatura.cliente_id)
      .eq('promocao_id', promocaoId)
      .eq('status', 'ativa')
      .maybeSingle();

    if (ativacao) {
      await markAsUsed(ativacao.id, orcamentoId, fatura.cliente_id);
    } else {
      if (import.meta.env.DEV) console.log(`[Promocoes] Nenhuma ativação 'ativa' encontrada para o cliente ${fatura.cliente_id} e promoção ${promocaoId}`);
    }

  } catch (error) {
    console.error('[Promocoes] Erro crítico ao processar uso de promoção:', error);
  }
}

async function markAsUsed(ativacaoId: string, orcamentoId: string, clienteId: string) {
  if (import.meta.env.DEV) console.log(`[Promocoes] Marcando ativação ${ativacaoId} como usada.`);
  
  const { error } = await supabase
    .from('cliente_promocoes')
    .update({
      status: 'usada',
      data_uso: new Date().toISOString(),
      orcamento_id: orcamentoId
    })
    .eq('id', ativacaoId);

  if (error) {
    console.error(`[Promocoes] Erro ao atualizar status para usada:`, error);
    return;
  }

  await logService.logAction({
    ator_tipo: 'sistema',
    acao: 'USO_PROMOCAO_CONCLUIDO',
    detalhes: `Promoção vinculada ao orçamento ${orcamentoId.slice(0, 8)} marcada como usada após pagamento da fatura.`
  });
}

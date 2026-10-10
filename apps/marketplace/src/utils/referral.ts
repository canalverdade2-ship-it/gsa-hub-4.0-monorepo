import { supabase } from '../lib/supabase';
import { createNotification } from '../lib/notifications';
import { formatCurrency } from '../lib/utils';
import { toast } from 'react-hot-toast';
import {
  fetchReferralSettings,
  includesCarteira,
  includesPontosIndicador,
  getIndicadorNotificationText
} from './referralHelpers';
import { processGamificationPointsManual } from './gamification';

interface IndicadorInfo {
  id: string;
  nome: string;
  saldo_carteira: number | null;
}

interface IndicationRecord {
  id: string;
  status: string;
  indicador: IndicadorInfo;
}

export async function processReferralBonus(faturaId: string) {
  try {
    // 1. Buscar dados completos da fatura, cliente e indicador
    const { data: fatura, error: faturaError } = await supabase
      .from('faturas')
      .select(`
        *,
        clientes (id, nome, indicacao_origem_id),
        ordens_servico (orcamentos (total, desconto)),
        ordens_compra (orcamentos (total, desconto)),
        ordens_assinatura (orcamentos (total, desconto))
      `)
      .eq('id', faturaId)
      .single();

    if (faturaError || !fatura) {
      console.error('Erro ao buscar fatura para bônus:', faturaError);
      return;
    }

    // Se não tem indicação de origem, não faz nada
    if (!fatura.clientes?.indicacao_origem_id) return;

    // 2. Buscar informações da indicação vinculada ao cliente
    const { data: indicacao, error: indError } = await supabase
      .from('indicacoes')
      .select('*, indicador:indicador_id(id, nome, saldo_carteira)')
      .eq('id', fatura.clientes.indicacao_origem_id)
      .single();

    if (indError || !indicacao) {
      if (import.meta.env.DEV) console.log(`[Referral] Indicação ${fatura.clientes.indicacao_origem_id} não encontrada para o cliente ${fatura.cliente_id}`);
      return;
    }

    // Se a indicação não estiver 'aberta', o bônus já foi pago ou cancelado
    if (indicacao.status !== 'aberta') {
      if (import.meta.env.DEV) console.log(`[Referral] Bônus ignorado. Status da indicação ${indicacao.id} é ${indicacao.status}`);
      return;
    }

    // 3. Buscar configurações dinâmicas de indicação
    const settings = await fetchReferralSettings();

    // 4. Calcular valor bruto da fatura
    const orcamento = fatura.ordens_servico?.orcamentos ||
                     fatura.ordens_compra?.orcamentos ||
                     fatura.ordens_assinatura?.orcamentos;

    const orcData = Array.isArray(orcamento) ? orcamento[0] : orcamento;
    const grossValue = (Number(orcData?.total) || Number(fatura.valor_total)) + (Number(orcData?.desconto) || 0);

    const indicator = (indicacao as unknown as IndicationRecord).indicador;
    const indicadoNome = fatura.clientes.nome;

    let bonusCarteira = 0;
    let bonusPontos = 0;

    // 5a. Processar bônus em CARTEIRA (se configurado)
    if (includesCarteira(settings.indicador_tipo)) {
      bonusCarteira = grossValue * 0.1;
      if (bonusCarteira > settings.indicador_limite_carteira) {
        bonusCarteira = settings.indicador_limite_carteira;
      }

      if (bonusCarteira > 0) {
        const newBalance = (Number(indicator.saldo_carteira) || 0) + bonusCarteira;

        // Creditar carteira do indicador
        const { error: updateError } = await supabase
          .from('clientes')
          .update({ saldo_carteira: newBalance })
          .eq('id', indicator.id);

        if (updateError) throw updateError;

        // Registrar lançamentos
        const { data: lancData, error: lancError } = await supabase.from('carteira_lancamentos').insert([{
          cliente_id: indicator.id,
          valor: bonusCarteira,
          tipo: 'credito',
          descricao: `Bônus por indicação concluída: ${indicadoNome}`
        }]).select();

        if (lancError) {
          await supabase.from('clientes').update({ saldo_carteira: Number(indicator.saldo_carteira) || 0 }).eq('id', indicator.id);
          throw lancError;
        }

        const { error: extratoError } = await supabase.from('extrato_financeiro').insert([{
          cliente_id: indicator.id,
          tipo: 'entrada',
          valor: bonusCarteira,
          descricao: `Bônus de indicação: ${indicadoNome}`,
          saldo_resultante: newBalance
        }]);

        if (extratoError) {
          if (lancData?.[0]?.id) {
            await supabase.from('carteira_lancamentos').delete().eq('id', lancData[0].id);
          }
          await supabase.from('clientes').update({ saldo_carteira: Number(indicator.saldo_carteira) || 0 }).eq('id', indicator.id);
          throw extratoError;
        }
      }
    }

    // 5b. Processar bônus em PONTOS (se configurado)
    if (includesPontosIndicador(settings.indicador_tipo) && settings.indicador_valor_pontos > 0) {
      bonusPontos = settings.indicador_valor_pontos;
      await processGamificationPointsManual(
        indicator.id,
        bonusPontos,
        `Bônus por indicação concluída: ${indicadoNome}`,
        'indicacao'
      );
    }

    // 6. Marcar indicação como concluída
    await supabase
      .from('indicacoes')
      .update({
        status: 'concluída',
        bonus_indicador: bonusCarteira,
        data_conclusao: new Date().toISOString()
      })
      .eq('id', indicacao.id);

    // 7. Notificar indicador com texto dinâmico
    const notifText = getIndicadorNotificationText(settings, indicadoNome, bonusCarteira > 0 ? bonusCarteira : undefined);
    await createNotification(
      indicator.id,
      '🎁 Bônus de Indicação!',
      notifText,
      'financeiro'
    );

    // 8. Toast de confirmação (apenas se houver carteira)
    if (bonusCarteira > 0) {
      toast.success(`Bônus de ${formatCurrency(bonusCarteira)} creditado ao indicador!`);
    } else if (bonusPontos > 0) {
      toast.success(`${bonusPontos} pontos creditados ao indicador!`);
    }
  } catch (error) {
    console.error('Erro ao processar bônus de indicação:', error);
  }
}

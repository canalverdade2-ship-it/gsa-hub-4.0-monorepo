import { supabase } from '../lib/supabase';
import { callAdminRpc } from '../lib/adminRpc';

export async function processGamificationPointsManual(clienteId: string, pontosGerados: number, descricao: string, tipo: string = 'bonus', colaboradorNome?: string, silent: boolean = false): Promise<boolean> {
  try {
    if (isNaN(pontosGerados) || (pontosGerados === 0 && tipo !== 'ajuste_manual')) return true;

    const result = await callAdminRpc<any>('gsa_admin_adjust_points', {
      p_cliente_id: clienteId,
      p_pontos: Math.trunc(pontosGerados),
      p_descricao: descricao,
    });

    if (result && result.success === false) {
      console.error('Error processing manual gamification points via RPC:', result?.error);
      return false;
    }

    if (result && result.success) {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error processing manual gamification points:', error);
    return false;
  }
}
export async function processGamificationPoints(clienteId: string, valorPago: number, faturaId?: string, descricao?: string, silent: boolean = false) {
  try {
    const { data: clientData, error: clientError } = await supabase
      .from('clientes')
      .select(`
        saldo_pontos,
        pontos_totais,
        nivel_id,
        nivel_manual_id,
        client_levels!nivel_id (
          nome_nivel,
          pontos_por_real
        )
      `)
      .eq('id', clienteId)
      .single();

    if (clientError || !clientData) {
      console.error('Error fetching client data for gamification:', clientError);
      return;
    }

    // Get points multiplier from current level (manual or automatic)
    let pontosPorReal = 1;
    const levelData = Array.isArray(clientData.client_levels) 
      ? clientData.client_levels[0] 
      : clientData.client_levels;

    if (levelData?.pontos_por_real) {
      pontosPorReal = Number(levelData.pontos_por_real);
    }

    const pontosGerados = Math.floor(Math.round(valorPago * 100) / 100 * pontosPorReal);

    if (pontosGerados <= 0) return;

    const result = await callAdminRpc<any>('gsa_admin_adjust_points', {
      p_cliente_id: clienteId,
      p_pontos: pontosGerados,
      p_descricao: descricao || 'Pontos gerados por ajuste administrativo',
    });

    if (result && result.success === false) {
      console.error('Error processing gamification points via RPC:', result?.error);
      return;
    }

  } catch (error) {
    console.error('Error processing gamification points:', error);
  }
}

export async function removeGamificationPoints(clienteId: string, faturaId: string) {
  try {
    const { data: oldTx } = await supabase
      .from('pontos_movimentacoes')
      .select('pontos')
      .eq('fatura_id', faturaId)
      .eq('tipo', 'geracao_fatura')
      .maybeSingle();

    const pontosRemovidos = Number(oldTx?.pontos || 0);

    if (pontosRemovidos <= 0) return;

    const result = await callAdminRpc<any>('gsa_admin_adjust_points', {
      p_cliente_id: clienteId,
      p_pontos: -Math.abs(pontosRemovidos),
      p_descricao: 'Estorno de pontos por cancelamento de fatura',
    });

    if (result && result.success === false) {
      console.error('Error processing gamification points removal via RPC:', result?.error);
      return;
    }
  } catch (error) {
    console.error('Error removing gamification points:', error);
  }
}

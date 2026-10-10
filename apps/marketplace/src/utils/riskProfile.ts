import { supabase } from '../lib/supabase';

/**
 * Calcula o perfil de risco de um cliente baseado no histórico do sistema
 * 
 * Fatores considerados:
 * - Tempo como cliente (mais tempo = menor risco)
 * - Faturas pagas vs vencidas (histórico de pagamento)
 * 
 * Retorna: 'baixo' | 'medio' | 'alto'
 */
export async function calcularPerfilRisco(clienteId: string): Promise<'baixo' | 'medio' | 'alto'> {
  let score = 100; // Começa com score perfeito

  try {
    // Executar todas as consultas em paralelo
    const [
      { data: cliente },
      { data: faturas },
      { count: cobrancas }
    ] = await Promise.all([
      supabase
        .from('clientes')
        .select('data_cadastro')
        .eq('id', clienteId)
        .single(),
      supabase
        .from('faturas')
        .select('status')
        .eq('cliente_id', clienteId),
      supabase
        .from('cobrancas')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .neq('status', 'resolvida')
    ]);

    // 1. Tempo como cliente
    if (cliente) {
      const mesesComCliente = Math.floor(
        (Date.now() - new Date(cliente.data_cadastro).getTime()) / (30 * 24 * 60 * 60 * 1000)
      );
      // Mais tempo = bônus (máx 20 pontos)
      score += Math.min(mesesComCliente * 2, 20);
    }

    // 2. Histórico de faturas
    if (faturas && faturas.length > 0) {
      const pagas = faturas.filter(f => f.status === 'pago').length;
      const vencidas = faturas.filter(f => f.status === 'vencida').length;
      const total = faturas.length;

      // Taxa de pagamento
      const taxaPagamento = total > 0 ? pagas / total : 0;
      score += taxaPagamento * 30; // Máx 30 pontos

      // Penalidade por vencidas
      score -= vencidas * 15;
    }

    // 3. Cobrança ativa
    if (cobrancas && cobrancas > 0) {
      score -= cobrancas * 20;
    }

    // Classificar
    if (score >= 80) return 'baixo';
    if (score >= 50) return 'medio';
    return 'alto';

  } catch (error) {
    console.error('Erro ao calcular perfil de risco:', error);
    return 'medio'; // Default em caso de erro
  }
}

/**
 * Retorna a cor e o label do perfil de risco
 */
export function getPerfilRiscoInfo(perfil: string | null | undefined) {
  switch (perfil) {
    case 'baixo':
      return { label: 'Baixo', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200', icon: '🟢' };
    case 'medio':
      return { label: 'Médio', color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', icon: '🟡' };
    case 'alto':
      return { label: 'Alto', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200', icon: '🔴' };
    default:
      return { label: 'Não avaliado', color: 'text-neutral-500', bg: 'bg-neutral-50', ring: 'ring-neutral-200', icon: '⚪' };
  }
}

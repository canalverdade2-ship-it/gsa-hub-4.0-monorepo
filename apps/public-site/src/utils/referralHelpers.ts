import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IndicadorRewardType = 'carteira' | 'pontos' | 'ambos';
export type IndicadoRewardType = 'desconto' | 'pontos' | 'ambos';

export interface ReferralSettings {
  // Indicador
  indicador_tipo: IndicadorRewardType;
  indicador_limite_carteira: number;
  indicador_valor_pontos: number;
  // Indicado
  indicado_tipo: IndicadoRewardType;
  indicado_desconto_porcentagem: number;
  indicado_valor_pontos: number;
  // Template
  template_mensagem: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: ReferralSettings = {
  indicador_tipo: 'carteira',
  indicador_limite_carteira: 20,
  indicador_valor_pontos: 50,
  indicado_tipo: 'desconto',
  indicado_desconto_porcentagem: 10,
  indicado_valor_pontos: 50,
  template_mensagem:
    'Olá! Você acabou de ganhar uma recompensa especial no Grupo GSA por ter sido indicado pelo {nome_indicador}! Ao realizar seu primeiro acesso, valide seu número de celular {codigo} para garantir {recompensa_indicado} na sua conta!'
};

// ─── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Busca as configurações de indicação do banco.
 * Usa fallback para chaves legadas quando novas não existem.
 */
export async function fetchReferralSettings(): Promise<ReferralSettings> {
  try {
    const { data } = await supabase.from('system_settings').select('key, value');
    if (!data) return DEFAULTS;

    const get = (key: string, fallback: string): string =>
      data.find(s => s.key === key)?.value ?? fallback;

    // Indicador — com fallback para chave legada
    const indicadorTipo = get('indicador_recompensa_tipo', 'carteira') as IndicadorRewardType;
    const indicadorLimiteCarteira = parseFloat(
      get('indicador_limite_carteira', get('bonus_indicador', '20'))
    );
    const indicadorValorPontos = parseFloat(get('indicador_valor_pontos', '50'));

    // Indicado — com fallback para chave legada
    const indicadoTipo = get('indicado_recompensa_tipo', 'desconto') as IndicadoRewardType;
    const indicadoDescontoPorcentagem = parseFloat(
      get('indicado_desconto_porcentagem', get('desconto_indicado_porcentagem', '10'))
    );
    const indicadoValorPontos = parseFloat(get('indicado_valor_pontos', '50'));

    const templateMensagem =
      get('template_mensagem_indicacao', '') || DEFAULTS.template_mensagem;

    return {
      indicador_tipo: indicadorTipo,
      indicador_limite_carteira: isNaN(indicadorLimiteCarteira) ? 20 : indicadorLimiteCarteira,
      indicador_valor_pontos: isNaN(indicadorValorPontos) ? 50 : indicadorValorPontos,
      indicado_tipo: indicadoTipo,
      indicado_desconto_porcentagem: isNaN(indicadoDescontoPorcentagem) ? 10 : indicadoDescontoPorcentagem,
      indicado_valor_pontos: isNaN(indicadoValorPontos) ? 50 : indicadoValorPontos,
      template_mensagem: templateMensagem
    };
  } catch {
    return DEFAULTS;
  }
}

// ─── Type guards ──────────────────────────────────────────────────────────────

export function includesCarteira(tipo: IndicadorRewardType): boolean {
  return tipo === 'carteira' || tipo === 'ambos';
}

export function includesPontosIndicador(tipo: IndicadorRewardType): boolean {
  return tipo === 'pontos' || tipo === 'ambos';
}

export function includesDesconto(tipo: IndicadoRewardType): boolean {
  return tipo === 'desconto' || tipo === 'ambos';
}

export function includesPontosIndicado(tipo: IndicadoRewardType): boolean {
  return tipo === 'pontos' || tipo === 'ambos';
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Formata a recompensa do indicador para exibição.
 * Ex: "Até R$ 20,00" | "50 pontos" | "Até R$ 20,00 + 50 pontos"
 */
export function formatIndicadorReward(s: ReferralSettings): string {
  const parts: string[] = [];
  if (includesCarteira(s.indicador_tipo)) {
    parts.push(`Até ${formatCurrency(s.indicador_limite_carteira)}`);
  }
  if (includesPontosIndicador(s.indicador_tipo)) {
    parts.push(`${s.indicador_valor_pontos} pontos`);
  }
  return parts.join(' + ') || 'Sem recompensa';
}

/**
 * Formata a recompensa do indicado para exibição.
 * Ex: "10% de desconto" | "50 pontos" | "10% de desconto + 50 pontos"
 */
export function formatIndicadoReward(s: ReferralSettings): string {
  const parts: string[] = [];
  if (includesDesconto(s.indicado_tipo)) {
    parts.push(`${s.indicado_desconto_porcentagem}% de desconto`);
  }
  if (includesPontosIndicado(s.indicado_tipo)) {
    parts.push(`${s.indicado_valor_pontos} pontos`);
  }
  return parts.join(' + ') || 'Sem recompensa';
}

/**
 * Formata o texto da notificação do indicador ao receber bônus.
 */
export function getIndicadorNotificationText(
  s: ReferralSettings,
  indicadoNome: string,
  valorCarteira?: number
): string {
  const parts: string[] = [];
  if (includesCarteira(s.indicador_tipo) && valorCarteira !== undefined) {
    parts.push(`${formatCurrency(valorCarteira)} na sua carteira`);
  }
  if (includesPontosIndicador(s.indicador_tipo)) {
    parts.push(`${s.indicador_valor_pontos} pontos`);
  }
  const recompensa = parts.join(' + ');
  return `Sua indicação de ${indicadoNome} foi concluída e você recebeu ${recompensa}! 🎁`;
}

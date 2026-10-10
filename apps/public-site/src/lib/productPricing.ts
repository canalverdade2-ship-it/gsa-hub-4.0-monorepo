import { Produto, PromotionQuantityInfo, ProductQuantityPriceBreakdown } from '../types';

export function hasActiveProductDiscount(produto: Produto | null | undefined): boolean {
  if (!produto) return false;
  
  const baseValido = !!(
    produto.desconto_ativo &&
    produto.valor_promocional !== undefined &&
    produto.valor_promocional !== null &&
    produto.valor_promocional > 0 &&
    produto.valor_promocional < produto.valor
  );
  
  if (!baseValido) return false;

  // Verificar prazo de validade
  if (produto.desconto_prazo_tipo === 'determinado') {
    if (!produto.desconto_fim_em) return false;
    const agora = new Date();
    const dataFim = new Date(produto.desconto_fim_em);
    if (agora >= dataFim) return false;
  }

  // Verificar cota de quantidade
  if (produto.desconto_limite_quantidade_ativo) {
    const limite = produto.desconto_quantidade_limite ?? 0;
    const utilizada = produto.desconto_quantidade_utilizada ?? 0;
    if (limite > 0 && utilizada >= limite) return false;
  }
  
  return true;
}

export function getProductRegularPrice(produto: Produto | null | undefined): number {
  if (!produto) return 0;
  return produto.valor || 0;
}

export function getProductEffectivePrice(produto: Produto | null | undefined): number {
  if (!produto) return 0;
  if (hasActiveProductDiscount(produto)) {
    return produto.valor_promocional!;
  }
  return produto.valor || 0;
}

export function getProductDiscountAmount(produto: Produto | null | undefined): number {
  if (!produto) return 0;
  if (!hasActiveProductDiscount(produto)) return 0;
  return Math.max(0, Number((produto.valor - produto.valor_promocional!).toFixed(2)));
}

export function getProductDiscountPercentage(produto: Produto | null | undefined): number {
  if (!produto) return 0;
  if (!hasActiveProductDiscount(produto)) return 0;
  if (produto.desconto_percentual !== undefined && produto.desconto_percentual !== null) {
    return produto.desconto_percentual;
  }
  const diff = produto.valor - produto.valor_promocional!;
  return Number(((diff / produto.valor) * 100).toFixed(2));
}

export function formatProductDiscountPercentage(produto: Produto | null | undefined): string {
  if (!produto || !hasActiveProductDiscount(produto)) return '';
  const pct = getProductDiscountPercentage(produto);
  if (pct % 1 === 0) return `${Math.round(pct)}% OFF`;
  const formatted = pct.toFixed(2).replace('.', ',');
  if (formatted.endsWith('0')) return `${formatted.slice(0, -1)}% OFF`;
  return `${formatted}% OFF`;
}

function getLocalDateStringInSP(date: Date): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
  } catch (e) {
    const offset = -3;
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const nd = new Date(utc + (3600000 * offset));
    return nd.toISOString().split('T')[0];
  }
}

// ============================================================
// Funcoes de informacao de cota de quantidade
// ============================================================

export function getProductPromotionQuantityInfo(produto: Produto | null | undefined): PromotionQuantityInfo {
  if (!produto || !produto.desconto_ativo) {
    return { limitadoPorQuantidade: false, quantidadeLimite: null, quantidadeUtilizada: 0, quantidadeRestante: null, campanhaId: null, esgotadaPorQuantidade: false };
  }
  const limitado = !!produto.desconto_limite_quantidade_ativo;
  const limite = produto.desconto_quantidade_limite ?? null;
  const utilizada = produto.desconto_quantidade_utilizada ?? 0;
  const restante = limitado && limite !== null ? Math.max(0, limite - utilizada) : null;
  const esgotada = limitado && restante !== null && restante <= 0;
  return { limitadoPorQuantidade: limitado, quantidadeLimite: limite, quantidadeUtilizada: utilizada, quantidadeRestante: restante, campanhaId: produto.desconto_campanha_id ?? null, esgotadaPorQuantidade: esgotada };
}

export function getProductRemainingPromoQuantity(produto: Produto | null | undefined): number | null {
  return getProductPromotionQuantityInfo(produto).quantidadeRestante;
}

export function getProductQuantityPriceBreakdown(
  produto: Produto | null | undefined,
  quantidadeSolicitada: number
): ProductQuantityPriceBreakdown {
  const valorNormal = getProductRegularPrice(produto);
  const valorPromo = produto?.valor_promocional ?? null;
  const info = getProductPromotionQuantityInfo(produto);
  const descontoAtivoSemCota = !!(
    produto?.desconto_ativo &&
    valorPromo !== null && valorPromo > 0 && valorPromo < valorNormal &&
    (produto.desconto_prazo_tipo !== 'determinado' || (produto.desconto_fim_em && new Date() < new Date(produto.desconto_fim_em)))
  );
  let qtdComDesconto = 0;
  let qtdSemDesconto = quantidadeSolicitada;
  if (descontoAtivoSemCota) {
    if (info.limitadoPorQuantidade && info.quantidadeRestante !== null) {
      qtdComDesconto = Math.min(quantidadeSolicitada, info.quantidadeRestante);
    } else {
      qtdComDesconto = quantidadeSolicitada;
    }
    qtdSemDesconto = quantidadeSolicitada - qtdComDesconto;
  }
  const subtotalComDesconto = Number((qtdComDesconto * (valorPromo ?? valorNormal)).toFixed(2));
  const subtotalSemDesconto = Number((qtdSemDesconto * valorNormal).toFixed(2));
  return {
    quantidadeSolicitada, quantidadeComDesconto: qtdComDesconto, quantidadeSemDesconto: qtdSemDesconto,
    valorNormalUnitario: valorNormal, valorPromocionalUnitario: descontoAtivoSemCota ? valorPromo : null,
    subtotalComDesconto, subtotalSemDesconto, subtotalFinal: Number((subtotalComDesconto + subtotalSemDesconto).toFixed(2)),
    quantidadeRestanteAntes: info.quantidadeRestante, campanhaId: info.campanhaId,
  };
}

// ============================================================
// Funcoes de validade e situacao
// ============================================================

export interface DiscountValidityInfo {
  estaAtiva: boolean;
  precoNormal: number;
  precoPromocional: number | null;
  precoEfetivo: number;
  porcentagemDesconto: number;
  prazoTipo: 'determinado' | 'indeterminado';
  dataFim: string | null;
  diasRestantes: number | null;
  situacao: 'ativa' | 'termina_hoje' | 'expirada' | 'indeterminada' | 'inativa' | 'esgotada_por_quantidade';
  quantityInfo: PromotionQuantityInfo;
}

export function getProductDiscountValidityInfo(produto: Produto | null | undefined): DiscountValidityInfo {
  const precoNormal = getProductRegularPrice(produto);
  const precoEfetivo = getProductEffectivePrice(produto);
  const estaAtiva = hasActiveProductDiscount(produto);
  const porcentagemDesconto = getProductDiscountPercentage(produto);
  const precoPromocional = estaAtiva ? (produto?.valor_promocional ?? null) : null;
  const prazoTipo = produto?.desconto_prazo_tipo || 'indeterminado';
  const dataFim = produto?.desconto_fim_em || null;
  const quantityInfo = getProductPromotionQuantityInfo(produto);
  let diasRestantes: number | null = null;
  let situacao: DiscountValidityInfo['situacao'] = 'inativa';
  if (!produto?.desconto_ativo) {
    situacao = 'inativa';
  } else if (quantityInfo.esgotadaPorQuantidade) {
    situacao = 'esgotada_por_quantidade';
  } else if (prazoTipo === 'indeterminado') {
    situacao = 'indeterminada';
  } else if (dataFim) {
    const d1 = new Date(getLocalDateStringInSP(new Date()));
    const d2 = new Date(getLocalDateStringInSP(new Date(dataFim)));
    diasRestantes = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    if (new Date() >= new Date(dataFim)) {
      situacao = 'expirada';
    } else if (diasRestantes <= 0) {
      situacao = 'termina_hoje';
    } else {
      situacao = 'ativa';
    }
  } else {
    situacao = 'inativa';
  }
  return { estaAtiva, precoNormal, precoPromocional, precoEfetivo, porcentagemDesconto, prazoTipo, dataFim, diasRestantes, situacao, quantityInfo };
}

export function getProductRemainingDaysText(produto: Produto | null | undefined): string {
  if (!produto || !produto.desconto_ativo) return '';
  const info = getProductDiscountValidityInfo(produto);
  if (['inativa', 'expirada', 'esgotada_por_quantidade'].includes(info.situacao)) return '';
  if (info.situacao === 'indeterminada') return 'Oferta por tempo indeterminado';
  if (info.situacao === 'termina_hoje') return 'Termina hoje';
  if (info.diasRestantes !== null) {
    if (info.diasRestantes === 1) return '1 dia restante';
    if (info.diasRestantes > 1) return `${info.diasRestantes} dias restantes`;
  }
  return '';
}

export function getProductRemainingQuantityText(produto: Produto | null | undefined): string {
  if (!produto || !produto.desconto_ativo || !produto.desconto_limite_quantidade_ativo) return '';
  const info = getProductPromotionQuantityInfo(produto);
  if (info.esgotadaPorQuantidade) return 'Cota promocional esgotada';
  if (info.quantidadeRestante === null) return '';
  if (info.quantidadeRestante === 1) return '1 unidade promocional';
  if (info.quantidadeRestante > 1) return `${info.quantidadeRestante} unidades promocionais`;
  return '';
}
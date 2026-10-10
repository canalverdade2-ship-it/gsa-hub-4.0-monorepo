/**
 * Post-Sales Engine & State Simulator Helper
 * Pure TypeScript models and simulation state machine for post-sales operations.
 * Zero external framework dependencies so it can be imported by Vitest and CLI simulation scripts.
 */

export interface ProductInventory {
  id: string;
  nome: string;
  controle_estoque: boolean;
  estoque_disponivel: number;
  valor: number;
}

export interface VariantInventory {
  id: string;
  produto_id: string;
  chave: string;
  nome: string;
  estoque_disponivel: number;
  valor?: number;
}

export interface OrderItem {
  id: string;
  orcamento_id: string;
  tipo: 'produto' | 'assinatura';
  produto_id: string;
  produto_variante_id?: string | null;
  quantidade: number;
  valor_unitario: number;
  total_bruto: number;
}

export interface OrderHeader {
  id: string;
  codigo_orcamento: string;
  cliente_id: string;
  status: 'pendente' | 'pago' | 'em_expedicao' | 'em_transporte' | 'concluido' | 'cancelado';
  subtotal_bruto: number;
  desconto_cupom: number;
  desconto_promocional: number;
  desconto_pontos: number;
  abatimento_carteira: number;
  valor_frete: number;
  total_liquido: number;
  forma_pagamento_loja: string;
}

export interface ReturnSolicitacao {
  id: string;
  cliente_id: string;
  orcamento_origem_id: string;
  tipo: 'devolucao' | 'troca';
  status: 'em_analise' | 'aguardando_devolucao' | 'devolucao_recebida' | 'novo_produto_enviado' | 'concluido' | 'rejeitado' | 'cancelado';
  itens_devolvidos: Array<{ ordem_compra_id: string; quantidade: number; produto_id: string; produto_variante_id?: string | null }>;
  opcao_substituicao?: 'mesmo_produto' | 'outro_produto' | null;
  novos_produtos?: Array<{ produto_id: string; produto_variante_id?: string | null; quantidade: number }>;
  valor_diferenca: number;
  credito_estornado?: boolean;
}

export interface CustomerWalletAndLoyalty {
  id: string;
  nome: string;
  saldo_carteira: number;
  saldo_pontos: number;
  pontos_totais: number;
  indicador_id?: string | null;
}

export interface StockHistoryEntry {
  id: string;
  produto_id: string;
  produto_variante_id?: string | null;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  motivo: string;
  referencia_id: string;
}

export interface RefundRecord {
  id: string;
  orcamento_id: string;
  cliente_id: string;
  solicitacao_id?: string | null;
  valor_reembolso: number;
  status: 'pendente' | 'aguardando_estorno' | 'pago' | 'cancelado';
  metodo_reembolso: 'pix' | 'cartao' | 'credito_carteira' | 'estorno_manual';
  data_pagamento?: string | null;
}

/**
 * Canonical Engine: Proportional Discount Apportionment (CDC Art. 49 Compliant)
 */
export function calculateItemProportionalRefund(
  itemGrossTotal: number,
  orderMerchandiseGrossSubtotal: number,
  orderTotalDiscounts: number
): number {
  if (orderMerchandiseGrossSubtotal <= 0) return 0;
  
  // Apportionment factor: Net Merchandise Paid / Gross Merchandise Total
  const netMerchandisePaid = Math.max(0, orderMerchandiseGrossSubtotal - orderTotalDiscounts);
  const apportionmentFactor = netMerchandisePaid / orderMerchandiseGrossSubtotal;
  
  const refundAmount = Math.round(itemGrossTotal * apportionmentFactor * 100) / 100;
  return Math.min(refundAmount, netMerchandisePaid);
}

export function apportionMultiItemRefund(
  itemsToRefund: Array<{ id: string; grossTotal: number }>,
  orderGrossSubtotal: number,
  orderTotalDiscounts: number
): { itemRefunds: Map<string, number>; totalRefund: number } {
  const netPaid = Math.max(0, orderGrossSubtotal - orderTotalDiscounts);
  if (netPaid === 0 || orderGrossSubtotal === 0) {
    const zeroMap = new Map<string, number>();
    itemsToRefund.forEach(it => zeroMap.set(it.id, 0));
    return { itemRefunds: zeroMap, totalRefund: 0 };
  }

  const factor = netPaid / orderGrossSubtotal;
  const itemRefunds = new Map<string, number>();
  let accumulated = 0;

  itemsToRefund.forEach((it, index) => {
    // If it's the last item of a full order return, penny balance against netPaid
    if (itemsToRefund.length > 1 && index === itemsToRefund.length - 1 && itemsToRefund.reduce((acc, x) => acc + x.grossTotal, 0) === orderGrossSubtotal) {
      const remainder = Math.round((netPaid - accumulated) * 100) / 100;
      itemRefunds.set(it.id, remainder);
      accumulated += remainder;
    } else {
      const share = Math.round(it.grossTotal * factor * 100) / 100;
      itemRefunds.set(it.id, share);
      accumulated += share;
    }
  });

  return { itemRefunds, totalRefund: Math.round(accumulated * 100) / 100 };
}

/**
 * State Machine Simulator for Order Cancellations, Exchanges, Returns, and Security
 */
export class PostSalesStateSimulator {
  products = new Map<string, ProductInventory>();
  variants = new Map<string, VariantInventory>();
  orders = new Map<string, OrderHeader>();
  orderItems = new Map<string, OrderItem[]>();
  solicitacoes = new Map<string, ReturnSolicitacao>();
  customers = new Map<string, CustomerWalletAndLoyalty>();
  refunds = new Map<string, RefundRecord>();
  stockHistory: StockHistoryEntry[] = [];
  walletLedger: Array<{ cliente_id: string; valor: number; tipo: 'credito' | 'debito'; descricao: string }> = [];
  pointsLedger: Array<{ cliente_id: string; pontos: number; tipo: string; descricao: string }> = [];

  // 1. Restock upon cancellation (Parent + Variant)
  cancelOrder(orderId: string, actorType: 'cliente' | 'admin'): { success: boolean; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { success: false, error: 'Pedido não encontrado.' };
    if (order.status === 'cancelado') return { success: false, error: 'Pedido já está cancelado.' };

    const items = this.orderItems.get(orderId) || [];

    // Restock all items
    for (const item of items) {
      if (item.tipo !== 'produto') continue;

      // Parent product restock
      const parentProd = this.products.get(item.produto_id);
      if (parentProd && parentProd.controle_estoque) {
        parentProd.estoque_disponivel += item.quantidade;
        this.stockHistory.push({
          id: `hist-${Date.now()}-${Math.random()}`,
          produto_id: parentProd.id,
          tipo: 'entrada',
          quantidade: item.quantidade,
          motivo: `Cancelamento do pedido #${order.codigo_orcamento}`,
          referencia_id: order.id,
        });
      }

      // Child variant restock
      if (item.produto_variante_id) {
        const variant = this.variants.get(item.produto_variante_id);
        if (variant) {
          variant.estoque_disponivel += item.quantidade;
          this.stockHistory.push({
            id: `hist-var-${Date.now()}-${Math.random()}`,
            produto_id: parentProd?.id || item.produto_id,
            produto_variante_id: variant.id,
            tipo: 'entrada',
            quantidade: item.quantidade,
            motivo: `Cancelamento de variante do pedido #${order.codigo_orcamento}`,
            referencia_id: order.id,
          });
        }
      }
    }

    const client = this.customers.get(order.cliente_id);
    if (client) {
      // Restore spent discount points
      if (order.desconto_pontos > 0) {
        const pointsSpent = Math.round(order.desconto_pontos * 100);
        client.saldo_pontos += pointsSpent;
        this.pointsLedger.push({
          cliente_id: client.id,
          pontos: pointsSpent,
          tipo: 'estorno_desconto',
          descricao: `Estorno de pontos gastos no pedido #${order.codigo_orcamento}`,
        });
      }

      // CLAWBACK EARNED POINTS (Anti-Exploit)
      const earnedPoints = Math.round(order.total_liquido); // 1 point per R$ 1 net
      if (earnedPoints > 0) {
        client.saldo_pontos = Math.max(0, client.saldo_pontos - earnedPoints);
        client.pontos_totais = Math.max(0, client.pontos_totais - earnedPoints);
        this.pointsLedger.push({
          cliente_id: client.id,
          pontos: -earnedPoints,
          tipo: 'estorno_credito',
          descricao: `Revogação de pontos acumulados por cancelamento do pedido #${order.codigo_orcamento}`,
        });
      }

      // CLAWBACK REFERRAL BONUS FROM REFERRER (Anti-Exploit)
      if (client.indicador_id) {
        const referrer = this.customers.get(client.indicador_id);
        if (referrer) {
          const referralCashBonus = Math.round(Math.min(order.subtotal_bruto * 0.10, 20.00) * 100) / 100;
          referrer.saldo_carteira = Math.max(0, Math.round((referrer.saldo_carteira - referralCashBonus) * 100) / 100);
          this.walletLedger.push({
            cliente_id: referrer.id,
            valor: referralCashBonus,
            tipo: 'debito',
            descricao: `Estorno de comissão de indicação por cancelamento do pedido #${order.codigo_orcamento}`,
          });
        }
      }

      // Restore spent wallet balance
      if (order.abatimento_carteira > 0) {
        client.saldo_carteira = Math.round((client.saldo_carteira + order.abatimento_carteira) * 100) / 100;
        this.walletLedger.push({
          cliente_id: client.id,
          valor: order.abatimento_carteira,
          tipo: 'credito',
          descricao: `Estorno de saldo de carteira do pedido #${order.codigo_orcamento}`,
        });
      }

      // Generate refund record if paid externally
      if (order.total_liquido > 0 && order.forma_pagamento_loja !== 'credito_loja') {
        const refundId = `ref-${Date.now()}`;
        this.refunds.set(refundId, {
          id: refundId,
          orcamento_id: order.id,
          cliente_id: client.id,
          valor_reembolso: order.total_liquido,
          status: 'pendente',
          metodo_reembolso: order.forma_pagamento_loja === 'pix' ? 'pix' : 'cartao',
        });
      }
    }

    order.status = 'cancelado';
    return { success: true };
  }

  // 2. Reserve substitute item for exchange
  approveExchange(solicitacaoId: string): { success: boolean; error?: string } {
    const sol = this.solicitacoes.get(solicitacaoId);
    if (!sol) return { success: false, error: 'Solicitação não encontrada.' };
    if (sol.tipo !== 'troca') return { success: false, error: 'Apenas solicitações de troca reservam novos itens.' };
    if (sol.status !== 'em_analise') return { success: false, error: 'Status inválido para aprovação.' };

    // If exchange has substitute products, check and deduct stock
    if (sol.opcao_substituicao === 'outro_produto' && sol.novos_produtos) {
      for (const newItem of sol.novos_produtos) {
        const prod = this.products.get(newItem.produto_id);
        if (prod && prod.controle_estoque) {
          if (prod.estoque_disponivel < newItem.quantidade) {
            return { success: false, error: `Estoque insuficiente para o produto substituto ${prod.nome}.` };
          }
          prod.estoque_disponivel -= newItem.quantidade;
        }

        if (newItem.produto_variante_id) {
          const variant = this.variants.get(newItem.produto_variante_id);
          if (variant) {
            if (variant.estoque_disponivel < newItem.quantidade) {
              return { success: false, error: `Estoque insuficiente para a variante substituta ${variant.nome}.` };
            }
            variant.estoque_disponivel -= newItem.quantidade;
          }
        }
      }
    }

    sol.status = 'aguardando_devolucao';
    return { success: true };
  }

  // 3. Conclude return: Atomic Restocking, Atomic Refund & Loyalty Reversal
  concludeReturn(solicitacaoId: string, refundMethod: 'credito_carteira' | 'gateway_externo'): { success: boolean; error?: string } {
    const sol = this.solicitacoes.get(solicitacaoId);
    if (!sol) return { success: false, error: 'Solicitação não encontrada.' };
    if (sol.status === 'concluido') return { success: false, error: 'Solicitação já concluída.' };

    const order = this.orders.get(sol.orcamento_origem_id);
    if (!order) return { success: false, error: 'Pedido de origem não encontrado.' };

    const client = this.customers.get(sol.cliente_id);
    if (!client) return { success: false, error: 'Cliente não encontrado.' };

    // Restock returned items to parent & variant
    for (const item of sol.itens_devolvidos) {
      const prod = this.products.get(item.produto_id);
      if (prod && prod.controle_estoque) {
        prod.estoque_disponivel += item.quantidade;
        this.stockHistory.push({
          id: `hist-ret-${Date.now()}-${Math.random()}`,
          produto_id: prod.id,
          tipo: 'entrada',
          quantidade: item.quantidade,
          motivo: `Retorno de devolução #${sol.id}`,
          referencia_id: sol.id,
        });
      }

      if (item.produto_variante_id) {
        const variant = this.variants.get(item.produto_variante_id);
        if (variant) {
          variant.estoque_disponivel += item.quantidade;
          this.stockHistory.push({
            id: `hist-ret-var-${Date.now()}-${Math.random()}`,
            produto_id: prod?.id || item.produto_id,
            produto_variante_id: variant.id,
            tipo: 'entrada',
            quantidade: item.quantidade,
            motivo: `Retorno de variante de devolução #${sol.id}`,
            referencia_id: sol.id,
          });
        }
      }
    }

    // If it's a return ('devolucao'), process refund atomically
    if (sol.tipo === 'devolucao') {
      const orderItemsList = this.orderItems.get(order.id) || [];
      const totalDiscounts = order.desconto_cupom + order.desconto_promocional + order.desconto_pontos + order.abatimento_carteira;
      
      let netRefundTotal = 0;
      for (const retItem of sol.itens_devolvidos) {
        const matchedLine = orderItemsList.find(x => x.produto_id === retItem.produto_id && (!retItem.produto_variante_id || x.produto_variante_id === retItem.produto_variante_id));
        const unitVal = matchedLine ? matchedLine.valor_unitario : 0;
        const grossItemVal = unitVal * retItem.quantidade;
        const itemRefund = calculateItemProportionalRefund(grossItemVal, order.subtotal_bruto, totalDiscounts);
        netRefundTotal += itemRefund;
      }
      netRefundTotal = Math.round(netRefundTotal * 100) / 100;

      // Revoke points earned on the refunded amount
      const pointsToClawback = Math.round(netRefundTotal);
      if (pointsToClawback > 0) {
        client.saldo_pontos = Math.max(0, client.saldo_pontos - pointsToClawback);
        client.pontos_totais = Math.max(0, client.pontos_totais - pointsToClawback);
        this.pointsLedger.push({
          cliente_id: client.id,
          pontos: -pointsToClawback,
          tipo: 'estorno_devolucao',
          descricao: `Revogação de pontos por devolução concluída #${sol.id}`,
        });
      }

      if (refundMethod === 'credito_carteira') {
        client.saldo_carteira = Math.round((client.saldo_carteira + netRefundTotal) * 100) / 100;
        this.walletLedger.push({
          cliente_id: client.id,
          valor: netRefundTotal,
          tipo: 'credito',
          descricao: `Reembolso em carteira da devolução #${sol.id}`,
        });

        const refundId = `ref-${Date.now()}`;
        this.refunds.set(refundId, {
          id: refundId,
          orcamento_id: order.id,
          cliente_id: client.id,
          solicitacao_id: sol.id,
          valor_reembolso: netRefundTotal,
          status: 'pago',
          metodo_reembolso: 'credito_carteira',
          data_pagamento: new Date().toISOString(),
        });
      } else {
        const refundId = `ref-${Date.now()}`;
        this.refunds.set(refundId, {
          id: refundId,
          orcamento_id: order.id,
          cliente_id: client.id,
          solicitacao_id: sol.id,
          valor_reembolso: netRefundTotal,
          status: 'pendente',
          metodo_reembolso: 'pix',
        });
      }
    }

    sol.status = 'concluido';
    return { success: true };
  }

  // 4. Client RLS Policy Simulator
  attemptClientDirectMutation(
    actorType: 'cliente' | 'colaborador',
    actorId: string,
    solicitacaoId: string,
    mutationPayload: Partial<ReturnSolicitacao>
  ): { allowed: boolean; error?: string } {
    const sol = this.solicitacoes.get(solicitacaoId);
    if (!sol) return { allowed: false, error: 'Registro não encontrado.' };

    // If client actor: RLS check
    if (actorType === 'cliente') {
      if (sol.cliente_id !== actorId) {
        return { allowed: false, error: 'RLS VIOLATION: Acesso negado a registro de outro cliente.' };
      }

      // Hardened RLS: Client CANNOT update privileged status or difference amount directly
      const privilegedKeys = ['status', 'valor_diferenca', 'resposta_admin', 'credito_estornado'];
      for (const key of privilegedKeys) {
        if (key in mutationPayload && mutationPayload[key as keyof ReturnSolicitacao] !== sol[key as keyof ReturnSolicitacao]) {
          return { allowed: false, error: `RLS VIOLATION: Cliente não tem permissão para alterar a coluna '${key}' diretamente.` };
        }
      }
    }

    Object.assign(sol, mutationPayload);
    return { allowed: true };
  }
}

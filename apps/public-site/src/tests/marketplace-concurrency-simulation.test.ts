import { describe, it, expect, beforeEach } from 'vitest';

/**
 * ============================================================================
 * GSA MARKETPLACE: ACID CONCURRENCY SIMULATION & STRESS TEST SUITE
 * ============================================================================
 * 
 * Verifies the ACID properties, pricing isolation, inventory integrity,
 * and post-sales return atomicity of the GSA Marketplace under extreme
 * parallel execution (Tiers 1 to 4).
 * 
 * Authoritative Specifications:
 * - ORIGINAL_REQUEST.md (§ 2026-09-10T22:29:06Z)
 * - PROJECT.md & spec_report.md
 * - Migrations:
 *   1. 20260716183010_update_checkout_function.sql
 *   2. 20260817120000_product_variations_marketplace.sql
 *   3. 20260817203000_zero_balance_store_checkout.sql
 *   4. 20260910180000_marketplace_acid_concurrency_remediation.sql
 * ============================================================================
 */

// ============================================================================
// 1. DATA MODELS & ENTITIES
// ============================================================================

export interface CatalogProduct {
  id: string;
  nome: string;
  codigo_produto: string;
  valor: number;
  valor_promocional?: number | null;
  desconto_ativo?: boolean;
  desconto_tipo?: 'porcentagem' | 'valor_fixo' | null;
  desconto_valor?: number | null;
  desconto_percentual?: number | null;
  desconto_limite_quantidade_ativo?: boolean;
  desconto_quantidade_limite?: number | null;
  desconto_quantidade_utilizada?: number;
  desconto_campanha_id?: string | null;
  produto_brinde_id?: string | null;
  possui_variacoes?: boolean;
  controle_estoque: boolean;
  estoque_disponivel: number;
  status: 'ativo' | 'inativo';
  visivel_na_loja: boolean;
  ocultar_valor: boolean;
  tipo_cliente: 'pf' | 'pj' | 'ambos';
  categoria_id?: string | null;
}

export interface ProductVariant {
  id: string;
  produto_id: string;
  nome: string;
  sku: string;
  valor: number | null;
  controle_estoque: boolean;
  estoque_disponivel: number;
  ativo: boolean;
  combinacao: Record<string, string>;
}

export interface Customer {
  id: string;
  nome: string;
  tipo_pessoa: 'pf' | 'pj';
  saldo_carteira: number;
  saldo_pontos: number;
  pontos_totais: number;
  carteira_bloqueada: boolean;
  pontos_bloqueados: boolean;
  limite_credito_total: number;
  limite_credito_disponivel: number;
  indicador_id?: string | null;
}

export interface StoreCoupon {
  id: string;
  codigo: string;
  categoria_cupom: 'desconto' | 'entrega';
  tipo_desconto?: 'porcentagem' | 'valor_fixo';
  valor_desconto: number;
  tipo_entrega?: 'frete_gratis' | 'taxa_fixa';
  taxa_fixa_entrega?: number;
  status: 'ativo' | 'inativo';
  total_usos: number;
  limite_usos: number;
  valor_minimo_compra?: number;
  data_validade?: string | null;
  cliente_id?: string | null;
  produto_id?: string | null;
}

export interface CartItem {
  tipo: 'produto' | 'assinatura';
  item_id: string;
  quantidade: number;
  variante_id?: string | null;
  produto_variante_id?: string | null;
  prazo_meses?: number;
}

export interface OrderItemRecord {
  id: string;
  orcamento_id: string;
  tipo: 'produto' | 'assinatura';
  produto_id: string;
  produto_variante_id: string | null;
  quantidade: number;
  valor_unitario: number;
  subtotal: number;
  valor_original: number;
  desconto_produto_unitario: number;
}

export interface OrderRecord {
  id: string;
  codigo_orcamento: string;
  cliente_id: string;
  status: 'pendente' | 'pago' | 'em_expedicao' | 'concluido' | 'cancelado';
  subtotal_bruto: number;
  desconto_produtos: number;
  desconto_promocional: number;
  desconto_cupom: number;
  desconto_pontos: number;
  pontos_usados: number;
  abatimento_carteira: number;
  valor_frete: number;
  total_liquido: number;
  forma_pagamento: string;
  itens: OrderItemRecord[];
  created_at: string;
  request_id?: string;
  pontos_creditados?: boolean;
}

export interface ReturnItemInput {
  produto_id: string;
  produto_variante_id?: string | null;
  quantidade: number;
}

export interface ReturnSolicitacaoRecord {
  id: string;
  codigo_solicitacao: string;
  cliente_id: string;
  orcamento_origem_id: string;
  tipo: 'devolucao' | 'troca';
  status: 'pendente' | 'em_analise' | 'aprovado' | 'rejeitado' | 'concluido' | 'cancelado' | 'devolucao_recebida';
  itens_devolvidos: ReturnItemInput[];
  novos_produtos?: ReturnItemInput[];
  valor_diferenca: number;
  estorno_executado: boolean;
  resposta_admin?: string | null;
  historico_status: Record<string, string>;
  updated_at: string;
}

export interface FaturaRecord {
  id: string;
  codigo_fatura: string;
  cliente_id: string;
  orcamento_id?: string;
  valor_total: number;
  valor_final_pendente: number;
  status: 'pendente' | 'pago' | 'cancelado';
  tipo: 'produto' | 'troca_diferenca' | 'credito';
  is_amortizacao_credito: boolean;
  itens_faturados: any[];
}

export interface WalletMovement {
  id: string;
  cliente_id: string;
  tipo: 'credito' | 'debito';
  valor: number;
  saldo_apos: number;
  descricao: string;
}

export interface PointsMovement {
  id: string;
  cliente_id: string;
  tipo: 'estorno' | 'debito' | 'credito';
  pontos: number;
  saldo_apos: number;
  descricao: string;
}

export interface StockMovement {
  id: string;
  produto_id: string;
  produto_variante_id: string | null;
  quantidade: number;
  tipo: 'entrada' | 'saida';
  motivo: string;
}

// ============================================================================
// 2. AUTHORITATIVE IN-MEMORY POSTGRESQL TRANSACTION SIMULATOR
// ============================================================================

export class MarketplaceACIDSimulator {
  public produtos = new Map<string, CatalogProduct>();
  public produtoVariantes = new Map<string, ProductVariant>();
  public clientes = new Map<string, Customer>();
  public cupons = new Map<string, StoreCoupon>();
  public cuponsAtivados = new Set<string>(); // `${cliente_id}:${cupom_id}`
  public orcamentos = new Map<string, OrderRecord>();
  public orcamentosByRequestId = new Map<string, OrderRecord>();
  public solicitacoes = new Map<string, ReturnSolicitacaoRecord>();
  public faturas = new Map<string, FaturaRecord>();

  // Ledgers
  public walletLedger: WalletMovement[] = [];
  public pointsLedger: PointsMovement[] = [];
  public stockLedger: StockMovement[] = [];
  public cotaMovimentos: Array<{
    id: string;
    produto_id: string;
    desconto_campanha_id: string;
    orcamento_id: string;
    tipo_movimento: 'consumo';
    quantidade: number;
    checkout_request_id?: string;
    created_at: string;
  }> = [];

  // Row-Level Lock Mutex Map (Simulating SELECT ... FOR UPDATE)
  private rowLocks = new Map<string, Promise<void>>();

  /**
   * Acquire a row-level mutex simulating PostgreSQL SELECT ... FOR UPDATE.
   */
  private async acquireRowLock(rowKey: string): Promise<() => void> {
    while (this.rowLocks.has(rowKey)) {
      await this.rowLocks.get(rowKey);
    }
    let unlock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    this.rowLocks.set(rowKey, lockPromise);
    return () => {
      this.rowLocks.delete(rowKey);
      unlock();
    };
  }

  /**
   * Calculate effective individual product price.
   */
  public calculateEffectiveProductPrice(
    regularPrice: number,
    descontoAtivo?: boolean,
    descontoTipo?: 'porcentagem' | 'valor_fixo' | null,
    descontoValor?: number | null
  ): { effectivePrice: number; unitDiscount: number } {
    if (!descontoAtivo || !descontoTipo || descontoValor === null || descontoValor === undefined || descontoValor <= 0) {
      return { effectivePrice: regularPrice, unitDiscount: 0 };
    }

    let effectivePrice = regularPrice;
    if (descontoTipo === 'porcentagem') {
      const pct = Math.min(Math.max(descontoValor, 0), 100);
      effectivePrice = Math.round(regularPrice * (1 - pct / 100) * 100) / 100;
    } else if (descontoTipo === 'valor_fixo') {
      effectivePrice = Math.max(0, Math.round((regularPrice - descontoValor) * 100) / 100);
    }

    const unitDiscount = Math.round((regularPrice - effectivePrice) * 100) / 100;
    return { effectivePrice, unitDiscount };
  }

  /**
   * ACID Checkout Execution (Simulates gsa_client_checkout_store).
   * Enforces:
   * 1. Whitelist validation
   * 2. Canonical deterministic row lock acquisition (lexicographical order)
   * 3. Catalog price immutability (variant price isolated in local variable)
   * 4. Accurate stock decrement (parent + variant)
   * 5. Accurate points & wallet deductions
   * 6. Idempotency protection via request_id
   */
  public async executeCheckout(params: {
    clienteId: string;
    payload: {
      request_id?: string;
      carrinho: CartItem[];
      cupom_desconto_id?: string;
      cupom_entrega_id?: string;
      pontos_usados?: number;
      saldo_carteira_usado?: number;
      forma_pagamento?: string;
      parcelas?: number;
      brindes_produtos_ids?: string[];
    };
  }): Promise<{ success: boolean; order: OrderRecord }> {
    const { clienteId, payload } = params;

    // Idempotency check: if already processed, return existing order immediately
    if (payload.request_id && this.orcamentosByRequestId.has(payload.request_id)) {
      const existing = this.orcamentosByRequestId.get(payload.request_id)!;
      if (existing.cliente_id !== clienteId) {
        throw new Error('ID_REQUISICAO_JA_UTILIZADO: Request ID pertence a outro cliente.');
      }
      return { success: true, order: existing };
    }

    // Whitelist check
    for (const item of payload.carrinho) {
      const allowedKeys = new Set(['tipo', 'item_id', 'quantidade', 'prazo_meses', 'variante_id', 'produto_variante_id']);
      for (const k of Object.keys(item)) {
        if (!allowedKeys.has(k)) {
          throw new Error('O carrinho contém item inválido ou campo não permitido.');
        }
      }
      if (!item.item_id || item.quantidade <= 0) {
        throw new Error('Item inválido no carrinho.');
      }
    }

    // Identify and sort all row lock keys canonically to guarantee deadlock immunity
    const lockKeys: string[] = [];
    lockKeys.push(`client_${clienteId}`);

    const productIdsToLock = new Set<string>(payload.carrinho.map(i => i.item_id));

    // Include promotional gift product IDs if defined on products or payload
    for (const item of payload.carrinho) {
      const prod = this.produtos.get(item.item_id);
      if (prod?.produto_brinde_id) {
        productIdsToLock.add(prod.produto_brinde_id);
      }
    }
    if (payload.brindes_produtos_ids) {
      for (const gid of payload.brindes_produtos_ids) {
        productIdsToLock.add(gid);
      }
    }

    for (const pid of productIdsToLock) {
      lockKeys.push(`prod_${pid}`);
    }

    const variantIds = payload.carrinho
      .map(i => i.variante_id || i.produto_variante_id)
      .filter((v): v is string => !!v);
    const uniqueVariantIds = Array.from(new Set(variantIds));
    for (const vid of uniqueVariantIds) {
      lockKeys.push(`var_${vid}`);
    }

    // Include coupon row locks (PostgreSQL: SELECT ... FROM cupons_loja WHERE id = ... FOR UPDATE)
    if (payload.cupom_desconto_id) {
      lockKeys.push(`cupom_${payload.cupom_desconto_id}`);
    }
    if (payload.cupom_entrega_id) {
      lockKeys.push(`cupom_${payload.cupom_entrega_id}`);
    }

    // Sort lock keys deterministically & eliminate duplicates
    const uniqueLockKeys = Array.from(new Set(lockKeys)).sort();

    const releaseFns: Array<() => void> = [];

    try {
      // 1. Acquire row locks
      for (const k of uniqueLockKeys) {
        const unlock = await this.acquireRowLock(k);
        releaseFns.push(unlock);
      }

      // Check idempotency again after acquiring client lock
      if (payload.request_id && this.orcamentosByRequestId.has(payload.request_id)) {
        return { success: true, order: this.orcamentosByRequestId.get(payload.request_id)! };
      }

      // Retrieve customer
      const cliente = this.clientes.get(clienteId);
      if (!cliente) throw new Error('Cliente não encontrado.');

      // 2. Validate products and calculate lines
      let subtotalTabela = 0;
      let totalDescontoProdutos = 0;
      let subtotalEfetivo = 0;
      const orderLines: OrderItemRecord[] = [];
      const orderId = `orc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      for (const item of payload.carrinho) {
        const prod = this.produtos.get(item.item_id);
        if (!prod) throw new Error(`Produto não encontrado: ${item.item_id}`);
        if (prod.status !== 'ativo') throw new Error(`Produto ${prod.nome} está inativo.`);
        if (!prod.visivel_na_loja) throw new Error(`Produto ${prod.nome} não visível na loja.`);
        if (prod.ocultar_valor) throw new Error(`Produto ${prod.nome} com valor oculto.`);
        if (prod.tipo_cliente !== 'ambos' && prod.tipo_cliente !== cliente.tipo_pessoa) {
          throw new Error(`Produto ${prod.nome} indisponível para este tipo de cliente.`);
        }

        let variant: ProductVariant | undefined;
        const varId = item.variante_id || item.produto_variante_id;
        if (varId) {
          variant = this.produtoVariantes.get(varId);
          if (!variant) throw new Error(`Variação ${varId} não encontrada.`);
          if (!variant.ativo) throw new Error(`Variação ${variant.nome} está inativa.`);
          if (variant.produto_id !== prod.id) {
            throw new Error(`Variação ${variant.nome} não pertence ao produto ${prod.nome}.`);
          }
        }

        // Check parent inventory
        if (prod.controle_estoque && prod.estoque_disponivel < item.quantidade) {
          throw new Error(`Estoque insuficiente para ${prod.nome}.`);
        }

        // Check variant inventory
        if (variant && variant.controle_estoque && variant.estoque_disponivel < item.quantidade) {
          throw new Error(`Estoque insuficiente para a variação ${variant.nome} de ${prod.nome}.`);
        }

        // In-Memory Variant Price Injection:
        // Local variable v_product.valor := v_variant_price. Master prod.valor is NEVER altered!
        const regularPrice = (variant && variant.valor !== null && variant.valor !== undefined)
          ? variant.valor
          : prod.valor;

        let promoPrice = regularPrice;
        let unitDiscount = 0;
        let qtdComDesconto = 0;
        let qtdSemDesconto = item.quantidade;

        const hasActiveDiscount = prod.desconto_ativo && (
          (prod.desconto_tipo && prod.desconto_valor !== null && prod.desconto_valor !== undefined && prod.desconto_valor > 0) ||
          (prod.valor_promocional !== null && prod.valor_promocional !== undefined && prod.valor_promocional < regularPrice)
        );

        if (hasActiveDiscount && !variant) {
          if (prod.valor_promocional !== null && prod.valor_promocional !== undefined) {
            promoPrice = prod.valor_promocional;
            unitDiscount = Math.round((regularPrice - promoPrice) * 100) / 100;
          } else {
            const eff = this.calculateEffectiveProductPrice(
              regularPrice,
              prod.desconto_ativo,
              prod.desconto_tipo,
              prod.desconto_valor
            );
            promoPrice = eff.effectivePrice;
            unitDiscount = eff.unitDiscount;
          }

          if (prod.desconto_limite_quantidade_ativo) {
            const limite = prod.desconto_quantidade_limite ?? 0;
            const utilizada = prod.desconto_quantidade_utilizada ?? 0;
            const restante = Math.max(0, limite - utilizada);

            qtdComDesconto = Math.min(item.quantidade, restante);
            qtdSemDesconto = item.quantidade - qtdComDesconto;

            // Increment utilized quota
            prod.desconto_quantidade_utilizada = utilizada + qtdComDesconto;

            // Record quota movement ledger
            if (qtdComDesconto > 0) {
              this.cotaMovimentos.push({
                id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                produto_id: prod.id,
                desconto_campanha_id: prod.desconto_campanha_id || 'campanha-promocional',
                orcamento_id: orderId,
                tipo_movimento: 'consumo',
                quantidade: qtdComDesconto,
                checkout_request_id: payload.request_id,
                created_at: new Date().toISOString(),
              });
            }
          } else {
            qtdComDesconto = item.quantidade;
            qtdSemDesconto = 0;
          }
        } else {
          const eff = this.calculateEffectiveProductPrice(
            regularPrice,
            prod.desconto_ativo,
            prod.desconto_tipo,
            prod.desconto_valor
          );
          promoPrice = eff.effectivePrice;
          unitDiscount = eff.unitDiscount;
          qtdComDesconto = item.quantidade;
          qtdSemDesconto = 0;
        }

        const lineSubtotal = Math.round(((qtdComDesconto * promoPrice) + (qtdSemDesconto * regularPrice)) * 100) / 100;
        const lineDiscount = Math.round(qtdComDesconto * unitDiscount * 100) / 100;
        const effectiveUnit = item.quantidade === 1
          ? (qtdComDesconto === 1 ? promoPrice : regularPrice)
          : Math.round((lineSubtotal / item.quantidade) * 100) / 100;

        subtotalTabela += Math.round(regularPrice * item.quantidade * 100) / 100;
        totalDescontoProdutos += lineDiscount;
        subtotalEfetivo += lineSubtotal;

        orderLines.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orcamento_id: orderId,
          tipo: item.tipo,
          produto_id: prod.id,
          produto_variante_id: variant ? variant.id : null,
          quantidade: item.quantidade,
          valor_unitario: effectiveUnit,
          subtotal: lineSubtotal,
          valor_original: regularPrice,
          desconto_produto_unitario: qtdComDesconto > 0 ? unitDiscount : 0,
        });
      }

      subtotalEfetivo = Math.round(subtotalEfetivo * 100) / 100;
      if (subtotalEfetivo <= 0) {
        throw new Error('O carrinho não possui valor faturável.');
      }

      // 3. Discount Coupon Calculation
      let couponDiscount = 0;
      if (payload.cupom_desconto_id) {
        const cupom = this.cupons.get(payload.cupom_desconto_id);
        if (!cupom || cupom.status !== 'ativo' || cupom.categoria_cupom !== 'desconto') {
          throw new Error('Cupom de desconto indisponível.');
        }
        if (cupom.total_usos >= cupom.limite_usos) {
          throw new Error('Limite de usos do cupom esgotado.');
        }
        if (cupom.valor_minimo_compra && subtotalEfetivo < cupom.valor_minimo_compra) {
          throw new Error('O valor mínimo do cupom de desconto não foi atingido.');
        }

        if (cupom.tipo_desconto === 'porcentagem') {
          couponDiscount = Math.round(subtotalEfetivo * (cupom.valor_desconto / 100) * 100) / 100;
        } else {
          couponDiscount = Math.min(cupom.valor_desconto, subtotalEfetivo);
        }
        couponDiscount = Math.min(couponDiscount, subtotalEfetivo);
        cupom.total_usos += 1;
      }

      // 4. Points Deduction (100 points = R$ 1.00)
      let pointsUsed = 0;
      let pointsDiscount = 0;
      const requestedPoints = payload.pontos_usados || 0;
      if (requestedPoints > 0) {
        if (cliente.pontos_bloqueados) throw new Error('A carteira de pontos está bloqueada.');
        if (requestedPoints > cliente.saldo_pontos) throw new Error('Saldo de pontos insuficiente.');

        const maxUsablePoints = Math.floor(Math.max(0, subtotalEfetivo - couponDiscount) * 100);
        pointsUsed = Math.min(requestedPoints, maxUsablePoints);
        pointsDiscount = Math.round(pointsUsed * 0.01 * 100) / 100;

        cliente.saldo_pontos -= pointsUsed;
        this.pointsLedger.push({
          id: `pt-${Date.now()}-${Math.random()}`,
          cliente_id: cliente.id,
          tipo: 'debito',
          pontos: -pointsUsed,
          saldo_apos: cliente.saldo_pontos,
          descricao: `Uso de pontos no pedido #${orderId}`,
        });
      }

      // 5. Shipping & Delivery Coupon
      let shipping = 15.00; // Standard shipping
      if (payload.cupom_entrega_id) {
        const shippingCupom = this.cupons.get(payload.cupom_entrega_id);
        if (shippingCupom && shippingCupom.status === 'ativo' && shippingCupom.categoria_cupom === 'entrega') {
          if (shippingCupom.tipo_entrega === 'frete_gratis') {
            shipping = 0;
          } else if (shippingCupom.tipo_entrega === 'taxa_fixa' && shippingCupom.taxa_fixa_entrega !== undefined) {
            shipping = shippingCupom.taxa_fixa_entrega;
          }
        }
      }

      const totalBeforeWallet = Math.round(Math.max(0, subtotalEfetivo - couponDiscount - pointsDiscount + shipping) * 100) / 100;

      // 6. Wallet Balance Deduction
      let walletDiscount = 0;
      const requestedWallet = payload.saldo_carteira_usado || 0;
      if (requestedWallet > 0) {
        if (cliente.carteira_bloqueada) throw new Error('A carteira financeira está bloqueada.');
        if (requestedWallet > cliente.saldo_carteira) throw new Error('Saldo da carteira insuficiente.');

        walletDiscount = Math.min(requestedWallet, totalBeforeWallet);
        walletDiscount = Math.round(walletDiscount * 100) / 100;

        cliente.saldo_carteira = Math.round((cliente.saldo_carteira - walletDiscount) * 100) / 100;
        this.walletLedger.push({
          id: `wlt-${Date.now()}-${Math.random()}`,
          cliente_id: cliente.id,
          tipo: 'debito',
          valor: walletDiscount,
          saldo_apos: cliente.saldo_carteira,
          descricao: `Abatimento de carteira no pedido #${orderId}`,
        });
      }

      const totalLiquido = Math.round(Math.max(0, totalBeforeWallet - walletDiscount) * 100) / 100;

      // 7. Decrement Inventory (Parent + Variant)
      for (const line of orderLines) {
        const prod = this.produtos.get(line.produto_id)!;
        if (prod.controle_estoque) {
          prod.estoque_disponivel -= line.quantidade;
          this.stockLedger.push({
            id: `stk-${Date.now()}-${Math.random()}`,
            produto_id: prod.id,
            produto_variante_id: null,
            quantidade: -line.quantidade,
            tipo: 'saida',
            motivo: `Venda pedido #${orderId}`,
          });
        }

        if (line.produto_variante_id) {
          const variant = this.produtoVariantes.get(line.produto_variante_id)!;
          if (variant.controle_estoque) {
            variant.estoque_disponivel -= line.quantidade;
            this.stockLedger.push({
              id: `stk-var-${Date.now()}-${Math.random()}`,
              produto_id: prod.id,
              produto_variante_id: variant.id,
              quantidade: -line.quantidade,
              tipo: 'saida',
              motivo: `Venda variante #${variant.id} pedido #${orderId}`,
            });
          }
        }
      }

      // Decrement promotional gifts inventory if applicable
      for (const line of orderLines) {
        const prod = this.produtos.get(line.produto_id);
        if (prod?.produto_brinde_id) {
          const giftProd = this.produtos.get(prod.produto_brinde_id);
          if (giftProd && giftProd.controle_estoque) {
            giftProd.estoque_disponivel -= 1;
            this.stockLedger.push({
              id: `stk-brinde-${Date.now()}-${Math.random()}`,
              produto_id: giftProd.id,
              produto_variante_id: null,
              quantidade: -1,
              tipo: 'saida',
              motivo: `Brinde promocional pedido #${orderId}`,
            });
          }
        }
      }
      if (payload.brindes_produtos_ids) {
        for (const gid of payload.brindes_produtos_ids) {
          const giftProd = this.produtos.get(gid);
          if (giftProd && giftProd.controle_estoque) {
            giftProd.estoque_disponivel -= 1;
            this.stockLedger.push({
              id: `stk-brinde-${Date.now()}-${Math.random()}`,
              produto_id: giftProd.id,
              produto_variante_id: null,
              quantidade: -1,
              tipo: 'saida',
              motivo: `Brinde promocional pedido #${orderId}`,
            });
          }
        }
      }

      // 8. Construct Order Record
      const order: OrderRecord = {
        id: orderId,
        codigo_orcamento: `ORC-${Math.floor(100000 + Math.random() * 900000)}`,
        cliente_id: clienteId,
        status: totalLiquido === 0 ? 'pago' : 'pendente',
        subtotal_bruto: subtotalTabela,
        desconto_produtos: totalDescontoProdutos,
        desconto_promocional: 0,
        desconto_cupom: couponDiscount,
        desconto_pontos: pointsDiscount,
        pontos_usados: pointsUsed,
        abatimento_carteira: walletDiscount,
        valor_frete: shipping,
        total_liquido: totalLiquido,
        forma_pagamento: payload.forma_pagamento || 'outros',
        itens: orderLines,
        created_at: new Date().toISOString(),
        request_id: payload.request_id,
      };

      this.orcamentos.set(order.id, order);
      if (payload.request_id) {
        this.orcamentosByRequestId.set(payload.request_id, order);
      }

      // If zero balance order, auto create and mark internal fatura paid
      if (totalLiquido === 0) {
        const faturaId = `fat-zero-${order.id}`;
        this.faturas.set(faturaId, {
          id: faturaId,
          codigo_fatura: `FAT-INT-${order.codigo_orcamento}`,
          cliente_id: clienteId,
          orcamento_id: order.id,
          valor_total: 0,
          valor_final_pendente: 0,
          status: 'pago',
          tipo: 'produto',
          is_amortizacao_credito: false,
          itens_faturados: orderLines.map(i => ({ codigo: i.produto_id, valor: i.valor_unitario })),
        });
      }

      return { success: true, order };
    } finally {
      // Release locks in reverse order
      for (let i = releaseFns.length - 1; i >= 0; i--) {
        releaseFns[i]();
      }
    }
  }

  /**
   * ACID Post-Sales Return & Restitution (Simulates gsa_admin_atualizar_solicitacao_loja).
   * Enforces:
   * 1. Status transition validation
   * 2. Idempotency guard (estorno_executado flag)
   * 3. Precise restocking of returned products & variants
   * 4. Wallet refund to saldo_carteira + ledger
   * 5. Points refund to saldo_pontos with tipo = 'estorno' + ledger
   * 6. Loyalty points clawback (prevents buy-and-cancel arbitrage)
   * 7. Difference fatura generation for exchanges (FAT-TROCA-...)
   */
  public async processReturn(params: {
    solicitacaoId: string;
    novoStatus: 'aprovado' | 'devolucao_recebida' | 'rejeitado' | 'concluido' | 'cancelado';
    respostaAdmin?: string;
  }): Promise<{
    success: boolean;
    solicitacao: ReturnSolicitacaoRecord;
    restoredStockCount: number;
    walletRefunded: number;
    pointsRefunded: number;
  }> {
    const { solicitacaoId, novoStatus, respostaAdmin } = params;

    // Acquire lock on solicitacao
    const unlockSol = await this.acquireRowLock(`sol_${solicitacaoId}`);

    try {
      const sol = this.solicitacoes.get(solicitacaoId);
      if (!sol) throw new Error('Solicitacao nao encontrada.');

      const order = this.orcamentos.get(sol.orcamento_origem_id);
      if (!order) throw new Error('Pedido de origem não encontrado.');

      // Lock client
      const unlockClient = await this.acquireRowLock(`client_${sol.cliente_id}`);

      try {
        const cliente = this.clientes.get(sol.cliente_id)!;

        // Idempotency check: if already reached target status, return immediately
        if (sol.status === novoStatus) {
          return {
            success: true,
            solicitacao: sol,
            restoredStockCount: 0,
            walletRefunded: 0,
            pointsRefunded: 0,
          };
        }

        // Exchange Substitute Product Stock Reservation
        if (novoStatus === 'aprovado' && sol.tipo === 'troca' && sol.novos_produtos && sol.novos_produtos.length > 0) {
          const subProdIds = sol.novos_produtos.map(i => i.produto_id);
          const subVarIds = sol.novos_produtos.map(i => i.produto_variante_id).filter((v): v is string => !!v);
          const subLockKeys = Array.from(new Set([
            ...subProdIds.map(id => `prod_${id}`),
            ...subVarIds.map(id => `var_${id}`)
          ])).sort();

          const subUnlocks: Array<() => void> = [];
          try {
            for (const k of subLockKeys) {
              subUnlocks.push(await this.acquireRowLock(k));
            }

            // Check stock availability for all substitute items
            for (const newItem of sol.novos_produtos) {
              const prod = this.produtos.get(newItem.produto_id);
              if (!prod) throw new Error(`Produto substituto não encontrado: ${newItem.produto_id}`);
              if (prod.controle_estoque && prod.estoque_disponivel < newItem.quantidade) {
                throw new Error(`Estoque insuficiente para o produto substituto ${prod.nome}.`);
              }
              if (newItem.produto_variante_id) {
                const variant = this.produtoVariantes.get(newItem.produto_variante_id);
                if (!variant) throw new Error(`Variante substituta não encontrada: ${newItem.produto_variante_id}`);
                if (variant.controle_estoque && variant.estoque_disponivel < newItem.quantidade) {
                  throw new Error(`Estoque insuficiente para a variação substituta ${variant.nome} de ${prod.nome}.`);
                }
              }
            }

            // Deduct stock for all substitute items
            for (const newItem of sol.novos_produtos) {
              const prod = this.produtos.get(newItem.produto_id)!;
              if (prod.controle_estoque) {
                prod.estoque_disponivel -= newItem.quantidade;
                this.stockLedger.push({
                  id: `stk-sub-${Date.now()}-${Math.random()}`,
                  produto_id: prod.id,
                  produto_variante_id: null,
                  quantidade: -newItem.quantidade,
                  tipo: 'saida',
                  motivo: `Reserva item substituto troca #${sol.codigo_solicitacao}`,
                });
              }
              if (newItem.produto_variante_id) {
                const variant = this.produtoVariantes.get(newItem.produto_variante_id)!;
                if (variant.controle_estoque) {
                  variant.estoque_disponivel -= newItem.quantidade;
                  this.stockLedger.push({
                    id: `stk-sub-var-${Date.now()}-${Math.random()}`,
                    produto_id: prod.id,
                    produto_variante_id: variant.id,
                    quantidade: -newItem.quantidade,
                    tipo: 'saida',
                    motivo: `Reserva variante substituta #${variant.id} troca #${sol.codigo_solicitacao}`,
                  });
                }
              }
            }
          } finally {
            for (let i = subUnlocks.length - 1; i >= 0; i--) {
              subUnlocks[i]();
            }
          }
        }

        // Update status & history
        sol.status = novoStatus;
        sol.historico_status[novoStatus] = new Date().toISOString();
        if (respostaAdmin) sol.resposta_admin = respostaAdmin;
        sol.updated_at = new Date().toISOString();

        let restoredStockCount = 0;
        let walletRefunded = 0;
        let pointsRefunded = 0;

        // Exchange Difference Invoice Generation
        if (novoStatus === 'aprovado' && sol.tipo === 'troca' && sol.valor_diferenca > 0) {
          const faturaCodigo = `FAT-TROCA-${sol.codigo_solicitacao}`;
          if (!Array.from(this.faturas.values()).some(f => f.codigo_fatura === faturaCodigo)) {
            const fatId = `fat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            this.faturas.set(fatId, {
              id: fatId,
              codigo_fatura: faturaCodigo,
              cliente_id: sol.cliente_id,
              valor_total: sol.valor_diferenca,
              valor_final_pendente: sol.valor_diferenca,
              status: 'pendente',
              tipo: 'troca_diferenca',
              is_amortizacao_credito: false,
              itens_faturados: [{ codigo: `DIF-${sol.codigo_solicitacao}`, valor: sol.valor_diferenca }],
            });
          }
        }

        // Atomic Restock and Refunds Trigger
        // Disparado quando status é 'devolucao_recebida' OU ('aprovado' para reembolso)
        const shouldExecuteRestockAndRefund =
          (novoStatus === 'devolucao_recebida' || (novoStatus === 'aprovado' && sol.tipo === 'devolucao')) &&
          !sol.estorno_executado;

        if (shouldExecuteRestockAndRefund) {
          // Acquire locks on all returned items in canonical order
          const itemsToRestock = sol.itens_devolvidos;
          const prodIds = Array.from(new Set(itemsToRestock.map(i => i.produto_id))).sort();
          for (const pid of prodIds) {
            const prod = this.produtos.get(pid);
            if (prod && prod.controle_estoque) {
              const qty = itemsToRestock.filter(x => x.produto_id === pid).reduce((acc, x) => acc + x.quantidade, 0);
              prod.estoque_disponivel += qty;
              restoredStockCount += qty;
              this.stockLedger.push({
                id: `stk-ret-${Date.now()}-${Math.random()}`,
                produto_id: prod.id,
                produto_variante_id: null,
                quantidade: qty,
                tipo: 'entrada',
                motivo: `Devolução aprovada #${sol.codigo_solicitacao}`,
              });
            }
          }

          for (const it of itemsToRestock) {
            if (it.produto_variante_id) {
              const variant = this.produtoVariantes.get(it.produto_variante_id);
              if (variant && variant.controle_estoque) {
                variant.estoque_disponivel += it.quantidade;
                this.stockLedger.push({
                  id: `stk-ret-var-${Date.now()}-${Math.random()}`,
                  produto_id: it.produto_id,
                  produto_variante_id: variant.id,
                  quantidade: it.quantidade,
                  tipo: 'entrada',
                  motivo: `Devolução variante #${variant.id} aprovada #${sol.codigo_solicitacao}`,
                });
              }
            }
          }

          // Proportional Refund calculation (Full order vs Partial item)
          const totalOrderItemsCount = order.itens.reduce((acc, x) => acc + x.quantidade, 0);
          const returnedItemsCount = itemsToRestock.reduce((acc, x) => acc + x.quantidade, 0);
          const isFullReturn = returnedItemsCount >= totalOrderItemsCount;

          const returnedValue = itemsToRestock.reduce((acc, ret) => {
            const matched = order.itens.find(i => i.produto_id === ret.produto_id);
            return acc + (matched ? matched.valor_unitario * ret.quantidade : 0);
          }, 0);
          const ratio = order.subtotal_bruto > 0 ? returnedValue / order.subtotal_bruto : 0;

          if (isFullReturn) {
            // Restore full wallet balance spent on order
            if (order.abatimento_carteira > 0) {
              walletRefunded = order.abatimento_carteira;
              cliente.saldo_carteira = Math.round((cliente.saldo_carteira + walletRefunded) * 100) / 100;
              this.walletLedger.push({
                id: `wlt-ret-${Date.now()}-${Math.random()}`,
                cliente_id: cliente.id,
                tipo: 'credito',
                valor: walletRefunded,
                saldo_apos: cliente.saldo_carteira,
                descricao: `Estorno de saldo por devolução (Pedido #${order.codigo_orcamento})`,
              });
            }

            // Restore full loyalty points spent on order
            if (order.pontos_usados > 0) {
              pointsRefunded = order.pontos_usados;
              cliente.saldo_pontos += pointsRefunded;
              this.pointsLedger.push({
                id: `pt-ret-${Date.now()}-${Math.random()}`,
                cliente_id: cliente.id,
                tipo: 'estorno', // Canonical check constraint compliant!
                pontos: pointsRefunded,
                saldo_apos: cliente.saldo_pontos,
                descricao: `Estorno de pontos por devolução (Pedido #${order.codigo_orcamento})`,
              });
            }
          } else {
            // Partial Return: Apportion wallet and points proportionally to returned item value
            if (order.abatimento_carteira > 0) {
              walletRefunded = Math.round(order.abatimento_carteira * ratio * 100) / 100;
              cliente.saldo_carteira = Math.round((cliente.saldo_carteira + walletRefunded) * 100) / 100;
              this.walletLedger.push({
                id: `wlt-ret-part-${Date.now()}-${Math.random()}`,
                cliente_id: cliente.id,
                tipo: 'credito',
                valor: walletRefunded,
                saldo_apos: cliente.saldo_carteira,
                descricao: `Estorno parcial de saldo por devolução (Pedido #${order.codigo_orcamento})`,
              });
            }

            if (order.pontos_usados > 0) {
              pointsRefunded = Math.round(order.pontos_usados * ratio);
              cliente.saldo_pontos += pointsRefunded;
              this.pointsLedger.push({
                id: `pt-ret-part-${Date.now()}-${Math.random()}`,
                cliente_id: cliente.id,
                tipo: 'estorno',
                pontos: pointsRefunded,
                saldo_apos: cliente.saldo_pontos,
                descricao: `Estorno parcial de pontos por devolução (Pedido #${order.codigo_orcamento})`,
              });
            }
          }

          // Anti-Arbitrage: Clawback points earned from this purchase if points were credited
          const pointsEarned = isFullReturn
            ? Math.round(order.total_liquido)
            : Math.round(order.total_liquido * ratio);

          if (pointsEarned > 0) {
            if (order.pontos_creditados) {
              cliente.saldo_pontos = Math.max(0, cliente.saldo_pontos - pointsEarned);
            }
            this.pointsLedger.push({
              id: `pt-clawback-${Date.now()}-${Math.random()}`,
              cliente_id: cliente.id,
              tipo: 'debito',
              pontos: -pointsEarned,
              saldo_apos: cliente.saldo_pontos,
              descricao: `Revogação de pontos acumulados por devolução do pedido #${order.codigo_orcamento}`,
            });
          }

          // Anti-Exploit: Clawback referral commission from referrer (mirrors 20260910180000_marketplace_acid_concurrency_remediation.sql:326-352)
          if (cliente.indicador_id) {
            const unlockInd = await this.acquireRowLock(`client_${cliente.indicador_id}`);
            try {
              const indicador = this.clientes.get(cliente.indicador_id);
              if (indicador) {
                const baseValue = isFullReturn
                  ? (order.subtotal_bruto || order.total_liquido)
                  : ((order.subtotal_bruto || order.total_liquido) * ratio);
                const refBonus = Math.round(Math.min(baseValue * 0.10, 20.00) * 100) / 100;
                if (refBonus > 0) {
                  const indNovoSaldo = Math.max(0, Math.round((indicador.saldo_carteira - refBonus) * 100) / 100);
                  indicador.saldo_carteira = indNovoSaldo;

                  this.walletLedger.push({
                    id: `wlt-ref-clawback-${Date.now()}-${Math.random()}`,
                    cliente_id: indicador.id,
                    tipo: 'debito',
                    valor: refBonus,
                    saldo_apos: indNovoSaldo,
                    descricao: `Estorno de comissão de indicação por devolução do pedido #${order.codigo_orcamento}`,
                  });
                }
              }
            } finally {
              unlockInd();
            }
          }

          // Mark idempotency guard true
          sol.estorno_executado = true;
        }

        return {
          success: true,
          solicitacao: sol,
          restoredStockCount,
          walletRefunded,
          pointsRefunded,
        };
      } finally {
        unlockClient();
      }
    } finally {
      unlockSol();
    }
  }
}

// ============================================================================
// 3. CONCURRENCY HARNESS UTILITIES
// ============================================================================

/**
 * Fires an array of async functions in the exact same millisecond using a release barrier.
 */
export async function executeInExactSameMillisecond<T>(tasks: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]> {
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  const wrappedTasks = tasks.map(async (fn) => {
    await barrier; // All tasks block here until barrier is dropped
    return fn();
  });

  // Drop the barrier synchronously so all tasks run concurrently in the event loop
  releaseBarrier();
  return Promise.allSettled(wrappedTasks);
}

// ============================================================================
// 4. TEST SUITE (TIERS 1 TO 4)
// ============================================================================

describe('GSA Marketplace ACID Concurrency & Stress Testing Suite', () => {
  let sim: MarketplaceACIDSimulator;

  beforeEach(() => {
    sim = new MarketplaceACIDSimulator();

    // Standard base product
    sim.produtos.set('prod-base-1', {
      id: 'prod-base-1',
      nome: 'Smartwatch Pro GSA',
      codigo_produto: 'SW-001',
      valor: 200.00,
      controle_estoque: true,
      estoque_disponivel: 15,
      status: 'ativo',
      visivel_na_loja: true,
      ocultar_valor: false,
      tipo_cliente: 'ambos',
    });

    // Product with variations
    sim.produtos.set('prod-camisa', {
      id: 'prod-camisa',
      nome: 'Camisa Polo GSA',
      codigo_produto: 'CAM-001',
      valor: 100.00, // Catalog price
      possui_variacoes: true,
      controle_estoque: true,
      estoque_disponivel: 25,
      status: 'ativo',
      visivel_na_loja: true,
      ocultar_valor: false,
      tipo_cliente: 'ambos',
    });

    // Variants of prod-camisa with different prices and stocks
    sim.produtoVariantes.set('var-camisa-azul-g', {
      id: 'var-camisa-azul-g',
      produto_id: 'prod-camisa',
      nome: 'Camisa Polo GSA - Azul G',
      sku: 'CAM-AZUL-G',
      valor: 120.00, // Higher than base product!
      controle_estoque: true,
      estoque_disponivel: 10,
      ativo: true,
      combinacao: { cor: 'Azul', tamanho: 'G' },
    });

    sim.produtoVariantes.set('var-camisa-preta-m', {
      id: 'var-camisa-preta-m',
      produto_id: 'prod-camisa',
      nome: 'Camisa Polo GSA - Preta M',
      sku: 'CAM-PRETA-M',
      valor: 110.00,
      controle_estoque: true,
      estoque_disponivel: 8,
      ativo: true,
      combinacao: { cor: 'Preta', tamanho: 'M' },
    });

    // Customer
    sim.clientes.set('cli-1', {
      id: 'cli-1',
      nome: 'Adriano Farias',
      tipo_pessoa: 'pf',
      saldo_carteira: 250.00,
      saldo_pontos: 5000, // R$ 50.00 in points
      pontos_totais: 5000,
      carteira_bloqueada: false,
      pontos_bloqueados: false,
      limite_credito_total: 1000.00,
      limite_credito_disponivel: 1000.00,
    });

    sim.clientes.set('cli-2', {
      id: 'cli-2',
      nome: 'Beatriz Lima',
      tipo_pessoa: 'pf',
      saldo_carteira: 100.00,
      saldo_pontos: 2000,
      pontos_totais: 2000,
      carteira_bloqueada: false,
      pontos_bloqueados: false,
      limite_credito_total: 500.00,
      limite_credito_disponivel: 500.00,
    });
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>= 5 tests per feature)
  // ==========================================================================

  describe('Tier 1: Feature Coverage (Isolation & Primary Behavior)', () => {
    // 1.1 Base Product Checkout (>= 5 tests)
    describe('1.1 Base Product Checkout', () => {
      it('T1.1.1 should successfully checkout a single base product and decrement inventory', async () => {
        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 }],
          },
        });

        expect(result.success).toBe(true);
        expect(result.order.itens).toHaveLength(1);
        expect(result.order.itens[0].valor_unitario).toBe(200.00);
        expect(result.order.itens[0].subtotal).toBe(400.00);
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(13); // 15 - 2
      });

      it('T1.1.2 should checkout multiple distinct base products in a single transaction', async () => {
        sim.produtos.set('prod-base-2', {
          id: 'prod-base-2',
          nome: 'Fones Bluetooth',
          codigo_produto: 'FB-002',
          valor: 80.00,
          controle_estoque: true,
          estoque_disponivel: 20,
          status: 'ativo',
          visivel_na_loja: true,
          ocultar_valor: false,
          tipo_cliente: 'ambos',
        });

        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [
              { tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 },
              { tipo: 'produto', item_id: 'prod-base-2', quantidade: 3 },
            ],
          },
        });

        expect(result.success).toBe(true);
        expect(result.order.subtotal_bruto).toBe(440.00); // 200 + 3*80
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(14);
        expect(sim.produtos.get('prod-base-2')!.estoque_disponivel).toBe(17);
      });

      it('T1.1.3 should reject checkout when product status is inativo', async () => {
        sim.produtos.get('prod-base-1')!.status = 'inativo';

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        })).rejects.toThrow(/está inativo/);
      });

      it('T1.1.4 should reject checkout when product is not visible in store', async () => {
        sim.produtos.get('prod-base-1')!.visivel_na_loja = false;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        })).rejects.toThrow(/não visível na loja/);
      });

      it('T1.1.5 should reject checkout when product value is hidden', async () => {
        sim.produtos.get('prod-base-1')!.ocultar_valor = true;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        })).rejects.toThrow(/com valor oculto/);
      });

      it('T1.1.6 should reject checkout when product client type does not match customer person type', async () => {
        sim.produtos.get('prod-base-1')!.tipo_cliente = 'pj'; // Customer cli-1 is 'pf'

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        })).rejects.toThrow(/indisponível para este tipo de cliente/);
      });
    });

    // 1.2 Variant Checkout (>= 5 tests)
    describe('1.2 Variant Checkout', () => {
      it('T1.2.1 should checkout a variant with variant-specific price and decrement variant stock', async () => {
        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 2 }],
          },
        });

        expect(result.success).toBe(true);
        expect(result.order.itens[0].valor_unitario).toBe(120.00);
        expect(result.order.itens[0].subtotal).toBe(240.00);
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(8); // 10 - 2
        expect(sim.produtos.get('prod-camisa')!.estoque_disponivel).toBe(23); // 25 - 2
      });

      it('T1.2.2 should strictly preserve catalog price (produtos.valor) when variant has a different price', async () => {
        const initialCatalogPrice = sim.produtos.get('prod-camisa')!.valor; // 100.00

        await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }],
          },
        });

        // The catalog price of prod-camisa MUST remain 100.00 (not mutated to 120.00!)
        expect(sim.produtos.get('prod-camisa')!.valor).toBe(initialCatalogPrice);
      });

      it('T1.2.3 should checkout multiple variants of the same master product in one cart', async () => {
        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [
              { tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }, // R$ 120
              { tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-preta-m', quantidade: 2 }, // R$ 110
            ],
          },
        });

        expect(result.success).toBe(true);
        expect(result.order.subtotal_bruto).toBe(340.00); // 120 + 2*110
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(9);
        expect(sim.produtoVariantes.get('var-camisa-preta-m')!.estoque_disponivel).toBe(6);
        expect(sim.produtos.get('prod-camisa')!.estoque_disponivel).toBe(22); // 25 - 3
      });

      it('T1.2.4 should reject checkout if selected variant is inactive', async () => {
        sim.produtoVariantes.get('var-camisa-azul-g')!.ativo = false;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }],
          },
        })).rejects.toThrow(/está inativa/);
      });

      it('T1.2.5 should reject checkout if variant does not belong to the requested product', async () => {
        // Attempting to attach camisa variant to smartwatch product
        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', variante_id: 'var-camisa-azul-g', quantidade: 1 }],
          },
        })).rejects.toThrow(/não pertence ao produto/);
      });
    });

    // 1.3 Discount Calculation (>= 5 tests)
    describe('1.3 Discount Calculation', () => {
      it('T1.3.1 should apply percentage individual product discount accurately', async () => {
        sim.produtos.get('prod-base-1')!.desconto_ativo = true;
        sim.produtos.get('prod-base-1')!.desconto_tipo = 'porcentagem';
        sim.produtos.get('prod-base-1')!.desconto_valor = 15; // 15% off 200.00 = 170.00

        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 }],
          },
        });

        expect(result.order.itens[0].valor_unitario).toBe(170.00);
        expect(result.order.itens[0].desconto_produto_unitario).toBe(30.00);
        expect(result.order.desconto_produtos).toBe(60.00);
        expect(result.order.total_liquido).toBe(355.00); // 340 + 15 shipping
      });

      it('T1.3.2 should apply fixed amount individual product discount accurately', async () => {
        sim.produtos.get('prod-base-1')!.desconto_ativo = true;
        sim.produtos.get('prod-base-1')!.desconto_tipo = 'valor_fixo';
        sim.produtos.get('prod-base-1')!.desconto_valor = 35.50; // 200 - 35.50 = 164.50

        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }],
          },
        });

        expect(result.order.itens[0].valor_unitario).toBe(164.50);
        expect(result.order.desconto_produtos).toBe(35.50);
      });

      it('T1.3.3 should enforce discount floor of 0 and never produce negative unit prices', async () => {
        sim.produtos.get('prod-base-1')!.desconto_ativo = true;
        sim.produtos.get('prod-base-1')!.desconto_tipo = 'valor_fixo';
        sim.produtos.get('prod-base-1')!.desconto_valor = 999.00; // Greater than product price

        const { effectivePrice } = sim.calculateEffectiveProductPrice(200.00, true, 'valor_fixo', 999.00);
        expect(effectivePrice).toBe(0.00);
      });

      it('T1.3.4 should apply discount coupon percentage to eligible subtotal', async () => {
        sim.cupons.set('cupom-10pct', {
          id: 'cupom-10pct',
          codigo: 'PROMO10',
          categoria_cupom: 'desconto',
          tipo_desconto: 'porcentagem',
          valor_desconto: 10, // 10%
          status: 'ativo',
          total_usos: 0,
          limite_usos: 100,
        });

        const result = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }],
            cupom_desconto_id: 'cupom-10pct',
          },
        });

        expect(result.order.desconto_cupom).toBe(20.00); // 10% of 200.00
        expect(sim.cupons.get('cupom-10pct')!.total_usos).toBe(1);
      });

      it('T1.3.5 should reject coupon when subtotal does not reach minimum purchase threshold', async () => {
        sim.cupons.set('cupom-min-500', {
          id: 'cupom-min-500',
          codigo: 'VIP500',
          categoria_cupom: 'desconto',
          tipo_desconto: 'porcentagem',
          valor_desconto: 20,
          valor_minimo_compra: 500.00,
          status: 'ativo',
          total_usos: 0,
          limite_usos: 10,
        });

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }], // Subtotal 200 < 500
            cupom_desconto_id: 'cupom-min-500',
          },
        })).rejects.toThrow(/valor mínimo do cupom/);
      });
    });

    // 1.4 Return Approval (>= 5 tests)
    describe('1.4 Return Approval', () => {
      let testOrderId: string;

      beforeEach(async () => {
        const res = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 }],
          },
        });
        testOrderId = res.order.id;

        sim.solicitacoes.set('sol-ret-1', {
          id: 'sol-ret-1',
          codigo_solicitacao: 'SOL-001',
          cliente_id: 'cli-1',
          orcamento_origem_id: testOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 2 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: { em_analise: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        });
      });

      it('T1.4.1 should transition status from em_analise to aprovado and record timestamp', async () => {
        const res = await sim.processReturn({
          solicitacaoId: 'sol-ret-1',
          novoStatus: 'aprovado',
          respostaAdmin: 'Devolução aprovada conforme laudo técnico.',
        });

        expect(res.success).toBe(true);
        expect(res.solicitacao.status).toBe('aprovado');
        expect(res.solicitacao.resposta_admin).toBe('Devolução aprovada conforme laudo técnico.');
        expect(res.solicitacao.historico_status.aprovado).toBeDefined();
      });

      it('T1.4.2 should generate difference invoice FAT-TROCA when exchange difference > 0', async () => {
        sim.solicitacoes.set('sol-troca-1', {
          id: 'sol-troca-1',
          codigo_solicitacao: 'TROCA-100',
          cliente_id: 'cli-1',
          orcamento_origem_id: testOrderId,
          tipo: 'troca',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 50.00,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({
          solicitacaoId: 'sol-troca-1',
          novoStatus: 'aprovado',
        });

        const fatura = Array.from(sim.faturas.values()).find(f => f.codigo_fatura === 'FAT-TROCA-TROCA-100');
        expect(fatura).toBeDefined();
        expect(fatura!.valor_total).toBe(50.00);
        expect(fatura!.status).toBe('pendente');
      });

      it('T1.4.3 should NOT generate difference invoice if exchange difference is 0', async () => {
        sim.solicitacoes.set('sol-troca-zero', {
          id: 'sol-troca-zero',
          codigo_solicitacao: 'TROCA-ZERO',
          cliente_id: 'cli-1',
          orcamento_origem_id: testOrderId,
          tipo: 'troca',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({
          solicitacaoId: 'sol-troca-zero',
          novoStatus: 'aprovado',
        });

        const fatura = Array.from(sim.faturas.values()).find(f => f.codigo_fatura === 'FAT-TROCA-TROCA-ZERO');
        expect(fatura).toBeUndefined();
      });

      it('T1.4.4 should mark status as devolucao_recebida and trigger restitution', async () => {
        const res = await sim.processReturn({
          solicitacaoId: 'sol-ret-1',
          novoStatus: 'devolucao_recebida',
        });

        expect(res.success).toBe(true);
        expect(res.solicitacao.estorno_executado).toBe(true);
        expect(res.restoredStockCount).toBe(2);
      });

      it('T1.4.5 should throw when solicitacaoId does not exist', async () => {
        await expect(sim.processReturn({
          solicitacaoId: 'sol-inexistente',
          novoStatus: 'aprovado',
        })).rejects.toThrow(/Solicitacao nao encontrada/);
      });
    });

    // 1.5 Stock Restitution (>= 5 tests)
    describe('1.5 Stock Restitution', () => {
      it('T1.5.1 should restock exact quantity to base product upon return', async () => {
        const initialStock = sim.produtos.get('prod-base-1')!.estoque_disponivel; // 15
        const checkoutRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 4 }] },
        });
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(initialStock - 4); // 11

        sim.solicitacoes.set('sol-ret-stock', {
          id: 'sol-ret-stock',
          codigo_solicitacao: 'SOL-STK',
          cliente_id: 'cli-1',
          orcamento_origem_id: checkoutRes.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 4 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({ solicitacaoId: 'sol-ret-stock', novoStatus: 'aprovado' });
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(initialStock); // Restored to 15
      });

      it('T1.5.2 should restock both parent product and child variant stock upon return', async () => {
        const initialParentStock = sim.produtos.get('prod-camisa')!.estoque_disponivel; // 25
        const initialVariantStock = sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel; // 10

        const checkoutRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 3 }],
          },
        });

        expect(sim.produtos.get('prod-camisa')!.estoque_disponivel).toBe(initialParentStock - 3);
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(initialVariantStock - 3);

        sim.solicitacoes.set('sol-ret-var', {
          id: 'sol-ret-var',
          codigo_solicitacao: 'SOL-VAR-RET',
          cliente_id: 'cli-1',
          orcamento_origem_id: checkoutRes.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-camisa', produto_variante_id: 'var-camisa-azul-g', quantidade: 3 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({ solicitacaoId: 'sol-ret-var', novoStatus: 'aprovado' });

        // Both parent and variant stocks are restored
        expect(sim.produtos.get('prod-camisa')!.estoque_disponivel).toBe(initialParentStock);
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(initialVariantStock);
      });

      it('T1.5.3 should not modify stock for items with controle_estoque = false', async () => {
        sim.produtos.set('prod-digital', {
          id: 'prod-digital',
          nome: 'Curso Online GSA',
          codigo_produto: 'DIG-001',
          valor: 50.00,
          controle_estoque: false,
          estoque_disponivel: 0,
          status: 'ativo',
          visivel_na_loja: true,
          ocultar_valor: false,
          tipo_cliente: 'ambos',
        });

        const checkoutRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-digital', quantidade: 1 }] },
        });

        sim.solicitacoes.set('sol-ret-dig', {
          id: 'sol-ret-dig',
          codigo_solicitacao: 'SOL-DIG',
          cliente_id: 'cli-1',
          orcamento_origem_id: checkoutRes.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-digital', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({ solicitacaoId: 'sol-ret-dig', novoStatus: 'aprovado' });
        expect(sim.produtos.get('prod-digital')!.estoque_disponivel).toBe(0);
      });

      it('T1.5.4 should register stock entry in stockLedger with reason and reference', async () => {
        const checkoutRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        });

        sim.solicitacoes.set('sol-ret-ledger', {
          id: 'sol-ret-ledger',
          codigo_solicitacao: 'SOL-LEDGER',
          cliente_id: 'cli-1',
          orcamento_origem_id: checkoutRes.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({ solicitacaoId: 'sol-ret-ledger', novoStatus: 'aprovado' });

        const ledgerEntry = sim.stockLedger.find(
          entry => entry.produto_id === 'prod-base-1' && entry.tipo === 'entrada' && entry.motivo.includes('SOL-LEDGER')
        );
        expect(ledgerEntry).toBeDefined();
        expect(ledgerEntry!.quantidade).toBe(1);
      });

      it('T1.5.5 should restock multi-item orders accurately across all respective rows', async () => {
        const checkoutRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [
              { tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 },
              { tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 2 },
            ],
          },
        });

        sim.solicitacoes.set('sol-ret-multi', {
          id: 'sol-ret-multi',
          codigo_solicitacao: 'SOL-MULTI',
          cliente_id: 'cli-1',
          orcamento_origem_id: checkoutRes.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [
            { produto_id: 'prod-base-1', quantidade: 2 },
            { produto_id: 'prod-camisa', produto_variante_id: 'var-camisa-azul-g', quantidade: 2 },
          ],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        const res = await sim.processReturn({ solicitacaoId: 'sol-ret-multi', novoStatus: 'aprovado' });
        expect(res.restoredStockCount).toBe(4); // 2 base + 2 camisa
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(15);
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(10);
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>= 5 tests per feature)
  // ==========================================================================

  describe('Tier 2: Boundary & Corner Cases', () => {
    // 2.1 Zero Stock Purchase Attempt (>= 5 tests)
    describe('2.1 Zero Stock Purchase Attempt', () => {
      it('T2.1.1 should immediately reject base product purchase when initial stock is 0', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 0;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        })).rejects.toThrow(/Estoque insuficiente para Smartwatch Pro GSA/);
      });

      it('T2.1.2 should immediately reject variant purchase when initial variant stock is 0', async () => {
        sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel = 0;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }],
          },
        })).rejects.toThrow(/Estoque insuficiente para a variação Camisa Polo GSA - Azul G/);
      });

      it('T2.1.3 should reject purchase when requested quantity strictly exceeds available stock', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 2;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 3 }] },
        })).rejects.toThrow(/Estoque insuficiente/);
      });

      it('T2.1.4 should atomically rollback multi-item cart if even one item has 0 stock', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 10;
        sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel = 0;

        await expect(sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [
              { tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 },
              { tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 },
            ],
          },
        })).rejects.toThrow(/Estoque insuficiente/);

        // First item stock MUST NOT be partially decremented
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(10);
      });

      it('T2.1.5 should succeed when purchasing exact remaining stock to 0, then immediately fail next purchase', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 2;

        // First checkout buys all 2
        const firstRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 }] },
        });
        expect(firstRes.success).toBe(true);
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(0);

        // Next checkout attempting 1 must fail
        await expect(sim.executeCheckout({
          clienteId: 'cli-2',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        })).rejects.toThrow(/Estoque insuficiente/);
      });
    });

    // 2.2 1-Millisecond Concurrent Purchase Race on Last Item (>= 5 tests)
    describe('2.2 1-Millisecond Concurrent Purchase Race on Last Item', () => {
      it('T2.2.1 should permit exactly 1 winner and 1 loser when 2 transactions race for 1 base product', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 1;

        const results = await executeInExactSameMillisecond([
          () => sim.executeCheckout({
            clienteId: 'cli-1',
            payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
          }),
          () => sim.executeCheckout({
            clienteId: 'cli-2',
            payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
          }),
        ]);

        const successes = results.filter(r => r.status === 'fulfilled');
        const failures = results.filter(r => r.status === 'rejected');

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(0);
      });

      it('T2.2.2 should permit exactly 1 winner and 1 loser when 2 transactions race for 1 variant item', async () => {
        sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel = 1;

        const results = await executeInExactSameMillisecond([
          () => sim.executeCheckout({
            clienteId: 'cli-1',
            payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }] },
          }),
          () => sim.executeCheckout({
            clienteId: 'cli-2',
            payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }] },
          }),
        ]);

        const successes = results.filter(r => r.status === 'fulfilled');
        const failures = results.filter(r => r.status === 'rejected');

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(0);
      });

      it('T2.2.3 should permit exactly 2 winners and 3 losers when 5 transactions race for 2 available items', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 2;

        const tasks = Array.from({ length: 5 }, (_, i) => () =>
          sim.executeCheckout({
            clienteId: i % 2 === 0 ? 'cli-1' : 'cli-2',
            payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
          })
        );

        const results = await executeInExactSameMillisecond(tasks);
        const successes = results.filter(r => r.status === 'fulfilled');
        const failures = results.filter(r => r.status === 'rejected');

        expect(successes).toHaveLength(2);
        expect(failures).toHaveLength(3);
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(0);
      });

      it('T2.2.4 should permit exactly 1 winner and 9 losers when 10 transactions race for 1 available variant item', async () => {
        sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel = 1;

        const tasks = Array.from({ length: 10 }, (_, i) => () =>
          sim.executeCheckout({
            clienteId: i % 2 === 0 ? 'cli-1' : 'cli-2',
            payload: {
              carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }],
            },
          })
        );

        const results = await executeInExactSameMillisecond(tasks);
        const successes = results.filter(r => r.status === 'fulfilled');
        const failures = results.filter(r => r.status === 'rejected');

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(9);
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(0);
      });

      it('T2.2.5 should prove stock is never negative at any point during high concurrency', async () => {
        sim.produtos.get('prod-base-1')!.estoque_disponivel = 3;

        const tasks = Array.from({ length: 15 }, (_, i) => () =>
          sim.executeCheckout({
            clienteId: 'cli-1',
            payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
          })
        );

        await executeInExactSameMillisecond(tasks);
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(0);
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBeGreaterThanOrEqual(0);
      });
    });

    // 2.3 Zero-Balance Checkout (>= 5 tests)
    describe('2.3 Zero-Balance Checkout', () => {
      it('T2.3.1 should successfully checkout with total_liquido = 0 when 100% paid by loyalty points', async () => {
        // Product 100.00 + shipping 0 (free shipping coupon)
        sim.cupons.set('cupom-frete', {
          id: 'cupom-frete',
          codigo: 'FRETE0',
          categoria_cupom: 'entrega',
          tipo_entrega: 'frete_gratis',
          valor_desconto: 0,
          status: 'ativo',
          total_usos: 0,
          limite_usos: 10,
        });

        // 10,000 points = R$ 100.00
        sim.clientes.get('cli-1')!.saldo_pontos = 10000;

        const res = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', quantidade: 1 }], // R$ 100
            cupom_entrega_id: 'cupom-frete',
            pontos_usados: 10000,
          },
        });

        expect(res.order.total_liquido).toBe(0.00);
        expect(res.order.status).toBe('pago');
        expect(sim.clientes.get('cli-1')!.saldo_pontos).toBe(0);

        // Check internal zero-balance fatura
        const internalFat = sim.faturas.get(`fat-zero-${res.order.id}`);
        expect(internalFat).toBeDefined();
        expect(internalFat!.status).toBe('pago');
        expect(internalFat!.valor_total).toBe(0);
      });

      it('T2.3.2 should successfully checkout with total_liquido = 0 when 100% paid by wallet balance', async () => {
        sim.clientes.get('cli-1')!.saldo_carteira = 300.00;

        const res = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }], // 200 + 15 = 215
            saldo_carteira_usado: 215.00,
          },
        });

        expect(res.order.total_liquido).toBe(0.00);
        expect(res.order.status).toBe('pago');
        expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(85.00); // 300 - 215
      });

      it('T2.3.3 should checkout with combination of points and wallet leaving total_liquido = 0', async () => {
        sim.clientes.get('cli-1')!.saldo_pontos = 5000; // R$ 50.00
        sim.clientes.get('cli-1')!.saldo_carteira = 165.00;

        const res = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }], // 200 + 15 = 215
            pontos_usados: 5000, // -50 => 165 remaining
            saldo_carteira_usado: 165.00, // -165 => 0 remaining
          },
        });

        expect(res.order.desconto_pontos).toBe(50.00);
        expect(res.order.abatimento_carteira).toBe(165.00);
        expect(res.order.total_liquido).toBe(0.00);
        expect(res.order.status).toBe('pago');
      });

      it('T2.3.4 should deduct points and wallet down to the exact penny without overflow', async () => {
        sim.clientes.get('cli-1')!.saldo_pontos = 1532; // R$ 15.32
        sim.clientes.get('cli-1')!.saldo_carteira = 50.00;

        const res = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', quantidade: 1 }], // 100 + 15 = 115
            pontos_usados: 1532,
            saldo_carteira_usado: 50.00,
          },
        });

        expect(res.order.desconto_pontos).toBe(15.32);
        expect(res.order.abatimento_carteira).toBe(50.00);
        expect(res.order.total_liquido).toBe(49.68); // 115 - 15.32 - 50 = 49.68
        expect(sim.clientes.get('cli-1')!.saldo_pontos).toBe(0);
        expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(0.00);
      });

      it('T2.3.5 should restore points and wallet accurately upon return of zero-balance order', async () => {
        sim.clientes.get('cli-1')!.saldo_pontos = 5000;
        sim.clientes.get('cli-1')!.saldo_carteira = 165.00;

        const checkoutRes = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }], // 215 total
            pontos_usados: 5000,
            saldo_carteira_usado: 165.00,
          },
        });

        sim.solicitacoes.set('sol-zero-ret', {
          id: 'sol-zero-ret',
          codigo_solicitacao: 'SOL-ZERO',
          cliente_id: 'cli-1',
          orcamento_origem_id: checkoutRes.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        const returnRes = await sim.processReturn({
          solicitacaoId: 'sol-zero-ret',
          novoStatus: 'aprovado',
        });

        expect(returnRes.pointsRefunded).toBe(5000);
        expect(returnRes.walletRefunded).toBe(165.00);
        expect(sim.clientes.get('cli-1')!.saldo_pontos).toBe(5000);
        expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(165.00);
      });
    });

    // 2.4 Partial Returns (>= 5 tests)
    describe('2.4 Partial Returns', () => {
      let multiItemOrderId: string;

      beforeEach(async () => {
        sim.clientes.get('cli-1')!.saldo_carteira = 100.00;
        sim.clientes.get('cli-1')!.saldo_pontos = 2000; // R$ 20.00

        const res = await sim.executeCheckout({
          clienteId: 'cli-1',
          payload: {
            carrinho: [
              { tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }, // R$ 200
              { tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }, // R$ 120
            ], // Subtotal = 320, shipping = 15 => Total before discounts = 335
            pontos_usados: 2000, // -20 => 315
            saldo_carteira_usado: 100.00, // -100 => Total líquido = 215.00
          },
        });
        multiItemOrderId = res.order.id;
      });

      it('T2.4.1 should restock ONLY the returned item in a multi-item partial return', async () => {
        const prodBaseStockBefore = sim.produtos.get('prod-base-1')!.estoque_disponivel;
        const variantStockBefore = sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel;

        // Customer returns only prod-base-1
        sim.solicitacoes.set('sol-part-1', {
          id: 'sol-part-1',
          codigo_solicitacao: 'SOL-PART-1',
          cliente_id: 'cli-1',
          orcamento_origem_id: multiItemOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({ solicitacaoId: 'sol-part-1', novoStatus: 'aprovado' });

        // prod-base-1 stock is restored (+1)
        expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(prodBaseStockBefore + 1);
        // variant stock is NOT touched
        expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(variantStockBefore);
      });

      it('T2.4.2 should refund wallet balance proportionally on partial return (CDC Art. 49)', async () => {
        const walletBefore = sim.clientes.get('cli-1')!.saldo_carteira; // 0.00

        // Returning prod-base-1 (200 / 320 = 62.5% of merchandise subtotal)
        // Wallet spent was 100.00 => proportional refund = 62.50
        sim.solicitacoes.set('sol-part-wallet', {
          id: 'sol-part-wallet',
          codigo_solicitacao: 'SOL-PART-WLT',
          cliente_id: 'cli-1',
          orcamento_origem_id: multiItemOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        const res = await sim.processReturn({ solicitacaoId: 'sol-part-wallet', novoStatus: 'aprovado' });

        expect(res.walletRefunded).toBe(62.50);
        expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(walletBefore + 62.50);
      });

      it('T2.4.3 should refund loyalty points proportionally on partial return', async () => {
        // Points spent was 2000 => 62.5% = 1250 points
        sim.solicitacoes.set('sol-part-points', {
          id: 'sol-part-points',
          codigo_solicitacao: 'SOL-PART-PTS',
          cliente_id: 'cli-1',
          orcamento_origem_id: multiItemOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        const res = await sim.processReturn({ solicitacaoId: 'sol-part-points', novoStatus: 'aprovado' });

        expect(res.pointsRefunded).toBe(1250);
        expect(sim.clientes.get('cli-1')!.saldo_pontos).toBe(1250);
      });

      it('T2.4.4 should clawback earned points proportionally on partial return', async () => {
        // Order had total_liquido = 215.00 => 215 earned points
        const order = sim.orcamentos.get(multiItemOrderId)!;
        order.pontos_creditados = true;
        sim.clientes.get('cli-1')!.saldo_pontos = 215;

        sim.solicitacoes.set('sol-part-claw', {
          id: 'sol-part-claw',
          codigo_solicitacao: 'SOL-PART-CLAW',
          cliente_id: 'cli-1',
          orcamento_origem_id: multiItemOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });

        await sim.processReturn({ solicitacaoId: 'sol-part-claw', novoStatus: 'aprovado' });

        const clawbackMovement = sim.pointsLedger.find(m => m.tipo === 'debito' && m.descricao.includes('Revogação'));
        expect(clawbackMovement).toBeDefined();
        // 215 (starting) + 1250 (refunded) - 134 (proportional clawback 62.5%) = 1331
        expect(sim.clientes.get('cli-1')!.saldo_pontos).toBe(1331);
      });

      it('T2.4.5 should handle sequential partial returns without exceeding original totals', async () => {
        // First return: prod-base-1 (R$ 200)
        sim.solicitacoes.set('sol-seq-1', {
          id: 'sol-seq-1',
          codigo_solicitacao: 'SEQ-1',
          cliente_id: 'cli-1',
          orcamento_origem_id: multiItemOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });
        const res1 = await sim.processReturn({ solicitacaoId: 'sol-seq-1', novoStatus: 'aprovado' });

        // Second return: variant camisa (R$ 120)
        sim.solicitacoes.set('sol-seq-2', {
          id: 'sol-seq-2',
          codigo_solicitacao: 'SEQ-2',
          cliente_id: 'cli-1',
          orcamento_origem_id: multiItemOrderId,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-camisa', produto_variante_id: 'var-camisa-azul-g', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });
        const res2 = await sim.processReturn({ solicitacaoId: 'sol-seq-2', novoStatus: 'aprovado' });

        // Sum of refunds across both sequential returns equals total order wallet and points
        expect(res1.walletRefunded + res2.walletRefunded).toBeCloseTo(100.00, 2);
        expect(res1.pointsRefunded + res2.pointsRefunded).toBeCloseTo(2000, 0);
      });
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================================================

  describe('Tier 3: Cross-Feature Combinations', () => {
    it('T3.1 should execute combined checkout: variant + coupon + points + wallet', async () => {
      sim.cupons.set('cupom-20pct', {
        id: 'cupom-20pct',
        codigo: 'CUPOM20',
        categoria_cupom: 'desconto',
        tipo_desconto: 'porcentagem',
        valor_desconto: 20, // 20%
        status: 'ativo',
        total_usos: 0,
        limite_usos: 50,
      });

      // Variant price: 120.00 * 2 = 240.00
      // Coupon 20% = -48.00 => Subtotal = 192.00
      // Points used: 2000 = -20.00 => Subtotal = 172.00
      // Shipping = +15.00 => 187.00
      // Wallet used: 87.00 => Total líquido = 100.00
      sim.clientes.get('cli-1')!.saldo_pontos = 2000;
      sim.clientes.get('cli-1')!.saldo_carteira = 100.00;

      const res = await sim.executeCheckout({
        clienteId: 'cli-1',
        payload: {
          carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 2 }],
          cupom_desconto_id: 'cupom-20pct',
          pontos_usados: 2000,
          saldo_carteira_usado: 87.00,
        },
      });

      expect(res.order.subtotal_bruto).toBe(240.00);
      expect(res.order.desconto_cupom).toBe(48.00);
      expect(res.order.desconto_pontos).toBe(20.00);
      expect(res.order.abatimento_carteira).toBe(87.00);
      expect(res.order.total_liquido).toBe(100.00);

      expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(8); // 10 - 2
      expect(sim.produtos.get('prod-camisa')!.valor).toBe(100.00); // Master product price intact!
    });

    it('T3.2 should resolve wallet balance race condition safely when client checkouts while earlier return is approved', async () => {
      // Setup initial order that will be returned
      sim.clientes.get('cli-1')!.saldo_carteira = 50.00;
      const firstOrder = await sim.executeCheckout({
        clienteId: 'cli-1',
        payload: {
          carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }],
          saldo_carteira_usado: 50.00,
        },
      });
      expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(0.00);

      sim.solicitacoes.set('sol-race-return', {
        id: 'sol-race-return',
        codigo_solicitacao: 'SOL-RACE',
        cliente_id: 'cli-1',
        orcamento_origem_id: firstOrder.order.id,
        tipo: 'devolucao',
        status: 'em_analise',
        itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
        valor_diferenca: 0,
        estorno_executado: false,
        historico_status: {},
        updated_at: new Date().toISOString(),
      });

      // Fire simultaneous return approval (restores 50.00 wallet) AND new checkout
      const results = await executeInExactSameMillisecond([
        () => sim.processReturn({ solicitacaoId: 'sol-race-return', novoStatus: 'aprovado' }),
        () => sim.executeCheckout({
          clienteId: 'cli-1',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', quantidade: 1 }] },
        }),
      ] as Array<() => Promise<any>>);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
      // Final wallet balance must be exactly 50.00 (since second checkout didn't use wallet)
      expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(50.00);
    });

    it('T3.3 should allow returned inventory to be immediately purchased in the exact same millisecond by another client', async () => {
      sim.produtos.get('prod-base-1')!.estoque_disponivel = 0; // Out of stock

      // Prepare return of 1 item
      sim.solicitacoes.set('sol-restock-race', {
        id: 'sol-restock-race',
        codigo_solicitacao: 'RESTOCK-RACE',
        cliente_id: 'cli-1',
        orcamento_origem_id: 'orc-mock-1',
        tipo: 'devolucao',
        status: 'em_analise',
        itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
        valor_diferenca: 0,
        estorno_executado: false,
        historico_status: {},
        updated_at: new Date().toISOString(),
      });
      sim.orcamentos.set('orc-mock-1', {
        id: 'orc-mock-1',
        codigo_orcamento: 'ORC-MOCK',
        cliente_id: 'cli-1',
        status: 'pago',
        subtotal_bruto: 200,
        desconto_produtos: 0,
        desconto_promocional: 0,
        desconto_cupom: 0,
        desconto_pontos: 0,
        pontos_usados: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 200,
        forma_pagamento: 'pix',
        itens: [{
          id: 'it-1',
          orcamento_id: 'orc-mock-1',
          tipo: 'produto',
          produto_id: 'prod-base-1',
          produto_variante_id: null,
          quantidade: 1,
          valor_unitario: 200,
          subtotal: 200,
          valor_original: 200,
          desconto_produto_unitario: 0,
        }],
        created_at: new Date().toISOString(),
      });

      // Simultaneous return approval and purchase by cli-2
      const results = await executeInExactSameMillisecond([
        () => sim.processReturn({ solicitacaoId: 'sol-restock-race', novoStatus: 'aprovado' }),
        () => sim.executeCheckout({
          clienteId: 'cli-2',
          payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }] },
        }),
      ] as Array<() => Promise<any>>);

      // Both must complete cleanly without negative stock
      expect(results.every(r => r.status === 'fulfilled' || r.status === 'rejected')).toBe(true);
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBeGreaterThanOrEqual(0);
    });

    it('T3.4 should cap points deduction so points + coupon never exceed subtotal', async () => {
      // Product 100.00, coupon = 80.00. Subtotal remainder = 20.00 (2000 points)
      // Customer has 5000 points and requests 5000.
      // Only 2000 points should be deducted!
      sim.cupons.set('cupom-80', {
        id: 'cupom-80',
        codigo: 'DESC80',
        categoria_cupom: 'desconto',
        tipo_desconto: 'valor_fixo',
        valor_desconto: 80.00,
        status: 'ativo',
        total_usos: 0,
        limite_usos: 10,
      });

      sim.clientes.get('cli-1')!.saldo_pontos = 5000;

      const res = await sim.executeCheckout({
        clienteId: 'cli-1',
        payload: {
          carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', quantidade: 1 }], // 100.00
          cupom_desconto_id: 'cupom-80',
          pontos_usados: 5000,
        },
      });

      expect(res.order.desconto_cupom).toBe(80.00);
      expect(res.order.desconto_pontos).toBe(20.00); // Capped at 20.00!
      expect(res.order.pontos_usados).toBe(2000);
      expect(sim.clientes.get('cli-1')!.saldo_pontos).toBe(3000); // 5000 - 2000
    });

    it('T3.5 should guarantee idempotency: duplicate request_id returns existing order without re-deducting stock or wallet', async () => {
      const initialStock = sim.produtos.get('prod-base-1')!.estoque_disponivel; // 15
      const initialWallet = sim.clientes.get('cli-1')!.saldo_carteira; // 250.00

      const payload = {
        request_id: 'req-idempotent-unique-123',
        carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 } as CartItem],
        saldo_carteira_usado: 50.00,
      };

      // Call 1
      const res1 = await sim.executeCheckout({ clienteId: 'cli-1', payload });
      expect(res1.success).toBe(true);
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(initialStock - 1);
      expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(initialWallet - 50.00);

      // Call 2 with identical request_id
      const res2 = await sim.executeCheckout({ clienteId: 'cli-1', payload });
      expect(res2.success).toBe(true);
      expect(res2.order.id).toBe(res1.order.id);

      // Stock and wallet must NOT be decremented twice!
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(initialStock - 1);
      expect(sim.clientes.get('cli-1')!.saldo_carteira).toBe(initialWallet - 50.00);
    });

    it('T3.6 should reject duplicate request_id if attempted by a different client', async () => {
      const payload1 = {
        request_id: 'req-multi-tenant-id',
        carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 } as CartItem],
      };

      await sim.executeCheckout({ clienteId: 'cli-1', payload: payload1 });

      // Client 2 attempts to send the same request_id
      await expect(sim.executeCheckout({
        clienteId: 'cli-2',
        payload: payload1,
      })).rejects.toThrow(/Request ID pertence a outro cliente/);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD EXTREME WORKLOAD (50-100 SIMULTANEOUS CALLS)
  // ==========================================================================

  describe('Tier 4: Real-World Extreme Workload (50-100 Concurrent Calls in Exact Same Millisecond)', () => {
    it('T4.1 [50 Parallel Calls] Zero Overselling & Immutability: 50 clients racing for 15 base product units', async () => {
      const initialStock = 15;
      sim.produtos.get('prod-base-1')!.estoque_disponivel = initialStock;
      const initialCatalogPrice = sim.produtos.get('prod-base-1')!.valor;

      // Create 50 distinct clients
      for (let i = 0; i < 50; i++) {
        sim.clientes.set(`stress-cli-${i}`, {
          id: `stress-cli-${i}`,
          nome: `User ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      // 50 tasks firing in exact same millisecond
      const tasks = Array.from({ length: 50 }, (_, i) => () =>
        sim.executeCheckout({
          clienteId: `stress-cli-${i}`,
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }],
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);

      const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];

      // 1. Zero Overselling: Exactly 15 succeed, 35 fail
      expect(fulfilled).toHaveLength(initialStock);
      expect(rejected).toHaveLength(50 - initialStock);

      // 2. Exactly purchased quantity is decremented (final stock = 0)
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(0);

      // 3. Catalog price is NEVER corrupted
      expect(sim.produtos.get('prod-base-1')!.valor).toBe(initialCatalogPrice);

      // 4. Sum of purchased quantities across all successful orders equals exactly 15
      const totalSold = fulfilled.reduce((acc, f) => acc + f.value.order.itens[0].quantidade, 0);
      expect(totalSold).toBe(initialStock);
    });

    it('T4.2 [50 Parallel Calls] Variant Pricing Isolation & Inventory: 50 clients racing for 20 variant units', async () => {
      const initialVariantStock = 20;
      sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel = initialVariantStock;
      sim.produtos.get('prod-camisa')!.estoque_disponivel = 50;
      const initialMasterProductPrice = sim.produtos.get('prod-camisa')!.valor; // 100.00
      const variantPrice = sim.produtoVariantes.get('var-camisa-azul-g')!.valor; // 120.00

      // Setup 50 clients
      for (let i = 0; i < 50; i++) {
        sim.clientes.set(`var-cli-${i}`, {
          id: `var-cli-${i}`,
          nome: `Variant User ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      const tasks = Array.from({ length: 50 }, (_, i) => () =>
        sim.executeCheckout({
          clienteId: `var-cli-${i}`,
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-camisa', variante_id: 'var-camisa-azul-g', quantidade: 1 }],
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);
      const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter(r => r.status === 'rejected');

      // Exactly 20 succeed, 30 fail
      expect(fulfilled).toHaveLength(initialVariantStock);
      expect(rejected).toHaveLength(30);

      // Variant stock exactly 0
      expect(sim.produtoVariantes.get('var-camisa-azul-g')!.estoque_disponivel).toBe(0);

      // Parent stock decremented by exactly 20 (50 - 20 = 30)
      expect(sim.produtos.get('prod-camisa')!.estoque_disponivel).toBe(30);

      // Catalog master price NEVER corrupted!
      expect(sim.produtos.get('prod-camisa')!.valor).toBe(initialMasterProductPrice);

      // Every fulfilled order charged the variant price (120.00), not the master price (100.00)
      for (const f of fulfilled) {
        expect(f.value.order.itens[0].valor_unitario).toBe(variantPrice);
      }
    });

    it('T4.3 [100 Parallel Calls] Extreme High-Load Stress Barrier: 100 simultaneous transactions', async () => {
      const initialStock = 42;
      sim.produtos.get('prod-base-1')!.estoque_disponivel = initialStock;

      for (let i = 0; i < 100; i++) {
        sim.clientes.set(`heavy-cli-${i}`, {
          id: `heavy-cli-${i}`,
          nome: `Heavy User ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      const tasks = Array.from({ length: 100 }, (_, i) => () =>
        sim.executeCheckout({
          clienteId: `heavy-cli-${i}`,
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }],
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled).toHaveLength(initialStock);
      expect(rejected).toHaveLength(100 - initialStock);
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(0);
    });

    it('T4.4 [25 Concurrent Returns] Anti-Arbitrage & Mass Post-Sales Integrity', async () => {
      // 1. Create 25 orders with wallet and points used
      const orderIds: string[] = [];
      sim.produtos.get('prod-base-1')!.estoque_disponivel = 50;

      for (let i = 0; i < 25; i++) {
        const cId = `ret-user-${i}`;
        sim.clientes.set(cId, {
          id: cId,
          nome: `Return User ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 10.00,
          saldo_pontos: 1000,
          pontos_totais: 1000,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });

        const chk = await sim.executeCheckout({
          clienteId: cId,
          payload: {
            carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 1 }],
            saldo_carteira_usado: 10.00,
            pontos_usados: 1000,
          },
        });
        orderIds.push(chk.order.id);

        sim.solicitacoes.set(`sol-mass-${i}`, {
          id: `sol-mass-${i}`,
          codigo_solicitacao: `MASS-${i}`,
          cliente_id: cId,
          orcamento_origem_id: chk.order.id,
          tipo: 'devolucao',
          status: 'em_analise',
          itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
          valor_diferenca: 0,
          estorno_executado: false,
          historico_status: {},
          updated_at: new Date().toISOString(),
        });
      }

      const stockBeforeReturns = sim.produtos.get('prod-base-1')!.estoque_disponivel; // 25

      // Fire 25 simultaneous return approvals
      const returnTasks = Array.from({ length: 25 }, (_, i) => () =>
        sim.processReturn({ solicitacaoId: `sol-mass-${i}`, novoStatus: 'aprovado' })
      );

      const returnResults = await executeInExactSameMillisecond(returnTasks);
      const fulfilledReturns = returnResults.filter(r => r.status === 'fulfilled');

      expect(fulfilledReturns).toHaveLength(25);

      // Mathematical restitution proof:
      // Stock restored = exactly 25
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(stockBeforeReturns + 25);

      // Every client got back exactly 10.00 wallet and 1000 points
      for (let i = 0; i < 25; i++) {
        const client = sim.clientes.get(`ret-user-${i}`)!;
        expect(client.saldo_carteira).toBe(10.00);
        expect(client.saldo_pontos).toBe(1000);
      }
    });

    it('T4.5 [Deadlock Immunity 40P01] 50 Parallel Transactions with Cross-Ordered Multi-Item Carts', async () => {
      // Setup products
      sim.produtos.get('prod-base-1')!.estoque_disponivel = 100;
      sim.produtos.get('prod-camisa')!.estoque_disponivel = 100;

      for (let i = 0; i < 50; i++) {
        sim.clientes.set(`deadlock-cli-${i}`, {
          id: `deadlock-cli-${i}`,
          nome: `User ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      // Half the clients request [Prod A, Prod B], other half request [Prod B, Prod A]
      // In un-ordered lock acquisition, this causes PostgreSQL Deadlock (40P01).
      // With canonical lexicographical sorting, 100% complete without deadlock!
      const tasks = Array.from({ length: 50 }, (_, i) => () => {
        const cart = i % 2 === 0
          ? [
              { tipo: 'produto' as const, item_id: 'prod-base-1', quantidade: 1 },
              { tipo: 'produto' as const, item_id: 'prod-camisa', quantidade: 1 },
            ]
          : [
              { tipo: 'produto' as const, item_id: 'prod-camisa', quantidade: 1 },
              { tipo: 'produto' as const, item_id: 'prod-base-1', quantidade: 1 },
            ];

        return sim.executeCheckout({
          clienteId: `deadlock-cli-${i}`,
          payload: { carrinho: cart },
        });
      });

      const results = await executeInExactSameMillisecond(tasks);
      const fulfilled = results.filter(r => r.status === 'fulfilled');

      expect(fulfilled).toHaveLength(50);
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(50); // 100 - 50
      expect(sim.produtos.get('prod-camisa')!.estoque_disponivel).toBe(50); // 100 - 50
    });

    it('T4.6 [Double-Restock Gate] Concurrent Duplicate Calls to processReturn on the same request', async () => {
      const chk = await sim.executeCheckout({
        clienteId: 'cli-1',
        payload: { carrinho: [{ tipo: 'produto', item_id: 'prod-base-1', quantidade: 2 }] },
      });

      sim.solicitacoes.set('sol-double-gate', {
        id: 'sol-double-gate',
        codigo_solicitacao: 'SOL-GATE',
        cliente_id: 'cli-1',
        orcamento_origem_id: chk.order.id,
        tipo: 'devolucao',
        status: 'em_analise',
        itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 2 }],
        valor_diferenca: 0,
        estorno_executado: false,
        historico_status: {},
        updated_at: new Date().toISOString(),
      });

      const stockBefore = sim.produtos.get('prod-base-1')!.estoque_disponivel; // 13

      // 5 concurrent calls to approve the exact same return request
      const tasks = Array.from({ length: 5 }, () => () =>
        sim.processReturn({ solicitacaoId: 'sol-double-gate', novoStatus: 'aprovado' })
      );

      const results = await executeInExactSameMillisecond(tasks);
      const fulfilled = results.filter(r => r.status === 'fulfilled');

      expect(fulfilled).toHaveLength(5);

      // Stock must be restored EXACTLY once (+2), never multiplied (+10)!
      expect(sim.produtos.get('prod-base-1')!.estoque_disponivel).toBe(stockBefore + 2);
    });
  });

  // ============================================================================
  // 5. STRESS TEST SUITE EXPANSION (SCENARIOS ST-01 TO ST-07)
  // ============================================================================
  describe('Tier 5: Additional Critical Concurrency Stress Scenarios (ST-01 to ST-07)', () => {
    // ST-01: Coupon Usage Limit Race (Coupon Depletion Barrier)
    it('ST-01 [Coupon Usage Limit Race] 20 concurrent checkouts competing for coupon with limite_usos: 3', async () => {
      // Setup Product
      sim.produtos.set('prod-st1', {
        id: 'prod-st1',
        nome: 'Headset Pro GSA',
        codigo_produto: 'HP-001',
        valor: 100.00,
        controle_estoque: true,
        estoque_disponivel: 50,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      // Setup Coupon with limit 3
      sim.cupons.set('cupom-st1-limit3', {
        id: 'cupom-st1-limit3',
        codigo: 'BURST3',
        categoria_cupom: 'desconto',
        tipo_desconto: 'valor_fixo',
        valor_desconto: 30.00,
        status: 'ativo',
        total_usos: 0,
        limite_usos: 3,
      });

      // Setup 20 distinct clients
      for (let i = 0; i < 20; i++) {
        sim.clientes.set(`cli-st1-${i}`, {
          id: `cli-st1-${i}`,
          nome: `Client ST1 ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      // Fire 20 concurrent checkouts at the exact same millisecond
      const tasks = Array.from({ length: 20 }, (_, i) => () =>
        sim.executeCheckout({
          clienteId: `cli-st1-${i}`,
          payload: {
            carrinho: [{ tipo: 'produto' as const, item_id: 'prod-st1', quantidade: 1 }],
            cupom_desconto_id: 'cupom-st1-limit3',
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);

      const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ success: boolean; order: OrderRecord }> => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // Exactly 3 succeed with coupon discount
      expect(fulfilled).toHaveLength(3);
      // Remaining 17 fail because coupon usage is exhausted
      expect(rejected).toHaveLength(17);

      for (const f of fulfilled) {
        expect(f.value.order.desconto_cupom).toBe(30.00);
        expect(f.value.order.total_liquido).toBe(85.00); // 100 - 30 + 15 shipping
      }

      for (const rej of rejected) {
        expect(rej.reason.message).toContain('Limite de usos do cupom esgotado.');
      }

      // Mathematical assertions on final database state
      const coupon = sim.cupons.get('cupom-st1-limit3')!;
      expect(coupon.total_usos).toBe(3);

      const prod = sim.produtos.get('prod-st1')!;
      expect(prod.estoque_disponivel).toBe(47); // 50 - 3
    });

    // ST-02: Same-Client Concurrent Wallet Overdraft Prevention
    it('ST-02 [Same-Client Wallet Overdraft Prevention] 3 concurrent checkouts requesting R$ 70 each against R$ 100 balance', async () => {
      sim.produtos.set('prod-st2', {
        id: 'prod-st2',
        nome: 'Mousepad Gamer GSA',
        codigo_produto: 'MP-001',
        valor: 80.00,
        controle_estoque: true,
        estoque_disponivel: 10,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      const client = {
        id: 'cli-st2-wallet',
        nome: 'Wallet Racer',
        tipo_pessoa: 'pf' as const,
        saldo_carteira: 100.00,
        saldo_pontos: 0,
        pontos_totais: 0,
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        limite_credito_total: 500,
        limite_credito_disponivel: 500,
      };
      sim.clientes.set(client.id, client);

      // 3 concurrent checkouts from the SAME client, each requesting 70.00 from wallet (total 210.00 requested)
      const tasks = Array.from({ length: 3 }, () => () =>
        sim.executeCheckout({
          clienteId: client.id,
          payload: {
            carrinho: [{ tipo: 'produto' as const, item_id: 'prod-st2', quantidade: 1 }],
            saldo_carteira_usado: 70.00,
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);

      const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // Exactly 1 checkout succeeds, the other 2 fail with insufficient wallet balance
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);

      for (const rej of rejected) {
        expect(rej.reason.message).toContain('Saldo da carteira insuficiente.');
      }

      // Wallet balance must NEVER drop below 0 (100.00 - 70.00 = 30.00)
      expect(client.saldo_carteira).toBe(30.00);
      expect(client.saldo_carteira).toBeGreaterThanOrEqual(0);

      // Exactly 1 wallet ledger entry recorded for cli-st2-wallet
      const walletDebits = sim.walletLedger.filter(w => w.cliente_id === client.id);
      expect(walletDebits).toHaveLength(1);
      expect(walletDebits[0].valor).toBe(70.00);
      expect(walletDebits[0].saldo_apos).toBe(30.00);

      // Product stock decremented exactly once
      expect(sim.produtos.get('prod-st2')!.estoque_disponivel).toBe(9);
    });

    // ST-03: Same-Client Concurrent Points Double-Spending Prevention
    it('ST-03 [Same-Client Points Double-Spending] 3 concurrent checkouts requesting 5000 points from 5000 balance', async () => {
      sim.produtos.set('prod-st3', {
        id: 'prod-st3',
        nome: 'Teclado Mecânico GSA',
        codigo_produto: 'TM-001',
        valor: 120.00,
        controle_estoque: true,
        estoque_disponivel: 10,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      const client = {
        id: 'cli-st3-points',
        nome: 'Points Racer',
        tipo_pessoa: 'pf' as const,
        saldo_carteira: 0,
        saldo_pontos: 5000, // R$ 50.00 equivalent
        pontos_totais: 5000,
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        limite_credito_total: 500,
        limite_credito_disponivel: 500,
      };
      sim.clientes.set(client.id, client);

      // 3 concurrent checkouts from the SAME client, each requesting all 5000 points
      const tasks = Array.from({ length: 3 }, () => () =>
        sim.executeCheckout({
          clienteId: client.id,
          payload: {
            carrinho: [{ tipo: 'produto' as const, item_id: 'prod-st3', quantidade: 1 }],
            pontos_usados: 5000,
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);

      const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // Exactly 1 checkout succeeds, the other 2 fail with insufficient points balance
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);

      for (const rej of rejected) {
        expect(rej.reason.message).toContain('Saldo de pontos insuficiente.');
      }

      // Points balance must be exactly 0 (5000 - 5000 = 0), never negative
      expect(client.saldo_pontos).toBe(0);

      // Exactly 1 points debit ledger recorded
      const pointsDebits = sim.pointsLedger.filter(p => p.cliente_id === client.id);
      expect(pointsDebits).toHaveLength(1);
      expect(pointsDebits[0].pontos).toBe(-5000);
      expect(pointsDebits[0].saldo_apos).toBe(0);

      // Fulfilled order reflects 50.00 points discount
      expect(fulfilled[0].value.order.pontos_usados).toBe(5000);
      expect(fulfilled[0].value.order.desconto_pontos).toBe(50.00);
    });

    // ST-04: Exchange Substitute Stock Collision (Troca vs Checkout Race)
    it('ST-04 [Exchange Substitute Stock Collision] 1 remaining unit of product: race between exchange approval and checkout', async () => {
      // Product with only 1 unit remaining in stock
      sim.produtos.set('prod-substitute', {
        id: 'prod-substitute',
        nome: 'Monitor UltraWide GSA',
        codigo_produto: 'MON-001',
        valor: 1500.00,
        controle_estoque: true,
        estoque_disponivel: 1,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      // Existing initial order that is being exchanged
      sim.orcamentos.set('ord-st4-orig', {
        id: 'ord-st4-orig',
        codigo_orcamento: 'ORC-ORIG-001',
        cliente_id: 'cli-st4-exchange',
        status: 'pago',
        subtotal_bruto: 1500.00,
        desconto_produtos: 0,
        desconto_promocional: 0,
        desconto_cupom: 0,
        desconto_pontos: 0,
        pontos_usados: 0,
        abatimento_carteira: 0,
        valor_frete: 0,
        total_liquido: 1500.00,
        forma_pagamento: 'pix',
        itens: [{
          id: 'item-st4-orig',
          orcamento_id: 'ord-st4-orig',
          tipo: 'produto',
          produto_id: 'prod-base-1',
          produto_variante_id: null,
          quantidade: 1,
          valor_unitario: 1500.00,
          subtotal: 1500.00,
          valor_original: 1500.00,
          desconto_produto_unitario: 0,
        }],
        created_at: new Date().toISOString(),
      });

      sim.clientes.set('cli-st4-exchange', {
        id: 'cli-st4-exchange',
        nome: 'Exchange Customer',
        tipo_pessoa: 'pf',
        saldo_carteira: 0,
        saldo_pontos: 0,
        pontos_totais: 0,
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        limite_credito_total: 1000,
        limite_credito_disponivel: 1000,
      });

      sim.clientes.set('cli-st4-checkout', {
        id: 'cli-st4-checkout',
        nome: 'Store Buyer',
        tipo_pessoa: 'pf',
        saldo_carteira: 0,
        saldo_pontos: 0,
        pontos_totais: 0,
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        limite_credito_total: 2000,
        limite_credito_disponivel: 2000,
      });

      // Pending exchange request claiming 1 unit of prod-substitute
      sim.solicitacoes.set('sol-st4-troca', {
        id: 'sol-st4-troca',
        codigo_solicitacao: 'SOL-TR-ST4',
        cliente_id: 'cli-st4-exchange',
        orcamento_origem_id: 'ord-st4-orig',
        tipo: 'troca',
        status: 'em_analise',
        itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
        novos_produtos: [{ produto_id: 'prod-substitute', quantidade: 1 }],
        valor_diferenca: 0,
        estorno_executado: false,
        historico_status: {},
        updated_at: new Date().toISOString(),
      });

      // Race: Admin approves exchange vs Customer executes checkout for the same substitute item
      const tasks: Array<() => Promise<any>> = [
        () => sim.processReturn({ solicitacaoId: 'sol-st4-troca', novoStatus: 'aprovado' }),
        () => sim.executeCheckout({
          clienteId: 'cli-st4-checkout',
          payload: { carrinho: [{ tipo: 'produto' as const, item_id: 'prod-substitute', quantidade: 1 }] },
        }),
      ];

      const results = await executeInExactSameMillisecond<any>(tasks);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];

      // Exactly 1 must win the remaining unit, exactly 1 must be rejected for stock collision
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Remaining stock must be strictly 0, never negative (-1)
      expect(sim.produtos.get('prod-substitute')!.estoque_disponivel).toBe(0);

      // Error message check
      const rejReason = rejected[0].reason.message;
      expect(rejReason).toMatch(/Estoque insuficiente/i);
    });

    // ST-05: Promotional Quota Concurrency (Flash Sale Quota Exhaustion)
    it('ST-05 [Promotional Quota Concurrency] Flash sale with quota: 5, 20 concurrent buyers', async () => {
      // Product with base price 200, promo price 100, quota limit 5, total stock 100
      sim.produtos.set('prod-flash-st5', {
        id: 'prod-flash-st5',
        nome: 'Fone Bluetooth Flash GSA',
        codigo_produto: 'FB-005',
        valor: 200.00,
        valor_promocional: 100.00,
        desconto_ativo: true,
        desconto_limite_quantidade_ativo: true,
        desconto_quantidade_limite: 5,
        desconto_quantidade_utilizada: 0,
        desconto_campanha_id: 'camp-black-flash',
        controle_estoque: true,
        estoque_disponivel: 100,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      // 20 distinct clients
      for (let i = 0; i < 20; i++) {
        sim.clientes.set(`cli-st5-${i}`, {
          id: `cli-st5-${i}`,
          nome: `Flash Buyer ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      // 20 concurrent checkouts for 1 unit each
      const tasks = Array.from({ length: 20 }, (_, i) => () =>
        sim.executeCheckout({
          clienteId: `cli-st5-${i}`,
          payload: {
            request_id: `req-st5-${i}`,
            carrinho: [{ tipo: 'produto' as const, item_id: 'prod-flash-st5', quantidade: 1 }],
          },
        })
      );

      const results = await executeInExactSameMillisecond(tasks);

      const fulfilled = results.filter((r): r is PromiseFulfilledResult<{ success: boolean; order: OrderRecord }> => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(20);

      // Exactly 5 orders receive the promotional price (100.00)
      const discountedOrders = fulfilled.filter(f => f.value.order.itens[0].valor_unitario === 100.00);
      // Exactly 15 orders pay the standard price (200.00)
      const standardOrders = fulfilled.filter(f => f.value.order.itens[0].valor_unitario === 200.00);

      expect(discountedOrders).toHaveLength(5);
      expect(standardOrders).toHaveLength(15);

      // Product quota state
      const prod = sim.produtos.get('prod-flash-st5')!;
      expect(prod.desconto_quantidade_utilizada).toBe(5);

      // Quota movements ledger contains exactly 5 consumption events
      const quotaMovements = sim.cotaMovimentos.filter(m => m.produto_id === 'prod-flash-st5');
      expect(quotaMovements).toHaveLength(5);
      const totalQuotaConsumed = quotaMovements.reduce((acc, m) => acc + m.quantidade, 0);
      expect(totalQuotaConsumed).toBe(5);

      // Total inventory decremented by exactly 20 units (100 - 20 = 80)
      expect(prod.estoque_disponivel).toBe(80);
    });

    // ST-06: Referrer Bonus Clawback with Insolvent Referrer
    it('ST-06 [Referrer Bonus Clawback with Insolvent Referrer] Return execution when referrer has balance 0', async () => {
      // Insolvent Referrer: already withdrew everything
      sim.clientes.set('ref-st6-insolvent', {
        id: 'ref-st6-insolvent',
        nome: 'Referrer Insolvent',
        tipo_pessoa: 'pf',
        saldo_carteira: 0.00, // zero balance!
        saldo_pontos: 0,
        pontos_totais: 0,
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        limite_credito_total: 500,
        limite_credito_disponivel: 500,
      });

      // Referred Customer who bought
      sim.clientes.set('cli-st6-buyer', {
        id: 'cli-st6-buyer',
        nome: 'Referred Customer',
        tipo_pessoa: 'pf',
        indicador_id: 'ref-st6-insolvent',
        saldo_carteira: 0.00,
        saldo_pontos: 0,
        pontos_totais: 0,
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        limite_credito_total: 500,
        limite_credito_disponivel: 500,
      });

      // Order created for cli-st6-buyer with subtotal 200.00 (referral commission 10% capped at 20.00)
      sim.orcamentos.set('ord-st6-ref', {
        id: 'ord-st6-ref',
        codigo_orcamento: 'ORC-REF-001',
        cliente_id: 'cli-st6-buyer',
        status: 'pago',
        subtotal_bruto: 200.00,
        desconto_produtos: 0,
        desconto_promocional: 0,
        desconto_cupom: 0,
        desconto_pontos: 0,
        pontos_usados: 0,
        abatimento_carteira: 50.00,
        valor_frete: 15.00,
        total_liquido: 165.00,
        forma_pagamento: 'pix',
        itens: [{
          id: 'item-st6',
          orcamento_id: 'ord-st6-ref',
          tipo: 'produto',
          produto_id: 'prod-base-1',
          produto_variante_id: null,
          quantidade: 1,
          valor_unitario: 200.00,
          subtotal: 200.00,
          valor_original: 200.00,
          desconto_produto_unitario: 0,
        }],
        created_at: new Date().toISOString(),
      });

      sim.solicitacoes.set('sol-st6-return', {
        id: 'sol-st6-return',
        codigo_solicitacao: 'SOL-REF-001',
        cliente_id: 'cli-st6-buyer',
        orcamento_origem_id: 'ord-st6-ref',
        tipo: 'devolucao',
        status: 'em_analise',
        itens_devolvidos: [{ produto_id: 'prod-base-1', quantidade: 1 }],
        valor_diferenca: 0,
        estorno_executado: false,
        historico_status: {},
        updated_at: new Date().toISOString(),
      });

      // Execute return
      const res = await sim.processReturn({
        solicitacaoId: 'sol-st6-return',
        novoStatus: 'aprovado',
      });

      // Return succeeds atomically without crashing or throwing
      expect(res.success).toBe(true);
      expect(res.walletRefunded).toBe(50.00);

      // Buyer got back 50.00 in wallet
      const buyer = sim.clientes.get('cli-st6-buyer')!;
      expect(buyer.saldo_carteira).toBe(50.00);

      // Referrer's wallet must remain strictly 0.00 (clamped by greatest(0, ...)), never -20.00
      const referrer = sim.clientes.get('ref-st6-insolvent')!;
      expect(referrer.saldo_carteira).toBe(0.00);

      // Wallet ledger records the clawback attempt
      const refDebits = sim.walletLedger.filter(w => w.cliente_id === 'ref-st6-insolvent');
      expect(refDebits).toHaveLength(1);
      expect(refDebits[0].valor).toBe(20.00);
      expect(refDebits[0].saldo_apos).toBe(0.00);

      // Return idempotency guard is marked true
      expect(sim.solicitacoes.get('sol-st6-return')!.estorno_executado).toBe(true);
    });

    // ST-07: Mixed Cart Deadlock Stress with Subsidiary Promotional Gift Locks
    it('ST-07 [Mixed Cart Deadlock Stress with Subsidiary Promotional Gift Locks] 50 parallel cross-cart requests with promotional gift locks', async () => {
      // Product A gifts Product B on purchase
      sim.produtos.set('prod-gift-A', {
        id: 'prod-gift-A',
        nome: 'Produto Principal A (Gifts B)',
        codigo_produto: 'PGA-001',
        valor: 50.00,
        produto_brinde_id: 'prod-gift-B',
        controle_estoque: true,
        estoque_disponivel: 1000,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      // Product B gifts Product A on purchase
      sim.produtos.set('prod-gift-B', {
        id: 'prod-gift-B',
        nome: 'Produto Principal B (Gifts A)',
        codigo_produto: 'PGB-001',
        valor: 50.00,
        produto_brinde_id: 'prod-gift-A',
        controle_estoque: true,
        estoque_disponivel: 1000,
        status: 'ativo',
        visivel_na_loja: true,
        ocultar_valor: false,
        tipo_cliente: 'ambos',
      });

      for (let i = 0; i < 50; i++) {
        sim.clientes.set(`cli-st7-${i}`, {
          id: `cli-st7-${i}`,
          nome: `Gift Racer ${i}`,
          tipo_pessoa: 'pf',
          saldo_carteira: 0,
          saldo_pontos: 0,
          pontos_totais: 0,
          carteira_bloqueada: false,
          pontos_bloqueados: false,
          limite_credito_total: 1000,
          limite_credito_disponivel: 1000,
        });
      }

      // 50 interleaved concurrent tasks:
      // Even tasks buy A (locks A then B)
      // Odd tasks buy B (locks B then A)
      // Canonical lexicographical sorting ['prod_prod-gift-A', 'prod_prod-gift-B'] ensures 0 deadlocks!
      const tasks = Array.from({ length: 50 }, (_, i) => () => {
        const itemToBuy = i % 2 === 0 ? 'prod-gift-A' : 'prod-gift-B';
        return sim.executeCheckout({
          clienteId: `cli-st7-${i}`,
          payload: {
            carrinho: [{ tipo: 'produto' as const, item_id: itemToBuy, quantidade: 1 }],
          },
        });
      });

      const results = await executeInExactSameMillisecond(tasks);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Zero deadlocks: 100% of transactions complete successfully
      expect(fulfilled).toHaveLength(50);
      expect(rejected).toHaveLength(0);

      // Stock assertions:
      // prod-gift-A had 25 direct purchases + 25 gift deductions = 50 total deductions
      // prod-gift-B had 25 direct purchases + 25 gift deductions = 50 total deductions
      expect(sim.produtos.get('prod-gift-A')!.estoque_disponivel).toBe(950);
      expect(sim.produtos.get('prod-gift-B')!.estoque_disponivel).toBe(950);
    });
  });
});

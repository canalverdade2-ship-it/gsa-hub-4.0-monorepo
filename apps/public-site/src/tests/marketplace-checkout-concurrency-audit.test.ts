import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Types & Simulation Interfaces
// ============================================================================
interface CatalogProduct {
  id: string;
  nome: string;
  valor: number;
  valor_promocional?: number | null;
  desconto_ativo?: boolean;
  desconto_limite_quantidade_ativo?: boolean;
  desconto_quantidade_limite?: number | null;
  desconto_quantidade_utilizada?: number;
  desconto_campanha_id?: string | null;
  possui_variacoes?: boolean;
  estoque_disponivel: number;
}

interface ProductVariant {
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

interface CartItemInput {
  item_id: string;
  tipo: 'produto' | 'assinatura';
  quantidade: number;
  variante_id?: string | null;
  produto_variante_id?: string | null;
  prazo_meses?: number;
}

interface OrderItemRecord {
  id: string;
  orcamento_id: string;
  tipo: 'produto' | 'assinatura';
  produto_id: string;
  produto_variante_id: string | null;
  quantidade: number;
  valor_unitario: number;
  subtotal: number;
  variacao_selecionada?: any;
  quantidade_com_desconto?: number;
  quantidade_sem_desconto?: number;
}

interface QuotaMovementRecord {
  id: string;
  produto_id: string;
  desconto_campanha_id: string;
  orcamento_id: string;
  tipo_movimento: 'consumo' | 'liberacao' | 'ajuste';
  quantidade: number;
  checkout_request_id?: string;
  created_at: string;
}

// ============================================================================
// Authoritative Simulation Engine for ACID Store Checkout & Concurrency
// Models PostgreSQL Row-Level Locks (SELECT FOR UPDATE) and In-Memory Tables
// ============================================================================
class MarketplaceCheckoutAuditSimulator {
  public produtos = new Map<string, CatalogProduct>();
  public produtoVariantes = new Map<string, ProductVariant>();
  public lojaPedidoItens: OrderItemRecord[] = [];
  public cotaMovimentos: QuotaMovementRecord[] = [];
  public clientSessions = new Map<string, { cliente_id: string; role: 'authenticated' | 'anon' }>();
  public clientBalances = new Map<string, { saldo_pontos: number; saldo_carteira: number }>();

  // Mutex per row to simulate Postgres SELECT ... FOR UPDATE
  private rowLocks = new Map<string, Promise<void>>();

  private async acquireRowLock(rowKey: string): Promise<() => void> {
    while (this.rowLocks.has(rowKey)) {
      await this.rowLocks.get(rowKey);
    }
    let unlock: () => void = () => {};
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
   * Sanitizes cart items preserving variant IDs (Fixing FLAW-02).
   */
  public sanitizeCart(cart: CartItemInput[]): CartItemInput[] {
    return cart.map((item) => {
      const sanitized: CartItemInput = {
        tipo: item.tipo,
        item_id: item.item_id,
        quantidade: item.quantidade,
      };
      const varId = item.variante_id || item.produto_variante_id;
      if (varId) {
        sanitized.variante_id = varId;
        sanitized.produto_variante_id = varId;
      }
      if (item.tipo === 'assinatura' && item.prazo_meses) {
        sanitized.prazo_meses = item.prazo_meses;
      }
      return sanitized;
    });
  }

  /**
   * Simulates ACID Checkout Execution according to correct contract:
   * 1. Acquires row locks in CANONICAL ORDER (produto_id ASC, variante_id ASC)
   * 2. NEVER updates produtos.valor (Immutable Catalog Price)
   * 3. Writes produto_variante_id and variant snapshot to order line items
   * 4. Decrements produto_variantes.estoque_disponivel
   * 5. Enforces promotional quota limits and writes to produto_desconto_cota_movimentos
   */
  public async executeCheckout(params: {
    sessionId: string;
    sessionToken: string;
    payload: {
      request_id?: string;
      carrinho: CartItemInput[];
      pontos_usados?: number;
      saldo_carteira_usado?: number;
      forma_pagamento?: string;
    };
  }): Promise<{ success: boolean; orcamento_id: string; total: number; orderItems: OrderItemRecord[] }> {
    const session = this.clientSessions.get(params.sessionId);
    const isAuth = session && session.role === 'authenticated';

    // Security check: points or wallet used without authentication
    if (!isAuth && ((params.payload.pontos_usados ?? 0) > 0 || (params.payload.saldo_carteira_usado ?? 0) > 0)) {
      throw new Error('401_UNAUTHORIZED: Uso de pontos ou carteira exige autenticação.');
    }

    const sanitizedCart = this.sanitizeCart(params.payload.carrinho);
    const orderId = `orc-${Math.random().toString(36).substring(2, 9)}`;
    const createdItems: OrderItemRecord[] = [];

    // Sort items to acquire locks in canonical deterministic order (Deadlock Prevention)
    const sortedCart = [...sanitizedCart].sort((a, b) => {
      const keyA = `${a.item_id}_${a.variante_id || ''}`;
      const keyB = `${b.item_id}_${b.variante_id || ''}`;
      return keyA.localeCompare(keyB);
    });

    const releaseLocks: Array<() => void> = [];

    try {
      // 1. Acquire row locks in canonical sorted order (deduplicated per transaction)
      const uniqueProductIds = Array.from(
        new Set(sortedCart.filter((i) => i.tipo === 'produto').map((i) => i.item_id))
      ).sort();
      for (const prodId of uniqueProductIds) {
        const prodLock = await this.acquireRowLock(`prod_${prodId}`);
        releaseLocks.push(prodLock);
      }

      const uniqueVariantIds = Array.from(
        new Set(
          sortedCart
            .filter((i) => i.tipo === 'produto' && i.variante_id)
            .map((i) => i.variante_id!)
        )
      ).sort();
      for (const varId of uniqueVariantIds) {
        const varLock = await this.acquireRowLock(`var_${varId}`);
        releaseLocks.push(varLock);
      }

      let orderTotal = 0;

      // 2. Validate inventory & calculate line prices
      for (const item of sortedCart) {
        if (item.tipo === 'produto') {
          const product = this.produtos.get(item.item_id);
          if (!product) {
            throw new Error(`Produto não encontrado: ${item.item_id}`);
          }

          let variant: ProductVariant | undefined;
          if (item.variante_id) {
            variant = this.produtoVariantes.get(item.variante_id);
            if (!variant || !variant.ativo || variant.produto_id !== product.id) {
              throw new Error(`Variacao indisponivel para ${product.nome}.`);
            }
          }

          // Check Variant Inventory
          if (variant && variant.controle_estoque) {
            if (variant.estoque_disponivel < item.quantidade) {
              throw new Error(`Estoque insuficiente para a variacao ${variant.nome} de ${product.nome}.`);
            }
          }

          // Determine Effective Unit Price:
          // Variant price takes precedence if specified, else master product price.
          // CRITICAL: Master product valor is NEVER overwritten!
          const unitPrice = variant?.valor !== null && variant?.valor !== undefined
            ? variant.valor
            : product.valor;

          // Promotional Quota Handling
          let qtdComDesconto = 0;
          let qtdSemDesconto = item.quantidade;
          let itemSubtotal = 0;

          if (product.desconto_ativo && product.valor_promocional && !item.variante_id) {
            if (product.desconto_limite_quantidade_ativo) {
              const limite = product.desconto_quantidade_limite ?? 0;
              const utilizada = product.desconto_quantidade_utilizada ?? 0;
              const restante = Math.max(0, limite - utilizada);

              qtdComDesconto = Math.min(item.quantidade, restante);
              qtdSemDesconto = item.quantidade - qtdComDesconto;

              // Increment utilized quota
              product.desconto_quantidade_utilizada = utilizada + qtdComDesconto;

              // Record quota movement ledger
              if (qtdComDesconto > 0 && product.desconto_campanha_id) {
                this.cotaMovimentos.push({
                  id: `mov-${Math.random().toString(36).substring(2, 9)}`,
                  produto_id: product.id,
                  desconto_campanha_id: product.desconto_campanha_id,
                  orcamento_id: orderId,
                  tipo_movimento: 'consumo',
                  quantidade: qtdComDesconto,
                  checkout_request_id: params.payload.request_id,
                  created_at: new Date().toISOString(),
                });
              }

              itemSubtotal = (qtdComDesconto * product.valor_promocional) + (qtdSemDesconto * unitPrice);
            } else {
              qtdComDesconto = item.quantidade;
              qtdSemDesconto = 0;
              itemSubtotal = item.quantidade * product.valor_promocional;
            }
          } else {
            itemSubtotal = item.quantidade * unitPrice;
          }

          // Decrement variant inventory
          if (variant && variant.controle_estoque) {
            variant.estoque_disponivel -= item.quantidade;
          }

          const orderItem: OrderItemRecord = {
            id: `item-${Math.random().toString(36).substring(2, 9)}`,
            orcamento_id: orderId,
            tipo: 'produto',
            produto_id: product.id,
            produto_variante_id: variant?.id || null,
            quantidade: item.quantidade,
            valor_unitario: unitPrice,
            subtotal: Number(itemSubtotal.toFixed(2)),
            variacao_selecionada: variant
              ? {
                  variante_id: variant.id,
                  nome: variant.nome,
                  sku: variant.sku,
                  opcoes: variant.combinacao,
                  valor_unitario: variant.valor,
                  quantidade: item.quantidade,
                }
              : null,
            quantidade_com_desconto: qtdComDesconto,
            quantidade_sem_desconto: qtdSemDesconto,
          };

          createdItems.push(orderItem);
          this.lojaPedidoItens.push(orderItem);
          orderTotal += itemSubtotal;
        }
      }

      return {
        success: true,
        orcamento_id: orderId,
        total: Number(orderTotal.toFixed(2)),
        orderItems: createdItems,
      };
    } finally {
      // Release all acquired row locks in reverse
      while (releaseLocks.length > 0) {
        const unlock = releaseLocks.pop()!;
        unlock();
      }
    }
  }

  /**
   * Simulates Atomic Points-to-Wallet Conversion (FLAW-06 verification).
   * Validates authentication and ownership before modifying balances.
   */
  public async convertPointsToWallet(params: {
    callerClient: { id: string; role: 'authenticated' | 'anon' };
    targetClienteId: string;
    pontos?: number;
  }): Promise<{ success: boolean; error?: string; novo_saldo_pontos?: number; novo_saldo_carteira?: number }> {
    if (params.callerClient.role !== 'authenticated') {
      throw new Error('401_UNAUTHORIZED: Chamada anônima não autorizada para conversão de pontos.');
    }

    if (params.callerClient.id !== params.targetClienteId) {
      throw new Error('403_FORBIDDEN: IDOR violado. Não é permitido converter pontos de outro cliente.');
    }

    if (params.pontos !== undefined && (params.pontos <= 0 || isNaN(params.pontos))) {
      throw new Error('400_BAD_REQUEST: Quantidade de pontos deve ser positiva.');
    }

    const unlock = await this.acquireRowLock(`client_${params.targetClienteId}`);
    try {
      const balance = this.clientBalances.get(params.targetClienteId);
      if (!balance) {
        return { success: false, error: 'Cliente não encontrado' };
      }

      const ptsToConvert = params.pontos !== undefined ? params.pontos : balance.saldo_pontos;
      if (ptsToConvert <= 0 || balance.saldo_pontos < ptsToConvert) {
        return { success: false, error: 'Saldo de pontos insuficiente' };
      }

      const conversionRate = 0.01; // 100 pontos = R$ 1.00
      const valorConvertido = Number((ptsToConvert * conversionRate).toFixed(2));

      balance.saldo_pontos -= ptsToConvert;
      balance.saldo_carteira = Number((balance.saldo_carteira + valorConvertido).toFixed(2));

      return {
        success: true,
        novo_saldo_pontos: balance.saldo_pontos,
        novo_saldo_carteira: balance.saldo_carteira,
      };
    } finally {
      unlock();
    }
  }
}

// ============================================================================
// TEST SUITE: MARKETPLACE CHECKOUT & CONCURRENCY AUDIT
// ============================================================================
describe('Marketplace Checkout & Concurrency Audit (FLAW-01, FLAW-02, FLAW-05, FLAW-06)', () => {
  let sim: MarketplaceCheckoutAuditSimulator;

  beforeEach(() => {
    sim = new MarketplaceCheckoutAuditSimulator();

    // Setup Master Product
    sim.produtos.set('prod-camisa-01', {
      id: 'prod-camisa-01',
      nome: 'Camisa Polo GSA Oficial',
      valor: 120.00, // Master Catalog Price
      possui_variacoes: true,
      estoque_disponivel: 100,
    });

    // Setup Product Variants
    sim.produtoVariantes.set('var-azul-p', {
      id: 'var-azul-p',
      produto_id: 'prod-camisa-01',
      nome: 'Azul / P',
      sku: 'CAM-AZ-P',
      valor: 80.00, // Variant-specific promotional/special price
      controle_estoque: true,
      estoque_disponivel: 3,
      ativo: true,
      combinacao: { Cor: 'Azul', Tamanho: 'P' },
    });

    sim.produtoVariantes.set('var-preto-g', {
      id: 'var-preto-g',
      produto_id: 'prod-camisa-01',
      nome: 'Preto / G',
      sku: 'CAM-PR-G',
      valor: 160.00, // Higher variant price
      controle_estoque: true,
      estoque_disponivel: 10,
      ativo: true,
      combinacao: { Cor: 'Preto', Tamanho: 'G' },
    });

    sim.produtoVariantes.set('var-branco-m', {
      id: 'var-branco-m',
      produto_id: 'prod-camisa-01',
      nome: 'Branco / M',
      sku: 'CAM-BR-M',
      valor: null, // Inherits master price
      controle_estoque: true,
      estoque_disponivel: 5,
      ativo: true,
      combinacao: { Cor: 'Branco', Tamanho: 'M' },
    });

    // Setup Clients
    sim.clientSessions.set('sess-alice', { cliente_id: 'cli-alice', role: 'authenticated' });
    sim.clientBalances.set('cli-alice', { saldo_pontos: 1500, saldo_carteira: 50.00 });

    sim.clientSessions.set('sess-bob', { cliente_id: 'cli-bob', role: 'authenticated' });
    sim.clientBalances.set('cli-bob', { saldo_pontos: 5000, saldo_carteira: 0.00 });

    sim.clientSessions.set('sess-anon', { cliente_id: 'cli-anon', role: 'anon' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // REQUIREMENT 1: MASTER CATALOG PRICE IMMUTABILITY (FLAW-01)
  // ==========================================================================
  describe('1. Master Catalog Price Immutability', () => {
    it('1.1 should never mutate master produtos.valor when purchasing a variant item', async () => {
      const masterBefore = sim.produtos.get('prod-camisa-01')!.valor;
      expect(masterBefore).toBe(120.00);

      const result = await sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          carrinho: [
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-azul-p' },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(80.00);

      // Line item receives variant price
      expect(result.orderItems[0].valor_unitario).toBe(80.00);

      // Master catalog price MUST be intact (120.00)
      const masterAfter = sim.produtos.get('prod-camisa-01')!.valor;
      expect(masterAfter).toBe(120.00);
    });

    it('1.2 should prevent catalog price corruption when multiple variants of the same product are bought in one cart', async () => {
      // In the buggy implementation, checking out var-azul-p (80.00) and var-preto-g (160.00)
      // updated produtos SET valor = 80, then valor = 160, and restored the corrupted price 80 or 160.
      const result = await sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          carrinho: [
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-azul-p' },
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-preto-g' },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(240.00); // 80.00 + 160.00 = 240.00

      // Verify order items
      const item1 = result.orderItems.find((i) => i.produto_variante_id === 'var-azul-p');
      const item2 = result.orderItems.find((i) => i.produto_variante_id === 'var-preto-g');
      expect(item1?.valor_unitario).toBe(80.00);
      expect(item2?.valor_unitario).toBe(160.00);

      // Catalog master price must remain 120.00
      const masterAfter = sim.produtos.get('prod-camisa-01')!.valor;
      expect(masterAfter).toBe(120.00);
    });

    it('1.3 should fallback to master product price when variant valor is null without modifying catalog', async () => {
      const result = await sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          carrinho: [
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 2, variante_id: 'var-branco-m' },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.orderItems[0].valor_unitario).toBe(120.00);
      expect(result.total).toBe(240.00);

      const masterAfter = sim.produtos.get('prod-camisa-01')!.valor;
      expect(masterAfter).toBe(120.00);
    });
  });

  // ==========================================================================
  // REQUIREMENT 2: VARIANT INVENTORY DECREMENT & CONCURRENCY (FLAW-02)
  // ==========================================================================
  describe('2. Variant Inventory Decrement & Concurrency Control', () => {
    it('2.1 should preserve variant identifiers during cart sanitization', () => {
      const rawCart: CartItemInput[] = [
        { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 2, variante_id: 'var-azul-p' },
        { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, produto_variante_id: 'var-preto-g' },
        { item_id: 'sub-vip-01', tipo: 'assinatura', quantidade: 1, prazo_meses: 12 },
      ];

      const sanitized = sim.sanitizeCart(rawCart);

      expect(sanitized[0].variante_id).toBe('var-azul-p');
      expect(sanitized[0].produto_variante_id).toBe('var-azul-p');
      expect(sanitized[1].variante_id).toBe('var-preto-g');
      expect(sanitized[1].produto_variante_id).toBe('var-preto-g');
      expect(sanitized[2].prazo_meses).toBe(12);
    });

    it('2.2 should write produto_variante_id and snapshot to loja_pedido_itens and decrement inventory', async () => {
      const initialStock = sim.produtoVariantes.get('var-azul-p')!.estoque_disponivel;
      expect(initialStock).toBe(3);

      const result = await sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          carrinho: [
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 2, variante_id: 'var-azul-p' },
          ],
        },
      });

      expect(result.success).toBe(true);
      const createdItem = result.orderItems[0];
      expect(createdItem.produto_variante_id).toBe('var-azul-p');
      expect(createdItem.variacao_selecionada).toBeDefined();
      expect(createdItem.variacao_selecionada.nome).toBe('Azul / P');
      expect(createdItem.variacao_selecionada.sku).toBe('CAM-AZ-P');

      // Inventory must be decremented by 2
      const updatedStock = sim.produtoVariantes.get('var-azul-p')!.estoque_disponivel;
      expect(updatedStock).toBe(1);
    });

    it('2.3 CONCURRENCY SIMULATION: multiple simultaneous checkouts competing for last variant units must prevent overselling', async () => {
      // Setup variant with exactly 3 units
      const variant = sim.produtoVariantes.get('var-azul-p')!;
      variant.estoque_disponivel = 3;

      // 8 concurrent checkout requests, each requesting 1 unit (8 requests competing for 3 units)
      const concurrentRequests = Array.from({ length: 8 }).map((_, idx) => {
        return sim.executeCheckout({
          sessionId: 'sess-alice',
          sessionToken: 'tok-alice',
          payload: {
            request_id: `req-race-${idx}`,
            carrinho: [
              { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-azul-p' },
            ],
          },
        }).then(
          (res) => ({ status: 'fulfilled' as const, res }),
          (err) => ({ status: 'rejected' as const, err: err.message })
        );
      });

      const outcomes = await Promise.all(concurrentRequests);

      const successes = outcomes.filter((o) => o.status === 'fulfilled');
      const failures = outcomes.filter((o) => o.status === 'rejected');

      // Exactly 3 requests must succeed
      expect(successes.length).toBe(3);
      // Remaining 5 requests must fail
      expect(failures.length).toBe(5);

      // Verify all failures were due to insufficient stock
      failures.forEach((f) => {
        expect((f as any).err).toContain('Estoque insuficiente para a variacao');
      });

      // Final stock must be strictly 0 (no overselling, never negative)
      expect(variant.estoque_disponivel).toBe(0);
    });

    it('2.4 DEADLOCK PREVENTION: items locked in canonical order avoid cyclic wait', async () => {
      // Thread 1: requests Prod-A / Var-1 then Prod-A / Var-2
      // Thread 2: requests Prod-A / Var-2 then Prod-A / Var-1
      const req1 = sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          carrinho: [
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-preto-g' },
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-azul-p' },
          ],
        },
      });

      const req2 = sim.executeCheckout({
        sessionId: 'sess-bob',
        sessionToken: 'tok-bob',
        payload: {
          carrinho: [
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-azul-p' },
            { item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1, variante_id: 'var-preto-g' },
          ],
        },
      });

      const [res1, res2] = await Promise.all([req1, req2]);
      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
    });
  });

  // ==========================================================================
  // REQUIREMENT 5: PROMOTIONAL QUOTA CAPS & LEDGER (FLAW-05)
  // ==========================================================================
  describe('3. Promotional Quota Caps & Movement Ledger', () => {
    beforeEach(() => {
      sim.produtos.set('prod-promo-01', {
        id: 'prod-promo-01',
        nome: 'Fone de Ouvido Bluetooth GSA',
        valor: 100.00,
        valor_promocional: 60.00,
        desconto_ativo: true,
        desconto_limite_quantidade_ativo: true,
        desconto_quantidade_limite: 10,
        desconto_quantidade_utilizada: 7, // 3 promotional units remaining
        desconto_campanha_id: 'camp-promo-tech-2026',
        estoque_disponivel: 50,
      });
    });

    it('3.1 should decrement promotional quota limit and create audit ledger records on checkout', async () => {
      const prod = sim.produtos.get('prod-promo-01')!;
      expect(prod.desconto_quantidade_utilizada).toBe(7);

      const result = await sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          request_id: 'chk-cota-01',
          carrinho: [
            { item_id: 'prod-promo-01', tipo: 'produto', quantidade: 2 },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(120.00); // 2 * 60.00

      // Quota utilized increased from 7 to 9
      expect(prod.desconto_quantidade_utilizada).toBe(9);

      // Audit movement record must be created in produto_desconto_cota_movimentos
      const mov = sim.cotaMovimentos.find((m) => m.produto_id === 'prod-promo-01');
      expect(mov).toBeDefined();
      expect(mov?.tipo_movimento).toBe('consumo');
      expect(mov?.quantidade).toBe(2);
      expect(mov?.desconto_campanha_id).toBe('camp-promo-tech-2026');
      expect(mov?.checkout_request_id).toBe('chk-cota-01');
    });

    it('3.2 should split tiered prices when quantity exceeds remaining promotional quota', async () => {
      const prod = sim.produtos.get('prod-promo-01')!;
      prod.desconto_quantidade_utilizada = 8; // 2 promo units remaining

      // User requests 5 units: 2 at promo (60) + 3 at regular (100) = 120 + 300 = 420.00
      const result = await sim.executeCheckout({
        sessionId: 'sess-alice',
        sessionToken: 'tok-alice',
        payload: {
          request_id: 'chk-split-01',
          carrinho: [
            { item_id: 'prod-promo-01', tipo: 'produto', quantidade: 5 },
          ],
        },
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(420.00);

      const orderItem = result.orderItems[0];
      expect(orderItem.quantidade_com_desconto).toBe(2);
      expect(orderItem.quantidade_sem_desconto).toBe(3);

      // Quota is now 100% consumed (10 of 10)
      expect(prod.desconto_quantidade_utilizada).toBe(10);
    });

    it('3.3 CONCURRENCY: race condition on last promotional quota units never exceeds quota cap', async () => {
      const prod = sim.produtos.get('prod-promo-01')!;
      prod.desconto_quantidade_utilizada = 9; // Only 1 promo unit left

      // 4 concurrent requests each trying to purchase 1 unit
      const concurrentRequests = Array.from({ length: 4 }).map((_, idx) => {
        return sim.executeCheckout({
          sessionId: 'sess-alice',
          sessionToken: 'tok-alice',
          payload: {
            request_id: `req-promo-race-${idx}`,
            carrinho: [{ item_id: 'prod-promo-01', tipo: 'produto', quantidade: 1 }],
          },
        });
      });

      const results = await Promise.all(concurrentRequests);

      // Total orders = 4
      expect(results.length).toBe(4);

      // Count orders with promotional price (60.00) vs regular price (100.00)
      const promoOrders = results.filter((r) => r.total === 60.00);
      const regularOrders = results.filter((r) => r.total === 100.00);

      // Exactly 1 order got the promotional price
      expect(promoOrders.length).toBe(1);
      // Exactly 3 orders paid the full price
      expect(regularOrders.length).toBe(3);

      // Total quota utilized must not exceed 10
      expect(prod.desconto_quantidade_utilizada).toBe(10);
    });
  });

  // ==========================================================================
  // REQUIREMENT 6: AUTHORIZATION & SECURITY (FLAW-06)
  // ==========================================================================
  describe('4. Authorization & Security Enforcement', () => {
    it('4.1 should reject anonymous calls to points conversion with 401 Unauthorized', async () => {
      await expect(
        sim.convertPointsToWallet({
          callerClient: { id: 'cli-anon', role: 'anon' },
          targetClienteId: 'cli-alice',
          pontos: 500,
        })
      ).rejects.toThrow('401_UNAUTHORIZED');
    });

    it('4.2 should block IDOR attacks: authenticated user cannot convert points of another customer', async () => {
      // Bob tries to convert Alice's points
      await expect(
        sim.convertPointsToWallet({
          callerClient: { id: 'cli-bob', role: 'authenticated' },
          targetClienteId: 'cli-alice',
          pontos: 500,
        })
      ).rejects.toThrow('403_FORBIDDEN');
    });

    it('4.3 should reject checkout redeeming loyalty points or wallet balance without authentication', async () => {
      await expect(
        sim.executeCheckout({
          sessionId: 'sess-anon',
          sessionToken: 'tok-anon',
          payload: {
            carrinho: [{ item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1 }],
            pontos_usados: 100, // Attempt to use points as anon
          },
        })
      ).rejects.toThrow('401_UNAUTHORIZED');

      await expect(
        sim.executeCheckout({
          sessionId: 'sess-anon',
          sessionToken: 'tok-anon',
          payload: {
            carrinho: [{ item_id: 'prod-camisa-01', tipo: 'produto', quantidade: 1 }],
            saldo_carteira_usado: 25.00, // Attempt to use wallet as anon
          },
        })
      ).rejects.toThrow('401_UNAUTHORIZED');
    });

    it('4.4 should reject non-positive or invalid points conversion inputs', async () => {
      await expect(
        sim.convertPointsToWallet({
          callerClient: { id: 'cli-alice', role: 'authenticated' },
          targetClienteId: 'cli-alice',
          pontos: -500,
        })
      ).rejects.toThrow('400_BAD_REQUEST');

      await expect(
        sim.convertPointsToWallet({
          callerClient: { id: 'cli-alice', role: 'authenticated' },
          targetClienteId: 'cli-alice',
          pontos: 0,
        })
      ).rejects.toThrow('400_BAD_REQUEST');
    });

    it('4.5 should execute valid points conversion atomically for authorized owner', async () => {
      const balanceBefore = sim.clientBalances.get('cli-alice')!;
      expect(balanceBefore.saldo_pontos).toBe(1500);
      expect(balanceBefore.saldo_carteira).toBe(50.00);

      // Convert 500 points (R$ 5.00)
      const res = await sim.convertPointsToWallet({
        callerClient: { id: 'cli-alice', role: 'authenticated' },
        targetClienteId: 'cli-alice',
        pontos: 500,
      });

      expect(res.success).toBe(true);
      expect(res.novo_saldo_pontos).toBe(1000);
      expect(res.novo_saldo_carteira).toBe(55.00);

      const balanceAfter = sim.clientBalances.get('cli-alice')!;
      expect(balanceAfter.saldo_pontos).toBe(1000);
      expect(balanceAfter.saldo_carteira).toBe(55.00);
    });
  });
});

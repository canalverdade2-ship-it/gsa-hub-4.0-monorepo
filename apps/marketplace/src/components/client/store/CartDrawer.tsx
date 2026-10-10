import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Gift,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  X,
  Diamond,
} from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import type { Produto } from '../../../types';
import type { PromoResult } from '../../../lib/promocaoQuantidadeEngine';
import {
  getProductQuantityPriceBreakdown,
  hasActiveProductDiscount,
} from '../../../lib/productPricing';
import { variationSelectionLabel, type ProductVariationSelection } from '../../../types/productVariations';
import { notifyWhatsAppModal } from '../../ui/WhatsAppButton';

type CartItem = {
  id: string;
  item_id: string;
  tipo: 'produto' | 'servico' | 'assinatura';
  quantidade: number;
  item_detalhes?: Produto | any;
  prazo_meses?: number;
  produto_variante_id?: string | null;
  opcoes_variacao?: ProductVariationSelection | null;
};

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  promosAplicadas?: PromoResult[];
  isGuest?: boolean;
  cupomDesconto?: any;
  cupomEntrega?: any;
  cupomDescInput?: string;
  cupomEntInput?: string;
  onCupomDescInputChange?: (value: string) => void;
  onCupomEntInputChange?: (value: string) => void;
  onApplyCoupon?: (code: string, type: 'desconto' | 'entrega') => void;
  onRemoveCoupon?: (type: 'desconto' | 'entrega') => void;
  onUpdateQuantity: (cartId: string, quantity: number, item: any) => void;
  onRemove: (cartId: string) => void;
  onClearCart?: () => void;
  onCheckout: () => void;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

function isUnavailableItem(item: CartItem): boolean {
  if (!item.item_detalhes) return true;
  if (item.tipo !== 'produto') return false;
  const details = item.item_detalhes as any;
  const status = String(details?.status || '').toLowerCase();
  if (status && status !== 'ativo') return true;
  if (details?.visivel_na_loja === false) return true;
  if (details?.possui_variacoes && !item.produto_variante_id) return true;
  return false;
}

function getItemStockInfo(item: CartItem): { controle_estoque: boolean; estoque_disponivel: number } {
  if (item.tipo !== 'produto') {
    return { controle_estoque: false, estoque_disponivel: Infinity };
  }
  if (item.opcoes_variacao && item.opcoes_variacao.controle_estoque != null) {
    return {
      controle_estoque: Boolean(item.opcoes_variacao.controle_estoque),
      estoque_disponivel: Number(item.opcoes_variacao.estoque_disponivel || 0),
    };
  }
  return {
    controle_estoque: Boolean(item.item_detalhes?.controle_estoque),
    estoque_disponivel: Number(item.item_detalhes?.estoque_disponivel || 0),
  };
}

function itemSubtotal(item: CartItem): number {
  if (item.tipo === 'produto') {
    return roundMoney(getProductQuantityPriceBreakdown(item.item_detalhes, item.quantidade).subtotalFinal);
  }
  return roundMoney(Number(item.item_detalhes?.valor || 0) * Number(item.quantidade || 1));
}

function itemTypeLabel(type: CartItem['tipo']) {
  if (type === 'assinatura') return 'Assinatura';
  if (type === 'servico') return 'Serviço';
  return 'Produto';
}

export default function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  promosAplicadas = [],
  isGuest = false,
  cupomDesconto,
  cupomEntrega,
  cupomDescInput = '',
  cupomEntInput = '',
  onCupomDescInputChange,
  onCupomEntInputChange,
  onApplyCoupon,
  onRemoveCoupon,
  onUpdateQuantity,
  onRemove,
  onClearCart,
  onCheckout,
}: CartDrawerProps) {
  const [showCoupons, setShowCoupons] = useState(Boolean(cupomDesconto || cupomEntrega));

  useEffect(() => {
    if (isOpen) {
      notifyWhatsAppModal(true);
    }
    return () => {
      notifyWhatsAppModal(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (cupomDesconto || cupomEntrega) setShowCoupons(true);
  }, [cupomDesconto, cupomEntrega]);

  const subtotal = useMemo(
    () => roundMoney(cartItems.reduce((total, item) => total + roundMoney(itemSubtotal(item)), 0)),
    [cartItems],
  );

  const promotionDiscount = useMemo(
    () => roundMoney(promosAplicadas.reduce((total: number, promotion: PromoResult) => {
      if (promotion.status === 'ativa' && promotion.desconto_aplicado) {
        return total + roundMoney(Number(promotion.desconto_aplicado.valor_desconto || 0));
      }
      return total;
    }, 0)),
    [promosAplicadas],
  );

  const couponDiscount = useMemo(() => {
    if (!isGuest || !cupomDesconto) return 0;

    let calculationBase = subtotal;
    if (cupomDesconto.produto_id) {
      const selectedItem = cartItems.find((item) => item.item_id === cupomDesconto.produto_id);
      if (!selectedItem) return 0;
      calculationBase = itemSubtotal(selectedItem);
    }

    const calculated = cupomDesconto.tipo_desconto === 'porcentagem'
      ? roundMoney(calculationBase * (Number(cupomDesconto.valor_desconto || 0) / 100))
      : roundMoney(Number(cupomDesconto.valor_desconto || 0));

    return roundMoney(Math.min(calculated, Math.max(0, subtotal - promotionDiscount)));
  }, [cartItems, cupomDesconto, isGuest, promotionDiscount, subtotal]);

  const totalDiscount = roundMoney(promotionDiscount + couponDiscount);
  const total = roundMoney(Math.max(0, subtotal - totalDiscount));
  const hasOutOfStockItems = cartItems.some((item) => {
    if (!item.item_detalhes || isUnavailableItem(item)) return true;
    if (item.tipo !== 'produto') return false;
    const { controle_estoque, estoque_disponivel } = getItemStockInfo(item);
    return controle_estoque && (estoque_disponivel <= 0 || Number(item.quantidade || 0) > estoque_disponivel);
  });

  if (!isOpen) return null;

  const activeGifts = promosAplicadas.filter((promotion) => promotion.status === 'ativa' && promotion.item_brinde);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm md:items-stretch md:justify-end"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside aria-labelledby="gsa-cart-title" className="flex h-[92vh] w-full max-w-md flex-col bg-white shadow-2xl transition-transform md:h-full md:rounded-l-3xl">
        {/* Cabeçalho do Carrinho */}
        <div className="border-b border-slate-100 bg-white">
          {/* Linha Principal: Ícone, Título e Botão Fechar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#17345f]/10 text-[#17345f]">
                <ShoppingBag className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 id="gsa-cart-title" className="text-lg font-black text-slate-900 tracking-tight whitespace-nowrap">
                Seu carrinho
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 cursor-pointer"
              aria-label="Fechar carrinho"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Linha Secundária: Contagem de Itens e Botão Limpar Carrinho */}
          <div className="flex items-center justify-between bg-slate-50/80 px-5 py-2.5 border-t border-slate-100/80">
            <p className="text-xs font-semibold text-slate-500">
              {cartItems.length} {cartItems.length === 1 ? 'item selecionado' : 'itens selecionados'}

            </p>
            {cartItems.length > 0 && onClearCart && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Deseja realmente esvaziar todos os itens do carrinho?')) {
                    onClearCart();
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/90 px-2.5 py-1 text-xs font-bold text-red-600 transition hover:bg-red-100 hover:text-red-700 cursor-pointer shadow-2xs whitespace-nowrap"
                title="Esvaziar todos os itens do carrinho"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Limpar carrinho</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cartItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
                <ShoppingBag className="h-10 w-10" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900">Carrinho vazio</h3>
              <p className="mt-2 max-w-[280px] text-sm leading-6 text-slate-500">
                Continue navegando e escolha os produtos ou planos ideais para você.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#17345f] px-5 text-sm font-extrabold text-white"
              >
                Continuar comprando
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item) => {
                const isProduct = item.tipo === 'produto';
                const isItemDeleted = !item.item_detalhes;
                const isUnavailable = isUnavailableItem(item);
                const { controle_estoque: controlaEstoque, estoque_disponivel: estoqueDisp } = getItemStockInfo(item);
                const outOfStock = isItemDeleted
                  || isUnavailable
                  || (isProduct
                  && controlaEstoque
                  && (estoqueDisp <= 0 || Number(item.quantidade || 0) > estoqueDisp));

                const subtotalForItem = itemSubtotal(item);
                const originalSubtotal = roundMoney(Number(item.item_detalhes?.valor || 0) * Number(item.quantidade || 1));
                const hasDiscount = isProduct && hasActiveProductDiscount(item.item_detalhes) && subtotalForItem < originalSubtotal;

                return (
                  <article
                    key={item.id}
                    className={`relative rounded-[16px] border p-3.5 ${outOfStock ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex gap-3.5">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        {item.item_detalhes?.imagem_url ? (
                          <img
                            src={item.item_detalhes.imagem_url}
                            alt={item.item_detalhes?.nome || ''}
                            className={`h-full w-full object-contain ${outOfStock ? 'opacity-50 grayscale' : ''}`}
                          />
                        ) : (
                          <Package className="h-8 w-8 text-slate-300" aria-hidden="true" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 pr-8">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#17345f]">
                          {itemTypeLabel(item.tipo)}
                        </p>
                        <h3 className="mt-1 line-clamp-2 text-sm font-extrabold leading-5 text-slate-950">
                          {item.item_detalhes?.nome || 'Item não encontrado (excluído)'}
                        </h3>
                        {item.tipo === 'produto' && variationSelectionLabel(item.opcoes_variacao) && (
                          <p className="mt-1 text-[11px] font-semibold leading-4 text-indigo-700">
                            {variationSelectionLabel(item.opcoes_variacao)}
                          </p>
                        )}
                        {item.prazo_meses && (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Período: {item.prazo_meses} {item.prazo_meses === 1 ? 'mês' : 'meses'}
                          </p>
                        )}

                        {outOfStock ? (
                          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-700">
                            <AlertCircle className="h-4 w-4" aria-hidden="true" />
                            {isItemDeleted
                              ? 'Item não disponível mais no catálogo'
                              : item.item_detalhes?.possui_variacoes && !item.produto_variante_id
                                ? 'Escolha novamente cor, tamanho ou outra opção'
                              : isUnavailable
                                ? 'Produto saiu do catálogo — remova para continuar'
                                : 'Item indisponível no estoque'}

                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                            <div>
                              {hasDiscount && (
                                <p className="text-[11px] text-slate-400 line-through">{formatCurrency(originalSubtotal)}</p>
                              )}
                              <p className="text-base font-black text-[#17345f]">{formatCurrency(subtotalForItem)}</p>
                              <p className="text-[11px] font-extrabold text-[#b89547] flex items-center gap-1 mt-0.5" title="Pontos GSA acumulados neste item">
                                <Diamond className="w-3 h-3 fill-current shrink-0" />
                                +{Math.floor(subtotalForItem)} pts GSA
                              </p>
                            </div>

                            {isProduct && (
                              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                                <button
                                  type="button"
                                  onClick={() => item.quantidade === 1 ? onRemove(item.id) : onUpdateQuantity(item.id, item.quantidade - 1, item.item_detalhes)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white"
                                  aria-label={item.quantidade === 1 ? 'Remover item' : 'Diminuir quantidade'}
                                >
                                  {item.quantidade === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                                </button>
                                <span className="w-8 text-center text-xs font-extrabold tabular-nums text-slate-900">{item.quantidade}</span>
                                {(() => {
                                  const { controle_estoque: controlaEstoque, estoque_disponivel: estoque } = getItemStockInfo(item);
                                  const noLimite = controlaEstoque && item.quantidade >= estoque;
                                  return (
                                    <button
                                      type="button"
                                      disabled={noLimite}
                                      onClick={() => onUpdateQuantity(item.id, item.quantidade + 1, item.item_detalhes)}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                      aria-label="Aumentar quantidade"
                                      title={noLimite ? `Estoque máximo: ${estoque}` : 'Aumentar quantidade'}
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </button>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remover ${item.item_detalhes?.nome || 'item'}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </article>
                );
              })}

              {activeGifts.map((promotion: PromoResult, index: number) => (
                <div key={`${promotion.promocao_id}-${index}`} className="flex items-center gap-3 rounded-[16px] border border-[#dfd1b4] bg-[#faf7f0] p-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#9b742f]">
                    <Gift className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#8b6729]">Brinde incluído</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{promotion.item_brinde?.produto_nome}</p>
                  </div>
                  <span className="text-xs font-black text-emerald-700">Grátis</span>
                </div>
              ))}

              {isGuest && (
                <section className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
                  <button
                    type="button"
                    onClick={() => setShowCoupons((current) => !current)}
                    className="flex w-full items-center justify-between text-left"
                    aria-expanded={showCoupons}
                  >
                    <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      <Tag className="h-4 w-4 text-[#9b742f]" aria-hidden="true" />
                      Cupons e benefícios
                    </span>
                    <span className="text-xs font-bold text-[#17345f]">{showCoupons ? 'Ocultar' : 'Adicionar'}</span>
                  </button>

                  {showCoupons && (
                    <div className="mt-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cupomDescInput}
                          onChange={(event) => onCupomDescInputChange?.(event.target.value.toUpperCase())}
                          placeholder="Cupom de desconto"
                          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold uppercase outline-none focus:border-[#17345f]"
                        />
                        <button
                          type="button"
                          onClick={() => onApplyCoupon?.(cupomDescInput, 'desconto')}
                          className="rounded-xl bg-[#17345f] px-3 text-xs font-extrabold text-white"
                        >
                          Aplicar
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cupomEntInput}
                          onChange={(event) => onCupomEntInputChange?.(event.target.value.toUpperCase())}
                          placeholder="Benefício de entrega"
                          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold uppercase outline-none focus:border-[#17345f]"
                        />
                        <button
                          type="button"
                          onClick={() => onApplyCoupon?.(cupomEntInput, 'entrega')}
                          className="rounded-xl border border-[#17345f] bg-white px-3 text-xs font-extrabold text-[#17345f]"
                        >
                          Aplicar
                        </button>
                      </div>

                      {(cupomDesconto || cupomEntrega) && (
                        <div className="space-y-2">
                          {cupomDesconto && (
                            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                              <span className="font-bold text-emerald-800">{cupomDesconto.codigo_cupom}</span>
                              <button type="button" onClick={() => onRemoveCoupon?.('desconto')} className="font-bold text-emerald-700">Remover</button>
                            </div>
                          )}
                          {cupomEntrega && (
                            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                              <span className="font-bold text-emerald-800">{cupomEntrega.codigo_cupom}</span>
                              <button type="button" onClick={() => onRemoveCoupon?.('entrega')} className="font-bold text-emerald-700">Remover</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>

        {cartItems.length > 0 && (
          <div className="border-t border-slate-200 bg-white p-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
            <div className="space-y-1.5 text-xs">
              {totalDiscount > 0 ? (
                <>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-700">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-emerald-600 font-semibold">
                    <span>Descontos</span>
                    <span>− {formatCurrency(totalDiscount)}</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-1 border-t border-slate-100">
                    <div>
                      <span className="font-bold text-slate-900 text-sm">Total dos itens</span>
                      <span className="ml-2 text-[10px] text-slate-400 font-normal">Frete calculado no checkout</span>
                    </div>
                    <span className="text-xl font-black text-[#17345f] tracking-tight">{formatCurrency(total)}</span>
                  </div>
                </>
              ) : (
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-bold text-slate-900 text-sm">Total dos itens</span>
                    <span className="ml-2 text-[10px] text-slate-400 font-normal">Frete calculado no checkout</span>
                  </div>
                  <span className="text-xl font-black text-[#17345f] tracking-tight">{formatCurrency(total)}</span>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg bg-[#d8bd73]/10 px-2.5 py-1 text-[11px] font-bold text-[#b89547]">
                <span className="flex items-center gap-1.5"><Diamond className="w-3 h-3 fill-current" /> Pontos GSA</span>
                <span>Ganhe +{Math.floor(total)} pts</span>
              </div>
            </div>

            {hasOutOfStockItems && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold leading-4 text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Remova os itens indisponíveis para continuar.
              </div>
            )}

            <button
              type="button"
              onClick={onCheckout}
              disabled={hasOutOfStockItems}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#17345f] px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-[#102746] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none cursor-pointer"
            >
              Ir para o checkout
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-[#9b742f]" aria-hidden="true" />
              Preços e estoque serão validados antes da confirmação.
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

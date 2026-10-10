import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Gift, Loader2, Minus, Package, Plus, ShoppingBag } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import {
  getProductEffectivePrice,
  getProductQuantityPriceBreakdown,
  getProductRemainingQuantityText,
  hasActiveProductDiscount,
} from '../../../lib/productPricing';
import {
  applyVariantToProduct,
  buildVariationSelection,
  fetchPublicProductVariations,
  findVariantForSelections,
} from '../../../lib/productVariations';
import type { ProductVariationSelection, ProductVariationsPayload } from '../../../types/productVariations';

interface QuantityModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  onConfirm: (quantity: number, variation?: ProductVariationSelection) => void;
  initialQty?: number;
  initialVariantId?: string | null;
}

export default function QuantityModal({ isOpen, onClose, item, onConfirm, initialQty = 1, initialVariantId }: QuantityModalProps) {
  const [quantity, setQuantity] = useState(initialQty);
  const [variations, setVariations] = useState<ProductVariationsPayload>({ grupos: [], variantes: [] });
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [variationError, setVariationError] = useState('');

  useEffect(() => {
    if (isOpen) setQuantity(Math.max(1, initialQty));
  }, [isOpen, initialQty]);

  useEffect(() => {
    let active = true;
    if (!isOpen || !item?.id || !item?.possui_variacoes) {
      setVariations({ grupos: [], variantes: [] });
      setSelections({});
      setVariationError('');
      setLoadingVariations(false);
      return () => { active = false; };
    }
    setLoadingVariations(true);
    setVariationError('');
    fetchPublicProductVariations(item.id)
      .then((data) => {
        if (!active) return;
        setVariations(data);
        const initialVariant = data.variantes.find((variant) => variant.id === initialVariantId);
        if (initialVariant) {
          setSelections(initialVariant.selecoes || {});
          return;
        }
        const automatic: Record<string, string> = {};
        data.grupos.forEach((group) => {
          if (group.opcoes.length === 1) automatic[group.chave] = group.opcoes[0].chave;
        });
        setSelections(automatic);
      })
      .catch((error) => {
        if (!active) return;
        console.error('Erro ao carregar variações:', error);
        setVariationError('Não foi possível carregar as opções deste produto. Tente novamente.');
      })
      .finally(() => { if (active) setLoadingVariations(false); });
    return () => { active = false; };
  }, [isOpen, item?.id, item?.possui_variacoes, initialVariantId]);

  const selectedVariant = useMemo(
    () => findVariantForSelections(variations, selections),
    [variations, selections],
  );
  const selectedOptionImage = useMemo(() => {
    if (selectedVariant?.imagem_url) return selectedVariant.imagem_url;
    for (const group of variations.grupos) {
      const selectedKey = selections[group.chave];
      if (!selectedKey) continue;
      const option = group.opcoes.find((opt) => opt.chave === selectedKey);
      if (option?.imagem_url) return option.imagem_url;
    }
    const matchingVariant = variations.variantes.find((variant) => {
      if (!variant.imagem_url) return false;
      return Object.entries(selections).every(
        ([groupKey, optionKey]) => !optionKey || variant.selecoes?.[groupKey] === optionKey
      );
    });
    return matchingVariant?.imagem_url || null;
  }, [selectedVariant, variations, selections]);
  const selectedItem = useMemo(
    () => {
      const base = selectedVariant ? applyVariantToProduct(item, selectedVariant) : item;
      if (selectedOptionImage && !base.imagem_url) {
        return { ...base, imagem_url: selectedOptionImage };
      }
      if (selectedOptionImage && base.imagem_url !== selectedOptionImage && !selectedVariant?.imagem_url) {
        return { ...base, imagem_url: selectedOptionImage };
      }
      return base;
    },
    [item, selectedVariant, selectedOptionImage],
  );
  const requiresVariation = Boolean(item?.possui_variacoes);

  useEffect(() => {
    if (!selectedVariant?.controle_estoque) return;
    const available = Math.max(0, Number(selectedVariant.estoque_disponivel || 0));
    setQuantity((current) => available > 0 ? Math.min(current, available) : 1);
  }, [selectedVariant?.id, selectedVariant?.controle_estoque, selectedVariant?.estoque_disponivel]);

  if (!isOpen || !item) return null;

  // Não força mínimo de 1 quando o estoque real é 0 — isso permitia "adicionar 1 unidade"
  // de um item esgotado através deste modal.
  const maxQuantity = selectedItem.controle_estoque ? Math.max(0, Number(selectedItem.estoque_disponivel || 0)) : 99;
  const isOutOfStock = selectedItem.controle_estoque && maxQuantity <= 0;
  const breakdown = getProductQuantityPriceBreakdown(selectedItem, quantity);
  const hasDiscount = hasActiveProductDiscount(selectedItem);
  const mixedPrice = breakdown.quantidadeComDesconto > 0 && breakdown.quantidadeSemDesconto > 0;
  const promotionAvailability = getProductRemainingQuantityText(selectedItem);
  const total = hasDiscount ? breakdown.subtotalFinal : Number(selectedItem.valor || 0) * quantity;
  const variationIncomplete = requiresVariation && !selectedVariant;

  const optionAvailable = (groupKey: string, optionKey: string) => variations.variantes.some((variant) => {
    if (variant.ativo === false || variant.selecoes?.[groupKey] !== optionKey) return false;
    if (variant.controle_estoque && Number(variant.estoque_disponivel || 0) <= 0) return false;
    return true;
  });

  const selectOption = (groupKey: string, optionKey: string) => {
    setSelections((current) => {
      const next = { ...current, [groupKey]: optionKey };
      for (const [otherGroup, otherOption] of Object.entries(next)) {
        if (otherGroup === groupKey) continue;
        const compatible = variations.variantes.some((variant) => (
          variant.ativo !== false
          && variant.selecoes?.[groupKey] === optionKey
          && variant.selecoes?.[otherGroup] === otherOption
          && (!variant.controle_estoque || Number(variant.estoque_disponivel || 0) > 0)
        ));
        if (!compatible) delete next[otherGroup];
      }
      return next;
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={requiresVariation ? 'Escolha as opções e a quantidade' : 'Escolha a quantidade'} size="sm">
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-[16px] border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {selectedItem.imagem_url ? (
              <img src={selectedItem.imagem_url} alt={selectedItem.nome} className="h-full w-full object-contain" />
            ) : (
              <Package className="h-8 w-8 text-slate-300" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-extrabold leading-5 text-slate-950">{selectedItem.nome}</h3>
            <p className="mt-1 text-sm font-black text-[#17345f]">
              {formatCurrency(hasDiscount ? getProductEffectivePrice(selectedItem) : Number(selectedItem.valor || 0))}
              <span className="ml-1 text-xs font-semibold text-slate-500">por unidade</span>
            </p>
          </div>
        </div>

        {requiresVariation && (
          <section className="rounded-[16px] border border-slate-200 bg-white p-4" aria-label="Variações do produto">
            {loadingVariations ? (
              <div className="flex items-center justify-center gap-2 py-5 text-sm font-bold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando opções...
              </div>
            ) : variationError ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {variationError}
              </div>
            ) : (
              <div className="space-y-4">
                {variations.grupos.map((group) => (
                  <div key={group.chave}>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-extrabold text-slate-950">{group.nome}</h4>
                      <span className="text-[10px] font-bold text-slate-400">
                        {selections[group.chave] ? 'Selecionado' : 'Escolha uma opção'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.opcoes.map((option) => {
                        const selected = selections[group.chave] === option.chave;
                        const available = optionAvailable(group.chave, option.chave);
                        return (
                          <button key={option.chave} type="button" disabled={!available}
                            onClick={() => selectOption(group.chave, option.chave)}
                            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${selected
                              ? 'border-[#17345f] bg-[#17345f] text-white shadow-sm'
                              : available
                                ? 'border-slate-200 bg-white text-slate-700 hover:border-[#17345f]'
                                : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through'
                            }`}>
                            {option.imagem_url && <img src={option.imagem_url} alt="" className="h-6 w-6 rounded-md object-cover" />}
                            {!option.imagem_url && option.cor_hex && <span className="h-4 w-4 rounded-full border border-white/50" style={{ backgroundColor: option.cor_hex }} />}
                            {option.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {selectedVariant && (
                  <div className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${isOutOfStock ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    {isOutOfStock ? 'Esta combinação está esgotada.' : selectedVariant.controle_estoque ? `${selectedVariant.estoque_disponivel} unidade(s) desta combinação` : 'Combinação disponível'}
                    {selectedVariant.sku && <span className="ml-2 font-mono text-[10px] opacity-70">SKU {selectedVariant.sku}</span>}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-[16px] border border-slate-200 bg-white p-5" aria-labelledby="quantity-title">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 id="quantity-title" className="text-sm font-extrabold text-slate-950">Quantidade</h4>
              <p className="mt-1 text-xs text-slate-500">Selecione quantas unidades deseja comprar.</p>
            </div>
            {selectedItem.controle_estoque && (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                {selectedItem.estoque_disponivel} disponíveis
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-[48px_1fr_48px] items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              disabled={quantity <= 1}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Diminuir quantidade"
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex h-14 items-center justify-center rounded-xl bg-[#f5f6f8] text-3xl font-black tabular-nums text-slate-950" aria-live="polite">
              {quantity}
            </div>
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
              disabled={quantity >= maxQuantity}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Aumentar quantidade"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </section>

        {hasDiscount && mixedPrice && (
          <div className="rounded-[16px] border border-[#dfd1b4] bg-[#faf7f0] p-4 text-xs">
            <div className="flex justify-between gap-4 font-bold text-[#17345f]">
              <span>{breakdown.quantidadeComDesconto} com preço promocional</span>
              <span>{formatCurrency(breakdown.subtotalComDesconto)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4 text-slate-600">
              <span>{breakdown.quantidadeSemDesconto} com preço normal</span>
              <span>{formatCurrency(breakdown.subtotalSemDesconto)}</span>
            </div>
          </div>
        )}

        {promotionAvailability && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
            {promotionAvailability}
          </p>
        )}

        {quantity > 1 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50/90 p-3.5 border border-emerald-200/80 animate-in fade-in duration-200">
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-emerald-800">Total ({quantity} unidades):</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-emerald-700">{formatCurrency(total)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200/60 shrink-0">
              <Gift className="h-4 w-4 text-amber-500" />
              <span>+ {Math.floor(total)} pts</span>
            </div>
          </div>
        )}

        <p className="text-[11px] text-center text-slate-500 font-medium">Preço e estoque serão confirmados no checkout.</p>

        <button
          type="button"
          onClick={() => onConfirm(quantity, selectedVariant ? buildVariationSelection(selectedVariant) : undefined)}
          disabled={isOutOfStock || variationIncomplete || loadingVariations || Boolean(variationError)}
          className="inline-flex min-h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-[#17345f] px-5 py-4 text-sm font-extrabold text-white transition hover:bg-[#102746] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          {isOutOfStock ? 'Combinação esgotada' : variationIncomplete ? 'Selecione todas as opções' : `Adicionar ${quantity} ${quantity === 1 ? 'unidade' : 'unidades'}`}
        </button>
      </div>
    </Modal>
  );
}

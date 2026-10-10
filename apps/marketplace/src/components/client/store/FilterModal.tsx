import React from 'react';
import { Check, RotateCcw, SlidersHorizontal, Tag } from 'lucide-react';
import { Modal } from '../../ui/Modal';

type SortOption = 'none' | 'price-asc' | 'price-desc' | 'alpha-asc' | 'alpha-desc';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sortBy: SortOption;
  setSortBy: (value: SortOption) => void;
  minPrice: number | '';
  setMinPrice: (value: number | '') => void;
  maxPrice: number | '';
  setMaxPrice: (value: number | '') => void;
  categories?: Array<{ id: string; nome: string }>;
  selectedCategoryId?: string;
  onSelectCategory?: (id: string) => void;
}

const SORT_OPTIONS: Array<{ id: SortOption; label: string; description: string }> = [
  { id: 'price-asc', label: 'Menor preço (Padrão)', description: 'Do mais barato ao mais caro' },
  { id: 'price-desc', label: 'Maior preço', description: 'Do mais caro ao mais barato' },
  { id: 'alpha-asc', label: 'Nome (A - Z)', description: 'Ordem alfabética' },
  { id: 'alpha-desc', label: 'Nome (Z - A)', description: 'Ordem alfabética inversa' },
];

export default function FilterModal({
  isOpen,
  onClose,
  sortBy,
  setSortBy,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  categories = [],
  selectedCategoryId = 'todas',
  onSelectCategory,
}: FilterModalProps) {
  if (!isOpen) return null;

  const hasInvalidRange = minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice);
  const hasFilters = (sortBy !== 'price-asc' && sortBy !== 'none') || minPrice !== '' || maxPrice !== '' || selectedCategoryId !== 'todas';

  const clearFilters = () => {
    setSortBy('price-asc');
    setMinPrice('');
    setMaxPrice('');
    if (onSelectCategory) onSelectCategory('todas');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filtrar produtos" size="sm">
      <div className="space-y-7 p-1 sm:p-2">
        <div className="hidden sm:block rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#17345f] text-white">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">Encontre com mais facilidade</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Organize os resultados e defina uma faixa de preço adequada para sua busca.
              </p>
            </div>
          </div>
        </div>

        {categories.length > 0 && (
          <section aria-labelledby="store-categories-title">
            <h4 id="store-categories-title" className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-slate-400" />
              Categoria
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectCategory?.('todas')}
                className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                  selectedCategoryId === 'todas'
                    ? 'border-[#17345f] bg-[#17345f] text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                Todas as categorias
              </button>
              {categories.map((cat) => {
                const selected = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory?.(cat.id)}
                    className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                      selected
                        ? 'border-[#17345f] bg-[#17345f] text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cat.nome}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="store-sort-title">
          <h4 id="store-sort-title" className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Ordenar resultados
          </h4>
          <div className="space-y-2">
            {SORT_OPTIONS.map((option) => {
              const selected = sortBy === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSortBy(option.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition ${
                    selected
                      ? 'border-[#17345f] bg-[#edf2f7] shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block text-sm font-bold ${selected ? 'text-[#17345f]' : 'text-slate-800'}`}>
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
                  </span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-[#17345f] bg-[#17345f] text-white' : 'border-slate-300 text-transparent'
                  }`}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="store-price-title">
          <h4 id="store-price-title" className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Faixa de preço
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">Preço mínimo</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value === '' ? '' : Math.max(0, Number(event.target.value)))}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-[#17345f] focus:ring-4 focus:ring-[#17345f]/10"
                />
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">Preço máximo</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="Sem limite"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value === '' ? '' : Math.max(0, Number(event.target.value)))}
                  aria-invalid={hasInvalidRange}
                  className={`h-12 w-full rounded-xl border bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-300 focus:ring-4 ${
                    hasInvalidRange
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-slate-200 focus:border-[#17345f] focus:ring-[#17345f]/10'
                  }`}
                />
              </div>
            </label>
          </div>

          {hasInvalidRange && (
            <p className="mt-2 text-xs font-semibold text-red-600" role="alert">
              O preço máximo precisa ser igual ou maior que o preço mínimo.
            </p>
          )}
        </section>

        <div className="flex gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Limpar
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={hasInvalidRange}
            className="min-h-12 flex-[1.5] rounded-xl bg-[#17345f] px-4 text-sm font-extrabold text-white transition hover:bg-[#102746] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </Modal>
  );
}

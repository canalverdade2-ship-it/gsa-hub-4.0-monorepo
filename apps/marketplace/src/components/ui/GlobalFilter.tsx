import React, { useState, useRef, useEffect } from 'react';
import { Filter, Search, X, Calendar, ArrowUpDown, ChevronDown } from 'lucide-react';

interface FilterOption {
  id: string;
  label: string;
  type: 'text' | 'select' | 'date';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface GlobalFilterProps {
  onSearch: (value: string) => void;
  onFilterChange: (filters: Record<string, any>) => void;
  onClear: () => void;
  options: FilterOption[];
  currentFilters: Record<string, any>;
  searchValue: string;
  showSearch?: boolean;
}

export function GlobalFilter({ 
  onSearch, 
  onFilterChange, 
  onClear, 
  options, 
  currentFilters,
  searchValue,
  showSearch = true,
}: GlobalFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom');
  const [maxHeight, setMaxHeight] = useState('75vh');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Detect space and adjust position
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const margin = 20; // Respiro das bordas
      const availableBelow = window.innerHeight - rect.bottom - margin;
      const availableAbove = rect.top - margin;
      
      // Escolhe a direção com mais espaço
      if (availableBelow < 300 && availableAbove > availableBelow) {
        setDropdownPosition('top');
        setMaxHeight(`${Math.min(availableAbove, 600)}px`);
      } else {
        setDropdownPosition('bottom');
        setMaxHeight(`${Math.min(availableBelow, 600)}px`);
      }
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasActiveFilters = (searchValue?.length ?? 0) > 0 || Object.values(currentFilters).some(v => v !== '' && v !== null);

  return (
    <div className="global-filter relative flex min-w-0 flex-1 items-center gap-2" ref={dropdownRef}>
      {showSearch && <div className="global-filter-search relative min-w-0 flex-1">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          aria-label="Buscar neste módulo"
          placeholder="Buscar por nome, código ou documento..."
          value={searchValue}
          onChange={(event) => onSearch(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>}
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`global-filter-trigger inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition-colors ${
          isOpen || hasActiveFilters
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
        }`}
      >
        <Filter className="h-4 w-4" />
        Filtros
        {hasActiveFilters && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
            !
          </span>
        )}
      </button>

      {isOpen && (
        <div 
          ref={menuRef}
          className={`absolute right-0 ${dropdownPosition === 'bottom' ? 'mt-2 top-full' : 'mb-2 bottom-full'} z-50 w-80 max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in-95 duration-200`}
        >
          <div 
            className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5"
            style={{ maxHeight }}
          >
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-slate-800">Opções de filtro</h3>
              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-neutral-100 transition-colors text-neutral-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5">
              {!showSearch && (
                <div className="global-filter-search relative">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Buscar neste módulo"
                    placeholder="Buscar por nome, código ou documento..."
                    value={searchValue}
                    onChange={(event) => onSearch(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}
              <div className="h-px bg-neutral-100 my-2"></div>

              {/* Dynamic Options */}
              {options.map((opt) => (
                <div key={opt.id} className="space-y-2">
                  <label htmlFor={`filter-${opt.id}`} className="ml-1 text-xs font-medium text-slate-600">{opt.label}</label>
                  {opt.type === 'select' ? (
                    <div className="relative">
                      <select
                        id={`filter-${opt.id}`}
                        value={currentFilters[opt.id] || ''}
                        onChange={(e) => onFilterChange({ ...currentFilters, [opt.id]: e.target.value })}
                        className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 text-xs font-bold text-neutral-900 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none pr-10"
                      >
                        <option value="">{opt.placeholder || 'Todos'}</option>
                        {opt.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
                    </div>
                  ) : opt.type === 'date' ? (
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                      <input
                        id={`filter-${opt.id}`}
                        type="date"
                        value={currentFilters[opt.id] || ''}
                        onChange={(e) => onFilterChange({ ...currentFilters, [opt.id]: e.target.value })}
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-neutral-900 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-3 pt-6 border-t border-neutral-50">
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setIsOpen(false);
                }}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>
            </div>
          </div>
          {/* Connector Arrow */}
          <div className={`absolute right-8 w-3 h-3 bg-white rotate-45 rounded-sm border-l border-t border-slate-200 ${
            dropdownPosition === 'bottom' ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-r border-b'
          }`}></div>
        </div>
      )}
    </div>
  );
}

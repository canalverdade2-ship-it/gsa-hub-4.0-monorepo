import React, { useState, useMemo, ReactNode, useEffect } from 'react';
import { 
  ChevronDown, ChevronUp, ChevronsUpDown, Search, Filter, 
  Download, RefreshCw, CheckSquare, Square, MoreHorizontal, 
  SlidersHorizontal, ChevronLeft, ChevronRight, Inbox, FileSpreadsheet
} from 'lucide-react';
import clsx from 'clsx';

export type GridDensity = 'compact' | 'standard' | 'comfortable';

export interface GridColumn<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface TacticalDataGridProps<T> {
  title?: string;
  subtitle?: string;
  data: T[];
  columns: GridColumn<T>[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  actions?: ReactNode;
  filterComponent?: ReactNode;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  isLoading?: boolean;
  density?: GridDensity;
  pageSize?: number;
  enableSelection?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  bulkActions?: (selectedIds: string[]) => ReactNode;
  onExportCsv?: () => void;
  stickyHeader?: boolean;
  totalCount?: number;
}

export function TacticalDataGrid<T>({
  title,
  subtitle,
  data,
  columns,
  keyExtractor,
  onRowClick,
  actions,
  filterComponent,
  searchPlaceholder = 'Buscar registros...',
  onSearch,
  emptyMessage = 'Nenhum registro encontrado.',
  emptyIcon,
  isLoading = false,
  density: initialDensity = 'standard',
  pageSize: initialPageSize = 15,
  enableSelection = false,
  selectedIds = [],
  onSelectionChange,
  bulkActions,
  onExportCsv,
  stickyHeader = true,
  totalCount
}: TacticalDataGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [density, setDensity] = useState<GridDensity>(initialDensity);

  // Sorting handler
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Client-side Filtered & Sorted Data computation
  const processedData = useMemo(() => {
    let list = Array.isArray(data) ? [...data] : [];

    // Filter by search query if onSearch callback is not provided (client fallback)
    if (searchQuery.trim() && !onSearch) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item: any) => {
        if (!item || typeof item !== 'object') return false;
        return Object.values(item).some(val => {
          if (val == null) return false;
          if (typeof val === 'object') {
            try {
              return JSON.stringify(val).toLowerCase().includes(q);
            } catch {
              return false;
            }
          }
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // Sort
    if (sortKey) {
      list.sort((a: any, b: any) => {
        const valA = a?.[sortKey];
        const valB = b?.[sortKey];
        if (valA === valB) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        const comp = strA.localeCompare(strB, 'pt-BR', { numeric: true });
        return sortDirection === 'asc' ? comp : -comp;
      });
    }

    return list;
  }, [data, searchQuery, onSearch, sortKey, sortDirection]);

  // Reset page when search or sorting changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDirection, data.length]);

  // Pagination calculation
  const totalItems = totalCount !== undefined ? totalCount : processedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  
  const paginatedData = useMemo(() => {
    // If totalCount is explicitly passed from outside, data might already be paginated
    if (totalCount !== undefined && data.length <= pageSize) {
      return processedData;
    }
    const start = (currentPage - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize, totalCount, data.length]);

  // Selection handlers
  const visibleRowKeys = useMemo(() => {
    return paginatedData.map(row => keyExtractor(row));
  }, [paginatedData, keyExtractor]);

  const allVisibleSelected = 
    visibleRowKeys.length > 0 && 
    visibleRowKeys.every(id => selectedIds.includes(id));

  const someVisibleSelected = 
    visibleRowKeys.some(id => selectedIds.includes(id)) && !allVisibleSelected;

  const toggleSelectAllVisible = () => {
    if (!onSelectionChange) return;
    if (allVisibleSelected) {
      // Deselect visible
      const visibleSet = new Set(visibleRowKeys);
      onSelectionChange(selectedIds.filter(id => !visibleSet.has(id)));
    } else {
      // Select all visible
      const combined = new Set([...selectedIds, ...visibleRowKeys]);
      onSelectionChange(Array.from(combined));
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(x => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  // Density styles
  const densityStyles = {
    compact: {
      cell: 'py-2 px-3 text-xs',
      header: 'py-2 px-3 text-[10px]'
    },
    standard: {
      cell: 'py-3 px-4 text-sm',
      header: 'py-2.5 px-4 text-[11px]'
    },
    comfortable: {
      cell: 'py-4 px-5 text-sm',
      header: 'py-3 px-5 text-xs'
    }
  }[density];

  // Default export CSV if requested
  const handleExportCsv = () => {
    if (onExportCsv) {
      onExportCsv();
      return;
    }
    if (!processedData.length) return;

    try {
      const headers = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(';');
      const rows = processedData.map(row => {
        return columns.map(c => {
          const val = (row as any)[c.key];
          if (val == null) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(';');
      });

      const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${title ? title.toLowerCase().replace(/\s+/g, '_') : 'export'}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Falha ao exportar CSV:', err);
    }
  };

  return (
    <div className="admin-data-grid flex flex-col w-full bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden transition-all">
      {/* ── Grid Command Toolbar ── */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        {/* Title & Badge */}
        <div className="flex items-center gap-3">
          {title && (
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {title}
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-200/90 text-slate-700">
                  {totalItems}
                </span>
              </h2>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          )}
        </div>

        {/* Controls: Search, Filters, Density, Export, Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Quick Search */}
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                onSearch?.(val);
              }}
              className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 w-48 sm:w-60 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  onSearch?.('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Optional Filter Slot */}
          {filterComponent}

          {/* Density Selector */}
          <div className="hidden sm:flex items-center bg-slate-200/60 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setDensity('compact')}
              title="Densidade Compacta (32px)"
              className={clsx(
                'px-2 py-1 text-[10px] font-bold rounded transition-all',
                density === 'compact' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              Compact
            </button>
            <button
              onClick={() => setDensity('standard')}
              title="Densidade Padrão (42px)"
              className={clsx(
                'px-2 py-1 text-[10px] font-bold rounded transition-all',
                density === 'standard' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              Padrão
            </button>
            <button
              onClick={() => setDensity('comfortable')}
              title="Densidade Confortável (52px)"
              className={clsx(
                'px-2 py-1 text-[10px] font-bold rounded transition-all',
                density === 'comfortable' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              )}
            >
              Amplo
            </button>
          </div>

          {/* Export CSV Button */}
          {onExportCsv !== undefined && (
            <button
              onClick={handleExportCsv}
              title="Exportar dados para CSV"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          )}

          {/* Custom Action Buttons */}
          {actions}
        </div>
      </div>

      {/* ── Bulk Actions Banner ── */}
      {enableSelection && selectedIds.length > 0 && (
        <div className="bg-indigo-50/90 border-b border-indigo-100 px-4 py-2 flex items-center justify-between animate-fade-up">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-[11px] font-mono font-bold">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-indigo-950">
              {selectedIds.length === 1 ? '1 item selecionado' : `${selectedIds.length} itens selecionados`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {bulkActions?.(selectedIds)}
            <button
              onClick={() => onSelectionChange?.([])}
              className="text-xs text-indigo-700 hover:text-indigo-950 underline font-medium px-2 py-1"
            >
              Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* ── Grid Table Container ── */}
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={clsx('border-b border-slate-200 bg-slate-100/75 select-none', stickyHeader && 'sticky top-0 z-10 shadow-2xs')}>
              {enableSelection && (
                <th className="w-10 px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                    aria-label="Selecionar todos os itens da página"
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={clsx(
                    densityStyles.header,
                    'font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap transition-colors',
                    col.sortable ? 'cursor-pointer hover:bg-slate-200/60' : '',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.headerClassName
                  )}
                >
                  <div
                    className={clsx(
                      'flex items-center gap-1.5',
                      col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                    )}
                  >
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="shrink-0">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="h-3 w-3 text-indigo-600 font-bold" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-indigo-600 font-bold" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 text-slate-400 opacity-60 hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                <tr key={`skel-row-${i}`} className="animate-pulse">
                  {enableSelection && (
                    <td className="px-3 py-3 text-center">
                      <div className="h-3.5 w-3.5 bg-slate-200 rounded mx-auto" />
                    </td>
                  )}
                  {columns.map((col, cIdx) => (
                    <td key={`skel-col-${i}-${col.key}`} className={densityStyles.cell}>
                      <div
                        className="h-3.5 bg-slate-100 rounded"
                        style={{ width: `${60 + ((i + cIdx) % 4) * 10}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (enableSelection ? 1 : 0)}
                  className="py-16 text-center text-slate-400"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    {emptyIcon || <Inbox className="h-8 w-8 text-slate-300" />}
                    <p className="text-sm font-semibold text-slate-500">{emptyMessage}</p>
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          onSearch?.('');
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline mt-1"
                      >
                        Limpar filtro de busca
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const id = keyExtractor(row);
                const isSelected = selectedIds.includes(id);
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    className={clsx(
                      'group transition-colors',
                      isSelected ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'bg-white hover:bg-slate-50/80',
                      onRowClick ? 'cursor-pointer' : ''
                    )}
                  >
                    {enableSelection && (
                      <td
                        className="w-10 px-3 py-2 text-center"
                        onClick={(e) => toggleSelectRow(id, e)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          aria-label={`Selecionar linha ${id}`}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={`${id}-${col.key}`}
                        className={clsx(
                          densityStyles.cell,
                          'font-medium text-slate-700 group-hover:text-slate-900 whitespace-nowrap',
                          col.align === 'right'
                            ? 'text-right font-mono tabular-nums'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                          col.className
                        )}
                      >
                        {col.render ? col.render(row, (currentPage - 1) * pageSize + index) : (row as any)[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination Footer ── */}
      <div className="admin-pagination px-4 py-2.5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 select-none">
        <div className="flex items-center gap-3">
          <div>
            Mostrando <span className="font-bold text-slate-900 font-mono tabular-nums">{paginatedData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span>-
            <span className="font-bold text-slate-900 font-mono tabular-nums">{Math.min(currentPage * pageSize, totalItems)}</span> de{' '}
            <span className="font-bold text-slate-900 font-mono tabular-nums">{totalItems}</span> registros
          </div>

          {/* Page Size Select */}
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="text-[11px] text-slate-500">Exibir:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1 || isLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <span className="px-2 py-1 font-mono text-xs font-semibold text-slate-700">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || isLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-2xs"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

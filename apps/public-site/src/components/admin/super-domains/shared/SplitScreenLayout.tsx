import React, { ReactNode, useState } from 'react';
import { 
  ArrowLeft, Search, SlidersHorizontal, Maximize2, 
  Minimize2, PanelLeftClose, PanelLeftOpen, Inbox, Layers 
} from 'lucide-react';
import clsx from 'clsx';

export interface SplitScreenLayoutProps {
  /** Master pane title (left side) */
  masterTitle: string;
  /** Master pane subtitle */
  masterSubtitle?: string;
  /** Master items count */
  masterCount?: number;
  /** Search control in master header */
  masterSearch?: {
    value: string;
    onChange: (query: string) => void;
    placeholder?: string;
  };
  /** Master header actions (e.g. Add button, refresh) */
  masterActions?: ReactNode;
  /** Master filter bar slot */
  masterFilters?: ReactNode;
  /** Master list/queue content */
  masterContent: ReactNode;
  /** Selected item identifier (controls detail visibility on mobile) */
  selectedId?: string | null;
  /** Detail pane title */
  detailTitle?: string;
  /** Detail pane subtitle */
  detailSubtitle?: string;
  /** Status badge slot for detail header */
  detailBadge?: ReactNode;
  /** Detail header actions */
  detailActions?: ReactNode;
  /** Detail workstation content */
  detailContent?: ReactNode;
  /** Custom empty state when no master item is selected */
  detailEmptyState?: ReactNode;
  /** Callback when detail is closed or back button is clicked on mobile */
  onCloseDetail?: () => void;
  /** Desktop master pane width */
  masterWidth?: 'sm' | 'md' | 'lg';
  /** Additional container className */
  className?: string;
}

export function SplitScreenLayout({
  masterTitle,
  masterSubtitle,
  masterCount,
  masterSearch,
  masterActions,
  masterFilters,
  masterContent,
  selectedId,
  detailTitle,
  detailSubtitle,
  detailBadge,
  detailActions,
  detailContent,
  detailEmptyState,
  onCloseDetail,
  masterWidth = 'md',
  className
}: SplitScreenLayoutProps) {
  const [isMasterCollapsed, setIsMasterCollapsed] = useState(false);

  // Master pane width classes on desktop
  const masterWidthClasses = {
    sm: 'w-full lg:w-80 xl:w-96',
    md: 'w-full lg:w-96 xl:w-[420px]',
    lg: 'w-full lg:w-[420px] xl:w-[480px]'
  }[masterWidth];

  const hasDetail = Boolean(selectedId && detailContent);

  return (
    <div
      className={clsx(
        'flex flex-col lg:flex-row w-full h-[calc(100vh-130px)] min-h-[580px] bg-slate-100 rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all',
        className
      )}
    >
      {/* ═══════════════════════════════════════════════════
          MASTER PANE (Left Queue / Catalog / List)
          ═══════════════════════════════════════════════════ */}
      <div
        className={clsx(
          'flex flex-col bg-white border-r border-slate-200 transition-all duration-200 shrink-0 h-full overflow-hidden',
          // Desktop collapse logic
          isMasterCollapsed ? 'lg:w-16' : masterWidthClasses,
          // Mobile responsive display: hide master if detail is open on small screens
          hasDetail ? 'hidden lg:flex' : 'flex'
        )}
      >
        {isMasterCollapsed ? (
          // Collapsed Icon Strip
          <div className="flex flex-col items-center py-4 gap-4 bg-slate-50/80 h-full">
            <button
              onClick={() => setIsMasterCollapsed(false)}
              title="Expandir fila lateral"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
            <div className="writing-mode-vertical text-xs font-bold text-slate-500 tracking-wider uppercase rotate-180 select-none">
              {masterTitle}
            </div>
            {masterCount !== undefined && (
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                {masterCount}
              </span>
            )}
          </div>
        ) : (
          // Full Master Queue View
          <>
            {/* Master Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 shrink-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    {masterTitle}
                    {masterCount !== undefined && (
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-200/90 text-slate-700">
                        {masterCount}
                      </span>
                    )}
                  </h2>
                  {masterSubtitle && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{masterSubtitle}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {masterActions}
                  <button
                    onClick={() => setIsMasterCollapsed(true)}
                    title="Recolher painel lateral"
                    className="hidden lg:flex p-1.5 rounded-md text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition-colors"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Master Search */}
              {masterSearch && (
                <div className="relative group">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  <input
                    type="text"
                    placeholder={masterSearch.placeholder || 'Buscar na fila...'}
                    value={masterSearch.value}
                    onChange={(e) => masterSearch.onChange(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-2xs"
                  />
                  {masterSearch.value && (
                    <button
                      onClick={() => masterSearch.onChange('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-700 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {/* Master Filters Slot */}
              {masterFilters}
            </div>

            {/* Master Scrollable List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/30">
              {masterContent}
            </div>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          DETAIL WORKSTATION PANE (Right Workstation)
          ═══════════════════════════════════════════════════ */}
      <div
        className={clsx(
          'flex-1 flex flex-col bg-slate-50/50 h-full overflow-hidden',
          // Mobile responsive display: hide detail if no item is selected on small screens
          !hasDetail ? 'hidden lg:flex' : 'flex'
        )}
      >
        {hasDetail ? (
          <>
            {/* Detail Workstation Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={onCloseDetail}
                  aria-label="Voltar para a fila"
                  className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                      {detailTitle || 'Detalhes do Registro'}
                    </h3>
                    {detailBadge}
                  </div>
                  {detailSubtitle && (
                    <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">
                      {detailSubtitle}
                    </p>
                  )}
                </div>
              </div>

              {/* Detail Header Quick Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {detailActions}
                {onCloseDetail && (
                  <button
                    onClick={onCloseDetail}
                    className="hidden lg:flex px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>

            {/* Detail Workstation Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {detailContent}
            </div>
          </>
        ) : (
          // Empty State Workstation
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            {detailEmptyState || (
              <div className="max-w-sm flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-400">
                  <Layers className="h-7 w-7 text-indigo-500/70" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  Nenhum item selecionado
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Selecione um item da fila à esquerda para visualizar todos os detalhes operacionais, documentos, histórico e despachos.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

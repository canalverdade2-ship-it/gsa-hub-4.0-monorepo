import React, { ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle, Loader2, Check, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

export type SlideOverWidth = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface SlideOverTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  disabled?: boolean;
}

export interface CommandSlideOverAction {
  label: string;
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'success' | 'secondary';
  icon?: ReactNode;
}

export interface CommandSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  primaryAction?: CommandSlideOverAction;
  secondaryAction?: CommandSlideOverAction;
  width?: SlideOverWidth;
  tabs?: SlideOverTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  isDirty?: boolean;
  dirtyWarningMessage?: string;
  headerActions?: ReactNode;
}

export function CommandSlideOver({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  children,
  footer,
  primaryAction,
  secondaryAction,
  width = 'lg',
  tabs,
  activeTab,
  onTabChange,
  isDirty = false,
  dirtyWarningMessage = 'Você tem alterações não salvas. Tem certeza de que deseja fechar?',
  headerActions
}: CommandSlideOverProps) {
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setShowDirtyConfirm(false);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle close attempt with dirty guard
  const handleRequestClose = () => {
    if (isDirty) {
      setShowDirtyConfirm(true);
    } else {
      onClose();
    }
  };

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (showDirtyConfirm) {
          setShowDirtyConfirm(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDirtyConfirm, isDirty]);

  // Width mapping
  const widthClasses: Record<SlideOverWidth, string> = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[calc(100vw-1.5rem)]'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Layer */}
          <motion.div
            key="slideover-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleRequestClose}
            aria-hidden="true"
            className="fixed inset-0 z-[200] bg-slate-950/40 backdrop-blur-[2px]"
          />

          {/* Drawer Panel */}
          <motion.div
            key="slideover-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className={clsx(
              'fixed right-0 top-0 bottom-0 z-[201] w-full bg-white border-l border-slate-200 flex flex-col shadow-drawer',
              widthClasses[width]
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">
                      {title}
                    </h2>
                    {badge}
                  </div>
                  {subtitle && (
                    <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {headerActions}
                <button
                  type="button"
                  onClick={handleRequestClose}
                  aria-label="Fechar painel"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Optional Header Navigation Tabs */}
            {tabs && tabs.length > 0 && (
              <div className="flex items-center px-6 border-b border-slate-200 bg-slate-50/70 overflow-x-auto gap-1 custom-scrollbar shrink-0">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      disabled={tab.disabled}
                      onClick={() => onTabChange?.(tab.id)}
                      className={clsx(
                        'px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap',
                        isActive
                          ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs rounded-t-md -mb-px'
                          : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300',
                        tab.disabled && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      <span>{tab.label}</span>
                      {tab.badge !== undefined && (
                        <span
                          className={clsx(
                            'px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold',
                            isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                          )}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Dirty Changes Confirmation Overlay */}
            {showDirtyConfirm && (
              <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 animate-fade-up shrink-0">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs font-semibold text-amber-900">
                    {dirtyWarningMessage}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowDirtyConfirm(false)}
                    className="px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100/80 rounded"
                  >
                    Continuar editando
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-2.5 py-1 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded shadow-2xs"
                  >
                    Descartar e Sair
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Body Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40 custom-scrollbar space-y-6">
              {children}
            </div>

            {/* Sticky Action Footer */}
            {(footer || primaryAction || secondaryAction) && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/95 shrink-0 flex items-center justify-end gap-3">
                {footer ? (
                  footer
                ) : (
                  <>
                    {secondaryAction && (
                      <button
                        type="button"
                        disabled={secondaryAction.disabled || secondaryAction.loading}
                        onClick={secondaryAction.onClick}
                        className={clsx(
                          'px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5'
                        )}
                      >
                        {secondaryAction.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {secondaryAction.icon}
                        <span>{secondaryAction.label}</span>
                      </button>
                    )}

                    {primaryAction && (
                      <button
                        type="button"
                        disabled={primaryAction.disabled || primaryAction.loading}
                        onClick={primaryAction.onClick}
                        className={clsx(
                          'px-4 py-2 text-xs font-bold rounded-lg text-white transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5',
                          primaryAction.variant === 'danger'
                            ? 'bg-red-600 hover:bg-red-700 shadow-red-600/10'
                            : primaryAction.variant === 'success'
                            ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10'
                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10'
                        )}
                      >
                        {primaryAction.loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          primaryAction.icon || <Check className="h-3.5 w-3.5" />
                        )}
                        <span>{primaryAction.label}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

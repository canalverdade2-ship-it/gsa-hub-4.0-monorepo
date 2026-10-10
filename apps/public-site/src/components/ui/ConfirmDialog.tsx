import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';
import type { useConfirm } from '../../hooks/useConfirm';

type ConfirmDialogProps = ReturnType<typeof useConfirm>;

const variantConfig = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    confirmBg: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500',
    border: 'border-red-100',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    confirmBg: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500',
    border: 'border-amber-100',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    confirmBg: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500',
    border: 'border-blue-100',
  },
};

/**
 * Componente de diálogo de confirmação que substitui window.confirm e window.prompt.
 * Deve ser renderizado uma vez no componente pai que usa `useConfirm()`.
 */
export function ConfirmDialog({
  confirmState,
  handleConfirm,
  handleCancel,
  handlePromptChange,
  promptInputRef,
}: ConfirmDialogProps) {
  const { isOpen, title, message, confirmLabel, cancelLabel, variant = 'danger', promptLabel, promptPlaceholder, promptRequired, promptValue } = confirmState;
  const config = variantConfig[variant];
  const Icon = config.icon;
  const hasPrompt = promptLabel !== undefined;
  const confirmDisabled = hasPrompt && promptRequired && !promptValue.trim();
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Foco
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (hasPrompt && promptInputRef?.current) {
        promptInputRef.current.focus();
      } else {
        firstFocusRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, hasPrompt, promptInputRef]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleCancel();
    if (e.key === 'Enter' && !hasPrompt) { e.preventDefault(); handleConfirm(); }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={`relative w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ${config.border} animate-in fade-in zoom-in-95 duration-150`}>
        {/* Botão fechar */}
        <button
          type="button"
          onClick={handleCancel}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          {/* Ícone + Título */}
          <div className="flex items-start gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.iconBg}`}>
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id="confirm-dialog-title" className="text-base font-bold text-neutral-900">
                {title}
              </h2>
              <p id="confirm-dialog-desc" className="mt-1 text-sm leading-relaxed text-neutral-600">
                {message}
              </p>
            </div>
          </div>

          {/* Campo de texto (prompt) */}
          {hasPrompt && (
            <div className="mt-5">
              <label htmlFor="confirm-prompt-input" className="block text-sm font-semibold text-neutral-700">
                {promptLabel}
                {promptRequired && <span className="ml-1 text-red-500">*</span>}
              </label>
              <textarea
                id="confirm-prompt-input"
                ref={promptInputRef}
                value={promptValue}
                onChange={(e) => handlePromptChange(e.target.value)}
                placeholder={promptPlaceholder ?? 'Digite aqui...'}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:ring-3 focus:ring-neutral-200"
              />
              {promptRequired && !promptValue.trim() && (
                <p className="mt-1 text-xs text-red-600" role="alert">Este campo é obrigatório.</p>
              )}
            </div>
          )}

          {/* Botões de ação */}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 bg-white px-5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              {cancelLabel ?? 'Cancelar'}
            </button>
            <button
              ref={firstFocusRef}
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-bold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${config.confirmBg}`}
            >
              {confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

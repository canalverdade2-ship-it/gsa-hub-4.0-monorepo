import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { AccessibleDialog } from './AccessibleDialog';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full' | 'wide' | 'auto';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `modal-title-${generatedId}`;

  /*
   * Sizes are designed to feel proportional at every breakpoint:
   *   Mobile  (< 640px)  → 96vw (quase tela toda)
   *   Tablet  (640-1023) → tailwind's named max-w values
   *   Desktop (1024px+)  → amplified so panels never look "pinched"
   *
   * Equivalent pixel reference (Tailwind defaults):
   *   sm=384  md=448  lg=512  xl=576  2xl=672  3xl=768
   *   4xl=896 5xl=1024 6xl=1152 7xl=1280
   */
  const sizes = {
    sm:   'w-full max-w-[96vw] sm:max-w-sm    md:max-w-md    lg:max-w-lg',
    md:   'w-full max-w-[96vw] sm:max-w-md    md:max-w-xl    lg:max-w-2xl',
    lg:   'w-full max-w-[96vw] sm:max-w-lg    md:max-w-2xl   lg:max-w-3xl   xl:max-w-4xl',
    xl:   'w-full max-w-[96vw] sm:max-w-xl    md:max-w-3xl   lg:max-w-4xl   xl:max-w-5xl',
    '2xl':'w-full max-w-[96vw] sm:max-w-2xl   md:max-w-4xl   lg:max-w-5xl   xl:max-w-6xl',
    '3xl':'w-full max-w-[96vw] sm:max-w-3xl   md:max-w-5xl   lg:max-w-6xl   xl:max-w-7xl',
    '4xl':'w-full max-w-[96vw] sm:max-w-4xl   md:max-w-6xl   lg:max-w-7xl   xl:max-w-[90vw]',
    '5xl':'w-full max-w-[96vw] sm:max-w-5xl   md:max-w-7xl   lg:max-w-[88vw] xl:max-w-[88vw]',
    '6xl':'w-full max-w-[96vw] sm:max-w-6xl   md:max-w-[88vw] lg:max-w-[88vw] xl:max-w-[90vw]',
    '7xl':'w-full max-w-[96vw] md:max-w-[90vw] lg:max-w-[92vw]',
    full: 'w-full max-w-[98vw]',
    wide: 'w-full max-w-[96vw] md:max-w-[90vw] lg:max-w-[92vw]',
    auto: 'w-full md:w-auto md:min-w-[560px] lg:min-w-[640px] max-w-[96vw]',
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('whatsapp-modal-state', { detail: { open: isOpen } }));
    return () => {
      if (isOpen) window.dispatchEvent(new CustomEvent('whatsapp-modal-state', { detail: { open: false } }));
    };
  }, [isOpen]);

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy={titleId}
      zIndexClassName="z-[100]"
      overlayClassName="items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4 lg:p-6"
      panelClassName={`${sizes[size]} max-h-[95vh] sm:max-h-[90vh] flex flex-col rounded-t-[1.5rem] bg-white shadow-2xl ring-1 ring-black/5 sm:rounded-[2rem] overflow-hidden`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 bg-white px-5 py-4 sm:px-6 lg:px-7">
        <h2 id={titleId} className="text-lg font-black uppercase tracking-tight text-neutral-900 sm:text-xl">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          data-dialog-autofocus
          className="rounded-xl p-2 text-neutral-400 transition-all hover:bg-neutral-100 hover:text-neutral-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6e2f]"
          aria-label="Fechar janela"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 lg:p-7 custom-scrollbar">{children}</div>
    </AccessibleDialog>
  );
}

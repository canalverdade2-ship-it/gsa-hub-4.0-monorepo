import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

interface AccessibleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  panelClassName?: string;
  overlayClassName?: string;
  zIndexClassName?: string;
  closeOnBackdrop?: boolean;
}

const DIALOG_MOBILE_STYLES = `
  @media (max-width: 767px) {
    [role="dialog"] {
      width: calc(100vw - 0.5rem);
      max-width: calc(100vw - 0.5rem);
      max-height: calc(100dvh - 0.5rem);
    }

    [role="dialog"] > div {
      max-height: calc(100dvh - 0.5rem) !important;
      min-height: 0 !important;
    }

    [role="dialog"] header {
      position: sticky;
      top: 0;
      z-index: 20;
    }

    [role="dialog"] footer {
      padding-bottom: max(0.75rem, env(safe-area-inset-bottom)) !important;
    }

    [role="dialog"] button {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    [role="dialog"] h1,
    [role="dialog"] h2,
    [role="dialog"] h3,
    [role="dialog"] p,
    [role="dialog"] span {
      overflow-wrap: anywhere;
    }
  }
`;

const SYSTEMS_DEMO_STYLES = `
  [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    overflow-y: auto !important;
  }

  [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:first-child {
    order: 1;
  }

  [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:nth-child(3) {
    order: 2;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > section:nth-child(2) {
    order: 3;
    border-top: 0 !important;
  }

  @media (max-width: 767px) {
    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > header {
      padding: 0.75rem !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:first-child {
      padding: 0.85rem !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:first-child > div[class*="overflow-x-auto"] {
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:first-child > div[class*="overflow-x-auto"]::-webkit-scrollbar {
      display: none;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:first-child > div[class*="overflow-x-auto"] > button {
      min-width: min(74vw, 220px) !important;
      min-height: 44px;
      scroll-snap-align: start;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:nth-child(3) {
      padding: 1rem !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:nth-child(3) h3 {
      font-size: 1.65rem !important;
      line-height: 1.12 !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > section:nth-child(2) {
      min-height: auto !important;
      padding: 0.75rem !important;
      overflow: visible !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > section:nth-child(2) > div:nth-child(2) {
      min-height: 280px !important;
      padding: 0.6rem !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > section:nth-child(2) button {
      min-width: 42px;
      min-height: 42px;
    }
  }

  @media (min-width: 1024px) {
    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) {
      grid-template-columns: 250px minmax(0, 1fr) !important;
      grid-template-rows: auto minmax(430px, 1fr) !important;
      align-items: stretch;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:first-child {
      grid-column: 1;
      grid-row: 1 / span 2;
      order: 1;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > aside:nth-child(3) {
      grid-column: 2;
      grid-row: 1;
      order: 2;
      border-left-width: 0 !important;
      border-top-width: 0 !important;
    }

    [role="dialog"][aria-label^="Laboratório de demonstração"] > div > div:nth-child(2) > section:nth-child(2) {
      grid-column: 2;
      grid-row: 2;
      order: 3;
    }
  }
`;

export function AccessibleDialog({
  isOpen,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  panelClassName = 'w-full max-w-[96vw] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl rounded-2xl bg-white p-6 shadow-2xl',
  overlayClassName = 'items-center justify-center overflow-y-auto bg-black/65 p-4 lg:p-6 backdrop-blur-sm',
  zIndexClassName = 'z-[110]',
  closeOnBackdrop = true,
}: AccessibleDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const isSystemsDemo = ariaLabel?.startsWith('Laboratório de demonstração') ?? false;

  useDialogAccessibility({ isOpen, containerRef: panelRef, onClose });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{DIALOG_MOBILE_STYLES}</style>
      {isSystemsDemo && <style>{SYSTEMS_DEMO_STYLES}</style>}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            className={`fixed inset-0 flex ${zIndexClassName} ${overlayClassName}`}
            onMouseDown={(event) => {
              if (closeOnBackdrop && event.target === event.currentTarget) onClose();
            }}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabelledBy ? undefined : ariaLabel}
              aria-labelledby={ariaLabelledBy}
              tabIndex={-1}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 10 }}
              transition={reduceMotion ? { duration: 0 } : { type: 'spring', duration: 0.32, bounce: 0.08 }}
              className={`w-full outline-none ${panelClassName}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}

import type { ComponentProps } from 'react';
import { BrandExamplesDialog as BrandPortfolioInteractiveDialog } from './BrandPortfolioInteractiveDialog';

export type { BrandExampleCategory } from './BrandPortfolioInteractiveDialog';

type BrandExamplesDialogProps = ComponentProps<typeof BrandPortfolioInteractiveDialog>;

export function BrandExamplesDialog(props: BrandExamplesDialogProps) {
  return (
    <>
      <style>{`
        [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child {
          display: flex;
          flex-direction: column;
        }

        [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:first-child {
          order: 2;
          margin-top: 1.5rem;
        }

        [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:nth-child(2) {
          order: 1;
          margin-top: 0 !important;
          padding-top: 0 !important;
          border-top-width: 0 !important;
        }

        @media (max-width: 767px) {
          [role="dialog"][aria-label^="Galeria de referências"] {
            width: calc(100vw - 0.5rem) !important;
            max-height: calc(100dvh - 0.5rem) !important;
            margin: 0.25rem !important;
            border-radius: 0.75rem !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div {
            max-height: calc(100dvh - 0.5rem) !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > aside:first-child {
            padding: 1rem !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > aside:first-child > div:nth-child(2) {
            margin-top: 1rem !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > aside:first-child h2 {
            font-size: 1.45rem !important;
            line-height: 1.14 !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] [role="tablist"] {
            margin-top: 1rem !important;
            padding-bottom: 0.35rem;
            scroll-snap-type: x mandatory;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }

          [role="dialog"][aria-label^="Galeria de referências"] [role="tablist"]::-webkit-scrollbar {
            display: none;
          }

          [role="dialog"][aria-label^="Galeria de referências"] [role="tab"] {
            min-width: min(76vw, 230px) !important;
            min-height: 44px;
            scroll-snap-align: start;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) {
            min-height: 0;
            overflow-y: auto !important;
            overscroll-behavior: contain;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child {
            padding: 0.9rem !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:nth-child(2) {
            gap: 1rem !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:nth-child(2) h3 {
            font-size: 1.85rem !important;
            line-height: 1.08 !important;
            overflow-wrap: anywhere;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:first-child {
            margin-top: 1rem !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:first-child > div:last-child {
            min-height: 260px !important;
            aspect-ratio: 4 / 3 !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] footer {
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom)) !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] footer button {
            min-width: 42px;
            min-height: 42px;
          }
        }

        @media (max-width: 420px) {
          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:first-child > div:last-child {
            min-height: 230px !important;
            aspect-ratio: 1 / 1 !important;
          }

          [role="dialog"][aria-label^="Galeria de referências"] > div > div:nth-child(2) > div:first-child > div:nth-child(2) h3 {
            font-size: 1.6rem !important;
          }
        }
      `}</style>
      <BrandPortfolioInteractiveDialog {...props} />
    </>
  );
}

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import Button from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  isSuccessModal?: boolean;
  successTitle?: string;
  successButtonText?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  isSuccessModal,
  successTitle = 'Seu contrato foi enviado e ficará em análise pelo sistema.',
  successButtonText = 'Entendi',
  children,
  className = ''
}: ModalProps) {
  // Bloqueia scroll do body quando modal está aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Fecha com ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  // Portal garante que o modal renderiza direto no <body>,
  // escapando de qualquer container com transform/overflow que quebre o fixed.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title || successTitle}
        onClick={(e) => e.stopPropagation()}
      >
        {isSuccessModal ? (
          <div>
            <div className="modal-icon-circle-lg">
              <Check size={36} strokeWidth={3} />
            </div>
            <h3 className="modal-title-lg">{successTitle}</h3>
            <Button
              variant="primary"
              size="lg"
              style={{ width: '100%' }}
              onClick={onClose}
            >
              {successButtonText}
            </Button>
          </div>
        ) : (
          <div>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              {title && <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{title}</h3>}
              <button
                type="button"
                className="modal-close"
                aria-label="Fechar janela"
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>
            <div>{children}</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;

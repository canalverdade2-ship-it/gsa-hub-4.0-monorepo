import React, { useState } from 'react';
import { Modal } from '../ui/Modal';

export function ClientCancelPromoModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  promoTitle 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (motivo: string) => void;
  promoTitle: string;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancelar Promoção">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Você tem certeza que deseja cancelar a promoção <strong>{promoTitle}</strong>?
        </p>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Informe o motivo do cancelamento..."
          className="w-full rounded-xl border border-neutral-200 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          rows={4}
          required
        />
        <div className="flex gap-2">
          <button 
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-100 py-3 font-bold text-neutral-700 hover:bg-neutral-200 transition-all"
          >
            Voltar
          </button>
          <button 
            onClick={() => {
              if (motivo.trim()) {
                onConfirm(motivo);
                setMotivo('');
              }
            }}
            disabled={!motivo.trim()}
            className="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 transition-all disabled:opacity-50"
          >
            Confirmar Cancelamento
          </button>
        </div>
      </div>
    </Modal>
  );
}

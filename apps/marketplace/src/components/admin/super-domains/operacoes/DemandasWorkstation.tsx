import React from 'react';
import { DemandasColaboradorModule } from '../../DemandasColaboradorModule';

interface DemandasWorkstationProps {
  colaboradorId?: string;
  colaboradorNome?: string;
  adminType?: 'admin' | 'colaborador' | string;
  initialItemId?: string;
  initialTab?: string;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

export function DemandasWorkstation({
  colaboradorId,
  colaboradorNome,
  adminType,
  initialItemId,
  initialTab,
  onNavigate
}: DemandasWorkstationProps) {
  return (
    <div className="w-full space-y-4">
      <DemandasColaboradorModule
        colaboradorId={colaboradorId}
        colaboradorNome={colaboradorNome}
        adminType={adminType as any}
        initialItemId={initialItemId}
        initialTab={initialTab}
      />
    </div>
  );
}

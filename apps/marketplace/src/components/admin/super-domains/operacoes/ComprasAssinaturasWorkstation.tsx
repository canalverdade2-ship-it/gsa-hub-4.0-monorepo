import React, { useState } from 'react';
import { ShoppingBag, Zap } from 'lucide-react';
import { OrdensCompraModule } from '../../OrdensCompraModule';
import { OrdensAssinaturaModule } from '../../OrdensAssinaturaModule';
import clsx from 'clsx';

interface ComprasAssinaturasWorkstationProps {
  activeSubTab?: string;
  initialItemId?: string;
  colaboradorNome?: string;
  onNavigate?: (module: string, tab?: string, itemId?: string) => void;
}

export function ComprasAssinaturasWorkstation({
  activeSubTab,
  initialItemId,
  colaboradorNome,
  onNavigate
}: ComprasAssinaturasWorkstationProps) {
  const [activeFulfillmentTab, setActiveFulfillmentTab] = useState<'compras' | 'assinaturas'>(
    activeSubTab === 'assinaturas' ? 'assinaturas' : 'compras'
  );

  return (
    <div className="w-full space-y-4">
      {/* Subtab selector */}
      <div className="flex items-center gap-2 bg-slate-200/60 p-1 rounded-xl w-fit border border-slate-200">
        <button
          onClick={() => setActiveFulfillmentTab('compras')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5',
            activeFulfillmentTab === 'compras'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <ShoppingBag className="h-3.5 w-3.5 text-indigo-600" />
          <span>Ordens de Compra (Produtos)</span>
        </button>

        <button
          onClick={() => setActiveFulfillmentTab('assinaturas')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5',
            activeFulfillmentTab === 'assinaturas'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Zap className="h-3.5 w-3.5 text-amber-600" />
          <span>Ordens de Assinatura (Planos SaaS)</span>
        </button>
      </div>

      {/* Content View */}
      {activeFulfillmentTab === 'compras' ? (
        <OrdensCompraModule
          activeSubTab={(activeSubTab as any) || 'processamento'}
          initialItemId={initialItemId}
          colaboradorNome={colaboradorNome}
          onNavigate={onNavigate}
        />
      ) : (
        <OrdensAssinaturaModule
          activeSubTab={(activeSubTab as any) || 'processamento'}
          initialItemId={initialItemId}
          colaboradorNome={colaboradorNome}
        />
      )}
    </div>
  );
}

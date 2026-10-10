import React, { useState } from 'react';
import { Package, Briefcase, PackagePlus, Zap, Tags } from 'lucide-react';
import { ProdutosModule } from '../../ProdutosModule';
import { ServicosModule } from '../../ServicosModule';
import { ServicePackagesModule } from '../../ServicePackagesModule';
import { AssinaturasModule } from '../../AssinaturasModule';
import { LojaCategoriasModule } from '../../LojaCategoriasModule';
import clsx from 'clsx';

interface CatalogoSubDomainProps {
  activeSubTab?: string;
  initialItemId?: string;
  adminType?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
}

export function CatalogoSubDomain({
  activeSubTab,
  initialItemId,
  adminType,
  colaboradorId,
  colaboradorNome
}: CatalogoSubDomainProps) {
  const [activeCatalogTab, setActiveCatalogTab] = useState<'produtos' | 'servicos' | 'pacotes' | 'assinaturas' | 'categorias'>(
    (activeSubTab as any) || 'produtos'
  );

  return (
    <div className="w-full space-y-4">
      {/* Subtab Selector */}
      <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl w-fit border border-slate-200 overflow-x-auto max-w-full custom-scrollbar">
        <button
          onClick={() => setActiveCatalogTab('produtos')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeCatalogTab === 'produtos'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Package className="h-3.5 w-3.5 text-indigo-600" />
          <span>Produtos da Loja</span>
        </button>

        <button
          onClick={() => setActiveCatalogTab('servicos')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeCatalogTab === 'servicos'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Briefcase className="h-3.5 w-3.5 text-blue-600" />
          <span>Serviços</span>
        </button>

        <button
          onClick={() => setActiveCatalogTab('pacotes')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeCatalogTab === 'pacotes'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <PackagePlus className="h-3.5 w-3.5 text-emerald-600" />
          <span>Pacotes & Combos</span>
        </button>

        <button
          onClick={() => setActiveCatalogTab('assinaturas')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeCatalogTab === 'assinaturas'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Zap className="h-3.5 w-3.5 text-amber-600" />
          <span>Assinaturas</span>
        </button>

        <button
          onClick={() => setActiveCatalogTab('categorias')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeCatalogTab === 'categorias'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Tags className="h-3.5 w-3.5 text-purple-600" />
          <span>Categorias</span>
        </button>
      </div>

      {/* Catalog Sub-views */}
      {activeCatalogTab === 'produtos' && (
        <ProdutosModule
          initialItemId={initialItemId}
          adminType={adminType}
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
        />
      )}

      {activeCatalogTab === 'servicos' && (
        <ServicosModule
          initialItemId={initialItemId}
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
        />
      )}

      {activeCatalogTab === 'pacotes' && (
        <ServicePackagesModule
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
        />
      )}

      {activeCatalogTab === 'assinaturas' && (
        <AssinaturasModule
          initialItemId={initialItemId}
          colaboradorId={colaboradorId}
          colaboradorNome={colaboradorNome}
        />
      )}

      {activeCatalogTab === 'categorias' && (
        <LojaCategoriasModule />
      )}
    </div>
  );
}

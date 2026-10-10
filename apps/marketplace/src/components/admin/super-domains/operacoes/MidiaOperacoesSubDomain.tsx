import React, { useState } from 'react';
import { Tv2, Tags, Radio } from 'lucide-react';
import { ClassifiedsModule } from '../../ClassifiedsModule';
import { SiteCampaignAdminPage } from '../../SiteCampaignAdminPage';
import { GsaTvModule } from '../../GsaTvModule';
import clsx from 'clsx';

interface MidiaOperacoesSubDomainProps {
  activeSubTab?: string;
  initialItemId?: string;
  adminType?: string;
  colaboradorNome?: string;
}

export function MidiaOperacoesSubDomain({
  activeSubTab,
  initialItemId,
  adminType,
  colaboradorNome
}: MidiaOperacoesSubDomainProps) {
  const [activeMediaTab, setActiveMediaTab] = useState<'classificados' | 'campanhas' | 'tv'>(
    (activeSubTab as any) || 'classificados'
  );

  return (
    <div className="w-full space-y-4">
      {/* Subtab Selector */}
      <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl w-fit border border-slate-200 overflow-x-auto max-w-full custom-scrollbar">
        <button
          onClick={() => setActiveMediaTab('classificados')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeMediaTab === 'classificados'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Tags className="h-3.5 w-3.5 text-indigo-600" />
          <span>Classificados GSA</span>
        </button>


        <button
          onClick={() => setActiveMediaTab('campanhas')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeMediaTab === 'campanhas'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Radio className="h-3.5 w-3.5 text-emerald-600" />
          <span>Campanhas & Avisos do Site</span>
        </button>

        <button
          onClick={() => setActiveMediaTab('tv')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap',
            activeMediaTab === 'tv'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Tv2 className="h-3.5 w-3.5 text-purple-600" />
          <span>GSA TV (Streaming)</span>
        </button>
      </div>

      {/* Media Sub-views */}
      {activeMediaTab === 'classificados' && (
        <ClassifiedsModule
          initialItemId={initialItemId}
        />
      )}


      {activeMediaTab === 'campanhas' && (
        <SiteCampaignAdminPage />
      )}

      {activeMediaTab === 'tv' && (
        <GsaTvModule
          adminType={adminType as any}
          colaboradorNome={colaboradorNome}
        />
      )}
    </div>
  );
}

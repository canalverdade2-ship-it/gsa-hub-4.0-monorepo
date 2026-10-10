import React, { useState } from 'react';
import { Bot, ShoppingCart } from 'lucide-react';
import { ScrapingAdminModule } from '../../ScrapingAdminModule';
import { ShopeeOperationsModule } from '../../ShopeeOperationsModule';
import clsx from 'clsx';

interface AutomacaoOperacoesSubDomainProps {
  activeSubTab?: string;
}

export function AutomacaoOperacoesSubDomain({
  activeSubTab
}: AutomacaoOperacoesSubDomainProps) {
  const [activeAutoTab, setActiveAutoTab] = useState<'shopee' | 'scraping'>(
    activeSubTab === 'scraping' ? 'scraping' : 'shopee'
  );

  return (
    <div className="w-full space-y-4">
      {/* Subtab Selector */}
      <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl w-fit border border-slate-200">
        <button
          onClick={() => setActiveAutoTab('shopee')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5',
            activeAutoTab === 'shopee'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <ShoppingCart className="h-3.5 w-3.5 text-orange-600" />
          <span>Fulfillment Shopee (Robôs)</span>
        </button>

        <button
          onClick={() => setActiveAutoTab('scraping')}
          className={clsx(
            'px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5',
            activeAutoTab === 'scraping'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <Bot className="h-3.5 w-3.5 text-indigo-600" />
          <span>Web Scraping & Crawlers</span>
        </button>
      </div>

      {/* Content View */}
      {activeAutoTab === 'shopee' ? (
        <ShopeeOperationsModule />
      ) : (
        <ScrapingAdminModule />
      )}
    </div>
  );
}

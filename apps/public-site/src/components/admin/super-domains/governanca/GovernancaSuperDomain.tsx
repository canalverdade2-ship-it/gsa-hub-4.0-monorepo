import React, { useState } from 'react';
import { ShieldCheck, LayoutDashboard, SlidersHorizontal, Server, BarChart3, History } from 'lucide-react';
import { GovernancaTab, GovernancaSuperDomainProps } from './types';
import { GovernancaExecutiveDashboard } from './GovernancaExecutiveDashboard';
import { GovernancaConfiguracoesView } from './GovernancaConfiguracoesView';
import { GovernancaInfraView } from './GovernancaInfraView';
import { GovernancaRelatoriosView } from './GovernancaRelatoriosView';
import { GovernancaAuditoriaView } from './GovernancaAuditoriaView';

export function GovernancaSuperDomain({
  initialTab = 'cockpit',
  onNavigate,
  adminType = 'admin',
  colaboradorId,
  colaboradorNome,
  colaboradorModulos = [],
  className,
}: GovernancaSuperDomainProps) {
  const [activeTab, setActiveTab] = useState<GovernancaTab>(initialTab);

  const tabs: Array<{
    id: GovernancaTab;
    label: string;
    description: string;
    icon: React.ElementType;
    adminOnly?: boolean;
  }> = [
    {
      id: 'cockpit',
      label: 'Cockpit Executivo',
      description: 'Telemetria e resolução rápida',
      icon: LayoutDashboard,
      adminOnly: true,
    },
    {
      id: 'configuracoes',
      label: 'Configurações Globais',
      description: 'Empresa, checkout e integrações',
      icon: SlidersHorizontal,
      adminOnly: true,
    },
    {
      id: 'infraestrutura',
      label: 'Infraestrutura & VPS',
      description: 'VPS, armazenamento local e banco',
      icon: Server,
      adminOnly: true,
    },
    {
      id: 'relatorios',
      label: 'Central de Relatórios',
      description: '15 relatórios analíticos e BI',
      icon: BarChart3,
    },
    {
      id: 'auditoria',
      label: 'Auditoria & Logs',
      description: 'Imutabilidade e sessões',
      icon: History,
      adminOnly: true,
    },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (adminType === 'admin') return true;
    return !t.adminOnly;
  });

  return (
    <div className={`space-y-6 w-full max-w-[1600px] mx-auto p-3 sm:p-5 transition-all ${className || ''}`}>
      {/* ── Super-Domain Command Header (Enterprise Light) ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Super-Domínio SD5
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Sistema Online • Oracle VPS
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                Governança, Auditoria & Configurações
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Central de controle administrativo, observabilidade de infraestrutura e relatórios.
              </p>
            </div>
          </div>

          {/* Super-Domain Navigation Badges / Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('relatorios')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Exportar BI</span>
            </button>
          </div>
        </div>

        {/* ── Navigation Tab Bar ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-3 custom-scrollbar">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm shadow-slate-900/10'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Super-Domain View ── */}
      <div className="transition-all duration-150">
        {activeTab === 'cockpit' && (
          <GovernancaExecutiveDashboard
            onNavigate={onNavigate}
            adminType={adminType}
            colaboradorId={colaboradorId}
            colaboradorNome={colaboradorNome}
          />
        )}

        {activeTab === 'configuracoes' && (
          <GovernancaConfiguracoesView />
        )}

        {activeTab === 'infraestrutura' && (
          <GovernancaInfraView />
        )}

        {activeTab === 'relatorios' && (
          <GovernancaRelatoriosView
            adminType={adminType}
            colaboradorModulos={colaboradorModulos}
          />
        )}

        {activeTab === 'auditoria' && (
          <GovernancaAuditoriaView />
        )}
      </div>
    </div>
  );
}

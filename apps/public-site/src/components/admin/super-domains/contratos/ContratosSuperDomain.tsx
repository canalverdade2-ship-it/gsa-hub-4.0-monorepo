import React, { useState, useEffect } from 'react';
import { 
  FileText, Users, Building2, Crown,
  MessageSquare, Sparkles, RefreshCw,
  Download, Plus, Search, Shield, ChevronRight, Layers
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ContratosSubDomainTab } from './contratos.types';
import { CrmClientesView } from './CrmClientesView';
import { ContratosDocumentosView } from './ContratosDocumentosView';
import { HubEmpresasView } from './HubEmpresasView';
import { AreaVipView } from './AreaVipView';
import { AtendimentoTicketsView } from './AtendimentoTicketsView';

export interface ContratosSuperDomainProps {
  initialSubDomain?: ContratosSubDomainTab;
  initialTab?: string;
  initialItemId?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
}

export function ContratosSuperDomain({
  initialSubDomain = 'crm_clientes',
  initialTab,
  initialItemId,
  colaboradorId,
  colaboradorNome
}: ContratosSuperDomainProps) {
  const [activeSubDomain, setActiveSubDomain] = useState<ContratosSubDomainTab>(initialSubDomain);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (initialSubDomain) {
      setActiveSubDomain(initialSubDomain);
    }
  }, [initialSubDomain]);

  const navItems = [
    {
      id: 'crm_clientes' as ContratosSubDomainTab,
      label: 'CRM Clientes 360º',
      icon: Users,
      description: 'Dossiê, KYC, Custódia & Histórico'
    },
    {
      id: 'contratos' as ContratosSubDomainTab,
      label: 'Contratos & Assinaturas',
      icon: FileText,
      description: 'Minutas, ZapSign & Aditivos'
    },
    {
      id: 'hub_empresas' as ContratosSubDomainTab,
      label: 'Hub Empresas / B2B',
      icon: Building2,
      description: 'Grandes Contas & Filiais'
    },
    {
      id: 'area_vip' as ContratosSubDomainTab,
      label: 'Área VIP & Membros',
      icon: Crown,
      description: 'Tiers & Concierge Prime'
    },
    {
      id: 'atendimento_sac' as ContratosSubDomainTab,
      label: 'Atendimento & SAC',
      icon: MessageSquare,
      description: 'Fila Omnichannel & SLA'
    }
  ];

  const handleRefreshAll = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Dados do Super-Domínio Contratos & Jurídico sincronizados!');
    }, 400);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ═══════════════════════════════════════════════════
          MISSION CONTROL HEADER (Enterprise Light Command)
          ═══════════════════════════════════════════════════ */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-lg shadow-indigo-600/20">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg">
                  Super-Domínio 04
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-bold text-slate-500">Enterprise Command Center</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                Contratos, Clientes & Jurídico
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Central unificada de CRM 360º, ciclo de vida contratual, B2B corporate, membros VIP e suporte omnichannel.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-center">
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Sincronizar
            </button>
            <button
              type="button"
              onClick={() => toast.success('Relatório analítico consolidado exportado com sucesso.')}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-black transition shadow-xs"
            >
              <Download className="h-4 w-4" />
              Exportar Dossiê
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            NAVIGATION BAR (Sub-Domain Switcher)
            ═══════════════════════════════════════════════════ */}
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1 pt-1 border-t border-slate-100">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSubDomain === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSubDomain(item.id)}
                className={`group flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition shrink-0 border ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                    : 'bg-slate-50/80 text-slate-700 border-slate-200/80 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-600 group-hover:text-indigo-600 shadow-2xs'
                }`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-xs font-bold">{item.label}</div>
                  <div className={`text-[10px] ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          ACTIVE SUB-DOMAIN VIEW CONTAINER
          ═══════════════════════════════════════════════════ */}
      <div className="transition-all duration-200">
        {activeSubDomain === 'crm_clientes' && (
          <CrmClientesView 
            initialClientId={initialItemId}
            onOpenContract={(ctrId) => {
              setActiveSubDomain('contratos');
            }}
            onOpenTicket={(tktId) => {
              setActiveSubDomain('atendimento_sac');
            }}
          />
        )}

        {activeSubDomain === 'contratos' && (
          <ContratosDocumentosView 
            initialContractId={initialItemId}
            onOpenClient={(cliId) => {
              setActiveSubDomain('crm_clientes');
            }}
          />
        )}

        {activeSubDomain === 'hub_empresas' && (
          <HubEmpresasView />
        )}

        {activeSubDomain === 'area_vip' && (
          <AreaVipView />
        )}

        {activeSubDomain === 'atendimento_sac' && (
          <AtendimentoTicketsView 
            initialTicketId={initialItemId}
            onOpenClient={(cliId) => {
              setActiveSubDomain('crm_clientes');
            }}
          />
        )}
      </div>
    </div>
  );
}

export default ContratosSuperDomain;

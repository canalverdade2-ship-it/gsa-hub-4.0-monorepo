import React from 'react';
import {
  Layers,
  Landmark,
  Users,
  FileCheck2,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import clsx from 'clsx';

export interface SuperDomainConfig {
  id: 'operacoes' | 'financeiro' | 'pessoas' | 'contratos' | 'governanca';
  num: string;
  name: string;
  tagline: string;
  icon: React.ElementType;
  badgeKey?: string;
  colorClass: string;
  activeBgClass: string;
  borderColor: string;
  modules: string[];
}

export const SUPER_DOMAINS: SuperDomainConfig[] = [
  {
    id: 'operacoes',
    num: 'SD1',
    name: 'Operações & Orçamentos',
    tagline: 'Orçamentos, OS, Demandas, Catálogo, Viagens & Mídia',
    icon: Layers,
    badgeKey: 'operacoes',
    colorClass: 'text-indigo-600',
    activeBgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    borderColor: 'border-indigo-500',
    modules: ['operacoes', 'demandas', 'loja', 'catalogo', 'viagens', 'classificados', 'automacoes', 'gsa-tv', 'vendas'],
  },
  {
    id: 'financeiro',
    num: 'SD2',
    name: 'Gestão Financeira & Faturamento',
    tagline: 'Faturamento, Fluxo de Caixa, Cobrança, Fiscal, Empréstimos & Rentabilidade',
    icon: Landmark,
    badgeKey: 'financeiro',
    colorClass: 'text-emerald-600',
    activeBgClass: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    borderColor: 'border-emerald-500',
    modules: ['financeiro', 'cobranca', 'fiscal', 'credito_loja', 'faturas', 'caixa'],
  },
  {
    id: 'pessoas',
    num: 'SD3',
    name: 'Pessoas & Relacionamento',
    tagline: 'Saques, Carreiras, Afiliados & Fidelidade',
    icon: Users,
    badgeKey: 'pessoas',
    colorClass: 'text-amber-600',
    activeBgClass: 'bg-amber-50 border-amber-200 text-amber-900',
    borderColor: 'border-amber-500',
    modules: ['pessoas', 'trabalhe-conosco', 'careers', 'afiliados', 'fidelidade', 'promocoes', 'saques'],
  },
  {
    id: 'contratos',
    num: 'SD4',
    name: 'Contratos, Clientes & Jurídico',
    tagline: 'CRM 360º, Contratos & Minutas, Hub PJ, VIP & Tickets',
    icon: FileCheck2,
    badgeKey: 'contratos',
    colorClass: 'text-blue-600',
    activeBgClass: 'bg-blue-50 border-blue-200 text-blue-900',
    borderColor: 'border-blue-500',
    modules: ['contratos', 'clientes', 'cadastro', 'area_vip', 'atendimento', 'hub_empresas'],
  },
  {
    id: 'governanca',
    num: 'SD5',
    name: 'Governança & Configurações',
    tagline: 'Cockpit Executivo, RBAC, Configurações Globais, Infra/VPS, Relatórios & Auditoria',
    icon: ShieldAlert,
    badgeKey: 'governanca',
    colorClass: 'text-purple-600',
    activeBgClass: 'bg-purple-50 border-purple-200 text-purple-900',
    borderColor: 'border-purple-500',
    modules: ['governanca', 'dashboard', 'acessos', 'configuracoes', 'sistema', 'relatorios', 'auditoria'],
  },
];

export interface AdminSuperDomainSwitcherProps {
  activeSuperDomain: string;
  onSelectSuperDomain: (domainId: string) => void;
  badgeCounts?: Record<string, number>;
  isAdmin?: boolean;
}

export function AdminSuperDomainSwitcher({
  activeSuperDomain,
  onSelectSuperDomain,
  badgeCounts = {},
  isAdmin = true,
}: AdminSuperDomainSwitcherProps) {
  return (
    <div className="mb-4 w-full">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-200/80">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500">
            Enterprise Light • Super-Domínios GSA OS
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-neutral-400 font-medium">
          <span>5 Super-Domínios Consolidados</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {SUPER_DOMAINS.map((domain) => {
          const isActive = activeSuperDomain === domain.id;
          const Icon = domain.icon;
          const count = domain.badgeKey ? badgeCounts[domain.badgeKey] || 0 : 0;

          return (
            <button
              key={domain.id}
              onClick={() => onSelectSuperDomain(domain.id)}
              className={clsx(
                'relative flex flex-col p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer shadow-xs',
                isActive
                  ? `${domain.activeBgClass} shadow-sm ring-1 ring-black/5`
                  : 'bg-white hover:bg-neutral-50 border-neutral-200/80 text-neutral-700 hover:border-neutral-300'
              )}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={clsx(
                      'text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-md uppercase font-mono',
                      isActive ? 'bg-black/10 text-neutral-900' : 'bg-neutral-100 text-neutral-500'
                    )}
                  >
                    {domain.num}
                  </span>
                  <Icon
                    className={clsx(
                      'h-4 w-4',
                      isActive ? domain.colorClass : 'text-neutral-400'
                    )}
                  />
                </div>
                {count > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-xs">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <p
                  className={clsx(
                    'text-xs font-bold truncate',
                    isActive ? 'text-neutral-950 font-black' : 'text-neutral-800'
                  )}
                >
                  {domain.name.split(' & ')[0]}
                </p>
                <p className="text-[10px] text-neutral-500 truncate mt-0.5 hidden xl:block">
                  {domain.tagline.split(',')[0]}
                </p>
              </div>

              {isActive && (
                <div
                  className={clsx(
                    'absolute bottom-0 left-3 right-3 h-[2px] rounded-t-full',
                    domain.borderColor.replace('border-', 'bg-')
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

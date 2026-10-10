import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings2,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  Trophy,
  Users,
  Search,
  Filter,
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { normalizeGrantedAdminModules } from '../../../../routing/adminAccess';
import { RelatorioExecutivo } from '../../relatorios/RelatorioExecutivo';
import { RelatorioFinanceiro } from '../../relatorios/RelatorioFinanceiro';
import { RelatorioClientes } from '../../relatorios/RelatorioClientes';
import { RelatorioOS } from '../../relatorios/RelatorioOS';
import { RelatorioRentabilidade } from '../../relatorios/RelatorioRentabilidade';
import { RelatorioGamificacao } from '../../relatorios/RelatorioGamificacao';
import { RelatorioSuporte } from '../../relatorios/RelatorioSuporte';
import { RelatorioMarketing } from '../../relatorios/RelatorioMarketing';
import { RelatorioFiscal } from '../../relatorios/RelatorioFiscal';
import { RelatorioOperacional } from '../../relatorios/RelatorioOperacional';
import { RelatorioCobranca } from '../../relatorios/RelatorioCobranca';
import { RelatorioLoja } from '../../relatorios/RelatorioLoja';
import { RelatorioCredito } from '../../relatorios/RelatorioCredito';

export type ReportId =
  | 'executivo'
  | 'financeiro'
  | 'rentabilidade'
  | 'clientes'
  | 'os'
  | 'gamificacao'
  | 'suporte'
  | 'marketing'
  | 'fiscal'
  | 'operacional'
  | 'cobranca'
  | 'loja'
  | 'credito';

export interface ReportDefinition {
  id: ReportId;
  label: string;
  description: string;
  category: 'Executivo' | 'Financeiro' | 'Operações' | 'Pessoas' | 'Suporte';
  icon: React.ElementType;
  requiredModules: string[];
  adminOnly?: boolean;
}

export const REPORTS: ReportDefinition[] = [
  { id: 'executivo', label: 'Executivo Consolidado', description: 'Visão macro corporativa e saúde', category: 'Executivo', icon: LayoutDashboard, requiredModules: [], adminOnly: true },
  { id: 'financeiro', label: 'Demonstrativo Financeiro', description: 'Receitas, pagamentos e fluxo', category: 'Financeiro', icon: DollarSign, requiredModules: ['financeiro'] },
  { id: 'rentabilidade', label: 'Margem & Rentabilidade', description: 'Margem real líquida por OS', category: 'Financeiro', icon: TrendingUp, requiredModules: ['financeiro'] },
  { id: 'cobranca', label: 'Cobrança & Inadimplência', description: 'Acordos, protestos e régua', category: 'Financeiro', icon: ShieldAlert, requiredModules: ['cobranca'] },
  { id: 'loja', label: 'GSA Store & Produtos', description: 'Vendas, fulfillment e estoque', category: 'Operações', icon: ShoppingCart, requiredModules: ['loja'] },
  { id: 'credito', label: 'Crédito de Loja', description: 'Limites concedidos e uso', category: 'Financeiro', icon: CreditCard, requiredModules: ['credito_loja'] },
  { id: 'clientes', label: 'Base de Clientes & CRM', description: 'Crescimento e retenção de contas', category: 'Pessoas', icon: Users, requiredModules: ['cadastro'] },
  { id: 'os', label: 'Ordens de Serviço & SLA', description: 'Execução e prazos operacionais', category: 'Operações', icon: ClipboardList, requiredModules: ['operacoes'] },
  { id: 'gamificacao', label: 'Fidelidade & Pontos', description: 'Resgates e engajamento VIP', category: 'Pessoas', icon: Trophy, requiredModules: ['fidelidade'] },
  { id: 'suporte', label: 'Atendimento & Helpdesk', description: 'Tickets, SLA e resolução', category: 'Suporte', icon: MessageSquare, requiredModules: ['atendimento'] },
  { id: 'marketing', label: 'Marketing & Campanhas', description: 'Vouchers e conversão de anúncios', category: 'Operações', icon: Megaphone, requiredModules: ['promocoes'] },
  { id: 'fiscal', label: 'Fiscal & Notas Emitidas', description: 'Documentos fiscais e impostos', category: 'Financeiro', icon: FileText, requiredModules: ['fiscal'] },
  { id: 'operacional', label: 'Auditoria Operacional', description: 'Atividade de operadores e sistema', category: 'Executivo', icon: Settings2, requiredModules: [], adminOnly: true },
];

const PERIODS = [
  ['hoje', 'Hoje'],
  ['semana', 'Semana'],
  ['mes', 'Mês'],
  ['trimestre', 'Trimestre'],
  ['semestre', 'Semestre'],
  ['ano', 'Ano'],
  ['personalizado', 'Personalizado'],
] as const;

export function GovernancaRelatoriosView({
  adminType = 'admin',
  colaboradorModulos = [],
}: {
  adminType?: string;
  colaboradorModulos?: string[];
}) {
  const granted = useMemo(() => new Set(normalizeGrantedAdminModules(colaboradorModulos)), [colaboradorModulos]);
  const [reportSearch, setReportSearch] = useState('');

  const available = useMemo(() => {
    return REPORTS.filter((report) => {
      if (adminType === 'admin') return true;
      if (report.adminOnly) return false;
      return report.requiredModules.every((module) => granted.has(module as any));
    });
  }, [adminType, granted]);

  const filteredReports = useMemo(() => {
    if (!reportSearch.trim()) return available;
    const q = reportSearch.toLowerCase().trim();
    return available.filter(
      (r) => r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
    );
  }, [available, reportSearch]);

  const [active, setActive] = useState<ReportId>(available[0]?.id || 'executivo');
  const [period, setPeriod] = useState('mes');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!available.some((report) => report.id === active)) {
      setActive(available[0]?.id || 'executivo');
    }
  }, [active, available]);

  const activeReport = available.find((report) => report.id === active);
  const reportProps = { periodo: period, dataInicio: startDate, dataFim: endDate };

  const content = (() => {
    switch (active) {
      case 'executivo':
        return <RelatorioExecutivo {...reportProps} />;
      case 'financeiro':
        return <RelatorioFinanceiro {...reportProps} />;
      case 'rentabilidade':
        return <RelatorioRentabilidade {...reportProps} />;
      case 'cobranca':
        return <RelatorioCobranca {...reportProps} />;
      case 'loja':
        return <RelatorioLoja {...reportProps} />;
      case 'credito':
        return <RelatorioCredito {...reportProps} />;
      case 'clientes':
        return <RelatorioClientes {...reportProps} />;
      case 'os':
        return <RelatorioOS {...reportProps} />;
      case 'gamificacao':
        return <RelatorioGamificacao {...reportProps} />;
      case 'suporte':
        return <RelatorioSuporte {...reportProps} />;
      case 'marketing':
        return <RelatorioMarketing {...reportProps} />;
      case 'fiscal':
        return <RelatorioFiscal {...reportProps} />;
      case 'operacional':
        return <RelatorioOperacional {...reportProps} />;
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-6 pb-12">
      {available.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-14 text-center text-slate-500">
          Nenhum relatório analítico disponível para as permissões atribuídas a este perfil.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          {/* Left: Report Selector Navigation Sidebar */}
          <aside className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col gap-3.5 h-fit">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Catálogo de Relatórios
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {available.length}
              </span>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar relatório..."
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1 max-h-[560px] overflow-y-auto custom-scrollbar pr-1">
              {filteredReports.map((report) => {
                const Icon = report.icon;
                const isSelected = active === report.id;
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setActive(report.id)}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-50/80 border border-indigo-200 text-indigo-950 shadow-2xs'
                        : 'hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    <span
                      className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <span className={`block truncate text-xs font-bold ${isSelected ? 'text-indigo-950' : 'text-slate-800'}`}>
                        {report.label}
                      </span>
                      <span className="block truncate text-[10px] text-slate-400 mt-0.5">
                        {report.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: Active Report Workspace */}
          <main className="min-w-0 space-y-5">
            {/* Filter and Period Toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {activeReport?.category || 'Relatório'}
                  </span>
                  <h2 className="text-base font-bold text-slate-900">{activeReport?.label}</h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{activeReport?.description}</p>
              </div>

              {/* Period Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="h-3.5 w-3.5 text-slate-400 mr-1 shrink-0" />
                {PERIODS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPeriod(id)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      period === id
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {period === 'personalizado' && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid gap-3 sm:grid-cols-2 animate-fade-up">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data de Fim</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* Dynamic Report Content */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
              {content}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}


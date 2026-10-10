import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
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
} from 'lucide-react';
import { normalizeGrantedAdminModules } from '../../routing/adminAccess';
import { RelatorioExecutivo } from './relatorios/RelatorioExecutivo';
import { RelatorioFinanceiro } from './relatorios/RelatorioFinanceiro';
import { RelatorioClientes } from './relatorios/RelatorioClientes';
import { RelatorioOS } from './relatorios/RelatorioOS';
import { RelatorioRentabilidade } from './relatorios/RelatorioRentabilidade';
import { RelatorioGamificacao } from './relatorios/RelatorioGamificacao';
import { RelatorioSuporte } from './relatorios/RelatorioSuporte';
import { RelatorioMarketing } from './relatorios/RelatorioMarketing';
import { RelatorioFiscal } from './relatorios/RelatorioFiscal';
import { RelatorioOperacional } from './relatorios/RelatorioOperacional';
import { RelatorioCobranca } from './relatorios/RelatorioCobranca';
import { RelatorioLoja } from './relatorios/RelatorioLoja';
import { RelatorioCredito } from './relatorios/RelatorioCredito';

type ReportId = 'executivo' | 'financeiro' | 'rentabilidade' | 'clientes' | 'os' | 'gamificacao' | 'suporte' | 'marketing' | 'fiscal' | 'operacional' | 'cobranca' | 'loja' | 'credito';

type ReportDefinition = {
  id: ReportId;
  label: string;
  description: string;
  icon: React.ElementType;
  requiredModules: string[];
  adminOnly?: boolean;
};

const REPORTS: ReportDefinition[] = [
  { id: 'executivo', label: 'Executivo', description: 'Visão consolidada', icon: LayoutDashboard, requiredModules: [], adminOnly: true },
  { id: 'financeiro', label: 'Financeiro', description: 'Receita e pagamentos', icon: DollarSign, requiredModules: ['financeiro'] },
  { id: 'rentabilidade', label: 'Rentabilidade', description: 'Margem real', icon: TrendingUp, requiredModules: ['financeiro'] },
  { id: 'cobranca', label: 'Cobrança', description: 'Inadimplência e acordos', icon: ShieldAlert, requiredModules: ['cobranca'] },
  { id: 'loja', label: 'Loja', description: 'Vendas e estoque', icon: ShoppingCart, requiredModules: ['loja'] },
  { id: 'credito', label: 'Crédito Loja', description: 'Limites e uso', icon: CreditCard, requiredModules: ['credito_loja'] },
  { id: 'clientes', label: 'Clientes', description: 'Base e crescimento', icon: Users, requiredModules: ['cadastro'] },
  { id: 'os', label: 'OS & Orçamentos', description: 'Operações e SLA', icon: ClipboardList, requiredModules: ['operacoes'] },
  { id: 'gamificacao', label: 'Gamificação', description: 'Pontos e níveis', icon: Trophy, requiredModules: ['fidelidade'] },
  { id: 'suporte', label: 'Atendimento', description: 'Tickets e SLA', icon: MessageSquare, requiredModules: ['atendimento'] },
  { id: 'marketing', label: 'Promoções', description: 'Vouchers e campanhas', icon: Megaphone, requiredModules: ['promocoes'] },
  { id: 'fiscal', label: 'Fiscal', description: 'Notas e emissões', icon: FileText, requiredModules: ['fiscal'] },
  { id: 'operacional', label: 'Operacional', description: 'Colaboradores e sistema', icon: Settings2, requiredModules: [], adminOnly: true },
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

export function RelatoriosModule({ adminType, colaboradorModulos = [] }: { adminType?: string; colaboradorModulos?: string[] }) {
  const granted = useMemo(() => new Set(normalizeGrantedAdminModules(colaboradorModulos)), [colaboradorModulos]);
  const available = useMemo(() => REPORTS.filter((report) => {
    if (adminType === 'admin') return true;
    if (report.adminOnly) return false;
    return report.requiredModules.every((module) => granted.has(module as any));
  }), [adminType, granted]);

  const [active, setActive] = useState<ReportId>(available[0]?.id || 'clientes');
  const [period, setPeriod] = useState('mes');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!available.some((report) => report.id === active)) setActive(available[0]?.id || 'clientes');
  }, [active, available]);

  const activeReport = available.find((report) => report.id === active);
  const props = { periodo: period, dataInicio: startDate, dataFim: endDate };

  const content = (() => {
    switch (active) {
      case 'executivo': return <RelatorioExecutivo {...props} />;
      case 'financeiro': return <RelatorioFinanceiro {...props} />;
      case 'rentabilidade': return <RelatorioRentabilidade {...props} />;
      case 'cobranca': return <RelatorioCobranca {...props} />;
      case 'loja': return <RelatorioLoja {...props} />;
      case 'credito': return <RelatorioCredito {...props} />;
      case 'clientes': return <RelatorioClientes {...props} />;
      case 'os': return <RelatorioOS {...props} />;
      case 'gamificacao': return <RelatorioGamificacao {...props} />;
      case 'suporte': return <RelatorioSuporte {...props} />;
      case 'marketing': return <RelatorioMarketing {...props} />;
      case 'fiscal': return <RelatorioFiscal {...props} />;
      case 'operacional': return <RelatorioOperacional {...props} />;
      default: return null;
    }
  })();

  return <div className="space-y-6 pb-10">
    <header className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Dados limitados por RLS</p>
      <h1 className="mt-2 flex items-center gap-3 text-2xl font-black"><BarChart3 className="h-6 w-6 text-indigo-400" /> Centro de Relatórios</h1>
      <p className="mt-2 text-sm text-white/55">Cada relatório exige o módulo de origem dos dados. A permissão “Relatórios” não concede acesso indireto a áreas financeiras ou pessoais.</p>
    </header>

    {available.length === 0 ? <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-14 text-center text-neutral-500">Nenhum relatório disponível para as permissões desta sessão.</div> : <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <aside className="h-fit rounded-2xl bg-neutral-950 p-3 text-white shadow-xl">
        <div className="space-y-1">{available.map((report) => { const Icon = report.icon; return <button key={report.id} type="button" onClick={() => setActive(report.id)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${active === report.id ? 'bg-white text-neutral-900' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}><Icon className="h-5 w-5 shrink-0" /><span className="min-w-0"><span className="block truncate text-sm font-black">{report.label}</span><span className={`block truncate text-[10px] ${active === report.id ? 'text-neutral-400' : 'text-white/30'}`}>{report.description}</span></span></button>; })}</div>
      </aside>

      <main className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Visualizando</p><h2 className="mt-1 text-xl font-black">{activeReport?.label}</h2></div><div className="flex flex-wrap gap-2"><Calendar className="mt-2.5 h-4 w-4 text-neutral-400" />{PERIODS.map(([id, label]) => <button key={id} type="button" onClick={() => setPeriod(id)} className={`rounded-xl px-3 py-2 text-xs font-black ${period === id ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{label}</button>)}</div></div>
          {period === 'personalizado' && <div className="mt-4 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-2"><label className="text-xs font-black uppercase text-neutral-500">De<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm normal-case" /></label><label className="text-xs font-black uppercase text-neutral-500">Até<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm normal-case" /></label></div>}
        </section>
        {content}
      </main>
    </div>}
  </div>;
}

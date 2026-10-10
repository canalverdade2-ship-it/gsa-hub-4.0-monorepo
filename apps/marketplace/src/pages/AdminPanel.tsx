import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  Briefcase,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  Gavel,
  Gift,
  Handshake,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  MessageSquare,
  Plane,
  Receipt,
  Search,
  Plus,
  ChevronDown,
  Server,
  Settings,
  Share2,
  ShieldAlert,
  Store,
  Tags,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAppLocation } from '../routing/useAppLocation';
import { navigate } from '../routing/navigationService';
import { DashboardLayout } from '../components/ui/DashboardLayout';
import { UniversalNotificationBell } from '../components/ui/UniversalNotificationBell';
import { LogoGSA } from '../components/ui/LogoGSA';
import { useAdminNotifications } from '../hooks/useAdminNotifications';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SystemStatusIndicator } from '../components/admin/SystemStatusIndicator';
import { AdminCommandPalette } from '../components/admin/ui/AdminCommandPalette';
import {
  adminPathFor,
  hasAdminModuleAccess,
  normalizeAdminModule,
  normalizeCollaboratorModules,
} from '../security/collaboratorAccess';

import { lazyWithRetry } from '../lib/lazyWithRetry';
import '../styles/admin-panel-refresh.css';

const Dashboard = lazyWithRetry(() => import('../components/admin/Dashboard'), 'Dashboard');
const CollaboratorDashboard = lazyWithRetry(() => import('../components/admin/CollaboratorDashboard'), 'CollaboratorDashboard');
const CadastroModule = lazyWithRetry(() => import('../components/admin/CadastroModule'), 'CadastroModule');
const VendasModule = lazyWithRetry(() => import('../components/admin/VendasModule'), 'VendasModule');
const ScrapingAdminModule = lazy(() => import('../components/admin/ScrapingAdminModule').then((m) => ({ default: m.ScrapingAdminModule })));
const FinanceiroSuperDomain = lazy(() => import('../components/admin/super-domains/financeiro/FinanceiroSuperDomain').then((m) => ({ default: m.FinanceiroSuperDomain })));
const AffiliateAdminModule = lazyWithRetry(() => import('../components/admin/AffiliateAdminModule'), 'AffiliateAdminModule');
const TicketsModule = lazyWithRetry(() => import('../components/admin/TicketsModule'), 'TicketsModule');
const RelatoriosModule = lazyWithRetry(() => import('../components/admin/RelatoriosModule'), 'RelatoriosModule');
const ConfiguracoesModule = lazyWithRetry(() => import('../components/admin/ConfiguracoesModule'), 'ConfiguracoesModule');
const AreaVIPModule = lazyWithRetry(() => import('../components/admin/AreaVIPModule'), 'AreaVIPModule');
const AcessosModule = lazyWithRetry(() => import('../components/admin/AcessosModule'), 'AcessosModule');
const DemandasColaboradorModule = lazyWithRetry(() => import('../components/admin/DemandasColaboradorModule'), 'DemandasColaboradorModule');
const SystemMonitorModule = lazyWithRetry(() => import('../components/admin/SystemMonitorModule'), 'SystemMonitorModule');
const FiscalModule = lazyWithRetry(() => import('../components/admin/FiscalModule'), 'FiscalModule');
const CobrancaModule = lazyWithRetry(() => import('../components/admin/CobrancaModule'), 'CobrancaModule');
const PromocaoQuantidadeModule = lazyWithRetry(() => import('../components/admin/PromocaoQuantidadeModule'), 'PromocaoQuantidadeModule');
const ClassifiedsModule = lazyWithRetry(() => import('../components/admin/ClassifiedsModule'), 'ClassifiedsModule');
const TravelAdminModule = lazyWithRetry(() => import('../components/admin/TravelAdminModule'), 'TravelAdminModule');
const ProtectionAdminModule = lazyWithRetry(() => import('../components/admin/ProtectionAdminModule'), 'ProtectionAdminModule');
const PartnersAdminModule = lazyWithRetry(() => import('../components/admin/PartnersAdminModule'), 'PartnersAdminModule');
const AdvertisingAdminModule = lazyWithRetry(() => import('../components/admin/AdvertisingAdminModule'), 'AdvertisingAdminModule');
const FornecedoresModule = lazyWithRetry(() => import('../components/admin/FornecedoresModule'), 'FornecedoresModule');
const CareersAdminModule = lazyWithRetry(() => import('../components/admin/CareersAdminModule'), 'CareersAdminModule');
const SiteCampaignAdminPage = lazyWithRetry(() => import('../components/admin/SiteCampaignAdminPage'), 'SiteCampaignAdminPage');
const GsaTvModule = lazy(() => import('../components/admin/GsaTvModule').then((m) => ({ default: m.GsaTvModule })));

function ModuleLoadingState() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-semibold text-neutral-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-indigo-600" aria-hidden="true" />
        Carregando módulo…
      </div>
    </div>
  );
}

interface AdminPanelProps {
  onLogout: () => void;
  adminType: 'admin' | 'colaborador';
  colaboradorId?: string;
  colaboradorNomeInicial?: string;
  colaboradorModulos: string[];
  isGsaTv?: boolean;
}

type MenuItem = { id: string; label: string; icon: typeof LayoutDashboard };
type MenuGroup = { label: string; items: MenuItem[] };

const MENU_GROUPS: MenuGroup[] = [
  { label: 'Principal', items: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cadastro', label: 'Cadastros', icon: Users },
    { id: 'fornecedores', label: 'Fornecedores', icon: Truck },
    { id: 'operacoes', label: 'Operações', icon: ClipboardList },
    { id: 'demandas', label: 'Minhas Demandas', icon: ClipboardList },
    { id: 'loja', label: 'Loja GSA Store', icon: Store },
    { id: 'classificados', label: 'Classificados GSA', icon: Tags },
    { id: 'anuncios', label: 'GSA Anúncios', icon: Megaphone },
    { id: 'viagens', label: 'Viagens GSA', icon: Plane },
    { id: 'afiliados', label: 'GSA Afiliados', icon: Share2 },
    { id: 'saude', label: 'GSA Saúde', icon: HeartPulse },
    { id: 'seguros', label: 'GSA Seguros', icon: ShieldAlert },
  ]},
  { label: 'Financeiro', items: [
    { id: 'financeiro', label: 'Financeiro', icon: Landmark },
    { id: 'cobranca', label: 'Cobrança', icon: Gavel },
    { id: 'fiscal', label: 'Fiscal', icon: Receipt },
    { id: 'credito_loja', label: 'Crédito da Loja', icon: CreditCard },
  ]},
  { label: 'Relacionamento', items: [
    { id: 'parceiros', label: 'Parceiros', icon: Handshake },
    { id: 'trabalhe-conosco', label: 'Trabalhe Conosco', icon: Briefcase },
    { id: 'fidelidade', label: 'Fidelidade', icon: Gift },
    { id: 'promocoes', label: 'Promoções', icon: Gift },
    { id: 'area_vip', label: 'Área VIP', icon: Gift },
    { id: 'atendimento', label: 'Atendimento', icon: MessageSquare },
  ]},
  { label: 'Comunicação', items: [
    { id: 'avisos-campanhas', label: 'Avisos e Campanhas', icon: BellRing },
  ]},
  { label: 'Gestão', items: [
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ]},
  { label: 'Acesso', items: [{ id: 'acessos', label: 'Gerenciar Acessos', icon: ShieldAlert }] },
  { label: 'Infraestrutura', items: [{ id: 'sistema', label: 'Saúde do Sistema', icon: Server }, { id: 'automacoes', label: 'Automações', icon: Server }] },
];

type NavArea = { id: string; label: string; icon: typeof LayoutDashboard; items: MenuItem[] };

const NAV_AREAS: NavArea[] = [
  { id: 'trabalho', label: 'Trabalho', icon: ClipboardList, items: [
    { id: 'cadastro', label: 'Clientes e Cadastros', icon: Users },
    { id: 'fornecedores', label: 'Fornecedores', icon: Truck },
    { id: 'operacoes', label: 'Orçamentos e OS', icon: ClipboardList },
    { id: 'demandas', label: 'Demandas', icon: ClipboardList },
  ]},
  { id: 'comercial', label: 'Comercial', icon: Store, items: [
    { id: 'loja', label: 'GSA Store', icon: Store },
    { id: 'classificados', label: 'Classificados', icon: Tags },
    { id: 'anuncios', label: 'GSA Anúncios', icon: Megaphone },
    { id: 'viagens', label: 'Viagens', icon: Plane },
    { id: 'afiliados', label: 'Afiliados', icon: Share2 },
    { id: 'saude', label: 'GSA Saúde', icon: HeartPulse },
    { id: 'seguros', label: 'GSA Seguros', icon: ShieldAlert },
  ]},
  { id: 'financeiro', label: 'Financeiro', icon: Landmark, items: [
    { id: 'financeiro', label: 'Visão Financeira', icon: Landmark },
    { id: 'cobranca', label: 'Cobrança', icon: Gavel },
    { id: 'fiscal', label: 'Fiscal', icon: Receipt },
    { id: 'credito_loja', label: 'Crédito da Loja', icon: CreditCard },
  ]},
  { id: 'relacionamento', label: 'Relacionamento', icon: Handshake, items: [
    { id: 'atendimento', label: 'Atendimento', icon: MessageSquare },
    { id: 'parceiros', label: 'Parceiros', icon: Handshake },
    { id: 'fidelidade', label: 'Fidelidade', icon: Gift },
    { id: 'promocoes', label: 'Promoções', icon: Gift },
    { id: 'area_vip', label: 'Área VIP', icon: Gift },
    { id: 'avisos-campanhas', label: 'Comunicação', icon: BellRing },
    { id: 'trabalhe-conosco', label: 'Trabalhe Conosco', icon: Briefcase },
  ]},
  { id: 'gestao', label: 'Gestão', icon: Settings, items: [
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { id: 'acessos', label: 'Acessos', icon: ShieldAlert },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
    { id: 'sistema', label: 'Sistema', icon: Server },
    { id: 'automacoes', label: 'Automações', icon: Server },
    { id: 'gsa-tv', label: 'GSA TV', icon: LayoutDashboard },
  ]},
];

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="hidden md:flex h-9 px-3.5 items-center justify-center gap-2 rounded-xl bg-white shadow-sm ring-1 ring-black/5 text-sm font-bold text-neutral-700 tabular-nums"><Clock className="h-4 w-4 text-neutral-400" />{time.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</div>;
}

export function AdminPanel({ onLogout, adminType, colaboradorId, colaboradorNomeInicial, colaboradorModulos, isGsaTv }: AdminPanelProps) {
  const route = useAppLocation();
  const { pendencies, notifications, unreadNotifications, markAsRead, markAllAsRead, deleteAllNotifications } = useAdminNotifications();
  const activeModule = route.module || 'dashboard';
  const activeTab = route.submodule;
  const activeItemId = route.itemId;
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try { return localStorage.getItem('admin_sidebar_open') !== 'false'; } catch { return true; }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [colaboradorNome, setColaboradorNome] = useState<string | null>(colaboradorNomeInicial || null);
  const [internalModulos, setInternalModulos] = useState(() => normalizeCollaboratorModules(colaboradorModulos));
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [expandedArea, setExpandedArea] = useState('trabalho');

  useEffect(() => setInternalModulos(normalizeCollaboratorModules(colaboradorModulos)), [colaboradorModulos]);

  useEffect(() => {
    try { localStorage.setItem('admin_sidebar_open', String(isSidebarOpen)); } catch { /* ignore */ }
  }, [isSidebarOpen]);
  useEffect(() => { if (colaboradorNomeInicial) setColaboradorNome(colaboradorNomeInicial); }, [colaboradorNomeInicial]);
  useEffect(() => {
    const resize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const container = document.getElementById('main-scroll-container');
    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeModule, activeTab, activeItemId]);
  useEffect(() => {
    let isMounted = true;
    if (adminType !== 'colaborador' || !colaboradorId || colaboradorNomeInicial) return;
    supabase.from('colaboradores').select('nome').eq('id', colaboradorId).single().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) console.error("Erro ao buscar nome colaborador:", error);
      else if (data) setColaboradorNome(data.nome);
    });
    return () => { isMounted = false; };
  }, [adminType, colaboradorId, colaboradorNomeInicial]);

  const canAccess = (module: string, tab?: string) => hasAdminModuleAccess(module, adminType, internalModulos, tab);
  const go = (module: string, tab?: string, itemId?: string) => {
    const normalized = normalizeAdminModule(module);
    const providerOnly = normalized === 'cadastro' && !canAccess('cadastro') && canAccess('prestadores');
    const targetModule = providerOnly ? 'prestadores' : module;
    const targetNormalized = normalizeAdminModule(targetModule);
    if (!canAccess(targetNormalized, tab)) {
      toast.error('Você não possui permissão para acessar este módulo.');
      return;
    }
    navigate(adminPathFor(targetModule, tab, itemId));
    setIsMobileMenuOpen(false);
  };

  const visibleAreas = useMemo(() => {
    if (isGsaTv) return [{ id: 'gsa-tv', label: 'GSA TV', icon: LayoutDashboard, items: [{ id: 'gsa-tv', label: 'GSA TV', icon: LayoutDashboard }] }];
    return NAV_AREAS.map((area) => ({
      ...area,
      items: area.items.filter((item) => item.id === 'cadastro' ? canAccess('cadastro') || canAccess('prestadores') : canAccess(item.id)),
    })).filter((area) => area.items.length > 0);
  }, [adminType, internalModulos, isGsaTv]);
  const allItems = MENU_GROUPS.flatMap((group) => group.items);
  const normalizedActive = normalizeAdminModule(activeModule);
  const activeAreaId = normalizedActive === 'dashboard' ? 'inicio' : (NAV_AREAS.find((area) => area.items.some((item) => normalizeAdminModule(item.id) === normalizedActive))?.id || 'trabalho');

  useEffect(() => {
    if (!isGsaTv && activeAreaId !== 'inicio') setExpandedArea(activeAreaId);
  }, [activeAreaId, isGsaTv]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (isGsaTv && normalizedActive !== 'gsa-tv') {
      navigate('/admin/gsa-tv');
    }
  }, [isGsaTv, normalizedActive]);

  const activeLabel = normalizedActive === 'dashboard' ? 'Início' : (allItems.find((item) => item.id === normalizedActive)?.label || 'GSA HUB');
  const sidebarOpen = isMobileMenuOpen || (!isMobile && isSidebarOpen);

  const badge = (id: string) => {
    if (id === 'cadastro') return pendencies.moduleCadastro;
    if (id === 'operacoes' || id === 'loja') return pendencies.moduleVendas;
    if (id === 'demandas') return pendencies.moduleDemandas;
    if (id === 'financeiro') return pendencies.moduleFinanceiro;
    if (id === 'cobranca') return pendencies.moduleCobranca;
    if (id === 'fiscal') return pendencies.moduleFiscal;
    if (id === 'atendimento') return pendencies.moduleSuporte;
    if (id === 'acessos') return pendencies.moduleAcessos;
    return 0;
  };

  const commonNavigate = (module: string, tab?: string, itemId?: string) => go(module, tab, itemId);
  const cadastroTabs = adminType === 'admin' || internalModulos.includes('cadastro') ? ['clientes', 'prestadores'] : ['prestadores'];
  const quickCreateActions = [
    (canAccess('cadastro') || canAccess('prestadores')) && { label: 'Novo cliente', module: 'cadastro', tab: 'clientes' },
    canAccess('operacoes') && { label: 'Novo orçamento', module: 'operacoes', tab: 'orcamentos' },
    canAccess('demandas') && { label: 'Nova demanda', module: 'demandas' },
    canAccess('atendimento') && { label: 'Novo ticket', module: 'atendimento' },
    canAccess('fornecedores') && { label: 'Novo pedido de compra', module: 'fornecedores', tab: 'pedidos' },
  ].filter(Boolean) as Array<{ label: string; module: string; tab?: string }>;

  return (
    <>
    <DashboardLayout
      theme="admin"
      isMobileMenuOpen={isMobileMenuOpen}
      setIsMobileMenuOpen={setIsMobileMenuOpen}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      headerTitle={<nav className="flex items-center gap-1.5 text-sm"><span className="hidden sm:block font-semibold text-neutral-300">GSA</span><ChevronRight className="hidden sm:block h-3.5 w-3.5 text-neutral-300" /><span className="font-bold text-neutral-800">{activeLabel}</span></nav>}
      headerContent={<><button type="button" onClick={() => setCommandOpen(true)} className="hidden lg:flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700"><Search className="h-4 w-4" /><span>Buscar</span><kbd className="ml-2 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-black text-neutral-400">Ctrl K</kbd></button><div className="relative"><button type="button" onClick={() => setQuickCreateOpen((value) => !value)} className="hidden sm:flex h-10 items-center gap-2 rounded-xl bg-neutral-950 px-3.5 text-sm font-black text-white shadow-sm hover:bg-neutral-800"><Plus className="h-4 w-4" /> Novo</button>{quickCreateOpen && <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl">{quickCreateActions.map((action) => <button key={action.label} type="button" onClick={() => { go(action.module, action.tab); setQuickCreateOpen(false); }} className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-bold text-neutral-700 hover:bg-neutral-100">{action.label}</button>)}</div>}</div><div className="hidden md:flex items-center mr-2"><SystemStatusIndicator /></div><LiveClock /><UniversalNotificationBell variant="admin" notifications={notifications} unreadCount={unreadNotifications} onMarkAsRead={markAsRead} onMarkAllAsRead={markAllAsRead} onDeleteAll={deleteAllNotifications} onNavigate={commonNavigate} /><div className="h-10 w-10 rounded-xl bg-neutral-950 flex items-center justify-center shadow-lg"><span className="text-xs font-black text-white">{adminType === 'admin' ? 'AD' : 'CO'}</span></div></>}
      sidebarContent={<>
        <div className="flex h-[72px] items-center justify-between px-4 shrink-0 border-b border-white/5"><AnimatePresence mode="wait">{sidebarOpen ? <motion.div key="open" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} className="flex items-center gap-3 min-w-0"><LogoGSA size="sm" variant="light" /><div className="min-w-0"><span className="block truncate text-sm font-black text-white">Grupo GSA</span><span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">Gestão de Serviços</span></div></motion.div> : <motion.div key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto"><LogoGSA size="sm" variant="light" /></motion.div>}</AnimatePresence>{!isMobile ? <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="rounded-lg p-1.5 text-white/30 hover:bg-white/5 hover:text-white/60">{isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button> : <button onClick={() => setIsMobileMenuOpen(false)} className="rounded-lg p-1.5 text-white/30"><X className="h-4 w-4" /></button>}</div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3">
          {!isGsaTv && <div className="mb-2 space-y-1">
            <button type="button" onClick={() => go('dashboard')} title={!sidebarOpen ? 'Início' : undefined} className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition ${normalizedActive === 'dashboard' ? 'bg-white text-neutral-900 shadow-lg' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
              <LayoutDashboard className={`h-[18px] w-[18px] shrink-0 ${normalizedActive === 'dashboard' ? 'text-indigo-600' : ''}`} />
              {sidebarOpen && <span className="flex-1 text-left text-sm font-bold">Início</span>}
            </button>
            <button type="button" onClick={() => setCommandOpen(true)} title={!sidebarOpen ? 'Buscar' : undefined} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-white/45 transition hover:bg-white/5 hover:text-white">
              <Search className="h-[18px] w-[18px] shrink-0" />
              {sidebarOpen && <><span className="flex-1 text-left text-sm font-semibold">Buscar</span><span className="text-[9px] font-black text-white/25">CTRL K</span></>}
            </button>
          </div>}
          <div className="space-y-1">
            {visibleAreas.map((area) => {
              const AreaIcon = area.icon;
              const isAreaActive = activeAreaId === area.id;
              const isExpanded = isGsaTv || expandedArea === area.id;
              const areaCount = area.items.reduce((total, item) => total + badge(item.id), 0);
              return <div key={area.id}>
                <button type="button" onClick={() => { if (!sidebarOpen && !isMobile) setIsSidebarOpen(true); setExpandedArea(area.id); }} title={!sidebarOpen ? area.label : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition ${isAreaActive ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
                  <AreaIcon className={`h-[18px] w-[18px] shrink-0 ${isAreaActive ? 'text-indigo-300' : ''}`} />
                  {sidebarOpen && <><span className="flex-1 truncate text-left text-sm font-bold">{area.label}</span>{areaCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">{areaCount > 99 ? '99+' : areaCount}</span>}<ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? 'rotate-180' : ''}`} /></>}
                </button>
                {sidebarOpen && isExpanded && <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-2">{area.items.map((item) => { const count = badge(item.id); const isActive = normalizedActive === normalizeAdminModule(item.id); const Icon = item.icon; return <button key={item.id} type="button" onClick={() => go(item.id)} className={`relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${isActive ? 'bg-white text-neutral-900 shadow-md' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}><Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-indigo-600' : ''}`} /><span className="flex-1 truncate text-xs font-semibold">{item.label}</span>{count > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white">{count > 99 ? '99+' : count}</span>}</button>; })}</div>}
              </div>;
            })}
          </div>
        </nav>
        <div className="shrink-0 px-3 py-4 border-t border-white/5">{sidebarOpen && <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">{adminType === 'admin' ? 'AD' : 'CO'}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{adminType === 'admin' ? 'Administrador' : colaboradorNome || 'Colaborador'}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">{adminType === 'admin' ? 'Acesso total' : 'Acesso restrito'}</p></div><span className="h-2 w-2 rounded-full bg-emerald-400" /></div>}<button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-white/30 hover:bg-red-500/10 hover:text-red-400"><LogOut className="h-[18px] w-[18px]" />{sidebarOpen && <span className="text-sm font-semibold">Sair com Segurança</span>}</button></div>
      </>}
    >
      <div className="admin-module-container"><div className="min-h-[calc(100vh-140px)] rounded-[2rem] bg-white p-3 lg:p-4 shadow-sm ring-1 ring-neutral-100">
        <Suspense fallback={<ModuleLoadingState />}>
        {normalizedActive === 'dashboard' && (adminType === 'colaborador' ? <CollaboratorDashboard colaboradorId={colaboradorId} colaboradorNome={colaboradorNome || undefined} colaboradorModulos={internalModulos} onNavigate={commonNavigate} /> : <Dashboard adminType="admin" colaboradorNome="Administrador" colaboradorModulos={internalModulos} onNavigate={commonNavigate} />)}
        {normalizedActive === 'cadastro' && <ErrorBoundary><CadastroModule title="Cadastros" allowedTabs={cadastroTabs as any} initialTab={activeTab} initialItemId={activeItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} /></ErrorBoundary>}
        {normalizedActive === 'fornecedores' && <ErrorBoundary><FornecedoresModule initialTab={activeTab} /></ErrorBoundary>}
        {normalizedActive === 'parceiros' && <ErrorBoundary><PartnersAdminModule /></ErrorBoundary>}
        {normalizedActive === 'operacoes' && <ErrorBoundary><VendasModule title="Operações" allowedTabs={['orcamentos', 'demandas', 'os', 'produtos', 'assinaturas']} initialTab={activeTab} initialItemId={activeItemId} adminType={adminType} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} onNavigate={commonNavigate} /></ErrorBoundary>}
        {normalizedActive === 'demandas' && <DemandasColaboradorModule colaboradorId={colaboradorId} adminType={adminType} initialItemId={activeItemId} initialTab={activeTab} colaboradorNome={colaboradorNome} />}
        {normalizedActive === 'loja' && <ErrorBoundary><CadastroModule title="Loja GSA Store" allowedTabs={['produtos', 'servicos', 'pacotes', 'assinaturas', 'promocoes', 'categorias_loja', 'gsa_store']} initialTab={activeTab} initialItemId={activeItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} /></ErrorBoundary>}
        {normalizedActive === 'fidelidade' && <ErrorBoundary><CadastroModule title="Fidelidade" allowedTabs={['indicacoes', 'vouchers', 'premios', 'promocoes', 'cupons']} initialTab={activeTab} initialItemId={activeItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} /></ErrorBoundary>}
        {normalizedActive === 'atendimento' && <ErrorBoundary><TicketsModule initialTab={activeTab} initialItemId={activeItemId} adminType={adminType} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} /></ErrorBoundary>}
        {normalizedActive === 'financeiro' && <FinanceiroSuperDomain initialTab={activeTab} initialItemId={activeItemId} adminType={adminType} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} onNavigate={commonNavigate} />}
        {normalizedActive === 'credito_loja' && <ErrorBoundary><VendasModule title="Crédito da Loja" allowedTabs={['credito']} initialTab={activeTab || 'credito'} initialItemId={activeItemId} adminType={adminType} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} onNavigate={commonNavigate} /></ErrorBoundary>}
        {normalizedActive === 'cobranca' && <ErrorBoundary><CobrancaModule initialTab={activeTab} initialItemId={activeItemId} colaboradorNome={colaboradorNome} onNavigate={commonNavigate} /></ErrorBoundary>}
        {activeModule === 'fiscal' && <FiscalModule initialItemId={activeItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {normalizedActive === 'relatorios' && <RelatoriosModule adminType={adminType} colaboradorModulos={internalModulos} />}
        {normalizedActive === 'configuracoes' && <ConfiguracoesModule />}
        {normalizedActive === 'area_vip' && <ErrorBoundary><AreaVIPModule initialItemId={activeItemId} colaboradorNome={colaboradorNome} /></ErrorBoundary>}
        {normalizedActive === 'acessos' && <ErrorBoundary><AcessosModule adminType={adminType} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome || 'Administrador'} /></ErrorBoundary>}
        {normalizedActive === 'automacoes' && <ErrorBoundary><ScrapingAdminModule /></ErrorBoundary>}
        {normalizedActive === 'sistema' && <SystemMonitorModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />}
        {normalizedActive === 'promocoes' && <ErrorBoundary><PromocaoQuantidadeModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome || 'Administrador'} /></ErrorBoundary>}
        {normalizedActive === 'classificados' && <ErrorBoundary><ClassifiedsModule initialTab={activeTab} initialItemId={activeItemId} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} /></ErrorBoundary>}
        {normalizedActive === 'anuncios' && <ErrorBoundary><AdvertisingAdminModule /></ErrorBoundary>}
        {['trabalhe-conosco', 'careers'].includes(normalizedActive) && <ErrorBoundary><CareersAdminModule /></ErrorBoundary>}
        {normalizedActive === 'avisos-campanhas' && <ErrorBoundary><SiteCampaignAdminPage /></ErrorBoundary>}
        {normalizedActive === 'viagens' && <ErrorBoundary><TravelAdminModule /></ErrorBoundary>}
        {normalizedActive === 'afiliados' && <ErrorBoundary><AffiliateAdminModule /></ErrorBoundary>}
        {normalizedActive === 'saude' && <ErrorBoundary><ProtectionAdminModule domain="saude" initialTab={activeTab} initialItemId={activeItemId} /></ErrorBoundary>}
        {normalizedActive === 'seguros' && <ErrorBoundary><ProtectionAdminModule domain="seguros" initialTab={activeTab} initialItemId={activeItemId} /></ErrorBoundary>}
        {normalizedActive === 'gsa-tv' && <ErrorBoundary><GsaTvModule colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} adminType={adminType} /></ErrorBoundary>}
        </Suspense>
      </div></div>
    </DashboardLayout>
    <AdminCommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} onNavigate={commonNavigate} canAccess={canAccess} />
    </>
  );
}


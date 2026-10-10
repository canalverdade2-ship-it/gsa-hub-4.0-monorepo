import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileCheck2,
  ListChecks,
  CheckSquare,
  Calendar,
  Wallet,
  Folder,
  BarChart2,
  Database,
  Settings,
  Bell,
  LogOut,
  UserCheck,
  MessageCircle,
  Menu,
  X,
  FileText
  ,TicketPercent
} from 'lucide-react';

// Admin Components
import AdminDashboard from './components/admin/AdminDashboard';
import AdminOrders from './components/admin/AdminOrders';
import AdminContracts from './components/admin/AdminContracts';
import AdminProposals from './components/admin/AdminProposals';
import AdminClients from './components/admin/AdminClients';
import AdminFinance from './components/admin/AdminFinance';
import AdminTasks from './components/admin/AdminTasks';
import AdminCalendar from './components/admin/AdminCalendar';
import AdminDocuments from './components/admin/AdminDocuments';
import AdminReports from './components/admin/AdminReports';
import AdminCatalogs from './components/admin/AdminCatalogs';
import AdminSettings from './components/admin/AdminSettings';
import AdminCoupons from './components/admin/AdminCoupons';
import AdminSupport from './components/admin/AdminSupport';

// Client Components
import ClientDashboard from './components/client/ClientDashboard';
import ClientOrders from './components/client/ClientOrders';
import ClientContracts from './components/client/ClientContracts';
import ClientProposals from './components/client/ClientProposals';
import ClientProfile from './components/client/ClientProfile';
import ClientDocuments from './components/client/ClientDocuments';
import ClientNotices from './components/client/ClientNotices';
import ClientFinance from './components/client/ClientFinance';
import ClientTickets from './components/client/ClientTickets';
import LoginScreen from './components/auth/LoginScreen';

import Button from './components/ui/Button';
import { api } from './api';
import { readRoute, routePath, type PortalRoute, type PortalRole } from './routes';
import { hasAdminModule } from './adminPermissions';

export function App() {
  const [route, setRoute] = useState<PortalRoute>(() => readRoute());
  const production = !import.meta.env.DEV;
  const [authState, setAuthState] = useState<{ status: 'loading' | 'authenticated' | 'unauthenticated'; user?: any }>({
    status: production ? 'loading' : 'authenticated'
  });
  const { role, screen, detail } = route;

  useEffect(() => {
    if (!production) return undefined;
    let active = true;
    api('/me')
      .then((user) => {
        if (active) setAuthState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (active) setAuthState({ status: 'unauthenticated' });
      });
    return () => { active = false; };
  }, [production]);

  const handleAuthenticated = (user: any) => {
    const nextRole: PortalRole = user?.role === 'client' ? 'client' : 'admin';
    const nextPath = routePath(nextRole, 'dashboard');
    window.history.replaceState(null, '', nextPath);
    setRoute({ role: nextRole, screen: 'dashboard', detail: null });
    setAuthState({ status: 'authenticated', user });
  };

  const handleLogout = async () => {
    try { await api('/logout', undefined, 'POST'); } catch {}
    setAuthState({ status: 'unauthenticated' });
  };

  useEffect(() => {
    if (!production || authState.status !== 'authenticated' || !authState.user) return;
    const expectedRole: PortalRole = authState.user.role === 'client' ? 'client' : 'admin';
    if (route.role === expectedRole) return;
    const nextPath = routePath(expectedRole, 'dashboard');
    window.history.replaceState(null, '', nextPath);
    setRoute({ role: expectedRole, screen: 'dashboard', detail: null });
  }, [authState.status, authState.user, production, route.role]);

  const navigate = (nextRole: PortalRole, nextScreen: string, nextDetail?: string | null) => {
    const path = routePath(nextRole, nextScreen, nextDetail);
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setRoute({ role: nextRole, screen: nextScreen, detail: nextDetail || null });
    setMobileMenuOpen(false);
  };
  const setScreen = (nextScreen: string) => navigate(role, nextScreen);
  const screenBeforeNotices = useRef<PortalRoute | null>(null);
  const toggleNotices = () => {
    if (screen === 'notices') {
      const previous = screenBeforeNotices.current;
      screenBeforeNotices.current = null;
      navigate(role, previous?.role === role ? previous.screen : 'dashboard', previous?.role === role ? previous.detail : null);
      return;
    }
    screenBeforeNotices.current = route;
    navigate(role, 'notices');
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState(0);
  const [pendingNotificationModules, setPendingNotificationModules] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setPendingNotifications(0);
    const refreshNotifications = async () => {
      try {
        const notifications = await api('/notifications');
        if (active && Array.isArray(notifications)) {
          const pending = notifications.filter((notification) => !notification.read);
          setPendingNotifications(pending.length);
          setPendingNotificationModules(new Set(pending.map((notification) => String(notification.kind || ''))));
        }
      } catch {
        // Keep the last confirmed count if the session or connection is unavailable.
      }
    };
    void refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 30000);
    window.addEventListener('focus', refreshNotifications);
    window.addEventListener('gsa:reload', refreshNotifications);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshNotifications);
      window.removeEventListener('gsa:reload', refreshNotifications);
    };
  }, [role, screen]);

  // Keep both portal tabs in sync after a server-side action such as creating
  // a proposal or accepting it from the client portal.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const events = new EventSource(`/api/events?demoRole=${role}`);
    const handleReload = () => window.dispatchEvent(new Event('gsa:reload'));
    const handleVisibility = () => { if (document.visibilityState === 'visible') handleReload(); };
    const handleOnline = () => handleReload();
    const fallbackTimer = window.setInterval(handleReload, 15000);
    events.addEventListener('open', handleReload);
    events.addEventListener('ready', handleReload);
    events.addEventListener('reload', handleReload);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    return () => {
      window.clearInterval(fallbackTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      events.removeEventListener('open', handleReload);
      events.removeEventListener('ready', handleReload);
      events.removeEventListener('reload', handleReload);
      events.close();
    };
  }, [role]);

  const hasModuleNotification = (...kinds: string[]) => kinds.some((kind) => pendingNotificationModules.has(kind));

  useEffect(() => {
    const syncRoute = () => { setRoute(readRoute()); setMobileMenuOpen(false); };
    window.addEventListener('popstate', syncRoute);
    const canonical = routePath(role, screen, detail);
    const query = new URLSearchParams(window.location.search);
    const hasCallbackQuery = query.has('transaction_nsu') || query.has('govbr_signature');
    if (window.location.pathname !== canonical || (window.location.search && !hasCallbackQuery)) {
      window.history.replaceState(null, '', canonical);
    }
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    const desktop = window.matchMedia('(min-width: 1025px)');
    const closeMenu = () => setMobileMenuOpen(false);
    window.addEventListener('keydown', onKey);
    desktop.addEventListener('change', closeMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      desktop.removeEventListener('change', closeMenu);
    };
  }, []);

  // When role changes, set default screen
  const switchRole = (newRole: 'admin' | 'client') => {
    navigate(newRole, 'dashboard');
  };

  const adminNav = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Users },
    { id: 'proposals', label: 'Propostas', icon: FileText },
    { id: 'contracts', label: 'Contratos', icon: FileCheck2 },
    { id: 'orders', label: 'Ordens de Serviço', icon: ListChecks },
    { id: 'tasks', label: 'Tarefas', icon: CheckSquare },
    { id: 'calendar', label: 'Calendário', icon: Calendar },
    { id: 'finance', label: 'Financeiro', icon: Wallet },
    { id: 'documents', label: 'Documentos', icon: Folder },
    { id: 'coupons', label: 'Cupons', icon: TicketPercent },
    { id: 'support', label: 'Suporte ao Cliente', icon: MessageCircle },
    { id: 'reports', label: 'Relatórios', icon: BarChart2 },
    { id: 'catalogs', label: 'Cadastros', icon: Database },
    { id: 'settings', label: 'Configurações', icon: Settings }
  ];

  const clientNav = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
    { id: 'profile', label: 'Meus dados', icon: Users },
    { id: 'orders', label: 'Minhas Ordens', icon: ListChecks },
    { id: 'proposals', label: 'Propostas', icon: FileText },
    { id: 'contracts', label: 'Contratos', icon: FileCheck2 },
    { id: 'documents', label: 'Documentos', icon: Folder },
    { id: 'notices', label: 'Comunicados', icon: Bell },
    { id: 'finance', label: 'Faturas', icon: Wallet },
    { id: 'support', label: 'Suporte', icon: MessageCircle }
  ];

  const adminCan = (module: string) => !production || hasAdminModule(authState.user, module);
  const currentNav = role === 'admin' ? adminNav.filter((item) => adminCan(item.id)) : clientNav;

  useEffect(() => {
    if (!production || authState.status !== 'authenticated' || role !== 'admin' || screen === 'notices') return;
    if (adminCan(screen)) return;
    const fallback = adminNav.find((item) => adminCan(item.id))?.id || 'dashboard';
    navigate('admin', fallback);
  }, [production, authState.status, authState.user, role, screen]);

  if (production && authState.status === 'loading') {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Carregando...</main>;
  }
  if (production && authState.status === 'unauthenticated') {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  const renderContent = () => {
    if (role === 'admin') {
      if (production && screen !== 'notices' && !adminCan(screen)) {
        return <main className="access-denied-panel"><h2>Acesso não permitido</h2><p>Seu perfil não possui permissão para este módulo.</p></main>;
      }
      switch (screen) {
        case 'dashboard':
          return <AdminDashboard onNavigate={(next, detail) => navigate('admin', next, detail)} />;
        case 'clients':
          return <AdminClients routeDetail={detail} onOpenClient={(code) => navigate('admin', 'clients', code)} onCloseClient={() => navigate('admin', 'clients')} onNewClient={() => navigate('admin', 'clients', 'novo')} onNavigateToOrder={(code) => navigate('admin', 'orders', code)} />;
        case 'orders':
          return <AdminOrders routeDetail={detail} onOpenOrder={(code) => navigate('admin', 'orders', code)} onCloseOrder={() => navigate('admin', 'orders')} />;
        case 'contracts':
          return <AdminContracts routeDetail={detail} onOpenContract={(code) => navigate('admin', 'contracts', code)} onCloseContract={() => navigate('admin', 'contracts')} onCancel={() => setScreen('dashboard')} />;
        case 'proposals':
          return <AdminProposals
            routeDetail={detail}
            onOpenProposal={(code) => navigate('admin', 'proposals', code)}
            onCloseProposal={() => navigate('admin', 'proposals')}
            onGenerateContract={(proposalId) => navigate('admin', 'contracts', `novo-${proposalId}`)}
          />;
        case 'tasks':
          return <AdminTasks />;
        case 'calendar':
          return <AdminCalendar />;
        case 'finance':
          return <AdminFinance routeDetail={detail} onCloseInvoice={() => navigate('admin', 'finance')} />;
        case 'support':
          return <AdminSupport routeDetail={detail} onOpenTicket={(code) => navigate('admin', 'support', code)} onCloseTicket={() => navigate('admin', 'support')} />;
        case 'coupons':
          return <AdminCoupons />;
        case 'documents':
          return <AdminDocuments />;
        case 'reports':
          return <AdminReports />;
        case 'catalogs':
          return <AdminCatalogs />;
        case 'settings':
          return <AdminSettings />;
        case 'notices':
          return <ClientNotices role="admin" onNavigate={(next, nextDetail) => navigate('admin', next, nextDetail)} />;
        default:
          return <AdminOrders />;
      }
    } else {
      switch (screen) {
        case 'dashboard':
          return <ClientDashboard onNavigate={(next, nextDetail) => navigate('client', next, nextDetail)} />;
        case 'profile':
          return <ClientProfile onNavigate={setScreen} />;
        case 'orders':
          return <ClientOrders routeDetail={detail} onOpenOrder={(code) => navigate('client', 'orders', code)} onCloseOrder={() => navigate('client', 'orders')} />;
        case 'proposals':
          return <ClientProposals
            routeDetail={detail}
            onOpenProposal={(code) => navigate('client', 'proposals', code)}
            onCloseProposal={() => navigate('client', 'proposals')}
          />;
        case 'contracts':
          return <ClientContracts routeDetail={detail} onOpenContract={(code) => navigate('client', 'contracts', code)} onCloseContract={() => navigate('client', 'contracts')} />;
        case 'documents':
          return <ClientDocuments routeDetail={detail} onOpenFolder={(folder) => navigate('client', 'documents', folder)} onCloseFolder={() => navigate('client', 'documents')} />;
        case 'notices':
          return <ClientNotices role="client" onNavigate={(next, nextDetail) => navigate('client', next, nextDetail)} />;
        case 'finance':
          return <ClientFinance routeDetail={detail} />;
        case 'support':
          return <ClientTickets routeDetail={detail} onOpenTicket={(code) => navigate('client', 'support', code)} onCloseTicket={() => navigate('client', 'support')} />;
        default:
          return <ClientOrders onBack={() => setScreen('dashboard')} />;
      }
    }
  };

  return (
    <div className={`app-shell app-shell--${role}`}>
      {/* Mobile/Tablet Backdrop Overlay */}
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? 'sidebar-backdrop--open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside id="main-navigation" className={`sidebar ${mobileMenuOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 16
              }}
            >
              G
            </div>
            <span className="sidebar-brand-name">GSA HUB 3.0</span>
          </div>

          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">
            {role === 'admin' ? 'Painel Administrativo' : 'Área do Cliente'}
          </div>

          {currentNav.map((item) => {
            const Icon = item.icon;
            const isActive = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setScreen(item.id);
                  setMobileMenuOpen(false);
                }}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="nav-divider" />

          {/* Quick Profile Switcher for Demonstration & Review */}
          <div style={{ padding: '8px 12px' }}>
            {!production && <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                Visualizar perfil como:
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button
                  variant={role === 'admin' ? 'primary' : 'secondary'}
                  size="sm"
                  style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
                  onClick={() => switchRole('admin')}
                >
                  Admin
                </Button>
                <Button
                  variant={role === 'client' ? 'primary' : 'secondary'}
                  size="sm"
                  style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
                  onClick={() => switchRole('client')}
                >
                  Cliente
                </Button>
              </div>
            </>}
              {production && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLogout}
                  style={{ width: '100%', marginTop: 8, justifyContent: 'center', padding: '6px 8px', fontSize: 11 }}
                >
                  <LogOut size={14} /> Sair
                </button>
              )}
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-leading">
            <button
              type="button"
              className="topbar-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Abrir menu lateral"
              aria-expanded={mobileMenuOpen}
              aria-controls="main-navigation"
            >
              <Menu size={20} />
            </button>

          </div>

          {/* Topbar Right Controls */}
          <div className="topbar-right">
            {(role !== 'admin' || adminCan('notices')) && (
              <button
                type="button"
                className="topbar-icon-btn topbar-notifications-btn"
                title="Notificações & Comunicados"
                aria-label={`Notificações: ${pendingNotifications} pendentes`}
                onClick={toggleNotices}
              >
                <Bell size={22} />
                {pendingNotifications > 0 && (
                  <span className="notif-badge-dot" aria-label={`${pendingNotifications} notificações pendentes`}>
                    {pendingNotifications > 99 ? '99+' : pendingNotifications}
                  </span>
                )}
              </button>
            )}

          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="content-scrollable">{renderContent()}</main>

        {/* Mobile Bottom Navigation (Client Only) */}
        {role === 'admin' && (
          <nav className="mobile-bottom-nav admin-mobile-bottom-nav" aria-label="Navegação administrativa mobile">
            {adminCan('dashboard') && <button type="button" className={`mobile-nav-btn ${screen === 'dashboard' ? 'active' : ''}`} onClick={() => setScreen('dashboard')}>
              <LayoutDashboard size={20} /><span>Início</span>
            </button>}
            {adminCan('clients') && <button type="button" className={`mobile-nav-btn ${screen === 'clients' ? 'active' : ''}`} onClick={() => setScreen('clients')}>
              <Users size={20} /><span>Clientes</span>
            </button>}
            {adminCan('orders') && <button type="button" className={`mobile-nav-btn ${screen === 'orders' ? 'active' : ''}`} onClick={() => setScreen('orders')}>
              <ListChecks size={20} /><span>OS</span>
            </button>}
            {adminCan('tasks') && <button type="button" className={`mobile-nav-btn ${screen === 'tasks' ? 'active' : ''}`} onClick={() => setScreen('tasks')}>
              <CheckSquare size={20} /><span>Tarefas</span>
            </button>}
            {adminCan('finance') && <button type="button" className={`mobile-nav-btn ${screen === 'finance' ? 'active' : ''}`} onClick={() => setScreen('finance')}>
              <Wallet size={20} /><span>Financeiro</span>
            </button>}
            <button type="button" className={`mobile-nav-btn ${!['dashboard', 'clients', 'orders', 'tasks', 'finance'].includes(screen) ? 'active' : ''}`} onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} /><span>Menu</span>
            </button>
          </nav>
        )}

        {role === 'client' && (
          <nav className="mobile-bottom-nav">
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'dashboard' ? 'active' : ''}`}
              onClick={() => setScreen('dashboard')}
            >
              <LayoutDashboard size={20} />
              <span>Início</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'proposals' ? 'active' : ''}`}
              onClick={() => setScreen('proposals')}
            >
              <span className="mobile-nav-icon"><FileText size={20} />{hasModuleNotification('proposals') && <span className="mobile-nav-notification" />}</span>
              <span>Propostas</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'contracts' ? 'active' : ''}`}
              onClick={() => setScreen('contracts')}
            >
              <span className="mobile-nav-icon"><FileCheck2 size={20} />{hasModuleNotification('contracts') && <span className="mobile-nav-notification" />}</span>
              <span>Contratos</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'orders' ? 'active' : ''}`}
              onClick={() => setScreen('orders')}
            >
              <span className="mobile-nav-icon"><Briefcase size={20} />{hasModuleNotification('orders') && <span className="mobile-nav-notification" />}</span>
              <span>Serviços</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'documents' ? 'active' : ''}`}
              onClick={() => setScreen('documents')}
            >
              <span className="mobile-nav-icon"><Folder size={20} />{hasModuleNotification('documents') && <span className="mobile-nav-notification" />}</span>
              <span>Docs</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'finance' ? 'active' : ''}`}
              onClick={() => setScreen('finance')}
            >
              <span className="mobile-nav-icon"><Wallet size={20} />{hasModuleNotification('finance', 'invoices', 'payments') && <span className="mobile-nav-notification" />}</span>
              <span>Faturas</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-btn ${screen === 'support' ? 'active' : ''}`}
              onClick={() => setScreen('support')}
            >
              <span className="mobile-nav-icon"><MessageCircle size={20} />{hasModuleNotification('tickets', 'support') && <span className="mobile-nav-notification" />}</span>
              <span>Suporte</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

export default App;

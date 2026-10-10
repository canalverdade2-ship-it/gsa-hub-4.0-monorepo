import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './pages/Home';
import toast, { Toaster } from 'react-hot-toast';
import { AdminNotificationProvider } from './hooks/useAdminNotifications';
import { logService } from './lib/logService';
import { useAutoLogout } from './hooks/useAutoLogout';
import { GSAChatbotWidget } from './components/ui/GSAChatbotWidget';
import { sessionService, type ClientPersonType } from './lib/sessionService';
import { validateProviderSessionAccess } from './lib/providerSessionAccess';
import { ClientNotificationProvider } from './hooks/useClientNotifications';
import { ProviderNotificationProvider } from './hooks/useProviderNotifications';
import { ProviderRouteGuard } from './pages/Prestador/ProviderRouteGuard';
import { FullscreenPrompt } from './components/ui/FullscreenPrompt';
import { WhatsAppButton } from './components/ui/WhatsAppButton';
import { AdvertisingSlot } from './components/ads/AdvertisingSlot';
import { FileViewerProvider } from './contexts/FileViewerContext';
import { useAppLocation } from './routing/useAppLocation';
import { resolveLegacyRoute } from './routing/legacyRouteResolver';
import { routes } from './routing/routeCatalog';
import { navigate, replace } from './routing/navigationService';
import { isRouteAllowed } from './routing/routeSecurity';
import { readSafeReturnTo } from './routing/safeReturnTo';
import { defaultAdminPath } from './security/collaboratorAccess';
import { supabase } from './lib/supabase';
import { clientOperationalWrite } from './lib/clientOperationalWrite';
import { callClientRpc } from './lib/clientRpc';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AffiliateTrackingBridge } from './components/AffiliateTrackingBridge';
import { PublicVIPPresentationPage } from './components/public/PublicVIPPresentationPage';
import { PublicNotFoundPage } from './components/public/PublicNotFoundPage';
import ProtocolConsultPage from './components/public/ProtocolConsultPage';
import type { ProductVariationSelection } from './types/productVariations';

const PENDING_STORE_CHECKOUT_KEY = 'gsa_pending_store_checkout';
const PENDING_STORE_COUPONS_KEY = 'gsa_pending_store_coupons';
const GUEST_ACTIVATED_STORE_COUPONS_KEY = 'gsa_guest_activated_store_coupons';

async function migrateGuestCartToAccount(clientId: string): Promise<boolean> {
  const rawCart = localStorage.getItem(PENDING_STORE_CHECKOUT_KEY);
  if (!rawCart) return false;

  let parsed: any;
  try { parsed = JSON.parse(rawCart); } catch { return false; }

  const pendingItems: Array<{
    item_id: string;
    tipo: string;
    quantidade: number;
    prazo_meses?: number;
    produto_variante_id?: string | null;
    opcoes_variacao?: ProductVariationSelection | null;
  }> =
    Array.isArray(parsed?.items) ? parsed.items : [];
  if (pendingItems.length === 0) {
    localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
    return false;
  }

  let migrated = false;
  try {
    const productIds = pendingItems.filter(c => c.tipo === 'produto').map(c => c.item_id);
    const serviceIds = pendingItems.filter(c => c.tipo === 'servico').map(c => c.item_id);
    const subscriptionIds = pendingItems.filter(c => c.tipo === 'assinatura').map(c => c.item_id);

    const [prodRes, servRes, assRes] = await Promise.all([
      productIds.length > 0 ? supabase.from('produtos').select('id').in('id', productIds) : Promise.resolve({ data: [] }),
      serviceIds.length > 0 ? supabase.from('servicos').select('id').in('id', serviceIds) : Promise.resolve({ data: [] }),
      subscriptionIds.length > 0 ? supabase.from('assinaturas').select('id').in('id', subscriptionIds) : Promise.resolve({ data: [] })
    ]);

    const validProductIds = new Set(prodRes.data?.map((p: any) => p.id));
    const validServiceIds = new Set(servRes.data?.map((s: any) => s.id));
    const validSubscriptionIds = new Set(assRes.data?.map((a: any) => a.id));

    // Carrinho já existente na conta: evita duplicar linhas ao migrar o carrinho do visitante
    const { data: existingCart } = await supabase
      .from('loja_carrinhos')
      .select('id, item_id, tipo, quantidade, produto_variante_id')
      .eq('cliente_id', clientId);

    const existingMap = new Map<string, any>(
      (existingCart || []).map((row: any) => [`${row.tipo}:${row.item_id}:${row.produto_variante_id || 'none'}`, row]),
    );

    // Escritas sequenciais: garante que uma falha no meio não deixe itens já inseridos
    // sem controle e que o localStorage só seja limpo com a migração concluída.
    for (const item of pendingItems) {
      if (!item?.item_id || !item?.tipo) continue;

      if (item.tipo === 'produto' && !validProductIds.has(item.item_id)) continue;
      if (item.tipo === 'servico' && !validServiceIds.has(item.item_id)) continue;
      if (item.tipo === 'assinatura' && !validSubscriptionIds.has(item.item_id)) continue;

      const quantidade = Math.max(1, Number(item.quantidade || 1));
      const prazoMeses = item.prazo_meses ? Number(item.prazo_meses) : undefined;
      const key = `${item.tipo}:${item.item_id}:${item.produto_variante_id || 'none'}`;
      const existing = existingMap.get(key);

      if (existing) {
        const novaQuantidade = item.tipo === 'assinatura'
          ? quantidade
          : Number(existing.quantidade || 1) + quantidade;
        await clientOperationalWrite(
          clientId,
          'loja_carrinhos',
          'update',
          {
            quantidade: novaQuantidade,
            updated_at: new Date().toISOString(),
            ...(item.produto_variante_id ? { produto_variante_id: item.produto_variante_id } : {}),
          },
          { id: existing.id },
        );
        existing.quantidade = novaQuantidade;
      } else {
        const insertData: any = { cliente_id: clientId, item_id: item.item_id, tipo: item.tipo, quantidade, updated_at: new Date().toISOString() };
        if (prazoMeses) insertData.prazo_meses = prazoMeses;
        if (item.produto_variante_id) insertData.produto_variante_id = item.produto_variante_id;
        await clientOperationalWrite(clientId, 'loja_carrinhos', 'insert', insertData);
        existingMap.set(key, {
          id: null,
          item_id: item.item_id,
          tipo: item.tipo,
          quantidade,
          produto_variante_id: item.produto_variante_id || null,
        });
      }
      migrated = true;
    }

    const rawCoupons = localStorage.getItem(PENDING_STORE_COUPONS_KEY);
    const parsedCoupons = rawCoupons ? JSON.parse(rawCoupons) : null;
    const couponIds: string[] = Array.isArray(parsedCoupons?.activatedCouponIds) ? parsedCoupons.activatedCouponIds : [];
    for (const cupomId of couponIds) {
      if (!cupomId) continue;
      try { await callClientRpc('gsa_client_activate_store_coupon', { p_cupom_id: cupomId }); } catch { /* estado já pode estar ativado */ }
    }

    if (migrated) {
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      localStorage.removeItem(PENDING_STORE_COUPONS_KEY);
      localStorage.removeItem(GUEST_ACTIVATED_STORE_COUPONS_KEY);
      // Seta flag no sessionStorage para que o ClientGSAStore possa detectar a migração
      // mesmo que o evento 'gsa-cart-migrated' chegue antes do componente montar.
      try { sessionStorage.setItem('gsa_cart_just_migrated', '1'); } catch { /* ignore */ }
    }
    return migrated;
  } catch (err) {
    console.error('[App] Erro ao migrar carrinho do visitante:', err);
    return false;
  }
}



const queryClient = new QueryClient();

import { lazyWithRetry } from './lib/lazyWithRetry';

const SecureAdminPanel = lazyWithRetry(() => import('./pages/SecureAdminPanel'), 'SecureAdminPanel');
const ClientPortal = lazyWithRetry(() => import('./pages/ClientPortal'), 'ClientPortal');
const ClientLoginPage = lazyWithRetry(() => import('./pages/ClientLoginPage'), 'ClientLoginPage');
const BusinessRegistrationPage = lazyWithRetry(() => import('./pages/BusinessRegistrationPage'), 'BusinessRegistrationPage');
const RestrictedAccessHubPage = lazyWithRetry(() => import('./pages/RestrictedAccessHubPage'), 'RestrictedAccessHubPage');
const ProviderAccessPage = lazyWithRetry(() => import('./pages/ProviderAccessPage'), 'ProviderAccessPage');
const ProviderLandingPage = lazyWithRetry(() => import('./pages/Prestador/ProviderLandingPage'), 'ProviderLandingPage');
const PrestadorDashboard = lazyWithRetry(() => import('./pages/Prestador/PrestadorDashboard'), 'PrestadorDashboard'); // const PrestadorDashboard = lazy(() => import('./pages/Prestador/PrestadorDashboard')
const FornecedorDashboard = lazyWithRetry(() => import('./pages/Fornecedor/FornecedorDashboard'), 'FornecedorDashboard');
const FornecedorAccessPage = lazyWithRetry(() => import('./pages/Fornecedor/FornecedorAccessPage'), 'FornecedorAccessPage');
const FornecedorLandingPage = lazyWithRetry(() => import('./pages/Fornecedor/FornecedorLandingPage'), 'FornecedorLandingPage');
const AdvertiserPortal = lazyWithRetry(() => import('./pages/AdvertiserPortal'), 'AdvertiserPortal');
const MarketplaceGSAStore = lazyWithRetry(() => import('./components/client/marketplace/MarketplaceGSAStore'), 'MarketplaceGSAStore');
const AffiliatePublicPage = lazyWithRetry(() => import('./components/public/AffiliatePublicPage'), 'AffiliatePublicPage');
const AffiliateAccessPage = lazyWithRetry(() => import('./pages/Afiliado/AffiliateAccessPage'), 'AffiliateAccessPage');
const AfiliadoDashboard = lazyWithRetry(() => import('./pages/Afiliado/AfiliadoDashboard'), 'AfiliadoDashboard');
const CareersLandingPage = lazyWithRetry(() => import('./pages/Careers/CareersLandingPage'), 'CareersLandingPage');
const CareersAccessPage = lazyWithRetry(() => import('./pages/Careers/CareersAccessPage'), 'CareersAccessPage');

function RouteLoading() {
  return <div className="flex min-h-[50vh] items-center justify-center bg-neutral-50 text-sm font-semibold text-neutral-600" role="status">Carregando ambiente...</div>;
}

export default function App() {
  const route = useAppLocation();
  const [session, setSession] = useState<{
    clientId?: string;
    clientPersonType?: ClientPersonType;
    adminAuth?: boolean;
    adminType?: 'admin' | 'colaborador';
    colaboradorId?: string;
    colaboradorNome?: string;
    colaboradorModulos?: string[];
    isGsaTv?: boolean;
    prestadorId?: string;
    fornecedorId?: string;
  }>({});
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const isSessionActive = !!(session.clientId || session.adminAuth || session.prestadorId || session.fornecedorId);

  const handleLoginClient = async (clientId: string, isRecovery: boolean = false, personType?: ClientPersonType) => {
    const resolvedType = personType || (route.area === 'business' ? 'pj' : 'pf');
    sessionService.setClientPersonType(resolvedType);
    setSession({ clientId, clientPersonType: resolvedType });

    // Migra o carrinho de visitante (localStorage) para o banco de dados do cliente
    const didMigrate = await migrateGuestCartToAccount(clientId);

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (isRecovery) {
      const targetProfile = resolvedType === 'pj' ? routes.business.profile() : routes.client.perfil();
      replace(`${targetProfile}?modal=alterar-senha&origem=recuperacao`);
    } else if (returnTo) {
      replace(decodeURIComponent(returnTo));
      // Se o carrinho foi migrado, dispara o evento para o ClientGSAStore abrir o drawer
      if (didMigrate) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('gsa_open_cart'));
        }, 800);
      }
    } else if (resolvedType === 'pj') {
      replace(routes.business.dashboard());
    } else {
      replace(routes.client.dashboard());
    }
  };

  const handleLoginAdmin = (adminDetails: { type: 'admin' | 'colaborador'; id?: string; nome?: string; modulos?: string[]; isGsaTv?: boolean }) => {
    if (adminDetails.isGsaTv) {
      sessionStorage.setItem('isGsaTv', 'true');
    } else {
      sessionStorage.removeItem('isGsaTv');
    }
    setSession({
      adminAuth: true,
      adminType: adminDetails.type,
      colaboradorId: adminDetails.id,
      colaboradorNome: adminDetails.nome,
      colaboradorModulos: adminDetails.modulos,
      isGsaTv: adminDetails.isGsaTv,
    });

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo) {
      replace(decodeURIComponent(returnTo));
    } else {
      replace(defaultAdminPath(adminDetails.type, adminDetails.modulos || []));
    }
  };

  const handleLoginPrestador = (prestadorId: string) => {
    setSession({ prestadorId });
    const returnTo = readSafeReturnTo(window.location.search, ['/prestador']);
    if (returnTo) {
      replace(returnTo);
    } else {
      replace(routes.provider.dashboard());
    }
  };

  const handleLoginFornecedor = (fornecedorId: string) => {
    setSession({ fornecedorId });
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo) {
      replace(decodeURIComponent(returnTo));
    } else {
      replace(routes.supplier.dashboard());
    }
  };

  const handleLoginAfiliado = async (clientId?: string) => {
    const currentSession = sessionService.getCurrentSession();
    const finalId = clientId || currentSession?.atorId || session.clientId;

    if (!finalId) {
      toast.error('Não foi possível identificar o ID do afiliado.');
      return;
    }

    sessionService.setClientPersonType('pf');
    setSession({ clientId: finalId, clientPersonType: 'pf' });

    // Migra carrinho de visitante se houver
    const didMigrate = await migrateGuestCartToAccount(finalId);

    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo) {
      replace(decodeURIComponent(returnTo));
      if (didMigrate) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('gsa-cart-migrated')), 800);
      }
    } else {
      replace('/afiliados/dashboard');
    }
  };

  const handleLogout = async (reason?: string) => {
    try {
      await sessionService.endSession();
    } catch {
      // Ignora erro no logout
    }
    setSession({});
    if (reason === 'superseded') {
      toast.error('Sua sessão foi encerrada porque sua conta foi conectada em outro dispositivo ou local.', {
        id: 'session-superseded',
        duration: 8000,
      });
    }
    if (route.area === 'admin') {
      replace(routes.login.restricted());
    } else if (route.area === 'business') {
      replace(routes.login.business());
    } else if (route.area === 'provider') {
      replace(routes.login.provider());
    } else if (route.area === 'supplier') {
      replace(routes.login.supplier());
    } else {
      replace(routes.login.root());
    }
  };

  useAutoLogout(handleLogout, isSessionActive);

  useEffect(() => {
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setIsLoadingSession(false);
    }, 4000);

    const restore = async () => {
      try {
        const restored = await sessionService.restoreSession();
        if (!mounted) return;

        if (restored) {
          if (restored.atorTipo === 'cliente') {
            const clientType = sessionService.getClientPersonType() || (route.area === 'business' ? 'pj' : 'pf');
            setSession({ clientId: restored.atorId, clientPersonType: clientType });
            if (route.area === 'login' && ['cliente', 'empresas'].includes(route.module)) {
              replace(clientType === 'pj' ? routes.business.dashboard() : routes.client.dashboard());
            }
          } else if (['admin', 'colaborador'].includes(restored.atorTipo)) {
            setSession({
              adminAuth: true,
              adminType: restored.atorTipo as 'admin' | 'colaborador',
              colaboradorId: restored.atorId,
              colaboradorNome: restored.atorNome,
              colaboradorModulos: restored.modulos || [],
              isGsaTv: sessionStorage.getItem('isGsaTv') === 'true',
            });
            if (route.area === 'login' && ['acesso-restrito', 'admin', 'colaborador'].includes(route.module)) {
              replace(defaultAdminPath(restored.atorTipo as 'admin' | 'colaborador', restored.modulos || []));
            }
          } else if (restored.atorTipo === 'prestador') {
            const access = await validateProviderSessionAccess(restored.atorId);
            if (!access) {
              await sessionService.endSession();
              setSession({});
              if (route.area === 'provider' && route.module !== 'home') {
                const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
                replace(`${routes.login.provider()}?returnTo=${returnTo}&msg=revoked`);
              }
              return;
            }
            setSession({ prestadorId: access.provider_id });
            if (route.area === 'login' && route.module === 'prestador') {
              replace(routes.provider.dashboard());
            }
          } else if (restored.atorTipo === 'fornecedor') {
            const { data: access, error } = await supabase.rpc('gsa_supplier_session_access_state');
            const supplierId = (access as any)?.supplier_id as string | undefined;
            // Mesma checagem usada no prestador: a sessão local precisa apontar
            // para o mesmo ator retornado pelo banco, senão é revogada.
            if (error || !(access as any)?.success || !supplierId || supplierId !== restored.atorId) {
              await sessionService.endSession();
              setSession({});
              return;
            }
            setSession({ fornecedorId: supplierId });
            if (window.location.pathname === '/login/fornecedor') replace(routes.supplier.dashboard());
          }
        } else if (
          ['client', 'business', 'admin'].includes(route.area)
          || (route.area === 'provider' && route.module !== 'home')
          || (route.area === 'supplier' && !['home', 'login', 'access'].includes(route.module))
          || (route.area === 'public' && route.module === 'affiliates' && !['login', 'acesso', 'cadastro', ''].includes(route.itemId || ''))
        ) {
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          const loginPath = (route.area === 'public' && route.module === 'affiliates')
            ? '/afiliados/login'
            : route.area === 'supplier'
              ? routes.login.supplier()
              : route.area === 'business'
                ? routes.login.business()
                : route.area === 'client'
                  ? routes.login.personal()
                  : route.area === 'admin'
                    ? routes.login.restricted()
                    : route.area === 'provider'
                      ? routes.login.provider()
                      : routes.login.root();
          replace(`${loginPath}?returnTo=${returnTo}`);
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
      } finally {
        if (mounted) {
          clearTimeout(safetyTimer);
          setIsLoadingSession(false);
        }
      }
    };
    restore();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
    };
  }, [route.area]);

  const activeView = route.area;
  const isAllowed = isRouteAllowed(route.area, session, route.module, route.submodule);

  useEffect(() => {
    if (!isLoadingSession && !isAllowed) {
      if (route.area === 'admin' && session.adminAuth) {
        replace(defaultAdminPath(session.adminType, session.colaboradorModulos || []));
      } else if (route.area === 'business' && session.clientId && session.clientPersonType === 'pf') {
        replace(routes.client.dashboard());
      } else if (route.area === 'client' && session.clientId && session.clientPersonType === 'pj') {
        replace(routes.business.dashboard());
      } else {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        const loginPath = (route.area === 'public' && route.module === 'affiliates')
          ? '/afiliados/login'
          : route.area === 'supplier'
            ? routes.login.supplier()
            : route.area === 'business'
              ? routes.login.business()
              : route.area === 'client'
                ? routes.login.personal()
                : route.area === 'admin'
                  ? routes.login.restricted()
                  : route.area === 'provider'
                    ? routes.login.provider()
                    : routes.login.root();
        replace(`${loginPath}?returnTo=${returnTo}`);
      }
    }
  }, [isLoadingSession, isAllowed, route.area, route.module, route.submodule, session]);

  if (isLoadingSession) {
    return <div className="min-h-screen flex items-center justify-center bg-neutral-50">Carregando sessão...</div>;
  }

  if (!isAllowed) {
    return null;
  }

  const publicPage = route.module === 'privacy'
    ? 'privacy'
    : route.module === 'services'
    ? 'services'
    : route.module === 'free-tools'
      ? 'free-tools'
    : route.module === 'systems'
      ? 'systems'
      : route.module === 'partners'
        ? 'partners'
        : route.module === 'ads'
          ? 'ads'
          : route.module === 'advertise'
            ? 'advertise'
            : 'home';
  const loginReturnSuffix = route.query.returnTo
    ? `?${new URLSearchParams({ returnTo: route.query.returnTo }).toString()}`
    : '';

  // Módulos de login efetivamente renderizados abaixo. Qualquer outro módulo
  // (ex.: /login/pessoal) caía em tela branca por não casar com nenhum bloco.
  const knownLoginModules = [
    'cliente', 'pessoa-fisica', 'empresa', 'acesso-restrito', 'admin',
    'colaborador', 'prestador', 'root', 'afiliado', 'careers', 'fornecedor',
  ];
  const isUnknownLoginRoute = activeView === 'login' && !knownLoginModules.includes(route.module);

  return (
    <FileViewerProvider>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-[#f8f7f5] font-sans text-neutral-900">
          <AffiliateTrackingBridge clientId={session.clientId} />
          <ErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
            {activeView === 'public' && route.module === 'affiliates' && !route.itemId && (
              <AffiliatePublicPage
                onBack={() => navigate(routes.public.home())}
                onLogin={() => navigate('/afiliados/login')}
                onRegister={() => navigate('/afiliados/login?mode=register')}
              />
            )}

            {((activeView === 'public' && route.module === 'affiliates' && ['login', 'acesso', 'cadastro'].includes(route.itemId || '')) || (activeView === 'login' && route.module === 'afiliado')) && (
              session.clientId ? (
                <ClientNotificationProvider clientId={session.clientId}>
                  <AfiliadoDashboard
                    clientId={session.clientId}
                    onLogout={handleLogout}
                    activeSubRoute="dashboard"
                  />
                </ClientNotificationProvider>
              ) : (
                <AffiliateAccessPage
                  initialMode={route.itemId === 'cadastro' || route.query.mode === 'register' ? 'register' : 'login'}
                  onLogin={(clientId) => handleLoginAfiliado(clientId || session.clientId || '')}
                  onBack={() => navigate(routes.public.affiliates())}
                />
              )
            )}

            {activeView === 'public' && route.module === 'affiliates' && ['dashboard', 'painel', 'links', 'comissoes', 'saques', 'perfil', 'pontos', 'suporte'].includes(route.itemId || '') && (
              session.clientId ? (
                <ClientNotificationProvider clientId={session.clientId}>
                  <AfiliadoDashboard
                    clientId={session.clientId}
                    onLogout={handleLogout}
                    activeSubRoute={route.itemId}
                  />
                </ClientNotificationProvider>
              ) : (
                <AffiliateAccessPage
                  initialMode="login"
                  onLogin={(clientId) => handleLoginAfiliado(clientId)}
                  onBack={() => navigate(routes.public.affiliates())}
                />
              )
            )}

            {activeView === 'public' && ['trabalhe-conosco', 'careers'].includes(route.module) && !['acesso', 'login'].includes(route.itemId || '') && (
              <CareersLandingPage
                onBackToSite={() => navigate(routes.public.home())}
                onAccessPortal={() => navigate(routes.login.careers())}
              />
            )}

            {((activeView === 'public' && ['trabalhe-conosco', 'careers'].includes(route.module) && ['acesso', 'login'].includes(route.itemId || '')) || (activeView === 'login' && route.module === 'careers')) && (
              <CareersAccessPage
                onBackToLanding={() => navigate(routes.public.careers())}
                onBackToSite={() => navigate(routes.public.home())}
              />
            )}

            {(activeView === 'unknown' || isUnknownLoginRoute || (activeView === 'public' && route.module === 'unknown')) && (
              <PublicNotFoundPage pathname={route.pathname} />
            )}

            {activeView === 'public' && route.module === 'vip' && (
              <PublicVIPPresentationPage
                clientId={session.clientId}
                onBack={() => navigate(routes.marketplace.root())}
              />
            )}

            {activeView === 'public' && route.module === 'protocolConsult' && (
              <ProtocolConsultPage />
            )}

            {activeView === 'public' && !['affiliates', 'trabalhe-conosco', 'careers', 'vip', 'protocolConsult'].includes(route.module) && (
              <Home
                onLoginClient={handleLoginClient}
                onGuestStore={() => navigate(routes.marketplace.root())}
                initialPublicPage={publicPage}
                initialServiceSlug={route.module === 'services' ? route.itemId : undefined}
                initialPartnerSlug={route.module === 'partners' ? route.itemId : undefined}
                onServiceDetailChange={(slug) => navigate(slug ? routes.public.serviceDetail(slug) : routes.public.services())}
                onPartnerDetailChange={(slug) => navigate(slug ? routes.public.partner(slug) : routes.public.partners())}
                onPublicPageChange={(page) => navigate(
                  page === 'privacy'
                    ? routes.public.privacy()
                    : page === 'home'
                    ? routes.public.home()
                    : page === 'services'
                      ? routes.public.services()
                      : page === 'free-tools'
                        ? routes.public.freeTools()
                      : page === 'partners'
                        ? routes.public.partners()
                        : page === 'ads'
                          ? routes.public.ads()
                          : page === 'advertise'
                            ? routes.public.advertise()
                            : routes.public.systems(),
                )}
                onLoginPage={() => navigate(routes.login.root())}
                onRestrictedLoginPage={() => navigate(routes.login.restricted())}
              />
            )}

            {activeView === 'login' && ['cliente', 'pessoa-fisica'].includes(route.module) && (
              <ClientLoginPage
                personType="pf"
                initialMode={route.submodule === 'recuperar-senha' || route.query.mode === 'recovery' ? 'recovery' : 'login'}
                onLoginClient={handleLoginClient}
                onBack={() => navigate(`${routes.login.root()}${loginReturnSuffix}`)}
                onSwitchPortal={() => navigate(`${routes.login.business()}${loginReturnSuffix}`)}
                onRegister={() => navigate(`${routes.login.root()}?mode=register&type=pf${loginReturnSuffix ? `&${loginReturnSuffix.replace('?', '')}` : ''}`)}
              />
            )}

            {activeView === 'login' && route.module === 'empresa' && route.submodule !== 'cadastro' && (
              <ClientLoginPage
                personType="pj"
                initialMode={route.submodule === 'recuperar-senha' || route.query.mode === 'recovery' ? 'recovery' : 'login'}
                onLoginClient={handleLoginClient}
                onBack={() => navigate(`${routes.login.root()}${loginReturnSuffix}`)}
                onSwitchPortal={() => navigate(`${routes.login.personal()}${loginReturnSuffix}`)}
                onRegister={() => navigate(`${routes.login.businessRegistration()}${loginReturnSuffix}`)}
              />
            )}

            {activeView === 'login' && route.module === 'empresa' && route.submodule === 'cadastro' && (
              <BusinessRegistrationPage
                onBack={() => navigate(`${routes.login.business()}${loginReturnSuffix}`)}
                onLogin={(cnpj) => {
                  const cnpjQuery = cnpj ? `&cnpj=${encodeURIComponent(cnpj)}` : '';
                  navigate(`${routes.login.business()}?mode=first_access${cnpjQuery}${loginReturnSuffix ? `&${loginReturnSuffix.replace('?', '')}` : ''}`);
                }}
              />
            )}

            {activeView === 'login' && ['acesso-restrito', 'admin', 'colaborador'].includes(route.module) && (
              <RestrictedAccessHubPage
                initialRole={route.module === 'admin' ? 'gestao' : 'colaborador'}
                onBack={() => navigate(`${routes.login.root()}${loginReturnSuffix}`)}
                onLoginAdmin={handleLoginAdmin}
              />
            )}

            {activeView === 'login' && route.module === 'prestador' && (
              <ProviderAccessPage
                initialMode={route.submodule === 'cadastro' || route.query.mode === 'register' ? 'register' : 'login'}
                onBack={() => navigate(`${routes.provider.home()}${loginReturnSuffix}`)}
                onLoginProvider={handleLoginPrestador}
                onModeChange={(mode) => navigate(
                  `${mode === 'register' ? routes.login.providerRegistration() : routes.login.provider()}${loginReturnSuffix}`,
                )}
              />
            )}

            {activeView === 'login' && route.module === 'root' && (
              <Home
                onLoginClient={handleLoginClient}
                onGuestStore={() => navigate(routes.marketplace.root())}
                initialPublicPage="home"
                onPublicPageChange={(page) => navigate(
                  page === 'home'
                    ? routes.public.home()
                    : page === 'services'
                      ? routes.public.services()
                      : page === 'free-tools'
                        ? routes.public.freeTools()
                      : page === 'partners'
                        ? routes.public.partners()
                        : page === 'ads'
                          ? routes.public.ads()
                          : page === 'advertise'
                            ? routes.public.advertise()
                            : routes.public.systems(),
                )}
                loginOnly
                onRestrictedLoginPage={() => navigate(`${routes.login.restricted()}${loginReturnSuffix}`)}
              />
            )}

            {activeView === 'provider' && route.module === 'home' && !session.prestadorId && (
              <ProviderLandingPage
                onBackToSite={() => navigate(routes.public.home())}
                onLogin={() => navigate(`${routes.login.provider()}${loginReturnSuffix}`)}
                onRegister={() => navigate(`${routes.login.providerRegistration()}${loginReturnSuffix}`)}
              />
            )}

            {activeView === 'supplier' && route.module === 'home' && !session.fornecedorId && (
              <FornecedorLandingPage
                onAccessLogin={() => navigate(routes.supplier.login())}
                onBackToSite={() => navigate(routes.public.home())}
              />
            )}

            {((activeView === 'supplier' && ['login', 'access'].includes(route.module) && !session.fornecedorId) || (activeView === 'login' && route.module === 'fornecedor')) && (
              <FornecedorAccessPage onLogin={handleLoginFornecedor} onBack={() => navigate(routes.supplier.home())} />
            )}

            {activeView === 'marketplace' && !session.clientId && (
              <MarketplaceGSAStore
                clientId=""
                initialTab={route.submodule?.replace('loja-', '') || 'home'}
                initialItemId={route.itemId}
                onNavigate={(mod, tab, itemId) => {
                  const targetTab = tab || 'home';
                  if (targetTab === 'home') navigate(routes.marketplace.root());
                  else if (targetTab === 'menu') navigate(routes.marketplace.menu());
                  else if (targetTab === 'produtos-assinaturas' || targetTab === 'loja') navigate(routes.marketplace.store.root());
                  else if (targetTab === 'produtos' || targetTab === 'loja-produtos') {
                    if (itemId) navigate(routes.marketplace.store.product(itemId));
                    else navigate(routes.marketplace.store.products());
                  } else if (targetTab === 'assinaturas' || targetTab === 'loja-assinaturas') {
                    if (itemId) navigate(routes.marketplace.store.subscription(itemId));
                    else navigate(routes.marketplace.store.subscriptions());
                  } else if (targetTab === 'pacotes-viagem') navigate(routes.marketplace.travelPackages.root());
                  else if (targetTab === 'classificados') navigate(routes.marketplace.classifieds.root());
                  else if (targetTab === 'saude') navigate(routes.marketplace.saude.root());
                  else if (targetTab === 'seguros') navigate(routes.marketplace.seguros.root());
                }}
                onBackToSite={() => navigate(routes.public.home())}
                onRequireAuth={() => {
                  const returnUrl = window.location.pathname + window.location.search;
                  const returnTo = encodeURIComponent(returnUrl);
                  navigate(`${routes.login.personal()}?returnTo=${returnTo}`);
                }}
              />
            )}

            {activeView === 'marketplace' && session.clientId && (
              <ClientNotificationProvider clientId={session.clientId}>
                <ClientPortal
                  clientId={session.clientId}
                  onLogout={handleLogout}
                  portalVariant={session.clientPersonType === 'pj' ? 'business' : 'personal'}
                  initialModule="gsa_store"
                  initialStoreTab={route.submodule?.replace('loja-', '') || 'home'}
                  initialStoreItemId={route.itemId}
                />
              </ClientNotificationProvider>
            )}

            {activeView === 'admin' && session.adminAuth && (
              <AdminNotificationProvider>
                <SecureAdminPanel
                  onLogout={handleLogout}
                  adminType={session.adminType || 'admin'}
                  colaboradorId={session.colaboradorId}
                  colaboradorNome={session.colaboradorNome}
                  colaboradorModulos={session.colaboradorModulos || []}
                  isGsaTv={session.isGsaTv}
                />
              </AdminNotificationProvider>
            )}

            {activeView === 'client' && session.clientId && (
              <ClientNotificationProvider clientId={session.clientId}>
                <ClientPortal clientId={session.clientId} onLogout={handleLogout} portalVariant="personal" initialModule={route.module} />
              </ClientNotificationProvider>
            )}

            {activeView === 'business' && session.clientId && (
              <ClientNotificationProvider clientId={session.clientId}>
                <ClientPortal clientId={session.clientId} onLogout={handleLogout} portalVariant="business" initialModule={route.module} />
              </ClientNotificationProvider>
            )}

            {activeView === 'advertiser' && <AdvertiserPortal />}

            {activeView === 'provider' && session.prestadorId && (
              <ProviderNotificationProvider prestadorId={session.prestadorId}>
                <ProviderRouteGuard>
                  <PrestadorDashboard prestadorId={session.prestadorId} onLogout={handleLogout} />
                </ProviderRouteGuard>
              </ProviderNotificationProvider>
            )}

            {activeView === 'supplier' && session.fornecedorId && (
              <FornecedorDashboard fornecedorId={session.fornecedorId} onLogout={handleLogout} />
            )}
          </Suspense>
          </ErrorBoundary>

          {['public', 'marketplace', 'client'].includes(activeView) && <AdvertisingSlot placementCode="SITE_STICKY_BOTTOM" variant="sticky" />}
          {isSessionActive && <FullscreenPrompt />}
          {isSessionActive && <WhatsAppButton />}
          <GSAChatbotWidget />
          <Toaster position="top-right" />
        </div>
      </QueryClientProvider>
    </FileViewerProvider>
  );
}

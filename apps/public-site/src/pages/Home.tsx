import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, ShieldAlert, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { GSAEnterpriseHomeFinal } from '../components/public/GSAEnterpriseHomeFinal';
import { ClientAccessModalWithReturn as ClientAccessModal, type ClientAccessMode } from '../components/auth/ClientAccessModalWithReturn';
import { AccessibleDialog } from '../components/ui/AccessibleDialog';
import { RestrictedAccessHubPage } from './RestrictedAccessHubPage';
import { AdvertisingPage } from '../components/public/AdvertisingPage';
import { useAppLocation } from '../routing/useAppLocation';
import { navigate, updateRouteQuery } from '../routing/navigationService';
import {
  getServicePackageSlug,
  publicServices,
  servicePackages,
  type Audience,
  type IconItem,
  type PublicPage,
  type ServicePackage,
} from '../data/publicServiceCatalog';
import { usePublicPageMetadata } from '../hooks/usePublicPageMetadata';
import { fetchPublicServiceCatalog } from '../lib/serviceCatalog';
import type { ClientPersonType } from '../lib/sessionService';

const SystemsPageFinal = lazy(() => import('../components/public/SystemsPageFinal').then((module) => ({ default: module.SystemsPageFinal })));

interface HomeProps {
  onLoginClient: (id: string, isRecovery?: boolean, personType?: ClientPersonType) => void;
  onGuestStore?: () => void;
  initialPublicPage?: PublicPage;
  initialServiceSlug?: string;
  initialPartnerSlug?: string;
  onPublicPageChange?: (page: PublicPage) => void;
  onServiceDetailChange?: (slug: string | null) => void;
  onPartnerDetailChange?: (slug: string | null) => void;
  onLoginPage?: () => void;
  onRestrictedLoginPage?: () => void;
  onAdminAuthenticated?: (details: { type: 'admin' | 'colaborador'; id?: string; nome?: string; modulos?: string[] }) => void;
  loginOnly?: boolean;
}

function PublicPageLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm font-bold text-white/70" role="status">Carregando página...</div>;
}

export function Home({
  onLoginClient,
  onGuestStore,
  initialPublicPage = 'home',
  initialServiceSlug,
  initialPartnerSlug,
  onPublicPageChange,
  onServiceDetailChange,
  onPartnerDetailChange,
  onLoginPage,
  onRestrictedLoginPage,
  onAdminAuthenticated,
  loginOnly = false,
}: HomeProps) {
  const location = useAppLocation();
  const [publicPage, setPublicPage] = useState<PublicPage>(initialPublicPage);
  const [publicAudience, setPublicAudience] = useState<Audience>('PF');
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [restrictedLoginOpen, setRestrictedLoginOpen] = useState(false);
  const [clientMode, setClientMode] = useState<ClientAccessMode>('login');
  const [managedPackages, setManagedPackages] = useState<ServicePackage[]>(servicePackages);
  const [managedServices, setManagedServices] = useState<IconItem[]>(publicServices);

  const selectedPackage = useMemo(() => (
    initialServiceSlug
      ? managedPackages.find((item) => getServicePackageSlug(item) === initialServiceSlug) || null
      : null
  ), [initialServiceSlug, managedPackages]);

  usePublicPageMetadata(loginOnly ? 'home' : publicPage, selectedPackage, loginOnly);

  useEffect(() => {
    setPublicPage(initialPublicPage);
  }, [initialPublicPage]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode');
    if (loginOnly) {
      setClientMode(mode === 'register' ? 'register' : 'login');
      setClientModalOpen(true);
    }
    if (params.get('restrictedLogin') === '1') {
      setRestrictedLoginOpen(true);
      updateRouteQuery({ restrictedLogin: null });
    }
  }, [loginOnly, location.pathname, location.search]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('msg') !== 'revoked') return;

    toast.error('Seu acesso foi encerrado pelo administrador. Entre em contato com o suporte.', {
      duration: 10000,
      position: 'top-center',
      icon: <ShieldAlert className="h-5 w-5 text-red-600" />,
    });

    params.delete('msg');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

  useEffect(() => {
    const handleOpenLogin = () => openClient('login');
    window.addEventListener('open-client-login', handleOpenLogin);
    return () => window.removeEventListener('open-client-login', handleOpenLogin);
  }, []);

  useEffect(() => {
    let active = true;
    fetchPublicServiceCatalog().then((catalog) => {
      if (!active) return;
      if (catalog.packages && catalog.packages.length > 0) {
        setManagedPackages(catalog.packages.map((item) => ({
          id: item.id,
          code: item.code,
          audience: item.audience,
          title: item.title,
          subtitle: item.subtitle,
          description: item.description,
          services: item.services,
        })));
      }
      if (catalog.services && catalog.services.length > 0) {
        setManagedServices(catalog.services.map((item) => ({
          icon: BriefcaseBusiness,
          title: item.title,
          text: item.description,
        })));
      }
    }).catch(() => {
      // Mantém pacotes padrão estáticos em caso de erro
    });
    return () => { active = false; };
  }, []);

  const changePublicPage = (page: PublicPage) => {
    setPublicPage(page);
    if (page !== 'services') onServiceDetailChange?.(null);
    if (page !== 'partners') onPartnerDetailChange?.(null);
    onPublicPageChange?.(page);
  };

  const openClient = (mode: ClientAccessMode) => {
    setClientMode(mode);
    setClientModalOpen(true);
  };

  const handlePublicLogin = onLoginPage ?? (() => openClient('login'));
  const openRestrictedLogin = onRestrictedLoginPage ?? (() => setRestrictedLoginOpen(true));
  const modalPersonType: ClientPersonType = new URLSearchParams(window.location.search).get('type') === 'pj' ? 'pj' : 'pf';

  return (
    <>
      {loginOnly ? null : publicPage === 'systems' ? (
        <Suspense fallback={<PublicPageLoading />}>
          <SystemsPageFinal onBack={() => changePublicPage('home')} onLogin={handlePublicLogin} />
        </Suspense>
      ) : publicPage === 'ads' || publicPage === 'advertise' ? (
        <AdvertisingPage
          mode={publicPage === 'advertise' ? 'advertise' : 'showcase'}
          onBack={() => changePublicPage('home')}
          onLogin={handlePublicLogin}
        />
      ) : (
        <GSAEnterpriseHomeFinal
          publicPage={publicPage}
          setPublicPage={changePublicPage}
          publicAudience={publicAudience}
          setPublicAudience={setPublicAudience}
          servicePackages={managedPackages}
          publicServices={managedServices}
          initialServiceSlug={initialServiceSlug}
          initialPartnerSlug={initialPartnerSlug}
          onServiceDetailChange={onServiceDetailChange}
          onPartnerDetailChange={onPartnerDetailChange}
          onGuestStore={onGuestStore}
          onClientLogin={handlePublicLogin}
          onAdminLogin={openRestrictedLogin}
        />
      )}

      <ClientAccessModal isOpen={clientModalOpen} initialMode={clientMode} initialPersonType={modalPersonType} onClose={() => { setClientModalOpen(false); if (loginOnly) navigate('/'); }} onLoginClient={onLoginClient} />
      <AccessibleDialog
        isOpen={restrictedLoginOpen}
        onClose={() => setRestrictedLoginOpen(false)}
        ariaLabel="Acesso administrativo restrito"
        panelClassName="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl"
        overlayClassName="items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
      >
        <div className="relative">
          <button type="button" onClick={() => setRestrictedLoginOpen(false)} aria-label="Fechar acesso restrito" className="absolute right-4 top-4 z-10 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
          <RestrictedAccessHubPage
            initialRole="gestao"
            onBack={() => setRestrictedLoginOpen(false)}
            onLoginAdmin={(details) => {
              setRestrictedLoginOpen(false);
              onAdminAuthenticated?.(details);
            }}
            presentation="modal"
          />
        </div>
      </AccessibleDialog>
    </>
  );
}

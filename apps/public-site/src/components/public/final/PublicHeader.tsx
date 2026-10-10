import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Calculator,
  Code2,
  Home as HomeIcon,
  LockKeyhole,
  LogIn,
  Menu,
  Palette,
  ShoppingBag,
  X,
} from 'lucide-react';
import { LogoGSA } from '../../ui/LogoGSA';
import { navigate } from '../../../routing/navigationService';
import type { PublicPage } from '../../../data/publicServiceCatalog';

export type PublicHeaderPage = PublicPage | 'brand-journey' | 'marketplace' | 'ads' | 'careers' | 'free-tools';

interface PublicHeaderProps {
  currentPage?: PublicHeaderPage;
  onNavigatePage?: (page: PublicPage) => void;
  onGuestStore?: () => void;
  onClientLogin: () => void;
}

interface HeaderNavLink {
  id: PublicHeaderPage;
  label: string;
  href: string;
  icon: typeof HomeIcon;
}

const NAV_LINKS: HeaderNavLink[] = [
  { id: 'home', label: 'Início', href: '/', icon: HomeIcon },
  { id: 'services', label: 'Serviços e Assinaturas', href: '/servicos-e-assinaturas', icon: BriefcaseBusiness },
  { id: 'marketplace', label: 'Marketplace GSA', href: '/marketplace', icon: ShoppingBag },
  { id: 'systems', label: 'Sites e Sistemas', href: '/criacao-de-site-e-sistemas', icon: Code2 },
  { id: 'brand-journey', label: 'Identidade e Web Design', href: '/identidade-e-web-design', icon: Palette },
  { id: 'free-tools', label: 'Serviços Gratuitos', href: '/servicos-gratuitos', icon: Calculator },
];

const PUBLIC_MOBILE_STYLES = `
  body.gsa-public-systems,
  body.gsa-public-brand {
    overflow-x: hidden;
    overscroll-behavior-x: none;
  }

  body.gsa-public-systems main,
  body.gsa-public-brand main {
    overflow-x: clip;
  }

  body.gsa-public-systems main *,
  body.gsa-public-brand main * {
    min-width: 0;
  }

  body.gsa-public-systems main h1,
  body.gsa-public-systems main h2,
  body.gsa-public-systems main h3,
  body.gsa-public-brand main h1,
  body.gsa-public-brand main h2,
  body.gsa-public-brand main h3,
  body.gsa-public-systems main p,
  body.gsa-public-brand main p {
    overflow-wrap: anywhere;
  }

  body.gsa-public-systems button,
  body.gsa-public-brand button {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  body.gsa-public-systems main > section:first-of-type {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    background:
      radial-gradient(circle at 92% 16%, rgba(199, 164, 88, 0.16), transparent 25rem),
      linear-gradient(135deg, #f8f5ee 0%, #f1ece2 52%, #eae2d4 100%) !important;
    border-bottom-color: #d8cfbf !important;
    color: #17202a !important;
  }

  body.gsa-public-systems main > section:first-of-type::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    z-index: -1;
    height: 3px;
    background: linear-gradient(90deg, #8a6b2f 0%, #d7b96e 36%, rgba(215, 185, 110, 0) 82%);
  }

  body.gsa-public-systems main > section:first-of-type::after {
    content: '';
    position: absolute;
    z-index: -1;
    right: -10rem;
    bottom: -15rem;
    width: 34rem;
    height: 34rem;
    border: 1px solid rgba(138, 107, 47, 0.12);
    border-radius: 50%;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child {
    position: relative;
    padding-left: 1.5rem;
    border-left: 3px solid #c7a458;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > p:first-child {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: #806128 !important;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > p:first-child::before {
    content: '';
    width: 2.5rem;
    height: 1px;
    background: #b8903e;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child h1 {
    max-width: 13ch;
    color: #111820 !important;
    text-wrap: balance;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > p:nth-of-type(2) {
    max-width: 42rem;
    color: #525e68 !important;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > div[class*="flex-col"] > button:first-child {
    border: 1px solid #c3a052 !important;
    background: linear-gradient(180deg, #dfc57f 0%, #d3b363 100%) !important;
    color: #151b22 !important;
    box-shadow: 0 14px 30px rgba(93, 71, 27, 0.18);
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > div[class*="flex-col"] > button:first-child:hover {
    transform: translateY(-1px);
    background: linear-gradient(180deg, #e6cf8f 0%, #d9bc70 100%) !important;
    box-shadow: 0 18px 36px rgba(93, 71, 27, 0.22);
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > div[class*="flex-col"] > button:nth-child(2) {
    border-color: #858f98 !important;
    background: rgba(255, 255, 255, 0.55) !important;
    color: #17202a !important;
    box-shadow: 0 8px 22px rgba(35, 45, 54, 0.07);
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > div[class*="flex-col"] > button:nth-child(2):hover {
    border-color: #8a6b2f !important;
    background: rgba(255, 255, 255, 0.82) !important;
    color: #6f5427 !important;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > ul {
    overflow: hidden;
    border: 1px solid #d8d0c3 !important;
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.48);
    padding: 0 !important;
    box-shadow: 0 12px 30px rgba(43, 50, 56, 0.06);
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > ul li {
    min-height: 4.6rem;
    align-items: center;
    padding: 1rem 1.1rem;
    color: #59636d !important;
  }

  body.gsa-public-systems main > section:first-of-type > div > div:first-child > ul li + li {
    border-left: 1px solid #ddd5c8;
  }

  body.gsa-public-systems main > section:first-of-type > div > aside {
    position: relative;
    overflow: hidden;
    border-color: rgba(215, 185, 110, 0.32) !important;
    border-radius: 1rem;
    background: linear-gradient(180deg, #132231 0%, #0b1723 100%) !important;
    color: #ffffff !important;
    box-shadow:
      inset 0 3px 0 #d7b96e,
      0 32px 70px rgba(18, 27, 36, 0.22);
  }

  body.gsa-public-systems main > section:first-of-type > div > aside::after {
    content: '';
    position: absolute;
    right: -5rem;
    top: -6rem;
    width: 13rem;
    height: 13rem;
    border: 1px solid rgba(215, 185, 110, 0.14);
    border-radius: 50%;
  }

  @media (max-width: 767px) {
    body.gsa-public-systems main h1,
    body.gsa-public-brand main h1 {
      font-size: clamp(2.15rem, 10.5vw, 3.15rem) !important;
      line-height: 1.04 !important;
      letter-spacing: -0.035em !important;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child h1 {
      max-width: 12.5ch;
      font-size: clamp(2.15rem, 9vw, 2.8rem) !important;
      line-height: 1.02 !important;
      letter-spacing: -0.03em !important;
    }

    body.gsa-public-systems main h2,
    body.gsa-public-brand main h2 {
      font-size: clamp(1.8rem, 8vw, 2.55rem) !important;
      line-height: 1.08 !important;
    }

    body.gsa-public-systems main h3,
    body.gsa-public-brand main h3 {
      line-height: 1.18 !important;
    }

    body.gsa-public-systems main > section:first-of-type > div,
    body.gsa-public-brand main > section:first-of-type > div {
      min-height: auto !important;
      padding-top: 3.25rem !important;
      padding-bottom: 3.25rem !important;
    }

    body.gsa-public-systems main > section:first-of-type > div {
      gap: 2.5rem !important;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child,
    body.gsa-public-brand main > section:first-of-type > div > div:first-child {
      width: 100%;
      max-width: none;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child {
      padding-left: 1rem;
      border-left-width: 2px;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child > p:first-child::before {
      width: 1.6rem;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child > p:nth-of-type(2) {
      font-size: 1rem !important;
      line-height: 1.75 !important;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child > div[class*="flex-col"] > button,
    body.gsa-public-brand main > section:first-of-type > div > div:first-child > div[class*="flex-col"] > button {
      width: 100%;
      min-height: 50px;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child > ul {
      display: block !important;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child > ul li {
      min-height: 0;
      padding: 0.9rem 1rem;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child > ul li + li {
      border-left: 0;
      border-top: 1px solid #ddd5c8;
    }

    body.gsa-public-systems main > section:first-of-type > div > aside {
      border-radius: 0.85rem;
    }

    body.gsa-public-systems main section,
    body.gsa-public-brand main section {
      scroll-margin-top: 5rem;
    }

    body.gsa-public-systems main details summary,
    body.gsa-public-brand main details summary {
      font-size: 1.05rem !important;
      line-height: 1.35 !important;
    }

    body.gsa-public-systems main [class*="overflow-x-auto"],
    body.gsa-public-brand main [class*="overflow-x-auto"] {
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x proximity;
      overscroll-behavior-inline: contain;
    }

    body.gsa-public-systems main [class*="overflow-x-auto"]::-webkit-scrollbar,
    body.gsa-public-brand main [class*="overflow-x-auto"]::-webkit-scrollbar {
      display: none;
    }

    body.gsa-public-systems footer,
    body.gsa-public-brand footer {
      padding-bottom: max(2rem, env(safe-area-inset-bottom));
    }
  }

  @media (max-width: 420px) {
    body.gsa-public-systems main h1,
    body.gsa-public-brand main h1 {
      font-size: clamp(2rem, 10vw, 2.65rem) !important;
    }

    body.gsa-public-systems main > section:first-of-type > div > div:first-child h1 {
      font-size: clamp(2rem, 8.7vw, 2.45rem) !important;
    }

    body.gsa-public-systems main h2,
    body.gsa-public-brand main h2 {
      font-size: clamp(1.65rem, 8vw, 2.15rem) !important;
    }

    .gsa-public-header-login-label {
      display: none;
    }

    .gsa-public-header-login {
      width: 42px;
      height: 42px;
      padding: 0 !important;
      justify-content: center;
    }
  }
`;

export function PublicHeader({
  currentPage = 'home',
  onNavigatePage,
  onGuestStore,
  onClientLogin,
}: PublicHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clientAreaChooserOpen, setClientAreaChooserOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const clientAreaTriggerRef = useRef<HTMLButtonElement>(null);
  const clientAreaDialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const bodyClass = currentPage === 'systems'
      ? 'gsa-public-systems'
      : currentPage === 'brand-journey'
        ? 'gsa-public-brand'
        : null;

    document.body.classList.remove('gsa-public-systems', 'gsa-public-brand');
    if (bodyClass) document.body.classList.add(bodyClass);

    return () => {
      if (bodyClass) document.body.classList.remove(bodyClass);
    };
  }, [currentPage]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeMenu = () => setMobileMenuOpen(false);
    window.addEventListener('resize', closeMenu);
    return () => window.removeEventListener('resize', closeMenu);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!clientAreaChooserOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = clientAreaTriggerRef.current ?? document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => {
      clientAreaDialogRef.current?.querySelector<HTMLElement>('[data-autofocus="true"]')?.focus();
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setClientAreaChooserOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !clientAreaDialogRef.current) return;
      const focusable = Array.from(clientAreaDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [clientAreaChooserOpen]);

  const handleLinkClick = (link: HeaderNavLink) => {
    setMobileMenuOpen(false);

    if (link.id === 'marketplace') {
      if (onGuestStore) {
        onGuestStore();
      } else {
        navigate('/marketplace');
      }
      return;
    }

    if (link.id === 'brand-journey') {
      navigate('/identidade-e-web-design');
      return;
    }

    const publicPageId = link.id as PublicPage;
    if (onNavigatePage) {
      onNavigatePage(publicPageId);
    }
    navigate(link.href);
  };

  const isSolidBar = isScrolled || currentPage !== 'home';

  return (
    <>
      {(currentPage === 'systems' || currentPage === 'brand-journey') && <style>{PUBLIC_MOBILE_STYLES}</style>}
      <header
        className={`${currentPage === 'home' ? 'gsa-home-header' : ''} fixed inset-x-0 top-0 z-[90] transition-all duration-300 ${
          isSolidBar
            ? 'border-b border-white/10 bg-black py-2.5 shadow-xl sm:py-3'
            : 'border-b border-white/10 bg-black py-2.5 shadow-md sm:py-3'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-4">
            {currentPage !== 'home' && (
              <>
                <button
                  type="button"
                  onClick={() => handleLinkClick(NAV_LINKS[0])}
                  className="flex items-center gap-2 text-xs font-bold text-white/80 transition hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 text-[#d8bd73]" />
                  <span className="hidden sm:inline">Voltar ao site</span>
                </button>
                <span className="h-5 w-px bg-white/20 sm:block" />
              </>
            )}
            <button
              type="button"
              onClick={() => handleLinkClick(NAV_LINKS[0])}
              aria-label="Ir para a página inicial"
              className="flex min-w-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73]"
            >
              <LogoGSA size="sm" variant="light" showText />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {currentPage === 'home' && (
              <nav aria-label="Navegação da home" className="hidden items-center gap-6 text-sm font-semibold text-white/85 md:flex md:mr-5">
                <a href="#gsa-navigator" className="rounded hover:text-[#d8bd73] focus-visible:ring-2 focus-visible:ring-[#d8bd73]">Soluções</a>
                <a href="#sobre-gsa" className="rounded hover:text-[#d8bd73] focus-visible:ring-2 focus-visible:ring-[#d8bd73]">Sobre a GSA</a>
                <a href="#contato-gsa" className="rounded hover:text-[#d8bd73] focus-visible:ring-2 focus-visible:ring-[#d8bd73]">Contato</a>
              </nav>
            )}
            <button
              ref={clientAreaTriggerRef}
              type="button"
              onClick={() => {
                if (currentPage === 'services') {
                  window.location.assign('/gsa3/cliente/inicio');
                  return;
                }
                if (currentPage === 'home') {
                  setMobileMenuOpen(false);
                  setClientAreaChooserOpen(true);
                  return;
                }
                onClientLogin();
              }}
              aria-label="Acessar área do cliente"
              className="gsa-public-header-login inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#d8bd73] bg-white/5 px-3 py-2 text-xs font-bold text-[#d8bd73] transition hover:bg-[#d8bd73] hover:text-[#080c12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73] sm:px-4"
            >
              <LockKeyhole className="h-4 w-4 text-[#d8bd73]" />
              <span className="gsa-public-header-login-label">Área do Cliente</span>
            </button>
            {currentPage === 'home' && (
              <button type="button" aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={mobileMenuOpen} aria-controls="home-mobile-nav" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#d8bd73] focus-visible:ring-2 focus-visible:ring-[#d8bd73] md:hidden">
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>
        {currentPage === 'home' && mobileMenuOpen && (
          <nav id="home-mobile-nav" aria-label="Navegação móvel da home" onKeyDown={(event) => { if (event.key === 'Escape') { setMobileMenuOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="home-mobile-nav"]')?.focus(); } }} className="mt-3 grid border-t border-white/10 bg-[#080c12] px-5 py-3 text-base text-white md:hidden">
            {[['#gsa-navigator', 'Soluções'], ['#sobre-gsa', 'Sobre a GSA'], ['#contato-gsa', 'Contato']].map(([href, label]) => <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded px-3 py-3 hover:text-[#d8bd73] focus-visible:ring-2 focus-visible:ring-[#d8bd73]">{label}</a>)}
          </nav>
        )}
      </header>
      {clientAreaChooserOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#05080d]/78 p-3 backdrop-blur-md sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClientAreaChooserOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-area-chooser-title"
            aria-describedby="client-area-chooser-description"
            ref={clientAreaDialogRef}
            className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#0d1622] p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.48)] sm:max-h-[calc(100vh-3rem)] sm:max-w-3xl sm:rounded-3xl sm:border-[#d8bd73]/30 sm:p-7"
          >
            <div className="pointer-events-none absolute -right-24 -top-24 hidden h-64 w-64 rounded-full border border-[#d8bd73]/15 sm:block" />
            <button
              type="button"
              onClick={() => setClientAreaChooserOpen(false)}
              aria-label="Fechar seleção de área"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73] sm:right-5 sm:top-5 sm:h-10 sm:w-10"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative pr-10 sm:pr-12">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#d8bd73] sm:text-xs sm:font-black sm:tracking-[0.24em]">Acesso do cliente</p>
              <h2 id="client-area-chooser-title" className="mt-2 text-lg font-semibold tracking-tight sm:mt-3 sm:text-3xl sm:font-black">
                Onde deseja acessar?
              </h2>
              <p id="client-area-chooser-description" className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-white/60 sm:mt-2 sm:text-sm sm:text-white/65">
                Escolha o ambiente para continuar.
              </p>
            </div>

            <div className="relative mt-4 grid gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-4">
              <button
                type="button"
                onClick={() => window.location.assign('/gsa3/cliente/inicio')}
                aria-label="Entrar na Área de Serviços: propostas, contratos e documentos"
                data-autofocus="true"
                className="group flex min-h-[70px] items-center gap-3 rounded-xl border border-[#d8bd73]/45 bg-gradient-to-r from-[#26394c] to-[#1b2b3c] p-3 text-left transition duration-200 hover:border-[#e5cb81]/80 hover:from-[#2b4054] hover:to-[#203449] hover:shadow-[0_8px_20px_rgba(216,189,115,0.12)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73] motion-reduce:transition-none sm:min-h-52 sm:flex-col sm:items-start sm:rounded-2xl sm:bg-gradient-to-br sm:p-5 sm:hover:-translate-y-0.5 sm:hover:shadow-[0_18px_40px_rgba(216,189,115,0.14)]"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d8bd73] text-[#0d1622] sm:h-12 sm:w-12 sm:rounded-xl">
                  <BriefcaseBusiness className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:block">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold sm:mt-4 sm:text-lg sm:font-black">Área de Serviços</span>
                    <span className="mt-0.5 text-[10px] leading-snug text-white/75 sm:mt-1 sm:text-sm sm:leading-relaxed sm:text-white/70">Propostas, contratos e documentos.</span>
                    <span className="mt-2 hidden items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#e5cb81] sm:inline-flex">
                      Acessar área <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[#e5cb81] transition-transform group-hover:translate-x-0.5 sm:hidden" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setClientAreaChooserOpen(false);
                  onClientLogin();
                }}
                aria-label="Entrar na Área do Marketplace: pedidos, assinaturas e pagamentos"
                className="group flex min-h-[70px] items-center gap-3 rounded-xl border border-white/15 bg-[#202d3b] p-3 text-left transition duration-200 hover:border-white/30 hover:bg-[#273647] hover:shadow-[0_8px_20px_rgba(0,0,0,0.18)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transition-none sm:min-h-52 sm:flex-col sm:items-start sm:rounded-2xl sm:p-5 sm:hover:-translate-y-0.5 sm:hover:shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8bd73]/20 bg-[#d8bd73]/15 text-[#e5cb81] sm:h-12 sm:w-12 sm:rounded-xl">
                  <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:block">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-semibold sm:mt-4 sm:text-lg sm:font-black">Área do Marketplace</span>
                    <span className="mt-0.5 text-[10px] leading-snug text-white/75 sm:mt-1 sm:text-sm sm:leading-relaxed sm:text-white/70">Pedidos, assinaturas e pagamentos.</span>
                    <span className="mt-2 hidden items-center gap-1.5 text-xs font-black uppercase tracking-wider text-white/85 sm:inline-flex sm:mt-4">
                      Acessar área <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-white/90 transition-transform group-hover:translate-x-0.5 sm:hidden" />
                </span>
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

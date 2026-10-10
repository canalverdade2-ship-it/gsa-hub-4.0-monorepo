import type { ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { LogoGSA } from '../ui/LogoGSA';
import { HomeLogoLink } from '../ui/HomeLogoLink';

interface InstitutionalAccessLayoutProps {
  children: ReactNode;
  onBack?: () => void;
  backLabel: string;
  skipTarget: string;
  footerNote: string;
}

interface InstitutionalAccessHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  aside: ReactNode;
}

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=78';

export function InstitutionalAccessLayout({
  children,
  onBack,
  backLabel,
  skipTarget,
  footerNote,
}: InstitutionalAccessLayoutProps) {
  return (
    <main className="flex min-h-screen flex-col bg-[#f3f0e8] text-[#0b1825]">
      <a
        href={`#${skipTarget}`}
        className="sr-only z-[100] bg-white px-4 py-3 font-semibold text-[#0b1825] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Ir para o conteúdo principal
      </a>

      <header className="border-b border-white/10 bg-[#080c12] text-white">
        <div className="mx-auto flex min-h-[76px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <HomeLogoLink><LogoGSA size="sm" variant="light" showText /></HomeLogoLink>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 border border-white/20 px-3 text-xs font-semibold text-white/80 transition hover:border-[#d5b86b] hover:text-[#d5b86b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d5b86b] sm:px-4"
            >
              <ArrowLeft className="h-4 w-4 text-[#d5b86b]" />
              <span className="hidden min-[380px]:inline">{backLabel}</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-white/10 bg-[#080c12] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© {new Date().getFullYear()} GSA HUB — Soluções Digitais.</span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#d5b86b]" />
            {footerNote}
          </span>
        </div>
      </footer>
    </main>
  );
}

export function InstitutionalAccessHero({
  eyebrow,
  title,
  description,
  aside,
}: InstitutionalAccessHeroProps) {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#07111d] text-white">
      <img
        src={HERO_IMAGE}
        alt=""
        aria-hidden="true"
        decoding="async"
        referrerPolicy="no-referrer"
        className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-[0.14] grayscale"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(7,17,29,0.98)_0%,rgba(7,17,29,0.92)_58%,rgba(7,17,29,0.78)_100%)]" />

      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-16 lg:px-10 lg:py-16">
        <div>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#d5b86b] sm:text-xs">
            <span className="h-px w-10 bg-[#d5b86b]" />
            {eyebrow}
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/68 sm:text-base sm:leading-8">
            {description}
          </p>
        </div>

        <div className="border-l border-white/20 pl-6 text-sm leading-7 text-white/62 sm:pl-8">
          {aside}
        </div>
      </div>
    </section>
  );
}

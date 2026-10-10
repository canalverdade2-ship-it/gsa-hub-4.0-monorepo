import { ArrowLeft, ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { LogoGSA } from '../ui/LogoGSA';
import { HomeLogoLink } from '../ui/HomeLogoLink';
import '../../affiliates.css';

interface AffiliatePublicPageProps {
  onBack: () => void;
  onLogin: () => void;
  onRegister: () => void;
}

const highlights = [
  'Ativação sem mensalidade',
  'Links oficiais e rastreáveis',
  'Acompanhamento das indicações',
  'Comissões e pagamentos pelo portal',
];

export function AffiliatePublicPage({ onBack, onLogin, onRegister }: AffiliatePublicPageProps) {
  return (
    <div className="affiliate-page min-h-screen bg-[#0b1522] text-white selection:bg-[#c59a4a] selection:text-[#0b1522]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1522]/95 text-white backdrop-blur-md">
        <nav className="mx-auto flex h-[78px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12" aria-label="Navegação do Programa de Afiliados">
          <div className="flex min-w-0 items-center gap-5 sm:gap-7">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-white/65 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ddc28d] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1522]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Voltar ao site</span>
            </button>
            <span className="hidden h-7 w-px bg-white/20 sm:block" aria-hidden="true" />
            <HomeLogoLink><LogoGSA size="sm" variant="light" showText className="min-w-0" /></HomeLogoLink>
          </div>

          <button
            type="button"
            onClick={onLogin}
            className="inline-flex items-center gap-2 border border-[#ddc28d] px-4 py-2.5 text-sm font-semibold text-[#f0ddb5] transition-colors hover:bg-[#ddc28d] hover:text-[#0b1522] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1522] sm:px-5"
          >
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Portal do Afiliado</span>
            <span className="sm:hidden">Entrar</span>
          </button>
        </nav>
      </header>

      <main>
        <section className="border-b border-white/10 bg-[#0b1522] text-white" aria-labelledby="affiliate-hero-title">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-20 lg:px-12 lg:py-24 xl:gap-24">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ddc28d] sm:text-xs">
                <span className="h-px w-8 bg-[#c59a4a]" aria-hidden="true" />
                Programa de Afiliados GSA HUB
              </div>

              <h1 id="affiliate-hero-title" className="mt-7 text-4xl font-semibold leading-[1.06] tracking-[-0.04em] text-white sm:text-5xl lg:text-[4rem]">
                Seja bem-vindo ao Programa de Afiliados.
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-[#c8d0da] sm:text-lg">
                Aqui você acompanha seus links, indicações e comissões do Marketplace GSA em um só lugar, com praticidade e transparência.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={onRegister}
                  className="inline-flex min-h-14 items-center justify-center gap-3 bg-[#c59a4a] px-7 text-sm font-bold text-[#0b1522] transition-colors hover:bg-[#ddc28d] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1522]"
                >
                  Quero participar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onLogin}
                  className="inline-flex min-h-14 items-center justify-center border border-white/45 px-7 text-sm font-bold text-white transition-colors hover:border-white hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ddc28d] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1522]"
                >
                  Acessar portal
                </button>
              </div>

              <ul className="mt-10 grid gap-x-8 gap-y-4 border-t border-white/15 pt-7 text-sm font-semibold text-[#d6dce3] sm:grid-cols-2" aria-label="Recursos do programa">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-[#c59a4a] text-[#ddc28d]">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="border border-[#c9c2b6] bg-[#f4f0e8] text-[#142033]" aria-labelledby="affiliate-portal-title">
              <div className="border-b border-[#c9c2b6] px-6 py-6 sm:px-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8d6829]">Sua área de acompanhamento</p>
                <h2 id="affiliate-portal-title" className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#0b1522]">Tudo em um só portal</h2>
                <p className="mt-4 text-sm leading-7 text-[#56606d]">
                  Ative seu perfil, compartilhe seus links do Marketplace e acompanhe os resultados diretamente pela sua conta.
                </p>
              </div>
              <ol className="px-6 sm:px-8">
                {['Ative seu perfil de afiliado', 'Compartilhe seus links oficiais', 'Acompanhe indicações e comissões'].map((step, index) => (
                  <li key={step} className="grid grid-cols-[36px_1fr] gap-4 border-b border-[#d1c9bc] py-4 last:border-b-0">
                    <span className="font-mono text-xs font-bold text-[#8d6829]">{String(index + 1).padStart(2, '0')}</span>
                    <p className="text-sm font-semibold leading-6 text-[#273548]">{step}</p>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}

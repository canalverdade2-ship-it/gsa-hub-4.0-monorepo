import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  Calculator,
  ChevronRight,
  Code2,
  Phone,
  Shield,
  ShoppingBag,
  Star,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { PublicPage } from '../../../data/publicServiceCatalog';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';

export type HomeServiceCategory = 'business' | 'technology' | 'people' | 'marketplace' | 'free-tools';

interface PublicHomeLandingProps {
  reduceMotion: boolean;
  setPublicPage: (page: PublicPage) => void;
  onGuestStore?: () => void;
  onExploreCategory?: (category: HomeServiceCategory) => void;
}

interface ServiceCategoryCard {
  icon: LucideIcon;
  title: string;
  description: string;
  examples: string[];
  category: HomeServiceCategory;
  badgeColor: string;
}

const reveal = (reduceMotion: boolean, delay = 0) => ({
  initial: reduceMotion ? false : { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.15 },
  transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] as const },
});

export function PublicHomeLanding({ reduceMotion, setPublicPage, onGuestStore, onExploreCategory }: PublicHomeLandingProps) {
  const openStore = onGuestStore || (() => navigate(routes.marketplace.root()));
  const exploreCategory = (category: HomeServiceCategory) => {
    if (onExploreCategory) {
      onExploreCategory(category);
      return;
    }
    if (category === 'technology') setPublicPage('systems');
    else if (category === 'marketplace') openStore();
    else if (category === 'free-tools') setPublicPage('free-tools');
    else setPublicPage('services');
  };

  useEffect(() => {
    const sections = document.querySelectorAll('#servicos-gsa, #sobre-gsa, #contato-gsa');
    const visibleSections = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      });
      document.body.classList.toggle('gsa-protection-in-view', visibleSections.size > 0);
    }, { threshold: 0 });
    sections.forEach(section => observer.observe(section));
    return () => {
      observer.disconnect();
      document.body.classList.remove('gsa-protection-in-view');
    };
  }, []);

  const serviceCards: ServiceCategoryCard[] = [
    {
      icon: Building2,
      title: 'Empresa e regularização',
      description: 'Apoio para abrir, organizar e manter sua empresa em dia.',
      examples: ['Abertura de empresa', 'MEI', 'Regularização fiscal'],
      category: 'business',
      badgeColor: 'bg-[#d5b86b]/15 text-[#d5b86b]',
    },
    {
      icon: Code2,
      title: 'Tecnologia e presença digital',
      description: 'Tire seu projeto digital do papel e fortaleça sua marca.',
      examples: ['Sites e sistemas', 'Aplicativos', 'Identidade visual'],
      category: 'technology',
      badgeColor: 'bg-[#5b9bd5]/15 text-[#5b9bd5]',
    },
    {
      icon: UsersRound,
      title: 'Soluções para pessoas',
      description: 'Serviços para cuidar de documentos, direitos e organização financeira.',
      examples: ['INSS e previdência', 'CNH e veículos', 'Finanças e CPF'],
      category: 'people',
      badgeColor: 'bg-[#6ec85b]/15 text-[#4b9e3b]',
    },
    {
      icon: ShoppingBag,
      title: 'Produtos e assinaturas',
      description: 'Encontre produtos, planos e ofertas disponíveis no Marketplace GSA.',
      examples: ['Planos e assinaturas', 'Produtos digitais', 'Ofertas da loja'],
      category: 'marketplace',
      badgeColor: 'bg-[#d5b86b]/15 text-[#8b6d2e]',
    },
    {
      icon: Calculator,
      title: 'Serviços Gratuitos',
      description: 'Calculadoras, simuladores e ferramentas para tomar decisões melhores no dia a dia.',
      examples: ['Calculadoras', 'Simuladores', 'Ferramentas úteis'],
      category: 'free-tools',
      badgeColor: 'bg-[#d5b86b]/15 text-[#8b6d2e]',
    },
  ];

  const howItWorksSteps = [
    { number: '01', title: 'Fale com a gente', text: 'Você conta o que precisa e a gente entende sua necessidade antes de qualquer proposta.' },
    { number: '02', title: 'Receba a solução', text: 'Apresentamos as opções adequadas para o seu caso, com transparência e clareza.' },
    { number: '03', title: 'Acompanhe tudo', text: 'Acompanhe o andamento pelo portal do cliente ou pelo nosso WhatsApp.' },
    { number: '04', title: 'Resultado garantido', text: 'Não paramos até resolver. Suporte contínuo em cada etapa da sua solicitação.' },
  ];

  return (
    <main className="overflow-hidden bg-[#f3f0e8]">

      {/* ─── SERVIÇOS PRINCIPAIS ─── */}
      <section id="servicos-gsa" className="relative z-10 bg-[#f3f0e8] px-5 pt-28 pb-10 sm:px-8 sm:pt-28 sm:pb-12 lg:px-10 lg:pt-32 lg:pb-16">
        <div className="mx-auto max-w-7xl">
          <motion.div {...reveal(reduceMotion)} className="mb-8">
            <div>
              <h2 className="whitespace-normal text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-[#0b1825] lg:whitespace-nowrap">
                O que podemos
                <span className="mt-2 block font-serif font-normal italic text-[#806329] lg:ml-3 lg:mt-0 lg:inline">resolver para você?</span>
              </h2>
            </div>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {serviceCards.map(({ icon: Icon, title, description, examples, category, badgeColor }, index) => (
              <motion.div
                key={title}
                {...reveal(reduceMotion, index * 0.14)}
                whileHover={reduceMotion ? undefined : { scale: 1.045, y: -6 }}
                className="group relative flex h-[170px] min-h-0 flex-col overflow-visible rounded-2xl border border-[#d4cbbb] bg-white shadow-[0_4px_20px_rgba(11,24,37,0.05)] transition-[border-color,box-shadow] duration-300 hover:border-[#b8973c] hover:shadow-[0_18px_42px_rgba(11,24,37,0.2)] sm:h-auto sm:min-h-[218px]"
              >
                <div className="flex min-h-0 flex-1 flex-col py-2.5 pl-4 pr-2.5 sm:p-5">
                  <div className="flex items-center justify-between">
                    <span className={`ml-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${badgeColor}`}>
                      {category === 'business' ? 'Empresas' : category === 'technology' ? 'Tecnologia' : category === 'people' ? 'Pessoa física' : category === 'marketplace' ? 'Marketplace' : 'Ferramentas'}
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0c1c2b] text-[#d5b86b] transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:rounded-full sm:h-12 sm:w-12">
                      <Icon
                        className={`h-5 w-5 sm:h-6 sm:w-6 ${reduceMotion ? '' : 'gsa-home-service-icon-pulse'}`}
                        style={{ animationDelay: reduceMotion ? '0ms' : `${index * 180}ms` }}
                      />
                    </span>
                  </div>

                  <h3 className="mt-2 text-lg font-semibold leading-snug tracking-[-0.025em] text-[#0b1825]">{title}</h3>
                  <p className="mt-1 text-[13px] leading-4 text-[#5b6268]">{description}</p>

                  <div className="gsa-home-service-examples mt-3 flex-wrap gap-1.5">
                    {examples.map((item) => (
                      <span key={item} className="rounded-full bg-[#f3f0e8] px-2.5 py-1 text-[11px] font-medium text-[#46525e]">
                        {item}
                      </span>
                    ))}
                  </div>

                </div>

                <div className="border-t border-[#e8e2d8] py-2 pl-6 pr-4 sm:px-5 sm:py-3.5">
                  <button
                    type="button"
                    onClick={() => exploreCategory(category)}
                    className="group/btn flex w-full items-center justify-between text-sm font-bold text-[#7a5c1e] transition hover:text-[#5c4418]"
                  >
                    {category === 'marketplace' ? 'Explorar a loja' : category === 'technology' ? 'Ver serviços digitais' : category === 'free-tools' ? 'Usar gratuitamente' : 'Ver soluções'}
                    <ChevronRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* ─── COMO FUNCIONA ─── */}
      <section id="sobre-gsa" className="bg-[#091522] px-5 py-16 text-white sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div {...reveal(reduceMotion)} className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d5b86b]">Como funciona</p>
              <h2 className="mt-5 text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.12] tracking-[-0.035em]">
                Simples de contratar.
                <span className="mt-3 block font-serif font-normal italic text-[#e2cb8b]">Eficiente na entrega.</span>
              </h2>
              <p className="mt-6 max-w-md text-base leading-7 text-[#c8d2df]">
                Nossa metodologia de atendimento garante que cada solicitação seja tratada com atenção, velocidade e transparência.
              </p>
              <a
                href="https://wa.me/5511920857756"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex min-h-14 items-center gap-3 rounded-lg bg-[#dfc47c] px-6 text-base font-bold text-[#07111d] hover:bg-[#e2ca86] transition focus-visible:ring-2 focus-visible:ring-white"
              >
                Começar agora
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <ol className="grid gap-4 sm:grid-cols-2">
              {howItWorksSteps.map(({ number, title, text }, index) => (
                <motion.li
                  key={title}
                  {...reveal(reduceMotion, index * 0.24)}
                  className="relative flex flex-col gap-3 rounded-2xl border border-[#1e3a52] bg-[#0f2336] p-6"
                >
                  <span className="text-4xl font-black tracking-tight text-[#d5b86b]/30">{number}</span>
                  <h3 className="text-lg font-semibold text-white">{title}</h3>
                  <p className="text-sm leading-7 text-[#9ab0c4]">{text}</p>
                </motion.li>
              ))}
            </ol>
          </motion.div>
        </div>
      </section>

      {/* ─── CTA FINAL ─── */}
      <section id="contato-gsa" className="relative overflow-hidden bg-[#07111d] px-5 py-16 text-white sm:px-8 lg:px-10 lg:py-24">
        <div className="pointer-events-none absolute -bottom-56 -right-48 h-[38rem] w-[38rem] rounded-full border border-[#d5b86b]/12" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-[24rem] w-[24rem] rounded-full border border-white/8" />
        <div className="pointer-events-none absolute left-0 top-0 h-px w-full bg-[linear-gradient(90deg,transparent,#d5b86b40,transparent)]" />

        <div className="mx-auto max-w-7xl">
          <motion.div
            {...reveal(reduceMotion)}
            className="relative overflow-hidden rounded-2xl border border-[#1e3a52] bg-[#14283b] p-8 sm:p-12"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-[#d5b86b]/10" />

            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-[0.24em] text-[#d5b86b]">
              <span className="h-px w-12 bg-[#d5b86b]" />
              Pronto para começar?
            </div>

            <h2 className="mt-5 max-w-3xl text-[clamp(1.8rem,3.5vw,3rem)] font-semibold leading-[1.14] tracking-[-0.035em]">
              Vamos conversar sobre o que você precisa?
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d4deea] sm:text-lg">
              Fale com nossa equipe pelo WhatsApp ou envie um e-mail. Respondemos rápido e sem enrolação.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {['Abertura de CNPJ', 'Site ou sistema', 'Regularização', 'Identidade visual', 'Plano de saúde'].map((tag) => (
                <span key={tag} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60">
                  <Star className="h-3 w-3 text-[#d5b86b]" />
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://wa.me/5511920857756"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-lg bg-[#dfc47c] px-7 text-base font-bold text-[#07111d] transition hover:bg-[#e2ca86] focus-visible:ring-2 focus-visible:ring-white"
              >
                <Phone className="h-4 w-4" />
                Falar com a GSA
              </a>
              <a
                href="mailto:gsa.doc.adm@gmail.com"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-[#718297] px-6 text-sm font-semibold text-white transition hover:border-[#d5b86b] hover:text-[#d5b86b] focus-visible:ring-2 focus-visible:ring-[#d5b86b]"
              >
                <Shield className="h-4 w-4" />
                gsa.doc.adm@gmail.com
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  HeartPulse,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  Users,
  WalletCards,
} from 'lucide-react';
import { LogoGSA } from '../../../ui/LogoGSA';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface HealthMarketplaceLandingPageProps {
  clientId?: string;
  onBackToMarketplace: () => void;
  onRequireAuth?: () => void;
}

const CARE_PATHS = [
  {
    id: 'individual-familiar',
    icon: Users,
    eyebrow: 'Pessoa física e família',
    title: 'Cuidado para você e para quem está ao seu lado.',
    description: 'Informe idade, cidade e composição familiar para receber uma análise compatível com a sua realidade.',
    highlights: ['Individual ou familiar', 'Faixa etária e região', 'Apoio na comparação'],
  },
  {
    id: 'empresarial',
    icon: BriefcaseBusiness,
    eyebrow: 'Empresas e equipes',
    title: 'Saúde corporativa organizada desde a primeira cotação.',
    description: 'Estruture a solicitação por CNPJ, quantidade de vidas e perfil da equipe sem perder o histórico do atendimento.',
    highlights: ['MEI e empresas', 'Quantidade de vidas', 'Movimentação de beneficiários'],
  },
  {
    id: 'odontologico',
    icon: Stethoscope,
    eyebrow: 'Assistência odontológica',
    title: 'Cobertura odontológica com orientação clara.',
    description: 'Compare alternativas para prevenção, consultas, procedimentos e necessidades recorrentes.',
    highlights: ['Planos individuais', 'Opções empresariais', 'Rede e procedimentos'],
  },
] as const;

const JOURNEY = [
  ['01', 'Conte sua necessidade', 'Você informa quem precisa de cobertura e quais pontos são mais importantes.'],
  ['02', 'Receba a análise', 'A equipe GSA organiza as alternativas compatíveis com o perfil informado.'],
  ['03', 'Compare com clareza', 'Propostas, valores, condições e observações ficam reunidos no mesmo ambiente.'],
  ['04', 'Acompanhe a contratação', 'Documentos, dependentes, vigência e suporte continuam vinculados à sua conta.'],
] as const;

const CLIENT_ACTIONS = [
  {
    icon: ClipboardCheck,
    title: 'Minhas cotações',
    description: 'Acompanhe solicitações enviadas e informações que ainda precisam de atenção.',
    path: routes.marketplace.saude.minhasCotacoes(),
  },
  {
    icon: WalletCards,
    title: 'Minhas propostas',
    description: 'Consulte comparativos e condições apresentadas para o seu perfil.',
    path: routes.marketplace.saude.minhasPropostas(),
  },
  {
    icon: ShieldCheck,
    title: 'Meus planos',
    description: 'Veja contratações, vigências e dados principais do atendimento ativo.',
    path: routes.marketplace.saude.meusPlanos(),
  },
  {
    icon: FileText,
    title: 'Documentos',
    description: 'Envie arquivos solicitados e acompanhe a conferência pela equipe GSA.',
    path: routes.marketplace.saude.documentos(),
  },
] as const;

export function HealthMarketplaceLandingPage({
  clientId,
  onBackToMarketplace,
  onRequireAuth,
}: HealthMarketplaceLandingPageProps) {
  const reduceMotion = useReducedMotion();

  const openProtected = (path: string) => {
    if (!clientId) {
      onRequireAuth?.();
      return;
    }
    navigate(path);
  };

  const requestQuote = (category?: string) => {
    const base = routes.marketplace.saude.cotacao();
    navigate(category ? `${base}/${category}` : base);
  };

  return (
    <div className="min-h-screen bg-[#f2f5f1] text-[#123330]">
      <header className="sticky top-0 z-50 border-b border-[#173e38]/10 bg-[#f7faf6]/94 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToMarketplace}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-black text-[#5c746f] transition hover:bg-white hover:text-[#153f38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#248878]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Marketplace</span>
            </button>
            <span className="hidden h-7 w-px bg-[#c9d7d1] sm:block" aria-hidden="true" />
            <LogoGSA size="sm" variant="dark" />
            <div className="hidden sm:block">
              <strong className="block text-sm font-black text-[#123330]">GSA Saúde</strong>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#71857f]">Orientação e cuidado</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate(routes.marketplace.saude.suporte())}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#bfd0ca] bg-white px-3.5 text-xs font-black text-[#315c54] transition hover:border-[#5a9f92] hover:bg-[#edf7f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#248878]"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Falar com a GSA</span>
            </button>
            <button
              type="button"
              onClick={() => openProtected(routes.marketplace.saude.minhasCotacoes())}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#123f38] px-4 text-xs font-black text-white transition hover:bg-[#0d332e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#248878] focus-visible:ring-offset-2"
            >
              <HeartPulse className="h-4 w-4 text-[#92d7c8]" />
              {clientId ? 'Minha área' : 'Entrar'}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-[#0d302c] text-white">
          <div className="absolute inset-0 -z-20">
            <img
              src="/images/marketplace/gsa-saude-hero.webp"
              alt="Atendimento de saúde com orientação profissional"
              className="h-full w-full object-cover object-center opacity-32"
            />
          </div>
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(10,40,36,.98)_0%,rgba(10,40,36,.92)_49%,rgba(10,40,36,.48)_100%)]" />
          <div className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-[#3cb7a0]/16 blur-3xl" />

          <div className="mx-auto grid min-h-[620px] max-w-[1440px] items-center gap-12 px-4 py-16 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,.72fr)] lg:px-10 lg:py-24">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-4xl"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[#9be0d1]/24 bg-[#9be0d1]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#a8e4d7]">
                <HeartHandshake className="h-4 w-4" />
                Cuidado com orientação humana
              </span>
              <h1 className="mt-7 max-w-[13ch] text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                Escolher um plano de saúde precisa começar pela sua realidade.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
                A GSA organiza a jornada de cotação para pessoas, famílias e empresas, com acompanhamento desde a necessidade inicial até a contratação.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => requestQuote()}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#8bd8c7] px-6 text-sm font-black text-[#0c302b] transition hover:bg-[#a5e4d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Solicitar uma análise
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('health-paths')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/22 bg-white/[0.05] px-6 text-sm font-black text-white transition hover:border-[#8bd8c7]/65 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bd8c7]"
                >
                  Escolher o tipo de cuidado
                </button>
              </div>
            </motion.div>

            <aside className="border border-white/14 bg-[#082722]/78 p-5 shadow-[0_28px_70px_rgba(0,0,0,.24)] backdrop-blur-md sm:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8bd8c7]">Antes de comparar preços</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">O que precisa ser entendido primeiro</h2>
              <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
                {[
                  ['Quem será atendido', 'Pessoa, família, equipe ou dependentes.'],
                  ['Onde o plano será usado', 'Cidade, região e necessidade de abrangência.'],
                  ['Qual é a prioridade', 'Rede, acomodação, coparticipação ou previsibilidade.'],
                ].map(([title, text], index) => (
                  <div key={title} className="grid grid-cols-[32px_1fr] gap-4 py-5">
                    <span className="font-mono text-xs font-black text-[#8bd8c7]">0{index + 1}</span>
                    <div>
                      <strong className="block text-sm text-white">{title}</strong>
                      <p className="mt-1 text-xs leading-5 text-white/48">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs leading-6 text-white/52">
                A proposta só faz sentido quando esses pontos estão claros. Por isso, a experiência começa pela necessidade — não por uma lista genérica de produtos.
              </p>
            </aside>
          </div>
        </section>

        <section id="health-paths" className="border-b border-[#cbd8d3] bg-[#f8faf7] py-16 sm:py-20">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-7 lg:px-10">
            <div className="grid gap-8 border-b border-[#cbd8d3] pb-9 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2a786b]">Comece por quem precisa de cuidado</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.04em] text-[#123330] sm:text-5xl">
                  Três jornadas diferentes. Uma orientação organizada.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-[#60716d] lg:justify-self-end">
                Cada perfil abre uma solicitação adequada à sua realidade. Os fluxos seguintes de cotação, proposta, documentos e contratação permanecem integrados ao sistema.
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {CARE_PATHS.map((path, index) => {
                const Icon = path.icon;
                return (
                  <motion.button
                    key={path.id}
                    type="button"
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ delay: reduceMotion ? 0 : index * 0.05 }}
                    onClick={() => requestQuote(path.id)}
                    className="group relative overflow-hidden border border-[#c9d8d2] bg-white p-6 text-left shadow-[0_14px_36px_rgba(21,63,56,.06)] transition hover:-translate-y-1 hover:border-[#67a99b] hover:shadow-[0_22px_48px_rgba(21,63,56,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#248878] sm:p-7"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f5f1] text-[#236f63]">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="font-mono text-xs font-black text-[#8ca39d]">0{index + 1}</span>
                    </div>
                    <p className="mt-7 text-[10px] font-black uppercase tracking-[0.18em] text-[#2a786b]">{path.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-black leading-tight tracking-[-0.03em] text-[#123330]">{path.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-[#667773]">{path.description}</p>
                    <ul className="mt-6 space-y-3 border-t border-[#e3ebe8] pt-5">
                      {path.highlights.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-xs font-bold text-[#405c56]">
                          <CheckCircle2 className="h-4 w-4 text-[#2a8b79]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <span className="mt-7 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#1e6f62]">
                      Iniciar esta cotação
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#eaf0ec] py-16 sm:py-20">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-7 lg:grid-cols-[.82fr_1.18fr] lg:px-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2a786b]">Jornada acompanhada</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#123330] sm:text-4xl">Da necessidade ao cuidado ativo.</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-[#61726e]">
                O usuário não precisa recomeçar a conversa em cada etapa. A solicitação acompanha propostas, documentos e contratação dentro do mesmo histórico.
              </p>
            </div>
            <div className="border-t border-[#baccc5]">
              {JOURNEY.map(([number, title, text]) => (
                <div key={number} className="grid gap-3 border-b border-[#baccc5] py-5 sm:grid-cols-[56px_180px_1fr] sm:items-start">
                  <span className="font-mono text-xs font-black text-[#2a786b]">{number}</span>
                  <strong className="text-sm text-[#123330]">{title}</strong>
                  <p className="text-sm leading-6 text-[#667773]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#c9d8d2] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-7 lg:px-10">
            <div className="flex flex-col gap-5 border-b border-[#d6e1dd] pb-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2a786b]">Minha área de saúde</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#123330] sm:text-4xl">Continue de onde parou.</h2>
              </div>
              <p className="max-w-xl text-sm leading-7 text-[#677772]">
                Cotações, propostas, documentos e planos ativos permanecem vinculados à conta GSA do cliente.
              </p>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden border border-[#d7e1de] bg-[#d7e1de] sm:grid-cols-2 lg:grid-cols-4">
              {CLIENT_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    type="button"
                    onClick={() => openProtected(action.path)}
                    className="group min-h-56 bg-[#fbfcfb] p-6 text-left transition hover:bg-[#eef7f3] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#248878]"
                  >
                    <Icon className="h-6 w-6 text-[#2a786b]" />
                    <h3 className="mt-8 text-lg font-black text-[#123330]">{action.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#687873]">{action.description}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-[#1e6f62]">
                      {clientId ? 'Acessar' : 'Entrar para acessar'}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#0d302c] py-14 text-white">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-4 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <div className="flex max-w-3xl items-start gap-4">
              <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-[#8bd8c7]" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8bd8c7]">Atendimento responsável</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">A GSA orienta a contratação, mas não substitui avaliação médica nem garante elegibilidade por operadora.</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => requestQuote()}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#8bd8c7] px-5 text-sm font-black text-[#0c302b] transition hover:bg-[#a5e4d7]"
            >
              Começar minha cotação
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

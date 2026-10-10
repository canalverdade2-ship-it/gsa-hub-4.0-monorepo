import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  ClipboardCheck,
  FileText,
  Home,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  Plane,
  ShieldCheck,
  Sparkles,
  Umbrella,
  WalletCards,
} from 'lucide-react';
import { LogoGSA } from '../../../ui/LogoGSA';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface InsuranceMarketplaceLandingPageProps {
  clientId?: string;
  onBackToMarketplace: () => void;
  onRequireAuth?: () => void;
}

const PROTECTION_AREAS = [
  { id: 'auto', icon: Car, label: 'Auto', description: 'Proteção para o veículo, terceiros e assistências da rotina.' },
  { id: 'residencial', icon: Home, label: 'Residencial', description: 'Coberturas para imóvel, conteúdo e imprevistos domésticos.' },
  { id: 'vida', icon: Umbrella, label: 'Vida', description: 'Planejamento de proteção para você e para quem depende de você.' },
  { id: 'empresarial', icon: BriefcaseBusiness, label: 'Empresarial', description: 'Soluções para patrimônio, operação e responsabilidade do negócio.' },
  { id: 'viagem', icon: Plane, label: 'Viagem', description: 'Assistência e cobertura para deslocamentos nacionais e internacionais.' },
  { id: 'outros', icon: Sparkles, label: 'Outras necessidades', description: 'Conte o que precisa proteger para receber orientação personalizada.' },
] as const;

const CONTROL_ACTIONS = [
  {
    icon: ClipboardCheck,
    title: 'Minhas cotações',
    description: 'Acompanhe solicitações e informações pendentes.',
    path: routes.marketplace.seguros.minhasCotacoes(),
  },
  {
    icon: WalletCards,
    title: 'Minhas propostas',
    description: 'Compare condições, valores e coberturas apresentadas.',
    path: routes.marketplace.seguros.minhasPropostas(),
  },
  {
    icon: ShieldCheck,
    title: 'Minhas apólices',
    description: 'Consulte vigência, dados principais e histórico contratado.',
    path: routes.marketplace.seguros.minhasApolices(),
  },
  {
    icon: LifeBuoy,
    title: 'Assistências',
    description: 'Acesse orientações e canais relacionados às coberturas ativas.',
    path: routes.marketplace.seguros.assistencias(),
  },
  {
    icon: FileText,
    title: 'Documentos',
    description: 'Envie e acompanhe arquivos vinculados às solicitações.',
    path: routes.marketplace.seguros.documentos(),
  },
] as const;

const PROTECTION_LOGIC = [
  ['01', 'Identificar o bem ou a responsabilidade', 'O processo começa pelo que precisa ser protegido e por quem depende dessa proteção.'],
  ['02', 'Entender a exposição ao risco', 'Uso, localização, rotina, patrimônio e histórico ajudam a definir o que realmente importa.'],
  ['03', 'Comparar cobertura, não apenas preço', 'Franquias, limites, assistências e exclusões precisam ser avaliados junto com o valor.'],
  ['04', 'Manter a proteção acompanhada', 'Propostas, apólices, documentos, assistências e sinistros ficam conectados ao histórico da conta.'],
] as const;

export function InsuranceMarketplaceLandingPage({
  clientId,
  onBackToMarketplace,
  onRequireAuth,
}: InsuranceMarketplaceLandingPageProps) {
  const reduceMotion = useReducedMotion();

  const requestQuote = (category?: string) => {
    const base = routes.marketplace.seguros.cotacao();
    navigate(category ? `${base}/${category}` : base);
  };

  const openProtected = (path: string) => {
    if (!clientId) {
      onRequireAuth?.();
      return;
    }
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-[#eef2f8] text-[#0e1d36]">
      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#08152b]/96 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBackToMarketplace}
              className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-xs font-black text-white/58 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ea6ff]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Marketplace</span>
            </button>
            <span className="hidden h-7 w-px bg-white/15 sm:block" aria-hidden="true" />
            <LogoGSA size="sm" variant="light" />
            <div className="hidden sm:block">
              <strong className="block text-sm font-black">GSA Seguros</strong>
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">Proteção e assistência</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate(routes.marketplace.seguros.suporte())}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 text-xs font-black text-white/72 transition hover:border-[#7ea6ff]/55 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ea6ff]"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Suporte</span>
            </button>
            <button
              type="button"
              onClick={() => openProtected(routes.marketplace.seguros.minhasApolices())}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#7ea6ff] px-4 text-xs font-black text-[#07142a] transition hover:bg-[#9bbaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <LockKeyhole className="h-4 w-4" />
              {clientId ? 'Central de proteção' : 'Entrar'}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-[#08152b] text-white">
          <div className="absolute inset-0 -z-20">
            <img
              src="/images/marketplace/gsa-seguros-hero.webp"
              alt="Família protegida por soluções de seguros"
              className="h-full w-full object-cover object-center opacity-24"
            />
          </div>
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(6,18,39,.99)_0%,rgba(6,18,39,.94)_52%,rgba(6,18,39,.58)_100%)]" />
          <div className="pointer-events-none absolute inset-y-0 right-[8%] w-px bg-white/8" />
          <div className="pointer-events-none absolute inset-y-0 right-[20%] w-px bg-white/5" />
          <div className="pointer-events-none absolute -right-32 top-10 h-[32rem] w-[32rem] rounded-full border border-[#7ea6ff]/15" />

          <div className="mx-auto grid min-h-[640px] max-w-[1440px] items-center gap-14 px-4 py-16 sm:px-7 sm:py-20 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10 lg:py-24">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-4xl"
            >
              <span className="inline-flex items-center gap-2 border border-[#7ea6ff]/30 bg-[#7ea6ff]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.23em] text-[#a9c1ff]">
                <ShieldCheck className="h-4 w-4" />
                Proteção para cada momento
              </span>
              <h1 className="mt-7 max-w-[12ch] text-4xl font-black leading-[1.01] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
                Seguro não começa na apólice. Começa no risco que precisa ser compreendido.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/65 sm:text-lg">
                A GSA organiza a solicitação por patrimônio, rotina e responsabilidade para que você compare coberturas com clareza antes de contratar.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => requestQuote()}
                  className="inline-flex min-h-14 items-center justify-center gap-2 bg-[#7ea6ff] px-6 text-sm font-black text-[#07142a] transition hover:bg-[#9bbaff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Solicitar análise de proteção
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('insurance-protection-map')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })}
                  className="inline-flex min-h-14 items-center justify-center gap-2 border border-white/20 bg-white/[0.04] px-6 text-sm font-black text-white transition hover:border-[#7ea6ff]/60 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ea6ff]"
                >
                  Ver o que posso proteger
                </button>
              </div>
            </motion.div>

            <aside className="border border-white/14 bg-[#0d2141]/78 p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)] backdrop-blur-md sm:p-8">
              <div className="flex items-start justify-between gap-5 border-b border-white/10 pb-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9ab8ff]">Leitura de proteção</p>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">Três perguntas antes da proposta</h2>
                </div>
                <ShieldCheck className="h-7 w-7 text-[#7ea6ff]" />
              </div>
              <div className="divide-y divide-white/10">
                {[
                  ['O que pode ser perdido?', 'Patrimônio, renda, continuidade da operação ou segurança da família.'],
                  ['Qual impacto seria mais grave?', 'Custo imediato, responsabilidade com terceiros ou interrupção da rotina.'],
                  ['Que apoio seria necessário?', 'Indenização, assistência, reparo, atendimento ou substituição.'],
                ].map(([title, text], index) => (
                  <div key={title} className="grid grid-cols-[34px_1fr] gap-4 py-5">
                    <span className="font-mono text-xs font-black text-[#9ab8ff]">0{index + 1}</span>
                    <div>
                      <strong className="block text-sm text-white">{title}</strong>
                      <p className="mt-1 text-xs leading-5 text-white/46">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section id="insurance-protection-map" className="border-b border-[#cbd4e4] bg-[#edf2fa] py-16 sm:py-20">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-7 lg:px-10">
            <div className="grid gap-8 border-b border-[#c7d1e1] pb-9 lg:grid-cols-[.78fr_1.22fr] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#315fad]">Mapa de proteção</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.045em] text-[#0e1d36] sm:text-5xl">
                  O que precisa continuar seguro mesmo quando algo sai do plano?
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-[#647086] lg:justify-self-end">
                Cada modalidade abre uma solicitação própria, mas todas seguem a mesma lógica: risco identificado, cobertura analisada, proposta registrada e histórico preservado.
              </p>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden border border-[#c8d2e2] bg-[#c8d2e2] sm:grid-cols-2 xl:grid-cols-3">
              {PROTECTION_AREAS.map((area, index) => {
                const Icon = area.icon;
                return (
                  <motion.button
                    key={area.id}
                    type="button"
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ delay: reduceMotion ? 0 : index * 0.04 }}
                    onClick={() => requestQuote(area.id)}
                    className="group relative min-h-64 overflow-hidden bg-white p-6 text-left transition hover:bg-[#0b1f3d] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#315fad] sm:p-7"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="flex h-12 w-12 items-center justify-center border border-[#c8d4e8] bg-[#f2f6fd] text-[#315fad] transition group-hover:border-[#7ea6ff]/35 group-hover:bg-[#7ea6ff]/10 group-hover:text-[#9ab8ff]">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="font-mono text-xs font-black text-[#8c9bb3] group-hover:text-[#7ea6ff]">0{index + 1}</span>
                    </div>
                    <h3 className="mt-8 text-2xl font-black tracking-[-0.035em] text-[#0e1d36] transition group-hover:text-white">{area.label}</h3>
                    <p className="mt-3 max-w-sm text-sm leading-7 text-[#66748b] transition group-hover:text-white/52">{area.description}</p>
                    <span className="absolute bottom-6 left-6 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.11em] text-[#315fad] transition group-hover:text-[#9ab8ff] sm:bottom-7 sm:left-7">
                      Analisar esta proteção
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:px-10">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#315fad]">Lógica de contratação</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#0e1d36] sm:text-4xl">Proteção organizada em quatro decisões.</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-[#657187]">
                A página de Seguros foi estruturada como uma central de risco e proteção — não como um catálogo visual de produtos.
              </p>
            </div>
            <div className="border-t border-[#cbd4e4]">
              {PROTECTION_LOGIC.map(([number, title, text]) => (
                <div key={number} className="grid gap-3 border-b border-[#cbd4e4] py-6 sm:grid-cols-[56px_220px_1fr] sm:items-start">
                  <span className="font-mono text-xs font-black text-[#315fad]">{number}</span>
                  <strong className="text-sm leading-6 text-[#0e1d36]">{title}</strong>
                  <p className="text-sm leading-7 text-[#66748a]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[#cbd4e4] bg-[#0b1f3d] py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-7 lg:px-10">
            <div className="grid gap-8 border-b border-white/12 pb-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9ab8ff]">Central de proteção</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Controle depois da cotação.</h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-white/52 lg:justify-self-end">
                O cliente acompanha o ciclo completo: proposta, apólice, documentos, assistência e, quando necessário, sinistro.
              </p>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden border border-white/12 bg-white/12 sm:grid-cols-2 xl:grid-cols-5">
              {CONTROL_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.title}
                    type="button"
                    onClick={() => openProtected(action.path)}
                    className="group min-h-56 bg-[#0d2447] p-5 text-left transition hover:bg-[#12305c] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7ea6ff]"
                  >
                    <Icon className="h-6 w-6 text-[#9ab8ff]" />
                    <h3 className="mt-8 text-lg font-black text-white">{action.title}</h3>
                    <p className="mt-3 text-xs leading-6 text-white/46">{action.description}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.11em] text-[#9ab8ff]">
                      {clientId ? 'Acessar' : 'Entrar para acessar'}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#e8edf6] py-14">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-4 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
            <div className="flex max-w-3xl items-start gap-4">
              <Building2 className="mt-1 h-6 w-6 shrink-0 text-[#315fad]" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#315fad]">Intermediação responsável</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0e1d36]">
                  Coberturas, aceitação, valores e condições finais dependem da análise e das regras da seguradora responsável.
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => requestQuote()}
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#0b1f3d] px-5 text-sm font-black text-white transition hover:bg-[#12305c]"
            >
              Solicitar uma cotação
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Handshake,
  Headphones,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogoGSA } from '../../components/ui/LogoGSA';

interface ProviderLandingPageProps {
  onBackToSite: () => void;
  onLogin: () => void;
  onRegister: () => void;
}

const PORTAL_FEATURES = [
  {
    icon: BriefcaseBusiness,
    title: 'Demandas e oportunidades',
    description: 'Consulte serviços vinculados ao seu perfil e acompanhe cada etapa da execução.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda profissional',
    description: 'Organize compromissos, prazos e atividades associadas às demandas aprovadas.',
  },
  {
    icon: Landmark,
    title: 'Financeiro e repasses',
    description: 'Acompanhe valores, movimentações, histórico e solicitações financeiras em um só lugar.',
  },
  {
    icon: FileCheck2,
    title: 'Documentos centralizados',
    description: 'Mantenha informações e documentos profissionais vinculados ao seu cadastro.',
  },
  {
    icon: Sparkles,
    title: 'Benefícios da rede',
    description: 'Consulte vouchers, promoções e reconhecimentos disponibilizados para prestadores elegíveis.',
  },
  {
    icon: Headphones,
    title: 'Suporte operacional',
    description: 'Conte com um canal próprio para dúvidas e acompanhamento das atividades realizadas.',
  },
] as const;

const JOURNEY_STEPS = [
  {
    icon: CheckCircle2,
    title: 'Cadastro aprovado',
    description: 'Perfil validado pela equipe GSA',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Demanda vinculada',
    description: 'Escopo e acompanhamento no portal',
  },
  {
    icon: ClipboardCheck,
    title: 'Execução organizada',
    description: 'Agenda, evidências e documentos',
  },
  {
    icon: Landmark,
    title: 'Financeiro acompanhado',
    description: 'Movimentações e histórico reunidos',
  },
] as const;

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Envie seu cadastro',
    description: 'Profissionais e empresas informam dados de contato, documento e área de atuação.',
  },
  {
    number: '02',
    title: 'Passe pela análise GSA',
    description: 'A equipe confere o perfil e pode solicitar informações complementares antes da aprovação.',
  },
  {
    number: '03',
    title: 'Ative seu acesso',
    description: 'Após a aprovação, você recebe as orientações para liberar sua senha e acessar o portal.',
  },
  {
    number: '04',
    title: 'Acompanhe sua operação',
    description: 'Demandas, agenda, documentos, atendimento e financeiro ficam reunidos na Área do Prestador.',
  },
] as const;

const PROFESSIONAL_AREAS = [
  {
    icon: Building2,
    title: 'Empresas prestadoras',
    description: 'Negócios com CNPJ que atendem demandas técnicas, operacionais ou especializadas.',
  },
  {
    icon: UserRoundCheck,
    title: 'Profissionais autônomos',
    description: 'Prestadores Pessoa Física com experiência comprovável em sua área de atuação.',
  },
  {
    icon: ClipboardCheck,
    title: 'Serviços técnicos e operacionais',
    description: 'Manutenção, suporte, instalação, logística e outras especialidades de execução.',
  },
  {
    icon: UsersRound,
    title: 'Serviços especializados',
    description: 'Tecnologia, comunicação, consultoria, criação e soluções profissionais sob demanda.',
  },
] as const;

const STANDARDS = [
  {
    title: 'Qualidade na execução',
    description: 'Cada entrega deve respeitar o escopo, os critérios e o padrão acordado com a GSA.',
  },
  {
    title: 'Compromisso com prazos',
    description: 'A comunicação antecipada e o cumprimento do cronograma preservam a confiança da operação.',
  },
  {
    title: 'Conduta e conformidade',
    description: 'Dados verdadeiros, documentos regulares e relacionamento responsável são indispensáveis.',
  },
] as const;

const FAQ_ITEMS = [
  {
    question: 'Quem pode se cadastrar como prestador?',
    answer: 'Profissionais Pessoa Física e empresas com CNPJ podem enviar o cadastro. A aprovação considera os dados apresentados, a área de atuação e as necessidades da operação GSA.',
  },
  {
    question: 'O cadastro garante contratação ou recebimento de demandas?',
    answer: 'Não. O cadastro inicia a análise para participação na rede, mas não representa garantia de contratação, exclusividade ou volume mínimo de serviços.',
  },
  {
    question: 'Como recebo a senha do portal?',
    answer: 'A liberação do primeiro acesso ocorre somente após a validação do cadastro e a confirmação de identidade pela equipe responsável.',
  },
  {
    question: 'Onde acompanho os serviços depois da aprovação?',
    answer: 'Na Área do Prestador você encontra demandas, agenda, documentos, financeiro, benefícios e suporte vinculados ao seu perfil.',
  },
] as const;

export function ProviderLandingPage({
  onBackToSite,
  onLogin,
  onRegister,
}: ProviderLandingPageProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;

    document.title = 'Seja um Prestador | GSA HUB';
    if (description) {
      description.content = 'Conheça a Rede de Prestadores GSA HUB, envie seu cadastro e acesse um ambiente profissional para demandas, agenda, documentos e financeiro.';
    }

    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f7f9] text-[#0b1b2c]">
      <a
        href="#provider-institutional-content"
        className="sr-only z-[70] rounded-lg bg-white px-4 py-3 font-bold text-[#0b1b2c] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Ir para o conteúdo principal
      </a>

      <header className="sticky top-0 z-50 border-b border-[#17354b]/10 bg-[#f7fafc]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-full max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-7 lg:px-10">
          <div className="flex items-center gap-4">
            <LogoGSA size="sm" variant="dark" showText />
            <span className="hidden h-8 w-px bg-[#bcc9d2] sm:block" aria-hidden="true" />
            <div className="hidden sm:block">
              <strong className="block text-xs font-black text-[#153650]">Rede de Prestadores</strong>
              <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#687b89]">GSA HUB</span>
            </div>
          </div>

          <nav className="hidden items-center gap-7 xl:flex" aria-label="Navegação da página do prestador">
            <a href="#oportunidade" className="text-xs font-black text-[#526776] transition hover:text-[#153f5f]">A parceria</a>
            <a href="#portal" className="text-xs font-black text-[#526776] transition hover:text-[#153f5f]">O portal</a>
            <a href="#como-funciona" className="text-xs font-black text-[#526776] transition hover:text-[#153f5f]">Como funciona</a>
            <a href="#duvidas" className="text-xs font-black text-[#526776] transition hover:text-[#153f5f]">Dúvidas</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onBackToSite}
              className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black text-[#526776] transition hover:bg-white hover:text-[#153f5f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e5d85] sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao site
            </button>
            <button
              type="button"
              onClick={onLogin}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#aabcc9] bg-white px-3.5 text-xs font-black text-[#153650] transition hover:border-[#527f9d] hover:bg-[#eef5f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e5d85] sm:px-5"
            >
              <LockKeyhole className="h-4 w-4" />
              <span className="hidden sm:inline">Já sou prestador</span>
              <span className="sm:hidden">Entrar</span>
            </button>
          </div>
        </div>
      </header>

      <div id="provider-institutional-content">
        <section className="relative isolate overflow-hidden bg-[#091a2b] text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:48px_48px]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute -left-48 top-12 h-[34rem] w-[34rem] rounded-full bg-[#236a91]/30 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-40 bottom-0 h-[32rem] w-[32rem] rounded-full bg-[#2b8762]/20 blur-3xl" />

          <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-14 px-4 py-16 sm:px-7 sm:py-20 lg:grid-cols-[1.03fr_0.97fr] lg:px-10 lg:py-24 xl:py-28">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[#8cd8b4]/20 bg-[#79cfa6]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#9ce0bd]">
                <Handshake className="h-4 w-4" />
                Rede de Prestadores GSA HUB
              </span>
              <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-6xl xl:text-7xl">
                Seu trabalho encontra estrutura para crescer.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/65 sm:text-lg">
                Conecte sua experiência a uma operação que organiza oportunidades, agenda, documentos, execução e repasses em um único ambiente profissional.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onRegister}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#84d5ad] px-6 text-sm font-black text-[#08251a] shadow-[0_16px_40px_rgba(80,190,139,.18)] transition hover:bg-[#a3e6c5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8efd4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#091a2b]"
                >
                  Quero ser prestador
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onLogin}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-6 text-sm font-black text-white transition hover:border-white/35 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <LockKeyhole className="h-4 w-4" />
                  Acessar meu portal
                </button>
              </div>

              <p className="mt-5 flex max-w-2xl items-start gap-2 text-xs leading-5 text-white/42">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#84d5ad]" />
                O cadastro passa por análise e não representa garantia de contratação ou volume mínimo de demandas.
              </p>
            </motion.div>

            <motion.aside
              initial={reduceMotion ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.08, ease: 'easeOut' }}
              className="relative"
              aria-label="Visão resumida da jornada do prestador"
            >
              <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-[#65c997]/15 to-[#317fac]/10 blur-2xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[#102b42]/92 shadow-[0_35px_90px_rgba(0,0,0,.35)]">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8ddab5]">Jornada profissional</p>
                    <h2 className="mt-1 text-lg font-black">Da aprovação ao acompanhamento</h2>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#84d5ad]/12 text-[#9ce0bd]">
                    <BadgeCheck className="h-6 w-6" />
                  </span>
                </div>

                <div className="space-y-3 p-5 sm:p-6">
                  {JOURNEY_STEPS.map(({ title, description, icon: Icon }, index) => (
                    <div key={title} className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#84d5ad]/20 bg-[#84d5ad]/10 text-[#9ce0bd]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <strong className="text-sm text-white">{title}</strong>
                          <span className="text-[10px] font-black text-white/28">{String(index + 1).padStart(2, '0')}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-white/48">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 bg-[#0b2236] px-6 py-4 text-xs leading-5 text-white/45">
                  Informações reais aparecem somente após autenticação e conforme as permissões do perfil.
                </div>
              </div>
            </motion.aside>
          </div>
        </section>

        <section className="border-b border-[#d7e0e6] bg-white" aria-label="Compromissos da Rede de Prestadores">
          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-2 px-4 sm:px-7 lg:grid-cols-4 lg:px-10">
            {[
              ['Cadastro analisado', 'Validação antes da ativação'],
              ['Operação formalizada', 'Demandas vinculadas ao portal'],
              ['Histórico preservado', 'Acompanhamento em cada etapa'],
              ['Canal profissional', 'Relacionamento direto com a GSA'],
            ].map(([title, description]) => (
              <div key={title} className="border-[#dbe4e9] px-3 py-7 odd:border-r sm:px-5 lg:border-r lg:last:border-r-0">
                <strong className="block text-sm font-black text-[#143852]">{title}</strong>
                <span className="mt-1 block text-xs leading-5 text-[#71828e]">{description}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="oportunidade" className="scroll-mt-24 bg-[#f4f7f9] px-4 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#277352]">Parceria profissional</p>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-[#0c2538] sm:text-4xl lg:text-5xl">
                  Uma rede para profissionais que levam serviço a sério.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-[#627684] sm:text-base lg:justify-self-end">
                A GSA HUB reúne profissionais e empresas capazes de executar serviços com qualidade, responsabilidade e comunicação clara. O cadastro apresenta sua especialidade para futuras necessidades da operação.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PROFESSIONAL_AREAS.map(({ icon: Icon, title, description }) => (
                <article key={title} className="rounded-[1.5rem] border border-[#d6e0e6] bg-white p-6 shadow-[0_12px_40px_rgba(21,54,80,.05)]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e5f1f6] text-[#1e5d85]">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-6 text-lg font-black text-[#143852]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#6b7d89]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="portal" className="scroll-mt-24 bg-white px-4 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#1e5d85]">Área logada exclusiva</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-[#0c2538] sm:text-4xl lg:text-5xl">
                Tudo o que você precisa para acompanhar sua relação com a GSA.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#627684] sm:text-base">
                Depois da aprovação, o portal centraliza as informações liberadas para seu perfil e reduz a dependência de conversas e documentos dispersos.
              </p>
            </div>

            <div className="mt-12 grid gap-px overflow-hidden rounded-[2rem] border border-[#d8e2e8] bg-[#d8e2e8] sm:grid-cols-2 lg:grid-cols-3">
              {PORTAL_FEATURES.map(({ icon: Icon, title, description }) => (
                <article key={title} className="bg-[#f8fafb] p-7 sm:p-8">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#bdd5e3] bg-white text-[#1e5d85]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-black text-[#143852]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#6b7d89]">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-24 bg-[#0d2438] px-4 py-20 text-white sm:px-7 lg:px-10 lg:py-28">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8ed8b5]">Como fazer parte</p>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl lg:text-5xl">
                  Uma jornada clara, da inscrição ao portal.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-white/58 sm:text-base lg:justify-self-end">
                A análise protege tanto o prestador quanto a operação. Nenhuma senha é criada apenas com documento e telefone, e nenhuma informação operacional é exibida antes da autenticação.
              </p>
            </div>

            <ol className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PROCESS_STEPS.map((step) => (
                <li key={step.number} className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-6">
                  <span className="text-xs font-black tracking-[0.16em] text-[#8ed8b5]">{step.number}</span>
                  <h3 className="mt-6 text-lg font-black">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/50">{step.description}</p>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-[1.75rem] border border-[#8ed8b5]/20 bg-[#8ed8b5]/8 p-6 sm:flex-row sm:items-center sm:p-8">
              <div>
                <h3 className="text-xl font-black">Pronto para apresentar seu trabalho?</h3>
                <p className="mt-2 text-sm leading-6 text-white/55">O cadastro é gratuito e será encaminhado para análise da equipe GSA.</p>
              </div>
              <button
                type="button"
                onClick={onRegister}
                className="inline-flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#8ed8b5] px-6 text-sm font-black text-[#09281c] transition hover:bg-[#a8e6c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto"
              >
                Iniciar meu cadastro
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <section className="bg-[#eef3f6] px-4 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="mx-auto grid w-full max-w-[1320px] gap-12 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#277352]">Padrão de relacionamento</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-[#0c2538] sm:text-4xl">
                Exclusividade também significa responsabilidade.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#627684] sm:text-base">
                Fazer parte da rede exige informações confiáveis, comunicação profissional e respeito aos compromissos assumidos em cada serviço.
              </p>
              <div className="mt-7 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                O credenciamento pode ser revisado conforme a regularidade cadastral, a qualidade das entregas e as regras aplicáveis a cada operação.
              </div>
            </div>

            <div className="grid gap-4">
              {STANDARDS.map((standard, index) => (
                <article key={standard.title} className="flex gap-5 rounded-[1.5rem] border border-[#d4dfe5] bg-white p-6 sm:p-7">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4f2ea] text-xs font-black text-[#277352]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-lg font-black text-[#143852]">{standard.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d89]">{standard.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-24 bg-white px-4 py-20 sm:px-7 lg:px-10 lg:py-28">
          <div className="mx-auto grid w-full max-w-[1200px] gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#1e5d85]">Dúvidas frequentes</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-[#0c2538] sm:text-4xl">
                Antes de enviar seu cadastro.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#627684]">
                Consulte os pontos principais sobre análise, oportunidades e acesso ao portal.
              </p>
            </div>

            <div className="divide-y divide-[#d9e2e7] border-y border-[#d9e2e7]">
              {FAQ_ITEMS.map((item) => (
                <details key={item.question} className="group py-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 text-left text-base font-black text-[#143852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e5d85]">
                    {item.question}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#edf3f6] text-[#1e5d85] transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="max-w-3xl pb-2 pr-12 pt-3 text-sm leading-7 text-[#667a87]">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#dfeef5] px-4 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col items-start justify-between gap-8 rounded-[2rem] border border-[#bad2df] bg-white p-7 shadow-[0_22px_60px_rgba(21,54,80,.08)] sm:p-10 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#277352]">Rede de Prestadores GSA HUB</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#0c2538] sm:text-4xl">
                Faça sua experiência chegar mais longe.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#627684]">
                Apresente seu perfil para análise ou, se já foi aprovado, acesse agora seu ambiente profissional.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#9bb2c1] bg-white px-6 text-sm font-black text-[#153650] transition hover:bg-[#edf4f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e5d85]"
              >
                <LockKeyhole className="h-4 w-4" />
                Já sou prestador
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#153f5f] px-6 text-sm font-black text-white transition hover:bg-[#1e5d85] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e5d85] focus-visible:ring-offset-2"
              >
                Quero ser prestador
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/8 bg-[#081726] px-4 py-8 text-white sm:px-7 lg:px-10">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <LogoGSA size="sm" variant="light" />
            <div className="border-l border-white/15 pl-3">
              <strong className="block text-xs">Área do Prestador</strong>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-white/38">Rede profissional GSA HUB</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/42">
            <ShieldCheck className="h-4 w-4 text-[#84d5ad]" />
            Cadastro analisado e acesso protegido
          </div>
          <span className="text-xs text-white/35">© {new Date().getFullYear()} Grupo GSA</span>
        </div>
      </footer>
    </main>
  );
}

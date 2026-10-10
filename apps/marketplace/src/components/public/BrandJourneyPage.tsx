import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Compass,
  FileText,
  Globe2,
  Instagram,
  LayoutTemplate,
  MessageCircle,
  Palette,
  PenTool,
  Rocket,
  Share2,
  Sparkles,
  Target,
  Type,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { LogoGSA } from '../ui/LogoGSA';
import { navigate } from '../../routing/navigationService';
import { PublicHeader } from './final/PublicHeader';
import { SystemsBudgetModal } from './SystemsBudgetModal';
import {
  BrandExamplesDialog,
  type BrandExampleCategory,
} from './BrandExamplesDialog';
import {
  BrandInsightDialog,
  type BrandInsightSelection,
  type BrandJourneyInsightId,
  type BrandStartingPointId,
  type BrandStudioTopic,
} from './BrandInsightDialog';

const WHATSAPP_NUMBER = '5511920857756';
const PAGE_TITLE = 'Identidade e Web Design | Marca, Site e Redes Sociais | GSA HUB';
const PAGE_DESCRIPTION = 'Da primeira ideia a uma marca pronta. Criação de nome, logo, identidade visual, materiais, redes sociais, conteúdo e presença digital para transformar uma ideia em uma marca profissional.';

interface BrandJourneyPageProps {
  onBack: () => void;
  onSystems: () => void;
  onLogin: () => void;
}

interface BrandService {
  id: BrandExampleCategory;
  icon: LucideIcon;
  title: string;
  text: string;
  result: string;
  dark?: boolean;
  wide?: boolean;
}

const services: BrandService[] = [
  {
    id: 'naming',
    icon: Type,
    title: 'Nome e posicionamento',
    text: 'Organizamos conceito, personalidade, público, proposta de valor e direção verbal antes das escolhas visuais.',
    result: 'Uma marca que sabe o que representa e como deseja ser percebida.',
    wide: true,
  },
  {
    id: 'identity',
    icon: Palette,
    title: 'Logo e identidade visual',
    text: 'Desenvolvemos símbolo, tipografia, cores, versões e regras para manter consistência em todas as aplicações.',
    result: 'Reconhecimento, coerência e valor percebido.',
    dark: true,
  },
  {
    id: 'materials',
    icon: FileText,
    title: 'Materiais da empresa',
    text: 'Levamos a identidade para propostas, apresentações, documentos, catálogos e canais comerciais.',
    result: 'Uma apresentação organizada em cada contato com o cliente.',
  },
  {
    id: 'social',
    icon: Instagram,
    title: 'Social media e conteúdo',
    text: 'Estruturamos perfil, biografia, capas, destaques e direção visual para os principais canais sociais.',
    result: 'Perfis que parecem parte da mesma empresa.',
  },
  {
    id: 'content',
    icon: Share2,
    title: 'Conteúdo e campanhas',
    text: 'Definimos linhas editoriais, formatos, temas, peças e ações para manter a marca ativa e relevante.',
    result: 'Comunicação contínua com intenção e consistência.',
    dark: true,
  },
  {
    id: 'digital',
    icon: LayoutTemplate,
    title: 'Presença digital integrada',
    text: 'Conectamos identidade, site, landing page, redes sociais, WhatsApp e canais de atendimento.',
    result: 'Uma experiência única do primeiro contato ao atendimento.',
    wide: true,
  },
];

const journey: Array<{
  id: BrandJourneyInsightId;
  number: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  text: string;
}> = [
  {
    id: 'discover',
    number: '01',
    icon: Compass,
    title: 'Descobrir',
    subtitle: 'Estratégia antes da estética',
    text: 'Entendemos o negócio, o público, o contexto e a percepção que a empresa precisa construir.',
  },
  {
    id: 'define',
    number: '02',
    icon: PenTool,
    title: 'Definir',
    subtitle: 'Uma direção clara',
    text: 'Organizamos posicionamento, personalidade, mensagem e critérios para orientar todas as decisões.',
  },
  {
    id: 'express',
    number: '03',
    icon: Sparkles,
    title: 'Expressar',
    subtitle: 'Identidade com propósito',
    text: 'Transformamos a direção estratégica em nome, logo, cores, tipografia e linguagem visual.',
  },
  {
    id: 'apply',
    number: '04',
    icon: Rocket,
    title: 'Aplicar',
    subtitle: 'A marca em movimento',
    text: 'Levamos a identidade para materiais, canais digitais, conteúdo, campanhas e experiências reais.',
  },
];

const startingPoints: Array<{
  id: BrandStartingPointId;
  label: string;
  title: string;
  description: string;
  includes: string[];
}> = [
  {
    id: 'idea',
    label: 'Tenho apenas uma ideia',
    title: 'Começar pela essência da marca',
    description: 'Diagnóstico, posicionamento, nome e identidade visual para dar forma profissional ao negócio.',
    includes: ['Direção estratégica', 'Nome ou posicionamento', 'Logo e sistema visual'],
  },
  {
    id: 'existing',
    label: 'Já tenho uma marca',
    title: 'Organizar e profissionalizar a apresentação',
    description: 'Ajuste da identidade, materiais comerciais e padronização dos principais pontos de contato.',
    includes: ['Refinamento visual', 'Materiais institucionais', 'Organização dos canais'],
  },
  {
    id: 'digital',
    label: 'Quero entrar no digital',
    title: 'Conectar marca, conteúdo e tecnologia',
    description: 'Construção integrada da identidade aos canais digitais, atendimento e lançamento da empresa.',
    includes: ['Presença digital', 'Redes e conteúdo', 'Site ou solução digital'],
  },
];

const faqs = [
  ['Posso contratar somente a criação do logo?', 'Sim. É possível contratar uma etapa específica. Quando necessário, recomendamos uma análise mínima de posicionamento para que o visual tenha direção.'],
  ['Os modelos exibidos são trabalhos reais?', 'Não. São referências conceituais criadas para demonstrar estilos, aplicações e possibilidades. Cada marca é desenvolvida de forma própria.'],
  ['A GSA também desenvolve o nome da empresa?', 'Sim. O trabalho pode incluir direção de nome, conceito, personalidade e assinatura. Disponibilidade jurídica, domínio e registro precisam ser validados nos canais responsáveis.'],
  ['É possível incluir site, loja ou sistema?', 'Sim. A construção de marca pode ser conectada à área de Sites e Sistemas para formar uma presença digital completa.'],
];

function applyBrandMetadata() {
  const previousTitle = document.title;
  document.title = PAGE_TITLE;

  const entries = [
    ['meta[name="description"]', 'name', 'description', PAGE_DESCRIPTION],
    ['meta[property="og:title"]', 'property', 'og:title', PAGE_TITLE],
    ['meta[property="og:description"]', 'property', 'og:description', PAGE_DESCRIPTION],
    ['meta[property="og:url"]', 'property', 'og:url', `${window.location.origin}/identidade-e-web-design`],
  ] as const;

  const managed: Array<{ element: HTMLMetaElement; previous: string | null; created: boolean }> = [];
  for (const [selector, attribute, key, value] of entries) {
    let element = document.querySelector<HTMLMetaElement>(selector);
    const created = !element;
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    managed.push({ element, previous: element.getAttribute('content'), created });
    element.setAttribute('content', value);
  }

  return () => {
    document.title = previousTitle;
    for (const item of managed) {
      if (item.created) item.element.remove();
      else if (item.previous === null) item.element.removeAttribute('content');
      else item.element.setAttribute('content', item.previous);
    }
  };
}

export function BrandJourneyPage({ onBack, onSystems, onLogin }: BrandJourneyPageProps) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [selectedExample, setSelectedExample] = useState<BrandExampleCategory | null>(null);
  const [insightSelection, setInsightSelection] = useState<BrandInsightSelection | null>(null);

  useEffect(() => applyBrandMetadata(), []);

  const openWhatsApp = () => {
    const message = 'Olá! Gostaria de conversar sobre a construção profissional da minha marca e presença digital.';
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const openExamples = (category: BrandExampleCategory) => {
    setInsightSelection(null);
    setSelectedExample(category);
  };

  const openBudget = () => {
    setInsightSelection(null);
    setBudgetOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#efe8dc] text-[#1c1712]">
      <PublicHeader currentPage="brand-journey" onClientLogin={onLogin} />

      <main>
        <section className="overflow-hidden border-b border-[#d8cfc0] bg-[#f4efe6] pt-24">
          <div className="mx-auto grid min-h-[calc(100svh-6rem)] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="h-px w-10 bg-[#8e6e3d]" />
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#7b5d31]">Construção de marca</p>
              </div>
              <h1 className="mt-6 font-serif text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-[#211a14] sm:text-6xl lg:text-[4.5rem]">
                Sua empresa precisa parecer tão profissional quanto o trabalho que entrega.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-[#62594f] sm:text-lg">
                Criamos marcas com direção, personalidade e consistência para que cada contato com o cliente transmita confiança antes mesmo da primeira conversa.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setBudgetOpen(true)}
                  className="inline-flex items-center justify-center gap-2 bg-[#211a14] px-6 py-4 text-sm font-black text-white transition hover:bg-[#35291f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8e6e3d] focus-visible:ring-offset-2"
                >
                  Solicitar análise da marca
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={openWhatsApp}
                  className="inline-flex items-center justify-center gap-2 border border-[#b9aa95] bg-transparent px-6 py-4 text-sm font-black text-[#211a14] transition hover:border-[#211a14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8e6e3d] focus-visible:ring-offset-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Conversar com especialista
                </button>
              </div>
            </div>

            <BrandStudioBoard onOpen={(topic) => setInsightSelection({ kind: 'studio', topic })} />
          </div>
        </section>

        <section className="bg-[#211a14] text-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:px-8">
            <span className="font-serif text-5xl leading-none text-[#c8a96c]">“</span>
            <p className="max-w-4xl font-serif text-2xl leading-snug text-white/90 sm:text-3xl">
              Uma marca forte não é apenas bonita. Ela deixa claro quem você é, para quem trabalha e por que merece ser escolhida.
            </p>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Estratégia + identidade + aplicação</span>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7b5d31]">Escolha uma experiência</p>
              <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                A marca ganha forma em diferentes pontos de contato.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#675d52] sm:text-base">
                Explore as categorias e veja referências de direção visual, aplicação e presença. Cada bloco abre uma galeria própria.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {services.map((service, index) => {
                const Icon = service.icon;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => openExamples(service.id)}
                    className={`group relative overflow-hidden border p-6 text-left transition duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b5d31] focus-visible:ring-offset-2 ${service.wide ? 'sm:col-span-2' : ''} ${service.dark ? 'border-[#211a14] bg-[#211a14] text-white' : 'border-[#cfc4b5] bg-[#f8f4ed] text-[#211a14]'}`}
                  >
                    <div className="flex items-start justify-between gap-5">
                      <span className={`flex h-11 w-11 items-center justify-center border ${service.dark ? 'border-white/15 text-[#d8bb7a]' : 'border-[#bba98f] text-[#7b5d31]'}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className={`text-[10px] font-black tracking-[0.18em] ${service.dark ? 'text-white/35' : 'text-[#9a8c79]'}`}>
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-8 font-serif text-2xl font-semibold">{service.title}</h3>
                    <p className={`mt-3 max-w-xl text-sm leading-6 ${service.dark ? 'text-white/60' : 'text-[#675d52]'}`}>{service.text}</p>
                    <div className={`mt-6 border-t pt-4 ${service.dark ? 'border-white/12' : 'border-[#d9d0c4]'}`}>
                      <p className={`text-xs font-semibold leading-5 ${service.dark ? 'text-[#d8bb7a]' : 'text-[#76592d]'}`}>{service.result}</p>
                      <span className={`mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] ${service.dark ? 'text-white' : 'text-[#211a14]'}`}>
                        Abrir referências
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#d8c7aa] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5f4523]">A jornada criativa</p>
              <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                Uma marca profissional nasce de decisões conectadas.
              </h2>
              <p className="mt-5 text-sm leading-7 text-[#574b3d]">Selecione uma etapa para entender o trabalho realizado, a participação do cliente e as entregas geradas.</p>
            </div>

            <div className="mt-12 border-t border-[#9f8865]">
              {journey.map(({ id, number, icon: Icon, title, subtitle, text }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInsightSelection({ kind: 'journey', id })}
                  className="group grid w-full gap-4 border-b border-[#9f8865] py-7 text-left transition hover:bg-[#cfba96]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5f4523] sm:grid-cols-[70px_52px_0.65fr_1fr_24px] sm:items-start sm:gap-6 sm:px-3 sm:py-8"
                >
                  <span className="font-serif text-4xl text-[#71552d]">{number}</span>
                  <span className="flex h-11 w-11 items-center justify-center border border-[#80663f] text-[#5f4523] transition group-hover:bg-[#211a14] group-hover:text-[#d8bb7a]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-serif text-2xl font-semibold">{title}</h3>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.15em] text-[#70542c]">{subtitle}</p>
                  </div>
                  <p className="text-sm leading-7 text-[#574b3d]">{text}</p>
                  <ArrowRight className="hidden h-4 w-4 text-[#71552d] transition-transform group-hover:translate-x-1 sm:block" />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f8f4ed] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7b5d31]">Onde sua empresa está hoje?</p>
                <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                  O ponto de partida muda. A direção profissional permanece.
                </h2>
                <p className="mt-5 text-sm leading-7 text-[#675d52]">Escolha o cenário mais próximo da sua realidade para receber uma rota inicial de construção.</p>
              </div>

              <div className="border-t border-[#cfc4b5]">
                {startingPoints.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setInsightSelection({ kind: 'starting', id: item.id })}
                    className="group grid w-full gap-5 border-b border-[#cfc4b5] py-7 text-left transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7b5d31] sm:grid-cols-[44px_1fr_28px] sm:px-3 sm:py-8"
                  >
                    <span className="font-serif text-3xl text-[#8b7047]">0{index + 1}</span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7b5d31]">{item.label}</p>
                      <h3 className="mt-2 font-serif text-2xl font-semibold">{item.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-[#675d52]">{item.description}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.includes.map((line) => (
                          <span key={line} className="inline-flex items-center gap-1.5 border border-[#cbbfae] bg-white px-3 py-1.5 text-[10px] font-bold text-[#5d5145]">
                            <Check className="h-3 w-3 text-[#7b5d31]" strokeWidth={3} />
                            {line}
                          </span>
                        ))}
                      </div>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#211a14] group-hover:text-[#7b5d31]">
                        Ver rota recomendada
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                    <ArrowRight className="mt-1 hidden h-4 w-4 text-[#8b7047] transition-transform group-hover:translate-x-1 sm:block" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#211a14] py-16 text-white sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c8a96c]">Da identidade para a experiência digital</p>
              <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight sm:text-5xl">
                Quando a marca está pronta, ela precisa ganhar espaço para funcionar.
              </h2>
              <p className="mt-5 text-sm leading-7 text-white/60 sm:text-base">
                A mesma construção pode avançar para site institucional, loja virtual, aplicativo, sistema, automação ou portal de atendimento.
              </p>
            </div>
            <button
              type="button"
              onClick={onSystems}
              className="inline-flex items-center justify-center gap-2 border border-[#c8a96c] px-6 py-4 text-sm font-black text-[#e0c78e] transition hover:bg-[#c8a96c] hover:text-[#211a14]"
            >
              Conhecer Sites e Sistemas
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7b5d31]">Dúvidas frequentes</p>
              <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight">Antes de iniciar</h2>
            </div>
            <div className="border-t border-[#bfb3a2]">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group border-b border-[#bfb3a2] py-5">
                  <summary className="cursor-pointer list-none pr-8 font-serif text-xl font-semibold marker:hidden">{question}</summary>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-[#675d52]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
          <div className="mx-auto grid max-w-7xl overflow-hidden border border-[#bba98f] bg-[#cdb790] lg:grid-cols-[1fr_340px]">
            <div className="p-7 sm:p-10 lg:p-12">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5d4422]">Sua próxima percepção começa aqui</p>
              <h2 className="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
                Conte como sua empresa é hoje. Nós ajudamos a construir como ela deve ser percebida amanhã.
              </h2>
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-[#a9916b] bg-[#bda477] p-7 lg:border-l lg:border-t-0">
              <button type="button" onClick={() => setBudgetOpen(true)} className="inline-flex items-center justify-center gap-2 bg-[#211a14] px-6 py-4 text-sm font-black text-white">
                Solicitar análise da marca
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={openWhatsApp} className="inline-flex items-center justify-center gap-2 border border-[#715a38] px-6 py-4 text-sm font-black text-[#211a14]">
                <MessageCircle className="h-4 w-4" />
                Falar pelo WhatsApp
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#17120e] py-9 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <LogoGSA size="md" variant="light" />
            <p className="mt-3 text-sm text-white/45">Estratégia, identidade e presença profissional. Nenhuma empresa séria pode garantir vendas, mas a apresentação da sua marca muda a forma como o cliente enxerga seu valor.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold text-white/65">
            <button type="button" onClick={onBack} className="hover:text-[#d6bb80]">Início</button>
            <button type="button" onClick={onSystems} className="hover:text-[#d6bb80]">Sites e Sistemas</button>
            <button type="button" onClick={() => navigate('/privacidade')} className="hover:text-[#d6bb80]">Privacidade</button>
            <button type="button" onClick={openWhatsApp} className="hover:text-[#d6bb80]">Contato</button>
          </div>
        </div>
      </footer>

      <BrandInsightDialog
        selection={insightSelection}
        onClose={() => setInsightSelection(null)}
        onOpenExamples={openExamples}
        onRequestBudget={openBudget}
      />
      <BrandExamplesDialog
        category={selectedExample}
        onClose={() => setSelectedExample(null)}
        onRequestBudget={() => setBudgetOpen(true)}
      />
      <SystemsBudgetModal isOpen={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </div>
  );
}

function BrandStudioBoard({ onOpen }: { onOpen: (topic: BrandStudioTopic) => void }) {
  return (
    <div className="relative mx-auto w-full max-w-2xl py-5 sm:py-10">
      <div className="absolute left-3 top-0 h-24 w-24 border border-[#c8b89e] bg-[#e8dece]" />
      <div className="absolute right-1 top-8 h-20 w-20 rounded-full bg-[#8f6749]" />
      <div className="relative ml-auto w-[92%] border border-[#bcae9b] bg-[#fbf8f2] p-4 shadow-[0_30px_70px_rgba(64,44,24,0.15)] sm:p-6">
        <div className="flex items-center justify-between border-b border-[#d7cec1] pb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#7b5d31]">Painel de direção visual</p>
          <span className="text-[9px] font-bold text-[#9c8c78]">Toque para explorar</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
          <button
            type="button"
            onClick={() => onOpen('positioning')}
            className="group flex min-h-[260px] flex-col justify-between bg-[#211a14] p-6 text-left text-white transition hover:bg-[#30251d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a96c]"
          >
            <div>
              <span className="block h-1 w-12 bg-[#c8a96c]" />
              <p className="mt-5 font-serif text-5xl leading-none">ATELIÊ</p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.25em] text-[#d6bb80]">Forma & essência</p>
            </div>
            <div>
              <p className="max-w-xs text-xs leading-5 text-white/50">Uma marca com direção, personalidade e linguagem própria.</p>
              <span className="mt-4 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-[#d8bb7a]">Explorar posicionamento <ArrowRight className="h-3 w-3 transition group-hover:translate-x-1" /></span>
            </div>
          </button>

          <div className="grid gap-4">
            <button
              type="button"
              onClick={() => onOpen('visual')}
              className="group border border-[#d7cec1] p-4 text-left transition hover:border-[#8e6e3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8e6e3d]"
            >
              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-[#8b765d]">Paleta e sistema visual</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <span className="aspect-square bg-[#211a14]" />
                <span className="aspect-square bg-[#8f6749]" />
                <span className="aspect-square bg-[#c8a96c]" />
                <span className="aspect-square border border-[#ddd3c5] bg-[#efe8dc]" />
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-[#7b5d31]">Entender as escolhas <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onOpen('audience')}
                className="group aspect-[4/5] bg-[#cdb790] p-3 text-left transition hover:bg-[#c3ab80] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8e6e3d]"
              >
                <span className="text-[8px] font-black uppercase tracking-wider">Mensagem e público</span>
                <p className="mt-6 font-serif text-lg leading-tight">Menos ruído. Mais significado.</p>
                <span className="mt-5 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider">Explorar <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
              </button>
              <button
                type="button"
                onClick={() => onOpen('application')}
                className="group aspect-[4/5] border border-[#d7cec1] bg-white p-3 text-left transition hover:border-[#8e6e3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8e6e3d]"
              >
                <div className="h-16 bg-[#211a14]" />
                <span className="mt-3 block h-2 w-4/5 bg-[#d5ccbf]" />
                <span className="mt-2 block h-1.5 w-full bg-[#e5dfd6]" />
                <span className="mt-1.5 block h-1.5 w-3/4 bg-[#e5dfd6]" />
                <span className="mt-4 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-[#7b5d31]">Ver aplicações <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#d7cec1] pt-4">
          <div className="flex flex-wrap items-center gap-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[#766854]">
            <button type="button" onClick={() => onOpen('positioning')} className="inline-flex items-center gap-1 hover:text-[#211a14]"><Target className="h-3.5 w-3.5" /> Posicionamento</button>
            <button type="button" onClick={() => onOpen('audience')} className="inline-flex items-center gap-1 hover:text-[#211a14]"><Users className="h-3.5 w-3.5" /> Público</button>
            <button type="button" onClick={() => onOpen('application')} className="inline-flex items-center gap-1 hover:text-[#211a14]"><Globe2 className="h-3.5 w-3.5" /> Aplicação</button>
          </div>
          <span className="font-serif text-sm italic text-[#7b5d31]">Do conceito ao contato.</span>
        </div>
      </div>
    </div>
  );
}

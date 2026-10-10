import {
  ArrowRight,
  Check,
  Compass,
  FileCheck2,
  Globe2,
  Layers3,
  Palette,
  PenTool,
  Rocket,
  Target,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import type { BrandExampleCategory } from './BrandExamplesDialog';

export type BrandJourneyInsightId = 'discover' | 'define' | 'express' | 'apply';
export type BrandStartingPointId = 'idea' | 'existing' | 'digital';
export type BrandStudioTopic = 'positioning' | 'audience' | 'visual' | 'application';

export type BrandInsightSelection =
  | { kind: 'journey'; id: BrandJourneyInsightId }
  | { kind: 'starting'; id: BrandStartingPointId }
  | { kind: 'studio'; topic?: BrandStudioTopic };

interface BrandInsightDialogProps {
  selection: BrandInsightSelection | null;
  onClose: () => void;
  onOpenExamples: (category: BrandExampleCategory) => void;
  onRequestBudget: () => void;
}

interface JourneyData {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  purpose: string;
  happens: string[];
  client: string[];
  deliverables: string[];
  next: string;
}

const journeyData: Record<BrandJourneyInsightId, JourneyData> = {
  discover: {
    title: 'Descobrir a essência da marca',
    subtitle: 'Estratégia antes da estética',
    icon: Compass,
    purpose: 'Compreender o negócio, o público, o contexto e a percepção que a empresa precisa construir antes de escolher nome, símbolo ou cores.',
    happens: ['Leitura do negócio e da atuação', 'Identificação do público e do contexto', 'Levantamento de referências e concorrentes', 'Definição dos problemas de percepção'],
    client: ['Explica a história e a rotina da empresa', 'Apresenta objetivos e prioridades', 'Compartilha referências e restrições'],
    deliverables: ['Diagnóstico da marca', 'Direção inicial de posicionamento', 'Critérios para as próximas decisões'],
    next: 'A etapa seguinte transforma as descobertas em uma direção estratégica clara.',
  },
  define: {
    title: 'Definir uma direção clara',
    subtitle: 'Critérios para orientar escolhas',
    icon: Target,
    purpose: 'Organizar posicionamento, personalidade, mensagem e diferenciais para que todas as decisões visuais e verbais apontem para a mesma percepção.',
    happens: ['Construção da proposta de valor', 'Definição da personalidade da marca', 'Organização de mensagens e diferenciais', 'Escolha do território verbal e visual'],
    client: ['Valida o posicionamento proposto', 'Confirma prioridades comerciais', 'Alinha o tom desejado para a comunicação'],
    deliverables: ['Posicionamento resumido', 'Personalidade e tom de voz', 'Direção verbal e conceitual'],
    next: 'Com a direção aprovada, a estratégia começa a ganhar forma visual e verbal.',
  },
  express: {
    title: 'Expressar a identidade',
    subtitle: 'Transformar estratégia em presença',
    icon: Palette,
    purpose: 'Criar nome, assinatura, logo, cores, tipografia e linguagem visual de forma coerente com o posicionamento definido.',
    happens: ['Desenvolvimento das direções criativas', 'Construção do sistema de identidade', 'Testes de leitura e aplicação', 'Refinamento da proposta escolhida'],
    client: ['Analisa as direções apresentadas', 'Escolhe com base nos critérios estratégicos', 'Valida ajustes e aplicações principais'],
    deliverables: ['Logo e versões', 'Paleta e tipografia', 'Elementos de apoio e regras básicas'],
    next: 'A identidade aprovada passa a ser aplicada nos pontos de contato reais da empresa.',
  },
  apply: {
    title: 'Aplicar e colocar a marca em movimento',
    subtitle: 'Do conceito ao contato com o cliente',
    icon: Rocket,
    purpose: 'Levar a identidade para materiais, redes sociais, campanhas, site, atendimento e demais ambientes onde a empresa precisa ser reconhecida.',
    happens: ['Priorização dos pontos de contato', 'Adaptação da identidade para cada formato', 'Criação de materiais e modelos', 'Organização da presença digital'],
    client: ['Define canais e materiais prioritários', 'Valida informações comerciais', 'Organiza responsáveis pelo uso da marca'],
    deliverables: ['Materiais aplicados', 'Modelos para comunicação', 'Canais visuais organizados'],
    next: 'A marca passa a operar com consistência e pode evoluir conforme a empresa cresce.',
  },
};

interface StartingPointData {
  label: string;
  title: string;
  description: string;
  recommendation: BrandExampleCategory;
  recommendationLabel: string;
  firstMove: string;
  roadmap: Array<{ title: string; text: string }>;
  attention: string[];
}

const startingPointData: Record<BrandStartingPointId, StartingPointData> = {
  idea: {
    label: 'Tenho apenas uma ideia',
    title: 'Construir a base antes de aparecer',
    description: 'Quando o negócio ainda está no início, o maior risco é escolher nome, logo e comunicação sem uma direção que sustente o crescimento.',
    recommendation: 'naming',
    recommendationLabel: 'Começar por nome e posicionamento',
    firstMove: 'Organizar essência, público, proposta de valor e critérios de percepção antes da criação visual.',
    roadmap: [
      { title: 'Essência', text: 'Entender negócio, público e objetivo.' },
      { title: 'Posicionamento', text: 'Definir personalidade, mensagem e diferenciais.' },
      { title: 'Identidade', text: 'Criar nome, logo e sistema visual.' },
      { title: 'Presença', text: 'Aplicar a marca nos canais prioritários.' },
    ],
    attention: ['Evitar nome sem relação com a proposta', 'Não escolher logo apenas por gosto pessoal', 'Preparar a marca para usos futuros'],
  },
  existing: {
    label: 'Já tenho uma marca',
    title: 'Organizar o que existe e elevar a percepção',
    description: 'Uma marca existente pode ter valor acumulado, mas perder força quando logo, materiais, redes e mensagens parecem pertencer a empresas diferentes.',
    recommendation: 'identity',
    recommendationLabel: 'Avaliar identidade e consistência',
    firstMove: 'Identificar o que deve ser preservado, corrigido e padronizado sem apagar o reconhecimento já construído.',
    roadmap: [
      { title: 'Auditoria', text: 'Revisar identidade, mensagens e aplicações.' },
      { title: 'Direção', text: 'Separar elementos fortes de problemas visuais.' },
      { title: 'Refinamento', text: 'Atualizar logo, cores, tipografia e regras.' },
      { title: 'Padronização', text: 'Aplicar a nova direção nos materiais e canais.' },
    ],
    attention: ['Preservar reconhecimento relevante', 'Corrigir inconsistências de aplicação', 'Criar regras simples para a equipe'],
  },
  digital: {
    label: 'Quero entrar no digital',
    title: 'Conectar marca, conteúdo e experiência',
    description: 'Entrar no digital não significa apenas abrir perfis. A marca precisa manter a mesma percepção entre site, redes sociais, campanhas, WhatsApp e atendimento.',
    recommendation: 'digital',
    recommendationLabel: 'Planejar uma presença digital integrada',
    firstMove: 'Definir a jornada do cliente e organizar como cada canal apresenta, informa e conduz para o próximo passo.',
    roadmap: [
      { title: 'Base visual', text: 'Adaptar identidade para telas e formatos digitais.' },
      { title: 'Canais', text: 'Organizar site, redes e atendimento.' },
      { title: 'Conteúdo', text: 'Definir linhas editoriais e campanhas.' },
      { title: 'Conversão', text: 'Conectar descoberta, interesse e contato.' },
    ],
    attention: ['Evitar canais com aparências diferentes', 'Definir função para cada plataforma', 'Manter contato e chamada para ação claros'],
  },
};

interface StudioTopicData {
  label: string;
  title: string;
  icon: LucideIcon;
  description: string;
  questions: string[];
  outputs: string[];
  category: BrandExampleCategory;
}

const studioTopics: Record<BrandStudioTopic, StudioTopicData> = {
  positioning: {
    label: 'Posicionamento',
    title: 'O lugar que a marca pretende ocupar',
    icon: Target,
    description: 'Posicionamento define qual percepção a empresa quer construir e por que deve ser escolhida em vez de apenas reconhecida visualmente.',
    questions: ['Qual problema a empresa resolve?', 'Para qual público deseja ser relevante?', 'Que diferença precisa ficar clara?', 'Qual percepção deve acompanhar o nome?'],
    outputs: ['Proposta de valor', 'Mensagem principal', 'Diferenciais organizados', 'Território de comunicação'],
    category: 'naming',
  },
  audience: {
    label: 'Público',
    title: 'A marca vista pelos olhos de quem decide',
    icon: Users,
    description: 'A identidade precisa conversar com o público certo, respeitando expectativas, contexto, nível de confiança e forma de decisão.',
    questions: ['Quem compra ou influencia a decisão?', 'O público busca segurança, proximidade ou exclusividade?', 'Quais dúvidas aparecem antes do contato?', 'Que linguagem facilita a compreensão?'],
    outputs: ['Perfil de público', 'Tom de voz', 'Prioridades de conteúdo', 'Critérios de linguagem visual'],
    category: 'social',
  },
  visual: {
    label: 'Sistema visual',
    title: 'Uma linguagem que funciona além do logo',
    icon: Palette,
    description: 'A identidade visual combina símbolo, tipografia, cor, composição e elementos de apoio para manter reconhecimento em diferentes formatos.',
    questions: ['A marca precisa parecer mais institucional ou próxima?', 'Quais aplicações serão mais frequentes?', 'Como manter legibilidade em tamanhos pequenos?', 'Quais elementos a equipe consegue usar com consistência?'],
    outputs: ['Logo e versões', 'Paleta funcional', 'Sistema tipográfico', 'Elementos e regras de composição'],
    category: 'identity',
  },
  application: {
    label: 'Aplicação',
    title: 'A identidade funcionando nos pontos de contato',
    icon: Globe2,
    description: 'A percepção se consolida quando a mesma marca aparece de forma coerente em documentos, redes, site, campanhas e atendimento.',
    questions: ['Onde o cliente encontra a empresa primeiro?', 'Quais materiais apoiam a venda?', 'Que canais precisam ser padronizados?', 'Como a equipe continuará usando a identidade?'],
    outputs: ['Materiais prioritários', 'Modelos de comunicação', 'Presença digital organizada', 'Guia prático de aplicação'],
    category: 'digital',
  },
};

function getDialogHeader(selection: BrandInsightSelection | null) {
  if (!selection) return null;
  if (selection.kind === 'journey') {
    const data = journeyData[selection.id];
    return { eyebrow: 'Jornada de construção', title: data.title, icon: data.icon };
  }
  if (selection.kind === 'starting') {
    const data = startingPointData[selection.id];
    return { eyebrow: data.label, title: data.title, icon: Compass };
  }
  const data = studioTopics[selection.topic || 'positioning'];
  return { eyebrow: 'Painel de direção visual', title: data.title, icon: data.icon };
}

export function BrandInsightDialog({ selection, onClose, onOpenExamples, onRequestBudget }: BrandInsightDialogProps) {
  const header = getDialogHeader(selection);
  const HeaderIcon = header?.icon;

  return (
    <AccessibleDialog
      isOpen={Boolean(selection)}
      onClose={onClose}
      ariaLabel={header?.title || 'Detalhes da construção de marca'}
      overlayClassName="items-center justify-center overflow-y-auto bg-[#17120e]/88 p-2 backdrop-blur-sm sm:p-5"
      panelClassName="max-h-[94dvh] max-w-5xl overflow-hidden border border-[#8f806d] bg-[#efe8dc] shadow-[0_35px_110px_rgba(0,0,0,0.62)]"
    >
      {selection && header && HeaderIcon && (
        <div className="flex max-h-[94dvh] min-h-0 flex-col text-[#211a14]">
          <header className="shrink-0 border-b border-white/10 bg-[#211a14] px-4 py-4 text-white sm:px-6 sm:py-5">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/15 text-[#d8bb7a]">
                <HeaderIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#d8bb7a]">{header.eyebrow}</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold leading-tight sm:text-3xl">{header.title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                data-dialog-autofocus
                aria-label="Fechar detalhes"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bb7a]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f4efe6] p-4 sm:p-6 lg:p-8">
            {selection.kind === 'journey' && (
              <JourneyExperience data={journeyData[selection.id]} onRequestBudget={onRequestBudget} />
            )}
            {selection.kind === 'starting' && (
              <StartingPointExperience
                data={startingPointData[selection.id]}
                onOpenExamples={onOpenExamples}
                onRequestBudget={onRequestBudget}
              />
            )}
            {selection.kind === 'studio' && (
              <StudioExperience
                topic={selection.topic || 'positioning'}
                onOpenExamples={onOpenExamples}
                onRequestBudget={onRequestBudget}
              />
            )}
          </div>
        </div>
      )}
    </AccessibleDialog>
  );
}

function JourneyExperience({ data, onRequestBudget }: { data: JourneyData; onRequestBudget: () => void }) {
  return (
    <div>
      <p className="max-w-3xl font-serif text-2xl leading-snug text-[#3a2d22]">{data.purpose}</p>
      <div className="mt-7 grid gap-4 lg:grid-cols-3">
        <EditorialList title="O que acontece" items={data.happens} icon={PenTool} />
        <EditorialList title="Participação do cliente" items={data.client} icon={Users} />
        <EditorialList title="Entregas da etapa" items={data.deliverables} icon={FileCheck2} />
      </div>
      <div className="mt-5 grid gap-5 border border-[#bba98f] bg-[#d8c7aa] p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#644925]">Como a jornada continua</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#4f402f]">{data.next}</p>
        </div>
        <button type="button" onClick={onRequestBudget} className="inline-flex items-center justify-center gap-2 bg-[#211a14] px-5 py-3.5 text-sm font-black text-white">
          Conversar sobre esta jornada
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StartingPointExperience({ data, onOpenExamples, onRequestBudget }: { data: StartingPointData; onOpenExamples: (category: BrandExampleCategory) => void; onRequestBudget: () => void }) {
  return (
    <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">
      <section>
        <p className="text-sm leading-7 text-[#675d52]">{data.description}</p>
        <div className="mt-6 border-l-4 border-[#8e6e3d] bg-white p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#7b5d31]">Primeiro movimento recomendado</p>
          <p className="mt-3 font-serif text-xl leading-snug text-[#2d241c]">{data.firstMove}</p>
        </div>
        <div className="mt-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#7b5d31]">Pontos de atenção</p>
          <ul className="mt-3 space-y-2">
            {data.attention.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-[#5f554a]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7b5d31]" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <aside className="border border-[#bba98f] bg-[#211a14] p-5 text-white sm:p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d8bb7a]">Rota recomendada</p>
        <h3 className="mt-3 font-serif text-3xl font-semibold leading-tight">{data.recommendationLabel}</h3>
        <div className="mt-6 border-t border-white/12">
          {data.roadmap.map((step, index) => (
            <div key={step.title} className="grid grid-cols-[40px_1fr] gap-3 border-b border-white/12 py-4">
              <span className="font-serif text-xl text-[#d8bb7a]">0{index + 1}</span>
              <div>
                <p className="text-sm font-black">{step.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
          <button type="button" onClick={() => onOpenExamples(data.recommendation)} className="inline-flex items-center justify-center gap-2 bg-[#d8bb7a] px-5 py-3.5 text-sm font-black text-[#211a14]">
            Ver referências indicadas
            <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRequestBudget} className="inline-flex items-center justify-center gap-2 border border-white/20 px-5 py-3.5 text-sm font-black text-white">
            Solicitar diagnóstico
          </button>
        </div>
      </aside>
    </div>
  );
}

function StudioExperience({ topic, onOpenExamples, onRequestBudget }: { topic: BrandStudioTopic; onOpenExamples: (category: BrandExampleCategory) => void; onRequestBudget: () => void }) {
  const data = studioTopics[topic];
  const TopicIcon = data.icon;

  return (
    <section className="border border-[#c8b89e] bg-white p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#bba98f] text-[#7b5d31]">
          <TopicIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#7b5d31]">{data.label}</p>
          <h3 className="mt-2 font-serif text-3xl font-semibold leading-tight">{data.title}</h3>
        </div>
      </div>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-[#675d52]">{data.description}</p>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <EditorialList title="Perguntas que orientam" items={data.questions} icon={Compass} />
        <EditorialList title="O que esta análise produz" items={data.outputs} icon={Layers3} />
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-[#d7cec1] pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => onOpenExamples(data.category)} className="inline-flex items-center justify-center gap-2 border border-[#bba98f] px-5 py-3.5 text-sm font-black text-[#211a14]">
          Ver referências relacionadas
        </button>
        <button type="button" onClick={onRequestBudget} className="inline-flex items-center justify-center gap-2 bg-[#211a14] px-5 py-3.5 text-sm font-black text-white">
          Solicitar análise da marca
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function EditorialList({ title, items, icon: Icon }: { title: string; items: string[]; icon: LucideIcon }) {
  return (
    <article className="border border-[#c8b89e] bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center border border-[#c8b89e] text-[#7b5d31]">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-serif text-lg font-semibold">{title}</h3>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-[#62584e]">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7b5d31]" strokeWidth={3} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

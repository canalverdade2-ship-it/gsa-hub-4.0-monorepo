import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  Code2,
  Database,
  Gauge,
  Globe2,
  Headphones,
  Layers3,
  Link2,
  MessageCircle,
  MonitorSmartphone,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { LogoGSA } from '../ui/LogoGSA';
import { navigate } from '../../routing/navigationService';
import { PublicHeader } from './final/PublicHeader';
import { BrandJourneyPage } from './BrandJourneyPage';
import { SystemsBudgetModal } from './SystemsBudgetModal';
import {
  SystemsExamplesDialog,
  type SystemExampleCategory,
} from './SystemsExamplesDialog';
import {
  SystemsInsightDialog,
  type FoundationInsightId,
  type GoalInsightId,
  type StageInsightId,
  type SystemsInsightSelection,
} from './SystemsInsightDialog';

const WHATSAPP_NUMBER = '5511920857756';

interface SystemsPageFinalProps {
  onBack: () => void;
  onLogin: () => void;
}

interface SolutionItem {
  id: SystemExampleCategory;
  icon: LucideIcon;
  title: string;
  short: string;
  statement: string;
  description: string;
  outcome: string;
  modules: string[];
}

const solutions: SolutionItem[] = [
  {
    id: 'sites',
    icon: Globe2,
    title: 'Sites institucionais',
    short: 'Apresentar',
    statement: 'Sua empresa compreendida em poucos segundos.',
    description: 'Estruturas profissionais para explicar serviços, gerar confiança e transformar visitas em contatos qualificados.',
    outcome: 'Presença digital, autoridade e geração de oportunidades.',
    modules: ['Página inicial estratégica', 'Serviços e diferenciais', 'Formulários e WhatsApp', 'Conteúdo responsivo'],
  },
  {
    id: 'stores',
    icon: ShoppingCart,
    title: 'Lojas virtuais',
    short: 'Vender',
    statement: 'Uma jornada de compra simples do produto ao pedido.',
    description: 'Vitrines digitais organizadas para catálogo, busca, produto, carrinho, pagamento e acompanhamento comercial.',
    outcome: 'Venda digital com experiência clara e operação centralizada.',
    modules: ['Catálogo e categorias', 'Carrinho e checkout', 'Pedidos e pagamentos', 'Área do cliente'],
  },
  {
    id: 'systems',
    icon: Code2,
    title: 'Sistemas personalizados',
    short: 'Gerenciar',
    statement: 'O processo da empresa transformado em um ambiente de trabalho.',
    description: 'Soluções sob medida para centralizar informações, usuários, tarefas, regras, indicadores e decisões.',
    outcome: 'Mais controle, menos retrabalho e visão real da operação.',
    modules: ['Painéis e indicadores', 'Fluxos por status', 'Permissões de acesso', 'Histórico e relatórios'],
  },
  {
    id: 'portals',
    icon: Smartphone,
    title: 'Portais e aplicativos',
    short: 'Atender',
    statement: 'Serviços disponíveis ao cliente, equipe ou parceiro em qualquer tela.',
    description: 'Áreas seguras para acompanhar solicitações, documentos, pagamentos, mensagens e atividades recorrentes.',
    outcome: 'Relacionamento organizado e autonomia para cada público.',
    modules: ['Login e perfis', 'Solicitações e documentos', 'Notificações', 'Experiência mobile'],
  },
  {
    id: 'automations',
    icon: Workflow,
    title: 'Automações',
    short: 'Automatizar',
    statement: 'Tarefas repetitivas deixam de depender da memória da equipe.',
    description: 'Fluxos automáticos para receber dados, aplicar regras, distribuir atividades e gerar alertas no momento certo.',
    outcome: 'Processos mais rápidos, consistentes e rastreáveis.',
    modules: ['Gatilhos e regras', 'Distribuição automática', 'Alertas e lembretes', 'Registro de execução'],
  },
  {
    id: 'integrations',
    icon: Link2,
    title: 'Integrações',
    short: 'Conectar',
    statement: 'As ferramentas da empresa trabalhando como uma única operação.',
    description: 'Conexões entre pagamentos, atendimento, vendas, dados e plataformas já utilizadas pelo negócio.',
    outcome: 'Informações sincronizadas e menos digitação duplicada.',
    modules: ['APIs e webhooks', 'Pagamentos', 'CRM e atendimento', 'Sincronização de dados'],
  },
];

const goals: Array<{
  id: GoalInsightId;
  icon: LucideIcon;
  title: string;
  text: string;
  target: SystemExampleCategory;
}> = [
  { id: 'present', icon: Globe2, title: 'Apresentar melhor', text: 'Site, landing page ou catálogo para fortalecer a presença da empresa.', target: 'sites' },
  { id: 'sell', icon: ShoppingCart, title: 'Vender no digital', text: 'Loja, assinatura ou fluxo comercial para receber pedidos.', target: 'stores' },
  { id: 'organize', icon: BarChart3, title: 'Organizar a operação', text: 'Sistema, painel ou portal para centralizar processos e informações.', target: 'systems' },
  { id: 'productivity', icon: Sparkles, title: 'Ganhar produtividade', text: 'Automação e integração para reduzir tarefas manuais e retrabalho.', target: 'automations' },
];

const deliveryStages: Array<{
  id: StageInsightId;
  number: string;
  icon: LucideIcon;
  title: string;
  text: string;
}> = [
  { id: 'map', number: '01', icon: Search, title: 'Mapear', text: 'Entendemos o problema, os usuários, as regras e o resultado esperado.' },
  { id: 'architect', number: '02', icon: Layers3, title: 'Arquitetar', text: 'Organizamos módulos, fluxos, dados, prioridades e experiência de uso.' },
  { id: 'build', number: '03', icon: Code2, title: 'Construir', text: 'Desenvolvemos a solução e validamos cada fluxo importante do projeto.' },
  { id: 'launch', number: '04', icon: Rocket, title: 'Implantar', text: 'Preparamos a entrada em uso e uma base segura para evolução contínua.' },
];

const engineering: Array<{
  id: FoundationInsightId;
  icon: LucideIcon;
  title: string;
  text: string;
}> = [
  { id: 'security', icon: ShieldCheck, title: 'Acessos e segurança', text: 'Permissões, perfis e informações organizados conforme cada tipo de usuário.' },
  { id: 'responsive', icon: MonitorSmartphone, title: 'Experiência responsiva', text: 'Interface pensada para funcionar com clareza no celular e no computador.' },
  { id: 'data', icon: Database, title: 'Dados estruturados', text: 'Informações centralizadas para consulta, acompanhamento e geração de relatórios.' },
  { id: 'performance', icon: Gauge, title: 'Desempenho e evolução', text: 'Base preparada para manutenção, novos módulos e mudanças futuras.' },
  { id: 'support', icon: Headphones, title: 'Acompanhamento do projeto', text: 'Validações organizadas para manter escopo, decisões e entregas alinhados.' },
  { id: 'connected', icon: Boxes, title: 'Solução conectada', text: 'Módulos e integrações desenhados como partes de uma única experiência.' },
];

export function SystemsPageFinal({ onBack, onLogin }: SystemsPageFinalProps) {
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [activeSolution, setActiveSolution] = useState<SystemExampleCategory>('systems');
  const [selectedExample, setSelectedExample] = useState<SystemExampleCategory | null>(null);
  const [insightSelection, setInsightSelection] = useState<SystemsInsightSelection | null>(null);
  const isBrandJourney = ['/empresa-do-zero-ao-digital', '/identidade-e-web-design'].includes(
    window.location.pathname.replace(/\/+$/, '')
  );

  if (isBrandJourney) {
    return (
      <BrandJourneyPage
        onBack={() => navigate('/')}
        onSystems={() => navigate('/criacao-de-site-e-sistemas')}
        onLogin={onLogin}
      />
    );
  }

  const selectedSolution = solutions.find((item) => item.id === activeSolution) || solutions[0];
  const SelectedIcon = selectedSolution.icon;

  const openWhatsApp = () => {
    const message = 'Olá! Gostaria de falar sobre a criação de um site, aplicativo, sistema ou automação.';
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const exploreSolution = (category: SystemExampleCategory) => {
    setActiveSolution(category);
    document.getElementById('solution-lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openExamples = (category: SystemExampleCategory) => {
    setInsightSelection(null);
    setSelectedExample(category);
  };

  const openBudget = () => {
    setInsightSelection(null);
    setBudgetOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#07101b] text-white">
      <PublicHeader currentPage="systems" onClientLogin={onLogin} />

      <main>
        <section className="border-b border-white/10 bg-[#08121e] pt-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d7b96e]">
                Criação de sites e sistemas
              </p>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.035em] sm:text-5xl lg:text-[3.65rem]">
                Sites e sistemas desenvolvidos para a realidade da sua empresa.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Projetamos soluções digitais para apresentar serviços, vender, atender clientes, organizar processos e conectar a operação — sem obrigar sua empresa a se adaptar a uma estrutura genérica.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setBudgetOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#d7b96e] px-6 py-4 text-sm font-black text-[#111820] transition hover:bg-[#e3c982] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Solicitar análise do projeto
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => exploreSolution('systems')}
                  className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-white/20 px-6 py-4 text-sm font-black text-white transition hover:border-[#d7b96e] hover:text-[#e3cb8d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b96e]"
                >
                  Conhecer as soluções
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <ul className="mt-9 grid max-w-2xl gap-3 border-t border-white/10 pt-6 sm:grid-cols-3" aria-label="Diferenciais do desenvolvimento">
                {[
                  'Escopo definido antes do desenvolvimento',
                  'Experiência adaptada para cada usuário',
                  'Base preparada para evolução',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-slate-400">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d7b96e]" strokeWidth={3} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <aside className="border border-white/12 bg-[#0d1926] p-5 sm:p-7 lg:p-8">
              <div className="border-b border-white/10 pb-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d7b96e]">O que desenvolvemos</p>
                <h2 className="mt-3 text-2xl font-black leading-tight">Soluções definidas pelo objetivo do negócio.</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Cada projeto combina somente os módulos, integrações e experiências necessários para o resultado esperado.
                </p>
              </div>

              <div className="grid sm:grid-cols-2">
                {solutions.map(({ id, icon: Icon, title }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => openExamples(id)}
                    className="group flex items-center gap-3 border-b border-white/8 py-4 text-left transition hover:bg-white/[0.025] hover:text-[#e3cb8d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b96e] sm:odd:pr-4 sm:even:border-l sm:even:pl-4"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/12 text-[#d7b96e] transition group-hover:border-[#d7b96e]/50">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-black">{title}</span>
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <p className="text-[9px] font-black uppercase tracking-[0.17em] text-slate-500">Como o projeto avança</p>
                <div className="mt-3 grid grid-cols-4 border border-white/10">
                  {deliveryStages.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setInsightSelection({ kind: 'stage', id: stage.id })}
                      className="border-r border-white/10 px-2 py-3 text-center transition last:border-r-0 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d7b96e]"
                    >
                      <span className="block text-[9px] font-black text-[#d7b96e]">{stage.number}</span>
                      <span className="mt-1 block text-[8px] font-bold text-slate-500 sm:text-[9px]">{stage.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="bg-[#0b1623] py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Comece pelo objetivo</p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.025em] sm:text-3xl">O que sua empresa precisa resolver agora?</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-slate-400">Escolha o resultado mais próximo da sua necessidade para receber uma recomendação inicial.</p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {goals.map(({ id, icon: Icon, title, text }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInsightSelection({ kind: 'goal', id })}
                  className="group flex items-start gap-4 rounded-xl border border-white/8 bg-white/[0.025] p-5 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-cyan-300/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-300"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0"><strong className="block text-sm text-white">{title}</strong><span className="mt-2 block text-xs leading-5 text-slate-400">{text}</span><span className="mt-3 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-cyan-300">Iniciar diagnóstico <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="solution-lab" className="scroll-mt-24 bg-[#edf3f6] py-16 text-[#0b1623] sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#08788e]">Laboratório de soluções</p>
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">Explore o tipo de produto digital mais adequado ao seu projeto.</h2>
              <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">Troque entre as categorias e toque nos módulos, resultados e demonstrações para aprofundar a análise.</p>
            </div>

            <div className="mt-10 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_24px_70px_rgba(15,35,50,0.12)] lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
              <nav className="border-b border-slate-200 bg-[#0b1623] p-3 text-white lg:border-b-0 lg:border-r lg:border-white/8 lg:p-4" aria-label="Categorias de soluções digitais">
                <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                  {solutions.map(({ id, icon: Icon, title, short }) => (
                    <button key={id} type="button" onClick={() => setActiveSolution(id)} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-left transition lg:w-full ${activeSolution === id ? 'bg-cyan-300 text-[#07101b]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span><strong className="block text-xs">{short}</strong><span className={`mt-0.5 hidden text-[9px] lg:block ${activeSolution === id ? 'text-[#07101b]/65' : 'text-slate-500'}`}>{title}</span></span>
                    </button>
                  ))}
                </div>
              </nav>

              <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="p-5 sm:p-8 lg:p-10">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0b1623] text-cyan-300"><SelectedIcon className="h-6 w-6" /></span>
                    <span className="rounded-full border border-cyan-700/20 bg-cyan-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#08788e]">{selectedSolution.short}</span>
                  </div>
                  <h3 className="mt-7 max-w-2xl text-3xl font-black leading-tight tracking-[-0.035em] sm:text-4xl">{selectedSolution.statement}</h3>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{selectedSolution.description}</p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {selectedSolution.modules.map((module, index) => (
                      <button
                        key={module}
                        type="button"
                        onClick={() => setInsightSelection({ kind: 'module', solution: activeSolution, module })}
                        className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-[#08788e] hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08788e]"
                      >
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0b1623] text-[9px] font-black text-cyan-300">0{index + 1}</span>
                        <span className="flex-1 text-xs font-bold text-slate-700">{module}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#08788e]" />
                      </button>
                    ))}
                  </div>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button type="button" onClick={() => openExamples(activeSolution)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1623] px-5 py-3.5 text-sm font-black text-white transition hover:bg-[#13263a]">
                      Abrir demonstrações
                      <MonitorSmartphone className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setBudgetOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-5 py-3.5 text-sm font-black text-[#0b1623] transition hover:border-[#0b1623]">
                      Conversar sobre este projeto
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <aside className="border-t border-slate-200 bg-[#f4f8fa] p-5 lg:border-l lg:border-t-0 lg:p-7">
                  <button
                    type="button"
                    onClick={() => setInsightSelection({ kind: 'outcome', solution: activeSolution })}
                    className="group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08788e]"
                  >
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#08788e]">Resultado esperado</p>
                    <p className="mt-3 text-lg font-black leading-7 text-[#0b1623]">{selectedSolution.outcome}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#08788e]">Comparar antes e depois <ChevronRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openExamples(activeSolution)}
                    className="mt-1 block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08788e]"
                    aria-label={`Abrir demonstrações de ${selectedSolution.title}`}
                  >
                    <SolutionMiniPreview category={activeSolution} />
                  </button>
                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <p className="text-xs leading-5 text-slate-500">Toque na prévia para abrir o laboratório visual da categoria selecionada.</p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#07101b] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Construção do projeto</p>
                <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">Do problema real à solução em uso.</h2>
                <p className="mt-5 text-sm leading-7 text-slate-400 sm:text-base">Selecione uma etapa para entender o trabalho da GSA, a participação do cliente e as entregas geradas.</p>
              </div>

              <div className="relative border-l border-cyan-300/20 pl-7 sm:pl-10">
                {deliveryStages.map(({ id, number, icon: Icon, title, text }, index) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setInsightSelection({ kind: 'stage', id })}
                    className="group relative block w-full pb-9 text-left last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <span className="absolute -left-[37px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/40 bg-[#07101b] transition group-hover:border-cyan-300 sm:-left-[49px]"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /></span>
                    <div className="grid gap-4 transition group-hover:translate-x-1 sm:grid-cols-[64px_48px_0.75fr_1fr] sm:items-start">
                      <span className="text-xs font-black tracking-[0.16em] text-cyan-300">{number}</span>
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-cyan-300"><Icon className="h-5 w-5" /></span>
                      <h3 className="text-xl font-black">{title}</h3>
                      <p className="text-sm leading-6 text-slate-400">{text}</p>
                    </div>
                    {index < deliveryStages.length - 1 && <div className="mt-8 border-b border-white/8" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white py-16 text-[#0b1623] sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#08788e]">Fundamentos da experiência</p>
                <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">Um produto profissional precisa ser agradável para usar e seguro para operar.</h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-slate-500">Selecione cada fundamento para ver como ele aparece na prática e qual benefício gera no dia a dia.</p>
            </div>

            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
              {engineering.map(({ id, icon: Icon, title, text }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInsightSelection({ kind: 'foundation', id })}
                  className="group bg-white p-6 text-left transition hover:bg-[#f4fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#08788e] sm:p-7"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-[#08788e] transition group-hover:bg-[#0b1623] group-hover:text-cyan-300"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-lg font-black">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#08788e]">Entender na prática <ChevronRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#dff7fb] px-4 py-14 text-[#07101b] sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#08788e]">Próximo passo</p>
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">Conte o que precisa funcionar melhor na sua empresa.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">A análise inicial organiza a necessidade, identifica o tipo de solução e define o caminho mais adequado para o projeto.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <button type="button" onClick={() => setBudgetOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#07101b] px-6 py-4 text-sm font-black text-white transition hover:bg-[#13263a]">Solicitar análise <ArrowRight className="h-4 w-4" /></button>
              <button type="button" onClick={openWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#07101b]/20 bg-white/60 px-6 py-4 text-sm font-black transition hover:border-[#07101b]"><MessageCircle className="h-4 w-4" /> Falar no WhatsApp</button>
            </div>
          </div>
        </section>

        <section className="border-t border-white/8 bg-[#07101b] px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">Sua empresa ainda precisa de nome, identidade visual e presença digital completa?</p>
            <button type="button" onClick={() => navigate('/identidade-e-web-design')} className="inline-flex items-center gap-2 text-sm font-black text-cyan-300 hover:text-cyan-200">Conhecer a jornada completa <ArrowRight className="h-4 w-4" /></button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 bg-[#050b12] py-9 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div><LogoGSA size="md" variant="light" /><p className="mt-3 text-sm text-slate-500">Produtos digitais planejados para funcionar e evoluir.</p></div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold text-slate-400">
            <button type="button" onClick={onBack} className="hover:text-cyan-300">Início</button>
            <button type="button" onClick={() => navigate('/identidade-e-web-design')} className="hover:text-cyan-300">Identidade e Web Design</button>
            <button type="button" onClick={() => navigate('/privacidade')} className="hover:text-cyan-300">Privacidade</button>
            <button type="button" onClick={openWhatsApp} className="hover:text-cyan-300">Contato</button>
          </div>
        </div>
      </footer>

      <SystemsInsightDialog
        selection={insightSelection}
        onClose={() => setInsightSelection(null)}
        onOpenExamples={openExamples}
        onRequestBudget={openBudget}
      />
      <SystemsExamplesDialog category={selectedExample} onClose={() => setSelectedExample(null)} onRequestBudget={() => setBudgetOpen(true)} />
      <SystemsBudgetModal isOpen={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </div>
  );
}

function SolutionMiniPreview({ category }: { category: SystemExampleCategory }) {
  const labels: Record<SystemExampleCategory, string[]> = {
    sites: ['Início', 'Serviços', 'Contato'],
    stores: ['Catálogo', 'Carrinho', 'Pedido'],
    systems: ['Painel', 'Processos', 'Relatórios'],
    portals: ['Acesso', 'Solicitações', 'Documentos'],
    automations: ['Entrada', 'Regra', 'Ação'],
    integrations: ['Origem', 'Conexão', 'Destino'],
  };

  return (
    <div className="mt-7 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm transition hover:border-[#08788e] hover:shadow-md">
      <div className="flex h-8 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /></div>
      <div className="grid min-h-[190px] grid-cols-[46px_1fr]">
        <div className="bg-[#0b1623] p-2"><span className="block h-7 rounded-md bg-cyan-300" />{[0, 1, 2].map((item) => <span key={item} className="mt-2 block h-6 rounded-md bg-white/6" />)}</div>
        <div className="p-3"><span className="block h-2.5 w-2/5 rounded bg-[#0b1623]" /><div className="mt-4 grid grid-cols-3 gap-2">{labels[category].map((label, index) => <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-2"><span className={`block h-5 w-5 rounded-md ${index === 0 ? 'bg-cyan-300' : 'bg-slate-200'}`} /><span className="mt-3 block h-1.5 w-full rounded bg-slate-200" /><span className="mt-1.5 block h-1 w-3/4 rounded bg-slate-100" /><span className="sr-only">{label}</span></div>)}</div><div className="mt-3 rounded-md border border-slate-200 p-2">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-2 border-b border-slate-100 py-1.5 last:border-0"><span className="h-2 w-2 rounded-full bg-cyan-300" /><span className="h-1.5 flex-1 rounded bg-slate-100" /></div>)}</div></div>
      </div>
    </div>
  );
}

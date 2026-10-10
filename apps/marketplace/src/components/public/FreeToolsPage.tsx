import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  BadgePercent,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarDays,
  Clock3,
  Coins,
  GraduationCap,
  HandCoins,
  Heart,
  HeartHandshake,
  Info,
  Landmark,
  Palmtree,
  Percent,
  Search,
  ShieldCheck,
  SunMedium,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  FreeToolsTieredCalculatorDialog,
  type FreeToolId,
} from './FreeToolsTieredCalculatorDialog';
import { readInfinitePayReturn } from '../../lib/freeToolsProAccess';
import { PublicHeader } from './final/PublicHeader';

import { motion } from 'framer-motion';

interface FreeToolsPageProps {
  onBack: () => void;
  onServices: () => void;
  onClientLogin: () => void;
}

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 48 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.18 },
  transition: { duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] as const },
});

interface ToolCard {
  id: FreeToolId;
  icon: ComponentType<{ className?: string }>;
  number: string;
  title: string;
  description: string;
  category: string;
  filterCategory: 'trabalhista' | 'previdenciario' | 'empresarial' | 'financeiro' | 'juridico';
  useCase: string;
  includes: string[];
  available: boolean;
  featured?: boolean;
}

const TOOLS: ToolCard[] = [
  { id: 'termination', icon: BriefcaseBusiness, number: '01', title: 'Rescisão trabalhista', description: 'Estimativa das principais verbas de encerramento de um vínculo CLT.', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para compreender a composição aproximada da rescisão antes da conferência oficial.', includes: ['Saldo de salário', 'Aviso-prévio', '13º e férias', 'Multa estimada do FGTS'], available: true, featured: true },
  { id: 'retirement', icon: Landmark, number: '02', title: 'Aposentadoria pelo INSS', description: 'Panorama inicial da regra geral e de duas regras de transição consideradas em 2026.', category: 'Previdenciário', filterCategory: 'previdenciario', useCase: 'Para comparar idade e contribuição com critérios previdenciários básicos.', includes: ['Regra geral', 'Regra dos pontos', 'Idade progressiva', 'Pendências por requisito'], available: true, featured: true },
  { id: 'vacation', icon: Palmtree, number: '03', title: 'Cálculo de férias', description: 'Estimativa bruta da remuneração de férias e do adicional constitucional de um terço.', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para visualizar o valor bruto antes dos descontos e das condições específicas do vínculo.', includes: ['Salário mensal', 'Médias variáveis', 'Adicional de 1/3', 'Total bruto estimado'], available: true, featured: true },
  { id: 'thirteenth', icon: HandCoins, number: '04', title: '13º salário', description: 'Simulação das parcelas e do valor proporcional aos meses trabalhados.', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para visualizar a formação aproximada do décimo terceiro salário.', includes: ['Meses trabalhados', 'Primeira parcela', 'Segunda parcela', 'Valor proporcional'], available: true },
  { id: 'overtime', icon: Clock3, number: '05', title: 'Horas extras & Noturno', description: 'Cálculo de horas suplementares (50%/100%), hora noturna reduzida e reflexos no DSR.', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para conferir a remuneração de horas excedentes e adicionais da jornada.', includes: ['Horas 50% e 100%', 'Adicional noturno', 'Hora noturna reduzida', 'Reflexo no DSR'], available: true },
  { id: 'net_salary', icon: Calculator, number: '06', title: 'Salário líquido (CLT x PJ)', description: 'Demonstrativo dos descontos de INSS/IRRF 2026 e comparativo de faturamento PJ equivalente.', category: 'Trabalhista & Fiscal', filterCategory: 'trabalhista', useCase: 'Para comparar a remuneração líquida recebida no bolso com contratação PJ.', includes: ['Tabela INSS 2026', 'Tabela IRRF', 'Salário líquido real', 'Equivalência CLT x PJ'], available: true },
  { id: 'mei_limit', icon: Building2, number: '07', title: 'Limite e excesso do MEI', description: 'Projeção do limite proporcional de faturamento anual do MEI e cálculo de extrapolação.', category: 'Empresarial & MEI', filterCategory: 'empresarial', useCase: 'Para acompanhar a margem de faturamento do MEI e evitar desenquadramento.', includes: ['Limite proporcional', 'Saldo disponível', 'Projeção de vendas', 'Cálculo de excesso'], available: true },
  { id: 'unemployment', icon: HandCoins, number: '08', title: 'Seguro-desemprego', description: 'Simulação da quantidade de parcelas (3 a 5) e cálculo do valor MTE 2026.', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para verificar a elegibilidade e o valor das parcelas do benefício.', includes: ['Triagem de requisitos', 'Número de parcelas', 'Média dos salários', 'Teto oficial MTE'], available: true },
  { id: 'fator_r', icon: BadgePercent, number: '09', title: 'Fator R do Simples Nacional', description: 'Cálculo do enquadramento nos Anexos III ou V com base na razão folha/faturamento.', category: 'Tributário & Empresa', filterCategory: 'empresarial', useCase: 'Para otimizar impostos reduzindo a alíquota de 15,5% para 6%.', includes: ['Razão Folha/Receita', 'Anexo III vs Anexo V', 'Ajuste de pró-labore', 'Economia tributária'], available: true },
  { id: 'amortization', icon: TrendingUp, number: '10', title: 'Amortização de parcelas', description: 'Simulação de economia em juros e redução de prazo ao amortizar parcelas SAC ou PRICE.', category: 'Financeiro', filterCategory: 'financeiro', useCase: 'Para planejar amortizações antecipadas em financiamentos de imóveis ou veículos.', includes: ['Tabela SAC e PRICE', 'Novo saldo devedor', 'Redução de prazo', 'Economia em juros'], available: true },
  { id: 'internship_termination', icon: GraduationCap, number: '11', title: 'Rescisão de estágio (Lei 11.788)', description: 'Cálculo do recesso remunerado proporcional + 1/3 (Sem aviso prévio ou FGTS).', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para apurar os valores devidos no encerramento de contrato de estágio.', includes: ['Lei do Estágio 11.788', 'Recesso proporcional', 'Adicional de 1/3', 'Isenção de FGTS/Aviso'], available: true },
  { id: 'prolabore_vs_lucros', icon: Coins, number: '12', title: 'Pró-labore vs Lucros', description: 'Comparativo de economia tributária entre Pró-Labore (INSS/IRRF) e Lucros Isentos.', category: 'Tributário & Empresa', filterCategory: 'empresarial', useCase: 'Para sócios de empresas reduzirem retenções de INSS e IRRF no pro-labore.', includes: ['Teto de INSS 11%', 'Isenção de lucros', 'Matriz de economia', 'Estratégia fiscal'], available: true },
  { id: 'employee_cost', icon: Users, number: '13', title: 'Custo do funcionário', description: 'Cálculo do custo total para a empresa contratar (Salário + Provisões + Encargos).', category: 'Empresarial & RH', filterCategory: 'empresarial', useCase: 'Para planejar contratações e entender o impacto financeiro da folha.', includes: ['INSS Patronal', 'FGTS 8%', 'Provisão 13º e férias', 'Custo total real'], available: true },
  { id: 'night_shift_rural_urban', icon: SunMedium, number: '14', title: 'Adicional noturno urbano vs rural', description: 'Comparativo entre horário noturno urbano (20% + 52m30s) e rural (25%).', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para apurar adicionais noturnos em atividades urbanas, pecuária ou lavoura.', includes: ['Urbano (22h-5h)', 'Pecuária (20h-4h)', 'Lavoura (21h-5h)', 'Hora reduzida'], available: true },
  { id: 'proportional_salary', icon: CalendarDays, number: '15', title: 'Salário proporcional', description: 'Cálculo por dias trabalhados na admissão, demissão ou mês incompleto.', category: 'Trabalhista', filterCategory: 'trabalhista', useCase: 'Para apurar o salário líquido exato proporcional aos dias de trabalho.', includes: ['Regra base 30 dias', 'Regra dias reais', 'Proporção exata', 'Valor por dia'], available: true },
  { id: 'late_fee_calculator', icon: Percent, number: '16', title: 'Juros e multa por atraso', description: 'Cálculo de multa moratória, juros de mora e atualização SELIC de débitos.', category: 'Financeiro & Fiscal', filterCategory: 'financeiro', useCase: 'Para atualizar boletos, impostos ou contas em atraso.', includes: ['Multa moratória', 'Juros de mora 1% a.m.', 'Atualização SELIC', 'Total atualizado'], available: true },
  { id: 'child_support', icon: Heart, number: '17', title: 'Simulador de pensão alimentícia', description: 'Cálculo da pensão percentual sobre o salário líquido (após INSS e IRRF).', category: 'Familiar & Jurídico', filterCategory: 'juridico', useCase: 'Para estimar o valor da pensão alimentícia judicial ou consensual.', includes: ['Dedução INSS/IRRF', 'Base líquida real', 'Porcentagem aplicada', 'Despesas extra'], available: true },
  { id: 'benefits', icon: Baby, number: '18', title: 'Benefícios do INSS', description: 'Orientação inicial sobre incapacidade, salário-maternidade, pensão e outros benefícios.', category: 'Previdenciário', filterCategory: 'previdenciario', useCase: 'Para identificar as informações necessárias antes de uma análise completa.', includes: ['Tipo de benefício', 'Qualidade de segurado', 'Carência', 'Documentação inicial'], available: true },
  { id: 'bpc', icon: HeartHandshake, number: '19', title: 'BPC / LOAS', description: 'Triagem educativa dos critérios básicos do benefício assistencial.', category: 'Assistencial', filterCategory: 'juridico', useCase: 'Para compreender os pontos normalmente avaliados em um pedido.', includes: ['Renda familiar', 'Grupo familiar', 'Impedimento de longo prazo', 'Cadastro social'], available: true },
];

const AVAILABLE_TOOLS = TOOLS.filter((tool) => tool.available);

type FilterCategoryKey = 'all' | 'trabalhista' | 'previdenciario' | 'empresarial' | 'financeiro' | 'juridico';

const FILTER_TABS: Array<{ id: FilterCategoryKey; label: string }> = [
  { id: 'all', label: 'Todas as ferramentas' },
  { id: 'trabalhista', label: 'Trabalhista & CLT' },
  { id: 'previdenciario', label: 'Previdenciário & INSS' },
  { id: 'empresarial', label: 'Empresas & MEI' },
  { id: 'financeiro', label: 'Financeiro & Fiscal' },
  { id: 'juridico', label: 'Família & Social' },
];

export function FreeToolsPage({ onBack, onServices, onClientLogin }: FreeToolsPageProps) {
  const [activeTool, setActiveTool] = useState<FreeToolId | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FilterCategoryKey>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const paymentReturn = readInfinitePayReturn();
    if (paymentReturn) setActiveTool(paymentReturn.tool);
  }, []);

  const filteredTools = useMemo(() => {
    return AVAILABLE_TOOLS.filter((tool) => {
      const matchesCategory =
        selectedCategory === 'all' || tool.filterCategory === selectedCategory;

      if (!matchesCategory) return false;

      if (!searchTerm.trim()) return true;

      const term = searchTerm.toLowerCase().trim();
      return (
        tool.title.toLowerCase().includes(term) ||
        tool.description.toLowerCase().includes(term) ||
        tool.category.toLowerCase().includes(term) ||
        tool.useCase.toLowerCase().includes(term) ||
        tool.includes.some((inc) => inc.toLowerCase().includes(term))
      );
    });
  }, [selectedCategory, searchTerm]);

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#17202a] selection:bg-[#c9a756]/30">
      <PublicHeader currentPage="free-tools" onClientLogin={onClientLogin} />
      <main className="overflow-x-clip pt-16">
        {/* HERO SECTION */}
        <section className="border-b border-[#d8d0c2] bg-[#f3ecdf]">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#cfc5b5] bg-white px-3 py-1.5 text-xs font-bold text-[#4f5c66] transition hover:border-[#9f8140] hover:text-[#17202a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9f8140]"
            >
              <ArrowLeft className="h-4 w-4 text-[#8a6e2f]" /> Voltar ao início
            </button>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#806128]">Serviços gratuitos</p>
                <h1 className="mt-1 text-2xl font-black tracking-[-0.035em] text-[#111820] sm:text-3xl">O que você precisa calcular?</h1>
                <p className="mt-1 max-w-2xl text-sm text-[#54606b]">Escolha uma ferramenta, preencha os dados e veja uma estimativa gratuita. Pagamento e voucher Pro também podem ser usados sem cadastro.</p>
              </div>
              <p className="text-xs text-[#68727a]">Sem cadastro · Resultado imediato</p>
            </div>
          </div>
        </section>

        {/* TOOLBAR & CARDS SECTION */}
        <section className="py-7 sm:py-10" aria-labelledby="free-tools-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {/* SECTION HEADER */}
            <div className="border-b border-[#d8d0c2] pb-5">
              <div className="max-w-3xl">
                <h2 id="free-tools-title" className="text-xl font-black tracking-[-0.035em] text-[#111820] sm:text-2xl">
                  Todas as ferramentas
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#5c6771]">
                  Use os filtros ou pesquise pelo nome. O modo gratuito abre direto; o Pro é opcional.
                </p>
              </div>
            </div>

            {/* INTERACTIVE CONTROLS (SEARCH & CATEGORY TABS) */}
            <div className="mt-8 space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                {/* CATEGORY FILTER TABS */}
                <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 text-xs">
                  {FILTER_TABS.map((tab) => {
                    const isActive = selectedCategory === tab.id;
                    const count = tab.id === 'all'
                      ? AVAILABLE_TOOLS.length
                      : AVAILABLE_TOOLS.filter((t) => t.filterCategory === tab.id).length;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedCategory(tab.id)}
                        className={`group inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9f8140] ${
                          isActive
                            ? 'bg-[#172534] text-white shadow-sm border border-[#172534]'
                            : 'bg-white/80 text-[#54606b] border border-[#ded5c5] hover:bg-white hover:text-[#111820] hover:border-[#b89b4f]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black transition-colors ${
                            isActive
                              ? 'bg-[#e2c781] text-[#142230]'
                              : 'bg-[#ebe3d3] text-[#6b7680] group-hover:bg-[#dfd3bd]'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* SEARCH INPUT */}
                <div className="relative min-w-[260px] md:max-w-xs">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c96a0]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar calculadora ou tema..."
                    className="h-11 w-full rounded-xl border border-[#ded5c5] bg-white/90 pl-10 pr-9 text-xs font-medium text-[#111820] placeholder-[#8c96a0] shadow-2xs transition-all focus:border-[#9f8140] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#9f8140]/25"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#8c96a0] hover:bg-[#eae2d2] hover:text-[#111820]"
                      aria-label="Limpar busca"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* SEARCH STATS INFO */}
              {(searchTerm || selectedCategory !== 'all') && (
                <div className="flex items-center justify-between text-xs text-[#697580] pt-1">
                  <span>
                    Exibindo <strong>{filteredTools.length}</strong> de <strong>{AVAILABLE_TOOLS.length}</strong> ferramentas
                    {searchTerm && ` para "${searchTerm}"`}
                  </span>
                  {(searchTerm || selectedCategory !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setSearchTerm('');
                      }}
                      className="font-bold text-[#8a6e2f] hover:underline"
                    >
                      Redefinir filtros
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* TOOL CARDS GRID */}
            {filteredTools.length > 0 ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTools.map(({ id, icon: Icon, number, title, description, category }, index) => (
                  <motion.button
                    key={id}
                    {...reveal(index * 0.15)}
                    type="button"
                    onClick={() => setActiveTool(id as FreeToolId)}
                    className="group relative flex min-h-[230px] flex-col overflow-hidden rounded-2xl border border-[#dfd7c9] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#c5a350] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9f8140] focus-visible:ring-offset-2 focus-visible:ring-offset-[#eee9df]"
                  >
                    <div className="pointer-events-none absolute bottom-0 right-0 h-16 w-16 border-l border-t border-[#856526]/10 opacity-0 transition-all duration-500 ease-out group-hover:h-full group-hover:w-full group-hover:border-transparent group-hover:bg-[#856526]/[0.02] group-hover:opacity-100" />
                    
                    {/* Top ambient gold accent strip */}
                    <span className="absolute inset-x-0 top-0 h-0.5 bg-[#c5a350]" />

                    {/* TOP HEADER: ICON + INDEX + BADGE */}
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5efdf] text-[#806128]">
                        <Icon className="h-5 w-5" />
                      </span>

                      <div className="flex flex-col items-end gap-1.5">
                        <span className="rounded-full bg-[#f7efde] px-2 py-0.5 font-mono text-[10px] font-bold text-[#8c6d26]">
                          {number}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                          Free + Pro
                        </span>
                      </div>
                    </div>

                    {/* CATEGORY & TITLE */}
                    <div className="mt-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#856526]">
                        {category}
                      </p>
                      <h3 className="mt-1.5 text-lg font-bold leading-tight tracking-[-0.02em] text-[#111827] group-hover:text-[#886925]">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#56626d]">
                        {description}
                      </p>
                    </div>

                    {/* CARD FOOTER & ACTION */}
                    <div className="mt-auto flex items-center justify-between border-t border-[#eae3d7] pt-3">
                      <span className="text-xs font-medium text-[#717c85]">Free simples · Pro avançado</span>
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#172534] px-3 py-2 text-xs font-bold text-white transition group-hover:bg-[#8a6e2f]">
                        Usar ferramenta
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              /* EMPTY STATE */
              <div className="mt-12 rounded-3xl border border-[#d8d0c2] bg-white/80 p-12 text-center shadow-xs">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d8c28d] bg-[#f7efda] text-[#8a6e2f]">
                  <Search className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-xl font-black text-[#111820]">Nenhuma ferramenta encontrada</h3>
                <p className="mt-2 text-sm text-[#5c6771]">
                  Não encontramos ferramentas para o termo &ldquo;{searchTerm}&rdquo; na categoria selecionada.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchTerm('');
                  }}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#172534] px-5 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-[#253648]"
                >
                  Ver todas as ferramentas
                </button>
              </div>
            )}
          </div>
        </section>

        {/* HIGHLIGHT SIX TOOLS INFO */}
        <section className="border-y border-[#d7d1c6] bg-[#f8f5ef] py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 rounded-3xl border border-[#d4cdc2] bg-white p-6 shadow-[0_14px_36px_rgba(24,32,40,0.06)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#806128]">Área ampliada</p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[#111820] sm:text-3xl">
                  As seis ferramentas já estão disponíveis.
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#667078]">
                  13º salário, Benefícios do INSS e BPC / LOAS agora possuem consulta Free e análise Pro, juntamente com Rescisão, Aposentadoria e Férias.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.1em] text-[#6d5727]">
                {['13º', 'INSS', 'BPC'].map((label) => (
                  <span key={label} className="rounded-xl border border-[#d6c79e] bg-[#f7f0dc] px-4 py-3 font-black shadow-2xs">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* COMMITMENT & PRIVACY */}
        <section className="border-b border-white/10 bg-[#111d29] py-14 text-white sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-14">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d8bd73]">Compromisso da plataforma</p>
                <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">
                  Clareza antes de qualquer conclusão.
                </h2>
                <p className="mt-4 text-sm leading-7 text-white/55">
                  A área foi estruturada para informar sem esconder limites, condições ou situações que exigem análise individual.
                </p>
              </div>
              <div className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-3">
                {[
                  {
                    icon: ShieldCheck,
                    title: 'Privacidade preservada',
                    text: 'Os valores digitados permanecem no dispositivo e não são armazenados pela GSA.',
                  },
                  {
                    icon: Calculator,
                    title: 'Cálculo explicado',
                    text: 'O resultado apresenta a composição utilizada, não apenas um número isolado.',
                  },
                  {
                    icon: Info,
                    title: 'Limites visíveis',
                    text: 'Cada ferramenta informa o que não foi considerado e quando buscar confirmação.',
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <article key={title} className="bg-[#172433] p-6">
                    <Icon className="h-6 w-6 text-[#d8bd73]" />
                    <h3 className="mt-5 font-black">{title}</h3>
                    <p className="mt-3 text-xs leading-5 text-white/55">{text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA SERVICES */}
        <section className="py-14 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid overflow-hidden rounded-3xl border border-[#cbbd9f] bg-[#d8c28d] shadow-lg lg:grid-cols-[1fr_340px]">
              <div className="p-7 sm:p-10 lg:p-12">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#624d20]">Quando a simulação não basta</p>
                <h2 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-[-0.03em] text-[#17202a] sm:text-4xl">
                  Documentos, períodos especiais e regras específicas merecem uma análise completa.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5c4d31]">
                  Conheça os serviços da GSA quando a situação exigir conferência individual, organização documental ou acompanhamento.
                </p>
              </div>
              <div className="flex flex-col justify-center border-t border-[#b69e69] bg-[#c8ad70] p-7 lg:border-l lg:border-t-0">
                <button
                  type="button"
                  onClick={onServices}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#172433] px-5 py-3 text-sm font-black text-white shadow-md transition-all hover:bg-[#223449] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Conhecer os serviços GSA <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-4 text-center text-[11px] leading-5 text-[#584721]">
                  Atendimento por WhatsApp, e-mail ou Portal do Cliente.
                </p>
              </div>
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-[#69727a]">
              As ferramentas fornecem estimativas educativas e não comprovam direitos, não substituem o cálculo oficial dos órgãos competentes nem a orientação de profissional habilitado.
            </p>
          </div>
        </section>

        <FreeToolsTieredCalculatorDialog
          tool={activeTool}
          onClose={() => setActiveTool(null)}
          onToolChange={setActiveTool}
          onServices={() => {
            setActiveTool(null);
            onServices();
          }}
          onClientLogin={onClientLogin}
        />
      </main>
    </div>
  );
}


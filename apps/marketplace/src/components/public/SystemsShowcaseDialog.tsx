import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  ExternalLink,
  Globe2,
  Laptop,
  Layers3,
  Link2,
  Lock,
  MonitorSmartphone,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TrendingUp,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';

export type SystemExampleCategory =
  | 'sites'
  | 'stores'
  | 'systems'
  | 'portals'
  | 'automations'
  | 'integrations';

type DeviceMode = 'desktop' | 'mobile';

interface ShowcaseModel {
  title: string;
  context: string;
  indication: string;
  description: string;
  includes: string[];
  result: string;
}

interface ShowcaseCategory {
  title: string;
  introduction: string;
  icon: LucideIcon;
  models: ShowcaseModel[];
}

const showcase: Record<SystemExampleCategory, ShowcaseCategory> = {
  sites: {
    title: 'Exemplos de sites institucionais',
    introduction: 'Referências para empresas que precisam apresentar serviços com clareza, credibilidade e uma chamada comercial bem definida.',
    icon: Globe2,
    models: [
      { title: 'Site corporativo', context: 'Consultorias e empresas de serviços', indication: 'Para negócios que precisam explicar uma atuação mais completa sem confundir o visitante.', description: 'Uma estrutura sóbria, organizada por prioridades: posicionamento, serviços, diferenciais, experiência e contato.', includes: ['Página inicial estratégica', 'Serviços organizados', 'Provas de confiança', 'Formulário e WhatsApp'], result: 'Uma presença institucional clara, confiável e preparada para gerar conversas comerciais.' },
      { title: 'Site para profissional ou escritório', context: 'Especialistas e prestadores', indication: 'Para quem vende conhecimento, atendimento ou serviços especializados.', description: 'A página apresenta especialidades, forma de trabalho, experiência e caminhos de contratação sem excesso de informação.', includes: ['Apresentação profissional', 'Áreas de atuação', 'Etapas do atendimento', 'Perguntas frequentes'], result: 'Mais autoridade e menos dúvidas antes do primeiro contato.' },
      { title: 'Página comercial', context: 'Campanhas e ofertas específicas', indication: 'Para concentrar a atenção do público em uma solução, condição ou lançamento.', description: 'Uma página direta, com problema, benefício, prova e chamada para ação em uma sequência comercial simples.', includes: ['Oferta em destaque', 'Benefícios principais', 'Provas e depoimentos', 'Chamada para ação'], result: 'Uma jornada curta entre o interesse e a solicitação de atendimento.' },
    ],
  },
  stores: {
    title: 'Exemplos de operação comercial digital',
    introduction: 'Estruturas para apresentar produtos, receber pedidos e organizar a experiência de compra.',
    icon: ShoppingBag,
    models: [
      { title: 'Loja virtual completa', context: 'Varejo e marcas próprias', indication: 'Para negócios que precisam vender produtos diretamente pela internet.', description: 'Catálogo, filtros, página de produto, carrinho, pagamento e acompanhamento de pedidos em uma única experiência.', includes: ['Categorias e busca', 'Página de produto', 'Carrinho e pagamento', 'Área do cliente'], result: 'Compra mais simples para o cliente e operação centralizada para a empresa.' },
      { title: 'Catálogo para orçamento', context: 'Atacado e venda consultiva', indication: 'Para produtos que exigem negociação, quantidade mínima ou atendimento comercial.', description: 'O cliente explora linhas e produtos, monta uma seleção e envia uma solicitação organizada para a equipe.', includes: ['Catálogo por linha', 'Lista de interesse', 'Pedido de cotação', 'Integração com atendimento'], result: 'Oportunidades comerciais chegam com mais contexto e menos troca de mensagens.' },
      { title: 'Planos e assinaturas', context: 'Serviços recorrentes', indication: 'Para empresas que comercializam planos, clubes, mensalidades ou serviços contínuos.', description: 'A experiência compara opções, explica benefícios e conduz para contratação e acompanhamento.', includes: ['Comparação de planos', 'Contratação recorrente', 'Cobrança integrada', 'Área do assinante'], result: 'Contratação mais compreensível e relacionamento recorrente organizado.' },
    ],
  },
  systems: {
    title: 'Exemplos de sistemas personalizados',
    introduction: 'Ambientes criados para centralizar processos, informações, responsabilidades e decisões.',
    icon: MonitorSmartphone,
    models: [
      { title: 'Gestão operacional', context: 'Equipes e processos internos', indication: 'Para empresas que controlam atividades em planilhas, mensagens e ferramentas separadas.', description: 'Um ambiente único para acompanhar solicitações, responsáveis, prazos, documentos e andamento.', includes: ['Painel de indicadores', 'Fluxos por status', 'Responsáveis e prazos', 'Histórico de ações'], result: 'Mais visão da operação e menos retrabalho entre equipes.' },
      { title: 'Financeiro e contratos', context: 'Administração e controle', indication: 'Para negócios que precisam acompanhar cobranças, compromissos, contratos e vencimentos.', description: 'Receitas, despesas, contratos, alertas e relatórios organizados conforme a rotina da empresa.', includes: ['Lançamentos financeiros', 'Cobranças e vencimentos', 'Contratos e documentos', 'Relatórios gerenciais'], result: 'Informações financeiras centralizadas para decisões mais seguras.' },
      { title: 'Atendimento e solicitações', context: 'Clientes e equipes', indication: 'Para operações que recebem demandas por vários canais e perdem histórico ou prioridade.', description: 'Cada solicitação entra, recebe responsável, prioridade e acompanhamento até a conclusão.', includes: ['Fila de atendimento', 'Prioridades e responsáveis', 'Notificações', 'Histórico completo'], result: 'Atendimentos rastreáveis, organizados e fáceis de acompanhar.' },
    ],
  },
  portals: {
    title: 'Exemplos de portais e aplicativos',
    introduction: 'Áreas seguras para clientes, parceiros e equipes acessarem serviços e informações.',
    icon: Smartphone,
    models: [
      { title: 'Portal do cliente', context: 'Relacionamento e serviços', indication: 'Para empresas que precisam dar autonomia ao cliente sem perder controle do atendimento.', description: 'O usuário acompanha solicitações, documentos, pagamentos e mensagens em uma área própria.', includes: ['Login e perfil', 'Solicitações', 'Documentos e pagamentos', 'Mensagens e avisos'], result: 'Mais autonomia para o cliente e menos demandas repetitivas para a equipe.' },
      { title: 'Portal de parceiros', context: 'Rede de prestadores', indication: 'Para operações que distribuem demandas e precisam acompanhar execução externa.', description: 'Parceiros recebem atividades, atualizam etapas, enviam comprovantes e consultam histórico.', includes: ['Distribuição de demandas', 'Atualização de status', 'Envio de documentos', 'Histórico por parceiro'], result: 'Execução externa conectada à operação principal da empresa.' },
      { title: 'Aplicativo de atendimento', context: 'Uso recorrente no celular', indication: 'Para serviços que precisam estar disponíveis de forma rápida e frequente.', description: 'Atalhos, avisos e ações principais organizados para uma experiência mobile simples.', includes: ['Navegação mobile', 'Notificações', 'Atalhos de serviço', 'Contato rápido'], result: 'Ações importantes disponíveis no celular com poucos passos.' },
    ],
  },
  automations: {
    title: 'Exemplos de automações empresariais',
    introduction: 'Fluxos para executar tarefas repetitivas, aplicar regras e avisar as pessoas certas.',
    icon: Workflow,
    models: [
      { title: 'Distribuição de oportunidades', context: 'Comercial e atendimento', indication: 'Para equipes que recebem contatos por vários canais e demoram para direcioná-los.', description: 'A automação recebe os dados, identifica o perfil e encaminha a oportunidade ao responsável.', includes: ['Captura de contatos', 'Regras de classificação', 'Distribuição automática', 'Avisos para a equipe'], result: 'Resposta mais rápida e nenhuma oportunidade sem responsável.' },
      { title: 'Cobranças e vencimentos', context: 'Financeiro', indication: 'Para rotinas que dependem de acompanhamento manual de datas e pendências.', description: 'O fluxo identifica vencimentos, dispara lembretes e registra cada tentativa de acompanhamento.', includes: ['Monitoramento de datas', 'Lembretes automáticos', 'Tarefas de cobrança', 'Registro de contatos'], result: 'Menos esquecimentos e uma rotina financeira mais consistente.' },
      { title: 'Aprovação de documentos', context: 'Administrativo e contratos', indication: 'Para processos com envio, revisão, correção e aprovação de arquivos.', description: 'Cada documento percorre etapas definidas, com responsável, aviso e histórico de versões.', includes: ['Etapas de aprovação', 'Responsáveis', 'Notificações', 'Controle de versões'], result: 'Clareza sobre etapa, responsável e versão correta do documento.' },
    ],
  },
  integrations: {
    title: 'Exemplos de integrações entre sistemas',
    introduction: 'Conexões para evitar digitação repetida e manter informações atualizadas entre plataformas.',
    icon: Link2,
    models: [
      { title: 'Pagamentos e operação', context: 'Cobranças e conciliação', indication: 'Para empresas que precisam atualizar pedidos e serviços após a confirmação de pagamento.', description: 'O pagamento confirmado atualiza automaticamente o status financeiro e operacional.', includes: ['Gateway de pagamento', 'Confirmação automática', 'Atualização de status', 'Registro de eventos'], result: 'Menos conferência manual e operação atualizada em tempo real.' },
      { title: 'CRM e atendimento', context: 'Comercial e relacionamento', indication: 'Para equipes que precisam manter o contexto do cliente entre formulário, WhatsApp e CRM.', description: 'Os dados entram uma vez e seguem disponíveis durante toda a conversa comercial.', includes: ['Captura de contatos', 'Sincronização de cadastro', 'Histórico centralizado', 'Distribuição comercial'], result: 'Atendimento mais contínuo e menos perda de contexto.' },
      { title: 'Marketplace e gestão', context: 'Pedidos, produtos e estoque', indication: 'Para empresas que vendem em mais de um canal e precisam manter informações alinhadas.', description: 'Pedidos e produtos circulam entre marketplace e sistema interno de forma controlada.', includes: ['Sincronização de pedidos', 'Atualização de produtos', 'Eventos de estoque', 'Tratamento de falhas'], result: 'Menos divergência entre canais e operação interna.' },
    ],
  },
};

interface SystemsExamplesDialogProps {
  category: SystemExampleCategory | null;
  onClose: () => void;
  onRequestBudget: () => void;
}

export function SystemsExamplesDialog({ category, onClose, onRequestBudget }: SystemsExamplesDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const data = category ? showcase[category] : null;
  const model = data?.models[selectedIndex] || null;
  const Icon = data?.icon;

  useEffect(() => {
    setSelectedIndex(0);
    setDevice('desktop');
  }, [category]);

  const changeModel = (next: number) => {
    if (!data) return;
    setSelectedIndex((next + data.models.length) % data.models.length);
  };

  return (
    <AccessibleDialog
      isOpen={Boolean(category)}
      onClose={onClose}
      ariaLabel={data ? data.title : 'Exemplos de soluções digitais'}
      overlayClassName="items-center justify-center overflow-y-auto bg-black/75 p-2 sm:p-5 backdrop-blur-md"
      panelClassName="max-h-[94dvh] w-[96vw] max-w-6xl overflow-hidden rounded-2xl sm:rounded-3xl border border-[#d8bd73]/30 bg-[#f7f5ef] shadow-[0_28px_90px_rgba(10,18,28,0.4)]"
    >
      {category && data && model && Icon && (
        <div className="flex max-h-[94dvh] min-h-0 flex-col text-[#17202a]">
          {/* TOPO DOURADO COM GRADIENTE */}
          <span className="h-1.5 shrink-0 bg-gradient-to-r from-[#8a6b2f] via-[#d8bd73] to-[#8a6b2f]" />

          {/* CABEÇALHO DO MODAL */}
          <header className="shrink-0 border-b border-[#e4dccf] bg-white px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl border border-[#d8bd73]/40 bg-[#142332] text-[#d8bd73] shadow-xs">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-[#806128]">
                    Referências de solução · GSA Sistemas
                  </p>
                  <h2 className="mt-0.5 text-base sm:text-2xl font-black leading-tight text-[#111820] truncate">
                    {data.title}
                  </h2>
                  <p className="hidden sm:block mt-1 max-w-3xl text-xs sm:text-sm leading-relaxed text-[#626d77] line-clamp-1">
                    {data.introduction}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                data-dialog-autofocus
                aria-label="Fechar"
                className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-[#dcd4c7] bg-white text-[#626d77] shadow-2xs transition-all hover:border-[#806128] hover:bg-[#faf8f3] hover:text-[#111820] active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* CORPO DO MODAL */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid lg:grid-cols-[270px_minmax(0,1fr)]">
              {/* SIDEBAR DE REFERÊNCIAS */}
              <aside className="border-b border-[#ded5c6] bg-[#efebe2] p-3.5 sm:p-5 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-[#806128]">
                    <Layers3 className="h-3.5 w-3.5 text-[#8a6b2f]" />
                    Modelos disponíveis
                  </p>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-mono font-bold text-[#6d5727]">
                    {data.models.length} opções
                  </span>
                </div>

                {/* ABAS: HORIZONTAL NO MOBILE, VERTICAL NO DESKTOP */}
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none lg:flex-col lg:overflow-visible" role="tablist">
                  {data.models.map((item, index) => {
                    const isSelected = selectedIndex === index;
                    return (
                      <button
                        key={item.title}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => setSelectedIndex(index)}
                        className={`group relative min-w-[190px] rounded-xl p-3 sm:p-3.5 text-left transition-all active:scale-98 lg:min-w-0 ${
                          isSelected
                            ? 'border-2 border-[#806128] bg-white text-[#111820] shadow-sm'
                            : 'border border-[#ded6c8] bg-white/60 text-[#59636d] hover:border-[#806128]/50 hover:bg-white'
                        }`}
                      >
                        {isSelected && (
                          <span className="hidden lg:block absolute inset-y-2 left-1 w-1 rounded-full bg-[#806128]" />
                        )}
                        <div className="flex items-center justify-between gap-1">
                          <span className={`font-mono text-[10px] font-black ${isSelected ? 'text-[#806128]' : 'text-[#8a949f]'}`}>
                            0{index + 1}
                          </span>
                          {isSelected && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          )}
                        </div>
                        <strong className="mt-1 block text-xs sm:text-sm font-black leading-tight text-[#111820] line-clamp-1">
                          {item.title}
                        </strong>
                        <span className="mt-0.5 block text-[10px] leading-snug text-[#626d77] line-clamp-1">
                          {item.context}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* CONTEÚDO PRINCIPAL DA REFERÊNCIA */}
              <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <section className="border-b border-[#e4dccf] pb-6 sm:pb-8">
                  <span className="inline-block rounded-md border border-[#e6ddc9] bg-[#faf6ec] px-2.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.16em] text-[#806128]">
                    {model.context}
                  </span>

                  <h3 className="mt-2 text-xl sm:text-3xl lg:text-4xl font-black leading-tight tracking-tight text-[#111820]">
                    {model.title}
                  </h3>

                  <p className="mt-2.5 max-w-3xl text-xs sm:text-sm lg:text-base leading-relaxed text-[#505d6b]">
                    {model.description}
                  </p>

                  {/* CARDS DE PERFIL INDICADO E IMPACTO */}
                  <div className="mt-5 grid gap-3 sm:gap-4 md:grid-cols-2">
                    <div className="rounded-xl sm:rounded-2xl border border-[#e4dcce] bg-white p-3.5 sm:p-4 shadow-2xs">
                      <p className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.16em] text-[#806128]">
                        <Compass className="h-3.5 w-3.5 text-[#8a6b2f]" />
                        Perfil Indicado
                      </p>
                      <p className="mt-2 text-xs sm:text-sm font-semibold leading-relaxed text-[#2a3642]">
                        {model.indication}
                      </p>
                    </div>

                    <div className="rounded-xl sm:rounded-2xl border border-[#d8bd73]/40 bg-[#faf6ec] p-3.5 sm:p-4 shadow-2xs">
                      <p className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.16em] text-[#806128]">
                        <Sparkles className="h-3.5 w-3.5 text-[#d8bd73]" />
                        Resultado Comercial Esperado
                      </p>
                      <p className="mt-2 text-xs sm:text-sm font-bold leading-relaxed text-[#111820]">
                        {model.result}
                      </p>
                    </div>
                  </div>

                  {/* O QUE O MODELO PODE INCLUIR */}
                  <div className="mt-6">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-[#806128]">
                      O que esse modelo costuma incluir
                    </p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {model.includes.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2.5 rounded-xl border border-[#e4dcce] bg-white px-3 py-2.5 text-xs sm:text-sm font-bold text-[#2a3642] shadow-2xs"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#142332] text-[#d8bd73]">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                {/* AMOSTRA DE INTERFACE INTERATIVA */}
                <section className="pt-6 sm:pt-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#806128]" />
                        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-[#806128]">
                          Amostra visual interativa
                        </p>
                      </div>
                      <p className="mt-1 text-xs sm:text-sm text-[#626d77]">
                        Veja como a estrutura se comporta em diferentes formatos de tela.
                      </p>
                    </div>

                    {/* SELETOR DE DISPOSITIVO */}
                    <div className="inline-flex rounded-xl border border-[#cfc5b5] bg-white p-1 shadow-2xs self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setDevice('desktop')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                          device === 'desktop'
                            ? 'bg-[#142332] text-[#d8bd73] shadow-xs'
                            : 'text-[#59636d] hover:text-[#17202a]'
                        }`}
                      >
                        <Laptop className="h-3.5 w-3.5" />
                        <span>Computador</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDevice('mobile')}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                          device === 'mobile'
                            ? 'bg-[#142332] text-[#d8bd73] shadow-xs'
                            : 'text-[#59636d] hover:text-[#17202a]'
                        }`}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>Celular</span>
                      </button>
                    </div>
                  </div>

                  {/* FRAME DO MOCKUP */}
                  <div className="mt-4 flex min-h-[320px] sm:min-h-[400px] items-center justify-center overflow-hidden rounded-2xl border border-[#dcd3c5] bg-[#dedad1] p-3 sm:p-6 shadow-inner">
                    <SolutionPreview category={category} index={selectedIndex} device={device} model={model} />
                  </div>
                </section>
              </main>
            </div>
          </div>

          {/* RODAPÉ DO MODAL COM AÇÕES */}
          <footer className="shrink-0 border-t border-[#e4dccf] bg-white px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              {/* NAVEGAÇÃO ENTRE MODELOS */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changeModel(selectedIndex - 1)}
                  aria-label="Referência anterior"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#cfc5b5] bg-[#faf8f3] text-[#17202a] shadow-2xs transition hover:border-[#806128] hover:bg-white active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-1.5 px-2 text-xs font-bold text-[#626d77]">
                  <span>{selectedIndex + 1} de {data.models.length}</span>
                  <div className="hidden sm:flex items-center gap-1 ml-1">
                    {data.models.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                          selectedIndex === i ? 'w-4 bg-[#806128]' : 'w-1.5 bg-[#cfc5b5]'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => changeModel(selectedIndex + 1)}
                  aria-label="Próxima referência"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#cfc5b5] bg-[#faf8f3] text-[#17202a] shadow-2xs transition hover:border-[#806128] hover:bg-white active:scale-95"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* BOTÃO DE CONVERSÃO / SOLICITAÇÃO */}
              <button
                type="button"
                onClick={() => { onClose(); onRequestBudget(); }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#142332] px-4 py-2.5 sm:px-6 text-xs sm:text-sm font-black text-white shadow-sm transition-all hover:bg-[#806128] hover:shadow-md active:scale-95"
              >
                <span>Solicitar projeto semelhante</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>
      )}
    </AccessibleDialog>
  );
}

function SolutionPreview({
  category,
  index,
  device,
  model,
}: {
  category: SystemExampleCategory;
  index: number;
  device: DeviceMode;
  model: ShowcaseModel;
}) {
  const accent = index === 0 ? '#b6924b' : index === 1 ? '#8b5d4a' : '#55706f';

  if (device === 'mobile') {
    return (
      <div className="w-[240px] sm:w-[260px] overflow-hidden rounded-[32px] border-[8px] border-[#142332] bg-white shadow-2xl">
        <div className="relative flex h-5 items-center justify-center bg-[#142332]">
          <span className="h-3 w-20 rounded-b-lg bg-[#0c1622]" />
        </div>
        <div className="h-[390px] overflow-y-auto scrollbar-none">
          <PreviewLayout category={category} accent={accent} mobile={true} model={model} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-[#c8bfae] bg-white shadow-2xl">
      {/* BARRA DO NAVEGADOR DESKTOP */}
      <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-slate-100 px-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]/80" />
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-white px-3 py-0.5 text-[10px] font-mono text-slate-600 shadow-2xs border border-slate-200">
          <Lock className="h-2.5 w-2.5 text-emerald-600" />
          <span>https://empresa.com.br/{category}</span>
        </div>
        <div className="w-8" />
      </div>

      <div className="aspect-[16/10] min-h-[340px] overflow-y-auto scrollbar-none">
        <PreviewLayout category={category} accent={accent} mobile={false} model={model} />
      </div>
    </div>
  );
}

function PreviewLayout({
  category,
  accent,
  mobile,
  model,
}: {
  category: SystemExampleCategory;
  accent: string;
  mobile: boolean;
  model: ShowcaseModel;
}) {
  if (category === 'automations' || category === 'integrations') {
    return <FlowPreview accent={accent} integration={category === 'integrations'} model={model} />;
  }
  if (category === 'systems' || category === 'portals') {
    return <WorkspacePreview accent={accent} mobile={mobile} portal={category === 'portals'} model={model} />;
  }
  return <WebsitePreview accent={accent} mobile={mobile} store={category === 'stores'} model={model} />;
}

function WebsitePreview({
  accent,
  mobile,
  store,
  model,
}: {
  accent: string;
  mobile: boolean;
  store: boolean;
  model: ShowcaseModel;
}) {
  return (
    <div className="flex h-full flex-col bg-[#fbf9f5] text-[#17202a]">
      {/* HEADER SIMULADO */}
      <header className="flex h-11 items-center justify-between border-b border-[#e8e1d4] bg-white px-4">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-md bg-[#142332] text-[#d8bd73] flex items-center justify-center text-[10px] font-black">G</span>
          <strong className="text-xs font-black tracking-tight text-[#142332]">EMPRESA</strong>
        </div>
        {!mobile && (
          <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600">
            <span>Início</span>
            <span>Serviços</span>
            <span>Sobre</span>
            <span className="rounded-md bg-[#142332] px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: accent }}>
              {store ? 'Ver Carrinho (2)' : 'Fale Conosco'}
            </span>
          </div>
        )}
      </header>

      {/* HERO SIMULADO */}
      <div className={`p-4 sm:p-6 ${mobile ? 'space-y-4' : 'grid grid-cols-[1.2fr_0.8fr] gap-6 items-center'}`}>
        <div>
          <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-2xs" style={{ backgroundColor: accent }}>
            {model.title}
          </span>
          <h4 className="mt-2 text-base sm:text-xl font-black leading-snug text-[#111820]">
            {store ? 'Catálogo Exclusivo e Pedidos Rápidos' : 'Autoridade, Clareza e Resultados para o seu Negócio'}
          </h4>
          <p className="mt-1.5 text-[11px] sm:text-xs leading-relaxed text-[#59636d]">
            {model.description}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-lg px-3 py-1.5 text-[10px] font-black text-white shadow-xs" style={{ backgroundColor: accent }}>
              {store ? 'Comprar Agora' : 'Solicitar Proposta'}
            </span>
            <span className="rounded-lg border border-[#cfc5b5] bg-white px-3 py-1.5 text-[10px] font-bold text-[#2a3642]">
              Saiba Mais
            </span>
          </div>
        </div>

        {/* CARDS OU PRODUTOS SIMULADOS */}
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-[#e4dcce] bg-white p-2.5 shadow-2xs">
              <div className="aspect-video w-full rounded-lg bg-[#eeeae2] flex items-center justify-center text-[10px] text-slate-400 font-bold">
                {store ? `Item 0${i + 1}` : `Módulo 0${i + 1}`}
              </div>
              <strong className="mt-2 block text-[11px] font-bold text-[#111820] truncate">
                {model.includes[i] || `Solução #${i + 1}`}
              </strong>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <span className="text-[#806128] font-bold">{store ? 'R$ 189,00' : 'Incluso'}</span>
                <span className="h-3.5 w-3.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[8px] font-black">✓</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspacePreview({
  accent,
  mobile,
  portal,
  model,
}: {
  accent: string;
  mobile: boolean;
  portal: boolean;
  model: ShowcaseModel;
}) {
  return (
    <div className={`flex h-full ${mobile ? 'flex-col' : 'flex-row'} bg-[#f4f6f8] text-[#17202a]`}>
      {/* SIDEBAR DO SISTEMA */}
      <div className={`${mobile ? 'flex items-center justify-between p-2 border-b' : 'w-44 p-3 border-r'} border-slate-200 bg-[#142332] text-white shrink-0`}>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: accent }}>G</span>
          <span className="text-xs font-black">{portal ? 'Portal' : 'Painel'} GSA</span>
        </div>
        {!mobile && (
          <div className="mt-4 space-y-1 text-[11px] text-white/70">
            <div className="rounded-md bg-white/10 px-2 py-1.5 font-bold text-white">Dashboard</div>
            <div className="px-2 py-1.5 hover:text-white">Operações</div>
            <div className="px-2 py-1.5 hover:text-white">Faturamento</div>
            <div className="px-2 py-1.5 hover:text-white">Relatórios</div>
          </div>
        )}
      </div>

      {/* PAINEL PRINCIPAL */}
      <div className="flex-1 p-3 sm:p-5 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs sm:text-sm font-black text-[#111820]">{model.title}</h4>
            <p className="text-[10px] text-slate-500">{portal ? 'Ambiente Seguro do Usuário' : 'Gestão Operacional Integrada'}</p>
          </div>
          <span className="rounded-full px-2 py-0.5 text-[9px] font-black text-white" style={{ backgroundColor: accent }}>
            Online
          </span>
        </div>

        {/* MÉTRICAS SIMULADAS */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-center shadow-2xs">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">Demandas</span>
            <strong className="text-xs sm:text-sm font-black text-[#111820]">128</strong>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-center shadow-2xs">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">Concluídas</span>
            <strong className="text-xs sm:text-sm font-black text-emerald-600">98.4%</strong>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 text-center shadow-2xs">
            <span className="text-[9px] text-slate-400 block uppercase font-bold">Tempo Médio</span>
            <strong className="text-xs sm:text-sm font-black text-[#806128]">2.4h</strong>
          </div>
        </div>

        {/* LISTA DE ATIVIDADES OU PROCESSOS */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <strong className="text-[11px] font-black text-[#111820] block mb-2">Fluxo de Atendimento em Tempo Real</strong>
          <div className="space-y-2">
            {model.includes.map((item, i) => (
              <div key={item} className="flex items-center justify-between border-b border-slate-100 pb-1.5 last:border-0 last:pb-0 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="font-bold text-slate-700">{item}</span>
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                  {i === 0 ? 'Concluído' : i === 1 ? 'Em andamento' : 'Programado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowPreview({
  accent,
  integration,
  model,
}: {
  accent: string;
  integration: boolean;
  model: ShowcaseModel;
}) {
  const steps = integration
    ? [
        { label: 'Origem dos Dados', desc: 'Formulários & APIs' },
        { label: 'Barramento GSA', desc: 'Tratamento & Regras' },
        { label: 'Destino Seguro', desc: 'Banco & Notificações' },
      ]
    : [
        { label: 'Evento / Gatilho', desc: 'Ação do Cliente' },
        { label: 'Regra Automática', desc: 'Filtro & Validação' },
        { label: 'Ação Executada', desc: 'WhatsApp & CRM' },
      ];

  return (
    <div className="flex h-full flex-col justify-center bg-[#fbf9f5] p-4 sm:p-8 text-[#17202a]">
      <div className="text-center mb-6">
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase text-white shadow-2xs" style={{ backgroundColor: accent }}>
          {model.title}
        </span>
        <h4 className="mt-1 text-sm sm:text-base font-black text-[#111820]">
          Fluxo de Integração Conectado de Ponta a Ponta
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        {steps.map((step, index) => (
          <div key={step.label} className="relative flex flex-col items-center text-center rounded-2xl border border-[#e4dcce] bg-white p-4 shadow-sm">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-xs font-black shadow-xs"
              style={{ backgroundColor: accent }}
            >
              0{index + 1}
            </span>
            <strong className="mt-2 text-xs font-black text-[#111820]">{step.label}</strong>
            <span className="mt-0.5 text-[10px] text-slate-500">{step.desc}</span>
            <span className="mt-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
              Sincronizado
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8bd73]/50 bg-[#faf6ec] px-3 py-1 text-[10px] font-black text-[#6d5727]">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Zero retrabalho manual · Notificações instantâneas
        </span>
      </div>
    </div>
  );
}

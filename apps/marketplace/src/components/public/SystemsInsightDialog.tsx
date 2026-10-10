import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Code2,
  Compass,
  Database,
  FileCheck2,
  Gauge,
  Layers3,
  MonitorSmartphone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import type { SystemExampleCategory } from './SystemsExamplesDialog';

export type GoalInsightId = 'present' | 'sell' | 'organize' | 'productivity';
export type StageInsightId = 'map' | 'architect' | 'build' | 'launch';
export type FoundationInsightId = 'security' | 'responsive' | 'data' | 'performance' | 'support' | 'connected';

export type SystemsInsightSelection =
  | { kind: 'goal'; id: GoalInsightId }
  | { kind: 'module'; solution: SystemExampleCategory; module: string }
  | { kind: 'stage'; id: StageInsightId }
  | { kind: 'foundation'; id: FoundationInsightId }
  | { kind: 'outcome'; solution: SystemExampleCategory };

interface SystemsInsightDialogProps {
  selection: SystemsInsightSelection | null;
  onClose: () => void;
  onOpenExamples: (category: SystemExampleCategory) => void;
  onRequestBudget: () => void;
}

interface GoalChoice {
  label: string;
  description: string;
  recommendation: SystemExampleCategory;
  solutionLabel: string;
  reason: string;
}

interface GoalData {
  title: string;
  description: string;
  icon: LucideIcon;
  choices: GoalChoice[];
}

const goals: Record<GoalInsightId, GoalData> = {
  present: {
    title: 'Apresentar melhor sua empresa',
    description: 'Identifique qual tipo de apresentação digital combina mais com o objetivo atual do negócio.',
    icon: MonitorSmartphone,
    choices: [
      {
        label: 'Explicar a empresa e seus serviços',
        description: 'Preciso transmitir confiança, organizar serviços e facilitar o contato.',
        recommendation: 'sites',
        solutionLabel: 'Site institucional',
        reason: 'Organiza posicionamento, serviços, diferenciais, provas e canais de atendimento em uma jornada clara.',
      },
      {
        label: 'Divulgar uma campanha específica',
        description: 'Quero concentrar a atenção em uma oferta, evento ou lançamento.',
        recommendation: 'sites',
        solutionLabel: 'Landing page comercial',
        reason: 'Cria uma página focada em uma única decisão, com benefícios, provas e chamada para ação.',
      },
      {
        label: 'Apresentar produtos sem venda direta',
        description: 'Preciso de catálogo, categorias e solicitação de orçamento.',
        recommendation: 'stores',
        solutionLabel: 'Catálogo comercial',
        reason: 'Estrutura produtos e linhas comerciais sem obrigar o cliente a concluir uma compra online.',
      },
    ],
  },
  sell: {
    title: 'Vender no ambiente digital',
    description: 'Escolha como sua empresa pretende receber pedidos, pagamentos ou solicitações comerciais.',
    icon: Sparkles,
    choices: [
      {
        label: 'Vender produtos online',
        description: 'Preciso de catálogo, carrinho, pagamento e acompanhamento de pedidos.',
        recommendation: 'stores',
        solutionLabel: 'Loja virtual',
        reason: 'Conecta a vitrine ao pedido e organiza a experiência de compra do início ao pós-venda.',
      },
      {
        label: 'Comercializar planos ou assinaturas',
        description: 'Quero comparar opções e receber contratações recorrentes.',
        recommendation: 'stores',
        solutionLabel: 'Plataforma de planos e assinaturas',
        reason: 'Apresenta benefícios, regras, cobrança recorrente e área do assinante em um único fluxo.',
      },
      {
        label: 'Receber pedidos por atendimento',
        description: 'Minha venda depende de cotação, análise ou contato consultivo.',
        recommendation: 'portals',
        solutionLabel: 'Portal comercial',
        reason: 'Registra a solicitação, reúne documentos e permite acompanhar cada etapa do atendimento.',
      },
    ],
  },
  organize: {
    title: 'Organizar processos e informações',
    description: 'Selecione a área que hoje exige mais controle, acompanhamento ou centralização.',
    icon: Database,
    choices: [
      {
        label: 'Operação e tarefas internas',
        description: 'Preciso controlar responsáveis, prazos, etapas e histórico.',
        recommendation: 'systems',
        solutionLabel: 'Sistema de gestão operacional',
        reason: 'Transforma processos em fluxos rastreáveis, com responsáveis, status, indicadores e histórico.',
      },
      {
        label: 'Atendimento a clientes ou parceiros',
        description: 'Quero oferecer acesso, solicitações, documentos e mensagens.',
        recommendation: 'portals',
        solutionLabel: 'Portal de relacionamento',
        reason: 'Dá autonomia ao usuário e centraliza o relacionamento em uma área segura.',
      },
      {
        label: 'Financeiro, contratos ou documentos',
        description: 'Tenho informações espalhadas e dificuldade para acompanhar vencimentos.',
        recommendation: 'systems',
        solutionLabel: 'Sistema administrativo',
        reason: 'Centraliza dados, arquivos, vencimentos, alertas e relatórios para apoiar decisões.',
      },
    ],
  },
  productivity: {
    title: 'Ganhar produtividade e reduzir retrabalho',
    description: 'Descubra qual tipo de ganho operacional faz mais sentido para sua equipe.',
    icon: Workflow,
    choices: [
      {
        label: 'Automatizar tarefas repetitivas',
        description: 'A equipe repete cadastros, avisos, distribuições ou cobranças.',
        recommendation: 'automations',
        solutionLabel: 'Automação de processos',
        reason: 'Usa gatilhos e regras para executar rotinas no momento certo, com registro e controle.',
      },
      {
        label: 'Conectar ferramentas diferentes',
        description: 'As mesmas informações são digitadas em mais de uma plataforma.',
        recommendation: 'integrations',
        solutionLabel: 'Integração entre plataformas',
        reason: 'Mantém dados alinhados entre sistemas e reduz erros causados por atualização manual.',
      },
      {
        label: 'Criar alertas e acompanhamentos',
        description: 'Prazos e pendências dependem da memória da equipe.',
        recommendation: 'automations',
        solutionLabel: 'Fluxo automático de alertas',
        reason: 'Monitora condições e dispara avisos, tarefas ou atualizações conforme regras definidas.',
      },
    ],
  },
};

interface ModuleData {
  purpose: string;
  experience: string;
  solves: string[];
  optional: string[];
}

const moduleDetails: Record<string, ModuleData> = {
  'Página inicial estratégica': {
    purpose: 'Apresentar rapidamente quem é a empresa, o que oferece e qual ação o visitante deve realizar.',
    experience: 'O cliente entende a proposta em poucos segundos e encontra os principais caminhos sem procurar demais.',
    solves: ['Mensagem principal confusa', 'Serviços espalhados', 'Contato pouco visível'],
    optional: ['Provas sociais', 'Destaques comerciais', 'Integração com WhatsApp'],
  },
  'Serviços e diferenciais': {
    purpose: 'Organizar soluções, benefícios, etapas e motivos para escolher a empresa.',
    experience: 'Cada serviço recebe uma apresentação clara, com contexto suficiente para apoiar a decisão.',
    solves: ['Descrições genéricas', 'Dificuldade para comparar serviços', 'Baixo valor percebido'],
    optional: ['Filtros por público', 'Perguntas frequentes', 'Chamadas por serviço'],
  },
  'Formulários e WhatsApp': {
    purpose: 'Transformar interesse em contato, orçamento, cadastro ou solicitação.',
    experience: 'O cliente informa o necessário e inicia o atendimento pelo canal mais adequado.',
    solves: ['Contatos sem contexto', 'Mensagens incompletas', 'Perda de oportunidades'],
    optional: ['Pré-qualificação', 'Anexos', 'Distribuição para responsáveis'],
  },
  'Conteúdo responsivo': {
    purpose: 'Adaptar textos, imagens, navegação e ações para celular, tablet e computador.',
    experience: 'A leitura e o uso permanecem claros independentemente do tamanho da tela.',
    solves: ['Texto cortado', 'Botões difíceis de usar', 'Rolagem desnecessária'],
    optional: ['Menus móveis', 'Elementos fixos', 'Otimização de mídia'],
  },
  'Catálogo e categorias': {
    purpose: 'Organizar produtos, serviços ou planos em grupos fáceis de explorar.',
    experience: 'O cliente encontra opções com menos esforço e entende melhor a variedade disponível.',
    solves: ['Vitrine desorganizada', 'Busca demorada', 'Produtos difíceis de comparar'],
    optional: ['Filtros', 'Busca', 'Produtos relacionados'],
  },
  'Carrinho e checkout': {
    purpose: 'Conduzir a seleção até a confirmação do pedido ou pagamento.',
    experience: 'O cliente revisa itens, dados, entrega e pagamento em uma sequência clara.',
    solves: ['Abandono por confusão', 'Etapas repetidas', 'Falta de confirmação'],
    optional: ['Cupons', 'Frete', 'Recuperação de carrinho'],
  },
  'Pedidos e pagamentos': {
    purpose: 'Registrar vendas, status, cobranças e confirmações financeiras.',
    experience: 'Cliente e equipe acompanham o pedido com informações consistentes.',
    solves: ['Pedidos perdidos', 'Baixa manual', 'Divergência de status'],
    optional: ['Pix', 'Cartão', 'Conciliação automática'],
  },
  'Área do cliente': {
    purpose: 'Permitir que o comprador consulte pedidos, dados, documentos e solicitações.',
    experience: 'O cliente resolve tarefas recorrentes sem depender sempre do atendimento.',
    solves: ['Consultas repetitivas', 'Histórico disperso', 'Falta de autonomia'],
    optional: ['Segunda via', 'Mensagens', 'Atualização cadastral'],
  },
  'Painéis e indicadores': {
    purpose: 'Resumir dados importantes para acompanhamento e decisão.',
    experience: 'A equipe visualiza prioridades, volumes, prazos e resultados em um único ambiente.',
    solves: ['Falta de visão geral', 'Relatórios manuais', 'Decisões sem dados'],
    optional: ['Filtros', 'Metas', 'Exportação'],
  },
  'Fluxos por status': {
    purpose: 'Representar cada processo por etapas, responsáveis e condições.',
    experience: 'Todos sabem onde cada demanda está e qual é o próximo passo.',
    solves: ['Processos sem padrão', 'Demandas paradas', 'Responsabilidade indefinida'],
    optional: ['Prazos', 'Aprovações', 'Reabertura com motivo'],
  },
  'Permissões de acesso': {
    purpose: 'Definir o que cada perfil pode visualizar, criar, editar ou aprovar.',
    experience: 'Cada usuário encontra somente as funções relacionadas ao seu papel.',
    solves: ['Acesso excessivo', 'Risco de alteração indevida', 'Telas confusas'],
    optional: ['Perfis personalizados', 'Auditoria', 'Aprovação em níveis'],
  },
  'Histórico e relatórios': {
    purpose: 'Registrar ações e transformar informações operacionais em consultas úteis.',
    experience: 'A equipe consegue entender o que aconteceu, quando e por quem.',
    solves: ['Falta de rastreabilidade', 'Dificuldade para prestar contas', 'Dados espalhados'],
    optional: ['PDF', 'Excel', 'Relatórios agendados'],
  },
  'Login e perfis': {
    purpose: 'Criar acesso seguro e experiências específicas para cada público.',
    experience: 'Cliente, equipe e parceiro entram no mesmo produto, mas veem ambientes adequados ao seu papel.',
    solves: ['Conteúdo público indevido', 'Acessos compartilhados', 'Experiência genérica'],
    optional: ['Recuperação de senha', 'Autenticação adicional', 'Convites'],
  },
  'Solicitações e documentos': {
    purpose: 'Registrar demandas e reunir arquivos relacionados em uma única conversa operacional.',
    experience: 'O usuário acompanha etapas, respostas, anexos e pendências sem perder contexto.',
    solves: ['Demandas por canais diferentes', 'Documentos perdidos', 'Status desconhecido'],
    optional: ['Categorias', 'Assinatura', 'Validação de anexos'],
  },
  'Notificações': {
    purpose: 'Avisar usuários sobre mudanças, prazos, mensagens e ações necessárias.',
    experience: 'Cada pessoa recebe informação relevante no momento apropriado.',
    solves: ['Pendências esquecidas', 'Acompanhamento manual', 'Comunicação tardia'],
    optional: ['E-mail', 'Push', 'WhatsApp'],
  },
  'Experiência mobile': {
    purpose: 'Priorizar tarefas frequentes e navegação simples no celular.',
    experience: 'O usuário realiza ações essenciais com poucos toques e leitura confortável.',
    solves: ['Telas apertadas', 'Formulários longos', 'Ações escondidas'],
    optional: ['Atalhos', 'Câmera e anexos', 'Instalação como aplicativo'],
  },
  'Gatilhos e regras': {
    purpose: 'Definir quando uma automação deve começar e quais condições precisa avaliar.',
    experience: 'O processo reage automaticamente a eventos previamente estabelecidos.',
    solves: ['Dependência de conferência manual', 'Ações fora de hora', 'Regras inconsistentes'],
    optional: ['Horários', 'Condições combinadas', 'Exceções'],
  },
  'Distribuição automática': {
    purpose: 'Encaminhar tarefas, contatos ou solicitações ao responsável correto.',
    experience: 'A demanda chega à pessoa certa sem depender de triagem manual.',
    solves: ['Fila desorganizada', 'Sobrecarga desigual', 'Atraso no primeiro atendimento'],
    optional: ['Rodízio', 'Especialidade', 'Disponibilidade'],
  },
  'Alertas e lembretes': {
    purpose: 'Acompanhar prazos, pendências e condições que exigem atenção.',
    experience: 'A equipe recebe avisos antes que um problema ou atraso aconteça.',
    solves: ['Vencimentos esquecidos', 'Cobranças tardias', 'Pendências invisíveis'],
    optional: ['Escalonamento', 'Repetição', 'Confirmação de leitura'],
  },
  'Registro de execução': {
    purpose: 'Guardar o resultado de cada automação para consulta e auditoria.',
    experience: 'A equipe consegue verificar o que foi executado e identificar falhas.',
    solves: ['Automação sem rastreio', 'Dificuldade para corrigir erros', 'Falta de evidência'],
    optional: ['Logs detalhados', 'Tentativas automáticas', 'Painel de falhas'],
  },
  'APIs e webhooks': {
    purpose: 'Permitir troca estruturada de informações entre plataformas.',
    experience: 'Eventos em uma ferramenta atualizam outra sem nova digitação.',
    solves: ['Sistemas isolados', 'Atualização duplicada', 'Informação desatualizada'],
    optional: ['Fila de eventos', 'Autenticação', 'Retentativas'],
  },
  Pagamentos: {
    purpose: 'Conectar cobranças, confirmações e status financeiros ao fluxo do negócio.',
    experience: 'O pagamento atualiza automaticamente pedidos, contratos ou acessos.',
    solves: ['Baixa manual', 'Liberação atrasada', 'Divergência financeira'],
    optional: ['Pix', 'Boleto', 'Cartão'],
  },
  'CRM e atendimento': {
    purpose: 'Unificar contatos, oportunidades e histórico de relacionamento.',
    experience: 'A equipe continua a conversa com contexto, independentemente do canal de origem.',
    solves: ['Leads duplicados', 'Histórico incompleto', 'Atendimento desconectado'],
    optional: ['WhatsApp', 'Formulários', 'Funil comercial'],
  },
  'Sincronização de dados': {
    purpose: 'Manter informações equivalentes atualizadas entre diferentes sistemas.',
    experience: 'Alterações importantes aparecem nos ambientes conectados com consistência.',
    solves: ['Dados divergentes', 'Planilhas paralelas', 'Retrabalho de cadastro'],
    optional: ['Sincronização em lote', 'Regras de prioridade', 'Validação de conflitos'],
  },
};

interface StageData {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  happens: string[];
  client: string[];
  deliverables: string[];
}

const stages: Record<StageInsightId, StageData> = {
  map: {
    title: 'Diagnóstico e mapeamento',
    subtitle: 'Entender antes de construir',
    icon: Compass,
    happens: ['Levantamento do problema e do objetivo', 'Identificação dos usuários', 'Mapeamento das regras e exceções'],
    client: ['Explica a rotina atual', 'Apresenta exemplos e documentos', 'Valida prioridades'],
    deliverables: ['Resumo da necessidade', 'Escopo inicial', 'Riscos e dependências'],
  },
  architect: {
    title: 'Arquitetura da solução',
    subtitle: 'Organizar a experiência e a estrutura',
    icon: Layers3,
    happens: ['Definição de módulos e fluxos', 'Organização de dados e permissões', 'Planejamento da navegação'],
    client: ['Valida os caminhos principais', 'Confirma regras do negócio', 'Prioriza entregas'],
    deliverables: ['Mapa da solução', 'Fluxos principais', 'Plano de desenvolvimento'],
  },
  build: {
    title: 'Desenvolvimento e validação',
    subtitle: 'Transformar decisões em produto',
    icon: Code2,
    happens: ['Construção das interfaces', 'Implementação das regras', 'Testes dos fluxos importantes'],
    client: ['Avalia versões de validação', 'Confirma comportamentos', 'Centraliza ajustes necessários'],
    deliverables: ['Módulos funcionais', 'Correções validadas', 'Base técnica organizada'],
  },
  launch: {
    title: 'Implantação e evolução',
    subtitle: 'Colocar a solução em uso',
    icon: Rocket,
    happens: ['Preparação do ambiente', 'Validação final dos acessos', 'Acompanhamento da entrada em uso'],
    client: ['Confirma usuários e dados', 'Participa da validação final', 'Informa prioridades futuras'],
    deliverables: ['Produto implantado', 'Orientações de uso', 'Base para evolução'],
  },
};

interface FoundationData {
  title: string;
  description: string;
  icon: LucideIcon;
  practice: string[];
  benefit: string;
}

const foundations: Record<FoundationInsightId, FoundationData> = {
  security: {
    title: 'Acessos e segurança',
    description: 'Segurança começa pela organização correta de usuários, permissões, dados e ações.',
    icon: ShieldCheck,
    practice: ['Perfis com permissões diferentes', 'Registro de ações importantes', 'Proteção de informações por contexto', 'Regras para edição e aprovação'],
    benefit: 'Reduz riscos e evita que usuários tenham acesso ou poder de alteração além do necessário.',
  },
  responsive: {
    title: 'Experiência responsiva',
    description: 'O produto deve continuar claro e utilizável em celular, tablet e computador.',
    icon: MonitorSmartphone,
    practice: ['Menus adaptados', 'Campos confortáveis para toque', 'Conteúdo reorganizado por tela', 'Ações prioritárias sempre acessíveis'],
    benefit: 'O usuário consegue concluir tarefas sem depender de um equipamento específico.',
  },
  data: {
    title: 'Dados estruturados',
    description: 'Informações organizadas permitem consulta, histórico, automação e relatórios confiáveis.',
    icon: Database,
    practice: ['Cadastros padronizados', 'Relacionamento entre informações', 'Validações de preenchimento', 'Filtros e relatórios'],
    benefit: 'A empresa deixa de depender de dados dispersos e passa a trabalhar com uma fonte mais consistente.',
  },
  performance: {
    title: 'Desempenho e evolução',
    description: 'A solução precisa responder bem hoje e permitir mudanças futuras sem reconstrução constante.',
    icon: Gauge,
    practice: ['Carregamento otimizado', 'Componentes reutilizáveis', 'Módulos separados', 'Preparação para novos recursos'],
    benefit: 'A experiência permanece rápida e o produto acompanha o crescimento da operação.',
  },
  support: {
    title: 'Acompanhamento do projeto',
    description: 'Decisões e validações organizadas evitam ruído, retrabalho e mudanças sem contexto.',
    icon: FileCheck2,
    practice: ['Escopo registrado', 'Validações por etapa', 'Histórico de decisões', 'Prioridades centralizadas'],
    benefit: 'Cliente e desenvolvimento mantêm a mesma visão sobre o que está sendo construído.',
  },
  connected: {
    title: 'Solução conectada',
    description: 'Módulos, canais e integrações devem formar uma experiência contínua.',
    icon: Workflow,
    practice: ['Dados compartilhados entre módulos', 'Ações que atualizam outras áreas', 'Integrações com ferramentas externas', 'Histórico único do processo'],
    benefit: 'A empresa reduz rupturas e deixa de operar cada área como uma ilha separada.',
  },
};

interface OutcomeData {
  label: string;
  before: string[];
  after: string[];
  metric: string;
}

const outcomes: Record<SystemExampleCategory, OutcomeData> = {
  sites: {
    label: 'Presença digital e geração de oportunidades',
    before: ['Serviços difíceis de entender', 'Contato escondido', 'Baixo valor percebido'],
    after: ['Proposta clara', 'Caminhos de contato visíveis', 'Apresentação profissional'],
    metric: 'Mais clareza para transformar visitas em conversas comerciais.',
  },
  stores: {
    label: 'Venda digital organizada',
    before: ['Pedidos por mensagens dispersas', 'Produtos sem padrão', 'Pagamento desconectado'],
    after: ['Catálogo estruturado', 'Fluxo de compra claro', 'Pedidos e pagamentos centralizados'],
    metric: 'Menos atrito entre escolha, pedido e confirmação.',
  },
  systems: {
    label: 'Controle e visão da operação',
    before: ['Planilhas paralelas', 'Status desconhecido', 'Processos dependentes de pessoas'],
    after: ['Dados centralizados', 'Responsáveis e etapas visíveis', 'Histórico e indicadores'],
    metric: 'Mais previsibilidade para acompanhar e decidir.',
  },
  portals: {
    label: 'Relacionamento e autonomia',
    before: ['Consultas repetitivas', 'Documentos por canais diferentes', 'Cliente sem acompanhamento'],
    after: ['Área segura', 'Solicitações centralizadas', 'Informações disponíveis a qualquer momento'],
    metric: 'Atendimento mais organizado e usuário mais autônomo.',
  },
  automations: {
    label: 'Produtividade e consistência',
    before: ['Tarefas repetidas', 'Prazos esquecidos', 'Execução sem padrão'],
    after: ['Gatilhos automáticos', 'Alertas no momento certo', 'Registro das execuções'],
    metric: 'Menos esforço manual em rotinas previsíveis.',
  },
  integrations: {
    label: 'Continuidade entre plataformas',
    before: ['Digitação duplicada', 'Dados divergentes', 'Ferramentas isoladas'],
    after: ['Informações sincronizadas', 'Atualizações automáticas', 'Operação conectada'],
    metric: 'Menos retrabalho para manter sistemas alinhados.',
  },
};

const solutionNames: Record<SystemExampleCategory, string> = {
  sites: 'Sites institucionais',
  stores: 'Lojas virtuais',
  systems: 'Sistemas personalizados',
  portals: 'Portais e aplicativos',
  automations: 'Automações',
  integrations: 'Integrações',
};

export function SystemsInsightDialog({
  selection,
  onClose,
  onOpenExamples,
  onRequestBudget,
}: SystemsInsightDialogProps) {
  const [choiceIndex, setChoiceIndex] = useState(0);

  useEffect(() => {
    setChoiceIndex(0);
  }, [selection]);

  const header = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'goal') return { eyebrow: 'Diagnóstico rápido', title: goals[selection.id].title, icon: goals[selection.id].icon };
    if (selection.kind === 'module') return { eyebrow: solutionNames[selection.solution], title: selection.module, icon: Code2 };
    if (selection.kind === 'stage') return { eyebrow: 'Jornada do projeto', title: stages[selection.id].title, icon: stages[selection.id].icon };
    if (selection.kind === 'foundation') return { eyebrow: 'Fundamento profissional', title: foundations[selection.id].title, icon: foundations[selection.id].icon };
    return { eyebrow: solutionNames[selection.solution], title: 'Comparativo de transformação', icon: Sparkles };
  }, [selection]);

  const HeaderIcon = header?.icon;

  return (
    <AccessibleDialog
      isOpen={Boolean(selection)}
      onClose={onClose}
      ariaLabel={header?.title || 'Detalhes da solução digital'}
      overlayClassName="items-center justify-center overflow-y-auto bg-[#02070d]/85 p-2 sm:p-6 backdrop-blur-md"
      panelClassName="max-h-[92dvh] w-[95vw] max-w-5xl overflow-hidden rounded-2xl sm:rounded-3xl border border-white/15 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.58)]"
    >
      {selection && header && HeaderIcon && (
        <div className="flex max-h-[92dvh] min-h-0 flex-col">
          <span className="h-1.5 shrink-0 bg-gradient-to-r from-[#8a6b2f] via-[#d8bd73] to-[#8a6b2f]" />
          <header className="shrink-0 border-b border-white/10 bg-[#08121e] px-4 py-4 text-white sm:px-6 sm:py-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d7b96e]/35 bg-white/5 text-[#d7b96e] shadow-xs">
                <HeaderIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d7b96e]">{header.eyebrow}</p>
                <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">{header.title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                data-dialog-autofocus
                aria-label="Fechar detalhes"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b96e]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f4f6f7] p-4 sm:p-6 lg:p-8">
            {selection.kind === 'goal' && (
              <GoalExperience
                data={goals[selection.id]}
                selectedIndex={choiceIndex}
                onSelect={setChoiceIndex}
                onOpenExamples={onOpenExamples}
                onRequestBudget={onRequestBudget}
              />
            )}
            {selection.kind === 'module' && (
              <ModuleExperience
                solution={selection.solution}
                module={selection.module}
                onOpenExamples={onOpenExamples}
                onRequestBudget={onRequestBudget}
              />
            )}
            {selection.kind === 'stage' && <StageExperience data={stages[selection.id]} onRequestBudget={onRequestBudget} />}
            {selection.kind === 'foundation' && <FoundationExperience data={foundations[selection.id]} onRequestBudget={onRequestBudget} />}
            {selection.kind === 'outcome' && (
              <OutcomeExperience
                solution={selection.solution}
                data={outcomes[selection.solution]}
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

function GoalExperience({
  data,
  selectedIndex,
  onSelect,
  onOpenExamples,
  onRequestBudget,
}: {
  data: GoalData;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpenExamples: (category: SystemExampleCategory) => void;
  onRequestBudget: () => void;
}) {
  const selected = data.choices[selectedIndex];

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="text-sm leading-7 text-slate-600">{data.description}</p>
        <div className="mt-5 space-y-2">
          {data.choices.map((choice, index) => (
            <button
              key={choice.label}
              type="button"
              onClick={() => onSelect(index)}
              className={`w-full border p-4 text-left transition ${index === selectedIndex ? 'border-[#0b1623] bg-[#0b1623] text-white' : 'border-slate-300 bg-white text-[#0b1623] hover:border-slate-500'}`}
            >
              <span className="text-sm font-black">{choice.label}</span>
              <span className={`mt-1.5 block text-xs leading-5 ${index === selectedIndex ? 'text-slate-300' : 'text-slate-500'}`}>{choice.description}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="border border-slate-300 bg-white p-5 sm:p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#80672c]">Solução mais indicada</p>
        <h3 className="mt-3 text-2xl font-black text-[#0b1623]">{selected.solutionLabel}</h3>
        <p className="mt-4 text-sm leading-7 text-slate-600">{selected.reason}</p>

        <div className="mt-6 border-l-2 border-[#d7b96e] bg-[#f7f3e8] p-4">
          <p className="text-xs font-black text-[#5f4b23]">Recomendação baseada no objetivo selecionado</p>
          <p className="mt-1 text-xs leading-5 text-[#75623a]">A análise completa confirma usuários, regras, integrações e prioridades antes da definição do escopo.</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => onOpenExamples(selected.recommendation)} className="inline-flex items-center justify-center gap-2 bg-[#0b1623] px-5 py-3.5 text-sm font-black text-white">
            Ver demonstrações
            <MonitorSmartphone className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRequestBudget} className="inline-flex items-center justify-center gap-2 border border-slate-300 px-5 py-3.5 text-sm font-black text-[#0b1623]">
            Solicitar análise
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

function ModuleExperience({
  solution,
  module,
  onOpenExamples,
  onRequestBudget,
}: {
  solution: SystemExampleCategory;
  module: string;
  onOpenExamples: (category: SystemExampleCategory) => void;
  onRequestBudget: () => void;
}) {
  const data = moduleDetails[module] || {
    purpose: 'Este módulo é configurado conforme as regras e o fluxo específico do projeto.',
    experience: 'A experiência é definida para reduzir etapas e facilitar o uso no contexto real da empresa.',
    solves: ['Processo manual', 'Informação dispersa', 'Falta de padronização'],
    optional: ['Permissões', 'Notificações', 'Relatórios'],
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="border border-slate-300 bg-white p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#80672c]">O que este módulo faz</p>
          <p className="mt-3 text-sm leading-7 text-slate-700">{data.purpose}</p>
        </article>
        <article className="border border-slate-300 bg-[#0b1623] p-5 text-white">
          <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#d7b96e]">Experiência do usuário</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">{data.experience}</p>
        </article>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ListPanel title="Problemas que ajuda a resolver" items={data.solves} icon={CircleAlert} />
        <ListPanel title="Recursos que podem complementar" items={data.optional} icon={Check} />
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-slate-300 pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => onOpenExamples(solution)} className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-5 py-3.5 text-sm font-black text-[#0b1623]">
          Ver solução completa
          <MonitorSmartphone className="h-4 w-4" />
        </button>
        <button type="button" onClick={onRequestBudget} className="inline-flex items-center justify-center gap-2 bg-[#0b1623] px-5 py-3.5 text-sm font-black text-white">
          Incluir em uma análise
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StageExperience({ data, onRequestBudget }: { data: StageData; onRequestBudget: () => void }) {
  return (
    <div>
      <p className="max-w-3xl text-base font-semibold leading-7 text-slate-700">{data.subtitle}</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ListPanel title="O que acontece nesta etapa" items={data.happens} icon={Workflow} />
        <ListPanel title="Participação do cliente" items={data.client} icon={Compass} />
        <ListPanel title="Entregas geradas" items={data.deliverables} icon={FileCheck2} />
      </div>
      <div className="mt-6 flex flex-col gap-3 border border-[#d8c89b] bg-[#f7f3e8] p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-6 text-[#65542f]">Cada etapa termina com validações claras para que a próxima comece com contexto e decisões registradas.</p>
        <button type="button" onClick={onRequestBudget} className="inline-flex shrink-0 items-center justify-center gap-2 bg-[#0b1623] px-5 py-3 text-sm font-black text-white">
          Conversar sobre o projeto
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FoundationExperience({ data, onRequestBudget }: { data: FoundationData; onRequestBudget: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
      <section>
        <p className="text-sm leading-7 text-slate-600">{data.description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {data.practice.map((item, index) => (
            <div key={item} className="flex items-start gap-3 border border-slate-300 bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#0b1623] text-[9px] font-black text-[#d7b96e]">0{index + 1}</span>
              <p className="text-xs font-bold leading-5 text-slate-700">{item}</p>
            </div>
          ))}
        </div>
      </section>
      <aside className="border border-white/10 bg-[#0b1623] p-5 text-white sm:p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d7b96e]">Benefício no dia a dia</p>
        <p className="mt-4 text-lg font-black leading-7">{data.benefit}</p>
        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-xs leading-5 text-slate-400">A forma de aplicar este fundamento varia conforme usuários, dados, volume de uso e integrações do projeto.</p>
        </div>
        <button type="button" onClick={onRequestBudget} className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-[#d7b96e] px-5 py-3.5 text-sm font-black text-[#111820]">
          Solicitar análise técnica
          <ArrowRight className="h-4 w-4" />
        </button>
      </aside>
    </div>
  );
}

function OutcomeExperience({
  solution,
  data,
  onOpenExamples,
  onRequestBudget,
}: {
  solution: SystemExampleCategory;
  data: OutcomeData;
  onOpenExamples: (category: SystemExampleCategory) => void;
  onRequestBudget: () => void;
}) {
  return (
    <div>
      <p className="max-w-3xl text-sm leading-7 text-slate-600">Veja como a solução pode alterar a experiência da equipe e do cliente quando processos, dados e interfaces passam a trabalhar de forma conectada.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ComparisonPanel title="Antes" items={data.before} dark={false} />
        <ComparisonPanel title="Depois" items={data.after} dark />
      </div>
      <div className="mt-4 border-l-4 border-[#d7b96e] bg-white p-5">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#80672c]">Resultado esperado</p>
        <h3 className="mt-2 text-xl font-black text-[#0b1623]">{data.label}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{data.metric}</p>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => onOpenExamples(solution)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfc5b5] bg-white px-5 py-3 text-xs sm:text-sm font-black text-[#0b1623] shadow-2xs transition hover:border-[#806128] hover:bg-[#faf8f3] active:scale-95"
        >
          Abrir demonstrações
          <MonitorSmartphone className="h-4 w-4 text-[#806128]" />
        </button>
        <button
          type="button"
          onClick={onRequestBudget}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b1623] px-5 py-3 text-xs sm:text-sm font-black text-white shadow-sm transition hover:bg-[#806128] active:scale-95"
        >
          Solicitar projeto semelhante
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ListPanel({ title, items, icon: Icon }: { title: string; items: string[]; icon: LucideIcon }) {
  return (
    <article className="border border-slate-300 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center border border-slate-300 text-[#80672c]"><Icon className="h-4 w-4" /></span>
        <h3 className="text-sm font-black text-[#0b1623]">{title}</h3>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-slate-600">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#80672c]" strokeWidth={3} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ComparisonPanel({ title, items, dark }: { title: string; items: string[]; dark: boolean }) {
  return (
    <article className={`border p-5 sm:p-6 ${dark ? 'border-[#0b1623] bg-[#0b1623] text-white' : 'border-slate-300 bg-white text-[#0b1623]'}`}>
      <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${dark ? 'text-[#d7b96e]' : 'text-slate-500'}`}>{title}</p>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item} className={`flex items-start gap-3 text-sm font-semibold leading-6 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dark ? 'bg-[#d7b96e]' : 'bg-slate-400'}`} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

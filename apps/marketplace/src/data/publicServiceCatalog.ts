import type { ComponentType } from 'react';
import { BriefcaseBusiness, CreditCard, Headphones, PackageCheck, ShoppingBag, Sparkles } from 'lucide-react';

export type Audience = 'PF' | 'PJ';
export type PublicPage = 'home' | 'services' | 'free-tools' | 'systems' | 'partners' | 'privacy' | 'ads' | 'advertise';

export interface IconItem {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
}

export interface ServiceItem {
  id?: string;
  name: string;
  desc: string;
}

export interface ServicePackage {
  id?: string;
  code?: string;
  audience: Audience | 'AMBOS';
  title: string;
  subtitle: string;
  description: string;
  services: ServiceItem[];
}

export function getServicePackageSlug(servicePackage: Pick<ServicePackage, 'title'>): string {
  return servicePackage.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const publicServices: IconItem[] = [
  { icon: BriefcaseBusiness, title: 'Serviços administrativos', text: 'Organização de demandas, contratos, documentos e rotinas para empresas e clientes.' },
  { icon: CreditCard, title: 'Crédito e financeiro', text: 'Soluções para acompanhar faturas, crédito, pagamentos e solicitações em um só lugar.' },
  { icon: Headphones, title: 'Suporte e atendimento', text: 'Abertura de chamados, acompanhamento e histórico para manter tudo rastreável.' },
];

export const publicProducts: IconItem[] = [
  { icon: ShoppingBag, title: 'Produtos GSA', text: 'Itens e ofertas disponíveis para consulta antes da compra.' },
  { icon: PackageCheck, title: 'Assinaturas', text: 'Planos recorrentes e benefícios para quem usa os serviços com frequência.' },
  { icon: Sparkles, title: 'Promoções', text: 'Campanhas e vantagens que podem ser ativadas na área do cliente.' },
];

export const servicePackages: ServicePackage[] = [
  {
    audience: 'PF',
    title: 'Pacote Futuro Garantido',
    subtitle: 'Soluções previdenciárias e benefícios INSS',
    description: 'Planejamento previdenciário, aposentadorias, benefícios por incapacidade, BPC/LOAS, pensão por morte e recursos administrativos.',
    services: [
      { name: 'Planejamento Previdenciário', desc: 'Cálculo de tempo de contribuição, simulação de valores e análise do melhor momento.' },
      { name: 'Aposentadorias', desc: 'Idade, tempo de contribuição, especial, rural e pessoa com deficiência.' },
      { name: 'Benefícios por Incapacidade', desc: 'Auxílio-doença e aposentadoria por invalidez.' },
      { name: 'Benefícios Assistenciais e Pensão', desc: 'BPC/LOAS, pensão por morte e salário-maternidade.' },
      { name: 'Assessoria Administrativa', desc: 'Recursos administrativos, revisão de benefícios e acertos de CNIS.' },
    ],
  },
  {
    audience: 'PF',
    title: 'Pacote Microempreendedor',
    subtitle: 'Serviços para MEI',
    description: 'Gestão completa para o microempreendedor manter a empresa regularizada, emitir documentos e resolver pendências.',
    services: [
      { name: 'Gestão do MEI', desc: 'Abertura, formalização e baixa do registro MEI.' },
      { name: 'Notas Fiscais', desc: 'Emissão de notas fiscais de produtos e serviços.' },
      { name: 'Regularização', desc: 'Declarações anuais, parcelamento de DAS e emissão de guias.' },
    ],
  },
  {
    audience: 'PF',
    title: 'Pacote Direção Livre',
    subtitle: 'Soluções veiculares e CNH',
    description: 'Regularização documental para condutores e veículos, incluindo licenciamento, transferência, renovação e defesa de infrações.',
    services: [
      { name: 'Regularização de Veículos', desc: 'Licenciamento, transferência, emplacamento, gravame, CRV e procurações.' },
      { name: 'Habilitação CNH', desc: 'Renovação, EAR, PID, CNH definitiva e alteração de dados.' },
      { name: 'Defesa de Infrações', desc: 'Indicação de condutor, recursos e defesa de suspensão ou cassação.' },
    ],
  },
  {
    audience: 'PF',
    title: 'Pacote Direitos PcD',
    subtitle: 'Assessoria administrativa e isenções',
    description: 'Suporte para isenções fiscais e direitos administrativos da pessoa com deficiência.',
    services: [
      { name: 'Isenções na Compra de Veículos', desc: 'Processos administrativos de IPI e ICMS.' },
      { name: 'Isenção de IPVA', desc: 'Solicitação junto à Secretaria da Fazenda Estadual.' },
      { name: 'Cartão Defis', desc: 'Autorização para estacionamento em vagas especiais.' },
      { name: 'Rodízio Municipal', desc: 'Solicitação de isenção onde o benefício se aplica.' },
    ],
  },
  {
    audience: 'PF',
    title: 'Pacote Vida em Dia',
    subtitle: 'Regularização civil, contratos e finanças',
    description: 'Organização financeira, contratos, imposto de renda, CPF, FGTS e cálculos administrativos.',
    services: [
      { name: 'Imposto de Renda', desc: 'Declaração anual e regularização de malha fina.' },
      { name: 'Regularização de CPF', desc: 'Resolução de pendências cadastrais e restrições.' },
      { name: 'Consultoria Financeira', desc: 'Planejamento de dívidas e organização orçamentária.' },
      { name: 'Contratos e Cálculos', desc: 'Contratos de aluguel, compra e venda e cálculos trabalhistas.' },
      { name: 'Assistência FGTS', desc: 'Assessoria para saques e regularização cadastral.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Gestão Financeira Operacional',
    subtitle: 'BPO financeiro',
    description: 'Terceirização do financeiro com controle de contas a pagar, contas a receber e conciliação bancária.',
    services: [
      { name: 'Contas a Pagar', desc: 'Gestão completa de contas e vencimentos.' },
      { name: 'Contas a Receber', desc: 'Acompanhamento de recebimentos e inadimplência.' },
      { name: 'Conciliação Bancária', desc: 'Conciliação diária ou semanal.' },
      { name: 'Agendamentos', desc: 'Pagamentos, folha e fornecedores no bankline.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Faturamento Inteligente',
    subtitle: 'Gestão fiscal e emissão',
    description: 'Agilidade na emissão de notas fiscais, boletos e envio automático de documentos aos clientes.',
    services: [
      { name: 'Notas Fiscais', desc: 'Emissão de notas de produtos e serviços.' },
      { name: 'Boletos Bancários', desc: 'Geração e envio de cobranças.' },
      { name: 'Envio Automático', desc: 'Distribuição automática dos documentos fiscais.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Recuperação de Crédito e Cobrança',
    subtitle: 'Gestão de inadimplência',
    description: 'Cobrança preventiva, negociação amigável e acompanhamento de protestos.',
    services: [
      { name: 'Cobrança Preventiva', desc: 'Lembretes antes do vencimento.' },
      { name: 'Cobrança Ativa', desc: 'Negociação de prazos e valores.' },
      { name: 'Gestão de Protesto', desc: 'Acompanhamento de títulos em cartório.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Gestão Administrativa e Compras',
    subtitle: 'Facilities e compras',
    description: 'Cotação de fornecedores, gestão de contratos e organização documental física e digital.',
    services: [
      { name: 'Cotação de Fornecedores', desc: 'Mapas comparativos e negociação.' },
      { name: 'Gestão de Contratos', desc: 'Monitoramento de vigência e renovação.' },
      { name: 'Organização Documental', desc: 'Arquivo digital e físico estruturado.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Gestão de Comissões de Vendas',
    subtitle: 'Inteligência comercial',
    description: 'Apuração de vendas, cálculo de comissões, metas, bônus e relatórios.',
    services: [
      { name: 'Apuração de Vendas', desc: 'Cruzamento de venda, faturamento e recebimento.' },
      { name: 'Comissionamento', desc: 'Aplicação de regras, bônus, metas e descontos.' },
      { name: 'Relatórios', desc: 'Extratos para diretoria e vendedores.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Gestão de Reembolsos e Despesas',
    subtitle: 'RDV e cartão corporativo',
    description: 'Controle de reembolsos, despesas externas, cartões e centros de custo.',
    services: [
      { name: 'Conferência de RDV', desc: 'Validação de notas e políticas de reembolso.' },
      { name: 'Cartão Corporativo', desc: 'Monitoramento de extratos e despesas.' },
      { name: 'Centro de Custo', desc: 'Comparativos mensais e previsões.' },
    ],
  },
  {
    audience: 'PJ',
    title: 'Compliance e Regularidade Fiscal',
    subtitle: 'Compliance fiscal',
    description: 'Monitoramento de certidões, emissão e renovação de CNDs e cadastro em fornecedores.',
    services: [
      { name: 'Monitoramento de CNDs', desc: 'Certidões federais, estaduais, municipais e trabalhistas.' },
      { name: 'Emissão e Renovação', desc: 'Ação preventiva para manter documentos válidos.' },
      { name: 'Cadastro em Fornecedores', desc: 'Fichas cadastrais e abertura de crédito.' },
    ],
  },
];

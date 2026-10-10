import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Instagram,
  LayoutTemplate,
  Palette,
  PenTool,
  Share2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';

export type BrandExampleCategory =
  | 'naming'
  | 'identity'
  | 'materials'
  | 'social'
  | 'content'
  | 'digital';

interface PortfolioModel {
  name: string;
  direction: string;
  audience: string;
  description: string;
  outcomes: string[];
  signature: string;
}

interface PortfolioCategory {
  label: string;
  title: string;
  introduction: string;
  icon: LucideIcon;
  models: PortfolioModel[];
}

const portfolio: Record<BrandExampleCategory, PortfolioCategory> = {
  naming: {
    label: 'Nome e posicionamento',
    title: 'Direções para uma marca fácil de compreender e lembrar',
    introduction: 'Cada direção combina nome, personalidade, mensagem e assinatura para mostrar como diferentes estratégias alteram a percepção da marca.',
    icon: PenTool,
    models: [
      {
        name: 'Direção institucional',
        direction: 'Clareza e confiança',
        audience: 'Empresas e serviços profissionais',
        description: 'Uma construção objetiva, segura e diretamente relacionada à atuação da empresa.',
        outcomes: ['Conceito central', 'Tom de voz profissional', 'Assinaturas possíveis'],
        signature: 'Estrutura que transmite segurança desde o nome.',
      },
      {
        name: 'Direção autoral',
        direction: 'Proximidade e autoridade',
        audience: 'Especialistas e marcas pessoais',
        description: 'Uma marca que transforma experiência, especialidade e presença pessoal em posicionamento reconhecível.',
        outcomes: ['Marca pessoal', 'Especialidade em destaque', 'Linguagem de autoridade'],
        signature: 'A pessoa se torna parte estratégica da marca.',
      },
      {
        name: 'Direção contemporânea',
        direction: 'Memorização e versatilidade',
        audience: 'Novos negócios e produtos',
        description: 'Uma direção curta e flexível, preparada para funcionar em canais digitais e futuras extensões.',
        outcomes: ['Nome memorável', 'Personalidade própria', 'Uso digital facilitado'],
        signature: 'Uma base simples para uma marca que pode crescer.',
      },
    ],
  },
  identity: {
    label: 'Logo e identidade visual',
    title: 'Sistemas visuais para diferentes percepções de marca',
    introduction: 'Símbolo, tipografia, cor e composição mudam de acordo com a personalidade e o valor que a empresa precisa comunicar.',
    icon: Palette,
    models: [
      {
        name: 'Identidade corporativa',
        direction: 'Sobriedade e organização',
        audience: 'Empresas, consultorias e serviços',
        description: 'Uma linguagem visual estruturada para documentos, apresentações, site e comunicação institucional.',
        outcomes: ['Logo e versões', 'Paleta institucional', 'Sistema tipográfico'],
        signature: 'Consistência visual para ambientes profissionais.',
      },
      {
        name: 'Identidade premium',
        direction: 'Exclusividade e refinamento',
        audience: 'Marcas de alto valor percebido',
        description: 'Poucos elementos, contraste controlado e aplicações seletivas para transmitir cuidado e distinção.',
        outcomes: ['Símbolo marcante', 'Paleta refinada', 'Aplicações de alto impacto'],
        signature: 'Menos elementos, mais presença.',
      },
      {
        name: 'Identidade próxima',
        direction: 'Acolhimento e acessibilidade',
        audience: 'Comércio, saúde e atendimento',
        description: 'Uma linguagem legível e humana, fácil de reconhecer e aplicar na comunicação cotidiana.',
        outcomes: ['Leitura rápida', 'Cores funcionais', 'Uso simples pela equipe'],
        signature: 'Uma marca que aproxima sem perder profissionalismo.',
      },
    ],
  },
  materials: {
    label: 'Materiais da empresa',
    title: 'Aplicações que transformam a identidade em ferramenta comercial',
    introduction: 'Cada conjunto visual foi pensado para uma rotina diferente: vender, atender ou manter a empresa organizada.',
    icon: FileText,
    models: [
      {
        name: 'Kit comercial',
        direction: 'Apresentar e vender',
        audience: 'Equipes comerciais e prestadores',
        description: 'Um conjunto para organizar proposta, apresentação institucional, catálogo e oferta de serviços.',
        outcomes: ['Apresentação institucional', 'Proposta comercial', 'Catálogo de serviços'],
        signature: 'Mais clareza para apresentar valor ao cliente.',
      },
      {
        name: 'Kit de atendimento',
        direction: 'Padronizar contatos',
        audience: 'Empresas com relacionamento frequente',
        description: 'Peças para assinatura de e-mail, cartão digital, WhatsApp, formulários e documentos recorrentes.',
        outcomes: ['Cartão digital', 'Assinatura de e-mail', 'Modelos de documentos'],
        signature: 'A mesma marca em cada conversa.',
      },
      {
        name: 'Kit institucional',
        direction: 'Organizar a operação',
        audience: 'Equipes e ambientes corporativos',
        description: 'Aplicações internas e externas para manter a identidade uniforme em diferentes situações.',
        outcomes: ['Papelaria básica', 'Capas e documentos', 'Guia rápido de uso'],
        signature: 'Uma identidade que a equipe consegue aplicar.',
      },
    ],
  },
  social: {
    label: 'Redes sociais',
    title: 'Perfis que parecem parte da marca, não páginas improvisadas',
    introduction: 'Cada perfil recebe uma estrutura visual própria conforme o objetivo: apresentar a empresa, vender ou construir autoridade pessoal.',
    icon: Instagram,
    models: [
      {
        name: 'Perfil institucional',
        direction: 'Autoridade e confiança',
        audience: 'Empresas e serviços',
        description: 'Uma presença sóbria com informações claras, prova de experiência e caminhos de contato definidos.',
        outcomes: ['Biografia estratégica', 'Destaques organizados', 'Padrão visual do feed'],
        signature: 'O perfil apresenta a empresa antes da conversa.',
      },
      {
        name: 'Perfil comercial',
        direction: 'Oferta e oportunidade',
        audience: 'Produtos, lojas e campanhas',
        description: 'Uma estrutura que combina vitrine, benefícios, ofertas e chamadas de ação sem perder identidade.',
        outcomes: ['Vitrine de soluções', 'Campanhas visuais', 'Contato em destaque'],
        signature: 'Uma presença preparada para apresentar e converter.',
      },
      {
        name: 'Perfil de especialista',
        direction: 'Conhecimento e proximidade',
        audience: 'Profissionais e marcas pessoais',
        description: 'Conteúdo, apresentação e provas organizados para fortalecer autoridade e relacionamento.',
        outcomes: ['Conteúdo educativo', 'Posicionamento pessoal', 'Provas e resultados'],
        signature: 'Autoridade construída com consistência.',
      },
    ],
  },
  content: {
    label: 'Conteúdo e campanhas',
    title: 'Linhas editoriais para comunicar com intenção',
    introduction: 'As composições mudam conforme o papel do conteúdo: ensinar, apresentar uma oferta ou conduzir um lançamento.',
    icon: Share2,
    models: [
      {
        name: 'Conteúdo de autoridade',
        direction: 'Ensinar e posicionar',
        audience: 'Especialistas e empresas',
        description: 'Publicações educativas que explicam temas, demonstram experiência e fortalecem a percepção de domínio.',
        outcomes: ['Linha editorial', 'Carrosséis educativos', 'Vídeos explicativos'],
        signature: 'Conhecimento transformado em confiança.',
      },
      {
        name: 'Conteúdo comercial',
        direction: 'Apresentar e vender',
        audience: 'Produtos e serviços',
        description: 'Peças que explicam benefícios, respondem dúvidas e conduzem o público para atendimento ou compra.',
        outcomes: ['Campanhas de oferta', 'Provas e benefícios', 'Chamadas para ação'],
        signature: 'Comunicação comercial sem parecer improvisada.',
      },
      {
        name: 'Campanha de lançamento',
        direction: 'Criar expectativa e ação',
        audience: 'Novas marcas, produtos e serviços',
        description: 'Uma sequência coordenada de apresentação, antecipação, lançamento e continuidade.',
        outcomes: ['Pré-lançamento', 'Peças principais', 'Página e atendimento conectados'],
        signature: 'Uma entrada no mercado com direção.',
      },
    ],
  },
  digital: {
    label: 'Presença digital integrada',
    title: 'Uma experiência contínua entre marca, canais e atendimento',
    introduction: 'Cada modelo representa uma arquitetura digital diferente, e não apenas uma troca de texto.',
    icon: LayoutTemplate,
    models: [
      {
        name: 'Presença institucional',
        direction: 'Apresentar e gerar confiança',
        audience: 'Empresas e serviços',
        description: 'Site, redes e atendimento com a mesma linguagem para explicar a empresa e facilitar o contato.',
        outcomes: ['Site institucional', 'Redes padronizadas', 'WhatsApp organizado'],
        signature: 'Uma empresa reconhecível em qualquer canal.',
      },
      {
        name: 'Presença comercial',
        direction: 'Atrair e converter',
        audience: 'Produtos, campanhas e serviços',
        description: 'Landing page, campanha e atendimento conectados para reduzir rupturas no caminho do cliente.',
        outcomes: ['Página comercial', 'Campanha integrada', 'Fluxo de atendimento'],
        signature: 'Da descoberta à conversa sem perder contexto.',
      },
      {
        name: 'Ecossistema da marca',
        direction: 'Operar e crescer',
        audience: 'Empresas com múltiplos canais',
        description: 'Identidade aplicada em site, portal, conteúdos, materiais e rotinas internas de comunicação.',
        outcomes: ['Sistema visual amplo', 'Canais conectados', 'Base para expansão'],
        signature: 'Uma marca preparada para evoluir com a empresa.',
      },
    ],
  },
};

interface BrandPortfolioDialogProps {
  category: BrandExampleCategory | null;
  onClose: () => void;
  onRequestBudget: () => void;
}

export function BrandExamplesDialog({ category, onClose, onRequestBudget }: BrandPortfolioDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const data = category ? portfolio[category] : null;
  const model = data?.models[selectedIndex] || null;
  const Icon = data?.icon;

  useEffect(() => {
    setSelectedIndex(0);
  }, [category]);

  const changeModel = (nextIndex: number) => {
    if (!data) return;
    setSelectedIndex((nextIndex + data.models.length) % data.models.length);
  };

  return (
    <AccessibleDialog
      isOpen={Boolean(category)}
      onClose={onClose}
      ariaLabel={data ? `Galeria de referências de ${data.label}` : 'Galeria de referências de marca'}
      overlayClassName="items-center justify-center overflow-y-auto bg-[#17120e]/88 p-3 backdrop-blur-sm sm:p-6"
      panelClassName="max-h-[92dvh] max-w-6xl overflow-hidden border border-[#8f806d] bg-[#efe8dc] shadow-[0_32px_100px_rgba(0,0,0,0.58)]"
    >
      {category && data && model && Icon && (
        <div className="flex max-h-[92dvh] min-h-0 flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="shrink-0 bg-[#211a14] p-5 text-white sm:p-6 lg:flex lg:min-h-0 lg:flex-col lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center border border-[#c8a96c]/45 text-[#d8bb7a]">
                <Icon className="h-5 w-5" />
              </span>
              <button type="button" onClick={onClose} data-dialog-autofocus aria-label="Fechar galeria" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bb7a]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 lg:mt-10">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#c8a96c]">{data.label}</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight">{data.title}</h2>
              <p className="mt-4 text-xs leading-6 text-white/55">{data.introduction}</p>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-10 lg:flex-col lg:overflow-visible" role="tablist" aria-label={`Modelos de ${data.label}`}>
              {data.models.map((item, index) => (
                <button
                  key={item.name}
                  type="button"
                  role="tab"
                  aria-selected={index === selectedIndex}
                  onClick={() => setSelectedIndex(index)}
                  className={`shrink-0 border px-3 py-2.5 text-left transition lg:w-full lg:px-4 lg:py-3 ${index === selectedIndex ? 'border-[#c8a96c] bg-[#c8a96c] text-[#211a14]' : 'border-white/12 text-white/60 hover:border-white/30 hover:text-white'}`}
                >
                  <span className="text-[9px] font-black tracking-[0.14em]">0{index + 1}</span>
                  <span className="ml-3 text-xs font-black">{item.name}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onRequestBudget();
              }}
              className="mt-5 hidden items-center justify-center gap-2 border border-[#c8a96c] px-5 py-3 text-sm font-black text-[#d8bb7a] transition hover:bg-[#c8a96c] hover:text-[#211a14] lg:mt-auto lg:inline-flex"
            >
              Solicitar análise
              <ArrowRight className="h-4 w-4" />
            </button>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4 sm:p-6 lg:p-8">
              <PortfolioPreview category={category} modelIndex={selectedIndex} signature={model.signature} />

              <div className="mt-6 grid gap-6 border-t border-[#c7b9a6] pt-6 lg:grid-cols-[1fr_0.8fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-[#b6a58e] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#70542c]">{model.direction}</span>
                    <span className="text-[10px] font-bold text-[#8a7b68]">{model.audience}</span>
                  </div>
                  <h3 className="mt-4 font-serif text-4xl font-semibold leading-tight text-[#211a14]">{model.name}</h3>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[#675d52]">{model.description}</p>
                </div>

                <div className="border-l-0 border-[#c7b9a6] lg:border-l lg:pl-6">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#7b5d31]">O que esta direção pode incluir</p>
                  <ul className="mt-4 space-y-3">
                    {model.outcomes.map((outcome) => (
                      <li key={outcome} className="flex items-start gap-2.5 text-sm font-semibold text-[#40372f]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7b5d31]" strokeWidth={3} />
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <footer className="sticky bottom-0 border-t border-[#c7b9a6] bg-[#f7f2e9]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => changeModel(selectedIndex - 1)} className="inline-flex h-10 w-10 items-center justify-center border border-[#aa9982] text-[#211a14] hover:border-[#211a14]" aria-label="Modelo anterior">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <p className="hidden text-center text-xs text-[#7e705e] sm:block">Modelo {selectedIndex + 1} de {data.models.length}. A prévia muda conforme a direção selecionada.</p>
                <button type="button" onClick={() => changeModel(selectedIndex + 1)} className="inline-flex h-10 w-10 items-center justify-center border border-[#aa9982] text-[#211a14] hover:border-[#211a14]" aria-label="Próximo modelo">
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequestBudget();
                  }}
                  className="ml-auto inline-flex items-center justify-center gap-2 bg-[#211a14] px-4 py-3 text-xs font-black text-white lg:hidden"
                >
                  Solicitar análise
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </AccessibleDialog>
  );
}

function PortfolioPreview({ category, modelIndex, signature }: { category: BrandExampleCategory; modelIndex: number; signature: string }) {
  return (
    <div className="overflow-hidden border border-[#b9ab98] bg-[#f8f4ed]">
      <div className="flex items-center justify-between gap-4 border-b border-[#cec3b4] bg-[#e6ddcf] px-4 py-2.5">
        <span className="text-[8px] font-black uppercase tracking-[0.18em] text-[#75644f]">Estudo visual demonstrativo</span>
        <span className="text-right font-serif text-xs italic text-[#75644f]">{signature}</span>
      </div>
      <div className="aspect-[16/10] min-h-[250px] sm:min-h-[330px]">
        {category === 'naming' && <NamingPreview mode={modelIndex} />}
        {category === 'identity' && <IdentityPreview mode={modelIndex} />}
        {category === 'materials' && <MaterialsPreview mode={modelIndex} />}
        {category === 'social' && <SocialPreview mode={modelIndex} />}
        {category === 'content' && <ContentPreview mode={modelIndex} />}
        {category === 'digital' && <DigitalPreview mode={modelIndex} />}
      </div>
    </div>
  );
}

function NamingPreview({ mode }: { mode: number }) {
  if (mode === 1) {
    return (
      <div className="grid h-full grid-cols-[0.85fr_1.15fr] bg-[#eee5d8]">
        <div className="flex flex-col justify-between bg-[#8f6749] p-7 text-white sm:p-10">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60">Marca autoral</span>
          <div><p className="font-serif text-5xl italic sm:text-7xl">Lívia</p><p className="mt-2 text-[9px] font-black uppercase tracking-[0.25em]">Estratégia & presença</p></div>
          <p className="text-xs leading-5 text-white/60">Nome pessoal transformado em assinatura de autoridade.</p>
        </div>
        <div className="grid grid-rows-[1fr_0.7fr] gap-4 p-6 sm:p-9">
          <div className="flex items-center justify-center border border-[#bca98c] bg-white"><p className="font-serif text-4xl text-[#4c382a] sm:text-6xl">LM</p></div>
          <div className="grid grid-cols-2 gap-4"><div className="bg-[#211a14] p-4 text-white"><span className="text-[8px] uppercase tracking-wider">Assinatura</span><p className="mt-5 font-serif text-xl">Lívia Moraes</p></div><div className="border border-[#bca98c] bg-[#d8c7aa] p-4"><span className="text-[8px] uppercase tracking-wider">Especialidade</span><p className="mt-5 font-serif text-xl">Consultoria</p></div></div>
        </div>
      </div>
    );
  }

  if (mode === 2) {
    return (
      <div className="grid h-full grid-cols-[1.15fr_0.85fr] bg-[#e8edf0]">
        <div className="flex flex-col justify-between bg-[#172b33] p-7 text-white sm:p-10">
          <div><span className="inline-block border border-[#71c8c0] px-3 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-[#8de0d8]">Nova geração</span><p className="mt-8 text-6xl font-black tracking-[-0.08em] sm:text-8xl">VORA</p><p className="mt-2 text-[9px] font-black uppercase tracking-[0.3em] text-[#8de0d8]">mover ideias</p></div>
          <p className="max-w-xs text-xs leading-5 text-white/50">Curto, digital e preparado para extensões de produto.</p>
        </div>
        <div className="grid grid-rows-3 gap-3 p-5 sm:p-8">{['VORA LAB', 'VORA FLOW', 'VORA ONE'].map((name, index) => <div key={name} className={`flex items-center justify-between border px-4 ${index === 1 ? 'border-[#172b33] bg-[#71c8c0]' : 'border-[#aab9bd] bg-white'}`}><span className="text-xl font-black tracking-tight">{name}</span><span className="text-[8px] font-black">0{index + 1}</span></div>)}</div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1.1fr_0.9fr]">
      <div className="flex flex-col justify-between bg-[#211a14] p-7 text-white sm:p-10"><div><span className="block h-1 w-12 bg-[#c8a96c]" /><p className="mt-7 font-serif text-5xl sm:text-7xl">NÁCAR</p><p className="mt-2 text-[9px] font-black uppercase tracking-[0.28em] text-[#d7bd84]">Clareza que permanece</p></div><p className="max-w-xs text-xs leading-5 text-white/45">Conceito, personalidade, assinatura e possibilidades de extensão.</p></div>
      <div className="grid grid-rows-3 gap-3 bg-[#dfd2bf] p-5 sm:p-8">{['NÁCAR', 'NÁCAR ESTÚDIO', 'NÁCAR CONSULTORIA'].map((name, index) => <div key={name} className="flex items-center justify-between border border-[#aa9678] bg-[#f7f2e9] px-4"><span className={`font-serif ${index === 0 ? 'text-2xl' : 'text-lg'}`}>{name}</span><span className="text-[8px] font-black uppercase tracking-wider text-[#8a765b]">0{index + 1}</span></div>)}</div>
    </div>
  );
}

function IdentityPreview({ mode }: { mode: number }) {
  if (mode === 1) {
    return (
      <div className="grid h-full grid-cols-[1.15fr_0.85fr] bg-[#17120e] p-5 sm:p-8">
        <div className="flex items-center justify-center border border-[#806a45]"><div className="text-center"><div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border border-[#d3b36f] font-serif text-6xl text-[#d3b36f]">É</div><p className="mt-5 font-serif text-4xl text-white">Élan</p><p className="mt-2 text-[8px] uppercase tracking-[0.3em] text-[#bba06a]">Maison contemporaine</p></div></div>
        <div className="grid grid-rows-[0.7fr_1.3fr] gap-4 pl-4"><div className="grid grid-cols-3 gap-3"><span className="bg-[#090705]" /><span className="bg-[#806a45]" /><span className="bg-[#d3b36f]" /></div><div className="flex flex-col justify-between bg-[#efe8dc] p-5"><span className="text-[8px] font-black uppercase tracking-wider">Aplicação seletiva</span><p className="font-serif text-3xl leading-tight">Presença sem excesso.</p><span className="h-1 w-14 bg-[#806a45]" /></div></div>
      </div>
    );
  }

  if (mode === 2) {
    return (
      <div className="grid h-full grid-cols-[0.85fr_1.15fr] gap-5 bg-[#f7efe4] p-5 sm:p-8">
        <div className="flex flex-col items-center justify-center rounded-[32px] bg-[#e69b82] p-6 text-[#542f29]"><div className="flex h-28 w-28 items-center justify-center rounded-[36px] bg-white font-serif text-5xl">C</div><p className="mt-5 font-serif text-4xl">Cuidar</p><p className="mt-2 text-[8px] font-black uppercase tracking-[0.22em]">saúde próxima</p></div>
        <div className="grid grid-rows-[0.6fr_1.4fr] gap-4"><div className="grid grid-cols-4 gap-3"><span className="rounded-2xl bg-[#542f29]" /><span className="rounded-2xl bg-[#e69b82]" /><span className="rounded-2xl bg-[#f2c9a8]" /><span className="rounded-2xl border border-[#d8c4af] bg-white" /></div><div className="grid grid-cols-2 gap-4"><div className="rounded-[24px] bg-white p-5"><p className="font-serif text-2xl">Olá, vamos cuidar?</p><div className="mt-5 h-8 rounded-full bg-[#542f29]" /><div className="mt-3 h-8 rounded-full bg-[#f0dfd0]" /></div><div className="flex flex-col justify-between rounded-[24px] bg-[#f2c9a8] p-5"><span className="text-[8px] font-black uppercase">Linguagem humana</span><p className="font-serif text-2xl">Clara. Leve. Próxima.</p></div></div></div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[0.9fr_1.1fr] gap-4 bg-[#eee6da] p-5 sm:p-8"><div className="flex items-center justify-center bg-[#211a14]"><div className="flex h-28 w-28 items-center justify-center rounded-full border border-[#c8a96c] font-serif text-5xl text-[#d8bb7a]">A</div></div><div className="grid grid-rows-[0.75fr_1.25fr] gap-4"><div className="grid grid-cols-4 gap-3"><span className="bg-[#211a14]" /><span className="bg-[#8f6749]" /><span className="bg-[#c8a96c]" /><span className="border border-[#cabda9] bg-[#f8f4ed]" /></div><div className="grid grid-cols-2 gap-4"><div className="bg-white p-5"><p className="font-serif text-3xl">Aurea</p><span className="mt-3 block h-1.5 w-4/5 bg-[#d8d0c5]" /><span className="mt-2 block h-1.5 w-full bg-[#e7e1d9]" /></div><div className="flex flex-col justify-between bg-[#c8a96c] p-5"><span className="text-[8px] font-black uppercase tracking-wider">Aplicação</span><p className="font-serif text-2xl leading-tight">Forma com intenção.</p></div></div></div></div>
  );
}

function MaterialsPreview({ mode }: { mode: number }) {
  if (mode === 1) {
    return (
      <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-5 bg-[#e9e1d6] p-6 sm:p-9"><div className="flex items-center justify-center"><div className="h-[86%] w-[72%] rounded-[22px] border-4 border-[#211a14] bg-white p-3 shadow-xl"><div className="mx-auto h-1.5 w-12 rounded bg-[#d6cec2]" /><div className="mt-4 rounded-xl bg-[#211a14] p-4 text-white"><p className="text-[8px] uppercase tracking-wider text-[#d8bb7a]">Cartão digital</p><p className="mt-3 font-serif text-2xl">Atendimento</p></div><div className="mt-3 space-y-2">{['WhatsApp', 'E-mail', 'Formulário'].map((item) => <div key={item} className="rounded-lg border border-[#ddd4c8] px-3 py-2 text-[9px] font-bold">{item}</div>)}</div></div></div><div className="grid grid-rows-[0.8fr_1.2fr] gap-4"><div className="border border-[#b9aa95] bg-white p-5"><span className="text-[8px] font-black uppercase tracking-wider">Assinatura de e-mail</span><div className="mt-5 flex items-center gap-4"><div className="h-12 w-12 rounded-full bg-[#8f6749]" /><div className="flex-1"><span className="block h-2 w-24 bg-[#211a14]" /><span className="mt-2 block h-1.5 w-36 bg-[#d8d0c5]" /><span className="mt-2 block h-1.5 w-28 bg-[#e5dfd6]" /></div></div></div><div className="grid grid-cols-2 gap-4"><div className="bg-[#211a14] p-5 text-white"><span className="text-[8px] uppercase tracking-wider text-[#d8bb7a]">WhatsApp</span><p className="mt-6 font-serif text-2xl">Olá, como podemos ajudar?</p></div><div className="border border-[#b9aa95] bg-[#cdb790] p-5"><span className="text-[8px] uppercase tracking-wider">Formulário</span><div className="mt-5 space-y-3"><span className="block h-6 bg-white/70" /><span className="block h-6 bg-white/70" /><span className="block h-8 bg-[#211a14]" /></div></div></div></div></div>
    );
  }

  if (mode === 2) {
    return (
      <div className="relative h-full overflow-hidden bg-[#d9dde0] p-6 sm:p-10"><div className="absolute left-[7%] top-[10%] h-[72%] w-[38%] -rotate-2 border border-[#aab0b4] bg-white p-5 shadow-xl"><span className="text-[8px] font-black uppercase tracking-wider text-[#50606a]">Manual interno</span><p className="mt-6 font-serif text-3xl">Guia da marca</p><div className="mt-6 grid grid-cols-3 gap-2"><span className="h-16 bg-[#20343d]" /><span className="h-16 bg-[#708992]" /><span className="h-16 bg-[#d0a96f]" /></div><div className="mt-5 space-y-2"><span className="block h-1.5 bg-[#d9dde0]" /><span className="block h-1.5 w-4/5 bg-[#e4e7e9]" /></div></div><div className="absolute right-[8%] top-[18%] h-[62%] w-[42%] rotate-2 bg-[#20343d] p-6 text-white shadow-xl"><span className="text-[8px] font-black uppercase tracking-wider text-[#d0a96f]">Documento oficial</span><p className="mt-7 font-serif text-3xl">Padrões para toda a equipe.</p><div className="mt-8 grid grid-cols-2 gap-3"><div className="h-20 bg-white/10" /><div className="h-20 bg-[#d0a96f]" /></div></div></div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#d8c7aa] p-6 sm:p-10"><div className="absolute left-[8%] top-[12%] h-[68%] w-[42%] -rotate-3 border border-[#a38d69] bg-white p-5 shadow-xl"><span className="block h-2 w-14 bg-[#211a14]" /><p className="mt-6 font-serif text-3xl">Proposta comercial</p><span className="mt-5 block h-1.5 w-full bg-[#ded7cc]" /><span className="mt-2 block h-1.5 w-4/5 bg-[#e9e4dc]" /><div className="mt-8 h-20 bg-[#211a14]" /></div><div className="absolute bottom-[10%] right-[9%] h-[54%] w-[44%] rotate-3 border border-[#a38d69] bg-[#211a14] p-5 text-white shadow-xl"><span className="text-[8px] font-black uppercase tracking-wider text-[#c8a96c]">Apresentação</span><p className="mt-6 font-serif text-3xl">Sua marca em cada detalhe.</p><div className="mt-8 grid grid-cols-3 gap-2"><span className="h-12 bg-white/10" /><span className="h-12 bg-[#c8a96c]" /><span className="h-12 bg-white/10" /></div></div></div>
  );
}

function SocialPreview({ mode }: { mode: number }) {
  const profile = mode === 1 ? 'LOJA NOVA' : mode === 2 ? 'DRA. HELENA' : 'NORTE CONSULTORIA';
  const base = mode === 1 ? '#6b3148' : mode === 2 ? '#315c58' : '#211a14';
  const accent = mode === 1 ? '#efb053' : mode === 2 ? '#c4d8b8' : '#c8a96c';
  const cards = mode === 1 ? ['OFERTA', 'PRODUTO', 'NOVO', 'BENEFÍCIO', 'COMPRE', 'DESTAQUE'] : mode === 2 ? ['GUIA', 'DICA', 'MITO', 'CASO', 'AULA', 'PERGUNTA'] : ['SERVIÇO', 'EQUIPE', 'VALOR', 'PROJETO', 'MÉTODO', 'CONTATO'];

  return (
    <div className="grid h-full grid-cols-[0.7fr_1.3fr] gap-5 bg-[#e7ded1] p-5 sm:p-8"><div className="flex flex-col border border-[#bba98f] bg-white p-4"><div className="mx-auto h-14 w-14 rounded-full" style={{ backgroundColor: base }} /><p className="mx-auto mt-3 text-center text-[9px] font-black">{profile}</p><span className="mx-auto mt-2 h-1.5 w-32 bg-[#e4ddd3]" /><div className="mt-5 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((item) => <span key={item} className="aspect-square rounded-full border" style={{ borderColor: base }} />)}</div><div className="mt-5 h-8" style={{ backgroundColor: base }} /></div><div className="grid grid-cols-3 gap-2">{cards.map((item, index) => <div key={item} className="p-3 text-white" style={{ backgroundColor: index === 1 || index === 4 ? accent : index === 2 ? '#8f6749' : base, color: index === 1 || index === 4 ? '#211a14' : 'white' }}><span className="text-[7px] font-black uppercase tracking-wider">{item}</span><span className="mt-4 block h-2 w-4/5 bg-current opacity-80" /><span className="mt-2 block h-1 w-full bg-current opacity-30" /></div>)}</div></div>
  );
}

function ContentPreview({ mode }: { mode: number }) {
  if (mode === 1) {
    return (
      <div className="grid h-full grid-cols-[1.1fr_0.9fr] bg-[#f1dfcc] p-5 sm:p-8"><div className="flex flex-col justify-between bg-[#8b2f3f] p-6 text-white"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#f3c56a]">Campanha comercial</span><div><p className="font-serif text-5xl leading-none sm:text-7xl">30%</p><p className="mt-3 text-xl font-black">Uma condição para agir agora.</p></div><div className="h-9 w-32 bg-[#f3c56a]" /></div><div className="grid grid-rows-3 gap-3 pl-4">{['BENEFÍCIO', 'PROVA', 'CHAMADA'].map((item, index) => <div key={item} className={`${index === 1 ? 'bg-[#f3c56a] text-[#41151c]' : 'bg-white text-[#8b2f3f]'} flex items-center justify-between border border-[#d7b8a4] px-4`}><span className="text-xs font-black">{item}</span><span className="text-[8px] font-black">0{index + 1}</span></div>)}</div></div>
    );
  }

  if (mode === 2) {
    return (
      <div className="grid h-full grid-cols-4 bg-[#182c36] p-5 sm:p-8">{[['01', 'ANTECIPAR'], ['02', 'REVELAR'], ['03', 'LANÇAR'], ['04', 'CONTINUAR']].map(([number, title], index) => <div key={number} className={`flex flex-col justify-between border-r border-white/15 p-4 last:border-r-0 sm:p-5 ${index === 2 ? 'bg-[#d0a96f] text-[#182c36]' : 'text-white'}`}><span className={`text-[10px] font-black ${index === 2 ? 'text-[#182c36]' : 'text-[#d0a96f]'}`}>{number}</span><div><p className="font-serif text-xl sm:text-3xl">{title}</p><span className={`mt-4 block h-1.5 w-4/5 ${index === 2 ? 'bg-[#182c36]/35' : 'bg-white/25'}`} /><span className={`mt-2 block h-1.5 w-full ${index === 2 ? 'bg-[#182c36]/20' : 'bg-white/15'}`} /></div></div>)}</div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[0.95fr_1.05fr] bg-[#e7ded1] p-5 sm:p-8"><div className="flex flex-col justify-between bg-[#211a14] p-6 text-white"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#c8a96c]">Conteúdo de autoridade</span><p className="font-serif text-4xl leading-tight sm:text-5xl">Explicar bem também é uma forma de liderar.</p><span className="text-xs text-white/50">Conhecimento organizado em uma sequência editorial.</span></div><div className="grid grid-rows-3 gap-3 pl-4">{['01 — CONTEXTO', '02 — EXPLICAÇÃO', '03 — APLICAÇÃO'].map((item, index) => <div key={item} className={`${index === 1 ? 'bg-[#c8a96c]' : 'bg-white'} border border-[#bba98f] p-4`}><span className="text-[8px] font-black uppercase tracking-wider">{item}</span><span className="mt-4 block h-2 w-3/4 bg-[#211a14]" /><span className="mt-2 block h-1.5 w-full bg-[#d8d0c5]" /></div>)}</div></div>
  );
}

function DigitalPreview({ mode }: { mode: number }) {
  if (mode === 1) {
    return (
      <div className="grid h-full grid-cols-[1.25fr_0.75fr] gap-5 bg-[#eadcc9] p-5 sm:p-8"><BrowserShell><div className="flex h-full flex-col bg-white"><div className="flex items-center justify-between bg-[#7b2d3e] px-5 py-4 text-white"><span className="text-xs font-black">NOVA COLEÇÃO</span><span className="rounded-full bg-[#f0b85a] px-3 py-1 text-[8px] font-black text-[#3d1520]">COMPRAR</span></div><div className="grid flex-1 grid-cols-[1.1fr_0.9fr]"><div className="flex flex-col justify-center bg-[#f7eadb] p-6"><span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#7b2d3e]">Campanha integrada</span><p className="mt-4 font-serif text-4xl leading-tight text-[#421a24]">Descubra. Deseje. Converse.</p><div className="mt-5 h-8 w-28 bg-[#7b2d3e]" /></div><div className="bg-[#f0b85a] p-5"><div className="h-full border border-[#7b2d3e]/30 bg-white/35" /></div></div><div className="grid grid-cols-3 gap-3 p-4">{['Oferta', 'Prova', 'Contato'].map((item) => <div key={item} className="border border-[#dfcbb6] p-3 text-[8px] font-black uppercase text-[#7b2d3e]">{item}</div>)}</div></div></BrowserShell><div className="grid grid-rows-[1fr_0.8fr] gap-4"><div className="bg-[#7b2d3e] p-5 text-white"><span className="text-[8px] uppercase tracking-wider text-[#f0b85a]">Campanha social</span><p className="mt-5 font-serif text-3xl">A mesma oferta em cada canal.</p></div><div className="border border-[#cbb79e] bg-white p-4"><span className="text-[8px] font-black uppercase text-[#7b2d3e]">Atendimento</span><div className="mt-4 space-y-2"><div className="ml-auto h-7 w-3/4 rounded-xl bg-[#f0b85a]" /><div className="h-7 w-4/5 rounded-xl bg-[#eadcc9]" /><div className="ml-auto h-7 w-1/2 rounded-xl bg-[#7b2d3e]" /></div></div></div></div>
    );
  }

  if (mode === 2) {
    const nodes = ['SITE', 'PORTAL', 'SOCIAL', 'CONTEÚDO', 'ATENDIMENTO'];
    return (
      <div className="relative h-full overflow-hidden bg-[#172a33] p-5 text-white sm:p-8"><div className="absolute inset-x-[12%] top-1/2 h-px bg-[#6e8e96]/45" /><div className="absolute bottom-[15%] left-1/2 top-[15%] w-px bg-[#6e8e96]/45" /><div className="relative grid h-full grid-cols-[0.8fr_1.2fr_0.8fr] grid-rows-2 gap-5"><NodeCard label={nodes[0]} detail="Apresentação" /><div className="row-span-2 flex items-center justify-center"><div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border border-[#d0a96f] bg-[#203943] text-center shadow-2xl"><span className="text-[8px] font-black uppercase tracking-[0.2em] text-[#d0a96f]">Ecossistema</span><p className="mt-2 font-serif text-2xl">MARCA</p><span className="mt-3 h-1 w-10 bg-[#d0a96f]" /></div></div><NodeCard label={nodes[1]} detail="Relacionamento" /><NodeCard label={nodes[2]} detail="Descoberta" /><NodeCard label={nodes[3]} detail="Consistência" /><div className="absolute bottom-0 left-1/2 -translate-x-1/2"><div className="border border-[#6e8e96] bg-[#203943] px-5 py-3 text-center"><span className="text-[8px] font-black uppercase tracking-wider text-[#d0a96f]">ATENDIMENTO</span><p className="mt-1 text-xs">continuidade do contexto</p></div></div></div></div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1.15fr_0.85fr] gap-5 bg-[#ddd2c2] p-5 sm:p-8"><BrowserShell><div className="flex h-full flex-col bg-white"><div className="flex-1 bg-[#211a14] p-6 text-white"><span className="block h-1 w-10 bg-[#c8a96c]" /><p className="mt-5 font-serif text-4xl">Uma presença que parece inteira.</p><span className="mt-5 block h-7 w-28 bg-[#c8a96c]" /></div><div className="grid grid-cols-3 gap-3 p-4">{[0, 1, 2].map((item) => <div key={item} className="border border-[#ddd4c8] p-3"><span className="block h-4 w-4 bg-[#8f6749]" /><span className="mt-3 block h-1.5 w-full bg-[#d7d0c7]" /></div>)}</div></div></BrowserShell><div className="flex items-center justify-center"><PhoneShell><div className="mt-4 h-20 bg-[#211a14]" /><div className="mt-3 grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((item) => <div key={item} className="aspect-square bg-[#ece5da] p-2"><span className="block h-3 w-3 bg-[#8f6749]" /></div>)}</div><div className="mt-3 h-7 bg-[#c8a96c]" /></PhoneShell></div></div>
  );
}

function BrowserShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden border border-[#a89578] bg-white"><div className="flex h-7 items-center gap-1.5 border-b border-[#ddd4c8] bg-[#f4efe7] px-3"><span className="h-1.5 w-1.5 rounded-full bg-[#bbb0a1]" /><span className="h-1.5 w-1.5 rounded-full bg-[#bbb0a1]" /><span className="h-1.5 w-1.5 rounded-full bg-[#bbb0a1]" /></div><div className="h-[calc(100%_-_1.75rem)]">{children}</div></div>
  );
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return <div className="h-[88%] w-[72%] rounded-[20px] border-4 border-[#211a14] bg-white p-3 shadow-xl"><div className="mx-auto h-1.5 w-12 rounded bg-[#d6cec2]" />{children}</div>;
}

function NodeCard({ label, detail }: { label: string; detail: string }) {
  return <div className="flex items-center justify-center"><div className="min-w-[110px] border border-[#6e8e96] bg-[#203943] px-4 py-4 text-center"><span className="text-[8px] font-black uppercase tracking-wider text-[#d0a96f]">{label}</span><p className="mt-1 text-[10px] text-white/55">{detail}</p></div></div>;
}

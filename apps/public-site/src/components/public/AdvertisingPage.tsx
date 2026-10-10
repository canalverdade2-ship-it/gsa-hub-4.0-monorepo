import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Image as ImageIcon,
  LayoutGrid,
  LockKeyhole,
  Megaphone,
  MonitorSmartphone,
  MousePointerClick,
  PlayCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routing/routeCatalog';
import type { AdvertisingFormat } from '../../types/advertising';
import { validarCNPJ, validarCPF } from '../../utils/cpfValidator';
import { copyToClipboard, handleCurrencyInputChange, maskCNPJ, maskCPF, maskCurrency, maskPhone } from '../../lib/utils';
import { PrivacyPolicyDialog } from './PrivacyPolicyDialog';
import { PublicHeader } from './final/PublicHeader';

type FormatItem = {
  id: AdvertisingFormat;
  title: string;
  description: string;
  preview: string;
};

type PlacementItem = {
  code: string;
  label: string;
  short: string;
  preview: string;
};

type CreativeReference = {
  id: string;
  label: string;
  description: string;
};

type PreviewState =
  | { kind: 'format'; id: AdvertisingFormat }
  | { kind: 'placement'; id: string; selectionMode: 'preview' | 'confirm' }
  | { kind: 'creative' }
  | null;

const FORMATS: FormatItem[] = [
  {
    id: 'responsive_banner',
    title: 'Banner responsivo',
    description: 'Faixa horizontal adaptada ao celular e ao computador.',
    preview: 'Uma faixa publicitária que reorganiza texto, imagem e chamada conforme o tamanho da tela.',
  },
  {
    id: 'sponsored_card',
    title: 'Card patrocinado',
    description: 'Presença integrada às vitrines e listagens do portal.',
    preview: 'Um card identificado como patrocinado, inserido junto ao conteúdo ou aos produtos.',
  },
  {
    id: 'rectangle',
    title: 'Retângulo ou lateral',
    description: 'Bloco visual para áreas de leitura e navegação.',
    preview: 'Um anúncio retangular que acompanha uma área de leitura sem interromper o conteúdo.',
  },
  {
    id: 'hero',
    title: 'Destaque principal',
    description: 'Campanha premium em área de alta visibilidade.',
    preview: 'Uma composição ampla para lançamentos, campanhas institucionais e mensagens prioritárias.',
  },
  {
    id: 'inline_video',
    title: 'Vídeo no conteúdo',
    description: 'Vídeo responsivo com controles e medição.',
    preview: 'Um player integrado ao fluxo da página, com controles e acompanhamento de eventos.',
  },
  {
    id: 'section_sponsorship',
    title: 'Patrocínio de seção',
    description: 'Marca associada a uma página ou módulo.',
    preview: 'A marca acompanha visualmente uma seção específica durante o período contratado.',
  },
  {
    id: 'sponsored_content',
    title: 'Conteúdo patrocinado',
    description: 'Publicação dedicada à mensagem da campanha.',
    preview: 'Uma publicação identificada como patrocinada, com contexto, benefícios e chamada para ação.',
  },
  {
    id: 'lightbox',
    title: 'Lightbox controlado',
    description: 'Formato especial com fechamento imediato.',
    preview: 'Uma janela em primeiro plano, com frequência controlada e botão de fechamento imediato.',
  },
];

const PLACEMENTS: PlacementItem[] = [
  {
    code: 'HOME_BANNER_TOP',
    label: 'Página inicial — banner superior',
    short: 'Banner superior',
    preview: 'Faixa localizada logo abaixo da navegação principal da página inicial.',
  },
  {
    code: 'HOME_INLINE_01',
    label: 'Página inicial — dentro do conteúdo',
    short: 'Dentro do conteúdo',
    preview: 'Campanha inserida entre blocos da página inicial, integrada ao fluxo de leitura.',
  },
  {
    code: 'HOME_LIGHTBOX',
    label: 'Página inicial — exibição especial',
    short: 'Exibição especial',
    preview: 'Anúncio em primeiro plano sobre uma simulação da página inicial, com fechamento imediato.',
  },
  {
    code: 'SITE_STICKY_BOTTOM',
    label: 'Portal — banner inferior fixo',
    short: 'Banner inferior',
    preview: 'Faixa fixa na parte inferior, sem encobrir a área principal da página.',
  },
  {
    code: 'MARKETPLACE_SPONSORED_CARD',
    label: 'Marketplace — card patrocinado',
    short: 'Card no Marketplace',
    preview: 'Card patrocinado exibido junto aos produtos e serviços da vitrine.',
  },
  {
    code: 'CLASSIFIEDS_BANNER_TOP',
    label: 'Classificados — banner superior',
    short: 'Banner nos Classificados',
    preview: 'Faixa publicitária no topo da área de classificados, próxima à pesquisa do visitante.',
  },
  {
    code: 'ADS_PUBLIC_SHOWCASE',
    label: 'Página de anunciantes — card institucional',
    short: 'Card institucional',
    preview: 'Card de apresentação da marca, com mensagem e chamada para ação.',
  },
];

const CREATIVE_REFERENCES: CreativeReference[] = [
  {
    id: 'institutional-clean',
    label: 'Institucional limpo',
    description: 'Visual sóbrio, elegante e orientado à confiança.',
  },
  {
    id: 'commercial-offer',
    label: 'Oferta comercial',
    description: 'Ênfase em condição, benefício e chamada direta.',
  },
  {
    id: 'product-focus',
    label: 'Produto em destaque',
    description: 'Produto ou serviço como elemento principal.',
  },
  {
    id: 'launch-campaign',
    label: 'Campanha de lançamento',
    description: 'Visual de impacto para novidade, evento ou abertura.',
  },
];

const PROCESS = [
  ['01', 'Briefing', 'Objetivo, período, formatos e investimento.'],
  ['02', 'Análise', 'Disponibilidade e adequação comercial.'],
  ['03', 'Proposta', 'Escopo e condições antes do pagamento.'],
  ['04', 'Veiculação', 'Publicação aprovada e acompanhamento.'],
];

const INITIAL_FORM = {
  company_name: '',
  document: '',
  company_size: '',
  segment: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  objective: '',
  desired_formats: [] as AdvertisingFormat[],
  desired_pages: [] as string[],
  devices: ['desktop', 'mobile'] as string[],
  desired_start_date: '',
  desired_end_date: '',
  intended_budget: '',
  needs_creative_service: false,
  notes: '',
  website_confirmation: '',
};

interface AdvertisingPageProps {
  mode?: 'showcase' | 'advertise';
  onBack: () => void;
  onLogin?: () => void;
}

const inputClass =
  'mt-2 w-full rounded-lg border border-[#cfd4d8] bg-white px-3.5 py-3 text-sm text-[#17202a] outline-none transition placeholder:text-[#87919a] focus:border-[#9a7939] focus:ring-2 focus:ring-[#c7a458]/20';
const sectionTitleClass = 'text-lg font-extrabold tracking-[-0.015em] text-[#17202a]';

function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? validarCPF(digits) : digits.length === 14 && validarCNPJ(digits);
}

function maskDocument(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits.length <= 11 ? maskCPF(digits) : maskCNPJ(digits);
}

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^https?:\/\//i, '')}`;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Não foi possível enviar a solicitação. Nenhum protocolo foi criado.';
}

export function AdvertisingPage({ mode = 'showcase', onBack, onLogin }: AdvertisingPageProps) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [creativeReference, setCreativeReference] = useState<CreativeReference | null>(null);
  const [pendingCreativeReference, setPendingCreativeReference] = useState<CreativeReference | null>(null);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const today = todayLocal();

  useEffect(() => {
    if (mode === 'advertise') {
      window.requestAnimationFrame(() => {
        document.getElementById('formulario-anunciante')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [mode]);

  useEffect(() => {
    if (!preview) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPendingCreativeReference(creativeReference);
      setPreview(null);
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
    };
  }, [preview, creativeReference]);

  const closePreview = () => {
    setPendingCreativeReference(creativeReference);
    setPreview(null);
  };

  const toggle = (field: 'desired_formats' | 'desired_pages' | 'devices', value: string) => {
    setForm((current) => {
      const values = current[field] as string[];
      return {
        ...current,
        [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      };
    });
  };

  const openCreativePreview = () => {
    setPendingCreativeReference(creativeReference);
    setPreview({ kind: 'creative' });
  };

  const handleCreativeService = (checked: boolean) => {
    setForm((current) => ({ ...current, needs_creative_service: checked }));
    if (checked) {
      openCreativePreview();
      return;
    }
    setCreativeReference(null);
    setPendingCreativeReference(null);
    if (preview?.kind === 'creative') setPreview(null);
  };

  const confirmCreativeReference = () => {
    if (!pendingCreativeReference) {
      toast.error('Escolha uma direção visual antes de confirmar.');
      return;
    }
    setCreativeReference(pendingCreativeReference);
    setForm((current) => ({ ...current, needs_creative_service: true }));
    setPreview(null);
    toast.success('Direção visual escolhida com sucesso.');
  };

  const handlePlacementSelection = (code: string) => {
    if (form.desired_pages.includes(code)) {
      setForm((current) => ({
        ...current,
        desired_pages: current.desired_pages.filter((item) => item !== code),
      }));
      toast.success('Área de interesse removida.');
      return;
    }
    setPreview({ kind: 'placement', id: code, selectionMode: 'confirm' });
  };

  const confirmPlacementSelection = (code: string) => {
    setForm((current) => ({
      ...current,
      desired_pages: current.desired_pages.includes(code)
        ? current.desired_pages
        : [...current.desired_pages, code],
    }));
    setPreview(null);
    toast.success('Área de interesse selecionada com sucesso.');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.company_name.trim().length < 2) return toast.error('Informe o nome ou razão social.');
    if (!isValidDocument(form.document)) return toast.error('Informe um CPF ou CNPJ válido.');
    if (!form.company_size) return toast.error('Selecione o porte da empresa.');
    if (form.segment.trim().length < 2) return toast.error('Informe o segmento.');
    if (form.contact_name.trim().length < 2) return toast.error('Informe o responsável pelo contato.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) return toast.error('Informe um e-mail válido.');
    if (form.contact_phone.replace(/\D/g, '').length < 10) return toast.error('Informe telefone com DDD.');
    if (form.objective.trim().length < 3) return toast.error('Informe o objetivo da campanha.');
    if (!form.desired_formats.length) return toast.error('Selecione ao menos um formato.');
    if (!form.desired_pages.length) return toast.error('Selecione ao menos uma posição.');
    if (!form.devices.length) return toast.error('Selecione ao menos um dispositivo.');
    const budget = Number(form.intended_budget);
    if (!Number.isFinite(budget) || budget <= 0) return toast.error('Informe um investimento válido.');
    if (!privacyAccepted) return toast.error('Aceite a política de privacidade para continuar.');
    if (form.desired_start_date && form.desired_start_date < today) {
      return toast.error('A data inicial deve ser atual ou futura.');
    }
    if (form.desired_end_date && !form.desired_start_date) {
      return toast.error('Informe a data inicial antes da final.');
    }
    if (
      form.desired_start_date &&
      form.desired_end_date &&
      form.desired_end_date < form.desired_start_date
    ) {
      return toast.error('A data final não pode ser anterior à inicial.');
    }

    const elapsed = Date.now() - Date.parse(startedAt);
    if (elapsed < 2500) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500 - elapsed));
    }
    const referenceNote = creativeReference
      ? `Referência de material criativo escolhida: ${creativeReference.label} [${creativeReference.id}].`
      : '';
    const notes = [referenceNote, form.notes.trim()].filter(Boolean).join('\n\n').slice(0, 2000);

    setSubmitting(true);
    setProtocol(null);

    const requestPayload = {
      company_name: form.company_name.trim(),
      document: form.document,
      company_size: form.company_size,
      segment: form.segment.trim(),
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim().toLowerCase(),
      contact_phone: form.contact_phone,
      website: normalizeWebsite(form.website),
      objective: form.objective.trim(),
      desired_formats: form.desired_formats,
      desired_pages: form.desired_pages,
      devices: form.devices,
      desired_start_date: form.desired_start_date,
      desired_end_date: form.desired_end_date,
      intended_budget: budget,
      needs_creative_service: form.needs_creative_service,
      notes,
      website_confirmation: form.website_confirmation,
      started_at: startedAt,
      source_metadata: {
        pathname: window.location.pathname,
        referrer: document.referrer || '',
        utm_source: new URLSearchParams(window.location.search).get('utm_source') || '',
      },
    };

    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        protocol?: string;
        error?: string;
      }>('gsa-ads-public', { body: requestPayload });

      if (error) throw error;
      if (!data?.success || !data.protocol) {
        throw new Error(data?.error || 'O servidor não confirmou a gravação da solicitação.');
      }
      const createdProtocol = data.protocol;

      setProtocol(createdProtocol);
      setForm(INITIAL_FORM);
      setCreativeReference(null);
      setPendingCreativeReference(null);
      setPrivacyAccepted(false);
      setStartedAt(new Date().toISOString());
      toast.success('Solicitação gravada com sucesso no sistema GSA.');
      window.requestAnimationFrame(() => {
        document.getElementById('confirmacao-anuncio')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } catch (error) {
      console.error('Falha ao enviar solicitação de anúncio:', error);
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const copyProtocol = async () => {
    if (!protocol) return;
    const copied = await copyToClipboard(protocol);
    copied ? toast.success('Protocolo copiado.') : toast.error('Não foi possível copiar o protocolo.');
  };

  const format = preview?.kind === 'format' ? FORMATS.find((item) => item.id === preview.id) : null;
  const placement = preview?.kind === 'placement' ? PLACEMENTS.find((item) => item.code === preview.id) : null;
  const placementNeedsConfirmation = preview?.kind === 'placement' && preview.selectionMode === 'confirm';

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f2ec] text-[#17202a]">
      <PublicHeader currentPage="ads" onClientLogin={onLogin} />

      <section className="relative overflow-hidden border-b border-[#d6d0c5] bg-[#0f1f2d] text-white">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-[#c7a458]" />
        <div className="relative mx-auto max-w-7xl px-6 pb-16 pt-10 sm:px-10 lg:px-12 lg:pb-24 lg:pt-14">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 hover:text-[#e2c778]"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao site
          </button>
          <div className="mx-auto mt-14 max-w-4xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.23em] text-[#d7b96e]">Anuncie Conosco</p>
            <h1 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Visualize sua campanha antes mesmo de solicitar a proposta.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Explore formatos, simule posições e envie um briefing claro para a equipe comercial da GSA.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => document.getElementById('formulario-anunciante')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#d6ba72] px-6 py-3 text-sm font-black text-[#14202a] hover:bg-[#e0c77f]"
              >
                Quero anunciar <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={routes.login.advertiser()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/25 px-6 py-3 text-sm font-bold hover:border-[#d7b96e] hover:text-[#f1d992]"
              >
                <LockKeyhole className="h-4 w-4" /> Área do anunciante
              </a>
            </div>
          </div>
          <ol className="mt-14 grid overflow-hidden border border-white/12 bg-white/[0.035] md:grid-cols-4">
            {PROCESS.map(([number, title, text], index) => (
              <li
                key={number}
                className={`px-5 py-6 ${index ? 'border-t border-white/10 md:border-l md:border-t-0' : ''}`}
              >
                <span className="font-mono text-xs font-black text-[#d7b96e]">{number}</span>
                <h2 className="mt-3 text-base font-extrabold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-[#d8d2c7] bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 lg:px-12 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#806128]">Possibilidades de presença</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Clique em cada espaço para visualizar uma simulação.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#65707a]">
              Os exemplos são ilustrativos. A disponibilidade e a composição final serão definidas na proposta.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden border border-[#d8dcdf] bg-[#d8dcdf] sm:grid-cols-2 lg:grid-cols-4">
            {PLACEMENTS.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setPreview({ kind: 'placement', id: item.code, selectionMode: 'preview' })}
                className="group min-h-40 bg-white p-5 text-left hover:bg-[#fbf7ed]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d5c59c] bg-[#f8f3e7] text-[#806128]">
                  <MousePointerClick className="h-4 w-4" />
                </span>
                <strong className="mt-5 block text-base font-extrabold">{item.short}</strong>
                <span className="mt-2 block text-sm leading-6 text-[#6e7982]">{item.preview}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.1em] text-[#806128]">
                  Ver prévia <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
            <div className="flex min-h-40 flex-col justify-between bg-[#10202e] p-5 text-white">
              <ShieldCheck className="h-6 w-6 text-[#d7b96e]" />
              <div>
                <strong className="text-base font-extrabold">Proposta antes do pagamento</strong>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Nenhuma campanha é publicada sem confirmação financeira e aprovação do material.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="formulario-anunciante" className="scroll-mt-20 bg-[#f5f2ec]">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 lg:px-12 lg:py-24">
          <div className="mb-10 max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#806128]">Solicitação comercial</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Conte-nos o que sua empresa pretende divulgar.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#65707a]">
              O envio não gera cobrança. Use as prévias para escolher formatos e posições com mais segurança.
            </p>
          </div>

          <div className="grid overflow-hidden border border-[#cfd4d8] bg-white shadow-[0_28px_70px_rgba(36,44,51,0.10)] lg:grid-cols-[0.31fr_0.69fr]">
            <aside className="bg-[#10202e] px-6 py-8 text-white sm:px-8 lg:px-9 lg:py-10">
              <div className="lg:sticky lg:top-28">
                <Megaphone className="h-7 w-7 text-[#d7b96e]" />
                <h3 className="mt-5 text-2xl font-black">Antes de enviar</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Tenha em mãos os dados da empresa e uma estimativa do período e investimento.
                </p>
                <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
                  {[
                    { icon: Building2, text: 'Dados cadastrais da empresa' },
                    { icon: Target, text: 'Objetivo principal da campanha' },
                    { icon: CalendarDays, text: 'Período estimado de veiculação' },
                    { icon: LayoutGrid, text: 'Formatos e áreas de interesse' },
                  ].map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-3 py-4 text-sm text-slate-200">
                      <Icon className="mt-0.5 h-4 w-4 text-[#d7b96e]" />
                      {text}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-sm font-extrabold">
                    <FileCheck2 className="h-4 w-4 text-[#d7b96e]" /> Registro confirmado
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    O protocolo só aparece após a confirmação real no banco.
                  </p>
                </div>
              </div>
            </aside>

            <form onSubmit={submit} className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10" noValidate>
              {protocol && (
                <div id="confirmacao-anuncio" className="mb-9 border border-[#8cb89b] bg-[#eef7f1] p-5">
                  <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f6a3d] text-white">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-extrabold text-[#174f2e]">Solicitação confirmada</h3>
                      <p className="mt-1 text-sm text-[#3f6650]">Guarde o protocolo para acompanhar a proposta.</p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <div className="flex flex-1 items-center justify-between border border-[#b7d2c0] bg-white px-4 py-3 font-mono text-sm font-black text-[#174f2e]">
                          <span className="truncate">{protocol}</span>
                          <button type="button" onClick={() => void copyProtocol()} aria-label="Copiar protocolo">
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        <a
                          href={`${routes.login.advertiser()}?protocolo=${encodeURIComponent(protocol)}`}
                          className="inline-flex items-center justify-center gap-2 bg-[#174f2e] px-4 py-3 text-sm font-extrabold text-white"
                        >
                          Acessar portal <ChevronRight className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-10">
                <FormSection
                  number="1"
                  id="dados-empresa"
                  title="Dados da empresa"
                  subtitle="Identificação de quem pretende contratar a campanha."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Empresa ou razão social" required className="sm:col-span-2">
                      <input
                        value={form.company_name}
                        onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="CPF ou CNPJ" required>
                      <input
                        inputMode="numeric"
                        value={form.document}
                        onChange={(event) => setForm({ ...form, document: maskDocument(event.target.value) })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Porte" required>
                      <select
                        value={form.company_size}
                        onChange={(event) => setForm({ ...form, company_size: event.target.value })}
                        className={inputClass}
                      >
                        <option value="">Selecione</option>
                        <option value="autonomo">Autônomo</option>
                        <option value="mei">MEI</option>
                        <option value="micro">Microempresa</option>
                        <option value="pequena">Pequena empresa</option>
                        <option value="media">Média empresa</option>
                        <option value="grande">Grande empresa</option>
                      </select>
                    </Field>
                    <Field label="Segmento" required>
                      <input
                        value={form.segment}
                        onChange={(event) => setForm({ ...form, segment: event.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Site">
                      <input
                        value={form.website}
                        onChange={(event) => setForm({ ...form, website: event.target.value })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </FormSection>

                <FormSection
                  number="2"
                  id="dados-contato"
                  title="Contato comercial"
                  subtitle="Pessoa que receberá o retorno e a proposta."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Nome do responsável" required className="sm:col-span-2">
                      <input
                        value={form.contact_name}
                        onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="E-mail" required>
                      <input
                        type="email"
                        value={form.contact_email}
                        onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Telefone ou WhatsApp" required>
                      <input
                        value={form.contact_phone}
                        onChange={(event) => setForm({ ...form, contact_phone: maskPhone(event.target.value) })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </FormSection>

                <FormSection
                  number="3"
                  id="planejamento"
                  title="Planejamento da campanha"
                  subtitle="Informações iniciais para análise de viabilidade e orçamento."
                >
                  <div className="space-y-5">
                    <Field label="Objetivo principal" required>
                      <textarea
                        value={form.objective}
                        onChange={(event) => setForm({ ...form, objective: event.target.value })}
                        rows={4}
                        className={inputClass}
                      />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-3">
                      <Field label="Início desejado">
                        <input
                          type="date"
                          min={today}
                          value={form.desired_start_date}
                          onChange={(event) => setForm({ ...form, desired_start_date: event.target.value })}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Término desejado">
                        <input
                          type="date"
                          min={form.desired_start_date || today}
                          value={form.desired_end_date}
                          onChange={(event) => setForm({ ...form, desired_end_date: event.target.value })}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Investimento estimado" required>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-extrabold text-[#73808a]">
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={form.intended_budget ? maskCurrency(form.intended_budget) : ''}
                            onChange={(event) =>
                              handleCurrencyInputChange(event.target.value, (val) =>
                                setForm({ ...form, intended_budget: val > 0 ? val.toString() : '' })
                              )
                            }
                            placeholder="0,00"
                            className={`${inputClass} pl-10`}
                          />
                        </div>
                      </Field>
                    </div>

                    <div
                      className={`border px-4 py-4 ${
                        form.needs_creative_service ? 'border-[#b8903e] bg-[#fbf7ed]' : 'border-[#d6dade] bg-[#fafafa]'
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={form.needs_creative_service}
                          onChange={(event) => handleCreativeService(event.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#8a6b2f]"
                        />
                        <span className="flex-1">
                          <strong className="block text-sm font-extrabold">
                            Preciso que a GSA desenvolva o material criativo
                          </strong>
                          <small className="mt-1 block text-xs text-[#73808a]">
                            Ao marcar, você poderá escolher e confirmar uma referência visual.
                          </small>
                        </span>
                      </label>
                      {form.needs_creative_service && (
                        <div className="mt-4 flex flex-col gap-3 border-t border-[#ded2b2] pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-[#59636d]">
                            {creativeReference ? (
                              <>
                                Referência confirmada: <strong>{creativeReference.label}</strong>
                              </>
                            ) : (
                              'Nenhuma referência confirmada.'
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={openCreativePreview}
                            className="inline-flex items-center gap-2 text-sm font-extrabold text-[#806128]"
                          >
                            <ImageIcon className="h-4 w-4" /> Ver exemplos
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  number="4"
                  id="distribuicao"
                  title="Formatos e distribuição"
                  subtitle="Selecione ou remova opções livremente. As prévias abrem somente nos controles indicados."
                >
                  <fieldset>
                    <legend className="text-sm font-extrabold">Formatos desejados *</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {FORMATS.map((item) => {
                        const selected = form.desired_formats.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`flex flex-col border ${
                              selected ? 'border-[#b8903e] bg-[#fbf7ed]' : 'border-[#d6dade] bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggle('desired_formats', item.id)}
                              className="flex flex-1 items-start gap-3 p-4 text-left"
                            >
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
                                  selected ? 'border-[#8a6b2f] bg-[#8a6b2f] text-white' : 'border-[#aeb5ba] text-transparent'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </span>
                              <span>
                                <strong className="block text-sm">{item.title}</strong>
                                <small className="mt-1 block text-xs leading-5 text-[#73808a]">{item.description}</small>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreview({ kind: 'format', id: item.id })}
                              className="flex items-center justify-between border-t border-[#e1e3e5] px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em] text-[#806128] hover:bg-white/70"
                            >
                              Visualizar formato <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="mt-7">
                    <legend className="text-sm font-extrabold">Áreas de interesse *</legend>
                    <p className="mt-1 text-xs leading-5 text-[#73808a]">
                      Na primeira seleção, confirme a área dentro da prévia. Para remover, clique novamente na opção selecionada.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {PLACEMENTS.map((item) => {
                        const selected = form.desired_pages.includes(item.code);
                        return (
                          <div
                            key={item.code}
                            className={`flex flex-col border ${
                              selected ? 'border-[#b8903e] bg-[#fbf7ed]' : 'border-[#d6dade] bg-white'
                            }`}
                          >
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handlePlacementSelection(item.code)}
                              className="flex flex-1 items-center gap-3 px-4 py-3 text-left text-sm"
                            >
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                                  selected ? 'border-[#8a6b2f] bg-[#8a6b2f] text-white' : 'border-[#aeb5ba] text-transparent'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </span>
                              <span className="flex-1">{item.label}</span>
                              <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[#806128]">
                                {selected ? 'Remover' : 'Selecionar'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreview({ kind: 'placement', id: item.code, selectionMode: 'preview' })}
                              className="flex items-center justify-between border-t border-[#e1e3e5] px-4 py-3 text-[11px] font-black uppercase tracking-[0.08em] text-[#806128] hover:bg-white/70"
                            >
                              Visualizar posição <MousePointerClick className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="mt-7">
                    <legend className="text-sm font-extrabold">Dispositivos *</legend>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        ['desktop', 'Computador'],
                        ['tablet', 'Tablet'],
                        ['mobile', 'Celular'],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggle('devices', id)}
                          className={`flex items-center gap-2 border px-4 py-2.5 text-sm font-bold ${
                            form.devices.includes(id) ? 'border-[#8a6b2f] bg-[#fbf7ed]' : 'border-[#d6dade]'
                          }`}
                        >
                          <MonitorSmartphone className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <Field label="Observações adicionais" className="mt-7">
                    <textarea
                      value={form.notes}
                      maxLength={1800}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={4}
                      className={inputClass}
                    />
                  </Field>
                </FormSection>
              </div>

              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={form.website_confirmation}
                onChange={(event) => setForm({ ...form, website_confirmation: event.target.value })}
                className="hidden"
              />

              <div className="mt-10 border-t border-[#dfe2e4] pt-7">
                <label className="flex items-start gap-3 text-sm leading-6 text-[#59636d]">
                  <input
                    type="checkbox"
                    checked={privacyAccepted}
                    onChange={(event) => setPrivacyAccepted(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#8a6b2f]"
                  />
                  <span>
                    Li e aceito a{' '}
                    <button
                      type="button"
                      onClick={() => setPrivacyOpen(true)}
                      className="font-extrabold text-[#806128] underline"
                    >
                      política de privacidade
                    </button>
                    .
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#d6ba72] px-6 py-4 text-sm font-black disabled:opacity-60"
                >
                  {submitting ? <ClipboardCheck className="h-5 w-5 animate-pulse" /> : <Send className="h-5 w-5" />}
                  {submitting ? 'Registrando solicitação...' : 'Enviar para análise comercial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="border-t border-[#d8d0c3] bg-[#10202e] text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-6 py-12 sm:px-10 lg:flex-row lg:items-center lg:px-12">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#d7b96e]">Já possui uma proposta?</p>
            <h2 className="mt-3 text-2xl font-black">
              Acompanhe negociação, criativos e resultados no portal do anunciante.
            </h2>
          </div>
          <a
            href={routes.login.advertiser()}
            className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#d7b96e] px-5 py-3 text-sm font-extrabold text-[#f2dfaa]"
          >
            Acessar área do anunciante <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <PrivacyPolicyDialog isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />

      {preview && (
        <PreviewModal
          title={format?.title || placement?.label || 'Exemplos de material criativo'}
          onClose={closePreview}
        >
          {format && <FormatPreview item={format} />}
          {placement && (
            <PlacementPreview
              item={placement}
              requireConfirmation={placementNeedsConfirmation}
              onConfirm={() => confirmPlacementSelection(placement.code)}
            />
          )}
          {preview.kind === 'creative' && (
            <CreativePreview
              selected={pendingCreativeReference}
              onSelect={setPendingCreativeReference}
              onConfirm={confirmCreativeReference}
            />
          )}
        </PreviewModal>
      )}
    </main>
  );
}

function FormSection({
  number,
  id,
  title,
  subtitle,
  children,
}: {
  number: string;
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex items-start gap-4 border-b border-[#e0e2e4] pb-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe6cf] text-xs font-black text-[#806128]">
          {number}
        </span>
        <div>
          <h3 id={id} className={sectionTitleClass}>{title}</h3>
          <p className="mt-1 text-sm text-[#73808a]">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm font-bold text-[#35414a] ${className}`}>
      {label} {required && <span className="text-[#9b2c2c]">*</span>}
      {children}
    </label>
  );
}

function PreviewModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07101a]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-[#f7f5f0]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d9dce0] bg-[#f7f5f0] px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#806128]">Prévia ilustrativa</p>
            <h2 className="mt-1 text-xl font-black">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border bg-white"
            aria-label="Fechar prévia"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

function FormatPreview({ item }: { item: FormatItem }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <MockBrowser><FormatArtwork id={item.id} /></MockBrowser>
      <div className="flex flex-col justify-center">
        <h3 className="text-2xl font-black">{item.title}</h3>
        <p className="mt-4 text-sm leading-7 text-[#65707a]">{item.preview}</p>
        <p className="mt-6 border-l-2 border-[#b8903e] bg-white px-4 py-3 text-sm text-[#59636d]">
          Simulação ilustrativa; a arte final respeitará a identidade da marca e o formato contratado.
        </p>
      </div>
    </div>
  );
}

function PlacementPreview({
  item,
  requireConfirmation,
  onConfirm,
}: {
  item: PlacementItem;
  requireConfirmation: boolean;
  onConfirm: () => void;
}) {
  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <MockBrowser><PlacementArtwork code={item.code} /></MockBrowser>
        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-black">{item.short}</h3>
          <p className="mt-4 text-sm leading-7 text-[#65707a]">{item.preview}</p>
          <p className="mt-6 border border-[#d9dce0] bg-white p-4 text-sm text-[#59636d]">
            A simulação demonstra a posição. Dimensões e composição serão confirmadas na proposta.
          </p>
        </div>
      </div>
      {requireConfirmation && (
        <div className="mt-7 flex flex-col gap-4 border-t border-[#d9dce0] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-[#35414a]">Confirme para adicionar esta área ao formulário.</p>
            <p className="mt-1 text-xs leading-5 text-[#73808a]">A seleção poderá ser removida depois com um novo clique.</p>
          </div>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#d6ba72] px-6 py-3 text-sm font-black text-[#17202a] hover:bg-[#e0c77f]"
          >
            <CheckCircle2 className="h-4 w-4" /> Confirmar esta área
          </button>
        </div>
      )}
    </div>
  );
}

function CreativePreview({
  selected,
  onSelect,
  onConfirm,
}: {
  selected: CreativeReference | null;
  onSelect: (item: CreativeReference) => void;
  onConfirm: () => void;
}) {
  return (
    <div>
      <p className="text-sm leading-6 text-[#65707a]">
        Escolha uma direção visual. A referência somente será registrada depois que você confirmar.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {CREATIVE_REFERENCES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected?.id === item.id}
            onClick={() => onSelect(item)}
            className={`overflow-hidden border text-left ${
              selected?.id === item.id
                ? 'border-[#8a6b2f] ring-2 ring-[#c7a458]/25'
                : 'border-[#d5d9dc]'
            }`}
          >
            <CreativeArtwork index={index} />
            <div className="bg-white p-4">
              <strong className="text-sm">{item.label}</strong>
              <p className="mt-1 text-xs leading-5 text-[#73808a]">{item.description}</p>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="mt-6 border border-[#8cb89b] bg-[#eef7f1] p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1f6a3d]" />
            <div>
              <p className="text-sm font-extrabold text-[#174f2e]">Direção visual escolhida</p>
              <p className="mt-1 text-sm text-[#3f6650]">
                {selected.label}. Clique em confirmar para gravar esta preferência no formulário.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-xs text-[#73808a]">Selecione uma das referências para liberar a confirmação.</p>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-[#d9dce0] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[#73808a]">
          A referência não limita a criação final; ela indica a direção preferida.
        </p>
        <button
          type="button"
          disabled={!selected}
          onClick={onConfirm}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#d6ba72] px-6 py-3 text-sm font-black text-[#17202a] hover:bg-[#e0c77f] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <CheckCircle2 className="h-4 w-4" /> Confirmar direção visual
        </button>
      </div>
    </div>
  );
}

function MockBrowser({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#c9ced2] bg-white shadow-xl">
      <div className="flex h-10 items-center gap-2 border-b bg-[#edf0f2] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#aeb6bc]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#c1c7cc]" />
        <span className="ml-3 h-5 flex-1 rounded bg-white" />
      </div>
      <div className="min-h-[320px] bg-[#f4f1ea] p-5">{children}</div>
    </div>
  );
}

function FormatArtwork({ id }: { id: AdvertisingFormat }) {
  if (id === 'responsive_banner') return <Layout><AdBlock label="BANNER RESPONSIVO" /></Layout>;
  if (id === 'sponsored_card') return <Layout><div className="grid grid-cols-2 gap-3"><Card /><AdCard /><Card /><Card /></div></Layout>;
  if (id === 'rectangle') return <Layout><div className="grid grid-cols-[1fr_0.4fr] gap-4"><Rows /><AdBlock label="LATERAL" tall /></div></Layout>;
  if (id === 'hero') return <Layout><div className="flex h-52 flex-col justify-end bg-[#10202e] p-6 text-white"><small className="text-[#d7b96e]">PUBLICIDADE</small><strong className="mt-2 text-2xl">Mensagem principal</strong></div></Layout>;
  if (id === 'inline_video') return <Layout><div className="flex h-48 items-center justify-center bg-[#142433]"><PlayCircle className="h-12 w-12 text-[#d7b96e]" /></div></Layout>;
  if (id === 'section_sponsorship') return <Layout><div className="border-b-2 border-[#b8903e] bg-white p-4 font-bold">SEÇÃO — Patrocínio: SUA MARCA</div><Rows /></Layout>;
  if (id === 'sponsored_content') return <Layout><div className="bg-white p-5"><small className="text-[#806128]">CONTEÚDO PATROCINADO</small><Rows /></div></Layout>;
  return <div className="relative min-h-[280px]"><Rows /><div className="absolute inset-5 flex items-center justify-center bg-[#07101a]/65"><div className="relative w-4/5 bg-white p-5"><X className="absolute right-3 top-3 h-4 w-4" /><AdBlock label="EXIBIÇÃO ESPECIAL" /></div></div></div>;
}

function PlacementArtwork({ code }: { code: string }) {
  if (code === 'HOME_BANNER_TOP' || code === 'CLASSIFIEDS_BANNER_TOP') return <Layout><AdBlock label="BANNER SUPERIOR" /><Rows /></Layout>;
  if (code === 'HOME_INLINE_01') return <Layout><Rows /><AdBlock label="DENTRO DO CONTEÚDO" /><Rows /></Layout>;
  if (code === 'HOME_LIGHTBOX') return <FormatArtwork id="lightbox" />;
  if (code === 'SITE_STICKY_BOTTOM') return <div className="relative min-h-[280px]"><Rows /><div className="absolute inset-x-0 bottom-0 bg-[#10202e] p-5 text-white">BANNER INFERIOR</div></div>;
  if (code === 'MARKETPLACE_SPONSORED_CARD') return <Layout><div className="grid grid-cols-3 gap-3"><Card /><AdCard /><Card /><Card /><Card /><Card /></div></Layout>;
  return <Layout><div className="grid grid-cols-2 gap-3"><AdCard /><Card /><Card /><Card /></div></Layout>;
}

function CreativeArtwork({ index }: { index: number }) {
  const styles = [
    'bg-[#122331] text-white',
    'bg-[#d6ba72] text-[#17202a]',
    'bg-[#f1eee7] text-[#17202a]',
    'bg-[#20394d] text-white',
  ];
  const titles = [
    'Sua empresa com confiança',
    'Oferta em destaque',
    'Produto como protagonista',
    'Uma novidade está chegando',
  ];
  return (
    <div className={`flex h-40 flex-col justify-end p-5 ${styles[index]}`}>
      <Sparkles className="mb-auto h-7 w-7" />
      <strong>{titles[index]}</strong>
    </div>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex h-12 items-center justify-between bg-white px-4">
        <div className="h-5 w-20 bg-[#17202a]" />
        <div className="h-2 w-28 bg-[#c7ccd0]" />
      </div>
      {children}
    </div>
  );
}

function AdBlock({ label, tall = false }: { label: string; tall?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center border border-[#a98a45] bg-[#d6ba72] text-[10px] font-black ${
        tall ? 'h-52' : 'h-20'
      }`}
    >
      {label}
    </div>
  );
}

function Rows() {
  return (
    <div className="space-y-3 bg-white p-4">
      <div className="h-4 w-2/3 bg-[#263746]" />
      {[1, 2, 3, 4].map((item) => <div key={item} className="h-2 bg-[#d7dbde]" />)}
    </div>
  );
}

function Card() {
  return (
    <div className="bg-white p-3">
      <div className="h-20 bg-[#d8dcdf]" />
      <div className="mt-3 h-3 w-3/4 bg-[#394752]" />
    </div>
  );
}

function AdCard() {
  return (
    <div className="border border-[#b8903e] bg-[#fbf7ed] p-3">
      <small className="font-black text-[#806128]">PATROCINADO</small>
      <div className="mt-2 h-20 bg-[#c9b27a]" />
      <div className="mt-3 h-3 w-3/4 bg-[#263746]" />
    </div>
  );
}

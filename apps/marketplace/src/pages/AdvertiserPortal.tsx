import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardCopy,
  ClipboardList,
  Clock3,
  CreditCard,
  Eye,
  FileImage,
  FileText,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquareText,
  MonitorSmartphone,
  RefreshCw,
  Send,
  ShieldCheck,
  Target,
  Type,
  UploadCloud,
  User,
  Video,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useRealtimeSubscription } from '../hooks/useRealtime';
import { compressImageBeforeUpload } from '../lib/imageCompression';
import { advertiserAccess } from '../lib/advertiserAccess';
import { copyToClipboard } from '../lib/utils';
import navigationService, { navigate } from '../routing/navigationService';
import { routes } from '../routing/routeCatalog';
import type {
  AdvertiserPortalSnapshot,
  AdvertisingCampaign,
  AdvertisingCreative,
  AdvertisingMetric,
  AdvertisingPaymentStatus,
  AdvertisingProposal,
  AdvertisingRequest,
} from '../types/advertising';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

type Tab = 'overview' | 'requests' | 'proposals' | 'campaigns' | 'creatives' | 'finance' | 'reports' | 'profile';
type CreativeType = 'image' | 'video' | 'text';
type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const REQUEST_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Recebida',
  under_review: 'Em análise pela GSA',
  awaiting_information: 'Aguardando informações',
  proposal_sent: 'Proposta enviada',
  negotiation_requested: 'Em negociação',
  accepted: 'Aceita',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
};

const PROPOSAL_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Aguardando resposta',
  negotiating: 'Em negociação',
  final_offer: 'Oferta final',
  accepted: 'Aceita',
  rejected: 'Recusada',
  expired: 'Expirada',
  cancelled: 'Cancelada',
};

const CAMPAIGN_LABELS: Record<string, string> = {
  draft: 'Em preparação',
  payment_pending: 'Aguardando pagamento',
  payment_overdue: 'Pagamento vencido',
  creative_review: 'Material em análise',
  scheduled: 'Agendada',
  active: 'Em exibição',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const PAYMENT_LABELS: Record<AdvertisingPaymentStatus, string> = {
  pending: 'Pendente',
  processing: 'Em processamento',
  paid: 'Pago',
  failed: 'Falhou',
  overdue: 'Vencido',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

const CREATIVE_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  pending_review: 'Em análise',
  approved: 'Aprovado',
  rejected: 'Correção necessária',
  archived: 'Arquivado',
};

const FORMAT_LABELS: Record<string, string> = {
  responsive_banner: 'Banner responsivo',
  sponsored_card: 'Card patrocinado',
  rectangle: 'Retângulo ou lateral',
  sticky_banner: 'Banner fixo',
  hero: 'Destaque principal',
  inline_video: 'Vídeo no conteúdo',
  floating_video: 'Vídeo flutuante',
  lightbox: 'Exibição especial',
  section_sponsorship: 'Patrocínio de seção',
  sponsored_content: 'Conteúdo patrocinado',
  takeover: 'Ocupação especial',
};

const PLACEMENT_LABELS: Record<string, string> = {
  HOME_BANNER_TOP: 'Página inicial — banner superior',
  HOME_INLINE_01: 'Página inicial — dentro do conteúdo',
  HOME_LIGHTBOX: 'Página inicial — exibição especial',
  SITE_STICKY_BOTTOM: 'Portal — banner inferior fixo',
  MARKETPLACE_SPONSORED_CARD: 'Marketplace — card patrocinado',
  CLASSIFIEDS_BANNER_TOP: 'Classificados — banner superior',
  ADS_PUBLIC_SHOWCASE: 'Página de anunciantes — card institucional',
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Computador',
  tablet: 'Tablet',
  mobile: 'Celular',
};

const FREQUENCY_LABELS: Record<string, string> = {
  once_per_session: 'Uma vez por sessão',
  once_per_day: 'Uma vez ao dia',
  interval_hours: 'Intervalo em horas',
  daily_limit: 'Limite diário',
  unlimited: 'Sem limite de frequência',
};

const PORTAL_PATHS: Record<Tab, string> = {
  overview: '/anuncios/painel',
  requests: '/anuncios/solicitacoes',
  proposals: '/anuncios/propostas',
  campaigns: '/anuncios/campanhas',
  creatives: '/anuncios/criativos',
  finance: '/anuncios/financeiro',
  reports: '/anuncios/relatorios',
  profile: '/anuncios/perfil',
};

const TAB_ITEMS: Array<{ id: Tab; label: string; description: string; icon: typeof LayoutDashboard; path: string }> = [
  { id: 'overview', label: 'Início', description: 'Resumo e próximos passos', icon: LayoutDashboard, path: PORTAL_PATHS.overview },
  { id: 'requests', label: 'Solicitações', description: 'Briefings enviados', icon: ClipboardList, path: PORTAL_PATHS.requests },
  { id: 'proposals', label: 'Propostas', description: 'Condições e negociação', icon: MessageSquareText, path: PORTAL_PATHS.proposals },
  { id: 'campaigns', label: 'Campanhas', description: 'Programação e andamento', icon: Megaphone, path: PORTAL_PATHS.campaigns },
  { id: 'creatives', label: 'Materiais criativos', description: 'Envios e aprovações', icon: FileImage, path: PORTAL_PATHS.creatives },
  { id: 'finance', label: 'Financeiro', description: 'Cobranças e pagamentos', icon: WalletCards, path: PORTAL_PATHS.finance },
  { id: 'reports', label: 'Resultados', description: 'Métricas das campanhas', icon: BarChart3, path: PORTAL_PATHS.reports },
  { id: 'profile', label: 'Dados da empresa', description: 'Cadastro e contatos', icon: User, path: PORTAL_PATHS.profile },
];

const PROCESS_STEPS = [
  'Solicitação',
  'Análise',
  'Proposta',
  'Pagamento',
  'Material',
  'Programação',
  'Veiculação',
  'Conclusão',
];

function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function date(value?: string | null) {
  if (!value) return 'A definir';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data inválida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
}

function dateTime(value?: string | null) {
  if (!value) return 'Não disponível';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Data inválida'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

function message(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}

function safeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'criativo';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isHttps(value: string) {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function protectDocument(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return value || 'Não informado';
  return `••• ••• ••• ${digits.slice(-4)}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tabFromPath(pathname: string): Tab {
  const module = pathname.split('/').filter(Boolean)[1] || 'painel';
  const normalized = module.toLowerCase();
  if (['solicitacoes', 'requests'].includes(normalized)) return 'requests';
  if (['propostas', 'proposals'].includes(normalized)) return 'proposals';
  if (['campanhas', 'campaigns'].includes(normalized)) return 'campaigns';
  if (['criativos', 'creatives'].includes(normalized)) return 'creatives';
  if (['financeiro', 'finance'].includes(normalized)) return 'finance';
  if (['relatorios', 'resultados', 'reports'].includes(normalized)) return 'reports';
  if (['perfil', 'dados', 'profile'].includes(normalized)) return 'profile';
  return 'overview';
}

function requestTone(status: string): StatusTone {
  if (['accepted'].includes(status)) return 'success';
  if (['rejected', 'cancelled'].includes(status)) return 'danger';
  if (['awaiting_information', 'negotiation_requested'].includes(status)) return 'warning';
  if (['under_review', 'proposal_sent'].includes(status)) return 'info';
  return 'neutral';
}

function proposalTone(status: string): StatusTone {
  if (status === 'accepted') return 'success';
  if (['rejected', 'expired', 'cancelled'].includes(status)) return 'danger';
  if (['sent', 'negotiating', 'final_offer'].includes(status)) return 'warning';
  return 'neutral';
}

function campaignTone(status: string): StatusTone {
  if (['active', 'completed'].includes(status)) return 'success';
  if (['payment_overdue', 'cancelled'].includes(status)) return 'danger';
  if (['payment_pending', 'creative_review', 'paused'].includes(status)) return 'warning';
  if (status === 'scheduled') return 'info';
  return 'neutral';
}

function paymentTone(status: AdvertisingPaymentStatus): StatusTone {
  if (status === 'paid') return 'success';
  if (['failed', 'overdue', 'cancelled'].includes(status)) return 'danger';
  if (['pending', 'processing'].includes(status)) return 'warning';
  return 'neutral';
}

function creativeTone(status: string): StatusTone {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'pending_review') return 'warning';
  return 'neutral';
}

function extractCreativeReference(notes?: string | null) {
  if (!notes) return null;
  const match = notes.match(/Referência de material criativo escolhida:\s*([^\[.]+)/i);
  return match?.[1]?.trim() || null;
}

function cleanRequestNotes(notes?: string | null) {
  if (!notes) return '';
  return notes
    .replace(/Referência de material criativo escolhida:[^\n]*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function campaignProgress(campaign: AdvertisingCampaign) {
  const limit = Number(campaign.impression_limit || 0);
  const served = Number(campaign.served_count || 0);
  if (!limit) return null;
  return Math.min(100, Math.round((served / limit) * 100));
}

function stageForSnapshot(snapshot: AdvertiserPortalSnapshot) {
  if (snapshot.campaigns.some((campaign) => campaign.status === 'completed')) return 8;
  if (snapshot.campaigns.some((campaign) => campaign.status === 'active')) return 7;
  if (snapshot.campaigns.some((campaign) => campaign.status === 'scheduled')) return 6;
  if (snapshot.campaigns.some((campaign) => campaign.status === 'creative_review')) return 5;
  if (snapshot.campaigns.some((campaign) => ['payment_pending', 'payment_overdue'].includes(campaign.status))) return 4;
  if (snapshot.proposals.some((proposal) => ['sent', 'negotiating', 'final_offer', 'accepted'].includes(proposal.status))) return 3;
  if (snapshot.requests.some((request) => ['under_review', 'awaiting_information', 'proposal_sent', 'negotiation_requested'].includes(request.status))) return 2;
  return snapshot.requests.length ? 1 : 0;
}

function nextActionForSnapshot(snapshot: AdvertiserPortalSnapshot): { eyebrow: string; title: string; description: string; tab: Tab; cta: string; tone: StatusTone } {
  const proposal = snapshot.proposals.find((item) => ['sent', 'negotiating', 'final_offer'].includes(item.status));
  if (proposal) {
    return {
      eyebrow: 'Decisão necessária',
      title: 'Uma proposta aguarda sua análise',
      description: `Revise as condições da proposta v${proposal.current_version}, válida até ${date(proposal.valid_until)}.`,
      tab: 'proposals',
      cta: 'Analisar proposta',
      tone: 'warning',
    };
  }

  const overdue = snapshot.campaigns.find((campaign) => campaign.payment && ['overdue', 'failed'].includes(campaign.payment.status));
  if (overdue) {
    return {
      eyebrow: 'Atenção financeira',
      title: 'Existe uma cobrança que precisa de regularização',
      description: `A campanha ${overdue.name} possui pagamento ${PAYMENT_LABELS[overdue.payment!.status].toLowerCase()}.`,
      tab: 'finance',
      cta: 'Ver cobrança',
      tone: 'danger',
    };
  }

  const payment = snapshot.campaigns.find((campaign) => campaign.payment && ['pending', 'processing'].includes(campaign.payment.status));
  if (payment) {
    return {
      eyebrow: 'Próxima etapa',
      title: 'Pagamento aguardando confirmação',
      description: `Consulte os dados da cobrança da campanha ${payment.name}.`,
      tab: 'finance',
      cta: 'Acessar financeiro',
      tone: 'warning',
    };
  }

  const rejectedCreative = snapshot.campaigns.find((campaign) => campaign.creatives.some((creative) => creative.status === 'rejected'));
  if (rejectedCreative) {
    return {
      eyebrow: 'Correção necessária',
      title: 'Um material criativo precisa ser revisado',
      description: `Consulte a orientação registrada para a campanha ${rejectedCreative.name} e envie uma nova versão.`,
      tab: 'creatives',
      cta: 'Corrigir material',
      tone: 'danger',
    };
  }

  const needsCreative = snapshot.campaigns.find((campaign) =>
    ['creative_review', 'draft'].includes(campaign.status) && !campaign.creatives.some((creative) => ['pending_review', 'approved'].includes(creative.status)),
  );
  if (needsCreative) {
    return {
      eyebrow: 'Material pendente',
      title: 'Envie o material da campanha',
      description: `A campanha ${needsCreative.name} está pronta para receber imagem, vídeo ou conteúdo textual.`,
      tab: 'creatives',
      cta: 'Enviar material',
      tone: 'info',
    };
  }

  const awaitingInfo = snapshot.requests.find((request) => request.status === 'awaiting_information');
  if (awaitingInfo) {
    return {
      eyebrow: 'Retorno solicitado',
      title: 'A GSA aguarda informações complementares',
      description: `Consulte a solicitação ${awaitingInfo.protocol} para acompanhar o atendimento.`,
      tab: 'requests',
      cta: 'Ver solicitação',
      tone: 'warning',
    };
  }

  const active = snapshot.campaigns.find((campaign) => campaign.status === 'active');
  if (active) {
    return {
      eyebrow: 'Campanha em exibição',
      title: `${active.name} está ativa`,
      description: 'Acompanhe as exibições, visualizações e cliques registrados até o momento.',
      tab: 'reports',
      cta: 'Acompanhar resultados',
      tone: 'success',
    };
  }

  return {
    eyebrow: 'Acompanhamento atualizado',
    title: 'Nenhuma ação é necessária agora',
    description: snapshot.requests.length
      ? 'A equipe da GSA continuará o atendimento e qualquer nova etapa aparecerá nesta central.'
      : 'Quando uma solicitação for vinculada à conta, o andamento será exibido aqui.',
    tab: 'requests',
    cta: snapshot.requests.length ? 'Ver solicitações' : 'Conhecer formatos',
    tone: 'neutral',
  };
}

async function mediaMetadata(file: File) {
  const url = URL.createObjectURL(file);
  try {
    if (IMAGE_TYPES.has(file.type)) {
      return await new Promise<{ width: number; height: number; duration: null }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, duration: null });
        image.onerror = () => reject(new Error('Imagem inválida.'));
        image.src = url;
      });
    }
    return await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: Number(video.duration.toFixed(2)) });
      video.onerror = () => reject(new Error('Vídeo inválido.'));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AdvertiserPortal() {
  const initialProtocol = useMemo(() => new URLSearchParams(window.location.search).get('protocolo') || '', []);
  const [snapshot, setSnapshot] = useState<AdvertiserPortalSnapshot | null>(null);
  const [checking, setChecking] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<'protocol' | 'email'>('protocol');
  const [protocol, setProtocol] = useState(initialProtocol.toUpperCase());
  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [company, setCompany] = useState('');
  const [documentValue, setDocumentValue] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);
  const [acceptProposal, setAcceptProposal] = useState<AdvertisingProposal | null>(null);
  const [counterProposal, setCounterProposal] = useState<AdvertisingProposal | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [rejectProposal, setRejectProposal] = useState<AdvertisingProposal | null>(null);
  const [rejectMessage, setRejectMessage] = useState('');
  const [creativeCampaignId, setCreativeCampaignId] = useState('');
  const [creativeType, setCreativeType] = useState<CreativeType>('image');
  const [creativeFile, setCreativeFile] = useState<File | null>(null);
  const [creativePreviewUrl, setCreativePreviewUrl] = useState<string | null>(null);
  const [creativeHeadline, setCreativeHeadline] = useState('');
  const [creativeBody, setCreativeBody] = useState('');
  const [creativeAlt, setCreativeAlt] = useState('');
  const [creativeTarget, setCreativeTarget] = useState('');
  const [creativeConfirmOpen, setCreativeConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedReportCampaignId, setSelectedReportCampaignId] = useState('all');

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setChecking(true);
    setPortalError(null);
    try {
      const nextSnapshot = await advertiserAccess.getSnapshot();
      setSnapshot(nextSnapshot);
      if (nextSnapshot) setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      console.error('Falha ao carregar portal:', error);
      setSnapshot(null);
      setPortalError(message(error, 'Não foi possível carregar o portal do anunciante.'));
      if (!silent) toast.error(message(error, 'Não foi possível carregar o portal do anunciante.'));
    } finally {
      setChecking(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => void load(true));
    return () => {
      data.subscription.unsubscribe();
    };
  }, [load]);

  useRealtimeSubscription([
    { table: 'gsa_advertisers', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_ad_requests', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_ad_proposals', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_ad_campaigns', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_ad_creatives', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_ad_payments', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_ad_negotiations', onChange: () => void load(true), debounceMs: 500 },
  ]);

  useEffect(() => navigationService.subscribe(({ pathname }) => setTab(tabFromPath(pathname))), []);

  useEffect(() => {
    if (snapshot && window.location.pathname === routes.login.advertiser()) navigate(PORTAL_PATHS.overview);
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot?.advertiser) return;
    const advertiser = snapshot.advertiser;
    setCompany(advertiser.company_name || advertiser.legal_name || '');
    setDocumentValue(advertiser.document || '');
    setContactName(advertiser.contact_name || advertiser.responsible_name || '');
    setEmail(advertiser.contact_email || advertiser.responsible_email || '');
    setPhone(advertiser.contact_phone || advertiser.responsible_phone || '');
  }, [snapshot]);

  useEffect(() => {
    if (initialProtocol && !validated) void validateProtocol(initialProtocol);
  }, [initialProtocol]);

  useEffect(() => {
    if (!resendSeconds) return;
    const timer = window.setInterval(() => setResendSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (!creativeFile) {
      setCreativePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(creativeFile);
    setCreativePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [creativeFile]);

  const selectTab = (next: Tab) => {
    setTab(next);
    setMobileNavOpen(false);
    const target = TAB_ITEMS.find((item) => item.id === next)?.path;
    if (target && window.location.pathname !== target) navigate(target);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const validateProtocol = async (value = protocol) => {
    const normalized = value.trim().toUpperCase();
    if (normalized.length < 8) return toast.error('Informe um protocolo válido.');
    setValidating(true);
    setValidated(false);
    try {
      const { data, error } = await supabase.functions.invoke('gsa-ads-public', {
        body: { action: 'validate', protocol: normalized },
      });
      const result = data as { success?: boolean; request?: Record<string, string> } | null;
      if (error || !result?.success || !result.request) throw error || new Error('Protocolo não encontrado.');
      setProtocol(normalized);
      setCompany(result.request.company_name || '');
      setDocumentValue(result.request.document || '');
      setContactName(result.request.contact_name || '');
      setEmail(result.request.contact_email || '');
      setPhone(result.request.contact_phone || '');
      setValidated(true);
      toast.success('Protocolo validado com sucesso.');
    } catch (error) {
      console.error('Validação do protocolo falhou:', error);
      toast.error(message(error, 'Protocolo não encontrado ou indisponível.'));
    } finally {
      setValidating(false);
    }
  };

  const resetProtocol = () => {
    setValidated(false);
    setProtocol('');
    setPassword('');
    setPasswordConfirm('');
    setCompany('');
    setDocumentValue('');
    setContactName('');
    setEmail('');
    setPhone('');
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    if (!validated) return toast.error('Valide o protocolo antes do cadastro.');
    if (password.length < 8) return toast.error('A senha deve ter ao menos 8 caracteres.');
    if (password !== passwordConfirm) return toast.error('As senhas não coincidem.');
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('gsa-ads-public', {
        body: { action: 'register', protocol, document: documentValue, email: email.trim().toLowerCase(), password },
      });
      const result = data as {
        success?: boolean;
        account_exists?: boolean;
        verification_required?: boolean;
      } | null;
      if (error || !result?.success) throw error || new Error('Cadastro não confirmado pelo servidor.');
      if (result.verification_required) {
        setPassword('');
        setPasswordConfirm('');
        toast.success('Enviamos a confirmação para o e-mail cadastrado. Confirme o endereço e retorne por esse link para concluir o vínculo.');
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) {
        if (result.account_exists) {
          await advertiserAccess.requestMagicLink(email);
          setAccessMode('email');
          setMagicLinkSent(true);
          setResendSeconds(45);
          toast.success('A conta já existia. Enviamos um link seguro de acesso.');
          return;
        }
        throw signInError;
      }
      toast.success('Cadastro concluído e vinculado ao protocolo.');
      await load(true);
    } catch (error) {
      console.error('Cadastro falhou:', error);
      toast.error(message(error, 'Não foi possível concluir o cadastro.'));
    } finally {
      setSending(false);
    }
  };

  const requestMagicLink = async (event: FormEvent) => {
    event.preventDefault();
    if (resendSeconds > 0) return;
    setSending(true);
    try {
      await advertiserAccess.requestMagicLink(email);
      setMagicLinkSent(true);
      setResendSeconds(45);
      toast.success('Link seguro enviado ao e-mail cadastrado.');
    } catch (error) {
      toast.error(message(error, 'Não foi possível enviar o link. Confirme se o acesso foi liberado pela GSA.'));
    } finally {
      setSending(false);
    }
  };

  const logout = async () => {
    await advertiserAccess.signOut();
    setSnapshot(null);
    navigate(routes.public.ads());
  };

  const proposalRpc = async (name: string, payload: Record<string, unknown>, success: string) => {
    const { data, error } = await supabase.rpc(name, payload);
    if (error || data?.success === false) throw error || new Error(data?.error || 'Operação recusada pelo servidor.');
    toast.success(success);
    await load(true);
    return data;
  };

  const confirmAcceptProposal = async () => {
    if (!acceptProposal || !isUuid(acceptProposal.id)) return toast.error('Proposta inválida. Atualize o portal.');
    setActionId(acceptProposal.id);
    try {
      await proposalRpc(
        'gsa_advertiser_accept_proposal',
        { p_proposal_id: acceptProposal.id },
        'Proposta aceita e campanha criada no sistema.',
      );
      setAcceptProposal(null);
      selectTab('finance');
    } catch (error) {
      toast.error(message(error, 'Não foi possível aceitar a proposta.'));
    } finally {
      setActionId(null);
    }
  };

  const sendCounter = async (event: FormEvent) => {
    event.preventDefault();
    if (!counterProposal) return;
    const amount = Number(counterAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || counterMessage.trim().length < 3) {
      return toast.error('Informe valor e mensagem válidos.');
    }
    setActionId(counterProposal.id);
    try {
      await proposalRpc(
        'gsa_advertiser_counter_proposal',
        { p_proposal_id: counterProposal.id, p_amount: amount, p_message: counterMessage.trim() },
        'Contraproposta gravada e enviada à GSA.',
      );
      setCounterProposal(null);
      setCounterAmount('');
      setCounterMessage('');
    } catch (error) {
      toast.error(message(error, 'Não foi possível enviar a contraproposta.'));
    } finally {
      setActionId(null);
    }
  };

  const reject = async (event: FormEvent) => {
    event.preventDefault();
    if (!rejectProposal) return;
    setActionId(rejectProposal.id);
    try {
      await proposalRpc(
        'gsa_advertiser_reject_proposal',
        { p_proposal_id: rejectProposal.id, p_message: rejectMessage.trim() || null },
        'Proposta recusada.',
      );
      setRejectProposal(null);
      setRejectMessage('');
    } catch (error) {
      toast.error(message(error, 'Não foi possível recusar a proposta.'));
    } finally {
      setActionId(null);
    }
  };

  const handleCreativeType = (next: CreativeType) => {
    setCreativeType(next);
    setCreativeFile(null);
    if (next === 'text') setCreativeAlt('');
  };

  const handleCreativeFile = (file: File | null) => {
    setCreativeFile(file);
    if (!file) return;
    if (IMAGE_TYPES.has(file.type)) setCreativeType('image');
    if (VIDEO_TYPES.has(file.type)) setCreativeType('video');
  };

  const validateCreativeInput = () => {
    if (!snapshot || !creativeCampaignId) return 'Selecione a campanha.';
    const campaign = snapshot.campaigns.find((item) => item.id === creativeCampaignId);
    if (!campaign || ['completed', 'cancelled'].includes(campaign.status)) return 'Esta campanha não aceita criativos.';
    const target = creativeTarget.trim();
    if (target && !isHttps(target)) return 'A URL de destino deve ser HTTPS.';
    if (creativeType === 'text' && (creativeHeadline.trim().length < 3 || creativeBody.trim().length < 3)) {
      return 'Informe título e texto para o material textual.';
    }
    if (creativeType !== 'text' && !creativeFile) return 'Selecione o arquivo do material.';
    if (creativeFile && !IMAGE_TYPES.has(creativeFile.type) && !VIDEO_TYPES.has(creativeFile.type)) return 'Formato não permitido.';
    if (creativeType === 'image' && creativeFile && !IMAGE_TYPES.has(creativeFile.type)) return 'Selecione um arquivo de imagem.';
    if (creativeType === 'video' && creativeFile && !VIDEO_TYPES.has(creativeFile.type)) return 'Selecione um arquivo de vídeo.';
    if (creativeFile && creativeFile.size > (VIDEO_TYPES.has(creativeFile.type) ? 50 : 10) * 1024 * 1024) return 'Arquivo acima do limite permitido.';
    if (creativeFile && creativeAlt.trim().length < 3) return 'Informe a descrição acessível.';
    return null;
  };

  const requestCreativeConfirmation = (event: FormEvent) => {
    event.preventDefault();
    const error = validateCreativeInput();
    if (error) return toast.error(error);
    setCreativeConfirmOpen(true);
  };

  const uploadCreative = async () => {
    const validationError = validateCreativeInput();
    if (validationError) return toast.error(validationError);
    if (!snapshot) return;

    const target = creativeTarget.trim();
    setUploading(true);
    let uploadedPath: string | null = null;
    try {
      let kind: AdvertisingCreative['kind'] = creativeType;
      let storagePath: string | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let duration: number | null = null;

      if (creativeFile) {
        let fileToUpload = creativeFile;
        if (IMAGE_TYPES.has(creativeFile.type)) {
          fileToUpload = await compressImageBeforeUpload(creativeFile, { maxDimension: 1920, quality: 0.85 });
        }
        kind = VIDEO_TYPES.has(fileToUpload.type) ? 'video' : 'image';
        const metadata = await mediaMetadata(fileToUpload);
        width = metadata.width;
        height = metadata.height;
        duration = metadata.duration;
        storagePath = `${snapshot.advertiser.id}/${creativeCampaignId}/${crypto.randomUUID()}-${safeName(fileToUpload.name)}`;
        const { error } = await supabase.storage.from('gsa-ad-creatives').upload(storagePath, fileToUpload, {
          cacheControl: '31536000',
          upsert: false,
          contentType: fileToUpload.type,
        });
        if (error) throw error;
        uploadedPath = storagePath;
      }

      const { data, error } = await supabase.rpc('gsa_advertiser_save_creative', {
        p_creative_id: null,
        p_campaign_id: creativeCampaignId,
        p_kind: kind,
        p_storage_path: storagePath,
        p_target_url: target || null,
        p_headline: creativeHeadline.trim() || null,
        p_body: creativeBody.trim() || null,
        p_alt_text: creativeAlt.trim() || null,
        p_width: width,
        p_height: height,
        p_duration_seconds: duration,
      });
      if (error || !data?.creative_id) throw error || new Error('Criativo não foi salvo.');
      const { error: submitError } = await supabase.rpc('gsa_advertiser_submit_creative', { p_creative_id: data.creative_id });
      if (submitError) throw submitError;

      toast.success('Material enviado para análise.');
      setCreativeConfirmOpen(false);
      setCreativeFile(null);
      setCreativeHeadline('');
      setCreativeBody('');
      setCreativeAlt('');
      setCreativeTarget('');
      await load(true);
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('gsa-ad-creatives').remove([uploadedPath]);
      toast.error(message(error, 'Não foi possível enviar o material.'));
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (company.trim().length < 2 || contactName.trim().length < 2 || phone.replace(/\D/g, '').length < 10) {
      return toast.error('Revise o nome da empresa, o responsável e o telefone.');
    }
    try {
      const { data, error } = await supabase.rpc('gsa_advertiser_update_profile', {
        p_payload: {
          company_name: company.trim(),
          document: documentValue,
          contact_name: contactName.trim(),
          contact_email: email.trim().toLowerCase(),
          contact_phone: phone,
        },
      });
      if (error || data?.success === false) throw error || new Error('Perfil não atualizado.');
      toast.success('Dados da empresa atualizados.');
      await load(true);
    } catch (error) {
      toast.error(message(error, 'Não foi possível atualizar o perfil.'));
    }
  };

  const metrics = useMemo(
    () => (snapshot?.campaigns || [])
      .flatMap((campaign) => campaign.metrics || [])
      .reduce(
        (total, row) => ({
          served: total.served + Number(row.served || 0),
          viewable: total.viewable + Number(row.viewable_impressions || 0),
          clicks: total.clicks + Number(row.clicks || 0),
          video: total.video + Number(row.video_completions || 0),
        }),
        { served: 0, viewable: 0, clicks: 0, video: 0 },
      ),
    [snapshot],
  );

  const reportCampaigns = useMemo(() => {
    if (!snapshot) return [];
    return selectedReportCampaignId === 'all'
      ? snapshot.campaigns
      : snapshot.campaigns.filter((campaign) => campaign.id === selectedReportCampaignId);
  }, [snapshot, selectedReportCampaignId]);

  const reportRows = useMemo(
    () => reportCampaigns.flatMap((campaign) => (campaign.metrics || []).map((row) => ({ ...row, campaignName: campaign.name }))),
    [reportCampaigns],
  );

  const reportMetrics = useMemo(
    () => reportRows.reduce(
      (total, row) => ({
        served: total.served + Number(row.served || 0),
        viewable: total.viewable + Number(row.viewable_impressions || 0),
        clicks: total.clicks + Number(row.clicks || 0),
        videoStarts: total.videoStarts + Number(row.video_starts || 0),
        videoCompletions: total.videoCompletions + Number(row.video_completions || 0),
      }),
      { served: 0, viewable: 0, clicks: 0, videoStarts: 0, videoCompletions: 0 },
    ),
    [reportRows],
  );

  if (checking) return <PortalLoading />;

  if (!snapshot) {
    return (
      <AdvertiserAccess
        portalError={portalError}
        accessMode={accessMode}
        onModeChange={(mode) => {
          setAccessMode(mode);
          setMagicLinkSent(false);
        }}
        protocol={protocol}
        setProtocol={setProtocol}
        validated={validated}
        validating={validating}
        onValidate={() => void validateProtocol()}
        onResetProtocol={resetProtocol}
        company={company}
        documentValue={documentValue}
        contactName={contactName}
        email={email}
        setEmail={setEmail}
        phone={phone}
        password={password}
        setPassword={setPassword}
        passwordConfirm={passwordConfirm}
        setPasswordConfirm={setPasswordConfirm}
        sending={sending}
        onRegister={register}
        onMagicLink={requestMagicLink}
        magicLinkSent={magicLinkSent}
        resendSeconds={resendSeconds}
        onRetry={() => void load()}
      />
    );
  }

  const advertiserName = snapshot.advertiser.trade_name || snapshot.advertiser.company_name || snapshot.advertiser.legal_name;
  const nextAction = nextActionForSnapshot(snapshot);
  const stage = stageForSnapshot(snapshot);
  const pendingProposals = snapshot.proposals.filter((proposal) => ['sent', 'negotiating', 'final_offer'].includes(proposal.status)).length;
  const activeCampaigns = snapshot.campaigns.filter((campaign) => campaign.status === 'active').length;
  const pendingPayments = snapshot.campaigns.filter((campaign) => campaign.payment && ['pending', 'processing', 'overdue', 'failed'].includes(campaign.payment.status)).length;
  const eligibleCreativeCampaigns = snapshot.campaigns.filter((campaign) => !['completed', 'cancelled'].includes(campaign.status));
  const allCreatives = snapshot.campaigns.flatMap((campaign) => (campaign.creatives || []).map((creative) => ({ creative, campaign })));
  const activeTabMeta = TAB_ITEMS.find((item) => item.id === tab) || TAB_ITEMS[0];

  return (
    <main className="min-h-screen bg-[#f3f1ec] text-[#192630]">
      <PortalStyles />
      <PortalHeader
        advertiserName={advertiserName}
        status={snapshot.advertiser.status}
        refreshing={refreshing}
        lastUpdatedAt={lastUpdatedAt}
        onRefresh={() => void load(true)}
        onLogout={() => void logout()}
        onOpenMenu={() => setMobileNavOpen(true)}
      />

      <div className="mx-auto grid max-w-[1480px] gap-7 px-4 py-6 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <PortalNavigation tab={tab} onSelect={selectTab} />

        <section className="min-w-0">
          <PageHeading
            eyebrow="Central do anunciante"
            title={activeTabMeta.label}
            description={activeTabMeta.description}
          />

          {tab === 'overview' && (
            <OverviewSection
              snapshot={snapshot}
              metrics={metrics}
              stage={stage}
              nextAction={nextAction}
              pendingProposals={pendingProposals}
              activeCampaigns={activeCampaigns}
              pendingPayments={pendingPayments}
              onSelectTab={selectTab}
            />
          )}

          {tab === 'requests' && <RequestsSection requests={snapshot.requests} />}

          {tab === 'proposals' && (
            <ProposalsSection
              proposals={snapshot.proposals}
              actionId={actionId}
              onAccept={setAcceptProposal}
              onCounter={(proposal) => {
                setCounterProposal(proposal);
                setCounterAmount(String(proposal.total_amount));
                setCounterMessage('');
              }}
              onReject={(proposal) => {
                setRejectProposal(proposal);
                setRejectMessage('');
              }}
            />
          )}

          {tab === 'campaigns' && (
            <CampaignsSection
              campaigns={snapshot.campaigns}
              proposals={snapshot.proposals}
              onReports={() => selectTab('reports')}
              onCreatives={() => selectTab('creatives')}
              onFinance={() => selectTab('finance')}
            />
          )}

          {tab === 'creatives' && (
            <CreativesSection
              campaigns={eligibleCreativeCampaigns}
              allCreatives={allCreatives}
              campaignId={creativeCampaignId}
              setCampaignId={setCreativeCampaignId}
              creativeType={creativeType}
              setCreativeType={handleCreativeType}
              file={creativeFile}
              previewUrl={creativePreviewUrl}
              onFile={handleCreativeFile}
              headline={creativeHeadline}
              setHeadline={setCreativeHeadline}
              body={creativeBody}
              setBody={setCreativeBody}
              alt={creativeAlt}
              setAlt={setCreativeAlt}
              target={creativeTarget}
              setTarget={setCreativeTarget}
              uploading={uploading}
              onSubmit={requestCreativeConfirmation}
            />
          )}

          {tab === 'finance' && <FinanceSection campaigns={snapshot.campaigns} />}

          {tab === 'reports' && (
            <ReportsSection
              campaigns={snapshot.campaigns}
              selectedCampaignId={selectedReportCampaignId}
              setSelectedCampaignId={setSelectedReportCampaignId}
              rows={reportRows}
              totals={reportMetrics}
            />
          )}

          {tab === 'profile' && (
            <ProfileSection
              advertiser={snapshot.advertiser}
              company={company}
              setCompany={setCompany}
              documentValue={documentValue}
              contactName={contactName}
              setContactName={setContactName}
              email={email}
              phone={phone}
              setPhone={setPhone}
              onSubmit={saveProfile}
            />
          )}
        </section>
      </div>

      {mobileNavOpen && (
        <MobileNavigation tab={tab} onSelect={selectTab} onClose={() => setMobileNavOpen(false)} />
      )}

      {acceptProposal && (
        <Modal title="Confirmar aceite da proposta" onClose={() => setAcceptProposal(null)} maxWidth="max-w-xl">
          <div className="space-y-5">
            <Notice tone="warning" title="Esta ação cria a campanha e inicia a etapa financeira">
              Revise o valor e as condições antes de confirmar. O aceite ficará registrado no histórico da negociação.
            </Notice>
            <div className="grid gap-px overflow-hidden border border-[#d9dde0] bg-[#d9dde0] sm:grid-cols-2">
              <SummaryCell label="Proposta" value={`Versão ${acceptProposal.current_version}`} />
              <SummaryCell label="Valor" value={money(acceptProposal.total_amount)} />
              <SummaryCell label="Validade" value={date(acceptProposal.valid_until)} />
              <SummaryCell label="Condição" value={acceptProposal.version?.payment_condition || 'Conforme proposta'} />
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setAcceptProposal(null)} className="adv-btn-secondary">Voltar e revisar</button>
              <button
                type="button"
                disabled={actionId === acceptProposal.id}
                onClick={() => void confirmAcceptProposal()}
                className="adv-btn-primary"
              >
                <CheckCircle2 className="h-4 w-4" />
                {actionId === acceptProposal.id ? 'Confirmando...' : 'Confirmar aceite'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {counterProposal && (
        <Modal title="Solicitar ajuste na proposta" onClose={() => setCounterProposal(null)} maxWidth="max-w-xl">
          <form onSubmit={sendCounter} className="space-y-5">
            <div className="border-l-4 border-[#b18a3d] bg-[#faf5e9] px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#806128]">Valor atual</p>
              <p className="mt-1 text-2xl font-black text-[#192630]">{money(counterProposal.total_amount)}</p>
            </div>
            <Field label="Valor proposto" required>
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={counterAmount} onChange={(event) => setCounterAmount(event.target.value)} className="adv-field-input" />
            </Field>
            <Field label="Justificativa do ajuste" required>
              <textarea value={counterMessage} onChange={(event) => setCounterMessage(event.target.value)} rows={5} className="adv-field-input resize-y" placeholder="Explique a condição que sua empresa precisa avaliar." />
            </Field>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setCounterProposal(null)} className="adv-btn-secondary">Cancelar</button>
              <button disabled={actionId === counterProposal.id} className="adv-btn-primary">
                <Send className="h-4 w-4" />
                {actionId === counterProposal.id ? 'Enviando...' : 'Enviar solicitação de ajuste'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {rejectProposal && (
        <Modal title="Recusar proposta" onClose={() => setRejectProposal(null)} maxWidth="max-w-xl">
          <form onSubmit={reject} className="space-y-5">
            <Notice tone="danger" title="A proposta será encerrada">
              A equipe da GSA receberá a recusa e o motivo informado. Essa ação ficará registrada no histórico.
            </Notice>
            <Field label="Motivo da recusa">
              <textarea value={rejectMessage} onChange={(event) => setRejectMessage(event.target.value)} rows={5} className="adv-field-input resize-y" placeholder="Informe o motivo para ajudar a equipe comercial." />
            </Field>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setRejectProposal(null)} className="adv-btn-secondary">Voltar</button>
              <button disabled={actionId === rejectProposal.id} className="adv-btn-danger">
                {actionId === rejectProposal.id ? 'Confirmando...' : 'Confirmar recusa'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {creativeConfirmOpen && (
        <Modal title="Confirmar envio do material" onClose={() => !uploading && setCreativeConfirmOpen(false)} maxWidth="max-w-2xl">
          <div className="space-y-5">
            <Notice tone="info" title="O material será enviado para análise da GSA">
              Após o envio, a equipe poderá aprovar o conteúdo ou registrar uma orientação de correção.
            </Notice>
            <div className="grid gap-px overflow-hidden border border-[#d9dde0] bg-[#d9dde0] sm:grid-cols-2">
              <SummaryCell label="Campanha" value={eligibleCreativeCampaigns.find((campaign) => campaign.id === creativeCampaignId)?.name || 'Não selecionada'} />
              <SummaryCell label="Tipo" value={creativeType === 'image' ? 'Imagem' : creativeType === 'video' ? 'Vídeo' : 'Conteúdo textual'} />
              <SummaryCell label="Arquivo" value={creativeFile ? `${creativeFile.name} · ${formatFileSize(creativeFile.size)}` : 'Sem arquivo'} />
              <SummaryCell label="Destino" value={creativeTarget.trim() || 'Sem link de destino'} />
            </div>
            {(creativeHeadline || creativeBody) && (
              <div className="border border-[#d9dde0] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#69757e]">Conteúdo informado</p>
                {creativeHeadline && <p className="mt-2 font-extrabold">{creativeHeadline}</p>}
                {creativeBody && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#59666f]">{creativeBody}</p>}
              </div>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={uploading} onClick={() => setCreativeConfirmOpen(false)} className="adv-btn-secondary">Revisar campos</button>
              <button type="button" disabled={uploading} onClick={() => void uploadCreative()} className="adv-btn-primary">
                <UploadCloud className="h-4 w-4" />
                {uploading ? 'Enviando material...' : 'Confirmar e enviar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}

function AdvertiserAccess({
  portalError,
  accessMode,
  onModeChange,
  protocol,
  setProtocol,
  validated,
  validating,
  onValidate,
  onResetProtocol,
  company,
  documentValue,
  contactName,
  email,
  setEmail,
  phone,
  password,
  setPassword,
  passwordConfirm,
  setPasswordConfirm,
  sending,
  onRegister,
  onMagicLink,
  magicLinkSent,
  resendSeconds,
  onRetry,
}: {
  portalError: string | null;
  accessMode: 'protocol' | 'email';
  onModeChange: (mode: 'protocol' | 'email') => void;
  protocol: string;
  setProtocol: (value: string) => void;
  validated: boolean;
  validating: boolean;
  onValidate: () => void;
  onResetProtocol: () => void;
  company: string;
  documentValue: string;
  contactName: string;
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  password: string;
  setPassword: (value: string) => void;
  passwordConfirm: string;
  setPasswordConfirm: (value: string) => void;
  sending: boolean;
  onRegister: (event: FormEvent) => void;
  onMagicLink: (event: FormEvent) => void;
  magicLinkSent: boolean;
  resendSeconds: number;
  onRetry: () => void;
}) {
  return (
    <main className="min-h-screen bg-[#f3f1ec] text-[#192630]">
      <PortalStyles />
      <header className="border-b border-[#d8d3ca] bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button type="button" onClick={() => navigate(routes.public.ads())} className="inline-flex items-center gap-2 text-sm font-bold text-[#5e6a72] hover:text-[#192630]">
            <ArrowLeft className="h-4 w-4" /> Voltar aos anúncios
          </button>
          <div className="text-right">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#8a6b2f]">GSA Anúncios</p>
            <p className="mt-1 text-sm font-extrabold">Central do anunciante</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-16">
        <div className="grid overflow-hidden border border-[#cfd4d7] bg-white shadow-[0_24px_70px_rgba(25,38,48,0.09)] lg:grid-cols-[0.42fr_0.58fr]">
          <aside className="bg-[#112838] px-6 py-9 text-white sm:px-9 lg:px-11 lg:py-12">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#d2b66f]">Acesso seguro</p>
            <h1 className="mt-5 max-w-md text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">Acompanhe sua campanha do briefing aos resultados.</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">Esta central reúne solicitações, propostas, pagamentos, materiais, campanhas e métricas da sua empresa.</p>

            <ol className="mt-10 border-y border-white/12">
              {[
                ['01', 'Valide o protocolo', 'Use o código recebido após o envio da solicitação.'],
                ['02', 'Crie ou acesse sua conta', 'O e-mail precisa estar vinculado ao atendimento.'],
                ['03', 'Acompanhe cada etapa', 'Todas as decisões e atualizações ficam registradas.'],
              ].map(([number, title, description]) => (
                <li key={number} className="grid grid-cols-[36px_1fr] gap-4 border-b border-white/10 py-5 last:border-b-0">
                  <span className="font-mono text-xs font-black text-[#d2b66f]">{number}</span>
                  <div>
                    <h2 className="text-sm font-extrabold">{title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-9 flex items-start gap-3 border border-white/12 bg-white/[0.04] p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#d2b66f]" />
              <p className="text-xs leading-6 text-slate-300">O acesso é protegido por autenticação e os dados exibidos pertencem somente ao anunciante vinculado.</p>
            </div>
          </aside>

          <div className="px-5 py-8 sm:px-9 lg:px-12 lg:py-12">
            {portalError && (
              <div className="mb-6">
                <Notice tone="danger" title="Não foi possível consultar sua sessão">
                  {portalError}
                  <button type="button" onClick={onRetry} className="ml-2 font-extrabold underline">Tentar novamente</button>
                </Notice>
              </div>
            )}

            <div className="mb-8">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#806128]">Portal do anunciante</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.03em]">Entre na sua central</h2>
              <p className="mt-3 text-sm leading-6 text-[#66727a]">Escolha o tipo de acesso de acordo com a situação da sua empresa.</p>
            </div>

            <div className="grid grid-cols-2 border border-[#d7dbde] bg-[#f4f3ef] p-1">
              <button
                type="button"
                onClick={() => onModeChange('protocol')}
                className={`flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-extrabold transition ${accessMode === 'protocol' ? 'bg-white text-[#192630] shadow-sm' : 'text-[#6b767e]'}`}
              >
                <KeyRound className="h-4 w-4" /> Primeiro acesso
              </button>
              <button
                type="button"
                onClick={() => onModeChange('email')}
                className={`flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-extrabold transition ${accessMode === 'email' ? 'bg-white text-[#192630] shadow-sm' : 'text-[#6b767e]'}`}
              >
                <Mail className="h-4 w-4" /> Já sou cadastrado
              </button>
            </div>

            {accessMode === 'protocol' ? (
              !validated ? (
                <form onSubmit={(event) => { event.preventDefault(); onValidate(); }} className="mt-8 space-y-5">
                  <Field label="Protocolo da solicitação" required hint="O código começa com ADS e foi exibido após o envio do formulário.">
                    <input
                      value={protocol}
                      onChange={(event) => setProtocol(event.target.value.toUpperCase())}
                      placeholder="ADS-20260724-XXXXXXXXXXXX"
                      className="adv-field-input font-mono uppercase tracking-[0.04em]"
                    />
                  </Field>
                  <button disabled={validating} className="adv-btn-primary w-full justify-center py-3.5">
                    <ClipboardCheck className="h-4 w-4" />
                    {validating ? 'Validando protocolo...' : 'Validar e continuar'}
                  </button>
                  <p className="text-center text-xs leading-5 text-[#748089]">Ainda não enviou uma solicitação? <button type="button" onClick={() => navigate(routes.public.advertise())} className="font-extrabold text-[#806128] underline">Acesse Anuncie Conosco</button>.</p>
                </form>
              ) : (
                <form onSubmit={onRegister} className="mt-8 space-y-6">
                  <Notice tone="success" title="Protocolo validado com sucesso">
                    Confira os dados abaixo e crie sua senha de acesso.
                  </Notice>

                  <div className="border border-[#d9dde0] bg-[#faf9f6]">
                    <div className="flex items-center justify-between border-b border-[#d9dde0] px-4 py-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#68747c]">Solicitação localizada</p>
                        <p className="mt-1 font-mono text-sm font-black text-[#806128]">{protocol}</p>
                      </div>
                      <button type="button" onClick={onResetProtocol} className="text-xs font-extrabold text-[#806128] underline">Trocar protocolo</button>
                    </div>
                    <dl className="grid gap-px bg-[#d9dde0] sm:grid-cols-2">
                      <SummaryCell label="Empresa" value={company} />
                      <SummaryCell label="Documento" value={protectDocument(documentValue)} />
                      <SummaryCell label="Responsável" value={contactName} />
                      <SummaryCell label="Contato" value={`${email} · ${phone}`} />
                    </dl>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Crie uma senha" required hint="Use ao menos 8 caracteres.">
                      <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="adv-field-input" autoComplete="new-password" />
                    </Field>
                    <Field label="Confirme a senha" required>
                      <input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} className="adv-field-input" autoComplete="new-password" />
                    </Field>
                  </div>

                  <button disabled={sending} className="adv-btn-primary w-full justify-center py-3.5">
                    <LockKeyhole className="h-4 w-4" />
                    {sending ? 'Criando acesso...' : 'Criar conta e entrar'}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={onMagicLink} className="mt-8 space-y-5">
                {magicLinkSent && (
                  <Notice tone="success" title="Link seguro enviado">
                    Verifique a caixa de entrada e a pasta de spam. O link abrirá esta central já autenticada.
                  </Notice>
                )}
                <Field label="E-mail cadastrado" required hint="Use o mesmo e-mail vinculado à proposta ou à solicitação.">
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="adv-field-input" autoComplete="email" placeholder="contato@empresa.com.br" />
                </Field>
                <button disabled={sending || resendSeconds > 0} className="adv-btn-primary w-full justify-center py-3.5">
                  <Mail className="h-4 w-4" />
                  {sending ? 'Enviando link...' : resendSeconds > 0 ? `Reenviar em ${resendSeconds}s` : magicLinkSent ? 'Reenviar link seguro' : 'Enviar link seguro'}
                </button>
                <p className="text-center text-xs leading-5 text-[#748089]">O link é enviado somente para contas já liberadas pela GSA.</p>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function PortalLoading() {
  return (
    <main className="min-h-screen bg-[#f3f1ec]">
      <div className="h-20 border-b border-[#d8d3ca] bg-[#112838]" />
      <div className="mx-auto grid max-w-[1480px] gap-7 px-4 py-8 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-8">
        <div className="hidden h-[540px] animate-pulse border border-[#d9dde0] bg-white lg:block" />
        <div className="space-y-6">
          <div className="h-24 animate-pulse bg-white" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse border border-[#d9dde0] bg-white" />)}
          </div>
          <div className="h-80 animate-pulse border border-[#d9dde0] bg-white" />
        </div>
      </div>
      <span className="sr-only" role="status">Carregando portal do anunciante...</span>
    </main>
  );
}

function PortalHeader({ advertiserName, status, refreshing, lastUpdatedAt, onRefresh, onLogout, onOpenMenu }: {
  advertiserName: string;
  status: string;
  refreshing: boolean;
  lastUpdatedAt: string | null;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#243d4d] bg-[#112838] text-white">
      <div className="mx-auto flex min-h-20 max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onOpenMenu} className="flex h-10 w-10 items-center justify-center border border-white/15 lg:hidden" aria-label="Abrir navegação">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#d2b66f]/60 text-[#d2b66f]">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#d2b66f]">GSA Anúncios</p>
            <p className="mt-1 truncate text-sm font-extrabold sm:text-base">{advertiserName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden text-right md:block">
            <div className="flex items-center justify-end gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <p className="text-xs font-extrabold">{status === 'active' ? 'Conta ativa' : status || 'Conta vinculada'}</p>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Atualizado em {dateTime(lastUpdatedAt)}</p>
          </div>
          <button type="button" onClick={onRefresh} disabled={refreshing} className="flex h-10 w-10 items-center justify-center border border-white/15 text-slate-200 hover:border-[#d2b66f] hover:text-[#d2b66f]" aria-label="Atualizar portal">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onLogout} className="inline-flex h-10 items-center gap-2 border border-white/15 px-3 text-sm font-extrabold text-slate-200 hover:border-[#d2b66f] hover:text-[#d2b66f]">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function PortalNavigation({ tab, onSelect }: { tab: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <aside className="hidden h-fit border border-[#d6dadd] bg-white lg:sticky lg:top-28 lg:block">
      <div className="border-b border-[#d6dadd] px-5 py-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#806128]">Navegação</p>
        <p className="mt-2 text-sm leading-6 text-[#68747c]">Acompanhe cada etapa da operação publicitária.</p>
      </div>
      <nav className="p-2" aria-label="Área do anunciante">
        {TAB_ITEMS.map(({ id, label, description, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`group flex w-full items-start gap-3 border-l-4 px-4 py-3.5 text-left transition ${active ? 'border-[#b18a3d] bg-[#f7f3e9]' : 'border-transparent hover:bg-[#f6f6f3]'}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-[#806128]' : 'text-[#78838a] group-hover:text-[#192630]'}`} />
              <span>
                <strong className={`block text-sm ${active ? 'text-[#192630]' : 'text-[#4d5961]'}`}>{label}</strong>
                <small className="mt-1 block text-[11px] leading-4 text-[#8a949a]">{description}</small>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileNavigation({ tab, onSelect, onClose }: { tab: Tab; onSelect: (tab: Tab) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-[#06111a]/75 lg:hidden" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="h-full w-[88%] max-w-sm overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#d9dde0] px-5 py-5">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#806128]">Central do anunciante</p>
            <p className="mt-1 font-black">Navegação</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center border border-[#d9dde0]" aria-label="Fechar navegação">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-3">
          {TAB_ITEMS.map(({ id, label, description, icon: Icon }) => (
            <button key={id} type="button" onClick={() => onSelect(id)} className={`flex w-full items-start gap-3 border-l-4 px-4 py-4 text-left ${tab === id ? 'border-[#b18a3d] bg-[#f7f3e9]' : 'border-transparent'}`}>
              <Icon className="mt-0.5 h-4 w-4 text-[#806128]" />
              <span><strong className="block text-sm">{label}</strong><small className="mt-1 block text-xs text-[#7d878e]">{description}</small></span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-7 border-b border-[#d6dadd] pb-6">
      <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#806128]">{eyebrow}</p>
      <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#65717a]">{description}</p>
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ snapshot, metrics, stage, nextAction, pendingProposals, activeCampaigns, pendingPayments, onSelectTab }: {
  snapshot: AdvertiserPortalSnapshot;
  metrics: { served: number; viewable: number; clicks: number; video: number };
  stage: number;
  nextAction: { eyebrow: string; title: string; description: string; tab: Tab; cta: string; tone: StatusTone };
  pendingProposals: number;
  activeCampaigns: number;
  pendingPayments: number;
  onSelectTab: (tab: Tab) => void;
}) {
  const recentRequest = [...snapshot.requests].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const activeCampaign = snapshot.campaigns.find((campaign) => campaign.status === 'active') || snapshot.campaigns.find((campaign) => campaign.status === 'scheduled');

  return (
    <div className="space-y-6">
      <section className={`border-l-4 bg-white px-5 py-6 shadow-[0_12px_36px_rgba(25,38,48,0.06)] sm:px-7 ${toneBorder(nextAction.tone)}`}>
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#806128]">{nextAction.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.025em]">{nextAction.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#65717a]">{nextAction.description}</p>
          </div>
          <button
            type="button"
            onClick={() => nextAction.cta === 'Conhecer formatos' ? navigate(routes.public.advertise()) : onSelectTab(nextAction.tab)}
            className="adv-btn-primary shrink-0"
          >
            {nextAction.cta} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <MetricStrip
        items={[
          { label: 'Solicitações', value: snapshot.requests.length, detail: recentRequest ? `Última em ${date(recentRequest.created_at)}` : 'Nenhuma enviada', icon: ClipboardList },
          { label: 'Propostas em decisão', value: pendingProposals, detail: pendingProposals ? 'Aguardando sua análise' : 'Nenhuma pendência', icon: MessageSquareText },
          { label: 'Campanhas ativas', value: activeCampaigns, detail: activeCampaign ? CAMPAIGN_LABELS[activeCampaign.status] : 'Nenhuma em exibição', icon: Megaphone },
          { label: 'Pendências financeiras', value: pendingPayments, detail: pendingPayments ? 'Consulte o financeiro' : 'Nenhuma pendência', icon: CreditCard },
        ]}
      />

      <section className="border border-[#d6dadd] bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-[#d6dadd] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#806128]">Andamento comercial</p>
            <h2 className="mt-2 text-xl font-black">Da solicitação à conclusão</h2>
          </div>
          <p className="text-xs font-bold text-[#6c777f]">Etapa atual: {stage ? PROCESS_STEPS[Math.min(stage, PROCESS_STEPS.length) - 1] : 'Aguardando solicitação'}</p>
        </div>
        <ProcessTimeline stage={stage} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="border border-[#d6dadd] bg-white">
          <div className="border-b border-[#d6dadd] px-5 py-5 sm:px-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#806128]">Situação operacional</p>
            <h2 className="mt-2 text-xl font-black">Campanhas e materiais</h2>
          </div>
          <div className="divide-y divide-[#e1e4e6]">
            {snapshot.campaigns.length ? snapshot.campaigns.slice(0, 4).map((campaign) => (
              <button key={campaign.id} type="button" onClick={() => onSelectTab('campaigns')} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#faf9f6] sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{campaign.name}</p>
                  <p className="mt-1 text-xs text-[#748089]">{date(campaign.starts_at)} até {date(campaign.ends_at)} · {(campaign.creatives || []).length} material(is)</p>
                </div>
                <StatusBadge tone={campaignTone(campaign.status)}>{CAMPAIGN_LABELS[campaign.status] || campaign.status}</StatusBadge>
              </button>
            )) : (
              <EmptyState icon={Megaphone} title="Nenhuma campanha criada" description="Uma campanha será criada automaticamente após o aceite da proposta." />
            )}
          </div>
        </section>

        <section className="border border-[#d6dadd] bg-[#112838] p-6 text-white">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#d2b66f]">Resultados consolidados</p>
          <h2 className="mt-3 text-xl font-black">Desempenho registrado</h2>
          <dl className="mt-6 grid grid-cols-2 gap-px bg-white/10">
            <DarkMetric label="Exibições" value={metrics.served} />
            <DarkMetric label="Visualizações" value={metrics.viewable} />
            <DarkMetric label="Cliques" value={metrics.clicks} />
            <DarkMetric label="Vídeos concluídos" value={metrics.video} />
          </dl>
          <button type="button" onClick={() => onSelectTab('reports')} className="mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-[#e1c77d] hover:text-white">
            Ver resultados completos <ChevronRight className="h-4 w-4" />
          </button>
        </section>
      </div>
    </div>
  );
}

function RequestsSection({ requests }: { requests: AdvertisingRequest[] }) {
  if (!requests.length) {
    return <EmptyState icon={ClipboardList} title="Nenhuma solicitação vinculada" description="Envie um briefing pela página Anuncie Conosco e vincule o protocolo a esta conta." actionLabel="Criar solicitação" onAction={() => navigate(routes.public.advertise())} />;
  }

  return (
    <div className="space-y-5">
      {requests.map((request) => {
        const reference = extractCreativeReference(request.notes);
        const notes = cleanRequestNotes(request.notes);
        return (
          <article key={request.id} className="border border-[#d6dadd] bg-white">
            <header className="flex flex-col justify-between gap-4 border-b border-[#d6dadd] px-5 py-5 sm:flex-row sm:items-start sm:px-6">
              <div>
                <p className="font-mono text-xs font-black text-[#806128]">{request.protocol}</p>
                <h2 className="mt-2 text-xl font-black">{request.company_name}</h2>
                <p className="mt-2 text-xs text-[#748089]">Enviada em {dateTime(request.created_at)}</p>
              </div>
              <StatusBadge tone={requestTone(request.status)}>{REQUEST_LABELS[request.status] || request.status}</StatusBadge>
            </header>

            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="border-b border-[#d6dadd] px-5 py-6 lg:border-b-0 lg:border-r sm:px-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#69757e]">Objetivo da campanha</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#4f5d66]">{request.objective}</p>
                {notes && (
                  <div className="mt-5 border-l-2 border-[#b18a3d] bg-[#faf7ef] px-4 py-3">
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#806128]">Observações</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#59666f]">{notes}</p>
                  </div>
                )}
              </div>

              <dl className="grid gap-px bg-[#d9dde0] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <SummaryCell label="Período solicitado" value={`${date(request.desired_start_date)} até ${date(request.desired_end_date)}`} />
                <SummaryCell label="Investimento estimado" value={money(request.intended_budget)} />
                <SummaryCell label="Formatos" value={request.desired_formats.map((item) => FORMAT_LABELS[item] || item).join(', ') || 'A definir'} />
                <SummaryCell label="Áreas de interesse" value={request.desired_pages.map((item) => PLACEMENT_LABELS[item] || item).join(', ') || 'A definir'} />
                <SummaryCell label="Dispositivos" value={request.devices.map((item) => DEVICE_LABELS[item] || item).join(', ') || 'A definir'} />
                <SummaryCell label="Criação pela GSA" value={request.needs_creative_service ? reference ? `Sim · ${reference}` : 'Sim' : 'Não'} />
              </dl>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProposalsSection({ proposals, actionId, onAccept, onCounter, onReject }: {
  proposals: AdvertisingProposal[];
  actionId: string | null;
  onAccept: (proposal: AdvertisingProposal) => void;
  onCounter: (proposal: AdvertisingProposal) => void;
  onReject: (proposal: AdvertisingProposal) => void;
}) {
  if (!proposals.length) {
    return <EmptyState icon={MessageSquareText} title="Nenhuma proposta disponível" description="Quando a análise comercial for concluída, a proposta aparecerá nesta área." />;
  }

  return (
    <div className="space-y-6">
      {proposals.map((proposal) => {
        const canDecide = ['sent', 'negotiating', 'final_offer'].includes(proposal.status);
        return (
          <article key={proposal.id} className="border border-[#d6dadd] bg-white">
            <header className="flex flex-col justify-between gap-5 border-b border-[#d6dadd] px-5 py-6 sm:flex-row sm:items-start sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-black">Proposta comercial</h2>
                  <StatusBadge tone={proposalTone(proposal.status)}>{PROPOSAL_LABELS[proposal.status] || proposal.status}</StatusBadge>
                </div>
                <p className="mt-2 text-sm text-[#69757e]">Versão {proposal.current_version} · válida até {date(proposal.valid_until)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#69757e]">Valor total</p>
                <p className="mt-1 text-3xl font-black tracking-[-0.03em]">{money(proposal.total_amount)}</p>
              </div>
            </header>

            <div className="grid gap-px bg-[#d9dde0] sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCell label="Período" value={proposal.version ? `${date(proposal.version.starts_on)} até ${date(proposal.version.ends_on)}` : 'A definir'} />
              <SummaryCell label="Duração" value={proposal.version?.duration_days ? `${proposal.version.duration_days} dias` : 'A definir'} />
              <SummaryCell label="Frequência" value={proposal.version ? FREQUENCY_LABELS[proposal.version.frequency_model] || proposal.version.frequency_model : 'A definir'} />
              <SummaryCell label="Limite de exibições" value={proposal.version?.impression_limit ? Number(proposal.version.impression_limit).toLocaleString('pt-BR') : 'Conforme disponibilidade'} />
            </div>

            <div className="grid gap-6 px-5 py-6 sm:px-6 xl:grid-cols-[1fr_0.9fr]">
              <div className="space-y-5">
                <DetailBlock title="Formatos contratados">
                  <TagList items={(proposal.version?.formats || []).map((item) => FORMAT_LABELS[item] || item)} empty="A definir" />
                </DetailBlock>
                <DetailBlock title="Posições previstas">
                  <TagList items={(proposal.version?.placement_codes || []).map((item) => PLACEMENT_LABELS[item] || item)} empty="A definir" />
                </DetailBlock>
                {proposal.version?.terms && (
                  <DetailBlock title="Condições e observações">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-[#526069]">{proposal.version.terms}</p>
                  </DetailBlock>
                )}
                {proposal.version?.payment_condition && (
                  <DetailBlock title="Condição de pagamento">
                    <p className="text-sm leading-6 text-[#526069]">{proposal.version.payment_condition}</p>
                  </DetailBlock>
                )}
              </div>

              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#69757e]">Histórico da negociação</h3>
                {proposal.negotiations?.length ? (
                  <div className="mt-4 border-l border-[#cfd4d7] pl-5">
                    {proposal.negotiations.map((item) => (
                      <div key={item.id} className="relative pb-5 last:pb-0">
                        <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#b18a3d] ring-1 ring-[#b18a3d]" />
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="text-sm font-extrabold">{item.actor_type === 'admin' ? 'Equipe GSA' : 'Sua empresa'}</p>
                          <p className="text-xs text-[#7b858c]">{dateTime(item.created_at)}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#56636b]">{item.message}</p>
                        {item.proposed_amount ? <p className="mt-2 text-sm font-black text-[#806128]">{money(item.proposed_amount)}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 border border-dashed border-[#d6dadd] px-4 py-5 text-sm text-[#778188]">Nenhuma interação registrada até o momento.</p>
                )}
              </div>
            </div>

            {canDecide && (
              <footer className="flex flex-col justify-between gap-4 border-t border-[#d6dadd] bg-[#faf9f6] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
                <p className="text-sm leading-6 text-[#5d6971]">Analise as condições e escolha a ação adequada para continuar o atendimento.</p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={actionId === proposal.id} type="button" onClick={() => onAccept(proposal)} className="adv-btn-success"><CheckCircle2 className="h-4 w-4" /> Aceitar proposta</button>
                  <button type="button" onClick={() => onCounter(proposal)} className="adv-btn-secondary">Solicitar ajuste</button>
                  <button type="button" onClick={() => onReject(proposal)} className="adv-btn-danger-outline">Recusar</button>
                </div>
              </footer>
            )}
          </article>
        );
      })}
    </div>
  );
}

function CampaignsSection({ campaigns, proposals, onReports, onCreatives, onFinance }: {
  campaigns: AdvertisingCampaign[];
  proposals: AdvertisingProposal[];
  onReports: () => void;
  onCreatives: () => void;
  onFinance: () => void;
}) {
  if (!campaigns.length) {
    return <EmptyState icon={Megaphone} title="Nenhuma campanha criada" description="A campanha será criada após o aceite de uma proposta comercial." />;
  }

  return (
    <div className="space-y-6">
      {campaigns.map((campaign) => {
        const progress = campaignProgress(campaign);
        const proposal = proposals.find((item) => item.id === campaign.proposal_id);
        const approvedCreative = campaign.creatives.find((creative) => creative.status === 'approved');
        return (
          <article key={campaign.id} className="border border-[#d6dadd] bg-white">
            <header className="flex flex-col justify-between gap-4 border-b border-[#d6dadd] px-5 py-6 sm:flex-row sm:items-start sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-black">{campaign.name}</h2>
                  <StatusBadge tone={campaignTone(campaign.status)}>{CAMPAIGN_LABELS[campaign.status] || campaign.status}</StatusBadge>
                </div>
                <p className="mt-2 text-sm text-[#6b767e]">{date(campaign.starts_at)} até {date(campaign.ends_at)}</p>
              </div>
              <p className="text-xs font-bold text-[#748089]">Criada em {date(campaign.created_at)}</p>
            </header>

            <div className="grid gap-px bg-[#d9dde0] sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCell label="Dispositivos" value={(campaign.devices || []).map((item) => DEVICE_LABELS[item] || item).join(', ') || 'A definir'} />
              <SummaryCell label="Frequência" value={campaign.frequency_model ? FREQUENCY_LABELS[campaign.frequency_model] || campaign.frequency_model : 'A definir'} />
              <SummaryCell label="Exibições registradas" value={Number(campaign.served_count || 0).toLocaleString('pt-BR')} />
              <SummaryCell label="Limite contratado" value={campaign.impression_limit ? Number(campaign.impression_limit).toLocaleString('pt-BR') : 'Sem limite informado'} />
            </div>

            <div className="grid gap-6 px-5 py-6 sm:px-6 xl:grid-cols-[1fr_0.85fr]">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#69757e]">Progresso da campanha</h3>
                {progress !== null ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-bold text-[#647078]"><span>{progress}% do limite utilizado</span><span>{Number(campaign.served_count || 0).toLocaleString('pt-BR')} / {Number(campaign.impression_limit || 0).toLocaleString('pt-BR')}</span></div>
                    <div className="mt-2 h-2 bg-[#e4e5e2]"><div className="h-full bg-[#b18a3d]" style={{ width: `${progress}%` }} /></div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-[#68747c]">O andamento será exibido assim que houver limite de impressões definido e entrega registrada.</p>
                )}

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <OperationalItem
                    icon={CreditCard}
                    label="Pagamento"
                    value={campaign.payment ? PAYMENT_LABELS[campaign.payment.status] : 'Não disponível'}
                    tone={campaign.payment ? paymentTone(campaign.payment.status) : 'neutral'}
                  />
                  <OperationalItem
                    icon={FileImage}
                    label="Material aprovado"
                    value={approvedCreative ? approvedCreative.headline || 'Material aprovado' : campaign.creatives.length ? 'Em análise ou correção' : 'Ainda não enviado'}
                    tone={approvedCreative ? 'success' : campaign.creatives.some((creative) => creative.status === 'rejected') ? 'danger' : 'warning'}
                  />
                </div>
              </div>

              <div className="border border-[#d9dde0] bg-[#faf9f6] p-5">
                <h3 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#69757e]">Condições vinculadas</h3>
                <dl className="mt-4 divide-y divide-[#dfe2e4]">
                  <InlineDefinition label="Proposta" value={proposal ? `Versão ${proposal.current_version}` : 'Não localizada'} />
                  <InlineDefinition label="Formatos" value={(proposal?.version?.formats || []).map((item) => FORMAT_LABELS[item] || item).join(', ') || 'A definir'} />
                  <InlineDefinition label="Posições" value={(proposal?.version?.placement_codes || []).map((item) => PLACEMENT_LABELS[item] || item).join(', ') || 'A definir'} />
                  <InlineDefinition label="Materiais enviados" value={String(campaign.creatives.length)} />
                </dl>
              </div>
            </div>

            <footer className="flex flex-wrap gap-2 border-t border-[#d6dadd] bg-[#faf9f6] px-5 py-4 sm:px-6">
              <button type="button" onClick={onReports} className="adv-btn-secondary"><BarChart3 className="h-4 w-4" /> Ver resultados</button>
              {!['completed', 'cancelled'].includes(campaign.status) && <button type="button" onClick={onCreatives} className="adv-btn-secondary"><FileImage className="h-4 w-4" /> Materiais</button>}
              {campaign.payment && campaign.payment.status !== 'paid' && <button type="button" onClick={onFinance} className="adv-btn-secondary"><WalletCards className="h-4 w-4" /> Financeiro</button>}
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function CreativesSection({
  campaigns,
  allCreatives,
  campaignId,
  setCampaignId,
  creativeType,
  setCreativeType,
  file,
  previewUrl,
  onFile,
  headline,
  setHeadline,
  body,
  setBody,
  alt,
  setAlt,
  target,
  setTarget,
  uploading,
  onSubmit,
}: {
  campaigns: AdvertisingCampaign[];
  allCreatives: Array<{ creative: AdvertisingCreative; campaign: AdvertisingCampaign }>;
  campaignId: string;
  setCampaignId: (value: string) => void;
  creativeType: CreativeType;
  setCreativeType: (value: CreativeType) => void;
  file: File | null;
  previewUrl: string | null;
  onFile: (file: File | null) => void;
  headline: string;
  setHeadline: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  alt: string;
  setAlt: (value: string) => void;
  target: string;
  setTarget: (value: string) => void;
  uploading: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="grid gap-6 2xl:grid-cols-[0.88fr_1.12fr]">
      <section className="h-fit border border-[#d6dadd] bg-white 2xl:sticky 2xl:top-28">
        <div className="border-b border-[#d6dadd] px-5 py-5 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#806128]">Novo envio</p>
          <h2 className="mt-2 text-xl font-black">Material da campanha</h2>
          <p className="mt-2 text-sm leading-6 text-[#68747c]">Escolha a campanha, prepare o conteúdo e confirme antes do envio.</p>
        </div>

        {!campaigns.length ? (
          <EmptyState icon={FileImage} title="Nenhuma campanha aceita material" description="Campanhas concluídas ou canceladas não recebem novos criativos." />
        ) : (
          <form onSubmit={onSubmit} className="space-y-6 px-5 py-6 sm:px-6">
            <Field label="Campanha" required>
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="adv-field-input">
                <option value="">Selecione a campanha</option>
                {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
              </select>
            </Field>

            <fieldset>
              <legend className="text-sm font-extrabold">Tipo de material</legend>
              <div className="mt-3 grid grid-cols-3 gap-px border border-[#d6dadd] bg-[#d6dadd]">
                {[
                  { id: 'image' as const, label: 'Imagem', icon: ImageIcon },
                  { id: 'video' as const, label: 'Vídeo', icon: Video },
                  { id: 'text' as const, label: 'Texto', icon: Type },
                ].map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => setCreativeType(id)} className={`flex min-h-20 flex-col items-center justify-center gap-2 px-2 text-xs font-extrabold ${creativeType === id ? 'bg-[#112838] text-white' : 'bg-white text-[#5e6a72] hover:bg-[#faf9f6]'}`}>
                    <Icon className={`h-5 w-5 ${creativeType === id ? 'text-[#d2b66f]' : 'text-[#806128]'}`} /> {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {creativeType !== 'text' && (
              <div>
                <p className="text-sm font-extrabold">Arquivo do material <span className="text-[#9d2b2b]">*</span></p>
                <label className="mt-3 flex min-h-44 cursor-pointer flex-col items-center justify-center border border-dashed border-[#aeb7bd] bg-[#faf9f6] p-5 text-center hover:border-[#b18a3d]">
                  {previewUrl ? (
                    creativeType === 'image' ? (
                      <img src={previewUrl} alt="Prévia do arquivo selecionado" className="max-h-40 max-w-full object-contain" />
                    ) : (
                      <video src={previewUrl} controls className="max-h-40 max-w-full" />
                    )
                  ) : (
                    <>
                      <UploadCloud className="h-8 w-8 text-[#806128]" />
                      <strong className="mt-3 text-sm">Clique para selecionar o arquivo</strong>
                      <span className="mt-2 text-xs leading-5 text-[#748089]">Imagem: JPG, PNG, WEBP ou GIF até 10 MB. Vídeo: MP4 ou WEBM até 50 MB.</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="sr-only"
                    accept={creativeType === 'image' ? 'image/jpeg,image/png,image/webp,image/gif' : 'video/mp4,video/webm'}
                    onChange={(event) => onFile(event.target.files?.[0] || null)}
                  />
                </label>
                {file && (
                  <div className="mt-3 flex items-center justify-between gap-3 border border-[#d9dde0] px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-bold">{file.name} · {formatFileSize(file.size)}</span>
                    <button type="button" onClick={() => onFile(null)} className="font-extrabold text-[#9d2b2b]">Remover</button>
                  </div>
                )}
              </div>
            )}

            <Field label="Título do anúncio" required={creativeType === 'text'}>
              <input value={headline} onChange={(event) => setHeadline(event.target.value)} className="adv-field-input" placeholder="Mensagem principal" />
            </Field>
            <Field label="Texto do anúncio" required={creativeType === 'text'}>
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} className="adv-field-input resize-y" placeholder="Apresente a mensagem, benefício ou chamada para ação." />
            </Field>
            {creativeType !== 'text' && (
              <Field label="Descrição acessível" required hint="Descreva o conteúdo da imagem ou do vídeo para acessibilidade.">
                <input value={alt} onChange={(event) => setAlt(event.target.value)} className="adv-field-input" />
              </Field>
            )}
            <Field label="Link de destino" hint="Opcional. Use uma URL HTTPS.">
              <input value={target} onChange={(event) => setTarget(event.target.value)} className="adv-field-input" placeholder="https://suaempresa.com.br" />
            </Field>

            <button disabled={uploading} className="adv-btn-primary w-full justify-center py-3.5">
              <Eye className="h-4 w-4" /> Revisar antes de enviar
            </button>
          </form>
        )}
      </section>

      <section className="border border-[#d6dadd] bg-white">
        <div className="border-b border-[#d6dadd] px-5 py-5 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#806128]">Histórico</p>
          <h2 className="mt-2 text-xl font-black">Materiais enviados</h2>
          <p className="mt-2 text-sm leading-6 text-[#68747c]">Consulte aprovações, correções solicitadas e versões anteriores.</p>
        </div>

        {allCreatives.length ? (
          <div className="divide-y divide-[#dfe2e4]">
            {allCreatives.map(({ creative, campaign }) => (
              <article key={creative.id} className="grid gap-5 px-5 py-6 sm:grid-cols-[160px_1fr] sm:px-6">
                <CreativeMedia creative={creative} />
                <div className="min-w-0">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#806128]">{campaign.name}</p>
                      <h3 className="mt-2 text-lg font-black">{creative.headline || (creative.kind === 'image' ? 'Material em imagem' : creative.kind === 'video' ? 'Material em vídeo' : 'Conteúdo textual')}</h3>
                    </div>
                    <StatusBadge tone={creativeTone(creative.status)}>{CREATIVE_LABELS[creative.status] || creative.status}</StatusBadge>
                  </div>
                  {creative.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#59666f]">{creative.body}</p>}
                  <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                    <InlineDefinition label="Enviado em" value={dateTime(creative.created_at)} compact />
                    <InlineDefinition label="Dimensões" value={creative.width && creative.height ? `${creative.width} × ${creative.height}px` : creative.duration_seconds ? `${creative.duration_seconds}s` : 'Não se aplica'} compact />
                  </dl>
                  {creative.rejection_reason && (
                    <div className="mt-4 border-l-4 border-[#b43d35] bg-[#fff3f1] px-4 py-3">
                      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#9d2b2b]">Orientação de correção</p>
                      <p className="mt-2 text-sm leading-6 text-[#70413d]">{creative.rejection_reason}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileImage} title="Nenhum material enviado" description="Os materiais enviados para análise aparecerão nesta área com o respectivo status." />
        )}
      </section>
    </div>
  );
}

function FinanceSection({ campaigns }: { campaigns: AdvertisingCampaign[] }) {
  const [creatingCheckoutId, setCreatingCheckoutId] = useState<string | null>(null);
  const createCheckout = async (paymentId: string) => {
    setCreatingCheckoutId(paymentId);
    try {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; checkout_url?: string }>('gsa-ads-public', { body: { action: 'create_checkout', payment_id: paymentId } });
      if (error || !data?.success || !data.checkout_url) throw error || new Error('Checkout indisponível.');
      const checkout = new URL(data.checkout_url);
      if (checkout.protocol !== 'https:') throw new Error('URL de pagamento inválida.');
      window.location.assign(checkout.href);
    } catch (error) {
      toast.error(message(error, 'Não foi possível gerar o pagamento agora.'));
    } finally {
      setCreatingCheckoutId(null);
    }
  };
  const payable = campaigns.filter((campaign) => campaign.payment);
  if (!payable.length) {
    return <EmptyState icon={WalletCards} title="Nenhuma cobrança disponível" description="As cobranças serão criadas após o aceite da proposta, conforme a condição comercial definida." />;
  }

  return (
    <div className="space-y-5">
      {payable.map((campaign) => {
        const payment = campaign.payment!;
        return (
          <article key={campaign.id} className="border border-[#d6dadd] bg-white">
            <header className="flex flex-col justify-between gap-4 border-b border-[#d6dadd] px-5 py-5 sm:flex-row sm:items-start sm:px-6">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#806128]">Cobrança da campanha</p>
                <h2 className="mt-2 text-xl font-black">{campaign.name}</h2>
                <p className="mt-2 text-sm text-[#69757e]">Vencimento em {date(payment.due_at)}</p>
              </div>
              <div className="sm:text-right">
                <StatusBadge tone={paymentTone(payment.status)}>{PAYMENT_LABELS[payment.status]}</StatusBadge>
                <p className="mt-3 text-3xl font-black tracking-[-0.03em]">{money(payment.amount)}</p>
              </div>
            </header>

            <div className="grid gap-px bg-[#d9dde0] sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCell label="Método" value={payment.payment_method || 'A definir'} />
              <SummaryCell label="Referência" value={payment.provider_reference || 'Não disponível'} />
              <SummaryCell label="Criada em" value={dateTime(payment.created_at)} />
              <SummaryCell label="Pagamento confirmado" value={payment.paid_at ? dateTime(payment.paid_at) : 'Ainda não confirmado'} />
            </div>

            {!['paid', 'refunded', 'cancelled'].includes(payment.status) && (
              <div className="px-5 py-6 sm:px-6">
                <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
                  <div>
                    {payment.pix_code && (
                      <Field label="Código Pix" hint="Copie o código e conclua o pagamento no aplicativo do seu banco.">
                        <div className="mt-2 flex border border-[#cfd4d7] bg-[#faf9f6]">
                          <div className="min-w-0 flex-1 break-all px-4 py-3 font-mono text-xs leading-5 text-[#4f5c65]">{payment.pix_code}</div>
                          <button
                            type="button"
                            onClick={async () => (await copyToClipboard(payment.pix_code || '')) ? toast.success('Código Pix copiado.') : toast.error('Não foi possível copiar o código.')}
                            className="flex shrink-0 items-center gap-2 border-l border-[#cfd4d7] px-4 text-xs font-extrabold text-[#806128] hover:bg-white"
                          >
                            <ClipboardCopy className="h-4 w-4" /> Copiar
                          </button>
                        </div>
                      </Field>
                    )}
                  </div>
                  {payment.checkout_url ? (
                    <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer" className="adv-btn-primary justify-center">
                      <CreditCard className="h-4 w-4" /> Abrir pagamento
                    </a>
                  ) : (
                    <button type="button" disabled={creatingCheckoutId === payment.id} onClick={() => void createCheckout(payment.id)} className="adv-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60">
                      <CreditCard className="h-4 w-4" /> {creatingCheckoutId === payment.id ? 'Gerando...' : 'Gerar pagamento seguro'}
                    </button>
                  )}
                </div>
                <p className="mt-4 text-xs leading-5 text-[#748089]">A confirmação pode levar alguns instantes após o pagamento. Use o botão de atualização no cabeçalho para consultar novamente.</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ReportsSection({ campaigns, selectedCampaignId, setSelectedCampaignId, rows, totals }: {
  campaigns: AdvertisingCampaign[];
  selectedCampaignId: string;
  setSelectedCampaignId: (value: string) => void;
  rows: Array<AdvertisingMetric & { campaignName: string }>;
  totals: { served: number; viewable: number; clicks: number; videoStarts: number; videoCompletions: number };
}) {
  const ctr = totals.served ? (totals.clicks / totals.served) * 100 : 0;
  const sortedRows = [...rows].sort((a, b) => a.metric_date.localeCompare(b.metric_date));

  return (
    <div className="space-y-6">
      <section className="border border-[#d6dadd] bg-white px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#806128]">Filtro de resultados</p>
            <h2 className="mt-2 text-xl font-black">Selecione a campanha</h2>
          </div>
          <select value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)} className="adv-field-input mt-0 w-full sm:max-w-sm">
            <option value="all">Todas as campanhas</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </div>
      </section>

      <MetricStrip
        items={[
          { label: 'Exibições', value: totals.served, detail: 'Entregas registradas', icon: MonitorSmartphone },
          { label: 'Visualizações qualificadas', value: totals.viewable, detail: 'Impressões visíveis', icon: Eye },
          { label: 'Cliques', value: totals.clicks, detail: `CTR de ${ctr.toFixed(2).replace('.', ',')}%`, icon: Target },
          { label: 'Vídeos concluídos', value: totals.videoCompletions, detail: `${totals.videoStarts.toLocaleString('pt-BR')} início(s)`, icon: Video },
        ]}
      />

      <section className="border border-[#d6dadd] bg-white">
        <div className="border-b border-[#d6dadd] px-5 py-5 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#806128]">Evolução diária</p>
          <h2 className="mt-2 text-xl font-black">Desempenho por data</h2>
        </div>
        {sortedRows.length ? (
          <DailyPerformance rows={sortedRows} />
        ) : (
          <EmptyState icon={BarChart3} title="Ainda não existem métricas" description="Os resultados começarão a aparecer depois que a campanha entrar em exibição e registrar eventos." />
        )}
      </section>

      {sortedRows.length > 0 && (
        <section className="border border-[#d6dadd] bg-white">
          <div className="border-b border-[#d6dadd] px-5 py-5 sm:px-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#806128]">Detalhamento</p>
            <h2 className="mt-2 text-xl font-black">Métricas registradas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#f5f4f0] text-xs uppercase tracking-[0.08em] text-[#65717a]">
                <tr>
                  <th className="px-5 py-3 font-extrabold">Campanha</th>
                  <th className="px-5 py-3 font-extrabold">Data</th>
                  <th className="px-5 py-3 font-extrabold">Exibições</th>
                  <th className="px-5 py-3 font-extrabold">Visualizações</th>
                  <th className="px-5 py-3 font-extrabold">Cliques</th>
                  <th className="px-5 py-3 font-extrabold">Vídeos concluídos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e3e5]">
                {sortedRows.map((row) => (
                  <tr key={`${row.campaign_id}-${row.placement_id}-${row.metric_date}`}>
                    <td className="px-5 py-4 font-bold">{row.campaignName}</td>
                    <td className="px-5 py-4 text-[#65717a]">{date(row.metric_date)}</td>
                    <td className="px-5 py-4">{Number(row.served || 0).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-4">{Number(row.viewable_impressions || 0).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-4">{Number(row.clicks || 0).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-4">{Number(row.video_completions || 0).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ProfileSection({ advertiser, company, setCompany, documentValue, contactName, setContactName, email, phone, setPhone, onSubmit }: {
  advertiser: AdvertiserPortalSnapshot['advertiser'];
  company: string;
  setCompany: (value: string) => void;
  documentValue: string;
  contactName: string;
  setContactName: (value: string) => void;
  email: string;
  phone: string;
  setPhone: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <aside className="h-fit border border-[#d6dadd] bg-[#112838] p-6 text-white">
        <Building2 className="h-7 w-7 text-[#d2b66f]" />
        <h2 className="mt-5 text-2xl font-black">Cadastro do anunciante</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">Mantenha o responsável e o telefone atualizados para receber retornos sobre propostas, materiais e campanhas.</p>
        <dl className="mt-7 divide-y divide-white/10 border-y border-white/10">
          <InlineDefinition label="Situação da conta" value={advertiser.status || 'Vinculada'} dark />
          <InlineDefinition label="Segmento" value={advertiser.segment || 'Não informado'} dark />
          <InlineDefinition label="Site" value={advertiser.website || 'Não informado'} dark />
        </dl>
      </aside>

      <section className="border border-[#d6dadd] bg-white">
        <div className="border-b border-[#d6dadd] px-5 py-5 sm:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#806128]">Dados cadastrados</p>
          <h2 className="mt-2 text-xl font-black">Empresa e responsável</h2>
        </div>
        <form onSubmit={onSubmit} className="space-y-6 px-5 py-6 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome da empresa" required className="sm:col-span-2">
              <input value={company} onChange={(event) => setCompany(event.target.value)} className="adv-field-input" />
            </Field>
            <Field label="CPF ou CNPJ" hint="O documento é protegido e não pode ser alterado diretamente.">
              <input value={protectDocument(documentValue)} disabled className="adv-field-input bg-[#f2f2ef] text-[#7c868d]" />
            </Field>
            <Field label="E-mail de acesso" hint="O e-mail identifica a conta e exige atendimento da GSA para alteração.">
              <input value={email} disabled className="adv-field-input bg-[#f2f2ef] text-[#7c868d]" />
            </Field>
            <Field label="Responsável pelo contato" required>
              <input value={contactName} onChange={(event) => setContactName(event.target.value)} className="adv-field-input" />
            </Field>
            <Field label="Telefone ou WhatsApp" required>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className="adv-field-input" />
            </Field>
          </div>

          <Notice tone="info" title="Precisa alterar documento ou e-mail?">
            Por segurança, essas alterações passam por validação da equipe GSA. Entre em contato informando o motivo e o protocolo relacionado.
          </Notice>

          <div className="flex justify-end border-t border-[#dfe2e4] pt-5">
            <button className="adv-btn-primary"><Send className="h-4 w-4" /> Salvar alterações</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProcessTimeline({ stage }: { stage: number }) {
  return (
    <ol className="grid gap-0 px-5 py-6 sm:grid-cols-4 sm:px-6 xl:grid-cols-8">
      {PROCESS_STEPS.map((label, index) => {
        const number = index + 1;
        const completed = stage > number;
        const current = stage === number;
        return (
          <li key={label} className="relative flex gap-3 pb-5 last:pb-0 sm:block sm:pb-0 sm:text-center">
            {index < PROCESS_STEPS.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-18px)] w-px sm:left-1/2 sm:top-[13px] sm:h-px sm:w-full ${completed ? 'bg-[#b18a3d]' : 'bg-[#d8dcdf]'}`} />}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-black sm:mx-auto ${completed ? 'border-[#806128] bg-[#806128] text-white' : current ? 'border-[#806128] bg-[#f6eedc] text-[#806128] ring-4 ring-[#f6eedc]' : 'border-[#cfd4d7] bg-white text-[#8a949a]'}`}>
              {completed ? <Check className="h-3.5 w-3.5" /> : number}
            </span>
            <div className="pt-1 sm:mt-3 sm:pt-0">
              <p className={`text-xs font-extrabold ${current || completed ? 'text-[#192630]' : 'text-[#8a949a]'}`}>{label}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MetricStrip({ items }: { items: Array<{ label: string; value: number; detail: string; icon: typeof LayoutDashboard }> }) {
  return (
    <section className="grid gap-px border border-[#d6dadd] bg-[#d6dadd] sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ label, value, detail, icon: Icon }) => (
        <div key={label} className="bg-white px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#69757e]">{label}</p>
            <Icon className="h-4 w-4 text-[#806128]" />
          </div>
          <p className="mt-3 text-3xl font-black tracking-[-0.03em]">{Number(value || 0).toLocaleString('pt-BR')}</p>
          <p className="mt-2 text-xs text-[#7a858c]">{detail}</p>
        </div>
      ))}
    </section>
  );
}

function DailyPerformance({ rows }: { rows: Array<AdvertisingMetric & { campaignName: string }> }) {
  const grouped = rows.reduce<Record<string, { served: number; viewable: number; clicks: number }>>((acc, row) => {
    const current = acc[row.metric_date] || { served: 0, viewable: 0, clicks: 0 };
    current.served += Number(row.served || 0);
    current.viewable += Number(row.viewable_impressions || 0);
    current.clicks += Number(row.clicks || 0);
    acc[row.metric_date] = current;
    return acc;
  }, {});
  const entries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const maxServed = Math.max(1, ...entries.map(([, item]) => item.served));

  return (
    <div className="space-y-4 px-5 py-6 sm:px-6">
      {entries.map(([metricDate, item]) => (
        <div key={metricDate} className="grid gap-3 sm:grid-cols-[90px_1fr_250px] sm:items-center">
          <p className="text-xs font-extrabold text-[#59666f]">{date(metricDate)}</p>
          <div className="h-3 bg-[#e7e7e3]"><div className="h-full bg-[#b18a3d]" style={{ width: `${Math.max(2, (item.served / maxServed) * 100)}%` }} /></div>
          <p className="text-xs text-[#68747c] sm:text-right">{item.served.toLocaleString('pt-BR')} exibições · {item.clicks.toLocaleString('pt-BR')} cliques</p>
        </div>
      ))}
    </div>
  );
}

function CreativeMedia({ creative }: { creative: AdvertisingCreative }) {
  if (creative.kind === 'image' && creative.asset_url) {
    return <div className="flex h-32 items-center justify-center overflow-hidden border border-[#d9dde0] bg-[#f3f2ee]"><img src={creative.asset_url} alt={creative.alt_text || creative.headline || 'Material da campanha'} className="h-full w-full object-contain" /></div>;
  }
  if (creative.kind === 'video' && creative.asset_url) {
    return <div className="flex h-32 items-center justify-center overflow-hidden border border-[#d9dde0] bg-[#112838]"><video src={creative.asset_url} controls className="h-full w-full object-contain" /></div>;
  }
  return (
    <div className="flex h-32 flex-col items-center justify-center border border-[#d9dde0] bg-[#f3f2ee] text-[#806128]">
      {creative.kind === 'video' ? <Video className="h-7 w-7" /> : creative.kind === 'image' ? <ImageIcon className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
      <span className="mt-2 text-xs font-extrabold uppercase">{creative.kind === 'video' ? 'Vídeo' : creative.kind === 'image' ? 'Imagem' : 'Texto'}</span>
    </div>
  );
}

function OperationalItem({ icon: Icon, label, value, tone }: { icon: typeof CreditCard; label: string; value: string; tone: StatusTone }) {
  return (
    <div className="border border-[#d9dde0] bg-[#faf9f6] p-4">
      <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-[#806128]" /><p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#68747c]">{label}</p></div>
      <div className="mt-3"><StatusBadge tone={tone}>{value}</StatusBadge></div>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return <div><h3 className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#69757e]">{title}</h3><div className="mt-3">{children}</div></div>;
}

function TagList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-[#778188]">{empty}</p>;
  return <div className="flex flex-wrap gap-2">{items.map((item) => <span key={item} className="border border-[#d2c39d] bg-[#faf6ea] px-3 py-1.5 text-xs font-bold text-[#6f5728]">{item}</span>)}</div>;
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const classes: Record<StatusTone, string> = {
    neutral: 'border-[#d5d9dc] bg-[#f4f5f3] text-[#59666f]',
    info: 'border-[#a9c2d1] bg-[#eef5f8] text-[#315e75]',
    warning: 'border-[#d8c183] bg-[#fbf5e4] text-[#73571c]',
    success: 'border-[#a9cbb5] bg-[#eff7f1] text-[#2e6742]',
    danger: 'border-[#dfb2ad] bg-[#fff2f0] text-[#9d2b2b]',
  };
  return <span className={`inline-flex w-fit items-center border px-2.5 py-1 text-[11px] font-extrabold ${classes[tone]}`}>{children}</span>;
}

function Notice({ tone, title, children }: { tone: StatusTone; title: string; children: ReactNode }) {
  const styles: Record<StatusTone, { border: string; bg: string; text: string; icon: typeof AlertCircle }> = {
    neutral: { border: 'border-[#cfd4d7]', bg: 'bg-[#f6f6f3]', text: 'text-[#55616a]', icon: AlertCircle },
    info: { border: 'border-[#a9c2d1]', bg: 'bg-[#eef5f8]', text: 'text-[#315e75]', icon: ShieldCheck },
    warning: { border: 'border-[#d8c183]', bg: 'bg-[#fbf5e4]', text: 'text-[#73571c]', icon: Clock3 },
    success: { border: 'border-[#a9cbb5]', bg: 'bg-[#eff7f1]', text: 'text-[#2e6742]', icon: CheckCircle2 },
    danger: { border: 'border-[#dfb2ad]', bg: 'bg-[#fff2f0]', text: 'text-[#8f302a]', icon: AlertCircle },
  };
  const style = styles[tone];
  const Icon = style.icon;
  return (
    <div className={`flex items-start gap-3 border px-4 py-3 ${style.border} ${style.bg} ${style.text}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div><p className="text-sm font-extrabold">{title}</p><div className="mt-1 text-xs leading-5 opacity-90">{children}</div></div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-white px-4 py-4"><dt className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#748089]">{label}</dt><dd className="mt-2 break-words text-sm font-bold leading-5 text-[#26353f]">{value || 'Não informado'}</dd></div>;
}

function InlineDefinition({ label, value, compact = false, dark = false }: { label: string; value: string; compact?: boolean; dark?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${compact ? 'py-2' : 'py-3'} ${dark ? 'text-white' : ''}`}>
      <dt className={`text-xs font-bold ${dark ? 'text-slate-400' : 'text-[#748089]'}`}>{label}</dt>
      <dd className={`text-right text-xs font-extrabold ${dark ? 'text-white' : 'text-[#34434d]'}`}>{value}</dd>
    </div>
  );
}

function DarkMetric({ label, value }: { label: string; value: number }) {
  return <div className="bg-[#172f40] p-4"><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</dt><dd className="mt-2 text-2xl font-black">{Number(value || 0).toLocaleString('pt-BR')}</dd></div>;
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: {
  icon: typeof LayoutDashboard;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center border border-[#d5c59c] bg-[#faf6ea] text-[#806128]"><Icon className="h-5 w-5" /></div>
      <h2 className="mt-5 text-lg font-black">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#748089]">{description}</p>
      {actionLabel && onAction && <button type="button" onClick={onAction} className="adv-btn-primary mt-5">{actionLabel} <ArrowRight className="h-4 w-4" /></button>}
    </div>
  );
}

function Field({ label, required, hint, className = '', children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm font-extrabold text-[#34434d] ${className}`}>
      {label} {required && <span className="text-[#9d2b2b]">*</span>}
      {children}
      {hint && <small className="mt-2 block text-xs font-normal leading-5 text-[#7b858c]">{hint}</small>}
    </label>
  );
}

function Modal({ title, onClose, children, maxWidth = 'max-w-lg' }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#06111a]/80 p-4" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`max-h-[92vh] w-full overflow-y-auto bg-[#f7f6f2] shadow-2xl ${maxWidth}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d6dadd] bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#806128]">Central do anunciante</p>
            <h2 className="mt-1 text-xl font-black">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center border border-[#d6dadd] bg-white" aria-label="Fechar modal"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function PortalStyles() {
  return (
    <style>{`
      .adv-field-input {
        margin-top: 0.5rem;
        width: 100%;
        border: 1px solid #cfd4d7;
        background: #fff;
        padding: 0.75rem 0.875rem;
        color: #192630;
        font-size: 0.875rem;
        line-height: 1.25rem;
        outline: none;
        transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
      }
      .adv-field-input:focus {
        border-color: #9a7939;
        box-shadow: 0 0 0 3px rgba(177, 138, 61, 0.14);
      }
      .adv-field-input:disabled {
        cursor: not-allowed;
        opacity: 0.78;
      }
      .adv-btn-primary, .adv-btn-secondary, .adv-btn-success, .adv-btn-danger, .adv-btn-danger-outline {
        display: inline-flex;
        min-height: 2.75rem;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        border: 1px solid transparent;
        padding: 0.6875rem 1rem;
        font-size: 0.8125rem;
        line-height: 1rem;
        font-weight: 800;
        transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease;
      }
      .adv-btn-primary { background: #d2b66f; color: #17232c; border-color: #d2b66f; }
      .adv-btn-primary:hover { background: #c5a75c; border-color: #c5a75c; }
      .adv-btn-secondary { background: #fff; color: #34434d; border-color: #cfd4d7; }
      .adv-btn-secondary:hover { border-color: #9a7939; color: #6f5728; background: #faf8f2; }
      .adv-btn-success { background: #2f6d48; color: #fff; border-color: #2f6d48; }
      .adv-btn-success:hover { background: #285d3e; border-color: #285d3e; }
      .adv-btn-danger { background: #a93630; color: #fff; border-color: #a93630; }
      .adv-btn-danger:hover { background: #902d28; border-color: #902d28; }
      .adv-btn-danger-outline { background: #fff; color: #96342f; border-color: #d6a6a2; }
      .adv-btn-danger-outline:hover { background: #fff3f1; border-color: #b94c45; }
      .adv-btn-primary:disabled, .adv-btn-secondary:disabled, .adv-btn-success:disabled, .adv-btn-danger:disabled, .adv-btn-danger-outline:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
    `}</style>
  );
}

function toneBorder(tone: StatusTone) {
  const classes: Record<StatusTone, string> = {
    neutral: 'border-l-[#7e898f]',
    info: 'border-l-[#4a7890]',
    warning: 'border-l-[#b18a3d]',
    success: 'border-l-[#4c815e]',
    danger: 'border-l-[#b43d35]',
  };
  return classes[tone];
}

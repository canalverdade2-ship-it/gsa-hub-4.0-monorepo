import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  FileText,
  Headset,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  User,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { logService } from '../../lib/logService';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { notificationService } from '../../lib/notificationService';
import { ClientSuporte } from '../../components/client/ClientSuporte';
import { toast } from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { LogoGSA } from '../../components/ui/LogoGSA';
import { HomeLogoLink } from '../../components/ui/HomeLogoLink';
import {
  activateClientProfileFromAffiliate,
  cancelAffiliatePayout,
  createAffiliateLink,
  fetchAffiliateSnapshot,
  joinAffiliate,
  redeemAffiliatePoints,
  requestAffiliatePayout,
  updateAffiliateProfile,
} from '../../features/affiliates/service';
import type { AffiliateCommission, AffiliateSnapshot } from '../../features/affiliates/types';
import { AFFILIATE_CURRENT_TERMS_VERSION } from '../../features/affiliates/types';
import { supabase } from '../../lib/supabase';
import { copyToClipboard, formatCurrency, formatDateTime, generateUUID, maskCNPJ, maskCPF } from '../../lib/utils';
import { navigate } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';
import { UniversalNotificationBell } from '../../components/ui/UniversalNotificationBell';
import { useClientNotifications } from '../../hooks/useClientNotifications';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import '../../affiliates.css';

interface AfiliadoDashboardProps {
  clientId: string;
  onLogout: () => void;
  activeSubRoute?: string;
}

type TabType = 'dashboard' | 'links' | 'comissoes' | 'saques' | 'perfil' | 'pontos' | 'suporte';

type KeyedProps = { key?: string };

const EMPTY_SNAPSHOT: AffiliateSnapshot = {
  affiliate: null,
  programs: [],
  links: [],
  commissions: [],
  payouts: [],
  pointsEvents: [],
  summary: {
    cliques: 0,
    conversoes: 0,
    totalPendente: 0,
    totalDisponivel: 0,
    totalPago: 0,
    totalSolicitado: 0,
    saqueMinimo: 50,
    pontos: 0,
    saldoCarteira: 0,
    pontosTaxa: 0.01,
    pontosMinimo: 100,
    pontosAtivo: true,
  },
};

const TAB_ITEMS: Array<{ id: TabType; label: string; shortLabel: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Visão geral', shortLabel: 'Início', icon: LayoutDashboard },
  { id: 'links', label: 'Links de divulgação', shortLabel: 'Links', icon: Link2 },
  { id: 'comissoes', label: 'Comissões', shortLabel: 'Comissões', icon: BadgeDollarSign },
  { id: 'saques', label: 'Saques PIX', shortLabel: 'Saques', icon: Banknote },
  { id: 'pontos', label: 'Pontos e carteira', shortLabel: 'Pontos', icon: Star },
  { id: 'perfil', label: 'Perfil e recebimento', shortLabel: 'Perfil', icon: User },
  { id: 'suporte', label: 'Suporte e chamados', shortLabel: 'Suporte', icon: Headset },
];

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
  bloqueado: 'Bloqueado',
  pendente: 'Em carência',
  disponivel: 'Disponível',
  solicitado: 'Em Análise',
  aprovado: 'Aprovado',
  pago: 'Pago',
  paga: 'Paga',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
  estornada: 'Estornada',
  revertida: 'Revertida',
};

function resolveTabFromRoute(subroute?: string): TabType {
  return ['links', 'comissoes', 'saques', 'perfil', 'pontos', 'suporte'].includes(subroute || '')
    ? subroute as TabType
    : 'dashboard';
}

function resolvePathFromTab(tab: TabType): string {
  if (tab === 'links') return routes.public.affiliateLinks();
  if (tab === 'comissoes') return routes.public.affiliateCommissions();
  if (tab === 'saques') return routes.public.affiliatePayouts();
  if (tab === 'perfil') return routes.public.affiliateProfile();
  if (tab === 'pontos') return routes.public.affiliatePoints();
  if (tab === 'suporte') return routes.public.affiliateSupport();
  return routes.public.affiliateDashboard();
}

function affiliateUrl(link: { destino: string; codigo: string }) {
  const url = new URL(link.destino, window.location.origin);
  url.searchParams.set('ref', link.codigo);
  return url.toString();
}

function currencyInputToNumber(value: string) {
  return Number(value.replace(/\./g, '').replace(',', '.')) || 0;
}

interface SpecificOption {
  label: string;
  path: string;
  category?: string;
}

function getSpecificOptionsForProgram(programCode: string, storeProducts: any[] = []): SpecificOption[] {
  switch (programCode) {
    case 'loja': {
      const defaultOptions: SpecificOption[] = [
        { label: 'Todos os Produtos da Loja', path: '/marketplace/loja/produtos', category: 'Seção' },
        { label: 'Assinaturas & Recorrência', path: '/marketplace/loja/assinaturas', category: 'Seção' },
        { label: 'Cupons & Ofertas da Loja', path: '/marketplace/loja/cupons', category: 'Seção' },
      ];
      
      const productOptions: SpecificOption[] = storeProducts.map(p => ({
        label: `${p.nome} (R$ ${Number(p.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
        path: `/marketplace/loja/produtos?produtoId=${p.id}`,
        category: 'Produto Individual'
      }));

      return [...defaultOptions, ...productOptions];
    }

    case 'classificados':
      return [
        { label: 'Classificados - Imóveis', path: '/marketplace/menu/classificados/imoveis', category: 'Categoria' },
        { label: 'Classificados - Veículos', path: '/marketplace/menu/classificados/veiculos', category: 'Categoria' },
        { label: 'Classificados - Serviços e Geral', path: '/marketplace/menu/classificados/geral', category: 'Categoria' },
        { label: 'Anunciar no Classificados', path: '/marketplace/menu/classificados/anunciar', category: 'Página' },
      ];

    case 'viagens':
      return [
        { label: 'Todos os Pacotes de Viagem', path: '/marketplace/menu/pacotes-viagem', category: 'Seção' },
        { label: 'Passagens Aéreas e Hospedagem', path: '/marketplace/menu/pacotes-viagem?categoria=hospedagem', category: 'Categoria' },
        { label: 'Pacotes Promocionais', path: '/marketplace/menu/pacotes-viagem?promocao=true', category: 'Categoria' },
      ];

    case 'servicos':
      return [
        { label: 'Criação de Sites e Sistemas', path: '/criacao-de-site-e-sistemas', category: 'Serviço' },
        { label: 'Serviços Especializados & Assinaturas', path: '/servicos-e-assinaturas', category: 'Serviço' },
      ];

    default:
      return [];
  }
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusTone(value: string) {
  if (['pago', 'paga', 'disponivel', 'ativo', 'aprovado'].includes(value)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['rejeitado', 'cancelado', 'estornada', 'revertida', 'bloqueado', 'suspenso', 'encerrado'].includes(value)) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export function AfiliadoDashboard({ clientId, onLogout, activeSubRoute }: AfiliadoDashboardProps) {
  const activeTab = resolveTabFromRoute(activeSubRoute);
  const { notifications, unreadNotifications, markAsRead, markAllAsRead } = useClientNotifications();
  const [snapshot, setSnapshot] = useState<AffiliateSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [programCode, setProgramCode] = useState('');
  const [destination, setDestination] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [payoutValue, setPayoutValue] = useState('');
  const [pointsValue, setPointsValue] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profilePixType, setProfilePixType] = useState('cpf');
  const [profilePixKey, setProfilePixKey] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinPixType, setJoinPixType] = useState('cpf');
  const [joinPixKey, setJoinPixKey] = useState('');
  const [clientDetails, setClientDetails] = useState<{ nome?: string; cpf?: string; cnpj?: string; tipo_pessoa?: string; email?: string; telefone?: string } | null>(null);
  const [isMovementsModalOpen, setIsMovementsModalOpen] = useState(false);
  const [movementFilter, setMovementFilter] = useState<'todos' | 'comissoes' | 'saques' | 'pontos'>('todos');
  const [selectedCommission, setSelectedCommission] = useState<AffiliateCommission | null>(null);
  const [destinationType, setDestinationType] = useState<'geral' | 'especifico'>('geral');
  const [specificChoice, setSpecificChoice] = useState('');
  const [storeProducts, setStoreProducts] = useState<any[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [pendingDeletionTicket, setPendingDeletionTicket] = useState<{ id: string; data_abertura: string; status: string } | null>(null);

  const handleConfirmDeleteAccount = async () => {
    if (!deleteReason.trim()) {
      toast.error('Informe o motivo da solicitação de exclusão.');
      return;
    }
    setSubmittingDelete(true);
    try {
      const assunto = 'Solicitação de Exclusão de Conta';
      const descricao = `O afiliado ${profileName || 'Afiliado'} solicitou a EXCLUSÃO PERMANENTE do seu perfil e conta.\n\nMotivo Informado:\n${deleteReason.trim()}\n\nA solicitação entrou em análise pela administração (prazo: 3 dias úteis).`;
      
      const createdTicket = await clientOperationalWrite<{ id: string }>(clientId, 'tickets', 'insert', {
        cliente_id: clientId,
        assunto,
        descricao,
        status: 'aberto',
        modulo: 'afiliado',
      });

      if (createdTicket?.id) {
        setPendingDeletionTicket({
          id: createdTicket.id,
          data_abertura: new Date().toISOString(),
          status: 'aberto',
        });
        await notificationService.notifyAdmin(
          '🎟️ Solicitação de Exclusão de Conta [Afiliado]',
          `${profileName || clientId} solicitou a exclusão de conta pelo Portal do Afiliado.`,
          'suporte',
          'ticket_aberto_cliente',
          { itemId: createdTicket.id, tab: 'abertos' }
        );
      }

      await logService.logAction({
        ator_tipo: 'cliente',
        ator_id: clientId || '',
        ator_nome: profileName || 'Afiliado',
        acao: 'SOLICITAR_EXCLUSAO_AFILIADO',
        detalhes: `Solicitação de exclusão de conta enviada. Motivo: ${deleteReason.trim()}`,
      });

      toast.success('Solicitação de exclusão enviada com sucesso! Analisaremos seu pedido em até 3 dias úteis.');
      setIsDeleteModalOpen(false);
      setDeleteReason('');
    } catch (err: any) {
      console.error('Erro ao solicitar exclusão:', err);
      toast.error('Erro ao enviar solicitação de exclusão: ' + (err?.message || 'Tente novamente.'));
    } finally {
      setSubmittingDelete(false);
    }
  };

  useEffect(() => {
    const fetchStoreProducts = async () => {
      try {
        const { data } = await supabase
          .from('produtos')
          .select('id, nome, codigo_produto, valor')
          .eq('status', 'ativo')
          .order('nome', { ascending: true })
          .limit(50);
        if (data) setStoreProducts(data);
      } catch (err) {
        console.error('Erro ao carregar produtos da loja para links:', err);
        toast.error('Não foi possível carregar as opções de produtos. Tente novamente mais tarde.');
      }
    };
    fetchStoreProducts();
  }, []);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [data, clientRes, deletionRes] = await Promise.all([
        fetchAffiliateSnapshot(),
        clientId
          ? supabase.from('clientes').select('nome, cpf, cnpj, tipo_pessoa, email, telefone').eq('id', clientId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        clientId
          ? supabase
              .from('tickets')
              .select('id, data_abertura, status')
              .eq('cliente_id', clientId)
              .ilike('assunto', '%exclusão%')
              .in('status', ['aberto', 'em andamento'])
              .order('data_abertura', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      setSnapshot(data);
      if (clientRes?.data) {
        setClientDetails(clientRes.data);
        setProfileEmail((current) => current || clientRes.data.email || '');
        setProfilePhone((current) => current || clientRes.data.telefone || '');
      }
      if (deletionRes?.data) {
        setPendingDeletionTicket(deletionRes.data as any);
      } else {
        setPendingDeletionTicket(null);
      }
      if (data.affiliate) {
        setProfileName(data.affiliate.nomeDivulgacao);
        setProfilePixType(data.affiliate.pixTipo || 'cpf');
        setProfilePixKey(data.affiliate.pixChave || '');
      } else if (clientRes?.data) {
        const clientData = clientRes.data;
        if (clientData.nome) setJoinName((prev) => prev || clientData.nome);
        const doc = clientData.cpf || clientData.cnpj;
        if (doc) setJoinPixKey((prev) => prev || doc);
        if (clientData.tipo_pessoa === 'pj' || clientData.cnpj) setJoinPixType('cnpj');
      }
      if (data.programs[0]) {
        setProgramCode((current) => current || data.programs[0].codigo);
        setDestination((current) => current || data.programs[0].caminhoPadrao);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar o Portal do Afiliado.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const affiliateId = snapshot.affiliate?.id || null;
  useRealtimeSubscription([
    { table: 'gsa_afiliados', filter: `cliente_id=eq.${clientId}`, onChange: () => load(true), debounceMs: 250 },
    { table: 'gsa_afiliado_comissoes', filter: affiliateId ? `afiliado_id=eq.${affiliateId}` : undefined, enabled: Boolean(affiliateId), onChange: () => load(true), debounceMs: 250 },
    { table: 'gsa_afiliado_saques', filter: affiliateId ? `afiliado_id=eq.${affiliateId}` : undefined, enabled: Boolean(affiliateId), onChange: () => load(true), debounceMs: 250 },
    { table: 'gsa_afiliado_links', filter: affiliateId ? `afiliado_id=eq.${affiliateId}` : undefined, enabled: Boolean(affiliateId), onChange: () => load(true), debounceMs: 250 },
    { table: 'gsa_afiliado_pontos_eventos', filter: affiliateId ? `afiliado_id=eq.${affiliateId}` : undefined, enabled: Boolean(affiliateId), onChange: () => load(true), debounceMs: 250 },
    { table: 'gsa_afiliado_transferencias', enabled: Boolean(affiliateId), onChange: () => load(true), debounceMs: 250 },
  ], [clientId, affiliateId, load]);

  const navigateToTab = (tab: TabType) => navigate(resolvePathFromTab(tab));

  const runAction = async (action: () => Promise<AffiliateSnapshot>, success: string) => {
    setWorking(true);
    try {
      const data = await action();
      if (data) {
        setSnapshot(data);
        if (data.affiliate) {
          setProfileName(data.affiliate.nomeDivulgacao);
          setProfilePixType(data.affiliate.pixTipo || 'cpf');
          setProfilePixKey(data.affiliate.pixChave || '');
        }
      }
      toast.success(success);
      return true;
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível concluir a operação.');
      return false;
    } finally {
      setWorking(false);
    }
  };

  const activateProfile = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await runAction(() => joinAffiliate({
      nomeDivulgacao: joinName.trim(),
      pixTipo: joinPixType,
      pixChave: joinPixKey.trim(),
      termosVersao: AFFILIATE_CURRENT_TERMS_VERSION,
    }), 'Perfil de afiliado ativado.');
    if (ok) {
      await load(true);
    }
  };

  const createLink = async (event: FormEvent) => {
    event.preventDefault();
    const selected = snapshot.programs.find((program) => program.codigo === programCode);
    const targetDest = (destination || selected?.caminhoPadrao || '/').trim();

    const existing = snapshot.links.find(
      (link) => link.destino.toLowerCase() === targetDest.toLowerCase()
    );

    if (existing) {
      toast.error(`Você já possui um link de divulgação gerado para o destino "${targetDest}". Utilize o link existente em seus links.`);
      return;
    }

    const success = await runAction(() => createAffiliateLink({
      programaCodigo: programCode,
      destino: targetDest,
      titulo: linkTitle.trim() || selected?.nome || 'Link GSA',
    }), 'Link de divulgação criado.');
    if (success) setLinkTitle('');
  };

  const requestPayout = async (event: FormEvent) => {
    event.preventDefault();
    const value = currencyInputToNumber(payoutValue);
    if (value < snapshot.summary.saqueMinimo) {
      toast.error(`O valor mínimo é ${formatCurrency(snapshot.summary.saqueMinimo)}.`);
      return;
    }
    if (value > snapshot.summary.totalDisponivel) {
      toast.error('O valor solicitado não pode superar o saldo disponível.');
      return;
    }
    const success = await runAction(
      () => requestAffiliatePayout(value, generateUUID()),
      'Solicitação de saque enviada.',
    );
    if (success) setPayoutValue('');
  };

  const redeemPoints = async (event: FormEvent) => {
    event.preventDefault();
    const points = Number(pointsValue);
    if (!Number.isFinite(points) || points < snapshot.summary.pontosMinimo) {
      toast.error(`O mínimo é ${snapshot.summary.pontosMinimo.toLocaleString('pt-BR')} pontos.`);
      return;
    }
    if (points > snapshot.summary.pontos) {
      toast.error('A quantidade informada supera seu saldo de pontos.');
      return;
    }
    const success = await runAction(
      () => redeemAffiliatePoints(points, generateUUID()),
      'Pontos convertidos para a carteira.',
    );
    if (success) setPointsValue('');
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const nextSnapshot = await updateAffiliateProfile({
        nomeDivulgacao: profileName.trim(),
        pixTipo: profilePixType,
        pixChave: profilePixKey.trim(),
      });
      if (clientId) {
        await clientOperationalWrite(clientId, 'clientes', 'update', {
          email: profileEmail.trim(),
          telefone: profilePhone.trim(),
        });
      }
      return nextSnapshot;
    }, 'Perfil atualizado.');
  };

  const selectedProgram = snapshot.programs.find((program) => program.codigo === programCode);
  const pointsCredit = (Number(pointsValue) || 0) * snapshot.summary.pontosTaxa;
  const conversionRate = snapshot.summary.cliques > 0
    ? (snapshot.summary.conversoes / snapshot.summary.cliques) * 100
    : 0;
  const allMovements = useMemo(() => {
    const commissionItems = snapshot.commissions.map((item) => ({
      id: `comm-${item.id}`,
      tipo: 'comissao',
      titulo: `Comissão · ${item.programaNome}`,
      subtitulo: `${item.codigoReferencia ? `${item.codigoReferencia} · ` : ''}Base ${formatCurrency(item.baseElegivel)} (${item.percentual}%)`,
      data: item.criadoEm,
      valor: item.valor,
      isPositive: true,
      isCurrency: true,
      status: item.status,
      originalCommission: item,
    }));

    const payoutItems = snapshot.payouts.map((payout) => ({
      id: `payout-${payout.id}`,
      tipo: 'saque',
      titulo: `Saque PIX (${payout.pixChaveMascarada})`,
      subtitulo: payout.motivo ? payout.motivo : `Chave PIX ${payout.pixTipo.toUpperCase()}`,
      data: payout.solicitadoEm,
      valor: payout.valor,
      isPositive: false,
      isCurrency: true,
      status: payout.status,
    }));

    const pointsItems = (snapshot.pointsEvents || []).map((event) => {
      const isResgate = event.tipo === 'resgate_carteira';
      const isBoasVindas = event.tipo === 'boas_vindas';
      const isPositive = event.pontos > 0 || isResgate;

      let titulo = 'Crédito de Pontos para Carteira';
      if (isResgate) {
        titulo = 'Conversão de Pontos para Carteira';
      } else if (isBoasVindas) {
        titulo = 'Bônus de Boas-Vindas (Pontos)';
      } else if (event.pontos < 0) {
        titulo = 'Débito de pontos na carteira de pontos';
      }

      const motivoText = event.metadata?.descricao ? ` · Motivo: ${event.metadata.descricao}` : '';
      const subtitulo = isResgate
        ? `${Math.abs(event.pontos).toLocaleString('pt-BR')} pts convertidos em saldo`
        : `${event.pontos > 0 ? '+' : ''}${event.pontos.toLocaleString('pt-BR')} pts lançados na carteira de pontos${motivoText}`;

      return {
        id: `pts-${event.id}`,
        tipo: 'pontos',
        titulo,
        subtitulo,
        data: event.criadoEm,
        valor: isResgate ? event.valorCarteira : Math.abs(event.pontos),
        isCurrency: isResgate,
        isPositive,
        status: 'disponivel',
      };
    });

    const all = [...commissionItems, ...payoutItems, ...pointsItems];
    all.sort((a, b) => {
      const timeA = a.data ? new Date(a.data).getTime() : 0;
      const timeB = b.data ? new Date(b.data).getTime() : 0;
      return timeB - timeA;
    });

    return all;
  }, [snapshot.commissions, snapshot.payouts, snapshot.pointsEvents]);

  const recentMovements = useMemo(() => allMovements.slice(0, 3), [allMovements]);

  const filteredMovements = useMemo(() => {
    if (movementFilter === 'comissoes') return allMovements.filter((m) => m.tipo === 'comissao');
    if (movementFilter === 'saques') return allMovements.filter((m) => m.tipo === 'saque');
    if (movementFilter === 'pontos') return allMovements.filter((m) => m.tipo === 'pontos');
    return allMovements;
  }, [allMovements, movementFilter]);

  if (loading) {
    return (
      <div className="affiliate-page flex min-h-screen items-center justify-center bg-[#f2efe7] text-[#0b1522]" role="status">
        <div className="flex items-center gap-3 border border-[#c9c2b6] bg-white px-6 py-5 shadow-[10px_10px_0_rgba(11,21,34,0.1)]">
          <Loader2 className="h-6 w-6 animate-spin text-[#8d6829]" />
          <span className="text-sm font-semibold">Carregando Portal do Afiliado...</span>
        </div>
      </div>
    );
  }

  const isProfileComplete = Boolean(
    snapshot.affiliate &&
    snapshot.affiliate.nomeDivulgacao &&
    snapshot.affiliate.nomeDivulgacao.trim().length >= 3 &&
    snapshot.affiliate.pixChave &&
    snapshot.affiliate.pixChave.trim().length >= 3
  );

  if (!isProfileComplete) {
    return (
      <main className="affiliate-page min-h-screen bg-[#f2efe7] px-5 py-12 text-[#142033] sm:py-16">
        <div className="affiliate-panel-shadow mx-auto max-w-2xl border-t-4 border-[#c59a4a] bg-white p-7 sm:p-10">
          <LogoGSA size="md" variant="dark" showText />
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-[#8d6829]">Ativação necessária</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#0b1522] sm:text-4xl">
            Sua conta está ativa, mas o perfil de afiliado ainda não foi configurado.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#626a74]">
            Informe o nome de divulgação e a chave PIX para concluir a ativação vinculada à sua sessão de cliente.
          </p>

          <form onSubmit={activateProfile} className="mt-8 space-y-5 border-t border-[#d8d1c6] pt-7">
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
              Nome de divulgação
              <input
                required
                minLength={3}
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                className="affiliate-input mt-2"
              />
            </label>
            <div className="grid gap-5 sm:grid-cols-[0.8fr_1.2fr]">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                Tipo de chave PIX
                <select value={joinPixType} onChange={(event) => setJoinPixType(event.target.value)} className="affiliate-input mt-2">
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Aleatória</option>
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                Chave PIX
                <input required value={joinPixKey} onChange={(event) => setJoinPixKey(event.target.value)} className="affiliate-input mt-2" />
              </label>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#d8d1c6] pt-6 sm:flex-row">
              <button disabled={working} className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 bg-[#0b1522] px-5 text-sm font-bold text-white disabled:opacity-45 hover:bg-[#192b42] transition-colors">
                {working ? 'Ativando perfil...' : 'Ativar perfil de afiliado'} <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onLogout} className="min-h-[52px] border border-[#bcb4a8] px-6 text-sm font-bold text-[#59616c] hover:border-[#0b1522] hover:text-[#0b1522]">
                Sair da conta
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  const affiliate = snapshot.affiliate;
  const activeTabMeta = TAB_ITEMS.find((item) => item.id === activeTab) || TAB_ITEMS[0];

  const displayName = clientDetails?.nome || affiliate.nomeCompleto || affiliate.nomeDivulgacao || 'Afiliado';
  const rawDocument = clientDetails?.tipo_pessoa === 'pj'
    ? (clientDetails?.cnpj || affiliate.cpf || '')
    : (clientDetails?.cpf || affiliate.cpf || (affiliate.pixTipo === 'cpf' ? affiliate.pixChave : ''));

  const formattedDocument = rawDocument
    ? (rawDocument.replace(/\D/g, '').length > 11 ? maskCNPJ(rawDocument) : maskCPF(rawDocument))
    : '';
  const docLabel = rawDocument.replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF';

  return (
    <div className="affiliate-page min-h-screen bg-[#ebe7de] pb-20 text-[#142033] lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1522] text-white">
        <div className="flex h-[72px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 text-white/70 hover:text-white lg:hidden" aria-label="Abrir menu do afiliado">
              <Menu className="h-5 w-5" />
            </button>
            <HomeLogoLink><LogoGSA size="sm" variant="light" showText /></HomeLogoLink>
            <span className="hidden h-7 w-px bg-white/20 sm:block" aria-hidden="true" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold">Portal do Afiliado</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#ddc28d]">
                Referência {affiliate.codigoPublico}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <UniversalNotificationBell
              variant="client"
              notifications={notifications}
              unreadCount={unreadNotifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onNavigate={(mod, tab) => {
                const targetMod = (mod || '').toLowerCase();
                const targetTab = (tab || '').toLowerCase();

                if (targetMod.includes('saque') || targetTab.includes('saque')) {
                  navigateToTab('saques');
                } else if (targetMod.includes('comiss') || targetTab.includes('comiss')) {
                  navigateToTab('comissoes');
                } else if (targetMod.includes('ponto') || targetMod.includes('fidelidade') || targetTab.includes('ponto')) {
                  navigateToTab('pontos');
                } else if (targetMod.includes('link') || targetTab.includes('link')) {
                  navigateToTab('links');
                } else if (targetMod.includes('perfil') || targetTab.includes('perfil')) {
                  navigateToTab('perfil');
                } else {
                  navigateToTab('dashboard');
                }
              }}
            />
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 border border-white/20 px-3 text-xs font-semibold text-white/72 transition-colors hover:border-white/45 hover:text-white disabled:opacity-45 sm:px-4"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar dados</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center gap-2 border border-red-300/30 px-3 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/10 sm:px-4"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-72px)]">
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] w-[286px] shrink-0 border-r border-[#c9c2b6] bg-[#f7f4ed] lg:flex lg:flex-col">
          <div className="border-b border-[#c9c2b6] p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7b838d]">Perfil afiliado</p>
            <div className="mt-4 flex items-start gap-3">
              <span className="affiliate-status-dot mt-1 h-2.5 w-2.5 shrink-0 bg-[#c59a4a]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0b1522]" title={displayName}>{displayName}</p>
                {formattedDocument && (
                  <p className="mt-0.5 truncate text-xs font-medium text-[#59616c]">{docLabel}: {formattedDocument}</p>
                )}
                <p className="mt-1 text-xs text-[#69717c]">Status: {STATUS_LABELS[affiliate.status] || affiliate.status}</p>
              </div>
            </div>
          </div>

          <SidebarNav activeTab={activeTab} onSelect={navigateToTab} />

          <div className="mt-auto border-t border-[#c9c2b6] p-5">
            <div className="flex items-start gap-3 bg-[#e9e2d6] p-4 text-xs leading-5 text-[#5a626d]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8d6829]" />
              Dados financeiros e links são processados pelo backend seguro da GSA.
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 bg-[#07101c]/75 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <aside className="h-full w-[300px] max-w-[88vw] bg-[#f7f4ed]" onClick={(event) => event.stopPropagation()}>
              <div className="flex h-[72px] items-center justify-between border-b border-[#c9c2b6] px-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Portal do Afiliado</p>
                  <p className="mt-1 max-w-[210px] truncate text-sm font-semibold text-[#0b1522]" title={displayName}>{displayName}</p>
                  {formattedDocument && (
                    <p className="mt-0.5 max-w-[210px] truncate text-xs font-medium text-[#59616c]">{docLabel}: {formattedDocument}</p>
                  )}

                </div>
                <button type="button" onClick={() => setSidebarOpen(false)} className="p-2 text-[#59616c]" aria-label="Fechar menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarNav activeTab={activeTab} onSelect={(tab) => { setSidebarOpen(false); navigateToTab(tab); }} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 xl:px-10 xl:py-10">
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-7 flex flex-col justify-between gap-4 border-b border-[#c9c2b6] pb-6 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8d6829]">Portal do Afiliado</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#0b1522] sm:text-4xl">{activeTabMeta.label}</h1>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6d7580]">
                <span className="affiliate-status-dot h-2 w-2 bg-[#c59a4a]" />
                Dados sincronizados com a operação GSA
              </div>
            </div>

            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <section className="relative overflow-hidden bg-[#0e1b2a] p-6 text-white sm:p-8">
                  <div className="affiliate-grid-bg absolute inset-0 opacity-45" aria-hidden="true" />
                  <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ddc28d]">Resumo da operação</p>
                      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Olá, {displayName}.</h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
                        Acompanhe o desempenho dos links, o estágio das comissões e o saldo disponível para novas solicitações.
                      </p>
                    </div>
                    <button type="button" onClick={() => navigateToTab('links')} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#c59a4a] px-5 text-sm font-bold text-[#0b1522] hover:bg-[#ddc28d]">
                      Criar novo link <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </section>

                <div className="affiliate-kpi-grid grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <MetricCard label="Saldo disponível" value={formatCurrency(snapshot.summary.totalDisponivel)} icon={WalletCards} detail="Liberado para saque" />
                  <MetricCard label="Em análise" value={formatCurrency(snapshot.summary.totalSolicitado)} icon={FileText} detail="Aguardando confirmação" />
                  <MetricCard label="Em carência" value={formatCurrency(snapshot.summary.totalPendente)} icon={Clock3} detail="Aguardando liberação" />
                  <MetricCard label="Total pago" value={formatCurrency(snapshot.summary.totalPago)} icon={Banknote} detail="Histórico concluído" />
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <section className="border border-[#c9c2b6] bg-white">
                    <div className="flex items-center justify-between gap-4 border-b border-[#d8d1c6] px-5 py-4 sm:px-6">
                      <div>
                        <h2 className="text-base font-semibold text-[#0b1522]">Links em operação</h2>
                        <p className="mt-1 text-xs text-[#727a84]">Desempenho dos links criados no portal.</p>
                      </div>
                      <button type="button" onClick={() => navigateToTab('links')} className="inline-flex items-center gap-1 text-xs font-bold text-[#8d6829] hover:text-[#0b1522]">
                        Ver todos <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="divide-y divide-[#ebe6de]">
                      {snapshot.links.slice(0, 4).map((link) => <CompactLinkRow key={link.id} link={link} />)}
                      {snapshot.links.length === 0 && (
                        <EmptyState
                          icon={Link2}
                          title="Nenhum link criado"
                          text="Crie seu primeiro link para iniciar o rastreamento das indicações."
                          actionLabel="Criar link"
                          onAction={() => navigateToTab('links')}
                        />
                      )}
                    </div>
                  </section>

                  <section className="border border-[#c9c2b6] bg-white">
                    <div className="flex items-center justify-between border-b border-[#d8d1c6] px-5 py-4 sm:px-6">
                      <div>
                        <h2 className="text-base font-semibold text-[#0b1522]">Movimentações recentes</h2>
                        <p className="mt-1 text-xs text-[#727a84]">Extrato de comissões, resgates e saques.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMovementsModalOpen(true)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#8d6829] hover:text-[#0b1522]"
                      >
                        Ver todos <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="divide-y divide-[#ebe6de]">
                      {recentMovements.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 sm:px-6 hover:bg-[#faf8f5]">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${item.isPositive ? 'bg-emerald-600' : 'bg-amber-600'}`} />
                              <p className="truncate text-sm font-semibold text-[#0b1522]">{item.titulo}</p>
                            </div>
                            <p className="mt-1 truncate text-xs text-[#7a828c]">
                              {item.data ? formatDateTime(item.data) : 'Data não informada'} · {item.subtitulo}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${item.isPositive ? 'text-emerald-700' : 'text-amber-800'}`}>
                              {item.isPositive ? '+' : '-'} {formatCurrency(item.valor)}
                            </p>
                            <Status value={item.status} compact />
                          </div>
                        </div>
                      ))}
                      {recentMovements.length === 0 && (
                        <EmptyState icon={BadgeDollarSign} title="Nenhuma movimentação registrada" text="O extrato registrará todas as suas comissões, resgates e solicitações de saque." />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'links' && (
              <div className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <section className="border-t-4 border-[#c59a4a] bg-white p-5 shadow-[0_14px_40px_rgba(11,21,34,0.06)] sm:p-7">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Novo link</p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#0b1522]">Gerar link rastreável</h2>
                    <p className="mt-2 text-sm leading-6 text-[#69717c]">
                      O destino é validado pelo backend e o código é vinculado ao seu perfil e ao programa escolhido.
                    </p>

                    <form onSubmit={createLink} className="mt-7 grid gap-5 sm:grid-cols-2">
                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        Programa
                        <select
                          value={programCode}
                          onChange={(event) => {
                            const code = event.target.value;
                            const program = snapshot.programs.find((item) => item.codigo === code);
                            setProgramCode(code);
                            setDestinationType('geral');
                            setDestination(program?.caminhoPadrao || '');
                            if (program) {
                              setLinkTitle(`Link Geral - ${program.nome}`);
                            }
                          }}
                          className="affiliate-input mt-2"
                        >
                          {snapshot.programs.map((program) => (
                            <option key={program.id} value={program.codigo}>{program.nome} · {program.percentual}%</option>
                          ))}
                        </select>
                      </label>

                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        Título interno
                        <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder={selectedProgram?.nome || 'Link GSA'} className="affiliate-input mt-2" />
                      </label>

                      {/* Modalidade de Destino: Link Geral vs Link Específico */}
                      <div className="sm:col-span-2 space-y-2.5 pt-1">
                        <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                          Modalidade do Destino
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setDestinationType('geral');
                              const program = snapshot.programs.find((item) => item.codigo === programCode);
                              const path = program?.caminhoPadrao || '';
                              setDestination(path);
                              setLinkTitle(`Link Geral - ${program?.nome || ''}`);
                            }}
                            className={`flex flex-col items-start p-4 text-left border transition-all ${
                              destinationType === 'geral'
                                ? 'border-[#0b1522] bg-[#0b1522] text-white shadow-md'
                                : 'border-[#c9c2b6] bg-white text-[#0b1522] hover:border-[#8d6829]'
                            }`}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                              🌐 Link Geral do Programa
                            </span>
                            <span className={`text-[11px] mt-1.5 leading-relaxed ${destinationType === 'geral' ? 'text-white/80' : 'text-[#69717c]'}`}>
                              Redireciona para a página principal deste programa.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDestinationType('especifico');
                              const options = getSpecificOptionsForProgram(programCode, storeProducts);
                              const firstOpt = options[0];
                              if (firstOpt) {
                                setSpecificChoice(firstOpt.path);
                                setDestination(firstOpt.path);
                                const cleanLabel = firstOpt.label.split(' (')[0];
                                setLinkTitle(`${cleanLabel} - ${selectedProgram?.nome || ''}`);
                              }
                            }}
                            className={`flex flex-col items-start p-4 text-left border transition-all ${
                              destinationType === 'especifico'
                                ? 'border-[#0b1522] bg-[#0b1522] text-white shadow-md'
                                : 'border-[#c9c2b6] bg-white text-[#0b1522] hover:border-[#8d6829]'
                            }`}
                          >
                            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                              🎯 Link Específico (Item / Produto / Seção)
                            </span>
                            <span className={`text-[11px] mt-1.5 leading-relaxed ${destinationType === 'especifico' ? 'text-white/80' : 'text-[#69717c]'}`}>
                              Escolha uma seção, produto ou página específica do programa.
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Dropdown de Destinos Específicos se selecionado */}
                      {destinationType === 'especifico' && (
                        <div className="sm:col-span-2 space-y-2 bg-[#f8f3e8] p-4 border border-[#d8c9aa]">
                          <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#8d6829]">
                            Selecione o Destino Específico
                            <select
                              value={specificChoice}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSpecificChoice(val);
                                setDestination(val);
                                const options = getSpecificOptionsForProgram(programCode, storeProducts);
                                const found = options.find(o => o.path === val);
                                if (found) {
                                  const cleanLabel = found.label.split(' (')[0];
                                  setLinkTitle(`${cleanLabel} - ${selectedProgram?.nome || ''}`);
                                }
                              }}
                              className="affiliate-input mt-2 bg-white text-[#0b1522]"
                            >
                              {getSpecificOptionsForProgram(programCode, storeProducts).map((opt) => (
                                <option key={opt.path} value={opt.path}>
                                  {opt.category ? `[${opt.category}] ` : ''}{opt.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="text-[11px] text-[#66583e] mt-1">
                            💡 O link será direcionado exclusivamente para a página ou produto selecionado acima.
                          </p>
                        </div>
                      )}

                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864] sm:col-span-2">
                        Destino permitido (Caminho final)
                        <input required value={destination} onChange={(event) => setDestination(event.target.value)} className="affiliate-input mt-2 font-mono text-sm" />
                        <span className="mt-2 block text-[11px] normal-case tracking-normal text-[#7a828c]">
                          Utilize páginas e rotas relacionadas ao programa selecionado.
                        </span>
                      </label>

                      <div className="flex items-center gap-3 border border-[#d8c9aa] bg-[#f8f3e8] p-4 text-xs leading-5 text-[#66583e] sm:col-span-2">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-[#8d6829]" />
                        Links fora dos destinos autorizados são recusados para proteger a atribuição da comissão.
                      </div>

                      <button disabled={working || !programCode} className="inline-flex min-h-[52px] items-center justify-center gap-2 bg-[#0b1522] px-6 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2 transition-all hover:bg-[#16273b]">
                        {working ? 'Criando link...' : 'Criar link exclusivo'} <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  </section>

                  <aside className="bg-[#0e1b2a] p-6 text-white sm:p-7">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ddc28d]">Boas práticas</p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Compartilhe com clareza.</h2>
                    <div className="mt-6 border-t border-white/18">
                      {[
                        'Apresente a solução antes de enviar o link.',
                        'Não altere o código de referência gerado.',
                        'Evite promessas comerciais não publicadas pela GSA.',
                        'Acompanhe o resultado pelo painel, não por planilhas paralelas.',
                      ].map((item) => (
                        <div key={item} className="flex gap-3 border-b border-white/14 py-4 text-sm leading-6 text-white/66">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-[#ddc28d]" /> {item}
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>

                <section>
                  <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                    <div>
                      <h2 className="text-xl font-semibold text-[#0b1522]">Seus links</h2>
                      <p className="mt-1 text-sm text-[#6d7580]">Copie, abra e acompanhe cada código criado.</p>
                    </div>
                    <p className="font-mono text-xs font-bold text-[#8d6829]">{snapshot.links.length.toLocaleString('pt-BR')} link(s)</p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {snapshot.links.map((link) => <LinkCard key={link.id} link={link} />)}
                    {snapshot.links.length === 0 && (
                      <div className="lg:col-span-2">
                        <EmptyState icon={Link2} title="Nenhum link criado" text="Use o formulário acima para gerar seu primeiro link oficial." />
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'comissoes' && (
              <div className="space-y-6">
                <div className="affiliate-kpi-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <MetricCard label="Disponível" value={formatCurrency(snapshot.summary.totalDisponivel)} icon={WalletCards} detail="Liberado" />
                  <MetricCard label="Em carência" value={formatCurrency(snapshot.summary.totalPendente)} icon={Clock3} detail="Aguardando" />
                  <MetricCard label="Em análise" value={formatCurrency(snapshot.summary.totalSolicitado)} icon={FileText} detail="Em processamento" />
                  <MetricCard label="Pago" value={formatCurrency(snapshot.summary.totalPago)} icon={CheckCircle2} detail="Concluído" />
                </div>

                <section className="border border-[#c9c2b6] bg-white">
                  <div className="border-b border-[#d8d1c6] px-5 py-5 sm:px-6">
                    <h2 className="text-lg font-semibold text-[#0b1522]">Histórico de comissões</h2>
                    <p className="mt-1 text-sm text-[#707883]">Cada linha preserva programa, base elegível, percentual, valor e situação.</p>
                  </div>
                  <div className="affiliate-table-scroll overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="border-b border-[#d8d1c6] bg-[#f4f1ea] text-[11px] font-bold uppercase tracking-[0.12em] text-[#626a74]">
                        <tr>
                          <th className="px-5 py-4">Identificação</th>
                          <th className="px-5 py-4">Data</th>
                          <th className="px-5 py-4">Programa</th>
                          <th className="px-5 py-4">Base elegível</th>
                          <th className="px-5 py-4">Percentual</th>
                          <th className="px-5 py-4">Comissão</th>
                          <th className="px-5 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ebe6de]">
                        {snapshot.commissions.map((item) => (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedCommission(item)}
                            className="cursor-pointer hover:bg-[#faf8f3] transition-colors"
                            title="Clique para ver detalhes e prazo de carência"
                          >
                            <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-[#8d6829]">{item.codigoReferencia || '—'}</td>
                            <td className="whitespace-nowrap px-5 py-4 text-[#69717c]">{item.criadoEm ? formatDateTime(item.criadoEm) : '—'}</td>
                            <td className="px-5 py-4 font-semibold text-[#0b1522]">{item.programaNome}</td>
                            <td className="px-5 py-4">{formatCurrency(item.baseElegivel)}</td>
                            <td className="px-5 py-4">{item.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</td>
                            <td className="px-5 py-4 font-bold text-[#0b1522]">{formatCurrency(item.valor)}</td>
                            <td className="px-5 py-4"><Status value={item.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {snapshot.commissions.length === 0 && (
                      <EmptyState icon={BadgeDollarSign} title="Nenhuma comissão registrada" text="As comissões elegíveis serão exibidas aqui após a confirmação das conversões." />
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'saques' && (
              <div className="space-y-6">
                <section className="relative overflow-hidden bg-[#0e1b2a] p-6 text-white sm:p-8">
                  <div className="affiliate-grid-bg absolute inset-0 opacity-40" aria-hidden="true" />
                  <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ddc28d]">Saldo disponível para saque</p>
                      <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{formatCurrency(snapshot.summary.totalDisponivel)}</p>
                      <p className="mt-3 text-sm text-white/55">Mínimo vigente: {formatCurrency(snapshot.summary.saqueMinimo)} · PIX {affiliate.pixTipo.toUpperCase()}</p>
                    </div>
                    <Status value={affiliate.status} />
                  </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                  <section className="border-t-4 border-[#c59a4a] bg-white p-5 shadow-[0_14px_40px_rgba(11,21,34,0.06)] sm:p-7">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Nova solicitação</p>
                    <h2 className="mt-3 text-2xl font-semibold text-[#0b1522]">Solicitar pagamento PIX</h2>
                    <p className="mt-2 text-sm leading-6 text-[#69717c]">
                      O valor é reservado quando a solicitação é registrada e retorna ao saldo se houver cancelamento permitido.
                    </p>
                    <form onSubmit={requestPayout} className="mt-6 space-y-5">
                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        Valor do saque
                        <input required value={payoutValue} onChange={(event) => setPayoutValue(formatCurrencyInput(event.target.value))} placeholder="0,00" className="affiliate-input mt-2 font-mono text-base" />
                      </label>
                      <div className="grid grid-cols-2 gap-3 bg-[#f4f1ea] p-4 text-xs">
                        <div><p className="text-[#7a828c]">Mínimo</p><p className="mt-1 font-bold text-[#0b1522]">{formatCurrency(snapshot.summary.saqueMinimo)}</p></div>
                        <div><p className="text-[#7a828c]">Disponível</p><p className="mt-1 font-bold text-[#0b1522]">{formatCurrency(snapshot.summary.totalDisponivel)}</p></div>
                      </div>
                      <button disabled={working || snapshot.summary.totalDisponivel < snapshot.summary.saqueMinimo} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 bg-[#0b1522] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
                        {working ? 'Registrando solicitação...' : 'Solicitar PIX'} <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  </section>

                  <section className="border border-[#c9c2b6] bg-white">
                    <div className="border-b border-[#d8d1c6] px-5 py-5 sm:px-6">
                      <h2 className="text-lg font-semibold text-[#0b1522]">Histórico de saques</h2>
                      <p className="mt-1 text-sm text-[#707883]">Acompanhe solicitação, análise, pagamento ou cancelamento.</p>
                    </div>
                    <div className="divide-y divide-[#ebe6de]">
                      {snapshot.payouts.map((payout) => (
                        <article key={payout.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                          <div>
                            <p className="text-xl font-semibold tracking-[-0.025em] text-[#0b1522]">{formatCurrency(payout.valor)}</p>
                            <p className="mt-1 text-xs leading-5 text-[#727a84]">
                              {payout.solicitadoEm ? formatDateTime(payout.solicitadoEm) : 'Data não informada'} · {payout.pixChaveMascarada || 'PIX protegido'}
                            </p>
                            {payout.motivo && <p className="mt-2 text-xs leading-5 text-[#8a4c45]">{payout.motivo}</p>}
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            <Status value={payout.status} />
                            {payout.status === 'solicitado' && (
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => void runAction(() => cancelAffiliatePayout(payout.id), 'Saque cancelado.')}
                                className="border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-45"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                      {snapshot.payouts.length === 0 && (
                        <EmptyState icon={Banknote} title="Nenhuma solicitação de saque" text="Quando houver saldo disponível, você poderá solicitar o pagamento por esta página." />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'pontos' && (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <section className="relative overflow-hidden bg-[#0e1b2a] p-6 text-white sm:p-8">
                  <div className="affiliate-grid-bg absolute inset-0 opacity-40" aria-hidden="true" />
                  <div className="relative">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ddc28d]">Saldo de pontos</p>
                    <p className="mt-4 text-5xl font-semibold tracking-[-0.05em]">{snapshot.summary.pontos.toLocaleString('pt-BR')}</p>
                    <p className="mt-2 text-sm text-white/55">pontos disponíveis</p>
                    <div className="mt-8 grid grid-cols-2 border-t border-white/18">
                      <div className="border-r border-white/18 py-5 pr-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Carteira</p>
                        <p className="mt-2 text-xl font-semibold">{formatCurrency(snapshot.summary.saldoCarteira)}</p>
                      </div>
                      <div className="py-5 pl-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Conversão</p>
                        <p className="mt-2 text-xl font-semibold">{(1 / snapshot.summary.pontosTaxa).toLocaleString('pt-BR')} pts = R$ 1</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t-4 border-[#c59a4a] bg-white p-5 shadow-[0_14px_40px_rgba(11,21,34,0.06)] sm:p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Conversão para carteira</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[#0b1522]">Resgatar pontos</h2>
                  <p className="mt-2 text-sm leading-6 text-[#69717c]">
                    O crédito convertido é registrado na carteira conforme a taxa vigente no momento da operação.
                  </p>
                  <form onSubmit={redeemPoints} className="mt-7 space-y-5">
                    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                      Quantidade de pontos
                      <input 
                        required
                        type="number"
                        step="any"
                        min={snapshot.summary.pontosMinimo}
                        max={snapshot.summary.pontos}
                        value={pointsValue}
                        inputMode="numeric" onChange={(event) => setPointsValue(event.target.value)}
                        className="affiliate-input mt-2 font-mono text-base"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3 bg-[#f4f1ea] p-4 text-xs">
                      <div><p className="text-[#7a828c]">Mínimo</p><p className="mt-1 font-bold text-[#0b1522]">{snapshot.summary.pontosMinimo.toLocaleString('pt-BR')} pts</p></div>
                      <div><p className="text-[#7a828c]">Crédito previsto</p><p className="mt-1 font-bold text-emerald-700">{formatCurrency(pointsCredit)}</p></div>
                    </div>
                    <button disabled={working || !snapshot.summary.pontosAtivo || snapshot.summary.pontos < snapshot.summary.pontosMinimo} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 bg-[#0b1522] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
                      {working ? 'Convertendo pontos...' : 'Converter para carteira'} <Coins className="h-4 w-4" />
                    </button>
                  </form>
                </section>
              </div>
            )}

            {activeTab === 'perfil' && (
              <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="border-t-4 border-[#c59a4a] bg-white p-5 shadow-[0_14px_40px_rgba(11,21,34,0.06)] sm:p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Dados operacionais</p>
                  <h2 className="mt-3 text-2xl font-semibold text-[#0b1522]">Perfil e recebimento</h2>
                  <p className="mt-2 text-sm leading-6 text-[#69717c]">
                    Atualize o nome exibido no portal e a chave utilizada para novas solicitações PIX.
                  </p>
                  <form onSubmit={saveProfile} className="mt-7 space-y-5">
                    <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                      Nome de divulgação
                      <input required minLength={3} value={profileName} onChange={(event) => setProfileName(event.target.value)} className="affiliate-input mt-2" />
                    </label>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        E-mail de contato
                        <input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder="email@exemplo.com" className="affiliate-input mt-2" />
                      </label>
                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        Telefone / WhatsApp
                        <input  type="tel" value={profilePhone} inputMode="numeric" onChange={(event) => setProfilePhone(event.target.value)} placeholder="(11) 99999-9999" className="affiliate-input mt-2" />
                      </label>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-[0.8fr_1.2fr]">
                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        Tipo de PIX
                        <select value={profilePixType} onChange={(event) => setProfilePixType(event.target.value)} className="affiliate-input mt-2">
                          <option value="cpf">CPF</option>
                          <option value="cnpj">CNPJ</option>
                          <option value="email">E-mail</option>
                          <option value="telefone">Telefone</option>
                          <option value="aleatoria">Aleatória</option>
                        </select>
                      </label>
                      <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
                        Chave PIX
                        <input required value={profilePixKey} onChange={(event) => setProfilePixKey(event.target.value)} className="affiliate-input mt-2" />
                      </label>
                    </div>
                    <div className="flex gap-3 border border-[#d8c9aa] bg-[#f8f3e8] p-4 text-xs leading-5 text-[#66583e]">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8d6829]" />
                      A alteração afeta novas solicitações. Saques anteriores preservam a chave mascarada registrada na operação.
                    </div>
                    <button disabled={working} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 bg-[#0b1522] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">
                      <Save className="h-4 w-4" /> {working ? 'Salvando perfil...' : 'Salvar alterações'}
                    </button>
                  </form>
                </section>

                <aside className="space-y-4">
                  <div className="border border-[#c9c2b6] bg-white p-5 sm:p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a828c]">Código público</p>
                    <p className="mt-3 break-all font-mono text-xl font-semibold text-[#0b1522]">{affiliate.codigoPublico}</p>
                    <p className="mt-3 text-xs leading-5 text-[#727a84]">Identificador permanente do seu perfil no Programa de Afiliados GSA.</p>
                  </div>
                  <div className="border border-[#c9c2b6] bg-white p-5 sm:p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a828c]">Termos aceitos</p>
                    <p className="mt-3 text-sm font-semibold text-[#0b1522]">Versão {affiliate.termosVersao || 'vigente'}</p>
                    <p className="mt-2 text-xs leading-5 text-[#727a84]">
                      {affiliate.termosAceitosEm ? `Aceite registrado em ${formatDateTime(affiliate.termosAceitosEm)}.` : 'Aceite registrado na ativação do perfil.'}
                    </p>
                  </div>
                  <div className="bg-[#0e1b2a] p-5 text-white sm:p-6">
                    <ShieldCheck className="h-6 w-6 text-[#ddc28d]" />
                    <h3 className="mt-4 text-base font-semibold">Proteção dos dados</h3>
                    <p className="mt-2 text-xs leading-6 text-white/55">
                      A chave PIX completa é utilizada somente nas operações autorizadas. Históricos exibem dados protegidos sempre que aplicável.
                    </p>
                  </div>

                  <div className="border border-[#c9c2b6] bg-white p-5 sm:p-6">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a828c]">Perfil de Cliente</p>
                    <h3 className="mt-2 text-sm font-semibold text-[#0b1522]">Acesso à Loja e Painel do Cliente</h3>
                    <p className="mt-1 text-xs leading-5 text-[#727a84]">
                      Ative seu perfil de cliente para realizar compras, acumular pontos e gerenciar pedidos na loja oficial.
                    </p>
                    <button
                      type="button"
                      disabled={working}
                      onClick={async () => {
                        setWorking(true);
                        try {
                          await activateClientProfileFromAffiliate();
                          toast.success('Perfil de cliente ativado com sucesso!');
                          await load(true);
                        } catch (err: any) {
                          toast.error(err?.message || 'Erro ao ativar perfil de cliente.');
                        } finally {
                          setWorking(false);
                        }
                      }}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-[#c59a4a] px-4 py-2.5 text-xs font-bold text-[#0b1522] hover:bg-[#ddc28d] transition-colors disabled:opacity-50"
                    >
                      <User className="h-4 w-4" /> Ativar perfil de cliente
                    </button>
                  </div>

                  {pendingDeletionTicket ? (
                    <div className="bg-[#b91c1c] p-5 sm:p-6 text-white shadow-md">
                      <div className="flex items-center gap-2 text-[#fde047]">
                        <Clock3 className="h-5 w-5 shrink-0 text-[#fde047]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#fde047]">Solicitação em análise</h3>
                      </div>
                      <p className="mt-2.5 text-xs leading-relaxed text-white/90">
                        Sua solicitação de exclusão de conta foi registrada e está sob análise pela equipe de administração.
                      </p>
                      <div className="mt-4 border-t border-white/20 pt-3 text-[11px] leading-5 text-white/80">
                        <p>Data do pedido: <span className="font-semibold text-white">{formatDateTime(pendingDeletionTicket.data_abertura)}</span></p>
                        <p className="mt-0.5">Prazo estimado: <span className="font-semibold text-white">Até 3 dias úteis</span></p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#b91c1c] p-5 sm:p-6 text-white shadow-md">
                      <div className="flex items-center gap-2 text-white">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-white" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white">Exclusão da conta</h3>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-white/90">
                        Deseja encerrar seu perfil de afiliado? A solicitação de exclusão permanente será analisada pela administração em até 3 dias úteis.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-white/40 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] transition-colors hover:bg-[#881337] hover:text-white hover:border-[#881337]"
                      >
                        <Trash2 className="h-4 w-4" /> Solicitar exclusão da conta
                      </button>
                    </div>
                  )}
                </aside>
              </div>
            )}

            {activeTab === 'suporte' && (
              <section className="border-t-4 border-[#c59a4a] bg-white p-5 shadow-[0_14px_40px_rgba(11,21,34,0.06)] sm:p-7 border border-[#c9c2b6]">
                <div className="mb-6 border-b border-[#e5dec9] pb-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8d6829]">Atendimento e Chamados</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#0b1522]">Suporte ao Afiliado</h2>
                  <p className="mt-1 text-sm text-[#69717c]">
                    Tire suas dúvidas, solicite apoio técnico ou informe qualquer necessidade relacionada à sua operação.
                  </p>
                </div>
                <ClientSuporte clientId={clientId} modulo="afiliado" />
              </section>
            )}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-[#c9c2b6] bg-[#f9f7f2]/96 px-1 py-2 backdrop-blur lg:hidden" aria-label="Navegação do Portal do Afiliado">
        {TAB_ITEMS.map((item) => (
          <MobileNavItem key={item.id} icon={item.icon} label={item.shortLabel} active={activeTab === item.id} onClick={() => navigateToTab(item.id)} />
        ))}
      </nav>

      <Modal
        isOpen={isMovementsModalOpen}
        onClose={() => setIsMovementsModalOpen(false)}
        title="Extrato de Movimentações"
        size="3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
            <p className="text-xs text-neutral-500">
              Histórico completo de comissões por vendas e saques PIX do seu perfil de afiliado.
            </p>
            <div className="flex items-center gap-1 rounded-xl bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setMovementFilter('todos')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  movementFilter === 'todos' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                Todos ({allMovements.length})
              </button>
              <button
                type="button"
                onClick={() => setMovementFilter('comissoes')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  movementFilter === 'comissoes' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                Comissões ({allMovements.filter((m) => m.tipo === 'comissao').length})
              </button>
              <button
                type="button"
                onClick={() => setMovementFilter('saques')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  movementFilter === 'saques' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                Saques ({allMovements.filter((m) => m.tipo === 'saque').length})
              </button>
              <button
                type="button"
                onClick={() => setMovementFilter('pontos')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  movementFilter === 'pontos' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                Pontos ({allMovements.filter((m) => m.tipo === 'pontos').length})
              </button>
            </div>
          </div>

          <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200/80 bg-white">
            {filteredMovements.map((item: any) => (
              <div
                key={item.id}
                onClick={() => {
                  if (item.originalCommission) {
                    setSelectedCommission(item.originalCommission);
                  }
                }}
                className={`grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3.5 hover:bg-neutral-50/80 transition-colors ${item.originalCommission ? 'cursor-pointer' : ''}`}
                title={item.originalCommission ? 'Clique para ver detalhes e prazo de carência' : undefined}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${item.isPositive ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-amber-500 ring-4 ring-amber-50'}`} />
                    <p className="truncate text-sm font-bold text-neutral-900">{item.titulo}</p>
                    <Status value={item.status} compact />
                  </div>
                  <p className="mt-1 truncate text-xs text-neutral-500">
                    {item.data ? formatDateTime(item.data) : 'Data não informada'} · {item.subtitulo}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black tracking-tight ${item.isPositive ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {item.isPositive ? '+' : '-'} {item.isCurrency ? formatCurrency(item.valor) : `${item.valor.toLocaleString('pt-BR')} pts`}
                  </p>
                </div>
              </div>
            ))}

            {filteredMovements.length === 0 && (
              <div className="py-12 text-center text-xs font-medium text-neutral-400">
                Nenhuma movimentação encontrada para este filtro.
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(selectedCommission)}
        onClose={() => setSelectedCommission(null)}
        title="Detalhes da Comissão"
        size="2xl"
      >
        {selectedCommission && (() => {
          const carenciaDefinida = selectedCommission.carenciaDias || 30;
          const criadoEm = selectedCommission.criadoEm ? new Date(selectedCommission.criadoEm) : new Date();
          const disponivelEm = selectedCommission.disponivelEm
            ? new Date(selectedCommission.disponivelEm)
            : new Date(criadoEm.getTime() + carenciaDefinida * 24 * 60 * 60 * 1000);
          const agora = new Date();

          const diffMs = disponivelEm.getTime() - agora.getTime();
          const diasRestantes = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const totalMs = Math.max(1, disponivelEm.getTime() - criadoEm.getTime());
          const decorridoMs = Math.max(0, agora.getTime() - criadoEm.getTime());
          const percentualConcluido = Math.min(100, Math.max(0, Math.round((decorridoMs / totalMs) * 100)));

          const isPendente = selectedCommission.status === 'pendente';
          const isDisponivel = selectedCommission.status === 'disponivel';
          const isPago = (selectedCommission.status as string) === 'paga' || (selectedCommission.status as string) === 'pago';

          const valorBruto = selectedCommission.valorBruto || selectedCommission.baseElegivel;
          const pontosGerados = Math.floor(valorBruto);

          return (
            <div className="space-y-6">
              {/* Header da Comissão com Código e Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Identificação da Venda</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-xl font-black text-[#8d6829]">
                      {selectedCommission.codigoReferencia || '—'}
                    </span>
                    {selectedCommission.codigoReferencia && (
                      <button
                        type="button"
                        onClick={() => {
                          void copyToClipboard(selectedCommission.codigoReferencia!);
                          toast.success('Código copiado!');
                        }}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                        title="Copiar código"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Status value={selectedCommission.status} />
                  <div className="text-right">
                    <p className="text-xs font-bold text-neutral-400">Valor da Comissão</p>
                    <p className="text-2xl font-black text-emerald-600">
                      {formatCurrency(selectedCommission.valor)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card de Carência e Liberação (Destaque Principal) */}
              <div className="rounded-2xl border border-[#e5ded0] bg-[#faf8f3] p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1522] text-[#ddc28d]">
                    <Clock3 className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-[#0b1522]">Carência e Liberação do Saldo</h4>
                      <span className="rounded-full bg-[#0b1522]/10 px-2.5 py-0.5 text-xs font-black text-[#0b1522]">
                        {carenciaDefinida} dias de carência
                      </span>
                    </div>

                    {isPendente && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-[#8d6829]">
                            {diasRestantes > 0 ? `Faltam ${diasRestantes} dia(s) para a liberação` : 'Liberação em processamento hoje'}
                          </span>
                          <span className="text-neutral-500">{percentualConcluido}% concluído</span>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e8e2d5]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#8d6829] to-[#c59a4a] transition-all duration-500"
                            style={{ width: `${percentualConcluido}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-neutral-500">
                          Data prevista para saldo ficar disponível: <strong className="text-neutral-800">{formatDateTime(disponivelEm.toISOString())}</strong>
                        </p>
                      </div>
                    )}

                    {isDisponivel && (
                      <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        ✅ <strong>Carência Concluída:</strong> O valor de {formatCurrency(selectedCommission.valor)} está liberado no seu saldo disponível para saque PIX.
                      </div>
                    )}

                    {isPago && (
                      <div className="mt-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl p-3">
                        🎉 <strong>Comissão Paga:</strong> O valor desta comissão já foi transferido para sua conta via PIX.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabela de Detalhes da Operação */}
              <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-100 font-bold text-xs text-neutral-600 uppercase tracking-wider">
                  Detalhamento da Venda
                </div>
                <dl className="divide-y divide-neutral-100 text-sm">
                  <div className="grid grid-cols-2 px-4 py-3">
                    <dt className="text-neutral-500 font-medium">Programa de Afiliados</dt>
                    <dd className="font-semibold text-neutral-900 text-right">{selectedCommission.programaNome}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-3">
                    <dt className="text-neutral-500 font-medium">Data e Hora da Venda</dt>
                    <dd className="font-semibold text-neutral-900 text-right">
                      {selectedCommission.criadoEm ? formatDateTime(selectedCommission.criadoEm) : '—'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-3">
                    <dt className="text-neutral-500 font-medium">Valor Bruto da Venda</dt>
                    <dd className="font-semibold text-neutral-900 text-right">{formatCurrency(valorBruto)}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-3">
                    <dt className="text-neutral-500 font-medium">Base Elegível para Comissão</dt>
                    <dd className="font-semibold text-neutral-900 text-right">{formatCurrency(selectedCommission.baseElegivel)}</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-3">
                    <dt className="text-neutral-500 font-medium">Percentual Aplicado</dt>
                    <dd className="font-semibold text-neutral-900 text-right">{selectedCommission.percentual}%</dd>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-3">
                    <dt className="text-neutral-500 font-medium">Pontos Gerados (R$ 1 bruto = 1 pt)</dt>
                    <dd className="font-bold text-[#8d6829] text-right">+{pontosGerados} pts</dd>
                  </div>
                </dl>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Solicitar Exclusão da Conta">
        <div className="space-y-4 text-sm text-[#0b1522]">
          <div className="flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-xs leading-relaxed text-red-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-bold">Processo de Exclusão da Conta</p>
              <p className="mt-1 text-red-800/90">
                A solicitação de exclusão é um processo analisado pelo sistema e equipe de segurança. Ao confirmar, uma solicitação prioritária será gerada para tratamento em até <strong>3 dias úteis</strong>.
              </p>
            </div>
          </div>

          <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#4f5864]">
            Motivo da exclusão *
            <textarea
              required
              rows={4}
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Por favor, conte-nos o motivo do encerramento..."
              className="affiliate-input mt-2 w-full resize-none p-3 text-sm"
            />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              className="border border-[#c9c2b6] bg-white px-4 py-2.5 text-xs font-bold text-[#4f5864] hover:bg-[#f4f1ea]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={submittingDelete || !deleteReason.trim()}
              onClick={handleConfirmDeleteAccount}
              className="inline-flex items-center gap-2 bg-red-600 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {submittingDelete ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Confirmar Solicitação
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SidebarNav({ activeTab, onSelect }: { activeTab: TabType; onSelect: (tab: TabType) => void }) {
  return (
    <nav className="flex-1 p-4" aria-label="Módulos do Portal do Afiliado">
      <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a9199]">Operação</p>
      <div className="space-y-1">
        {TAB_ITEMS.map(({ id, label, icon: Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex min-h-11 w-full items-center gap-3 border-l-[3px] px-3 py-2 text-left text-sm font-semibold transition-colors ${selected ? 'border-[#c59a4a] bg-[#0b1522] text-white' : 'border-transparent text-[#5f6873] hover:bg-[#e9e3d8] hover:text-[#0b1522]'}`}
            >
              <Icon className={`h-4 w-4 ${selected ? 'text-[#ddc28d]' : 'text-[#848c96]'}`} />
              <span className="flex-1">{label}</span>
              {selected && <ChevronRight className="h-4 w-4 text-white/40" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MobileNavItem({ icon: Icon, label, active, onClick }: KeyedProps & { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-w-[72px] flex-1 flex-col items-center justify-center gap-1 px-2 py-1 text-[10px] transition-colors ${active ? 'font-bold text-[#0b1522]' : 'font-semibold text-[#858c95]'}`}>
      <span className={`flex h-7 w-8 items-center justify-center ${active ? 'bg-[#0b1522] text-[#ddc28d]' : ''}`}><Icon className="h-4 w-4" /></span>
      {label}
    </button>
  );
}

function MetricCard({ label, value, icon: Icon, detail }: { label: string; value: string; icon: LucideIcon; detail: string }) {
  return (
    <article className="border border-[#c9c2b6] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center bg-[#0b1522] text-[#ddc28d]"><Icon className="h-5 w-5" /></span>
        <BarChart3 className="h-4 w-4 text-[#b4aa9a]" aria-hidden="true" />
      </div>
      <p className="mt-5 truncate text-xl font-semibold tracking-[-0.035em] text-[#0b1522] sm:text-2xl">{value}</p>
      <p className="mt-2 text-xs font-bold text-[#5f6873]">{label}</p>
      <p className="mt-1 text-[11px] text-[#8a9199]">{detail}</p>
    </article>
  );
}

function LinkCard({ link }: KeyedProps & { link: AffiliateSnapshot['links'][number] }) {
  const url = affiliateUrl(link);

  const copy = async () => {
    await copyToClipboard(url);
    toast.success('Link copiado.');
  };

  return (
    <article className="border border-[#c9c2b6] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#0b1522]">{link.titulo}</p>
          <p className="mt-1 text-xs text-[#727a84]">
            {link.programaNome} · código <span className="font-mono font-bold text-[#8d6829]">{link.codigo}</span>
          </p>
        </div>
        <span className={`border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${link.ativo ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
          {link.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="mt-4 flex border border-[#d8d1c6] bg-[#f5f2ec]">
        <input readOnly value={url} aria-label={`Link ${link.titulo}`} className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-[11px] text-[#5e6671] outline-none" />
        <button type="button" onClick={() => void copy()} className="flex w-11 shrink-0 items-center justify-center border-l border-[#d8d1c6] bg-white text-[#0b1522] hover:bg-[#0b1522] hover:text-white" title="Copiar link">
          <Copy className="h-4 w-4" />
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="flex w-11 shrink-0 items-center justify-center border-l border-[#d8d1c6] bg-white text-[#0b1522] hover:bg-[#0b1522] hover:text-white" title="Abrir link">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-[#d8d1c6] border-t border-[#d8d1c6] pt-4 text-center">
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a9199]">Cliques</dt><dd className="mt-1 text-sm font-semibold text-[#0b1522]">{link.cliques.toLocaleString('pt-BR')}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a9199]">Conversões</dt><dd className="mt-1 text-sm font-semibold text-[#0b1522]">{link.conversoes.toLocaleString('pt-BR')}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a9199]">Comissão</dt><dd className="mt-1 text-sm font-semibold text-[#0b1522]">{formatCurrency(link.comissaoTotal)}</dd></div>
      </dl>
    </article>
  );
}

function CompactLinkRow({ link }: KeyedProps & { link: AffiliateSnapshot['links'][number] }) {
  const url = affiliateUrl(link);
  const copy = async () => {
    await copyToClipboard(url);
    toast.success('Link copiado.');
  };

  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#0b1522]">{link.titulo}</p>
        <p className="mt-1 text-xs text-[#7a828c]">
          {link.cliques.toLocaleString('pt-BR')} cliques · {link.conversoes.toLocaleString('pt-BR')} conversões · {formatCurrency(link.comissaoTotal)}
        </p>
      </div>
      <button type="button" onClick={() => void copy()} className="flex h-9 w-9 items-center justify-center border border-[#d8d1c6] text-[#0b1522] hover:bg-[#0b1522] hover:text-white" aria-label={`Copiar ${link.titulo}`}>
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

function Status({ value, compact = false }: { value: string; compact?: boolean }) {
  return (
    <span className={`inline-flex border font-bold uppercase tracking-[0.08em] ${statusTone(value)} ${compact ? 'mt-1 px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}>
      {STATUS_LABELS[value] || value.replaceAll('_', ' ')}
    </span>
  );
}

function EmptyState({ icon: Icon, title, text, actionLabel, onAction }: { icon: LucideIcon; title: string; text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center border border-[#c9c2b6] bg-[#f4f1ea] text-[#8d6829]"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-4 text-sm font-semibold text-[#0b1522]">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[#7a828c]">{text}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#8d6829] hover:text-[#0b1522]">
          {actionLabel} <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

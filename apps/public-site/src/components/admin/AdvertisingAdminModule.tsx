import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { FormEvent } from 'react';
import {
  Megaphone,
  MessageSquareText,
  CalendarClock,
  FileImage,
  WalletCards,
  BarChart3,
  RefreshCw,
  Search,
  MailPlus,
  Pause,
  Play,
  Settings2,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import type {
  AdvertisingAdminOverview,
  AdvertisingCampaign,
  AdvertisingCreative,
  AdvertisingPayment,
  AdvertisingPaymentStatus,
  AdvertisingPlacement,
  AdvertisingProposal,
  AdvertisingRequest,
  AdvertisingRequestStatus,
} from '../../types/advertising';

const ADVERTISER_ADMIN_FUNCTION = 'gsa-ads-admin'; // 'gsa-advertiser-admin'

const EMPTY: AdvertisingAdminOverview = {
  requests: [],
  proposals: [],
  campaigns: [],
  placements: [],
};

const REQUEST_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  submitted: 'Recebida',
  under_review: 'Em análise',
  awaiting_information: 'Aguardando info',
  proposal_sent: 'Proposta enviada',
  negotiation_requested: 'Negociação',
  accepted: 'Aceita',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};

const CAMPAIGN_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  payment_pending: 'Pagamento pendente',
  payment_overdue: 'Pagamento vencido',
  creative_review: 'Revisão de criativo',
  scheduled: 'Agendada',
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  paid: 'Pago',
  failed: 'Falhou',
  overdue: 'Vencido',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

type Tab = 'requests' | 'proposals' | 'campaigns' | 'creatives' | 'payments' | 'inventory';

const money = (v: number) => formatCurrency(v || 0);
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const today = (plusDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().split('T')[0];
};
const message = (err: any, fallback: string) => err?.message || fallback;

export function AdvertisingAdminModule() {
  const [tab, setTab] = useState<Tab>('requests');
  const [overview, setOverview] = useState<AdvertisingAdminOverview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const [proposalRequest, setProposalRequest] = useState<AdvertisingRequest | null>(null);
  const [amount, setAmount] = useState('');
  const [startsOn, setStartsOn] = useState(today(7));
  const [endsOn, setEndsOn] = useState(today(37));
  const [validUntil, setValidUntil] = useState(today(7));
  const [frequencyModel, setFrequencyModel] = useState('once_per_day');
  const [frequencyValue, setFrequencyValue] = useState('1');
  const [impressionLimit, setImpressionLimit] = useState('');
  const [terms, setTerms] = useState('A publicação depende da confirmação do pagamento e da aprovação do criativo.');
  const [reviewCreative, setReviewCreative] = useState<AdvertisingCreative | null>(null);
  const [reviewApproved, setReviewApproved] = useState(true);
  const [reviewReason, setReviewReason] = useState('');
  const [paymentAction, setPaymentAction] = useState<{ payment: AdvertisingPayment; status: AdvertisingPaymentStatus } | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('manual');
  const [placement, setPlacement] = useState<AdvertisingPlacement | null>(null);
  const [capacity, setCapacity] = useState('1');
  const [basePrice, setBasePrice] = useState('0');
  const [placementActive, setPlacementActive] = useState(true);
  const [placementExclusive, setPlacementExclusive] = useState(false);
  const [placementDevices, setPlacementDevices] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gsa_admin_advertising_overview');
      if (error) throw error;
      const result = (data || EMPTY) as AdvertisingAdminOverview;
      setOverview({
        requests: result.requests || [],
        proposals: result.proposals || [],
        campaigns: result.campaigns || [],
        placements: result.placements || [],
      });
    } catch (error) {
      console.error('Falha ao carregar GSA Anúncios:', error);
      setOverview(EMPTY);
      toast.error(message(error, 'Não foi possível carregar o módulo de anúncios.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useRealtimeSubscription([
    { table: 'gsa_ad_requests', onChange: load, debounceMs: 300 },
    { table: 'gsa_ad_proposals', onChange: load, debounceMs: 300 },
    { table: 'gsa_ad_campaigns', onChange: load, debounceMs: 300 },
    { table: 'gsa_ad_creatives', onChange: load, debounceMs: 300 },
    { table: 'gsa_ad_payments', onChange: load, debounceMs: 300 },
    { table: 'gsa_ad_placements', onChange: load, debounceMs: 300 },
  ], [load]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    return overview.requests.filter((item) => !term || [item.protocol, item.company_name, item.contact_name, item.contact_email].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [overview.requests, search]);

  const creatives = useMemo(() => overview.campaigns.flatMap((campaign) => campaign.creatives || []), [overview.campaigns]);
  const payments = useMemo(() => overview.campaigns.map((campaign) => campaign.payment).filter(Boolean) as AdvertisingPayment[], [overview.campaigns]);
  const totals = useMemo(() => ({
    requests: overview.requests.length,
    active: overview.campaigns.filter((campaign) => campaign.status === 'active').length,
    pending: overview.proposals.filter((proposal) => ['sent', 'negotiating', 'final_offer'].includes(proposal.status)).length,
    revenue: payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  }), [overview, payments]);

  const rpc = async (name: string, payload: Record<string, unknown>, successMessage: string) => {
    const { data, error } = await supabase.rpc(name, payload);
    if (error || data?.success === false) throw error || new Error(data?.error || 'Operação recusada pelo servidor.');
    toast.success(successMessage);
    await load();
    return data;
  };

  const updateRequest = async (request: AdvertisingRequest, status: AdvertisingRequestStatus) => {
    setActionId(request.id);
    try {
      await rpc('gsa_admin_update_ad_request_status', { p_request_id: request.id, p_status: status }, `Solicitação atualizada para ${REQUEST_LABELS[status]}.`);
    } catch (error) {
      toast.error(message(error, 'Não foi possível atualizar a solicitação.'));
    } finally { setActionId(null); }
  };

  const openProposal = (request: AdvertisingRequest) => {
    if (['accepted', 'rejected', 'cancelled'].includes(request.status)) return toast.error('Esta solicitação está encerrada.');
    const current = overview.proposals.find((proposal) => proposal.request_id === request.id);
    if (current && ['accepted', 'rejected', 'cancelled'].includes(current.status)) return toast.error('A proposta desta solicitação está encerrada.');
    setProposalRequest(request);
    setAmount(String(current?.total_amount || request.intended_budget || ''));
    setStartsOn(current?.version?.starts_on || request.desired_start_date || today(7));
    setEndsOn(current?.version?.ends_on || request.desired_end_date || today(36));
    setFrequencyModel(current?.version?.frequency_model || 'once_per_day');
    setFrequencyValue(String(current?.version?.frequency_value || 1));
    setImpressionLimit(current?.version?.impression_limit ? String(current.version.impression_limit) : '');
    setTerms(current?.version?.terms || 'A publicação depende da confirmação do pagamento e da aprovação do criativo.');
  };

  const submitProposal = async (event: FormEvent) => {
    event.preventDefault();
    if (!proposalRequest) return;
    const numericAmount = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return toast.error('Informe um valor válido.');
    if (endsOn < startsOn) return toast.error('A data final não pode ser anterior à inicial.');
    setActionId(proposalRequest.id);
    try {
      const data = await rpc('gsa_admin_create_ad_proposal', {
        p_request_id: proposalRequest.id,
        p_payload: {
          amount: numericAmount,
          starts_on: startsOn,
          ends_on: endsOn,
          valid_until: `${validUntil}T23:59:59-03:00`,
          formats: proposalRequest.desired_formats,
          placement_codes: proposalRequest.desired_pages,
          frequency_model: frequencyModel,
          frequency_value: ['unlimited', 'once_per_session', 'once_per_day'].includes(frequencyModel) ? null : Number(frequencyValue || 1),
          impression_limit: impressionLimit ? Number(impressionLimit) : null,
          terms: terms.trim(),
        },
      }, 'Proposta gravada no sistema.');
      const { data: invite, error: inviteError } = await supabase.functions.invoke(ADVERTISER_ADMIN_FUNCTION, { body: { action: 'invite', request_id: proposalRequest.id } });
      if (inviteError || !invite?.success) toast.error('A proposta foi criada, mas o convite do portal não foi enviado. Reenvie o acesso.');
      else toast.success(data?.version ? `Proposta v${data.version} liberada no portal.` : 'Portal do anunciante liberado.');
      setProposalRequest(null);
      setTab('proposals');
    } catch (error) {
      toast.error(message(error, 'Não foi possível criar a proposta.'));
    } finally { setActionId(null); }
  };

  const invite = async (request: AdvertisingRequest) => {
    setActionId(request.id);
    try {
      const { data, error } = await supabase.functions.invoke(ADVERTISER_ADMIN_FUNCTION, { body: { action: 'invite', request_id: request.id } });
      if (error || !data?.success) throw error || new Error('Convite recusado.');
      toast.success(data.already_linked ? 'Acesso reenviado ao anunciante.' : 'Convite enviado ao anunciante.');
      await load();
    } catch (error) { toast.error(message(error, 'Não foi possível enviar o acesso.')); }
    finally { setActionId(null); }
  };

  const submitReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewCreative) return;
    if (!reviewApproved && reviewReason.trim().length < 5) return toast.error('Explique o ajuste necessário.');
    setActionId(reviewCreative.id);
    try {
      await rpc('gsa_admin_review_ad_creative', { p_creative_id: reviewCreative.id, p_approved: reviewApproved, p_reason: reviewApproved ? null : reviewReason.trim() }, reviewApproved ? 'Criativo aprovado.' : 'Criativo devolvido para correção.');
      setReviewCreative(null);
      setReviewReason('');
    } catch (error) { toast.error(message(error, 'Não foi possível analisar o criativo.')); }
    finally { setActionId(null); }
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentAction) return;
    if (paymentAction.status === 'paid' && paymentReference.trim().length < 4) return toast.error('Informe a referência do pagamento.');
    setActionId(paymentAction.payment.id);
    try {
      await rpc('gsa_admin_mark_ad_payment', {
        p_payment_id: paymentAction.payment.id,
        p_status: paymentAction.status,
        p_provider_reference: paymentReference.trim() || paymentAction.payment.provider_reference || null,
        p_payment_method: paymentMethod.trim() || null,
      }, `Pagamento atualizado para ${PAYMENT_LABELS[paymentAction.status]}.`);
      setPaymentAction(null);
      setPaymentReference('');
    } catch (error) { toast.error(message(error, 'Não foi possível atualizar o pagamento.')); }
    finally { setActionId(null); }
  };

  const campaignAction = async (campaign: AdvertisingCampaign, status: 'paused' | 'active' | 'cancelled') => {
    setActionId(campaign.id);
    try { await rpc('gsa_admin_update_ad_campaign_status', { p_campaign_id: campaign.id, p_status: status }, `Campanha atualizada para ${CAMPAIGN_LABELS[status]}.`); }
    catch (error) { toast.error(message(error, 'Não foi possível atualizar a campanha.')); }
    finally { setActionId(null); }
  };

  const openPlacement = (item: AdvertisingPlacement) => {
    setPlacement(item);
    setCapacity(String(item.capacity));
    setBasePrice(String(item.base_daily_price));
    setPlacementActive(item.active);
    setPlacementExclusive(item.exclusive);
    setPlacementDevices(item.devices || []);
  };

  const submitPlacement = async (event: FormEvent) => {
    event.preventDefault();
    if (!placement) return;
    const parsedCapacity = Number(capacity);
    const parsedPrice = Number(basePrice.replace(',', '.'));
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 100) return toast.error('A capacidade deve ficar entre 1 e 100.');
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return toast.error('Informe um preço válido.');
    if (!placementDevices.length) return toast.error('Selecione ao menos um dispositivo.');
    setActionId(placement.id);
    try {
      await rpc('gsa_admin_update_ad_placement', { p_placement_id: placement.id, p_payload: { active: placementActive, capacity: parsedCapacity, exclusive: placementExclusive, base_daily_price: parsedPrice, devices: placementDevices } }, 'Posição publicitária atualizada.');
      setPlacement(null);
    } catch (error) { toast.error(message(error, 'Não foi possível atualizar a posição.')); }
    finally { setActionId(null); }
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof Megaphone }> = [
    { id: 'requests', label: 'Solicitações', icon: Megaphone },
    { id: 'proposals', label: 'Propostas', icon: MessageSquareText },
    { id: 'campaigns', label: 'Campanhas', icon: CalendarClock },
    { id: 'creatives', label: 'Criativos', icon: FileImage },
    { id: 'payments', label: 'Pagamentos', icon: WalletCards },
    { id: 'inventory', label: 'Inventário', icon: BarChart3 },
  ];

  if (loading) return <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-sm font-bold text-neutral-500">Carregando GSA Anúncios...</div>;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black text-neutral-950">GSA Anúncios</h1><p className="text-sm text-neutral-500">Operação conectada ao banco de dados em tempo real.</p></div>
        <button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-bold text-neutral-700 shadow-sm hover:bg-neutral-50"><RefreshCw className="h-4 w-4" /> Atualizar</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['Solicitações', totals.requests], ['Propostas pendentes', totals.pending], ['Campanhas ativas', totals.active], ['Receita confirmada', money(totals.revenue)]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-neutral-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-2">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${tab === id ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {tab === 'requests' && (
        <div className="space-y-3">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar protocolo, empresa ou contato" className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-10 pr-4" /></div>
          {filteredRequests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap justify-between gap-3"><div><p className="font-mono text-xs font-bold text-amber-700">{request.protocol}</p><h2 className="text-lg font-black">{request.company_name}</h2><p className="text-sm text-neutral-500">{request.contact_name} · {request.contact_email}</p></div><span className="h-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-black">{REQUEST_LABELS[request.status]}</span></div>
              <p className="mt-3 text-sm text-neutral-600">{request.objective}</p>
              <div className="mt-4 grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Criação pela GSA</p><p className="mt-1 font-bold text-neutral-700">{request.needs_creative_service ? 'Solicitada' : 'Não solicitada'}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Investimento estimado</p><p className="mt-1 font-bold text-neutral-700">{money(request.intended_budget)}</p></div>
                {request.notes && <div className="sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Referência criativa e observações</p><p className="mt-2 whitespace-pre-line leading-6 text-neutral-700">{request.notes}</p></div>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {request.status === 'submitted' && <button disabled={actionId === request.id} onClick={() => void updateRequest(request, 'under_review')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Iniciar análise</button>}
                {!['accepted', 'rejected', 'cancelled'].includes(request.status) && <button disabled={actionId === request.id} onClick={() => openProposal(request)} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black">Criar proposta</button>}
                {request.advertiser_id && <button disabled={actionId === request.id} onClick={() => void invite(request)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><MailPlus className="h-3.5 w-3.5" />Enviar acesso</button>}
                {!['accepted', 'rejected', 'cancelled'].includes(request.status) && <button disabled={actionId === request.id} onClick={() => void updateRequest(request, 'cancelled')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Cancelar</button>}
              </div>
            </article>
          ))}
          {!filteredRequests.length && <Empty text="Nenhuma solicitação encontrada no banco." />}
        </div>
      )}

      {tab === 'proposals' && <div className="space-y-3">{overview.proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}{!overview.proposals.length && <Empty text="Nenhuma proposta gravada." />}</div>}

      {tab === 'campaigns' && <div className="space-y-3">{overview.campaigns.map((campaign) => <article key={campaign.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-black">{campaign.name}</h2><p className="text-sm text-neutral-500">{date(campaign.starts_at)} até {date(campaign.ends_at)}</p></div><span className="h-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-black">{CAMPAIGN_LABELS[campaign.status]}</span></div><div className="mt-4 flex gap-2">{campaign.status === 'active' && <button onClick={() => void campaignAction(campaign, 'paused')} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Pause className="h-3.5 w-3.5" />Pausar</button>}{campaign.status === 'paused' && <button onClick={() => void campaignAction(campaign, 'active')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Play className="h-3.5 w-3.5" />Retomar</button>}{!['completed', 'cancelled'].includes(campaign.status) && <button onClick={() => void campaignAction(campaign, 'cancelled')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700">Cancelar</button>}</div></article>)}{!overview.campaigns.length && <Empty text="Nenhuma campanha criada." />}</div>}

      {tab === 'creatives' && <div className="space-y-3">{creatives.map((creative) => <article key={creative.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h2 className="font-black">{creative.headline || `${creative.kind} ${creative.id.slice(0, 8)}`}</h2><p className="text-sm text-neutral-500">Status: {creative.status}</p>{creative.rejection_reason && <p className="mt-2 text-sm text-red-600">{creative.rejection_reason}</p>}</div>{creative.status === 'pending_review' && <div className="flex gap-2"><button onClick={() => { setReviewCreative(creative); setReviewApproved(true); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Aprovar</button><button onClick={() => { setReviewCreative(creative); setReviewApproved(false); }} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">Reprovar</button></div>}</div></article>)}{!creatives.length && <Empty text="Nenhum criativo enviado." />}</div>}

      {tab === 'payments' && <div className="space-y-3">{payments.map((payment) => <article key={payment.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-black">{money(payment.amount)}</h2><p className="text-sm text-neutral-500">Vencimento: {date(payment.due_at)} · Referência: {payment.provider_reference || 'não configurada'}</p></div><span className="h-fit rounded-full bg-neutral-100 px-3 py-1 text-xs font-black">{PAYMENT_LABELS[payment.status]}</span></div><div className="mt-4 flex flex-wrap gap-2">{!['paid', 'refunded', 'cancelled'].includes(payment.status) && <button onClick={() => { setPaymentAction({ payment, status: 'paid' }); setPaymentReference(payment.provider_reference || `MANUAL-${Date.now()}`); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Confirmar pagamento</button>}{payment.status === 'paid' && <button onClick={() => setPaymentAction({ payment, status: 'refunded' })} className="rounded-lg border px-3 py-2 text-xs font-bold">Registrar estorno</button>}</div></article>)}{!payments.length && <Empty text="Nenhuma cobrança criada." />}</div>}

      {tab === 'inventory' && <div className="grid gap-3 lg:grid-cols-2">{overview.placements.map((item) => <article key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h2 className="font-black">{item.name}</h2><p className="font-mono text-xs text-neutral-500">{item.code}</p></div><span className={`h-fit rounded-full px-3 py-1 text-xs font-black ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100'}`}>{item.active ? 'Ativa' : 'Inativa'}</span></div><p className="mt-3 text-sm text-neutral-600">Capacidade: {item.capacity} · Preço diário: {money(item.base_daily_price)}</p><button onClick={() => openPlacement(item)} className="mt-4 flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><Settings2 className="h-3.5 w-3.5" />Configurar</button></article>)}</div>}

      {proposalRequest && <Modal title={`Proposta para ${proposalRequest.company_name}`} onClose={() => setProposalRequest(null)}><form onSubmit={submitProposal} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Input  label="Valor" value={amount} onChange={setAmount} type="number" inputMode="numeric"/><Input label="Validade" value={validUntil} onChange={setValidUntil} type="date" /><Input label="Início" value={startsOn} onChange={setStartsOn} type="date" /><Input label="Término" value={endsOn} onChange={setEndsOn} type="date" /></div><select value={frequencyModel} onChange={(event) => setFrequencyModel(event.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:border-amber-400"><option value="once_per_session">Uma vez por sessão</option><option value="once_per_day">Uma vez por dia</option><option value="interval_hours">Intervalo em horas</option><option value="daily_limit">Limite diário</option><option value="unlimited">Sem limite individual</option></select>{['interval_hours', 'daily_limit'].includes(frequencyModel) && <Input  label="Valor da frequência" value={frequencyValue} onChange={setFrequencyValue} type="number" inputMode="numeric"/>}<Input  label="Limite total de impressões (opcional)" value={impressionLimit} onChange={setImpressionLimit} type="number" inputMode="numeric"/><textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={4} className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:border-amber-400" /><Submit busy={actionId === proposalRequest.id} text="Gravar proposta e liberar portal" /></form></Modal>}
      {reviewCreative && <Modal title={reviewApproved ? 'Aprovar criativo' : 'Solicitar correção'} onClose={() => setReviewCreative(null)}><form onSubmit={submitReview} className="space-y-4">{!reviewApproved && <textarea required value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Explique o ajuste necessário" rows={4} className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:border-amber-400" />}<Submit busy={actionId === reviewCreative.id} text={reviewApproved ? 'Confirmar aprovação' : 'Devolver para correção'} /></form></Modal>}
      {paymentAction && <Modal title={`Atualizar pagamento para ${PAYMENT_LABELS[paymentAction.status]}`} onClose={() => setPaymentAction(null)}><form onSubmit={submitPayment} className="space-y-4"><Input label="Referência" value={paymentReference} onChange={setPaymentReference} /><Input label="Método" value={paymentMethod} onChange={setPaymentMethod} /><Submit busy={actionId === paymentAction.payment.id} text="Confirmar atualização" /></form></Modal>}
      {placement && <Modal title={`Configurar ${placement.name}`} onClose={() => setPlacement(null)}><form onSubmit={submitPlacement} className="space-y-4"><Input  label="Capacidade" value={capacity} onChange={setCapacity} type="number" inputMode="numeric"/><Input  label="Preço diário" value={basePrice} onChange={setBasePrice} type="number" inputMode="numeric"/><label className="flex gap-2"><input type="checkbox" checked={placementActive} onChange={(event) => setPlacementActive(event.target.checked)} />Posição ativa</label><label className="flex gap-2"><input type="checkbox" checked={placementExclusive} onChange={(event) => setPlacementExclusive(event.target.checked)} />Exclusiva</label><div className="flex gap-3">{['desktop', 'tablet', 'mobile'].map((device) => <label key={device} className="flex gap-1"><input type="checkbox" checked={placementDevices.includes(device)} onChange={() => setPlacementDevices((current) => current.includes(device) ? current.filter((item) => item !== device) : [...current, device])} />{device}</label>)}</div><Submit busy={actionId === placement.id} text="Salvar inventário" /></form></Modal>}
    </section>
  );
}

function ProposalCard({ proposal }: { proposal: AdvertisingProposal; key?: string }) {
  return <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-black">{proposal.company_name || `Proposta ${proposal.id.slice(0, 8)}`}</h2><p className="text-sm text-neutral-500">Versão {proposal.current_version} · válida até {date(proposal.valid_until)}</p></div><div className="text-right"><p className="text-lg font-black">{money(proposal.total_amount)}</p><p className="text-xs font-bold uppercase text-neutral-500">{proposal.status}</p></div></div>{proposal.negotiations?.length ? <div className="mt-4 space-y-2 border-t pt-4">{proposal.negotiations.map((item) => <p key={item.id} className="rounded-xl bg-neutral-50 p-3 text-sm"><strong>{item.actor_type === 'admin' ? 'GSA' : 'Anunciante'}:</strong> {item.message}{item.proposed_amount ? ` — ${money(item.proposed_amount)}` : ''}</p>)}</div> : null}</article>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center text-sm font-bold text-neutral-400">{text}</div>; }
function Input({ label, value, onChange, type = 'text', inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: "search" | "text" | "email" | "tel" | "url" | "none" | "numeric" | "decimal" }) { return <label className="block text-sm font-bold">{label}<input required={label !== 'Limite total de impressões (opcional)'} type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 font-normal outline-none focus:border-amber-400" /></label>; }
function Submit({ busy, text }: { busy: boolean; text: string }) { return <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 font-black text-white disabled:opacity-50">{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{text}</button>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button type="button" onClick={onClose}><XCircle className="h-6 w-6" /></button></div>{children}</div></div>; }

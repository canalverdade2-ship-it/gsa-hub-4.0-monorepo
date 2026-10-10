import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MessageCircle,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatCurrency, copyToClipboard, generateUUID } from '../../lib/utils';
import { navigate } from '../../routing/navigationService';
import {
  cancelAffiliatePayout,
  createAffiliateLink,
  fetchAffiliateSnapshot,
  joinAffiliate,
  requestAffiliatePayout,
  updateAffiliateProfile,
} from '../../features/affiliates/service';
import type {
  AffiliateCommissionStatus,
  AffiliateLink,
  AffiliatePayoutStatus,
  AffiliateSnapshot,
} from '../../features/affiliates/types';
import { Modal } from '../ui/Modal';
import { useWhatsAppDocument } from '../../hooks/useWhatsAppDocument';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { generateExtratoPDF } from '../../lib/pdf';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { supabase } from '../../lib/supabase';
import { Send } from 'lucide-react';

const TERMS_VERSION = '2026-07-21';
const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

const emptySnapshot: AffiliateSnapshot = {
  affiliate: null,
  programs: [],
  links: [],
  summary: {
    cliques: 0,
    conversoes: 0,
    totalPendente: 0,
    totalDisponivel: 0,
    totalPago: 0,
    totalSolicitado: 0,
    saqueMinimo: 0,
  },
  commissions: [],
  payouts: [],
  pointsEvents: [],
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
};

const commissionStatus: Record<AffiliateCommissionStatus, { label: string; className: string }> = {
  pendente: { label: 'Em carência', className: 'bg-amber-50 text-amber-700' },
  disponivel: { label: 'Disponível', className: 'bg-emerald-50 text-emerald-700' },
  paga: { label: 'Paga', className: 'bg-indigo-50 text-indigo-700' },
  revertida: { label: 'Estornada', className: 'bg-rose-50 text-rose-700' },
};

const payoutStatus: Record<AffiliatePayoutStatus, { label: string; className: string }> = {
  solicitado: { label: 'Em Análise', className: 'bg-amber-50 text-amber-700' },
  aprovado: { label: 'Aprovado', className: 'bg-sky-50 text-sky-700' },
  pago: { label: 'Pago', className: 'bg-emerald-50 text-emerald-700' },
  rejeitado: { label: 'Rejeitado', className: 'bg-rose-50 text-rose-700' },
  cancelado: { label: 'Cancelado', className: 'bg-neutral-100 text-neutral-600' },
};

function affiliateUrl(link: AffiliateLink) {
  const fallback = `${window.location.origin}${link.destino || '/'}`;
  try {
    const url = new URL(link.destino || '/', window.location.origin);
    url.searchParams.set('ref', link.codigo);
    return url.toString();
  } catch {
    return `${fallback}${fallback.includes('?') ? '&' : '?'}ref=${encodeURIComponent(link.codigo)}`;
  }
}

function statusPill(status: AffiliateCommissionStatus) {
  return commissionStatus[status] || { label: status, className: 'bg-neutral-100 text-neutral-600' };
}

function payoutPill(status: AffiliatePayoutStatus) {
  return payoutStatus[status] || { label: status, className: 'bg-neutral-100 text-neutral-600' };
}

export function ClientAffiliatePanel({ clientId: _clientId }: { clientId: string }) {
  const [snapshot, setSnapshot] = useState<AffiliateSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [joinForm, setJoinForm] = useState({ nomeDivulgacao: '', pixTipo: 'cpf', pixChave: '', accepted: false });
  const [profileForm, setProfileForm] = useState({ nomeDivulgacao: '', pixTipo: 'cpf', pixChave: '' });
  const [linkForm, setLinkForm] = useState({ programaCodigo: '', destino: '', titulo: '' });
  const [payoutValue, setPayoutValue] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const data = await fetchAffiliateSnapshot();
      setSnapshot(data);
    } catch (reason: any) {
      setError(reason?.message || 'Não foi possível carregar sua área de afiliado.');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useRealtimeSubscription(
    [
      { table: 'gsa_afiliados', onChange: () => void load(true) },
      { table: 'saques', filter: _clientId ? `cliente_id=eq.${_clientId}` : undefined, onChange: () => void load(true) },
      { table: 'carteira_lancamentos', filter: _clientId ? `cliente_id=eq.${_clientId}` : undefined, onChange: () => void load(true) },
      { table: 'indicacoes', filter: _clientId ? `indicador_id=eq.${_clientId}` : undefined, onChange: () => void load(true) },
      { table: 'points_transactions', filter: _clientId ? `client_id=eq.${_clientId}` : undefined, onChange: () => void load(true) },
      { table: 'pontos_movimentacoes', filter: _clientId ? `cliente_id=eq.${_clientId}` : undefined, onChange: () => void load(true) },
    ],
    [_clientId]
  );

  useEffect(() => {
    if (!snapshot.affiliate) return;
    if (snapshot.affiliate.nomeDivulgacao && snapshot.affiliate.nomeDivulgacao.trim().length >= 2) {
      navigate('/afiliados/dashboard');
      return;
    }
    setProfileForm({
      nomeDivulgacao: snapshot.affiliate.nomeDivulgacao,
      pixTipo: snapshot.affiliate.pixTipo || 'cpf',
      pixChave: snapshot.affiliate.pixChave,
    });
  }, [snapshot.affiliate]);

  const activePrograms = useMemo(() => snapshot.programs.filter(program => program.ativo), [snapshot.programs]);
  const canRequestPayout = snapshot.summary.totalDisponivel > 0
    && snapshot.summary.totalDisponivel >= snapshot.summary.saqueMinimo;

  const handleJoin = async () => {
    if (joinForm.nomeDivulgacao.trim().length < 2) return toast.error('Informe o nome usado na divulgação.');
    if (!joinForm.pixTipo || !joinForm.pixChave.trim()) return toast.error('Informe uma chave PIX válida.');
    if (!joinForm.accepted) return toast.error('Aceite os termos do programa para continuar.');
    setWorking(true);
    try {
      const data = await joinAffiliate({
        nomeDivulgacao: joinForm.nomeDivulgacao.trim(),
        pixTipo: joinForm.pixTipo,
        pixChave: joinForm.pixChave.trim(),
        termosVersao: TERMS_VERSION,
      });
      setSnapshot(data);
      toast.success('Seu perfil de afiliado está ativo!');
      navigate('/afiliados/dashboard');
    } catch (reason: any) {
      toast.error(reason?.message || 'Não foi possível ativar seu perfil de afiliado.');
    } finally {
      setWorking(false);
    }
  };

  const handleProfileSave = async () => {
    if (profileForm.nomeDivulgacao.trim().length < 2 || !profileForm.pixChave.trim()) {
      return toast.error('Preencha o nome de divulgação e a chave PIX.');
    }
    setWorking(true);
    try {
      const data = await updateAffiliateProfile({
        nomeDivulgacao: profileForm.nomeDivulgacao.trim(),
        pixTipo: profileForm.pixTipo,
        pixChave: profileForm.pixChave.trim(),
      });
      setSnapshot(data);
      setProfileOpen(false);
      toast.success('Dados de recebimento atualizados.');
    } catch (reason: any) {
      toast.error(reason?.message || 'Não foi possível atualizar seu perfil.');
    } finally {
      setWorking(false);
    }
  };

  const openLinkModal = () => {
    const firstProgram = activePrograms[0];
    setLinkForm({
      programaCodigo: firstProgram?.codigo || '',
      destino: firstProgram?.caminhoPadrao || '/',
      titulo: '',
    });
    setLinkOpen(true);
  };

  const handleProgramChange = (programCode: string) => {
    const program = activePrograms.find(item => item.codigo === programCode);
    setLinkForm(current => ({
      ...current,
      programaCodigo: programCode,
      destino: program?.caminhoPadrao || current.destino,
    }));
  };

  const handleCreateLink = async () => {
    const destination = linkForm.destino.trim();
    if (!linkForm.programaCodigo) return toast.error('Selecione o programa.');
    if (!destination.startsWith('/') || destination.startsWith('//')) {
      return toast.error('Use um caminho interno iniciado por /, por exemplo /loja.');
    }
    if (linkForm.titulo.trim().length < 2) return toast.error('Dê um título ao seu link.');
    setWorking(true);
    try {
      const data = await createAffiliateLink({
        programaCodigo: linkForm.programaCodigo,
        destino: destination,
        titulo: linkForm.titulo.trim(),
      });
      setSnapshot(data);
      setLinkOpen(false);
      toast.success('Novo link criado.');
    } catch (reason: any) {
      toast.error(reason?.message || 'Não foi possível criar o link.');
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async (link: AffiliateLink) => {
    const copied = await copyToClipboard(affiliateUrl(link));
    copied ? toast.success('Link copiado!') : toast.error('Não foi possível copiar o link.');
  };

  const handleWhatsApp = (link: AffiliateLink) => {
    const message = `Conheça ${link.programaNome || 'o Grupo GSA'} pelo meu link: ${affiliateUrl(link)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleRequestPayout = async () => {
    const value = Number(payoutValue.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return toast.error('Informe um valor de saque válido.');
    if (value > snapshot.summary.totalDisponivel) return toast.error('O valor excede seu saldo disponível.');
    if (value < snapshot.summary.saqueMinimo) {
      return toast.error(`O saque mínimo é ${formatCurrency(snapshot.summary.saqueMinimo)}.`);
    }
    setWorking(true);
    try {
      const data = await requestAffiliatePayout(value, generateUUID());
      setSnapshot(data);
      setPayoutOpen(false);
      setPayoutValue('');
      toast.success('Solicitação de saque enviada.');
    } catch (reason: any) {
      toast.error(reason?.message || 'Não foi possível solicitar o saque.');
    } finally {
      setWorking(false);
    }
  };

  const handleCancelPayout = async (payoutId: string) => {
    setWorking(true);
    try {
      const data = await cancelAffiliatePayout(payoutId);
      setSnapshot(data);
      toast.success('Solicitação cancelada.');
    } catch (reason: any) {
      toast.error(reason?.message || 'Não foi possível cancelar a solicitação.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-neutral-200 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-sm font-bold text-neutral-600">Carregando área de afiliado...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
        <p className="mt-3 font-bold text-rose-900">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-secondary mt-5">
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!snapshot.affiliate) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 p-6 text-white shadow-xl sm:p-8">
          <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">Adesão aberta</span>
          <h3 className="mt-5 text-2xl font-black sm:text-3xl">Compartilhe a GSA e ganhe por vendas confirmadas.</h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-indigo-100">
            Qualquer cliente pode se tornar afiliado. Você recebe links próprios para Loja GSA, Viagens,
            Classificados e demais programas ativos, com acompanhamento de cliques, vendas e comissões.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ['1', 'Ative seu perfil'],
              ['2', 'Divulgue seus links'],
              ['3', 'Receba por PIX'],
            ].map(([numberLabel, label]) => (
              <div key={numberLabel} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                <span className="text-xl font-black">{numberLabel}</span>
                <p className="mt-1 text-xs font-bold text-indigo-50">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="text-lg font-black text-neutral-950">Quero ser afiliado</h3>
          <p className="mt-1 text-sm text-neutral-500">Preencha seus dados de divulgação e recebimento.</p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-neutral-600">Nome de divulgação</span>
              <input className="input-field" value={joinForm.nomeDivulgacao} onChange={event => setJoinForm(current => ({ ...current, nomeDivulgacao: event.target.value }))} placeholder="Como seu público conhece você" maxLength={100} />
            </label>
            <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-neutral-600">Tipo da chave PIX</span>
                <select className="input-field" value={joinForm.pixTipo} onChange={event => setJoinForm(current => ({ ...current, pixTipo: event.target.value }))}>
                  {PIX_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-neutral-600">Chave PIX</span>
                <input className="input-field" value={joinForm.pixChave} onChange={event => setJoinForm(current => ({ ...current, pixChave: event.target.value }))} placeholder="Informe a chave para recebimento" maxLength={180} />
              </label>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600" checked={joinForm.accepted} onChange={event => setJoinForm(current => ({ ...current, accepted: event.target.checked }))} />
              <span className="text-xs leading-relaxed text-neutral-600">
                Li e aceito os termos do Programa de Afiliados GSA. Entendo que a comissão depende da confirmação da venda, respeita o prazo de carência do programa e pode ser estornada em caso de cancelamento.
              </span>
            </label>
            <button type="button" disabled={working} onClick={handleJoin} className="btn-primary w-full py-3.5 disabled:opacity-60">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Ativar meu perfil de afiliado
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-neutral-950 p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${snapshot.affiliate.status === 'ativo' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
                Perfil {snapshot.affiliate.status}
              </span>
              {snapshot.affiliate.codigoPublico && <span className="font-mono text-[11px] text-white/50">#{snapshot.affiliate.codigoPublico}</span>}
            </div>
            <h3 className="mt-3 text-2xl font-black">Olá, {snapshot.affiliate.nomeDivulgacao}</h3>
            <p className="mt-1 text-sm text-white/55">Acompanhe seus resultados e compartilhe seus links exclusivos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setProfileOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black transition hover:bg-white/15">
              <Pencil className="h-4 w-4" /> Dados e PIX
            </button>
            <button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black transition hover:bg-white/15">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>
        </div>
      </section>

      {snapshot.affiliate.status !== 'ativo' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          Seus links estão temporariamente indisponíveis enquanto o perfil estiver {snapshot.affiliate.status}. Fale com o suporte se precisar de ajuda.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Cliques', value: String(snapshot.summary.cliques), icon: MousePointerClick, iconClass: 'bg-indigo-50 text-indigo-600' },
          { label: 'Vendas', value: String(snapshot.summary.conversoes), icon: ShoppingBag, iconClass: 'bg-violet-50 text-violet-600' },
          { label: 'Em carência', value: formatCurrency(snapshot.summary.totalPendente), icon: Clock3, iconClass: 'bg-amber-50 text-amber-600' },
          { label: 'Disponível', value: formatCurrency(snapshot.summary.totalDisponivel), icon: Wallet, iconClass: 'bg-emerald-50 text-emerald-600' },
        ].map(({ label, value, icon: Icon, iconClass }) => (
          <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <span className={`inline-flex rounded-xl p-2 ${iconClass}`}><Icon className="h-5 w-5" /></span>
            <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
            <p className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-neutral-950">Seus links de afiliado</h3>
            <p className="mt-1 text-xs text-neutral-500">Compartilhe o endereço completo para a venda ser atribuída a você.</p>
          </div>
          <button type="button" disabled={snapshot.affiliate.status !== 'ativo'} onClick={openLinkModal} className="btn-primary disabled:opacity-50">
            <Plus className="h-4 w-4" /> Criar link
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {snapshot.links.map(link => {
            const program = snapshot.programs.find(item => item.codigo === link.programaCodigo || item.id === link.programaId);
            return (
              <article key={link.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{link.programaNome || program?.nome}</p>
                    <h4 className="mt-1 truncate font-black text-neutral-900">{link.titulo}</h4>
                  </div>
                  {program && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{program.percentual}%</span>}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-neutral-200">
                  <Link2 className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-600">{affiliateUrl(link)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-3 text-[11px] font-bold text-neutral-500">
                    <span>{link.cliques} cliques</span><span>{link.conversoes} vendas</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void handleCopy(link)} className="rounded-xl border border-neutral-200 bg-white p-2 text-neutral-600 transition hover:text-indigo-600" aria-label={`Copiar ${link.titulo}`}><Copy className="h-4 w-4" /></button>
                    <button type="button" onClick={() => handleWhatsApp(link)} className="rounded-xl bg-emerald-500 p-2 text-white transition hover:bg-emerald-600" aria-label={`Compartilhar ${link.titulo} no WhatsApp`}><MessageCircle className="h-4 w-4" /></button>
                    <a href={affiliateUrl(link)} target="_blank" rel="noreferrer" className="rounded-xl border border-neutral-200 bg-white p-2 text-neutral-600 transition hover:text-indigo-600" aria-label={`Abrir ${link.titulo}`}><ExternalLink className="h-4 w-4" /></a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {snapshot.links.length === 0 && <p className="mt-6 rounded-2xl bg-neutral-50 p-8 text-center text-sm text-neutral-500">Seus links padrão aparecerão aqui. Você também pode criar um link agora.</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-neutral-950">Extrato de comissões</h3>
              <p className="mt-1 text-xs text-neutral-500">A porcentagem é registrada no momento da venda e não muda depois.</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const { data: cData } = await supabase.from('clientes').select('nome, telefone').eq('id', _clientId).single();
                  if (!cData?.telefone) { toast.error("Telefone não encontrado."); return; }
                  
                  const formattedCommissions = snapshot.commissions.map(c => ({
                    data: c.criadoEm,
                    descricao: `Comissão - ${c.programaNome} (${c.percentual}%)`,
                    tipo: c.status === 'revertida' ? 'saida' : 'entrada',
                    valor: c.valor
                  }));
                  
                  const doc = await generateExtratoPDF(formattedCommissions as any, cData.nome, { returnDoc: true }) as any;
                  const pdfBase64 = doc.output('datauristring');
                  
                  const msg = whatsappNotificationService.gerarMensagemWhatsApp({
                    tipo: 'extrato' as any,
                    clienteNome: cData.nome,
                  });
                  
                  await sendToWhatsApp(cData.telefone, msg, pdfBase64, `extrato_comissoes_${new Date().getTime()}.pdf`);
                } catch (e) {
                  console.error(e);
                  toast.error("Erro ao gerar extrato.");
                }
              }}
              disabled={isSendingWhatsApp || snapshot.commissions.length === 0}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
            >
              {isSendingWhatsApp ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" /> : <Send className="h-4 w-4" />}
              WhatsApp
            </button>
          </div>
          <div className="divide-y divide-neutral-100">
            {snapshot.commissions.map(commission => {
              const pill = statusPill(commission.status);
              return (
                <div key={commission.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-neutral-900">{commission.programaNome}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${pill.className}`}>{pill.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Base {formatCurrency(commission.baseElegivel)} · {commission.percentual}% · {formatDate(commission.criadoEm)}
                    </p>
                    {commission.status === 'pendente' && commission.disponivelEm && <p className="mt-1 text-[11px] font-bold text-amber-700">Liberação prevista: {formatDate(commission.disponivelEm)}</p>}
                  </div>
                  <p className={`text-lg font-black ${commission.status === 'revertida' ? 'text-rose-600 line-through' : 'text-emerald-600'}`}>{formatCurrency(commission.valor)}</p>
                </div>
              );
            })}
            {snapshot.commissions.length === 0 && <p className="p-10 text-center text-sm text-neutral-500">As comissões das vendas confirmadas aparecerão aqui.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Recebimentos</p>
              <h3 className="mt-1 text-xl font-black text-neutral-950">{formatCurrency(snapshot.summary.totalDisponivel)}</h3>
              <p className="mt-1 text-xs text-neutral-500">Disponível para saque</p>
            </div>
            <span className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><ArrowDownToLine className="h-5 w-5" /></span>
          </div>
          <button type="button" disabled={!canRequestPayout || snapshot.affiliate.status !== 'ativo'} onClick={() => { setPayoutValue(snapshot.summary.totalDisponivel.toFixed(2).replace('.', ',')); setPayoutOpen(true); }} className="btn-primary mt-5 w-full disabled:opacity-50">
            Solicitar saque
          </button>
          <p className="mt-2 text-center text-[10px] text-neutral-400">Mínimo: {formatCurrency(snapshot.summary.saqueMinimo)}</p>
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <div className="flex justify-between text-xs"><span className="text-neutral-500">Total recebido</span><strong className="text-neutral-900">{formatCurrency(snapshot.summary.totalPago)}</strong></div>
            <div className="mt-3 flex justify-between text-xs"><span className="text-neutral-500">Em solicitações</span><strong className="text-neutral-900">{formatCurrency(snapshot.summary.totalSolicitado)}</strong></div>
          </div>
          {snapshot.payouts.length > 0 && (
            <div className="mt-6 space-y-3 border-t border-neutral-100 pt-5">
              <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400">Últimos saques</h4>
              {snapshot.payouts.slice(0, 5).map(payout => {
                const pill = payoutPill(payout.status);
                return (
                  <div key={payout.id} className="rounded-xl bg-neutral-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-neutral-900">{formatCurrency(payout.valor)}</strong>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${pill.className}`}>{pill.label}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-neutral-400">{formatDate(payout.solicitadoEm)}</span>
                      {payout.status === 'solicitado' && <button type="button" disabled={working} onClick={() => void handleCancelPayout(payout.id)} className="text-[10px] font-black text-rose-600 hover:text-rose-700">Cancelar</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Modal isOpen={profileOpen} onClose={() => !working && setProfileOpen(false)} title="Dados de afiliado" size="lg">
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Nome de divulgação</span><input className="input-field" value={profileForm.nomeDivulgacao} onChange={event => setProfileForm(current => ({ ...current, nomeDivulgacao: event.target.value }))} maxLength={100} /></label>
          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Tipo da chave PIX</span><select className="input-field" value={profileForm.pixTipo} onChange={event => setProfileForm(current => ({ ...current, pixTipo: event.target.value }))}>{PIX_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Chave PIX</span><input className="input-field" value={profileForm.pixChave} onChange={event => setProfileForm(current => ({ ...current, pixChave: event.target.value }))} maxLength={180} /></label>
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">Confira a chave antes de salvar. Os próximos saques usarão estes dados.</p>
          <button type="button" disabled={working} onClick={handleProfileSave} className="btn-primary w-full disabled:opacity-60">{working && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações</button>
        </div>
      </Modal>

      <Modal isOpen={linkOpen} onClose={() => !working && setLinkOpen(false)} title="Criar link personalizado" size="lg">
        <div className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Programa</span><select className="input-field" value={linkForm.programaCodigo} onChange={event => handleProgramChange(event.target.value)}>{activePrograms.map(program => <option key={program.codigo} value={program.codigo}>{program.nome} · {program.percentual}%</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Título do link</span><input className="input-field" value={linkForm.titulo} onChange={event => setLinkForm(current => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Promoção para meu Instagram" maxLength={100} /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Página de destino</span><input className="input-field font-mono text-sm" value={linkForm.destino} onChange={event => setLinkForm(current => ({ ...current, destino: event.target.value }))} placeholder="/loja" maxLength={500} /></label>
          <p className="text-xs leading-relaxed text-neutral-500">Use apenas páginas internas da GSA. O sistema valida se o destino pertence ao programa selecionado.</p>
          <button type="button" disabled={working || activePrograms.length === 0} onClick={handleCreateLink} className="btn-primary w-full disabled:opacity-60">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Criar meu link</button>
        </div>
      </Modal>

      <Modal isOpen={payoutOpen} onClose={() => !working && setPayoutOpen(false)} title="Solicitar saque" size="md">
        <div className="space-y-4">
          <div className="rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Saldo disponível</p>
            <p className="mt-1 text-2xl font-black text-emerald-800">{formatCurrency(snapshot.summary.totalDisponivel)}</p>
          </div>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-neutral-600">Valor do saque</span><input type="text" inputMode="decimal" className="input-field" value={payoutValue} onChange={event => setPayoutValue(event.target.value.replace(/[^0-9,.]/g, ''))} placeholder="0,00" /></label>
          <p className="text-xs text-neutral-500">O pagamento será enviado para sua chave PIX cadastrada. Mínimo de {formatCurrency(snapshot.summary.saqueMinimo)}.</p>
          <button type="button" disabled={working} onClick={handleRequestPayout} className="btn-primary w-full disabled:opacity-60">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />} Confirmar solicitação</button>
        </div>
      </Modal>
    </div>
  );
}

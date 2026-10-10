import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Banknote,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  Link2,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  UserRoundCheck,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { copyToClipboard, formatCurrency, formatDateTime, formatShortId } from '../../lib/utils';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
type AffiliateAdminTab = 'afiliados' | 'saques' | 'configuracoes';

type AffiliateProgram = {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  caminho_padrao?: string | null;
  base_tipo?: string | null;
  percentual: number;
  janela_atribuicao_dias: number;
  carencia_dias: number;
  saque_minimo: number;
  pontos_por_real?: number;
  ativo: boolean;
};

type AffiliateRecord = {
  id: string;
  cliente_id?: string;
  nome_divulgacao: string;
  codigo_publico?: string;
  status: string;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  pix_chave_mascarada?: string | null;
  created_at?: string;
  cliques?: number;
  conversoes?: number;
  comissao_total?: number;
  comissao_pendente?: number;
  saldo_disponivel?: number;
  cliente_nome_completo?: string | null;
  cliente_cpf?: string | null;
  cliente_cnpj?: string | null;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
  cliente_tipo_pessoa?: string | null;
};

type AffiliatePayout = {
  id: string;
  afiliado_id?: string;
  afiliado_nome?: string;
  cliente_nome_completo?: string | null;
  nome_divulgacao?: string | null;
  codigo_publico?: string;
  valor: number;
  status: string;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  solicitado_em?: string;
  aprovado_em?: string | null;
  pago_em?: string | null;
  notas?: string | null;
};

type AffiliateSummary = {
  afiliados_ativos: number;
  cliques: number;
  vendas_atribuidas: number;
  comissoes_pendentes: number;
  comissoes_disponiveis: number;
  saques_pendentes: number;
  saque_minimo?: number;
  pontos_taxa?: number;
  pontos_minimo?: number;
  pontos_ativo?: boolean;
  welcome_ativo?: boolean;
  welcome_valor?: number;
};

type AffiliateAdminSnapshot = {
  success?: boolean;
  summary?: Partial<AffiliateSummary>;
  programs?: AffiliateProgram[];
  affiliates?: AffiliateRecord[];
  payouts?: AffiliatePayout[];
};

const EMPTY_SUMMARY: AffiliateSummary = {
  afiliados_ativos: 0,
  cliques: 0,
  vendas_atribuidas: 0,
  comissoes_pendentes: 0,
  comissoes_disponiveis: 0,
  saques_pendentes: 0,
  pontos_taxa: 0.01,
  pontos_minimo: 100,
  pontos_ativo: true,
  welcome_ativo: true,
  welcome_valor: 100,
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSnapshot(payload: AffiliateAdminSnapshot | null) {
  const summary = payload?.summary || {};
  return {
    summary: {
      afiliados_ativos: number(summary.afiliados_ativos),
      cliques: number(summary.cliques),
      vendas_atribuidas: number(summary.vendas_atribuidas),
      comissoes_pendentes: number(summary.comissoes_pendentes),
      comissoes_disponiveis: number(summary.comissoes_disponiveis),
      saques_pendentes: number(summary.saques_pendentes),
      saque_minimo: number(summary.saque_minimo) || 50,
      pontos_taxa: number(summary.pontos_taxa) || 0.01,
      pontos_minimo: number(summary.pontos_minimo) || 100,
      pontos_ativo: summary.pontos_ativo ?? true,
      welcome_ativo: summary.welcome_ativo ?? true,
      welcome_valor: number(summary.welcome_valor) || 100,
    },
    programs: payload?.programs || [],
    affiliates: payload?.affiliates || [],
    payouts: payload?.payouts || [],
  };
}

export function AffiliateAdminModule() {
  const [tab, setTab] = useState<AffiliateAdminTab>('afiliados');
  const [snapshot, setSnapshot] = useState(() => ({ summary: EMPTY_SUMMARY, programs: [] as AffiliateProgram[], affiliates: [] as AffiliateRecord[], payouts: [] as AffiliatePayout[] }));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateRecord | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<AffiliatePayout | null>(null);
  const [isRejectingPayout, setIsRejectingPayout] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState(false);
  const [isApprovingPayout, setIsApprovingPayout] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'mark_paid'>('approve');
  const [approvalDateTime, setApprovalDateTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [approvalNotes, setApprovalNotes] = useState('');
  const [activeSummaryModal, setActiveSummaryModal] = useState<'carencia' | 'disponivel' | 'vendas' | null>(null);
  const [isEditingAffiliate, setIsEditingAffiliate] = useState(false);
  const [editAffiliateForm, setEditAffiliateForm] = useState({
    nome_divulgacao: '',
    codigo_publico: '',
    pix_tipo: 'cpf',
    pix_chave: '',
  });
  const [savingAffiliateDetails, setSavingAffiliateDetails] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const confirmHook = useConfirm();

  const startEditingAffiliate = (affiliate: AffiliateRecord) => {
    setEditAffiliateForm({
      nome_divulgacao: affiliate.nome_divulgacao || '',
      codigo_publico: affiliate.codigo_publico || '',
      pix_tipo: affiliate.pix_tipo || 'cpf',
      pix_chave: affiliate.pix_chave || affiliate.pix_chave_mascarada || '',
    });
    setIsEditingAffiliate(true);
  };

  const saveAffiliateDetails = async () => {
    if (!selectedAffiliate) return;
    if (!editAffiliateForm.nome_divulgacao.trim()) {
      toast.error('Informe o nome de divulgação.');
      return;
    }
    setSavingAffiliateDetails(true);
    try {
      await callAdminRpc('gsa_admin_update_affiliate_details', {
        p_affiliate_id: selectedAffiliate.id,
        p_nome_divulgacao: editAffiliateForm.nome_divulgacao.trim(),
        p_codigo_publico: editAffiliateForm.codigo_publico.trim() || null,
        p_pix_tipo: editAffiliateForm.pix_tipo || null,
        p_pix_chave: editAffiliateForm.pix_chave.trim() || null,
      });
      toast.success('Cadastro do afiliado atualizado com sucesso.');
      setIsEditingAffiliate(false);
      setSelectedAffiliate(null);
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o cadastro do afiliado.');
    } finally {
      setSavingAffiliateDetails(false);
    }
  };

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const data = await callAdminRpc<AffiliateAdminSnapshot>('gsa_admin_affiliate_snapshot');
      setSnapshot(normalizeSnapshot(data));
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar o programa de afiliados.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeSubscription([
    { table: 'gsa_afiliados', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_afiliado_programas', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_afiliado_comissoes', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_afiliado_saques', onChange: () => void load(true), debounceMs: 500 },
    { table: 'gsa_afiliado_links', onChange: () => void load(true), debounceMs: 500 },
    { table: 'indicacoes', onChange: () => void load(true), debounceMs: 500 },
  ]);

  const filteredAffiliates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return snapshot.affiliates;
    return snapshot.affiliates.filter((affiliate) =>
      [affiliate.nome_divulgacao, affiliate.cliente_nome_completo, affiliate.cliente_cpf, affiliate.codigo_publico, affiliate.status]
        .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query)),
    );
  }, [search, snapshot.affiliates]);

  const setAffiliateStatus = async (affiliate: AffiliateRecord, status: 'ativo' | 'suspenso' | 'encerrado') => {
    if (affiliate.status === status) return;
    const label = status === 'ativo' ? 'reativar' : status === 'suspenso' ? 'suspender' : 'encerrar';
    const ok = await confirmHook.confirm({
      title: 'Alterar status',
      message: `Deseja ${label} o afiliado ${affiliate.nome_divulgacao}?`,
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    setWorkingId(affiliate.id);
    try {
      await callAdminRpc('gsa_admin_set_affiliate_status', {
        p_affiliate_id: affiliate.id,
        p_status: status,
        p_reason: `Alteração realizada no painel administrativo: ${status}`,
      });
      toast.success('Status do afiliado atualizado.');
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível alterar o status.');
    } finally {
      setWorkingId(null);
    }
  };

  const decidePayout = async (payout: AffiliatePayout, action: 'approve' | 'reject' | 'mark_paid', customNotes?: string, paidAtDate?: string) => {
    const notes = customNotes || null;

    if (action === 'mark_paid' && (!notes || notes.trim().length < 4)) {
      toast.error('Informe a referência ou o comprovante do pagamento PIX.');
      return false;
    }

    setWorkingId(payout.id);
    try {
      await callAdminRpc('gsa_admin_decide_affiliate_payout', {
        p_payout_id: payout.id,
        p_action: action,
        p_notes: notes || null,
        p_paid_at: paidAtDate ? new Date(paidAtDate).toISOString() : new Date().toISOString(),
      });
      toast.success('Solicitação de saque atualizada.');
      await load(true);
      return true;
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível processar o saque.');
      return false;
    } finally {
      setWorkingId(null);
    }
  };

  const handleReleaseCarencia = async (affiliateId?: string, affiliateName?: string, totalAmount?: number) => {
    const isSingle = Boolean(affiliateId);
    const title = isSingle ? 'Liberar Carência do Afiliado' : 'Liberar Carência de TODOS os Afiliados';
    const amountText = totalAmount ? formatCurrency(totalAmount) : '';
    const message = isSingle
      ? `Deseja antecipar e liberar o saldo em carência de ${amountText} para o afiliado "${affiliateName}"? As comissões ficarão imediatamente disponíveis para saque.`
      : `Deseja antecipar e liberar a carência de TODOS os afiliados (total de ${amountText})? Todas as comissões pendentes serão liberadas para saque imediato.`;

    const ok = await confirmHook.confirm({
      title,
      message,
      confirmLabel: isSingle ? 'Liberar Carência' : 'Liberar Todas as Carências',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    const workingKey = affiliateId || 'all_carencia';
    setWorkingId(workingKey);
    try {
      await callAdminRpc('gsa_admin_release_affiliate_commissions', {
        p_afiliado_id: affiliateId || null,
      });
      toast.success(
        isSingle
          ? `Carência de ${affiliateName} antecipada com sucesso!`
          : 'Carência de todas as comissões pendentes liberada com sucesso!'
      );
      if (!isSingle) {
        setActiveSummaryModal(null);
      }
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao liberar carência.');
    } finally {
      setWorkingId(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-neutral-200 bg-white"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /><span className="sr-only">Carregando afiliados</span></div>;
  }

  const cards = [
    { label: 'Afiliados ativos', value: snapshot.summary.afiliados_ativos.toLocaleString('pt-BR'), icon: Users, color: 'text-indigo-600 bg-indigo-50', modalType: null },
    { label: 'Vendas atribuídas', value: snapshot.summary.vendas_atribuidas.toLocaleString('pt-BR'), icon: Link2, color: 'text-sky-600 bg-sky-50', modalType: 'vendas' as const },
    { label: 'Em carência', value: formatCurrency(snapshot.summary.comissoes_pendentes), icon: Clock3, color: 'text-amber-600 bg-amber-50', modalType: 'carencia' as const },
    { label: 'Disponível', value: formatCurrency(snapshot.summary.comissoes_disponiveis), icon: Banknote, color: 'text-emerald-600 bg-emerald-50', modalType: 'disponivel' as const },
  ];

  return (
    <section className="space-y-5" aria-labelledby="affiliate-admin-title">
      <ConfirmDialog {...confirmHook} />
      <div className="rounded-[2rem] bg-gradient-to-br from-neutral-950 via-neutral-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">Gestão central</p><h1 id="affiliate-admin-title" className="mt-2 text-2xl font-black">Programa de Afiliados GSA</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Regras, afiliados e pagamentos conectados ao mesmo backend do portal do afiliado.</p></div>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color, modalType }) => (
          <article 
            key={label} 
            onClick={() => modalType && setActiveSummaryModal(modalType)}
            className={`group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all ${
              modalType ? 'cursor-pointer hover:border-indigo-500 hover:shadow-md active:scale-[0.985]' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
              </span>
              {modalType && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-600 opacity-80 group-hover:opacity-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  Ver Afiliados
                </span>
              )}
            </div>
            <p className="mt-3 text-xl font-black text-neutral-950">{value}</p>
            <p className="mt-1 text-xs font-bold text-neutral-500">{label}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm" role="tablist" aria-label="Áreas do programa de afiliados">
        {([
          ['afiliados', 'Afiliados', UserRoundCheck],
          ['saques', `Saques${snapshot.summary.saques_pendentes ? ` (${snapshot.summary.saques_pendentes})` : ''}`, Banknote],
          ['configuracoes', 'Configurações', Settings2],
        ] as const).map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black sm:flex-none ${tab === id ? 'bg-neutral-950 text-white shadow' : 'text-neutral-600 hover:bg-neutral-50'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {tab === 'configuracoes' && <div className="space-y-5">
        <section className="space-y-3" aria-labelledby="affiliate-program-settings">
          <div><h2 id="affiliate-program-settings" className="text-lg font-black text-neutral-950">Programas</h2><p className="text-sm text-neutral-500">Gerencie os programas ativos do painel.</p></div>
          <div className="grid gap-4 xl:grid-cols-2">{snapshot.programs.map((program) => <ProgramEditor key={program.id} program={program} onSaved={() => load(true)} />)}{snapshot.programs.length === 0 && <EmptyState text="Nenhum programa cadastrado." />}</div>
        </section>
        <section className="space-y-3" aria-labelledby="affiliate-points-settings">
          <div><h2 id="affiliate-points-settings" className="text-lg font-black text-neutral-950">Bônus e pontuação</h2><p className="text-sm text-neutral-500">Ajuste os benefícios do programa em um único lugar.</p></div>
          <AffiliatePointsSettingsEditor summary={snapshot.summary} onSaved={() => load(true)} />
        </section>
      </div>}

      {tab === 'afiliados' && (
        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-4">
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <span className="sr-only">Buscar afiliado</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, código ou status" className="w-full rounded-xl border border-neutral-200 py-2.5 pl-10 pr-3 text-sm" />
            </label>
          </div>
          <div className="divide-y divide-neutral-100">
            {filteredAffiliates.map((affiliate) => (
              <article 
                key={affiliate.id} 
                onClick={() => setSelectedAffiliate(affiliate)}
                className="grid gap-4 p-4 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(100px,.6fr))_auto] lg:items-center cursor-pointer hover:bg-neutral-50/90 transition-colors group"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-neutral-950 group-hover:text-indigo-600 transition-colors">
                      {affiliate.cliente_nome_completo || affiliate.nome_divulgacao}
                    </h3>
                    <StatusBadge status={affiliate.status} />
                  </div>
                  {affiliate.cliente_nome_completo && affiliate.cliente_nome_completo !== affiliate.nome_divulgacao && (
                    <p className="text-[11px] font-bold text-neutral-500">
                      Divulgação: <span className="text-neutral-700">{affiliate.nome_divulgacao}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs font-bold text-neutral-400">
                    Código <span className="font-mono font-extrabold text-indigo-700">{affiliate.codigo_publico || '—'}</span> · {affiliate.created_at ? formatDateTime(affiliate.created_at) : '—'}
                  </p>
                </div>
                <Metric label="Cliques" value={number(affiliate.cliques).toLocaleString('pt-BR')} />
                <Metric label="Conversões" value={number(affiliate.conversoes).toLocaleString('pt-BR')} />
                <Metric label="Disponível" value={formatCurrency(number(affiliate.saldo_disponivel))} />
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); setSelectedAffiliate(affiliate); }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-600 transition-colors shadow-2xs"
                  >
                    <Eye className="h-4 w-4" /> Detalhes
                  </button>
                </div>
              </article>
            ))}
            {filteredAffiliates.length === 0 && <EmptyState text="Nenhum afiliado encontrado." />}
          </div>
        </div>
      )}

      {tab === 'saques' && (
        <div className="space-y-4">
          <MinimumPayoutRuleEditor summaryMinimum={snapshot.summary.saque_minimo || 50} onSaved={() => load(true)} />
          <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <div className="divide-y divide-neutral-100">
              {snapshot.payouts.map((payout) => {
                const applicantName = payout.cliente_nome_completo || payout.afiliado_nome || 'Afiliado';
                return (
                  <article
                    key={payout.id}
                    onClick={() => setSelectedPayout(payout)}
                    className="grid gap-4 p-4 lg:grid-cols-[1.3fr_.7fr_1fr_auto] lg:items-center cursor-pointer hover:bg-neutral-50/90 transition-colors group"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-neutral-950 group-hover:text-indigo-600 transition-colors">{applicantName}</h3>
                        <StatusBadge status={payout.status} />
                      </div>
                      {payout.nome_divulgacao && payout.nome_divulgacao !== applicantName && (
                        <p className="text-[11px] font-bold text-neutral-500">
                          Divulgação: <span className="text-neutral-700">{payout.nome_divulgacao}</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs font-bold text-neutral-400">{payout.solicitado_em ? formatDateTime(payout.solicitado_em) : '—'}</p>
                    </div>
                    <Metric label="Valor" value={formatCurrency(number(payout.valor))} />
                    <Metric label={`PIX ${payout.pix_tipo || ''}`} value={payout.pix_chave || 'Chave protegida'} />
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedPayout(payout)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-600 transition-colors shadow-2xs"
                      >
                        <Eye className="h-4 w-4" /> Detalhes
                      </button>
                    </div>
                  </article>
                );
              })}
              {snapshot.payouts.length === 0 && <EmptyState text="Nenhuma solicitação de saque." />}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Afiliado */}
      <Modal
        isOpen={Boolean(selectedAffiliate)}
        onClose={() => {
          setSelectedAffiliate(null);
          setIsEditingAffiliate(false);
        }}
        title={isEditingAffiliate ? "Editar Cadastro do Afiliado" : "Detalhes do Afiliado"}
        size="lg"
      >
        {selectedAffiliate && isEditingAffiliate && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
              <h4 className="text-sm font-black text-indigo-900 mb-1 flex items-center gap-2">
                <Pencil className="h-4 w-4 text-indigo-600" /> Edição Cadastral do Afiliado
              </h4>
              <p className="text-xs text-indigo-700">Edite as informações cadastrais e de pagamento abaixo. As alterações serão salvas no sistema.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-bold text-neutral-700">
                Nome de Divulgação
                <input
                  type="text"
                  value={editAffiliateForm.nome_divulgacao}
                  onChange={(e) => setEditAffiliateForm(prev => ({ ...prev, nome_divulgacao: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-bold focus:border-indigo-600 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-bold text-neutral-700">
                Código de Indicação
                <input
                  type="text"
                  value={editAffiliateForm.codigo_publico}
                  onChange={(e) => setEditAffiliateForm(prev => ({ ...prev, codigo_publico: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 font-mono text-sm font-bold text-indigo-700 focus:border-indigo-600 focus:outline-none"
                />
              </label>

              <label className="block text-xs font-bold text-neutral-700">
                Tipo da Chave PIX
                <select
                  value={editAffiliateForm.pix_tipo}
                  onChange={(e) => setEditAffiliateForm(prev => ({ ...prev, pix_tipo: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-bold focus:border-indigo-600 focus:outline-none"
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="aleatoria">Chave Aleatória</option>
                </select>
              </label>

              <label className="block text-xs font-bold text-neutral-700">
                Chave PIX (Completa)
                <input
                  type="text"
                  value={editAffiliateForm.pix_chave}
                  onChange={(e) => setEditAffiliateForm(prev => ({ ...prev, pix_chave: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3 py-2.5 font-mono text-sm font-bold focus:border-indigo-600 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
              <button
                type="button"
                onClick={() => setIsEditingAffiliate(false)}
                className="rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingAffiliateDetails}
                onClick={() => void saveAffiliateDetails()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingAffiliateDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Alterações
              </button>
            </div>
          </div>
        )}

        {selectedAffiliate && !isEditingAffiliate && (
          <div className="space-y-6">
            {/* Header & Status Card */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Nome de Divulgação</span>
                  <h3 className="text-xl font-black text-neutral-950 mt-0.5">{selectedAffiliate.nome_divulgacao}</h3>
                  <p className="text-xs font-bold text-neutral-500 mt-1">
                    Código de Indicação: <span className="font-mono text-indigo-700 font-extrabold">{selectedAffiliate.codigo_publico || '—'}</span>
                  </p>
                </div>
                <StatusBadge status={selectedAffiliate.status} />
              </div>
              <div className="mt-4 grid gap-3 border-t border-neutral-200/80 pt-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-neutral-400 font-medium">Data de Cadastro:</span>{' '}
                  <strong className="text-neutral-800">{selectedAffiliate.created_at ? formatDateTime(selectedAffiliate.created_at) : '—'}</strong>
                </div>
                <div>
                  <span className="text-neutral-400 font-medium">ID da Conta / Cliente:</span>{' '}
                  <strong className="font-mono font-bold text-neutral-800">{formatShortId('CLI', selectedAffiliate.cliente_id || selectedAffiliate.id)}</strong>
                </div>
              </div>
            </div>

            {/* Dados Pessoais do Titular */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <UserRoundCheck className="h-4 w-4 text-indigo-600" /> Dados Pessoais do Titular (Cliente)
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">Nome Completo</span>
                  <strong className="text-neutral-900 font-bold text-sm">{selectedAffiliate.cliente_nome_completo || selectedAffiliate.nome_divulgacao}</strong>
                </div>
                <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">CPF / CNPJ</span>
                  <strong className="text-indigo-700 font-mono font-bold text-sm">{selectedAffiliate.cliente_cpf || selectedAffiliate.cliente_cnpj || 'Não informado'}</strong>
                </div>
                <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">E-mail</span>
                  <strong className="text-neutral-800 font-medium break-all">{selectedAffiliate.cliente_email || 'Não informado'}</strong>
                </div>
                <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">Telefone / WhatsApp</span>
                  <strong className="text-neutral-800 font-medium">{selectedAffiliate.cliente_telefone || 'Não informado'}</strong>
                </div>
              </div>
            </div>

            {/* Performance & Financeiro */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-indigo-600" /> Desempenho & Saldo acumulado
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Cliques</p>
                  <p className="mt-1 text-lg font-black text-neutral-900">{number(selectedAffiliate.cliques).toLocaleString('pt-BR')}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Conversões</p>
                  <p className="mt-1 text-lg font-black text-indigo-700">{number(selectedAffiliate.conversoes).toLocaleString('pt-BR')}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Comissão Gerada</p>
                  <p className="mt-1 text-lg font-black text-emerald-700">{formatCurrency(number(selectedAffiliate.comissao_total))}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Saldo Disponível</p>
                  <p className="mt-1 text-lg font-black text-emerald-600">{formatCurrency(number(selectedAffiliate.saldo_disponivel))}</p>
                </div>
              </div>
            </div>

            {/* Dados Bancários / PIX */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-indigo-600" /> Dados para Pagamento (PIX)
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">Tipo de Chave</span>
                  <strong className="text-neutral-800 font-bold uppercase">{selectedAffiliate.pix_tipo || 'Não informado'}</strong>
                </div>
                <div className="rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">Chave PIX</span>
                  <strong className="text-indigo-700 font-mono font-bold break-all">{selectedAffiliate.pix_chave || selectedAffiliate.pix_chave_mascarada || 'Não informada'}</strong>
                </div>
              </div>
            </div>

            {/* Lançamento / Ajuste Manual de Saldo & Pontos */}
            <AffiliateManualAdjustmentForm affiliate={selectedAffiliate} onSaved={() => load(true)} />

            {/* Gerenciamento de Status & Ações */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-neutral-500 block">Ações Administrativas</span>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => startEditingAffiliate(selectedAffiliate)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700"
                >
                  <Pencil className="h-4 w-4" /> Editar Cadastro
                </button>
                {selectedAffiliate.status !== 'ativo' && (
                  <button
                    type="button"
                    disabled={workingId === selectedAffiliate.id}
                    onClick={async () => {
                      const aff = selectedAffiliate;
                      setSelectedAffiliate(null);
                      await setAffiliateStatus(aff, 'ativo');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Ativar Afiliado
                  </button>
                )}
                {selectedAffiliate.status === 'ativo' && (
                  <button
                    type="button"
                    disabled={workingId === selectedAffiliate.id}
                    onClick={async () => {
                      const aff = selectedAffiliate;
                      setSelectedAffiliate(null);
                      await setAffiliateStatus(aff, 'suspenso');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Suspender Afiliado
                  </button>
                )}
                {selectedAffiliate.status !== 'encerrado' && (
                  <button
                    type="button"
                    disabled={workingId === selectedAffiliate.id}
                    onClick={async () => {
                      const aff = selectedAffiliate;
                      setSelectedAffiliate(null);
                      await setAffiliateStatus(aff, 'encerrado');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Encerrar Afiliado
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedAffiliate(null)}
                  className="ml-auto rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Resumo por Categoria (Em Carência / Disponível / Vendas Atribuídas) */}
      <Modal
        isOpen={Boolean(activeSummaryModal)}
        onClose={() => setActiveSummaryModal(null)}
        title={
          activeSummaryModal === 'carencia'
            ? "Afiliados com Comissões em Carência"
            : activeSummaryModal === 'disponivel'
            ? "Afiliados com Saldo Disponível"
            : "Afiliados com Vendas Atribuídas"
        }
        size="xl"
      >
        {activeSummaryModal && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-4.5 ${
              activeSummaryModal === 'carencia' 
                ? 'bg-amber-50/70 border-amber-200 text-amber-950' 
                : activeSummaryModal === 'disponivel'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-sky-50/70 border-sky-200 text-sky-950'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-base">
                    {activeSummaryModal === 'carencia'
                      ? 'Relatório de Carência (Comissões Pendentes)'
                      : activeSummaryModal === 'disponivel'
                      ? 'Relatório de Saldo Disponível para Saque'
                      : 'Relatório de Vendas Atribuídas aos Afiliados'}
                  </h4>
                  <p className="text-xs font-medium mt-0.5 opacity-80">
                    {activeSummaryModal === 'carencia'
                      ? 'Listagem de afiliados que possuem valores em período de retenção temporária (carência).'
                      : activeSummaryModal === 'disponivel'
                      ? 'Listagem de afiliados que possuem saldo acumulado liberado para resgate via PIX.'
                      : 'Listagem de afiliados que geraram vendas e conversões confirmadas na plataforma.'}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider block opacity-70">Total</span>
                  <strong className="text-xl font-black">
                    {activeSummaryModal === 'carencia'
                      ? formatCurrency(snapshot.summary.comissoes_pendentes)
                      : activeSummaryModal === 'disponivel'
                      ? formatCurrency(snapshot.summary.comissoes_disponiveis)
                      : `${snapshot.summary.vendas_atribuidas.toLocaleString('pt-BR')} Vendas`}
                  </strong>
                  {activeSummaryModal === 'carencia' && snapshot.summary.comissoes_pendentes > 0 && (
                    <button
                      type="button"
                      disabled={workingId === 'all_carencia'}
                      onClick={() => void handleReleaseCarencia(undefined, undefined, snapshot.summary.comissoes_pendentes)}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-amber-700 transition-colors shadow-2xs"
                      title="Liberar carência de todos os afiliados"
                    >
                      {workingId === 'all_carencia' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      Liberar Todos
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tabela / Lista de Afiliados */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xs">
              <div className="divide-y divide-neutral-100">
                {snapshot.affiliates
                  .filter((aff) =>
                    activeSummaryModal === 'carencia'
                      ? number(aff.comissao_pendente) > 0
                      : activeSummaryModal === 'disponivel'
                      ? number(aff.saldo_disponivel) > 0
                      : number(aff.conversoes) > 0
                  )
                  .map((aff) => {
                    return (
                      <div key={aff.id} className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-neutral-50/80 transition-colors">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="font-black text-neutral-950">{aff.cliente_nome_completo || aff.nome_divulgacao}</h5>
                            <StatusBadge status={aff.status} />
                          </div>
                          <p className="text-xs text-neutral-500 font-medium mt-1">
                            Código <span className="font-mono font-extrabold text-indigo-700">{aff.codigo_publico || '—'}</span>
                            {aff.cliente_nome_completo && aff.cliente_nome_completo !== aff.nome_divulgacao && (
                              <span> · Divulgação: <strong className="text-neutral-800">{aff.nome_divulgacao}</strong></span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400 block">
                              {activeSummaryModal === 'carencia' 
                                ? 'Em carência' 
                                : activeSummaryModal === 'disponivel' 
                                ? 'Disponível' 
                                : 'Vendas Atribuídas'}
                            </span>
                            <strong className={`text-base font-black ${
                              activeSummaryModal === 'carencia' 
                                ? 'text-amber-600' 
                                : activeSummaryModal === 'disponivel' 
                                ? 'text-emerald-600'
                                : 'text-sky-600'
                            }`}>
                              {activeSummaryModal === 'carencia'
                                ? formatCurrency(number(aff.comissao_pendente))
                                : activeSummaryModal === 'disponivel'
                                ? formatCurrency(number(aff.saldo_disponivel))
                                : `${number(aff.conversoes).toLocaleString('pt-BR')} Vendas (${formatCurrency(number(aff.comissao_total))})`}
                            </strong>
                          </div>
                          {activeSummaryModal === 'carencia' && number(aff.comissao_pendente) > 0 && (
                            <button
                              type="button"
                              disabled={workingId === aff.id}
                              onClick={() => void handleReleaseCarencia(aff.id, aff.cliente_nome_completo || aff.nome_divulgacao, number(aff.comissao_pendente))}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-700 transition-colors shadow-2xs"
                              title="Liberar carência deste afiliado"
                            >
                              {workingId === aff.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                              Liberar Carência
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSummaryModal(null);
                              setSelectedAffiliate(aff);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-600 transition-colors shadow-2xs"
                          >
                            <Eye className="h-4 w-4" /> Detalhes
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {snapshot.affiliates.filter((aff) =>
                  activeSummaryModal === 'carencia'
                    ? number(aff.comissao_pendente) > 0
                    : activeSummaryModal === 'disponivel'
                    ? number(aff.saldo_disponivel) > 0
                    : number(aff.conversoes) > 0
                ).length === 0 && (
                  <div className="p-8 text-center text-sm font-bold text-neutral-400">
                    Nenhum afiliado possui {
                      activeSummaryModal === 'carencia' 
                        ? 'valor em carência' 
                        : activeSummaryModal === 'disponivel' 
                        ? 'valor disponível'
                        : 'vendas atribuídas'
                    } no momento.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveSummaryModal(null)}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Detalhes da Solicitação de Saque */}
      <Modal
        isOpen={Boolean(selectedPayout)}
        onClose={() => {
          setSelectedPayout(null);
          setIsRejectingPayout(false);
          setRejectReason('');
          setRejectReasonError(false);
          setIsApprovingPayout(false);
          setApprovalNotes('');
        }}
        title="Detalhes da Solicitação de Saque"
        size="lg"
      >
        {selectedPayout && (
          <div className="space-y-6">
            {/* Solicitante & Status */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/90 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Solicitante (Nome Completo)</span>
                  <h3 className="text-xl font-black text-neutral-950 mt-0.5">
                    {selectedPayout.cliente_nome_completo || selectedPayout.afiliado_nome || 'Afiliado'}
                  </h3>
                  {selectedPayout.nome_divulgacao && selectedPayout.nome_divulgacao !== (selectedPayout.cliente_nome_completo || selectedPayout.afiliado_nome) && (
                    <p className="text-xs font-bold text-neutral-500 mt-1">
                      Nome de Divulgação: <span className="text-neutral-800 font-bold">{selectedPayout.nome_divulgacao}</span>
                    </p>
                  )}
                  {selectedPayout.codigo_publico && (
                    <p className="text-xs font-bold text-neutral-500 mt-1">
                      Código de Indicação: <span className="font-mono text-indigo-700 font-extrabold">{selectedPayout.codigo_publico}</span>
                    </p>
                  )}
                </div>
                <StatusBadge status={selectedPayout.status} />
              </div>
              <div className="mt-4 grid gap-3 border-t border-neutral-200/80 pt-3 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-neutral-400 font-medium">Data da Solicitação:</span>{' '}
                  <strong className="text-neutral-800">{selectedPayout.solicitado_em ? formatDateTime(selectedPayout.solicitado_em) : '—'}</strong>
                </div>
                <div>
                  <span className="text-neutral-400 font-medium">ID do Saque:</span>{' '}
                  <strong className="font-mono font-bold text-neutral-800">{formatShortId('SAQ', selectedPayout.id)}</strong>
                </div>
              </div>
            </div>

            {/* Valor Solicitado & Dados bancários / PIX */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-emerald-600" /> Valor Solicitado & Chave PIX
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50/70 p-4 border border-emerald-200/80">
                  <span className="block text-[10px] font-black uppercase text-emerald-800">Valor a Transferir</span>
                  <strong className="text-emerald-700 font-black text-3xl mt-1 block">{formatCurrency(number(selectedPayout.valor))}</strong>
                </div>
                <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-200/70">
                  <span className="block text-[10px] font-black uppercase text-neutral-400">Tipo de Chave PIX</span>
                  <strong className="text-neutral-900 font-bold uppercase text-base mt-1 block">{selectedPayout.pix_tipo || 'Chave PIX'}</strong>
                </div>
              </div>

              {/* Chave PIX Destacada com botão Copiar */}
              <div className="rounded-2xl bg-neutral-950 p-4 text-white flex flex-wrap items-center justify-between gap-3 shadow-inner">
                <div>
                  <span className="block text-[10px] font-black uppercase text-neutral-400 tracking-wider">Chave PIX do Afiliado</span>
                  <code className="text-base sm:text-lg font-mono font-black text-amber-300 break-all">{selectedPayout.pix_chave || 'Chave não informada'}</code>
                </div>
                {selectedPayout.pix_chave && (
                  <button
                    type="button"
                    onClick={() => {
                      copyToClipboard(selectedPayout.pix_chave!);
                      toast.success('Chave PIX copiada para a área de transferência!');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black text-white hover:bg-white/20 transition-colors shadow-2xs"
                  >
                    <Copy className="h-4 w-4 text-amber-300" /> Copiar Chave PIX
                  </button>
                )}
              </div>
            </div>

            {/* Informações adicionais do histórico */}
            {(selectedPayout.aprovado_em || selectedPayout.pago_em || selectedPayout.notas) && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 space-y-2 text-xs">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Histórico do Processamento</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedPayout.aprovado_em && (
                    <div><span className="text-neutral-500">Aprovado em:</span> <strong className="text-neutral-900">{formatDateTime(selectedPayout.aprovado_em)}</strong></div>
                  )}
                  {selectedPayout.pago_em && (
                    <div><span className="text-neutral-500">Pago em:</span> <strong className="text-neutral-900">{formatDateTime(selectedPayout.pago_em)}</strong></div>
                  )}
                </div>
                {selectedPayout.notas && (
                  <div className="mt-2 rounded-xl bg-white p-3 border border-neutral-200/80">
                    <span className="block text-[10px] font-black uppercase text-neutral-400 mb-1">Notas Administrativas</span>
                    <p className="text-neutral-800 font-medium text-xs">{selectedPayout.notas}</p>
                  </div>
                )}
              </div>
            )}

            {/* Modo de Aprovação / Pagamento Inline */}
            {isApprovingPayout ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Confirmar {approvalAction === 'approve' ? 'Aprovação do Saque' : 'Pagamento PIX'}
                  </h4>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Data e Hora da Operação <span className="text-emerald-700">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={approvalDateTime}
                      onChange={(e) => setApprovalDateTime(e.target.value)}
                      className="w-full rounded-xl border border-emerald-200 bg-white p-2.5 text-xs text-neutral-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      {approvalAction === 'mark_paid' ? 'Referência / Comprovante PIX' : 'Notas da aprovação (opcional)'}
                      {approvalAction === 'mark_paid' && <span className="text-emerald-700"> *</span>}
                    </label>
                    <input
                      type="text"
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      placeholder={approvalAction === 'mark_paid' ? 'Obrigatório: ID E2E, referência ou comprovante' : 'Observação administrativa'}
                      className="w-full rounded-xl border border-emerald-200 bg-white p-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-emerald-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      setIsApprovingPayout(false);
                      setApprovalNotes('');
                    }}
                    className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={workingId === selectedPayout.id}
                    onClick={async () => {
                      const success = await decidePayout(selectedPayout, approvalAction, approvalNotes.trim() || undefined, approvalDateTime);
                      if (success) {
                        setSelectedPayout(null);
                        setIsApprovingPayout(false);
                        setApprovalNotes('');
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {workingId === selectedPayout.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {approvalAction === 'approve' ? 'Confirmar Aprovação' : 'Confirmar Pagamento'}
                  </button>
                </div>
              </div>
            ) : isRejectingPayout ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-rose-800 flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-rose-600" /> Motivo da Rejeição do Saque
                  </h4>
                </div>

                <label className="block text-xs font-bold text-neutral-700">
                  Informe o motivo da rejeição para o afiliado <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (e.target.value.trim()) setRejectReasonError(false);
                  }}
                  placeholder="Ex: Chave PIX inválida, dados bancários inconsistentes..."
                  className="w-full resize-none rounded-xl border border-rose-200 bg-white p-3 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                />

                {rejectReasonError && (
                  <p className="text-xs font-bold text-rose-600" role="alert">Este campo é obrigatório.</p>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-rose-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRejectingPayout(false);
                      setRejectReason('');
                      setRejectReasonError(false);
                    }}
                    className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={workingId === selectedPayout.id}
                    onClick={async () => {
                      if (!rejectReason.trim()) {
                        setRejectReasonError(true);
                        return;
                      }
                      setRejectReasonError(false);
                      await decidePayout(selectedPayout, 'reject', rejectReason.trim());
                      setSelectedPayout(null);
                      setIsRejectingPayout(false);
                      setRejectReason('');
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {workingId === selectedPayout.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Confirmar Rejeição
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPayout(null);
                    setIsRejectingPayout(false);
                    setRejectReason('');
                    setRejectReasonError(false);
                    setIsApprovingPayout(false);
                    setApprovalNotes('');
                  }}
                  className="rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  Fechar
                </button>

                <div className="flex flex-wrap gap-2">
                  {selectedPayout.status === 'solicitado' && (
                    <>
                      <button
                        type="button"
                        disabled={workingId === selectedPayout.id}
                        onClick={() => {
                          setApprovalAction('approve');
                          setApprovalDateTime(new Date().toISOString().slice(0, 16));
                          setApprovalNotes('');
                          setIsApprovingPayout(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Aprovar Saque
                      </button>
                      <button
                        type="button"
                        disabled={workingId === selectedPayout.id}
                        onClick={() => {
                          setIsRejectingPayout(true);
                          setRejectReason('');
                          setRejectReasonError(false);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Rejeitar Saque
                      </button>
                    </>
                  )}

                  {selectedPayout.status === 'aprovado' && (
                    <button
                      type="button"
                      disabled={workingId === selectedPayout.id}
                      onClick={() => {
                        setApprovalAction('mark_paid');
                        setApprovalDateTime(new Date().toISOString().slice(0, 16));
                        setApprovalNotes('');
                        setIsApprovingPayout(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Confirmar Pagamento PIX
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

function MinimumPayoutRuleEditor({ summaryMinimum, onSaved }: { summaryMinimum: number; onSaved: () => Promise<void> }) {
  const [minValor, setMinValor] = useState(summaryMinimum || 50);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMinValor(summaryMinimum || 50);
  }, [summaryMinimum]);

  const saveRule = async () => {
    if (minValor <= 0) {
      toast.error('Informe um valor de saque mínimo válido.');
      return;
    }
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_update_global_saque_minimo', {
        p_valor: minValor,
      });
      toast.success(`Regra de saque mínimo atualizada para ${formatCurrency(minValor)}.`);
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar a regra de saque mínimo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Regras de Saque PIX</span>
          <h3 className="mt-1 text-lg font-black text-neutral-950">Valor Mínimo para Solicitação de Saque</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Define o valor mínimo acumulado (R$) necessário para que um afiliado possa solicitar transferência por PIX.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            Mínimo (R$)
            <input 
              type="number"
              min={1}
              max={100000}
              step={1}
              value={minValor}
              inputMode="numeric"
onChange={(e) => setMinValor(number(e.target.value))}
              className="w-28 rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-black text-neutral-900 focus:border-indigo-600 focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveRule()}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Regra
          </button>
        </div>
      </div>
    </article>
  );
}

function ProgramEditor({ program, onSaved }: { key?: string; program: AffiliateProgram; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(program);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(program), [program]);

  const save = async () => {
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_update_affiliate_program', {
        p_program_id: program.id,
        p_patch: {
          descricao: draft.descricao || null,
          caminho_padrao: draft.caminho_padrao || '/',
          base_tipo: draft.base_tipo || 'venda_bruta',
          percentual: number(draft.percentual),
          janela_atribuicao_dias: number(draft.janela_atribuicao_dias),
          carencia_dias: number(draft.carencia_dias),
          saque_minimo: number(draft.saque_minimo),
          pontos_por_real: number(draft.pontos_por_real ?? 1),
          ativo: draft.ativo,
        },
      });
      toast.success(`Programa ${draft.nome} atualizado.`);
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o programa.');
    } finally {
      setSaving(false);
    }
  };

  return <article className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">{draft.codigo}</p><h3 className="mt-1 text-lg font-black text-neutral-950">{draft.nome}</h3></div><button type="button" onClick={() => setDraft((current) => ({ ...current, ativo: !current.ativo }))} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${draft.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>{draft.ativo ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}{draft.ativo ? 'Ativo' : 'Pausado'}</button></div><label className="mt-4 block text-xs font-bold text-neutral-600">Descrição<textarea rows={2} value={draft.descricao || ''} onChange={(event) => setDraft((current) => ({ ...current, descricao: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><NumberField label="Comissão (%)" value={draft.percentual} min={0.01} max={50} step={0.01} onChange={(value) => setDraft((current) => ({ ...current, percentual: value }))} /><NumberField label="Pontos/R$" value={draft.pontos_por_real ?? 1} min={0} max={100} step={0.1} onChange={(value) => setDraft((current) => ({ ...current, pontos_por_real: value }))} /><NumberField label="Janela (dias)" value={draft.janela_atribuicao_dias} min={1} max={365} onChange={(value) => setDraft((current) => ({ ...current, janela_atribuicao_dias: value }))} /><NumberField label="Carência (dias)" value={draft.carencia_dias} min={0} max={365} onChange={(value) => setDraft((current) => ({ ...current, carencia_dias: value }))} /></div><label className="mt-3 block text-xs font-bold text-neutral-600">Caminho padrão<input value={draft.caminho_padrao || ''} onChange={(event) => setDraft((current) => ({ ...current, caminho_padrao: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 font-mono text-sm" /></label><button type="button" onClick={() => void save()} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar regras</button></article>;
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return <label className="text-xs font-bold text-neutral-600">{label}<input  type="number" value={value} min={min} max={max} step={step} inputMode="numeric" onChange={(event) => onChange(number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-bold" /></label>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'ativo' || status === 'pago' ? 'bg-emerald-50 text-emerald-700' : status === 'rejeitado' || status === 'encerrado' ? 'bg-rose-50 text-rose-700' : status === 'aprovado' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700';
  const label = status === 'solicitado' ? 'Em análise' : status.replaceAll('_', ' ');
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p><p className="mt-1 break-all text-sm font-black text-neutral-800">{value}</p></div>;
}

function SmallAction({ label, onClick, disabled, tone, icon }: { label: string; onClick: () => void; disabled?: boolean; tone: 'green' | 'amber' | 'red'; icon?: 'check' | 'x' | 'shield' }) {
  const colors = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-rose-50 text-rose-700' };
  const Icon = icon === 'check' ? CheckCircle2 : icon === 'x' ? XCircle : icon === 'shield' ? ShieldCheck : null;
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase disabled:opacity-50 ${colors[tone]}`}>{disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : null}{label}</button>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="col-span-full flex min-h-40 items-center justify-center p-8 text-center text-sm font-bold text-neutral-400">{text}</div>;
}

function AffiliatePointsSettingsEditor({ summary, onSaved }: { summary: AffiliateSummary; onSaved: () => Promise<void> }) {
  const [welcomeActive, setWelcomeActive] = useState(summary.welcome_ativo ?? true);
  const [welcomeValor, setWelcomeValor] = useState(summary.welcome_valor ?? 100);
  const [pontosAtivo, setPontosAtivo] = useState(summary.pontos_ativo ?? true);
  const [pontosMinimo, setPontosMinimo] = useState(summary.pontos_minimo ?? 100);
  const [pontosTaxa, setPontosTaxa] = useState(summary.pontos_taxa ?? 0.01);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWelcomeActive(summary.welcome_ativo ?? true);
    setWelcomeValor(summary.welcome_valor ?? 100);
    setPontosAtivo(summary.pontos_ativo ?? true);
    setPontosMinimo(summary.pontos_minimo ?? 100);
    setPontosTaxa(summary.pontos_taxa ?? 0.01);
  }, [summary]);

  const saveSettings = async () => {
    if (welcomeValor < 0) {
      toast.error('Informe um valor de bônus válido.');
      return;
    }
    if (pontosMinimo < 1) {
      toast.error('Informe um mínimo de pontos para resgate válido.');
      return;
    }
    if (pontosTaxa <= 0) {
      toast.error('Informe uma taxa de conversão válida.');
      return;
    }

    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_update_affiliate_points_settings', {
        p_rate: pontosTaxa,
        p_minimum: pontosMinimo,
        p_active: pontosAtivo,
        p_welcome_active: welcomeActive,
        p_welcome_value: welcomeValor,
      });
      toast.success('Configurações de pontuação e bônus salvas com sucesso.');
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar as configurações de pontuação.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bônus de Boas-Vindas */}
      <article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Cadastro de Afiliado</span>
            <h3 className="mt-1 text-xl font-black text-neutral-950">Bônus de Boas-Vindas</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Pontuação creditada automaticamente na conta do afiliado no momento em que ele ativa o seu perfil.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWelcomeActive(!welcomeActive)}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-black transition-colors ${
              welcomeActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {welcomeActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {welcomeActive ? 'Bônus Ativo' : 'Bônus Desativado'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold text-neutral-700">
            Status da Pontuação de Boas-Vindas
            <select
              value={welcomeActive ? 'true' : 'false'}
              onChange={(e) => setWelcomeActive(e.target.value === 'true')}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 p-3 text-sm font-bold text-neutral-800"
            >
              <option value="true">Ativo (Creditar pontos ao se cadastrar)</option>
              <option value="false">Desativado (Não conceder bônus no cadastro)</option>
            </select>
          </label>

          <label className="block text-xs font-bold text-neutral-700">
            Quantidade de Pontos de Boas-Vindas
            <input 
              type="number"
              min={0}
              max={100000}
              value={welcomeValor}
              inputMode="numeric"
onChange={(e) => setWelcomeValor(number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 p-3 text-sm font-bold text-indigo-700"
            />
          </label>
        </div>
      </article>

      {/* Regras de Resgate de Pontos */}
      <article className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Conversão e Resgate</span>
            <h3 className="mt-1 text-xl font-black text-neutral-950">Regras de Resgate para Carteira</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Defina a taxa de conversão e os requisitos mínimos para os afiliados resgatarem pontos em saldo na carteira.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPontosAtivo(!pontosAtivo)}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-black transition-colors ${
              pontosAtivo ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {pontosAtivo ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
            {pontosAtivo ? 'Resgate Ativo' : 'Resgate Pausado'}
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block text-xs font-bold text-neutral-700">
            Resgate de Pontos
            <select
              value={pontosAtivo ? 'true' : 'false'}
              onChange={(e) => setPontosAtivo(e.target.value === 'true')}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 p-3 text-sm font-bold text-neutral-800"
            >
              <option value="true">Permitir Resgate</option>
              <option value="false">Bloquear Resgate</option>
            </select>
          </label>

          <label className="block text-xs font-bold text-neutral-700">
            Pontos Mínimos para Resgate
            <input 
              type="number"
              min={1}
              max={1000000}
              value={pontosMinimo}
              inputMode="numeric"
onChange={(e) => setPontosMinimo(number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 p-3 text-sm font-bold text-neutral-800"
            />
          </label>

          <label className="block text-xs font-bold text-neutral-700">
            Taxa de Conversão (R$ / Ponto)
            <input 
              type="number"
              step={0.001}
              min={0.001}
              max={100}
              value={pontosTaxa}
              inputMode="numeric"
onChange={(e) => setPontosTaxa(number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 p-3 text-sm font-bold text-emerald-700"
            />
            <span className="mt-1.5 block text-[11px] font-bold text-neutral-400">
              Exemplo: {pontosMinimo} pts = {formatCurrency(pontosMinimo * pontosTaxa)}
            </span>
          </label>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => void saveSettings()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-600 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Regras de Pontuação
        </button>
      </article>
    </div>
  );
}

function AffiliateManualAdjustmentForm({ affiliate, onSaved }: { affiliate: AffiliateRecord; onSaved: () => Promise<void> }) {
  const [tipo, setTipo] = useState<'comissao' | 'pontos'>('comissao');
  const [operacao, setOperacao] = useState<'credito' | 'debito'>('credito');
  const [value, setValue] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawNum = Number(value.replace(',', '.'));
    if (!Number.isFinite(rawNum) || rawNum <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error('Informe o motivo do lançamento manual (mínimo 3 caracteres).');
      return;
    }

    const finalValue = operacao === 'debito' ? -Math.abs(rawNum) : Math.abs(rawNum);

    setLoading(true);
    try {
      await callAdminRpc('gsa_admin_adjust_affiliate_balance', {
        p_afiliado_id: affiliate.id,
        p_tipo: tipo,
        p_valor: finalValue,
        p_motivo: motivo.trim(),
      });

      toast.success(
        `Lançamento manual de ${operacao === 'credito' ? 'crédito' : 'débito'} em ${
          tipo === 'pontos' ? 'pontos' : 'saldo'
        } realizado com sucesso!`
      );
      setValue('');
      setMotivo('');
      setIsOpen(false);
      await onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível realizar o lançamento manual.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
          <Banknote className="h-4 w-4 text-indigo-600" /> Lançamento & Ajuste Manual
        </h4>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <PlusCircle className="h-3.5 w-3.5 text-indigo-600" />
          {isOpen ? 'Ocultar Formulário' : 'Novo Lançamento Manual'}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-bold text-neutral-700">
              Tipo de Ajuste
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'comissao' | 'pontos')}
                className="mt-1 w-full rounded-xl border border-neutral-300 p-2.5 text-xs font-bold focus:border-indigo-600 focus:outline-none"
              >
                <option value="comissao">Saldo Financeiro / Comissão (R$)</option>
                <option value="pontos">Pontos de Fidelidade (pts)</option>
              </select>
            </label>

            <label className="block text-xs font-bold text-neutral-700">
              Operação
              <select
                value={operacao}
                onChange={(e) => setOperacao(e.target.value as 'credito' | 'debito')}
                className="mt-1 w-full rounded-xl border border-neutral-300 p-2.5 text-xs font-bold focus:border-indigo-600 focus:outline-none"
              >
                <option value="credito">âž• Crédito (+ Adicionar ao saldo)</option>
                <option value="debito">âž– Débito (- Subtrair do saldo)</option>
              </select>
            </label>

            <label className="block text-xs font-bold text-neutral-700">
              {tipo === 'pontos' ? 'Quantidade (pts)' : 'Valor (R$)'}
              <input 
                type="number"
                step="any"
                min="0"
                placeholder={tipo === 'pontos' ? '100' : '50.00'}
                value={value}
                inputMode="numeric"
onChange={(e) => setValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300 p-2.5 font-mono text-xs font-bold focus:border-indigo-600 focus:outline-none"
                required
              />
            </label>
          </div>

          <label className="block text-xs font-bold text-neutral-700">
            Motivo / Descrição do Lançamento
            <input
              type="text"
              placeholder="Ex: Bônus por meta atingida / Estorno de comissão referente à alteração"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 p-2.5 text-xs font-medium focus:border-indigo-600 focus:outline-none"
              required
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-5 py-2 text-xs font-black text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Confirmar Lançamento
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

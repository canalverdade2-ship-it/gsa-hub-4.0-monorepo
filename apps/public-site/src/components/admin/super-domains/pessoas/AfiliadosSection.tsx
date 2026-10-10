import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, BadgePercent, Banknote, CheckCircle2, 
  Clock, XCircle, Search, Filter, RefreshCw, 
  Zap, Copy, Eye, ShieldCheck, PlusCircle, Save, 
  DollarSign, Sparkles, UserRoundCheck, Link2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn, StatusBadge, CommandSlideOver } from '../shared';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { formatCurrency, formatDate, formatDateTime, copyToClipboard, maskCPF, maskCNPJ } from '../../../../lib/utils';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

type AffiliateAdminTab = 'afiliados' | 'saques' | 'programas' | 'regras_pontos';

interface AffiliateRecord {
  id: string;
  cliente_id?: string;
  nome_divulgacao: string;
  codigo_publico?: string;
  status: string;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  created_at?: string;
  cliques?: number;
  conversoes?: number;
  comissao_total?: number;
  comissao_pendente?: number;
  saldo_disponivel?: number;
  cliente_nome_completo?: string | null;
  cliente_cpf?: string | null;
  cliente_email?: string | null;
  cliente_telefone?: string | null;
}

interface AffiliatePayout {
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
}

interface AffiliateProgram {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  percentual: number;
  janela_atribuicao_dias: number;
  carencia_dias: number;
  saque_minimo: number;
  ativo: boolean;
}

interface AffiliateSummary {
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
}

export interface AfiliadosSectionProps {
  initialSubTab?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function AfiliadosSection({
  initialSubTab,
  colaboradorId,
  colaboradorNome
}: AfiliadosSectionProps) {
  const [activeTab, setActiveTab] = useState<AffiliateAdminTab>((initialSubTab as any) || 'afiliados');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AffiliateSummary>({
    afiliados_ativos: 0,
    cliques: 0,
    vendas_atribuidas: 0,
    comissoes_pendentes: 0,
    comissoes_disponiveis: 0,
    saques_pendentes: 0,
    saque_minimo: 50
  });
  const [programs, setPrograms] = useState<AffiliateProgram[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>([]);
  const [payouts, setPayouts] = useState<AffiliatePayout[]>([]);

  // Selected Affiliate for slideover
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateRecord | null>(null);
  const [isAffiliateDrawerOpen, setIsAffiliateDrawerOpen] = useState(false);
  const [balanceAdjustDelta, setBalanceAdjustDelta] = useState('');
  const [balanceAdjustReason, setBalanceAdjustReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchAffiliateSnapshot = useCallback(async () => {
    try {
      setLoading(true);
      const data = await callAdminRpc<any>('gsa_admin_affiliate_snapshot');
      if (data) {
        setSummary(data.summary || {});
        setPrograms(Array.isArray(data.programs) ? data.programs : []);
        setAffiliates(Array.isArray(data.affiliates) ? data.affiliates : []);
        setPayouts(Array.isArray(data.payouts) ? data.payouts : []);
      }
    } catch (err: any) {
      console.error('Erro ao buscar snapshot de afiliados:', err);
      toast.error('Erro ao carregar módulo de afiliados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAffiliateSnapshot();
  }, [fetchAffiliateSnapshot]);

  useRealtimeSubscription([
    { table: 'gsa_afiliados', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
    { table: 'gsa_afiliado_cliques', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
    { table: 'gsa_afiliado_conversoes', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
    { table: 'gsa_afiliado_comissoes', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
    { table: 'gsa_afiliado_saques', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
    { table: 'gsa_afiliado_transferencias', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
    { table: 'gsa_afiliado_pontos_eventos', onChange: fetchAffiliateSnapshot, debounceMs: 250 },
  ], [fetchAffiliateSnapshot]);

  // Affiliate Actions
  const handleToggleAffiliateStatus = async (affiliateId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ativo' ? 'suspenso' : 'ativo';
    setIsProcessing(true);
    const toastId = toast.loading('Alterando status do afiliado...');
    try {
      await callAdminRpc('gsa_admin_set_affiliate_status', {
        p_affiliate_id: affiliateId,
        p_status: nextStatus
      });
      toast.success(`Afiliado ${nextStatus === 'ativo' ? 'ativado' : 'suspenso'} com sucesso!`, { id: toastId });
      fetchAffiliateSnapshot();
    } catch (err: any) {
      console.error('Erro ao alterar status do afiliado:', err);
      toast.error(`Falha: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReleaseCommissions = async () => {
    if (!window.confirm('Deseja processar a liberação em lote de todas as comissões que já cumpriram a carência?')) {
      return;
    }
    setIsProcessing(true);
    const toastId = toast.loading('Liberando comissões elegíveis...');
    try {
      const res = await callAdminRpc<any>('gsa_admin_release_affiliate_commissions', {
        p_affiliate_ids: null
      });
      toast.success(res?.message || 'Comissões liberadas com sucesso!', { id: toastId });
      fetchAffiliateSnapshot();
    } catch (err: any) {
      console.error('Erro ao liberar comissões:', err);
      toast.error(`Falha ao liberar: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecidePayout = async (payoutId: string, decision: 'aprovar' | 'rejeitar' | 'pagar') => {
    const action = decision === 'aprovar' ? 'approve' : decision === 'rejeitar' ? 'reject' : 'mark_paid';
    let notes: string | null = null;

    if (decision === 'rejeitar') {
      notes = window.prompt('Informe o motivo da rejeição do saque:')?.trim() || null;
      if (!notes) {
        toast.error('O motivo da rejeição é obrigatório.');
        return;
      }
    }

    if (decision === 'pagar') {
      notes = window.prompt('Informe o ID E2E, a referência ou o comprovante do pagamento PIX:')?.trim() || null;
      if (!notes || notes.length < 4) {
        toast.error('A referência ou o comprovante do pagamento é obrigatório.');
        return;
      }
    }

    setIsProcessing(true);
    const toastId = toast.loading(`Processando decisão (${decision})...`);
    try {
      await callAdminRpc('gsa_admin_decide_affiliate_payout', {
        p_payout_id: payoutId,
        p_action: action,
        p_notes: notes,
        p_paid_at: new Date().toISOString(),
      });
      toast.success(`Saque de afiliado: ${decision === 'pagar' ? 'pago com sucesso' : decision}!`, { id: toastId });
      fetchAffiliateSnapshot();
    } catch (err: any) {
      console.error('Erro ao processar saque:', err);
      toast.error(`Falha: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!selectedAffiliate) return;
    const delta = Number(balanceAdjustDelta);
    if (!delta || isNaN(delta)) {
      toast.error('Informe um valor de ajuste válido.');
      return;
    }
    if (!balanceAdjustReason.trim()) {
      toast.error('Informe o motivo do ajuste.');
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Aplicando ajuste no saldo do afiliado...');
    try {
      await callAdminRpc('gsa_admin_adjust_affiliate_balance', {
        p_affiliate_id: selectedAffiliate.id,
        p_delta: delta,
        p_motivo: balanceAdjustReason.trim()
      });
      toast.success('Saldo ajustado com sucesso!', { id: toastId });
      setBalanceAdjustDelta('');
      setBalanceAdjustReason('');
      setIsAffiliateDrawerOpen(false);
      fetchAffiliateSnapshot();
    } catch (err: any) {
      console.error('Erro ao ajustar saldo:', err);
      toast.error(`Falha: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  // Columns for Affiliates
  const affiliateColumns: GridColumn<AffiliateRecord>[] = [
    {
      key: 'nome_divulgacao',
      header: 'Afiliado / Identificador',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {row.nome_divulgacao}
            {row.status === 'ativo' && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Código: <span className="font-bold text-slate-700">{row.codigo_publico || '—'}</span>
            {row.cliente_nome_completo && ` • Titular: ${row.cliente_nome_completo}`}
          </div>
        </div>
      )
    },
    {
      key: 'cliques',
      header: 'Cliques / Vendas',
      sortable: true,
      align: 'center',
      render: (row) => (
        <div className="text-xs font-mono text-slate-700">
          <span className="font-bold text-slate-900">{row.cliques || 0}</span> cliques • <span className="font-bold text-emerald-600">{row.conversoes || 0}</span> vendas
        </div>
      )
    },
    {
      key: 'saldo_disponivel',
      header: 'Saldo Disponível',
      sortable: true,
      align: 'right',
      width: '140px',
      render: (row) => (
        <div className="font-mono font-bold text-slate-900 tabular-nums">
          {formatCurrency(row.saldo_disponivel || 0)}
        </div>
      )
    },
    {
      key: 'comissao_pendente',
      header: 'Comissão em Carência',
      sortable: true,
      align: 'right',
      width: '150px',
      render: (row) => (
        <div className="font-mono text-xs text-amber-700 tabular-nums">
          {formatCurrency(row.comissao_pendente || 0)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '120px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'center',
      width: '90px',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAffiliate(row);
            setIsAffiliateDrawerOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Ver
        </button>
      )
    }
  ];

  // Columns for Payouts
  const payoutColumns: GridColumn<AffiliatePayout>[] = [
    {
      key: 'afiliado_nome',
      header: 'Afiliado / Titular',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900">{row.nome_divulgacao || row.afiliado_nome}</div>
          <div className="text-[11px] text-slate-500 font-mono">
            {row.cliente_nome_completo ? `Titular: ${row.cliente_nome_completo}` : `Ref #${row.id.slice(0, 8)}`}
          </div>
        </div>
      )
    },
    {
      key: 'valor',
      header: 'Valor do Saque',
      sortable: true,
      align: 'right',
      width: '140px',
      render: (row) => (
        <div className="font-mono font-black text-sm text-slate-900 tabular-nums">
          {formatCurrency(row.valor)}
        </div>
      )
    },
    {
      key: 'pix_chave',
      header: 'Chave PIX',
      width: '200px',
      render: (row) => (
        <div className="font-mono text-xs text-slate-700 truncate" title={row.pix_chave || ''}>
          {row.pix_chave || '—'}
        </div>
      )
    },
    {
      key: 'solicitado_em',
      header: 'Solicitado em',
      sortable: true,
      width: '140px',
      render: (row) => (
        <div className="text-xs text-slate-600 font-mono">
          {row.solicitado_em ? formatDate(row.solicitado_em) : '—'}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '120px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ação',
      align: 'center',
      width: '140px',
      render: (row) => {
        if (row.status === 'pendente') {
          return (
            <div className="flex items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => handleDecidePayout(row.id, 'pagar')}
                disabled={isProcessing}
                className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
              >
                Pagar
              </button>
              <button
                type="button"
                onClick={() => handleDecidePayout(row.id, 'rejeitar')}
                disabled={isProcessing}
                className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
              >
                Recusar
              </button>
            </div>
          );
        }
        return <span className="text-xs text-slate-400 font-semibold">Liquidado</span>;
      }
    }
  ];

  return (
    <div className="space-y-4">
      {/* Metric Cockpit */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Afiliados Ativos</span>
          <div className="mt-1 text-2xl font-black text-slate-900 font-mono tabular-nums">
            {summary.afiliados_ativos}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.cliques} cliques • {summary.vendas_atribuidas} conversões
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Comissões Disponíveis</span>
          <div className="mt-1 text-2xl font-black text-emerald-950 font-mono tabular-nums">
            {formatCurrency(summary.comissoes_disponiveis || 0)}
          </div>
          <div className="text-[11px] text-emerald-800 mt-1 font-medium">
            Saldo pronto para resgate
          </div>
        </div>

        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">Comissões em Carência</span>
          <div className="mt-1 text-2xl font-black text-amber-950 font-mono tabular-nums">
            {formatCurrency(summary.comissoes_pendentes || 0)}
          </div>
          <div className="text-[11px] text-amber-800 mt-1 font-medium">
            Aguardando prazo de estorno
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Saques Pendentes</span>
          <div className="mt-1 text-2xl font-black text-slate-900 font-mono tabular-nums">
            {summary.saques_pendentes || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Solicitações de repasse PIX
          </div>
        </div>
      </div>

      {/* Sub-nav & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('afiliados')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'afiliados' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Afiliados ({affiliates.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('saques')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'saques' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Banknote className="h-3.5 w-3.5" />
            <span>Saques de Afiliados ({payouts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('programas')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'programas' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <BadgePercent className="h-3.5 w-3.5" />
            <span>Programas de Comissão ({programs.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReleaseCommissions}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 uppercase tracking-wider"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Liberar Comissões em Lote</span>
          </button>

          <button
            type="button"
            onClick={fetchAffiliateSnapshot}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Main Grids */}
      {activeTab === 'afiliados' && (
        <TacticalDataGrid<AffiliateRecord>
          title="Diretório de Afiliados GSA"
          subtitle="Controle de parceiros de divulgação, links públicos, tracking de conversão e comissionamento"
          data={affiliates}
          columns={affiliateColumns}
          keyExtractor={(item) => item.id}
          isLoading={loading}
          pageSize={15}
          searchPlaceholder="Buscar por nome de divulgação, código ou titular..."
        />
      )}

      {activeTab === 'saques' && (
        <TacticalDataGrid<AffiliatePayout>
          title="Solicitações de Saque de Afiliados"
          subtitle="Liberação de comissões via chave PIX para promotores e parceiros de indicação"
          data={payouts}
          columns={payoutColumns}
          keyExtractor={(item) => item.id}
          isLoading={loading}
          pageSize={15}
          searchPlaceholder="Buscar por nome do afiliado ou chave PIX..."
        />
      )}

      {activeTab === 'programas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((prog) => (
            <div key={prog.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{prog.nome}</h4>
                  <span className="font-mono text-[11px] text-slate-500 uppercase font-semibold">Código: {prog.codigo}</span>
                </div>
                <StatusBadge status={prog.ativo ? 'ativo' : 'inativo'} size="xs" />
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Comissão Padrão</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{prog.percentual}%</span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Janela de Atribuição</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{prog.janela_atribuicao_dias} dias</span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Carência de Liberação</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{prog.carencia_dias} dias</span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Saque Mínimo</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{formatCurrency(prog.saque_minimo)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Affiliate Inspector & Balance Adjust Drawer */}
      {selectedAffiliate && (
        <CommandSlideOver
          isOpen={isAffiliateDrawerOpen}
          onClose={() => {
            setIsAffiliateDrawerOpen(false);
            setSelectedAffiliate(null);
          }}
          title={selectedAffiliate.nome_divulgacao}
          subtitle={`Código Público: ${selectedAffiliate.codigo_publico || '—'} • Cadastrado em ${selectedAffiliate.created_at ? formatDate(selectedAffiliate.created_at) : '—'}`}
          badge={<StatusBadge status={selectedAffiliate.status} size="sm" />}
          width="md"
        >
          <div className="space-y-5 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Dossiê do Afiliado
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Disponível</span>
                  <span className="font-mono font-bold text-base text-slate-900">{formatCurrency(selectedAffiliate.saldo_disponivel || 0)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Comissão em Carência</span>
                  <span className="font-mono font-bold text-sm text-amber-700">{formatCurrency(selectedAffiliate.comissao_pendente || 0)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Cliques</span>
                  <span className="font-mono font-semibold text-slate-800">{selectedAffiliate.cliques || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Vendas Concluídas</span>
                  <span className="font-mono font-semibold text-emerald-700">{selectedAffiliate.conversoes || 0}</span>
                </div>
              </div>
            </div>

            {/* Adjust Balance Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Ajuste Manual de Saldo do Afiliado
              </h4>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Valor do Ajuste (R$ positivo para crédito, negativo para débito)
                </label>
                <input 
                  type="number"
                  step="0.01"
                  value={balanceAdjustDelta}
                  inputMode="numeric"
onChange={(e) => setBalanceAdjustDelta(e.target.value)}
                  placeholder="Ex: 50.00 ou -25.00"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Motivo / Justificativa do Ajuste
                </label>
                <input
                  type="text"
                  value={balanceAdjustReason}
                  onChange={(e) => setBalanceAdjustReason(e.target.value)}
                  placeholder="Ex: Bonificação promocional de campanha"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAdjustBalance}
                  disabled={isProcessing}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm"
                >
                  Salvar Ajuste
                </button>
              </div>
            </div>

            {/* Status toggle */}
            <div className="flex justify-between items-center border-t border-slate-200 pt-3">
              <span className="text-xs font-semibold text-slate-700">Status da Conta do Afiliado</span>
              <button
                type="button"
                onClick={() => handleToggleAffiliateStatus(selectedAffiliate.id, selectedAffiliate.status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase ${
                  selectedAffiliate.status === 'ativo'
                    ? 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {selectedAffiliate.status === 'ativo' ? 'Suspender Afiliado' : 'Ativar Afiliado'}
              </button>
            </div>
          </div>
        </CommandSlideOver>
      )}
    </div>
  );
}

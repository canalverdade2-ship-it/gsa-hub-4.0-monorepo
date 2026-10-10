import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, DollarSign, ArrowUpRight, CheckCircle2, XCircle, 
  Clock, Upload, Eye, RefreshCw, Layers, User, Percent,
  AlertTriangle, ShieldCheck, Ticket, Wallet, FileText
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';
import { StatusBadge } from '../shared/StatusBadge';
import { PainelRentabilidade } from '../../PainelRentabilidade';
import { callAdminRpc } from '../../../../lib/adminRpc';

export interface RentabilidadeReembolsosViewProps {
  initialSubTab?: 'rentabilidade' | 'reembolsos';
  colaboradorNome?: string;
  colaboradorId?: string;
}

export function RentabilidadeReembolsosView({
  initialSubTab = 'rentabilidade',
  colaboradorNome,
  colaboradorId
}: RentabilidadeReembolsosViewProps) {
  const [activeTab, setActiveTab] = useState<'rentabilidade' | 'reembolsos'>(initialSubTab);

  // ── Reembolsos State ───────────────────────────────────────────────────
  const [reembolsos, setReembolsos] = useState<any[]>([]);
  const [loadingReembolsos, setLoadingReembolsos] = useState(true);
  const [selectedRefund, setSelectedRefund] = useState<any | null>(null);
  const [isRefundDrawerOpen, setIsRefundDrawerOpen] = useState(false);

  // Pay Refund Drawer
  const [isPayRefundOpen, setIsPayRefundOpen] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix_estorno');
  const [paymentReference, setPaymentReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // ── Rentabilidade Simulator State ─────────────────────────────────────
  const [simReceita, setSimReceita] = useState(5000);
  const [simCustoPrestador, setSimCustoPrestador] = useState(2200);
  const [simDesconto, setSimDesconto] = useState(250);
  const [simAcrescimo, setSimAcrescimo] = useState(100);

  const fetchReembolsos = async () => {
    setLoadingReembolsos(true);
    try {
      const data = await callAdminRpc<any[]>('gsa_admin_list_store_refunds');
      setReembolsos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao buscar reembolsos:', err);
      toast.error('Erro ao carregar reembolsos.');
    } finally {
      setLoadingReembolsos(false);
    }
  };

  useEffect(() => {
    fetchReembolsos();
  }, []);


  // ── Reembolso Action: Confirmar Pagamento / Estorno ────────────────────
  const handleConfirmRefundPayment = async () => {
    if (!selectedRefund) return;
    setIsSubmittingPayment(true);
    try {
      const isWallet = paymentMethod === 'credito_carteira';
      const isAwaiting = selectedRefund.status === 'aguardando_estorno';
      const action = isWallet ? 'credito_carteira' : (isAwaiting ? 'confirmar_externo' : 'aprovar_externo');
      if (action === 'confirmar_externo' && !paymentReference.trim()) {
        throw new Error('Informe a referência/comprovante do estorno externo.');
      }
      const result = await callAdminRpc<any>('gsa_admin_process_store_refund', {
        p_reembolso_id: selectedRefund.id, p_acao: action, p_metodo: paymentMethod,
        p_referencia: paymentReference.trim() || null, p_comprovante_url: null, p_observacoes: paymentNotes.trim() || null,
      });
      toast.success(result?.status === 'pago' ? 'Reembolso liquidado com segurança.' : 'Reembolso enviado para confirmação do estorno externo.');
      setIsPayRefundOpen(false); setIsRefundDrawerOpen(false); setPaymentReference('');
      await fetchReembolsos();
    } catch (err: any) { toast.error(err?.message || 'Erro ao processar reembolso.'); }
    finally { setIsSubmittingPayment(false); }
  };

  // ── TacticalDataGrid Columns: Reembolsos ───────────────────────────────
  const refundColumns: GridColumn<any>[] = [
    {
      key: 'id',
      header: 'Protocolo',
      width: '130px',
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          #{row.id.slice(0, 8)}
        </span>
      )
    },
    {
      key: 'cliente',
      header: 'Cliente Solicitante',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs truncate">
            {row.cliente_nome || 'Cliente não identificado'}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            {row.cliente_email || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'valor',
      header: 'Valor a Reembolsar',
      align: 'right',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {formatCurrency(row.valor_reembolso)}
        </span>
      )
    },
    {
      key: 'motivo',
      header: 'Motivo do Reembolso',
      render: (row) => (
        <span className="text-xs text-slate-700 truncate max-w-xs block">
          {row.motivo_cancelamento || 'Devolução / Cancelamento de pedido'}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '130px',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} size="xs" />
    },
    {
      key: 'acoes',
      header: 'Ações Rápidas',
      align: 'right',
      width: '160px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {['pendente', 'aguardando_estorno'].includes(row.status) && (
            <button
              onClick={() => {
                setSelectedRefund(row);
                setPaymentNotes('Estorno aprovado pela administração.');
                setPaymentMethod(row.metodo_reembolso || 'pix_estorno');
                setPaymentReference('');
                setIsPayRefundOpen(true);
              }}
              title="Aprovar e Liquidar Reembolso"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>{row.status === 'aguardando_estorno' ? 'Confirmar' : 'Estornar'}</span>
            </button>
          )}

          <button
            onClick={() => {
              setSelectedRefund(row);
              setIsRefundDrawerOpen(true);
            }}
            title="Inspecionar Reembolso"
            className="p-1.5 rounded text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  // Simulator Calculations
  const simReceitaLiquida = simReceita + simAcrescimo - simDesconto;
  const simLucroBruto = simReceitaLiquida - simCustoPrestador;
  const simMargemPct = simReceitaLiquida > 0 ? (simLucroBruto / simReceitaLiquida) * 100 : 0;

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('rentabilidade')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'rentabilidade'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            <span>Simulador & Painel de Rentabilidade</span>
          </button>

          <button
            onClick={() => setActiveTab('reembolsos')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'reembolsos'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />
            <span>Reembolsos & Estornos Loja</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-100 text-rose-800">
              {reembolsos.filter(r => r.status === 'pendente').length}
            </span>
          </button>
        </div>

        {activeTab === 'reembolsos' && (
          <button
            onClick={fetchReembolsos}
            title="Recarregar Dados"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizar</span>
          </button>
        )}
      </div>

      {activeTab === 'rentabilidade' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Simulator Inputs */}
          <div className="lg:col-span-1 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Simulador Interativo de Margem
            </h3>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block text-slate-600 font-semibold">Receita Bruta do Serviço (R$)</label>
                <input 
                  type="number"
                  value={simReceita}
                  inputMode="numeric"
onChange={(e) => setSimReceita(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-600 font-semibold">Custo Direto do Prestador / Parceiro (R$)</label>
                <input 
                  type="number"
                  value={simCustoPrestador}
                  inputMode="numeric"
onChange={(e) => setSimCustoPrestador(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-slate-600 font-semibold">Descontos (R$)</label>
                  <input 
                    type="number"
                    value={simDesconto}
                    inputMode="numeric"
onChange={(e) => setSimDesconto(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-rose-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-600 font-semibold">Acréscimos (R$)</label>
                  <input 
                    type="number"
                    value={simAcrescimo}
                    inputMode="numeric"
onChange={(e) => setSimAcrescimo(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-emerald-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Simulator Metrics Output */}
          <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Resultado do Yield & Margem Líquida</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <span className="text-slate-500 font-bold uppercase text-[10px]">Faturamento Líquido</span>
                <p className="text-lg font-mono font-bold text-slate-900">{formatCurrency(simReceitaLiquida)}</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                <span className="text-emerald-800 font-bold uppercase text-[10px]">Lucro Bruto GSA</span>
                <p className="text-lg font-mono font-bold text-emerald-950">{formatCurrency(simLucroBruto)}</p>
              </div>

              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs space-y-1">
                <span className="text-indigo-800 font-bold uppercase text-[10px]">Margem de Lucro (%)</span>
                <p className="text-lg font-mono font-black text-indigo-950">{simMargemPct.toFixed(1)}%</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <span className="font-bold text-slate-800 uppercase text-[11px]">Detalhamento Proporcional</span>
              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex">
                <div 
                  className="bg-indigo-600 h-full" 
                  style={{ width: `${Math.min(100, Math.max(0, (simCustoPrestador / (simReceitaLiquida || 1)) * 100))}%` }} 
                  title="Custo Prestador"
                />
                <div 
                  className="bg-emerald-500 h-full" 
                  style={{ width: `${Math.min(100, Math.max(0, (simLucroBruto / (simReceitaLiquida || 1)) * 100))}%` }} 
                  title="Margem GSA"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>Custo Prestador: {((simCustoPrestador / (simReceitaLiquida || 1)) * 100).toFixed(0)}%</span>
                <span>Margem GSA: {simMargemPct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <TacticalDataGrid
          title="Fila de Reembolsos & Estornos"
          subtitle="Processamento de solicitações de estorno PIX, cartão e crédito em carteira GSA."
          data={reembolsos}
          columns={refundColumns}
          keyExtractor={(row) => row.id}
          isLoading={loadingReembolsos}
          onRowClick={(row) => {
            setSelectedRefund(row);
            setIsRefundDrawerOpen(true);
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER: PAY REFUND DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isPayRefundOpen}
        onClose={() => setIsPayRefundOpen(false)}
        title="Liquidar Estorno / Reembolso"
        subtitle={selectedRefund ? `Cliente: ${selectedRefund.cliente_nome} (${formatCurrency(selectedRefund.valor_reembolso)})` : ''}
        width="sm"
        primaryAction={{
          label: selectedRefund?.status === 'aguardando_estorno' ? 'Confirmar Estorno Externo' : 'Processar Reembolso',
          onClick: handleConfirmRefundPayment,
          loading: isSubmittingPayment,
          variant: 'success',
          icon: <CheckCircle2 className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsPayRefundOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Método do Reembolso *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-900 shadow-2xs"
            >
              <option value="pix_estorno">Estorno PIX Direto</option>
              <option value="cartao_estorno">Estorno na Fatura do Cartão</option>
              <option value="credito_carteira">Crédito em Carteira Digital GSA</option>
            </select>
          </div>
          {paymentMethod !== 'credito_carteira' && selectedRefund?.status === 'aguardando_estorno' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Referência do Estorno *</label>
              <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="ID/NSU/referência do provedor" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 shadow-2xs" />
            </div>
          )}


          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Observações / Comprovante
            </label>
            <textarea
              rows={3}
              placeholder="Código de autenticação bancária, ID da transação..."
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-slate-900 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER: REFUND DETAILS DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isRefundDrawerOpen}
        onClose={() => setIsRefundDrawerOpen(false)}
        title={selectedRefund ? `Reembolso #${selectedRefund.id.slice(0, 8)}` : 'Detalhes'}
        subtitle={selectedRefund ? `Solicitado em ${formatDateTime(selectedRefund.created_at)}` : ''}
        badge={selectedRefund ? <StatusBadge status={selectedRefund.status} size="sm" /> : undefined}
        width="md"
      >
        {selectedRefund && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
              <span className="text-[10px] font-bold uppercase text-rose-800">Valor do Estorno</span>
              <p className="text-xl font-mono font-bold text-rose-950">{formatCurrency(selectedRefund.valor_reembolso)}</p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase">Cliente</h4>
              <p className="font-bold">{selectedRefund.cliente_nome}</p>
              <p className="text-slate-500 font-mono">{selectedRefund.cliente_email}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Motivo Informado</span>
              <p className="text-slate-800">{selectedRefund.motivo_cancelamento || 'Sem descrição informada.'}</p>
            </div>
          </div>
        )}
      </CommandSlideOver>
    </div>
  );
}

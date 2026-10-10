import React, { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, ArrowDownCircle, Repeat2, CheckCircle2, XCircle, 
  Clock, AlertTriangle, User, RefreshCw, DollarSign, Wallet,
  Calendar, Layers, Filter, Eye, Check, X, ShieldAlert, Sparkles
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { formatCurrency, formatDate, formatDateTime } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../../../lib/notificationService';
import { logService } from '../../../../lib/logService';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';
import { StatusBadge } from '../shared/StatusBadge';

export interface FluxoCaixaViewProps {
  initialSubTab?: 'saques' | 'transferencias';
  initialItemId?: string;
  colaboradorNome?: string;
  colaboradorId?: string;
}

export function FluxoCaixaView({
  initialSubTab = 'saques',
  initialItemId,
  colaboradorNome,
  colaboradorId
}: FluxoCaixaViewProps) {
  const [activeTab, setActiveTab] = useState<'saques' | 'transferencias'>(initialSubTab);
  
  // Data State
  const [saques, setSaques] = useState<any[]>([]);
  const [transferencias, setTransferencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Saque Modal / Action State
  const [selectedSaque, setSelectedSaque] = useState<any | null>(null);
  const [isSaqueSlideOverOpen, setIsSaqueSlideOverOpen] = useState(false);
  const [isProcessingSaque, setIsProcessingSaque] = useState(false);
  const [saqueActionModal, setSaqueActionModal] = useState<{
    isOpen: boolean;
    saque: any | null;
    type: 'approve' | 'reject';
    reason: string;
    dataPagamento: string;
  }>({
    isOpen: false,
    saque: null,
    type: 'approve',
    reason: '',
    dataPagamento: new Date().toISOString().split('T')[0]
  });

  // Transferencia Modal / Action State
  const [selectedTransferencia, setSelectedTransferencia] = useState<any | null>(null);
  const [isTransferenciaSlideOverOpen, setIsTransferenciaSlideOverOpen] = useState(false);
  const [isProcessingTransferencia, setIsProcessingTransferencia] = useState(false);
  const [transfActionModal, setTransfActionModal] = useState<{
    isOpen: boolean;
    transferencia: any | null;
    type: 'rollback';
    reason: string;
    dataPagamento: string;
  }>({
    isOpen: false,
    transferencia: null,
    type: 'rollback',
    reason: '',
    dataPagamento: new Date().toISOString().split('T')[0]
  });

  // ── Fetch Data ──────────────────────────────────────────────────────────
  const fetchSaques = async () => {
    try {
      const { data, error } = await supabase
        .from('saques')
        .select('*, clientes(id, nome, codigo_cliente, cpf, saldo_carteira, telefone, email)')
        .order('data_solicitacao', { ascending: false });
      if (error) throw error;
      if (data) setSaques(data);
    } catch (err) {
      console.error('Erro ao buscar saques:', err);
      toast.error('Erro ao carregar solicitações de saque.');
    }
  };

  const fetchTransferencias = async () => {
    try {
      const { data, error } = await supabase
        .from('transferencias')
        .select(`
          *,
          cliente_origem:clientes!cliente_origem_id(id, nome, cpf, data_cadastro, saldo_carteira, saldo_pontos, telefone),
          cliente_destino:clientes!cliente_destino_id(id, nome, cpf, data_cadastro, saldo_carteira, saldo_pontos, telefone)
        `)
        .order('data_solicitacao', { ascending: false });
      if (error) throw error;
      if (data) setTransferencias(data);
    } catch (err) {
      console.error('Erro ao buscar transferências:', err);
      toast.error('Erro ao carregar transferências.');
    }
  };

  const reloadAll = async () => {
    setLoading(true);
    await Promise.all([fetchSaques(), fetchTransferencias()]);
    setLoading(false);
  };

  useEffect(() => {
    reloadAll();
  }, []);

  useRealtimeSubscription([
    { table: 'saques', onChange: fetchSaques },
    { table: 'transferencias', onChange: fetchTransferencias }
  ]);

  // ── Saque Actions ────────────────────────────────────────────────────────
  const openApproveSaqueModal = (saque: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSaqueActionModal({
      isOpen: true,
      saque,
      type: 'approve',
      reason: '',
      dataPagamento: new Date().toISOString().split('T')[0]
    });
  };

  const openRejectSaqueModal = (saque: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSaqueActionModal({
      isOpen: true,
      saque,
      type: 'reject',
      reason: '',
      dataPagamento: ''
    });
  };

  const confirmSaqueAction = async () => {
    const { saque, type, reason, dataPagamento } = saqueActionModal;
    if (!saque || isProcessingSaque) return;

    if (type === 'reject' && !reason.trim()) {
      toast.error('Informe o motivo da recusa.');
      return;
    }

    setIsProcessingSaque(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_processar_saque', {
        p_saque_id: saque.id,
        p_acao: type === 'approve' ? 'aprovar' : 'rejeitar',
        p_motivo: type === 'reject' ? reason.trim() : null,
        p_data_pagamento: type === 'approve' ? dataPagamento : null
      });

      if (res && !res.success) {
        throw new Error(res.error || 'Erro ao processar saque.');
      }

      toast.success(type === 'approve' ? 'Saque aprovado e pago com sucesso!' : 'Saque rejeitado e estornado.');
      setSaqueActionModal(prev => ({ ...prev, isOpen: false, saque: null }));
      setIsSaqueSlideOverOpen(false);
      fetchSaques();

      // Notifications
      if (type === 'approve') {
        await notificationService.notifyClient(
          saque.cliente_id,
          'Saque realizado',
          `Seu saque no valor de ${formatCurrency(saque.valor)} foi processado e pago com sucesso.`,
          'financeiro',
          'saque_pago',
          { prioridade: 'alta', contexto: { saque_id: saque.id, valor: saque.valor } }
        );
      } else {
        await notificationService.notifyClient(
          saque.cliente_id,
          'Saque recusado',
          `Seu saque no valor de ${formatCurrency(saque.valor)} foi recusado. Motivo: ${reason}. O valor foi devolvido à sua carteira.`,
          'financeiro',
          'saque_recusado',
          { prioridade: 'alta', contexto: { saque_id: saque.id, valor: saque.valor, motivo: reason } }
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: type === 'approve' ? 'APROVAR_SAQUE_CLIENTE' : 'REJEITAR_SAQUE_CLIENTE',
        detalhes: `${type === 'approve' ? 'Aprovou' : 'Rejeitou'} saque de ${formatCurrency(saque.valor)} para o cliente ${saque.clientes?.nome}`
      });
    } catch (err: any) {
      console.error('Erro ao processar saque:', err);
      toast.error(err?.message || 'Erro ao processar saque.');
    } finally {
      setIsProcessingSaque(false);
    }
  };

  // ── Transferência Actions ────────────────────────────────────────────────
  const openRollbackTransfModal = (t: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTransfActionModal({
      isOpen: true,
      transferencia: t,
      type: 'rollback',
      reason: '',
      dataPagamento: ''
    });
  };

  const confirmTransfAction = async () => {
    const { transferencia: t, reason } = transfActionModal;
    if (!t || isProcessingTransferencia) return;

    if (!reason.trim()) {
      toast.error('Informe a justificativa.');
      return;
    }

    setIsProcessingTransferencia(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_processar_transferencia', {
        p_transferencia_id: t.id,
        p_acao: 'estornar',
        p_motivo: reason.trim(),
        p_data_pagamento: null
      });

      if (res && !res.success) {
        throw new Error(res.error || 'Erro ao processar transferência.');
      }

      toast.success('Transferência estornada com sucesso!');

      setTransfActionModal(prev => ({ ...prev, isOpen: false, transferencia: null }));
      setIsTransferenciaSlideOverOpen(false);
      fetchTransferencias();

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ESTORNAR_TRANSFERENCIA',
        detalhes: `Estornou transferência de ${formatCurrency(t.valor)} de ${t.cliente_origem?.nome} para ${t.cliente_destino?.nome}`
      });
    } catch (err: any) {
      console.error('Erro na transferência:', err);
      toast.error(err?.message || 'Erro ao processar transferência.');
    } finally {
      setIsProcessingTransferencia(false);
    }
  };

  // ── TacticalDataGrid Columns: Saques ────────────────────────────────────
  const saqueColumns: GridColumn<any>[] = [
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
      header: 'Cliente / Solicitante',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs truncate">
            {row.clientes?.nome || 'Cliente não identificado'}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            {row.clientes?.cpf || row.clientes?.codigo_cliente || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'chave_pix',
      header: 'Chave PIX / Destino',
      render: (row) => (
        <div className="font-mono text-xs">
          <span className="text-[10px] text-slate-400 block uppercase font-bold">{row.tipo_chave_pix || 'PIX'}</span>
          <span className="text-slate-800 font-semibold">{row.chave_pix || 'Não informada'}</span>
        </div>
      )
    },
    {
      key: 'data_solicitacao',
      header: 'Data Solicitação',
      width: '150px',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">
          {row.data_solicitacao ? formatDateTime(row.data_solicitacao) : '—'}
        </span>
      )
    },
    {
      key: 'valor',
      header: 'Valor do Saque',
      align: 'right',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {formatCurrency(row.valor)}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '120px',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} size="xs" />
    },
    {
      key: 'acoes',
      header: 'Ações Rápidas',
      align: 'right',
      width: '180px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {row.status === 'pendente' && (
            <>
              <button
                onClick={(e) => openApproveSaqueModal(row, e)}
                title="Aprovar Saque e Baixar"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Pagar</span>
              </button>
              <button
                onClick={(e) => openRejectSaqueModal(row, e)}
                title="Rejeitar Saque"
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <XCircle className="h-3 w-3" />
                <span>Recusar</span>
              </button>
            </>
          )}

          <button
            onClick={() => {
              setSelectedSaque(row);
              setIsSaqueSlideOverOpen(true);
            }}
            title="Ver Detalhes do Saque"
            className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  // ── TacticalDataGrid Columns: Transferências ────────────────────────────
  const transfColumns: GridColumn<any>[] = [
    {
      key: 'id',
      header: 'Protocolo',
      width: '120px',
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          #{row.id.slice(0, 8)}
        </span>
      )
    },
    {
      key: 'origem',
      header: 'Remetente (Origem)',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs truncate">
            {row.cliente_origem?.nome || 'Cliente não identificado'}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            {row.cliente_origem?.cpf || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'destino',
      header: 'Destinatário (Destino)',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs truncate">
            {row.cliente_destino?.nome || 'Destinatário não identificado'}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            {row.cliente_destino?.cpf || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'data_solicitacao',
      header: 'Data / Hora',
      width: '150px',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">
          {row.data_solicitacao ? formatDateTime(row.data_solicitacao) : '—'}
        </span>
      )
    },
    {
      key: 'valor',
      header: 'Valor Transferido',
      align: 'right',
      width: '140px',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-slate-900 text-xs">
            {row.tipo?.toLowerCase().includes('ponto') ? `${Number(row.valor).toLocaleString('pt-BR')} pts` : formatCurrency(row.valor)}
          </span>
          {row.taxa_valor > 0 && (
            <span className="text-[10px] font-mono text-slate-500 block">
              Taxa: {formatCurrency(row.taxa_valor)}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '120px',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} size="xs" />
    },
    {
      key: 'acoes',
      header: 'Ações Rápidas',
      align: 'right',
      width: '180px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {['concluido', 'aprovado'].includes(row.status) && (
            <button
              onClick={(e) => openRollbackTransfModal(row, e)}
              title="Estornar Transferência Concluída"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <Repeat2 className="h-3 w-3" />
              <span>Estornar</span>
            </button>
          )}

          <button
            onClick={() => {
              setSelectedTransferencia(row);
              setIsTransferenciaSlideOverOpen(true);
            }}
            title="Ver Detalhes"
            className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('saques')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'saques'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span>Saques de Clientes</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
              {saques.filter(s => s.status === 'pendente').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('transferencias')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'transferencias'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Repeat2 className="h-3.5 w-3.5 text-indigo-600" />
            <span>Transferências entre Clientes</span>
          </button>
        </div>

        <button
          onClick={reloadAll}
          title="Recarregar Dados"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* ── Active Grid ── */}
      {activeTab === 'saques' ? (
        <TacticalDataGrid
          title="Solicitações de Saque de Saldo"
          subtitle="Valide dados bancários e autorize pagamentos PIX de saldos e resgates."
          data={saques}
          columns={saqueColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
          onRowClick={(row) => {
            setSelectedSaque(row);
            setIsSaqueSlideOverOpen(true);
          }}
        />
      ) : (
        <TacticalDataGrid
          title="Transferências P2P entre Carteiras"
          subtitle="Auditoria de transferências instantâneas de saldo e pontos entre clientes."
          data={transferencias}
          columns={transfColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
          onRowClick={(row) => {
            setSelectedTransferencia(row);
            setIsTransferenciaSlideOverOpen(true);
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER: SAQUE INSPECTION & APPROVAL
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isSaqueSlideOverOpen}
        onClose={() => setIsSaqueSlideOverOpen(false)}
        title={selectedSaque ? `Solicitação de Saque #${selectedSaque.id.slice(0, 8)}` : 'Detalhes do Saque'}
        subtitle={selectedSaque ? `Solicitado em ${formatDateTime(selectedSaque.data_solicitacao)}` : ''}
        badge={selectedSaque ? <StatusBadge status={selectedSaque.status} size="sm" /> : undefined}
        width="md"
        footer={
          selectedSaque && selectedSaque.status === 'pendente' && (
            <div className="flex items-center justify-end gap-2 w-full">
              <button
                type="button"
                onClick={() => openRejectSaqueModal(selectedSaque)}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-colors"
              >
                Rejeitar Saque
              </button>
              <button
                type="button"
                onClick={() => openApproveSaqueModal(selectedSaque)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-2xs"
              >
                Aprovar & Confirmar Pagamento
              </button>
            </div>
          )
        }
      >
        {selectedSaque && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Valor do Saque</span>
              <p className="text-xl font-mono font-black text-emerald-950">
                {formatCurrency(selectedSaque.valor)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-600" />
                Dados do Solicitante
              </h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nome:</span>
                  <span className="font-bold text-slate-900">{selectedSaque.clientes?.nome || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">CPF:</span>
                  <span className="font-mono text-slate-900">{selectedSaque.clientes?.cpf || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Saldo Atual em Carteira:</span>
                  <span className="font-mono font-bold text-indigo-600">{formatCurrency(selectedSaque.clientes?.saldo_carteira || 0)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Landmark className="h-4 w-4 text-emerald-600" />
                Destino do Pagamento PIX
              </h4>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tipo de Chave:</span>
                  <span className="font-bold uppercase text-slate-900">{selectedSaque.tipo_chave_pix || 'PIX'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Chave PIX:</span>
                  <span className="font-bold text-slate-900">{selectedSaque.chave_pix || 'Não informada'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER: TRANSFERÊNCIA INSPECTION
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isTransferenciaSlideOverOpen}
        onClose={() => setIsTransferenciaSlideOverOpen(false)}
        title={selectedTransferencia ? `Transferência #${selectedTransferencia.id.slice(0, 8)}` : 'Detalhes'}
        subtitle={selectedTransferencia ? `Realizada em ${formatDateTime(selectedTransferencia.data_solicitacao)}` : ''}
        badge={selectedTransferencia ? <StatusBadge status={selectedTransferencia.status} size="sm" /> : undefined}
        width="md"
        footer={
          selectedTransferencia && (
            <div className="flex items-center justify-end gap-2 w-full">
              {['concluido', 'aprovado'].includes(selectedTransferencia.status) && (
                <button
                  type="button"
                  onClick={() => openRollbackTransfModal(selectedTransferencia)}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  Estornar Operação
                </button>
              )}
            </div>
          )
        }
      >
        {selectedTransferencia && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">Valor da Operação</span>
              <p className="text-xl font-mono font-black text-indigo-950">
                {selectedTransferencia.tipo?.toLowerCase().includes('ponto')
                  ? `${Number(selectedTransferencia.valor).toLocaleString('pt-BR')} pts`
                  : formatCurrency(selectedTransferencia.valor)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500">Origem (Remetente)</span>
                <p className="font-bold text-slate-900">{selectedTransferencia.cliente_origem?.nome || '—'}</p>
                <p className="text-slate-500 font-mono text-[11px]">{selectedTransferencia.cliente_origem?.cpf || '—'}</p>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500">Destino (Favorecido)</span>
                <p className="font-bold text-slate-900">{selectedTransferencia.cliente_destino?.nome || '—'}</p>
                <p className="text-slate-500 font-mono text-[11px]">{selectedTransferencia.cliente_destino?.cpf || '—'}</p>
              </div>
            </div>

            {selectedTransferencia.motivo && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500 block">Motivo / Mensagem</span>
                <p className="text-slate-800 mt-1">{selectedTransferencia.motivo}</p>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          CONFIRMATION MODAL: SAQUE ACTION
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={saqueActionModal.isOpen}
        onClose={() => setSaqueActionModal(prev => ({ ...prev, isOpen: false }))}
        title={saqueActionModal.type === 'approve' ? 'Aprovar Pagamento de Saque' : 'Recusar Solicitação de Saque'}
        subtitle={saqueActionModal.saque ? `Protocolo #${saqueActionModal.saque.id.slice(0, 8)} de ${saqueActionModal.saque.clientes?.nome}` : ''}
        width="sm"
        primaryAction={{
          label: saqueActionModal.type === 'approve' ? 'Confirmar Pagamento' : 'Confirmar Recusa',
          onClick: confirmSaqueAction,
          loading: isProcessingSaque,
          variant: saqueActionModal.type === 'approve' ? 'success' : 'danger'
        }}
        secondaryAction={{
          label: 'Voltar',
          onClick: () => setSaqueActionModal(prev => ({ ...prev, isOpen: false }))
        }}
      >
        <div className="space-y-4 text-xs">
          {saqueActionModal.type === 'approve' ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                Ao confirmar, o sistema registrará a baixa do saque via <code className="font-mono font-bold">gsa_admin_processar_saque</code> e enviará uma notificação ao cliente.
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Data Efetiva do Pagamento *
                </label>
                <input
                  type="date"
                  value={saqueActionModal.dataPagamento}
                  onChange={(e) => setSaqueActionModal(prev => ({ ...prev, dataPagamento: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-900 shadow-2xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
                O valor solicitado será automaticamente devolvido à carteira do cliente.
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Motivo da Recusa *
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Chave PIX incorreta, dados divergentes..."
                  value={saqueActionModal.reason}
                  onChange={(e) => setSaqueActionModal(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium text-slate-900 shadow-2xs"
                />
              </div>
            </div>
          )}
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          CONFIRMATION MODAL: TRANSFERÊNCIA ACTION
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={transfActionModal.isOpen}
        onClose={() => setTransfActionModal(prev => ({ ...prev, isOpen: false }))}
        title="Estornar Transferência"
        width="sm"
        primaryAction={{
          label: 'Confirmar Ação',
          onClick: confirmTransfAction,
          loading: isProcessingTransferencia,
          variant: 'danger'
        }}
        secondaryAction={{
          label: 'Voltar',
          onClick: () => setTransfActionModal(prev => ({ ...prev, isOpen: false }))
        }}
      >
        <div className="space-y-4 text-xs">
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                Informe a justificativa que constará no histórico da auditoria e na notificação ao cliente.
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Motivo / Justificativa *
                </label>
                <textarea
                  rows={3}
                  placeholder="Justificativa da ação..."
                  value={transfActionModal.reason}
                  onChange={(e) => setTransfActionModal(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium text-slate-900 shadow-2xs"
                />
              </div>
            </div>
        </div>
      </CommandSlideOver>
    </div>
  );
}

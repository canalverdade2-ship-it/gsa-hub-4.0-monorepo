import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, CheckCircle, Clock, AlertTriangle, 
  XCircle, Filter, RefreshCw, Copy, Check, Eye, 
  ArrowUpRight, Users, Sparkles, Building2, User 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn, StatusBadge } from '../shared';
import { PayoutClearanceDrawer, UnifiedSaqueItem } from './PayoutClearanceDrawer';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime, copyToClipboard, maskCPF, maskCNPJ } from '../../../../lib/utils';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

export interface SaquesRepassesSectionProps {
  initialItemId?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function SaquesRepassesSection({
  initialItemId,
  colaboradorId,
  colaboradorNome
}: SaquesRepassesSectionProps) {
  const [saques, setSaques] = useState<UnifiedSaqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'prestador' | 'cliente'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pendente');
  const [selectedSaque, setSelectedSaque] = useState<UnifiedSaqueItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const fetchAllSaques = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Prestador Saques
      const { data: prestadorSaques, error: err1 } = await supabase
        .from('prestador_saques')
        .select(`
          *,
          prestador:prestadores(nome_razao, documento, email, telefone)
        `)
        .order('created_at', { ascending: false });

      if (err1) console.error('Erro ao buscar saques de prestadores:', err1);

      // 2. Fetch Client Saques
      const { data: clienteSaques, error: err2 } = await supabase
        .from('saques')
        .select(`
          *,
          cliente:clientes(nome, email, telefone, cpf, cnpj, tipo_pessoa)
        `)
        .order('created_at', { ascending: false });

      if (err2) console.error('Erro ao buscar saques de clientes:', err2);

      const unified: UnifiedSaqueItem[] = [];

      // Transform Prestador Saques
      if (Array.isArray(prestadorSaques)) {
        prestadorSaques.forEach((item: any) => {
          unified.push({
            id: item.id,
            tipo_solicitante: 'prestador',
            prestador_id: item.prestador_id,
            nome_titular: item.prestador?.nome_razao || item.nome_titular || 'Prestador de Serviço',
            documento_titular: item.prestador?.documento || item.documento || '',
            email_titular: item.prestador?.email || '',
            telefone_titular: item.prestador?.telefone || '',
            valor: Number(item.valor) || 0,
            status: item.status || 'pendente',
            pix_tipo: item.pix_tipo || 'Chave PIX',
            pix_chave: item.pix_chave || item.chave_pix || '',
            banco_nome: item.banco_nome,
            agencia: item.agencia,
            conta: item.conta,
            conta_tipo: item.conta_tipo,
            motivo_recusa: item.motivo_recusa || item.motivo,
            data_pagamento: item.data_pagamento || item.pago_em,
            created_at: item.created_at,
            raw_data: item
          });
        });
      }

      // Transform Client Saques
      if (Array.isArray(clienteSaques)) {
        clienteSaques.forEach((item: any) => {
          unified.push({
            id: item.id,
            tipo_solicitante: 'cliente',
            cliente_id: item.cliente_id,
            nome_titular: item.cliente?.nome || item.nome_titular || 'Cliente',
            documento_titular: item.cliente?.cpf || item.cliente?.cnpj || item.documento || '',
            email_titular: item.cliente?.email || '',
            telefone_titular: item.cliente?.telefone || '',
            valor: Number(item.valor) || 0,
            status: item.status || 'pendente',
            pix_tipo: item.tipo_chave || item.pix_tipo || 'Chave PIX',
            pix_chave: item.chave_pix || item.pix_chave || '',
            banco_nome: item.banco,
            agencia: item.agencia,
            conta: item.conta,
            motivo_recusa: item.motivo_rejeicao || item.motivo_recusa || item.motivo,
            data_pagamento: item.data_pagamento || item.pago_em,
            created_at: item.created_at,
            raw_data: item
          });
        });
      }

      // Sort by created_at desc
      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setSaques(unified);
    } catch (err: any) {
      console.error('Erro ao unificar saques:', err);
      toast.error('Erro ao carregar central de repasses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllSaques();
  }, [fetchAllSaques]);

  useRealtimeSubscription([
    { table: 'prestador_saques', onChange: fetchAllSaques },
    { table: 'saques', onChange: fetchAllSaques }
  ]);

  // Deep linking
  useEffect(() => {
    if (initialItemId && saques.length > 0) {
      const match = saques.find((s) => s.id === initialItemId);
      if (match) {
        setSelectedSaque(match);
        setIsDrawerOpen(true);
      }
    }
  }, [initialItemId, saques]);

  const filteredSaques = useMemo(() => {
    return saques.filter((s) => {
      const matchesType = typeFilter === 'all' || s.tipo_solicitante === typeFilter;
      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'pendente' && (s.status === 'pendente' || s.status === 'aguardando' || s.status === 'em_analise')) ||
        (statusFilter === 'pago' && (s.status === 'pago' || s.status === 'concluido' || s.status === 'aprovado')) ||
        (statusFilter === 'rejeitado' && (s.status === 'rejeitado' || s.status === 'cancelado' || s.status === 'recusado'));

      return matchesType && matchesStatus;
    });
  }, [saques, typeFilter, statusFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const pendentes = saques.filter((s) => ['pendente', 'aguardando', 'em_analise'].includes(s.status));
    const pagos = saques.filter((s) => ['pago', 'concluido', 'aprovado'].includes(s.status));
    const rejeitados = saques.filter((s) => ['rejeitado', 'cancelado', 'recusado'].includes(s.status));

    const valorPendente = pendentes.reduce((acc, curr) => acc + curr.valor, 0);
    const valorPago = pagos.reduce((acc, curr) => acc + curr.valor, 0);

    return {
      countPendente: pendentes.length,
      valorPendente,
      countPago: pagos.length,
      valorPago,
      countRejeitado: rejeitados.length
    };
  }, [saques]);

  const handleCopyPix = (id: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!key) return;
    copyToClipboard(key);
    setCopiedId(id);
    toast.success('Chave PIX copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRowClick = (row: UnifiedSaqueItem) => {
    setSelectedSaque(row);
    setIsDrawerOpen(true);
  };

  // Batch Approval
  const handleBatchApprove = async () => {
    if (selectedIds.length === 0 || isBatchProcessing) return;
    if (!window.confirm(`Deseja aprovar e liquidar em lote os ${selectedIds.length} repasses selecionados?`)) {
      return;
    }

    setIsBatchProcessing(true);
    const toastId = toast.loading(`Liquidando ${selectedIds.length} repasses...`);
    const today = new Date().toISOString().split('T')[0];

    let successCount = 0;
    let failCount = 0;

    for (const id of selectedIds) {
      const saqueItem = saques.find((s) => s.id === id);
      if (!saqueItem) continue;

      try {
        if (saqueItem.tipo_solicitante === 'prestador') {
          await callAdminRpc('gsa_admin_processar_saque_prestador', {
            p_saque_id: saqueItem.id,
            p_acao: 'aprovar',
            p_motivo: null,
            p_data_pagamento: today
          });
        } else {
          await callAdminRpc('gsa_admin_processar_saque', {
            p_saque_id: saqueItem.id,
            p_acao: 'aprovar',
            p_motivo: null,
            p_data_pagamento: today
          });
        }
        successCount++;
      } catch (err) {
        console.error(`Erro ao aprovar saque #${id}:`, err);
        failCount++;
      }
    }

    toast.success(`${successCount} repasses liquidados com sucesso! ${failCount > 0 ? `(${failCount} falhas)` : ''}`, { id: toastId });
    setSelectedIds([]);
    setIsBatchProcessing(false);
    fetchAllSaques();
  };

  const columns: GridColumn<UnifiedSaqueItem>[] = [
    {
      key: 'solicitante',
      header: 'Titular / Solicitante',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {row.nome_titular}
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span className={`inline-flex rounded px-1.5 py-0.2 font-bold uppercase text-[9px] ${
              row.tipo_solicitante === 'prestador' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {row.tipo_solicitante === 'prestador' ? 'Prestador' : 'Cliente'}
            </span>
            {row.documento_titular && (
              <span className="font-mono">{row.documento_titular.length > 11 ? maskCNPJ(row.documento_titular) : maskCPF(row.documento_titular)}</span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'valor',
      header: 'Valor do Repasse',
      sortable: true,
      align: 'right',
      width: '160px',
      render: (row) => (
        <div className="font-mono font-black text-sm text-slate-900 tabular-nums">
          {formatCurrency(row.valor)}
        </div>
      )
    },
    {
      key: 'pix_chave',
      header: 'Chave PIX',
      width: '240px',
      render: (row) => {
        const key = row.pix_chave || row.documento_titular || '';
        return (
          <div className="flex items-center gap-2">
            <div className="truncate font-mono text-xs text-slate-700 max-w-[170px]" title={key}>
              {key || <span className="text-slate-400 italic">Não informada</span>}
            </div>
            {key && (
              <button
                type="button"
                onClick={(e) => handleCopyPix(row.id, key, e)}
                className="inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                title="Copiar chave PIX"
              >
                {copiedId === row.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        );
      }
    },
    {
      key: 'created_at',
      header: 'Solicitado em',
      sortable: true,
      width: '150px',
      render: (row) => (
        <div className="text-xs text-slate-600 font-mono">
          {formatDateTime(row.created_at)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '130px',
      render: (row) => <StatusBadge status={row.status} size="sm" pulse={row.status === 'pendente'} />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'center',
      width: '100px',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRowClick(row);
          }}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold shadow-sm transition-all ${
            row.status === 'pendente'
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          {row.status === 'pendente' ? 'Liquidar' : 'Ver'}
        </button>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Metric Cockpit Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Repasses Pendentes de Liquidação
            </span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-amber-950 tabular-nums">
            {formatCurrency(metrics.valorPendente)}
          </div>
          <div className="mt-1 text-xs text-amber-800 font-semibold">
            {metrics.countPendente} solicitações aguardando liberação
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              Repasses Liquidados / Pagos
            </span>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-emerald-950 tabular-nums">
            {formatCurrency(metrics.valorPago)}
          </div>
          <div className="mt-1 text-xs text-emerald-800 font-semibold">
            {metrics.countPago} pagamentos executados
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Recusados / Estornados
            </span>
            <XCircle className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 tabular-nums">
            {metrics.countRejeitado}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Total de recusas com saldo estornado
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Chips */}
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-bold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => setStatusFilter('pendente')}
              className={`rounded-md px-3 py-1.5 transition-all ${
                statusFilter === 'pendente' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendentes ({metrics.countPendente})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pago')}
              className={`rounded-md px-3 py-1.5 transition-all ${
                statusFilter === 'pago' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pagos ({metrics.countPago})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('rejeitado')}
              className={`rounded-md px-3 py-1.5 transition-all ${
                statusFilter === 'rejeitado' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Recusados ({metrics.countRejeitado})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded-md px-3 py-1.5 transition-all ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({saques.length})
            </button>
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            <option value="all">Todos os Solicitantes</option>
            <option value="prestador">Prestadores (Repasses de OS)</option>
            <option value="cliente">Clientes (Resgate de Cashback)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBatchApprove}
              disabled={isBatchProcessing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 uppercase tracking-wider"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Liquidar ({selectedIds.length}) em Lote
            </button>
          )}

          <button
            type="button"
            onClick={fetchAllSaques}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Main Tactical Grid */}
      <TacticalDataGrid<UnifiedSaqueItem>
        title="Central de Saques & Repasses"
        subtitle="Mesa de liquidação contábil, conferência de chaves PIX e autorização de pagamentos a prestadores e clientes"
        data={filteredSaques}
        columns={columns}
        keyExtractor={(item) => item.id}
        onRowClick={handleRowClick}
        isLoading={loading}
        pageSize={15}
        enableSelection={statusFilter === 'pendente'}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Buscar por titular, CPF, CNPJ ou chave PIX..."
      />

      {/* Clearance SlideOver Drawer */}
      <PayoutClearanceDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedSaque(null);
        }}
        saque={selectedSaque}
        onSuccess={fetchAllSaques}
        colaboradorId={colaboradorId}
        colaboradorNome={colaboradorNome}
      />
    </div>
  );
}

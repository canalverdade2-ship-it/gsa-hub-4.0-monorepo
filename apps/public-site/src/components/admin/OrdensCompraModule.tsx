import { getStoreOrderPayment } from '../../lib/storeOrderPayment';
import { useState, useEffect, useRef, useCallback } from 'react';
import './PurchaseDetails.css';
import { Search, ShoppingBag, CheckCircle, XCircle, ChevronRight, Truck, Package, Clock, CreditCard, Store, User, Building2, Save, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, generateCode, handleError, maskPhone, generateUUID } from '../../lib/utils';
import { getProductDisplayCode, getProductDisplayCodeLabel } from '../../lib/productIdentification';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { callAdminRpc, getAdminProductSupplierConfig, deleteAdminEntityCascade } from '../../lib/adminRpc';
import { ProdutoFornecedorConfig } from '../../types';
import { cancelAdminStoreOrder, transitionAdminStoreOrder } from '../../lib/adminStoreOperations';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

export function OrdensCompraModule({ 
  activeSubTab, 
  initialItemId, 
  colaboradorNome, 
  onNavigate 
}: { 
  activeSubTab?: 'processamento' | 'concluido' | 'cancelado', 
  initialItemId?: string, 
  colaboradorNome?: string,
  onNavigate?: (module: string, tab?: string, itemId?: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'processamento' | 'concluido' | 'cancelado'>('processamento');

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);

  const [ordens, setOrdens] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedOrdem, setSelectedOrdem] = useState<any | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Estados para Modal de Cancelamento & Reembolso
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const transitionRequestId = useRef(generateUUID());
  const cancellationRequestId = useRef(generateUUID());

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && ordens.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const targetOrder = ordens.find(o => o.id === initialItemId || o.orcamento_id === initialItemId);
        const element = targetOrder && document.getElementById(`oc-${targetOrder.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(targetOrder.id);
          
          // Abrir modal automaticamente
          const ordem = targetOrder;
          if (ordem) {
            setSelectedOrdem(ordem);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, ordens]);


  const fetchOrdens = useCallback(async () => {
    let selectStr = '*, produtos(nome, valor, codigo_produto, codigo_barras, identificador_preferencial, tipo_codigo_barras, imagem_url), clientes(nome, email, telefone), orcamentos(id, codigo_orcamento, forma_pagamento_loja, parcelas_credito, status, desconto, taxa_entrega, cupom_desconto_id, cupom_entrega_id, endereco_entrega, total, quantidade), faturas(id, status, is_amortizacao_credito, codigo_fatura, desconto_voucher_aplicado, desconto_pontos_aplicado, abatimento_carteira_aplicado, valor_total, pagamentos(metodo, valor, data_pagamento))';
    if (search) {
      selectStr = '*, produtos!inner(nome, valor, codigo_produto, codigo_barras, identificador_preferencial, tipo_codigo_barras, imagem_url), clientes(nome, email, telefone), orcamentos(id, codigo_orcamento, forma_pagamento_loja, parcelas_credito, status, desconto, taxa_entrega, cupom_desconto_id, cupom_entrega_id, endereco_entrega, total, quantidade), faturas(id, status, is_amortizacao_credito, codigo_fatura, desconto_voucher_aplicado, desconto_pontos_aplicado, abatimento_carteira_aplicado, valor_total, pagamentos(metodo, valor, data_pagamento))';
    }

    let query = supabase.from('ordens_compra').select(selectStr);
    
    if (activeTab === 'processamento') {
      query = query.in('status', ['em_analise', 'pago', 'aprovado', 'em_expedicao', 'em_transporte']);
    } else if (activeTab === 'concluido') {
      query = query.eq('status', 'concluido');
    } else if (activeTab === 'cancelado') {
      query = query.eq('status', 'cancelado');
    }
    
    if (search) {
      query = query.ilike('produtos.nome', `%${search}%`);
    }

    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = `${year}-${filters.mes}-${String(new Date(Number(year), Number(filters.mes), 0).getDate()).padStart(2, '0')}`;
      query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
    }

    const { data, error } = (await query.order('data_criacao', { ascending: false })) as any;
    if (error) {
      console.error('Error fetching ordens_compra:', error);
      toast.error('Erro ao carregar ordens de compra.');
    }
    if (data) {
      // Enriquecer ordens do mesmo orçamento com a mesma fatura em O(N)
      const faturasByOrcamento = new Map<string, any>();
      for (const ordem of data) {
        if (ordem.orcamento_id && ordem.faturas && ordem.faturas.length > 0 && !faturasByOrcamento.has(ordem.orcamento_id)) {
          faturasByOrcamento.set(ordem.orcamento_id, ordem.faturas);
        }
      }

      const enriched = data.map((ordem: any) => {
        if (ordem.faturas && ordem.faturas.length > 0) {
          return ordem;
        }
        if (ordem.orcamento_id && faturasByOrcamento.has(ordem.orcamento_id)) {
          return {
            ...ordem,
            faturas: faturasByOrcamento.get(ordem.orcamento_id)
          };
        }
        return ordem;
      });

      setOrdens(enriched);
      
      // Se tiver selecionado aberto, atualiza a referência
      if (selectedOrdem) {
        const updated = enriched.find((o: any) => o.id === selectedOrdem.id);
        if (updated) setSelectedOrdem(updated);
      }
    }
  }, [activeTab, search, filters, selectedOrdem?.id]);

  useEffect(() => {
    void fetchOrdens();
  }, [fetchOrdens]);

  useRealtimeSubscription([
    { table: 'ordens_compra', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'produtos', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'faturas', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'cupons_loja', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'orcamentos', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'clientes', onChange: fetchOrdens, debounceMs: 300 },
    { table: 'pagamentos', onChange: fetchOrdens, debounceMs: 300 },
  ]);

const handleUpdateStatus = async (id: string, status: 'pago' | 'em_expedicao' | 'em_transporte' | 'concluido' | 'cancelado', motivo?: string, tracking?: { rastreavel: boolean; codigo: string }) => {
  if (status === 'cancelado') {
    setCancelReason(motivo || 'Cancelamento solicitado pelo sistema');
    setIsCancelModalOpen(true);
    return;
  }
  try {
    const result = await transitionAdminStoreOrder({
      requestId: transitionRequestId.current,
      ordemId: id,
      status,
      tracking,
    });
    transitionRequestId.current = generateUUID();
    toast.success(result?.already_processed ? 'Esta transição já havia sido processada.' : 'Status atualizado com segurança.');
    setIsDetailOpen(false);
    await fetchOrdens();
  } catch (error) {
    toast.error(handleError(error, 'atualizar status do pedido'));
    return false;
  }
  return true;
};

const handleCancelAndRefundConfirm = async () => {
  if (!selectedOrdem || !cancelReason.trim()) {
    toast.error('Informe o motivo do cancelamento.');
    return;
  }

  setIsCanceling(true);
  try {
    const result = await cancelAdminStoreOrder({
      requestId: cancellationRequestId.current,
      ordemId: selectedOrdem.id,
      motivo: cancelReason.trim(),
    });
    cancellationRequestId.current = generateUUID();
    toast.success(result?.already_processed
      ? 'Este cancelamento já havia sido processado.'
      : result?.refund_created
        ? 'Compra cancelada, estoque restaurado e reembolso aberto.'
        : 'Compra cancelada e saldos restaurados com segurança.');
    setIsCancelModalOpen(false);
    setIsDetailOpen(false);
    setCancelReason('');
    await fetchOrdens();
    if (result?.refund_created && onNavigate) {
      onNavigate('cadastro', 'reembolsos');
    }
  } catch (error) {
    toast.error(handleError(error, 'cancelar compra'));
  } finally {
    setIsCanceling(false);
  }
};

return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Pedidos de produtos</h1>
          <p className="page-subtitle">Acompanhe pagamento, separação e entrega das compras do Marketplace.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar pedidos por situação">
          {([
            ['processamento', 'Em processamento'],
            ['concluido', 'Concluídos'],
            ['cancelado', 'Cancelados'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${activeTab === tab
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <GlobalFilter
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'mes',
              label: 'Mês de Criação',
              type: 'select',
              options: [
                { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
              ],
            },
            {
              id: 'ano',
              label: 'Ano',
              type: 'select',
              options: [
                { value: '2024', label: '2024' },
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' },
              ],
            },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {ordens.length > 0 ? (
          <div className="overflow-x-auto" role="region" aria-label="Pedidos do Marketplace" tabIndex={0}>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3.5 font-semibold">Pedido</th>
                  <th className="px-5 py-3.5 font-semibold">Produto</th>
                  <th className="px-5 py-3.5 font-semibold">Cliente</th>
                  <th className="px-5 py-3.5 font-semibold">Valor</th>
                  <th className="px-5 py-3.5 font-semibold">Entrega</th>
                  <th className="px-5 py-3.5 font-semibold">Pagamento</th>
                  <th className="px-5 py-3.5 font-semibold">Data</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody>
                {ordens.map((ordem) => {
                  const fatura = ordem.faturas?.[0];
                  const deliveryLabels: Record<string, string> = {
                    em_analise: 'Aguardando pagamento', pago: 'Pedido aprovado', aprovado: 'Pedido aprovado',
                    em_expedicao: 'Em expedição', em_transporte: 'Em transporte', concluido: 'Entregue', cancelado: 'Cancelado',
                  };
                  const deliveryTone = ordem.status === 'cancelado'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : ordem.status === 'concluido'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : ordem.status === 'em_transporte'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : ordem.status === 'em_expedicao'
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600';
                  return (
                    <tr
                      key={ordem.id}
                      id={`oc-${ordem.id}`}
                      className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${highlightedId === ordem.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className="font-semibold text-slate-900">{ordem.codigo_ordem || `#OC-${ordem.id.slice(0, 4).toUpperCase()}`}</span>
                        {ordem.orcamentos?.codigo_orcamento && <div className="mt-1 text-xs text-slate-500">Orçamento {ordem.orcamentos.codigo_orcamento}</div>}
                      </td>
                      <td className="max-w-[240px] px-5 py-4">
                        <span className="block truncate font-medium text-slate-800">{ordem.produtos?.nome || 'Produto da Loja'}</span>
                      </td>
                      <td className="max-w-[200px] px-5 py-4">
                        <span className="block truncate font-medium text-slate-800">{ordem.clientes?.nome || 'Cliente não identificado'}</span>
                        {ordem.clientes?.email && <span className="block truncate text-xs text-slate-500">{ordem.clientes.email}</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums text-slate-900">
                        {formatCurrency(ordem.orcamentos?.total ?? ordem.produtos?.valor ?? 0)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${deliveryTone}`}>
                          {deliveryLabels[ordem.status] || ordem.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {fatura ? (
                          <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${fatura.status === 'pago' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                            {fatura.status === 'pago' ? 'Pago' : 'Aguardando'}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{ordem.data_criacao ? formatDate(ordem.data_criacao) : '—'}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => { setSelectedOrdem(ordem); setIsDetailOpen(true); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                          aria-label={`Ver detalhes do pedido ${ordem.codigo_ordem || ordem.id}`}
                        >
                          Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600"><ShoppingBag className="h-5 w-5" /></span>
            <p className="font-semibold text-slate-800">Nenhum pedido {activeTab === 'processamento' ? 'em processamento' : activeTab === 'concluido' ? 'concluído' : 'cancelado'}</p>
            <p className="mt-1 text-sm text-slate-500">Quando houver pedidos nesta situação, eles aparecerão aqui.</p>
          </div>
        )}
      </div>

      {/* Modal Principal de Detalhes */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da compra" size="wide">
        {selectedOrdem && (
          <CompraDetails 
            ordem={selectedOrdem} 
            showActions={activeTab === 'processamento'} 
            onUpdateStatus={handleUpdateStatus}
            onCancelClick={() => {
              setIsCancelModalOpen(true);
            }}
            onDeleteClick={() => {
              setDeleteReason('');
              setIsDeleteModalOpen(true);
            }}
          />
        )}
      </Modal>

      {/* Modal Pop-up de Cancelamento & Reembolso */}
      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Confirmar Cancelamento do Pedido">
        {selectedOrdem && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-red-50 p-6 border border-red-200">
              <h4 className="text-base font-bold text-red-900 mb-2">Atenção! Você está cancelando o pedido:</h4>
              <p className="text-sm font-semibold text-red-800">Ordem: {selectedOrdem.codigo_ordem || `#OC-${selectedOrdem.id.slice(0, 4).toUpperCase()}`}</p>
              <p className="text-sm font-semibold text-red-800">Cliente: {selectedOrdem.clientes?.nome}</p>
              <p className="text-sm font-semibold text-red-800">Produto: {selectedOrdem.produtos?.nome}</p>
              
              {selectedOrdem.faturas?.[0]?.status === 'pago' ? (
                <div className="mt-4 pt-4 border-t border-red-300/40">
                  <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 uppercase mb-2">⚠️ Pedido Pago</span>
                  <p className="text-sm text-red-800 leading-relaxed">
                    Como a fatura correspondente já foi paga, o sistema irá **gerar automaticamente uma solicitação de Reembolso** de forma integrada.
                  </p>
                  <div className="mt-4 bg-white/80 rounded-xl p-4 border border-red-200">
                    <p className="text-xs text-neutral-400 font-bold uppercase">Valor a ser Reembolsado</p>
                    <p className="text-2xl font-black text-red-700 mt-1">{formatCurrency(selectedOrdem.faturas[0].valor_total)}</p>
                    <p className="text-[10px] text-neutral-500 font-semibold mt-1">O prazo de pagamento do reembolso será fixado em **10 dias**.</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-700 font-medium mt-2">
                  Esta ordem ainda não foi paga pelo cliente. O cancelamento apenas registrará a anulação no sistema.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-700 uppercase">Motivo do Cancelamento *</label>
              <textarea
                rows={4}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Descreva detalhadamente o motivo do cancelamento para o histórico e para o e-mail/notificação do cliente..."
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setIsCancelModalOpen(false)}
                className="flex-1 rounded-xl bg-neutral-100 py-3 text-neutral-600 font-bold hover:bg-neutral-200 transition-all text-xs"
              >
                Voltar
              </button>
              <button 
                onClick={handleCancelAndRefundConfirm}
                disabled={isCanceling || !cancelReason.trim()}
                className="flex-1 rounded-xl bg-red-600 py-3 text-white font-bold hover:bg-red-700 transition-all text-xs shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {isCanceling ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function CompraDetails({ 
  ordem, 
  showActions = false, 
  onUpdateStatus,
  onCancelClick,
  onDeleteClick
}: { 
  ordem: any, 
  showActions?: boolean, 
  onUpdateStatus?: (id: string, status: 'pago' | 'em_expedicao' | 'em_transporte' | 'concluido' | 'cancelado', motivo?: string, tracking?: { rastreavel: boolean; codigo: string }) => void | boolean | Promise<void | boolean>,
  onCancelClick?: () => void;
  onDeleteClick?: () => void
}) {
  const [couponCode, setCouponCode] = useState<string>('');
  const [relatedItems, setRelatedItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [pointsDiscount, setPointsDiscount] = useState<number>(0);
  const [walletDiscount, setWalletDiscount] = useState<number>(0);
  const [faturasCredito, setFaturasCredito] = useState<any[]>([]);
  const [supplierConfigs, setSupplierConfigs] = useState<Record<string, ProdutoFornecedorConfig>>({});
  const [observacoesInternas, setObservacoesInternas] = useState<string>(ordem.observacoes_internas || '');
  const [savingObs, setSavingObs] = useState(false);
  const [selectedProdutoDetalhe, setSelectedProdutoDetalhe] = useState<any>(null);
  const [isProdutoModalOpen, setIsProdutoModalOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'pago' | 'em_expedicao' | 'em_transporte' | 'concluido' | null>(null);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const statusLock = useRef(false);
  const [trackable, setTrackable] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const statusLabels = { pago: 'Pedido aprovado', em_expedicao: 'Em expedição', em_transporte: 'Em transporte', concluido: 'Pedido entregue' };

  const confirmStatus = async () => {
    if (!pendingStatus || !onUpdateStatus || statusLock.current) return;
    if (pendingStatus === 'em_transporte' && trackable && !trackingCode.trim()) { toast.error('Informe o código de rastreamento.'); return; }
    statusLock.current = true;
    setConfirmingStatus(true);
    try {
      const result = await onUpdateStatus(ordem.id, pendingStatus, undefined, pendingStatus === 'em_transporte' ? { rastreavel: trackable, codigo: trackable ? trackingCode.trim() : '' } : undefined);
      if (result !== false) setPendingStatus(null);
    } catch (error) {
      toast.error(handleError(error, 'atualizar status do pedido'));
    } finally {
      statusLock.current = false;
      setConfirmingStatus(false);
    }
  };

  const handleSaveObservacoes = async () => {
    setSavingObs(true);
    try {
      await callAdminRpc('gsa_admin_update_store_order_notes', {
        p_ordem_compra_id: ordem.id,
        p_observacoes: observacoesInternas,
      });
      toast.success('Observações salvas com sucesso');
    } catch (err) {
      toast.error(handleError(err, 'Erro ao salvar observações'));
    } finally {
      setSavingObs(false);
    }
  };

  const handleProductClick = async (produtoId: string) => {
    try {
      const { data } = await supabase.from('produtos').select('*, categorias(nome)').eq('id', produtoId).single();
      if (data) {
        setSelectedProdutoDetalhe(data);
        setIsProdutoModalOpen(true);
      }
    } catch (err) {
      console.error('Erro ao buscar produto', err);
    }
  };

  const fatura = ordem.faturas?.[0];
  const orcamento = ordem.orcamentos;
  const { isGsaCredit, logisticsAllowed: isPaid } = getStoreOrderPayment(ordem);

  useEffect(() => {
    const fetchFaturasCredito = async () => {
      if (!orcamento?.codigo_orcamento && !orcamento?.id) return;
      try {
        const codOrc = orcamento?.codigo_orcamento || '';
        const { data } = await supabase
          .from('faturas')
          .select('*')
          .eq('cliente_id', ordem.cliente_id)
          .eq('is_amortizacao_credito', true);
        
        const filtered = (data || []).filter((f: any) => {
          if (f.orcamento_id === orcamento?.id) return true;
          if (!codOrc) return false;
          const jsonStr = JSON.stringify(f.itens_faturados || []);
          return f.codigo_fatura?.includes(codOrc) || (f.observacoes && f.observacoes.includes(codOrc)) || jsonStr.includes(codOrc);
        });
        setFaturasCredito(filtered);
      } catch (err) {
        console.error('Erro ao buscar faturas de crédito:', err);
      }
    };
    fetchFaturasCredito();
  }, [orcamento?.codigo_orcamento, ordem.cliente_id]);

  useEffect(() => {
    const fetchCoupon = async () => {
      if (orcamento?.cupom_desconto_id) {
        try {
          const { data, error } = await supabase.from('cupons_loja').select('codigo_cupom').eq('id', orcamento.cupom_desconto_id).single();
          if (error) throw error;
          if (data?.codigo_cupom) {
            setCouponCode(data.codigo_cupom);
          }
        } catch (err) {
          toast.error('Erro ao carregar o cupom.');
        }
      }
    };
    fetchCoupon();
  }, [orcamento]);

  useEffect(() => {
    const fetchRelatedItems = async () => {
      if (!orcamento?.id) return;
      setLoadingItems(true);
      try {
        const [ocsRes, oasRes] = await Promise.all([
          supabase
            .from('ordens_compra')
            .select('*, produtos(nome, valor, codigo_produto, codigo_barras, identificador_preferencial, tipo_codigo_barras, imagem_url)')
            .eq('orcamento_id', orcamento.id),
          supabase
            .from('ordens_assinatura')
            .select('*, assinaturas(nome, valor, codigo_assinatura, imagem_url)')
            .eq('orcamento_id', orcamento.id),
        ]);

        const ocs = (ocsRes.data || []).map(oc => ({ ...oc, tipo: 'produto', item_detalhes: oc.produtos }));
        const oas = (oasRes.data || []).map(oa => ({ ...oa, tipo: 'assinatura', item_detalhes: oa.assinaturas }));

        setRelatedItems([...ocs, ...oas]);

        const configs: Record<string, ProdutoFornecedorConfig> = {};
        for (const oc of ocs) {
          if (oc.produto_id) {
            try {
              const cfg = await getAdminProductSupplierConfig(oc.produto_id);
              if (cfg && cfg.fornecimento_externo_ativo) {
                configs[oc.produto_id] = cfg;
              }
            } catch (err) {
              console.error('Erro ao buscar supplier config', err);
            }
          }
        }
        setSupplierConfigs(configs);

      } catch (err) {
        console.error('Erro ao buscar itens relacionados:', err);
      } finally {
        setLoadingItems(false);
      }
    };
    fetchRelatedItems();
  }, [orcamento?.id]);

  useEffect(() => {
    const fetchDiscounts = async () => {
      if (!orcamento?.codigo_orcamento) return;
      try {
        // Fetch Points
        const { data: pData, error: pError } = await supabase
          .from('points_transactions')
          .select('pontos')
          .eq('cliente_id', ordem.cliente_id)
          .like('descricao', `%#${orcamento.codigo_orcamento}%`)
          .limit(1)
          .maybeSingle();

        if (pData && !pError) {
          setPointsDiscount(Math.abs(pData.pontos) * 0.01);
        } else {
          const { data: dataMov, error: errorMov } = await supabase
            .from('pontos_movimentacoes')
            .select('pontos')
            .eq('cliente_id', ordem.cliente_id)
            .like('descricao', `%#${orcamento.codigo_orcamento}%`)
            .limit(1)
            .maybeSingle();
            
          if (dataMov && !errorMov) {
            setPointsDiscount(Math.abs(dataMov.pontos) * 0.01);
          }
        }

        // Fetch Wallet (fallback for old orders)
        if (!fatura?.abatimento_carteira_aplicado) {
          const { data: wData } = await supabase
            .from('extrato_financeiro')
            .select('valor')
            .eq('referencia_id', orcamento.id)
            .eq('tipo', 'saida');
          
          if (wData && wData.length > 0) {
            const totalCarteira = wData.reduce((acc, curr) => acc + Number(curr.valor), 0);
            setWalletDiscount(totalCarteira);
          } else {
            setWalletDiscount(0);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar descontos retroativos:', err);
      }
    };
    fetchDiscounts();
  }, [orcamento?.codigo_orcamento, ordem.cliente_id, fatura]);

  return (
    <div className="purchase-details grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-8 text-left">
      <Modal
        isOpen={pendingStatus !== null}
        onClose={() => { if (!statusLock.current) setPendingStatus(null); }}
        title={pendingStatus === 'concluido' ? 'Confirmar entrega do pedido?' : 'Confirmar mudança de status?'}
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-neutral-600">
            {pendingStatus === 'concluido'
              ? 'Confirme somente se o cliente já recebeu o pedido. Ao confirmar, ele será marcado como entregue e concluído.'
              : <>O pedido será alterado para <strong className="text-neutral-900">{pendingStatus ? statusLabels[pendingStatus] : ''}</strong>. Deseja continuar?</>}
          </p>
          {pendingStatus === 'em_transporte' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 p-4">
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                <input type="checkbox" checked={trackable} disabled={confirmingStatus} onChange={e => setTrackable(e.target.checked)} className="h-5 w-5 accent-indigo-600" />
                Entrega rastreável
              </label>
              {trackable ? <label className="block text-sm font-medium">Código de rastreamento
                <input value={trackingCode} onChange={e => setTrackingCode(e.target.value)} disabled={confirmingStatus} maxLength={100} autoComplete="off" placeholder="Informe o código da transportadora" className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 text-base" />
              </label> : <p className="text-sm text-neutral-500">Entrega sem código de rastreamento.</p>}
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" disabled={confirmingStatus} onClick={() => setPendingStatus(null)} className="min-h-12 flex-1 rounded-xl border border-neutral-200 px-4 py-3 font-semibold disabled:opacity-50">Voltar</button>
            <button type="button" disabled={confirmingStatus} onClick={() => void confirmStatus()} className="min-h-12 flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {confirmingStatus ? 'Salvando…' : pendingStatus === 'concluido' ? 'Confirmar entrega' : 'Confirmar alteração'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Coluna 1: Dados Gerais e Itens */}
      <div className="space-y-6">
        <div className="rounded-3xl bg-neutral-50 p-6 md:p-8 ring-1 ring-neutral-200 relative">
          <div className="absolute top-6 right-6">
            <AdminWhatsAppButton 
              telefone={ordem.clientes?.telefone}
              mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                tipo: 'compra',
                clienteNome: ordem.clientes?.nome,
                codigo: ordem.codigo_ordem || `#OC-${ordem.id.slice(0, 4).toUpperCase()}`,
                status: (ordem.status === 'pago' || ordem.status === 'aprovado') ? 'Pedido Aprovado' : ordem.status === 'em_expedicao' ? 'Em Expedição' : ordem.status === 'em_transporte' ? 'Em Transporte' : ordem.status === 'concluido' ? 'Pedido Entregue' : 'Aguardando Pagamento'
              })}
            />
          </div>
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Pedido da GSA Store</span>
          <h3 className="text-2xl font-black text-neutral-900 uppercase mt-1 leading-tight pr-12">
            {orcamento?.titulo_solicitacao || 'Ordem de Compra'}
          </h3>
          <p className="text-xs font-mono text-neutral-400 mt-2">
            Código do Pedido: {ordem.codigo_ordem || `#OC-${ordem.id.slice(0, 4).toUpperCase()}`}
          </p>
          
          <div className="mt-6 space-y-4 pt-6 border-t border-neutral-200">
            <div className="purchase-customer text-sm">
              <span className="text-neutral-500 font-medium">Cliente</span>
              <span className="block mt-1 text-neutral-900 font-semibold">{ordem.clientes?.nome}</span>
              <span className="block mt-1 break-all text-neutral-600">{ordem.clientes?.email}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500 font-bold">Data do Pedido:</span>
              <span className="text-neutral-800 font-black">{formatDate(ordem.data_criacao)}</span>
            </div>
          </div>
        </div>

        {/* Lista de Itens do Pedido */}
        <div className="rounded-3xl bg-neutral-50 p-6 md:p-8 ring-1 ring-neutral-200 space-y-4">
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Itens do Pedido</span>
          
          {loadingItems ? (
            <div className="py-4 text-center text-xs text-neutral-400 font-bold uppercase">Carregando itens...</div>
          ) : relatedItems.length > 0 ? (
            <div className="space-y-4 division-y division-neutral-200">
              {relatedItems.map((item, index) => {
                const isSupplier = item.tipo === 'produto' && item.produto_id && supplierConfigs[item.produto_id];
                return (
                  <div 
                    key={item.id} 
                    onClick={() => item.produto_id ? handleProductClick(item.produto_id) : undefined}
                    className={`flex flex-col gap-4 p-2 -mx-2 rounded-xl transition-all ${item.produto_id ? 'cursor-pointer hover:bg-white hover:shadow-sm ring-1 ring-transparent hover:ring-neutral-200' : ''} ${index > 0 ? 'pt-4 border-t border-neutral-200/60' : ''}`}
                  >
                    <div className="purchase-item flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {item.item_detalhes?.imagem_url ? (
                          <img src={item.item_detalhes.imagem_url} alt={item.item_detalhes.nome} className="w-10 h-10 object-cover rounded-lg" />
                        ) : (
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center font-bold">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-black text-neutral-800 uppercase tracking-tight">{item.item_detalhes?.nome || 'Item'}</p>
                          <p className="text-[10px] font-mono text-neutral-400">Código: {getProductDisplayCode(item.item_detalhes as any) || item.item_detalhes?.codigo_assinatura || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="purchase-item-price shrink-0 whitespace-nowrap text-right">
                        <p className="text-sm font-black text-neutral-800">{formatCurrency(item.item_detalhes?.valor || 0)}</p>
                        <p className="text-[10px] font-bold text-neutral-400">Qtd: {item.quantidade || 1}</p>
                      </div>
                    </div>
                    {isSupplier && (
                      <div className="bg-amber-50 p-4 rounded-xl border border-amber-200/50 mt-1">
                        <div className="flex items-center gap-2 mb-3">
                          <Store className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">Compra Externa Necessária</span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                          <div>
                            <span className="font-bold text-amber-900/60 block uppercase text-[10px]">Fornecedor</span>
                            <span className="font-medium text-amber-900">{supplierConfigs[item.produto_id].nome_fornecedor || 'N/A'}</span>
                          </div>
                          {supplierConfigs[item.produto_id].tipo_fornecedor === 'loja_fisica' ? (
                            <div>
                              <span className="font-bold text-amber-900/60 block uppercase text-[10px]">Localização</span>
                              <span className="font-medium text-amber-900">
                                {supplierConfigs[item.produto_id].cidade}{supplierConfigs[item.produto_id].estado ? ` / ${supplierConfigs[item.produto_id].estado}` : ''}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="font-bold text-amber-900/60 block uppercase text-[10px]">Link</span>
                              <a href={supplierConfigs[item.produto_id].url_produto || '#'} target="_blank" rel="noreferrer" className="font-medium text-sky-600 hover:underline truncate block">
                                Acessar Produto
                              </a>
                            </div>
                          )}
                          {supplierConfigs[item.produto_id].telefone && (
                            <div className="col-span-2">
                              <span className="font-bold text-amber-900/60 block uppercase text-[10px]">Contato</span>
                              <span className="font-medium text-amber-900">{maskPhone(supplierConfigs[item.produto_id].telefone)}</span>
                            </div>
                          )}
                          {supplierConfigs[item.produto_id].observacoes && (
                            <div className="col-span-2">
                              <span className="font-bold text-amber-900/60 block uppercase text-[10px]">Observações</span>
                              <span className="font-medium text-amber-900 italic">{supplierConfigs[item.produto_id].observacoes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div 
              onClick={() => ordem.produto_id ? handleProductClick(ordem.produto_id) : undefined}
              className={`flex items-center justify-between p-2 -mx-2 rounded-xl transition-all ${ordem.produto_id ? 'cursor-pointer hover:bg-white hover:shadow-sm ring-1 ring-transparent hover:ring-neutral-200' : ''}`}
            >
              <div>
                <p className="text-sm font-black text-neutral-800 uppercase">{ordem.produtos?.nome || 'Item da Loja'}</p>
                <p className="text-[10px] font-mono text-neutral-400" title={ordem.produtos ? getProductDisplayCodeLabel(ordem.produtos as any) : ''}>Código: {ordem.produtos ? getProductDisplayCode(ordem.produtos as any) : 'N/A'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-neutral-800">{formatCurrency(ordem.produtos?.valor || 0)}</p>
                <p className="text-[10px] font-bold text-neutral-400">Qtd: {orcamento?.quantidade || ordem.quantidade || 1}</p>
              </div>
            </div>
          )}
        </div>

        {/* Endereço de Entrega */}
        {orcamento?.endereco_entrega && (
          <div className="rounded-3xl bg-neutral-50 p-6 border border-neutral-200 space-y-3">
            <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] flex items-center gap-1.5"><Truck className="w-4 h-4 text-indigo-500" /> Endereço de Entrega</h4>
            <div className="text-sm font-bold text-neutral-600">
              <p className="text-neutral-800">{orcamento.endereco_entrega.logradouro}, {orcamento.endereco_entrega.numero} {orcamento.endereco_entrega.complemento && `(${orcamento.endereco_entrega.complemento})`}</p>
              <p className="text-neutral-500 text-xs mt-1">{orcamento.endereco_entrega.bairro} - {orcamento.endereco_entrega.cidade}/{orcamento.endereco_entrega.uf}</p>
              <p className="text-neutral-500 text-xs mt-0.5">CEP: {orcamento.endereco_entrega.cep}</p>
            </div>
          </div>
        )}
      </div>

      {/* Coluna 2: Dados Financeiros & Status */}
      <div className="space-y-6">
        {/* Painel Financeiro Detalhado */}
        <div className="rounded-3xl bg-neutral-50 p-6 md:p-8 ring-1 ring-neutral-200 space-y-6">
          <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] border-b border-neutral-200 pb-3">Resumo Financeiro da Ordem</h4>
          
          <div className="space-y-2">
            {(() => {
              const total = Number(orcamento?.total || 0);
              const desconto = Number(orcamento?.desconto || 0);
              const taxaEnt = Number(orcamento?.taxa_entrega || 0);
              const acrescimo = Number(orcamento?.acrescimo || 0);
              // Subtotal = total antes de desconto, acrescimo e taxa de entrega
              const subtotalItens = total + desconto - taxaEnt - acrescimo;
              return (
                <>
                  <div className="flex justify-between text-sm font-medium text-neutral-500">
                    <span>Subtotal dos Itens</span>
                    <span>{formatCurrency(subtotalItens)}</span>
                  </div>
                  {(taxaEnt > 0 || !!orcamento?.endereco_entrega || relatedItems.some((item: any) => item.tipo === 'produto')) && (
                    <div className="flex justify-between text-sm font-medium text-neutral-500">
                      <span>Frete Total</span>
                      <span className={taxaEnt === 0 ? "text-emerald-600 font-bold" : ""}>
                        {taxaEnt > 0 ? formatCurrency(taxaEnt) : 'Grátis'}
                      </span>
                    </div>
                  )}
                  {(desconto - (walletDiscount || 0)) > 0 && (() => {
                    const realDesconto = Math.max(0, desconto - (walletDiscount || 0));
                    const currentPointsDiscount = pointsDiscount > 0 
                      ? pointsDiscount 
                      : (orcamento?.cupom_desconto_id ? 0 : realDesconto);

                    const couponDiscountValue = Math.max(0, realDesconto - currentPointsDiscount);

                    return (
                      <div className="space-y-1.5 bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 my-2">
                        <div className="flex justify-between text-sm font-black text-emerald-800">
                          <span>Descontos Aplicados</span>
                          <span>-{formatCurrency(realDesconto)}</span>
                        </div>
                        
                        {currentPointsDiscount > 0 && (
                          <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                            <span>Carteira de Pontos ({Math.round(currentPointsDiscount * 100)} pts)</span>
                            <span>-{formatCurrency(currentPointsDiscount)}</span>
                          </div>
                        )}

                        {couponDiscountValue > 0 && (
                          <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                            <span>Cupom: {couponCode || 'Desconto'}</span>
                            <span>-{formatCurrency(couponDiscountValue)}</span>
                          </div>
                        )}

                        {orcamento?.cupom_entrega_id && (
                          <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                            <span>Cupom Frete</span>
                            <span>Frete Grátis</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(walletDiscount || 0) > 0 && (
                    <div className="flex justify-between text-sm font-medium text-neutral-500">
                      <span>Saldo da Carteira</span>
                      <span className="text-emerald-600 font-bold">-{formatCurrency(walletDiscount || 0)}</span>
                    </div>
                  )}
                  {acrescimo > 0 && (
                    <div className="flex justify-between text-sm font-bold text-amber-600">
                      <span>Juros do Crédito GSA</span>
                      <span>+{formatCurrency(acrescimo)}</span>
                    </div>
                  )}
                  <div className="pt-4 border-t border-neutral-100 flex justify-between items-center">
                    <span className="text-base font-black text-[#1a1a1a]">Total Geral</span>
                    <span className="text-2xl font-black text-indigo-600">{formatCurrency(total)}</span>
                  </div>

                  {(() => {
                    const isCreditoLoja = isGsaCredit;

                    if (isCreditoLoja) {
                      return (
                        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                          <div className="flex items-center justify-between text-xs font-black text-emerald-800 uppercase tracking-wider">
                            <span>Forma de Pagamento:</span>
                            <span className="bg-emerald-100 px-2.5 py-1 rounded-full text-[10px] border border-emerald-300 font-bold">
                              Crédito GSA Store ({orcamento?.parcelas_credito || faturasCredito.length || 1}x)
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-emerald-700 leading-normal font-semibold">
                            ✨ O pagamento via <strong>Crédito GSA Store</strong> foi aprovado.
                            {faturasCredito.length > 0 ? (
                              <> Foram vinculadas <strong>{faturasCredito.length} faturas</strong> de amortização para este crédito.</>
                            ) : (
                              <> As parcelas de amortização foram registradas na conta de crédito do cliente.</>
                            )}
                          </div>

                          {faturasCredito.length > 0 && (
                            <div className="space-y-2.5 pt-2 border-t border-emerald-100/50">
                              <span className="text-[9px] font-black text-emerald-900 uppercase tracking-wider block mb-2">Faturas de Amortização Geradas</span>
                              {faturasCredito.map((fat, idx) => (
                                <div key={fat.id} className="flex justify-between items-center p-3 text-xs text-emerald-800 font-medium bg-white/80 border border-emerald-100/40 rounded-xl shadow-sm mb-1.5">
                                  <span>{idx + 1}ª Parcela ({fat.codigo_fatura || `Parcela ${idx+1}`})</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-neutral-800">{formatCurrency(fat.valor_total)}</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                      fat.status === 'pago' ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' : 'bg-orange-100 text-orange-800 border border-orange-200'
                                    }`}>
                                      {fat.status === 'pago' ? 'Pago' : 'Pendente'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (fatura?.pagamentos && fatura.pagamentos.length > 0) {
                      return (
                        <div className="mt-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                          <div className="flex items-center justify-between text-xs font-black text-indigo-900 uppercase tracking-wider mb-2">
                            <span>Forma de Pagamento (Módulo Financeiro):</span>
                          </div>
                          
                          <div className="space-y-2">
                            {fatura.pagamentos.map((pag: any, idx: number) => {
                              let label = pag.metodo.toUpperCase();
                              let badgeColors = 'bg-neutral-100 text-neutral-800 border-neutral-200';
                              
                              if (pag.metodo === 'pix') { label = 'PIX'; badgeColors = 'bg-teal-100 text-teal-800 border-teal-200'; }
                              else if (pag.metodo === 'credit_card' || pag.metodo === 'cartao') { label = 'CARTÃO DE CRÉDITO'; badgeColors = 'bg-blue-100 text-blue-800 border-blue-200'; }
                              else if (pag.metodo === 'voucher') { label = 'VOUCHER'; badgeColors = 'bg-purple-100 text-purple-800 border-purple-200'; }
                              else if (pag.metodo === 'carteira') { label = 'SALDO CARTEIRA'; badgeColors = 'bg-amber-100 text-amber-800 border-amber-200'; }
                              else if (pag.metodo === 'pontos') { label = 'PONTOS FIDELIDADE'; badgeColors = 'bg-emerald-100 text-emerald-800 border-emerald-200'; }
                              else if (pag.metodo === 'boleto') { label = 'BOLETO BANCÁRIO'; badgeColors = 'bg-orange-100 text-orange-800 border-orange-200'; }

                              return (
                                <div key={idx} className="flex justify-between items-center text-sm font-semibold text-neutral-800 bg-white p-2 rounded-xl shadow-sm border border-neutral-100">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${badgeColors}`}>
                                    {label}
                                  </span>
                                  <span>{formatCurrency(pag.valor)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    const formaLoja = orcamento?.forma_pagamento_loja;
                    const formaLabel = formaLoja === 'pix' ? 'PIX'
                      : formaLoja === 'cartao' ? 'CARTÃO DE CRÉDITO'
                      : formaLoja === 'boleto' ? 'BOLETO BANCÁRIO'
                      : formaLoja === 'carteira' ? 'SALDO CARTEIRA'
                      : formaLoja === 'pontos' ? 'PONTOS FIDELIDADE'
                      : (['pago', 'em_expedicao', 'em_transporte', 'concluido'].includes(ordem.status) || !!(ordem?.motivo_cancelamento || fatura?.status === 'pago'))
                        ? 'SALDO CARTEIRA/PONTOS'
                        : 'Não definida';

                    return (
                      <div className="mt-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1">
                        <div className="flex items-center justify-between text-xs font-black text-neutral-700 uppercase tracking-wider">
                          <span>Forma de Pagamento:</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            formaLabel !== 'Não definida' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-neutral-100 text-neutral-500'
                          }`}>
                            {formaLabel}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-400 font-semibold mt-2">
                          {formaLabel !== 'Não definida'
                            ? `Pagamento processado via ${formaLabel.toLowerCase()}.`
                            : 'Pagamento a ser verificado mediante fatura convencional gerada pelo sistema.'}
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        </div>

        {/* Painel de Ações de Entrega & Status */}
        <div className="rounded-3xl bg-indigo-50/50 p-6 md:p-8 border border-indigo-100 space-y-6">
          <h4 className="text-xs font-black text-indigo-900 uppercase tracking-[0.2em] flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-600" /> Status da Compra & Logística</h4>

          {/* Fatura */}
          {fatura && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500 font-bold">Fatura de Venda:</span>
              <span className={`rounded-full px-3 py-0.5 text-xs font-black uppercase ${
                isPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}>
                {fatura.codigo_fatura} ({fatura.status === 'pago' ? 'Pago' : 'Aguardando Pagamento'})
              </span>
            </div>
          )}

          {/* Seletor de Status (Liberado apenas quando pago) */}
          {isPaid ? (
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-black text-[#1a1a1a] uppercase tracking-wider">Mudar Status de Entrega do Cliente</label>
              <select
                value={pendingStatus || (ordem.status === 'aprovado' ? 'pago' : ordem.status)}
                disabled={ordem.status === 'concluido' || confirmingStatus || !onUpdateStatus}
                onChange={(e) => {
                  if (onUpdateStatus) {
                    setTrackable(Boolean(ordem.entrega_rastreavel));
                    setTrackingCode(ordem.codigo_rastreio || '');
                    setPendingStatus(e.target.value as typeof pendingStatus);
                  }
                }}
                className="w-full bg-white rounded-xl border border-indigo-200 px-4 py-3 text-xs font-black text-neutral-800 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all uppercase tracking-wider disabled:bg-neutral-50 disabled:text-neutral-400 disabled:border-neutral-200 disabled:cursor-not-allowed"
              >
                <option value="pago" disabled={!['em_analise','pago','aprovado'].includes(ordem.status)}>📦 Pedido Aprovado (Pago)</option>
                <option value="em_expedicao" disabled={!['em_analise','pago','aprovado','em_expedicao'].includes(ordem.status)}>📦 Em Expedição</option>
                <option value="em_transporte" disabled={!['em_expedicao','em_transporte'].includes(ordem.status)}>🚚 Em Transporte</option>
                <option value="concluido" disabled={!['em_transporte','concluido'].includes(ordem.status)}>✅ Pedido Entregue</option>
              </select>
              <p className="text-[10px] text-neutral-500 leading-normal">
                Ao alterar este status, o cliente será avisado em tempo real em seu painel de compras e receberá notificação no sistema.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <p className="text-xs text-amber-800 font-bold leading-normal">
                🔒 O controle de status de logística está bloqueado até que o pagamento da fatura seja confirmado.
              </p>
            </div>
          )}

          {/* Botões de Ação Gerais (Cancelar / Concluir) */}
          {showActions && (
            <div className="flex gap-4 pt-4 border-t border-indigo-100/80">
              {onCancelClick && (
                <button 
                  onClick={onCancelClick}
                  className="flex-1 rounded-2xl bg-red-50 hover:bg-red-100 py-3.5 text-red-600 font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancelar Ordem
                </button>
              )}
              {onDeleteClick && (
                <button 
                  onClick={onDeleteClick}
                  title="Excluir Ordem em Cascata (Administrador Master)"
                  className="flex-1 rounded-2xl bg-red-600 hover:bg-red-700 py-3.5 text-white font-black text-xs uppercase tracking-widest shadow-md shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Ordem
                </button>
              )}
              {ordem.clientes?.telefone && (
                <div className="flex items-center justify-center scale-90 origin-left">
                  <AdminWhatsAppButton
                    telefone={ordem.clientes.telefone}
                    mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'venda',
                      clienteNome: ordem.clientes.nome,
                      codigo: ordem.codigo_ordem || `#OC-${ordem.id.slice(0, 4).toUpperCase()}`,
                      status: ordem.status,
                      valorTotal: formatCurrency(ordem.orcamentos?.total ?? (ordem.produtos?.valor || 0))
                    })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Observações Administrativas */}
      <div className="col-span-1 lg:col-span-2 mt-4 rounded-3xl bg-neutral-50 p-6 md:p-8 ring-1 ring-neutral-200">
        <h4 className="text-xs font-black text-indigo-900 uppercase tracking-[0.2em] flex items-center gap-1.5 mb-4">
          <Save className="w-4 h-4 text-indigo-600" /> Observações Administrativas Internas
        </h4>
        <p className="text-[10px] text-neutral-500 mb-4">Este campo é exclusivo para o administrativo e persistirá ao longo de todas as etapas do pedido.</p>
        <div className="relative">
          <textarea
            value={observacoesInternas}
            onChange={(e) => setObservacoesInternas(e.target.value)}
            placeholder="Adicione observações internas do pedido..."
            className="w-full h-32 bg-white rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-all"
          />
          <button
            onClick={handleSaveObservacoes}
            disabled={savingObs || observacoesInternas === (ordem.observacoes_internas || '')}
            className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingObs ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Modal Detalhes do Produto */}
      <Modal isOpen={isProdutoModalOpen} onClose={() => setIsProdutoModalOpen(false)} title="Detalhes do Produto" size="wide">
        {selectedProdutoDetalhe && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="flex h-20 w-20 overflow-hidden items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0 border border-neutral-200">
                    {selectedProdutoDetalhe.imagem_url ? (
                      <img src={selectedProdutoDetalhe.imagem_url} alt={selectedProdutoDetalhe.nome} className="h-full w-full object-contain" />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-indigo-300" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${selectedProdutoDetalhe.tipo_cliente === 'pf' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                        {selectedProdutoDetalhe.tipo_cliente === 'pf' ? <User className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                        {selectedProdutoDetalhe.tipo_cliente === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                      </span>
                      <span className="font-mono text-sm font-bold text-neutral-400" title={getProductDisplayCodeLabel(selectedProdutoDetalhe)}>{getProductDisplayCode(selectedProdutoDetalhe)}</span>
                    </div>
                    <h3 className="text-2xl font-bold text-neutral-900">{selectedProdutoDetalhe.nome}</h3>
                  </div>
                </div>
              </div>

              {selectedProdutoDetalhe.categorias?.nome && (
                <span className="inline-block mt-2 rounded-lg bg-neutral-200/60 px-3 py-1 text-xs font-bold text-neutral-600 uppercase tracking-wider">
                  Categoria: {selectedProdutoDetalhe.categorias.nome}
                </span>
              )}
              
              <p className="mt-4 text-sm text-neutral-600">{selectedProdutoDetalhe.descricao || 'Sem descrição disponível.'}</p>
              
              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-neutral-200 pt-6">
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Custo</p>
                  <p className="text-xl font-black text-neutral-500">{formatCurrency(selectedProdutoDetalhe.valor_custo || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Margem / Lucro</p>
                  <p className="text-xl font-black text-emerald-600">
                    +{selectedProdutoDetalhe.porcentagem_lucro || 0}% 
                    <span className="text-[10px] ml-1 text-neutral-400">({formatCurrency((selectedProdutoDetalhe.valor || 0) - (selectedProdutoDetalhe.valor_custo || 0))})</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Venda (Final)</p>
                  <p className="text-2xl font-black text-indigo-600">{formatCurrency(selectedProdutoDetalhe.valor)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  FileText,
  FileUp,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  generateUUID,
  maskCEP,
  maskCNPJ,
  maskCPF,
  maskPhone,
} from '../../lib/utils';
import {
  createAdminSupplierOrder,
  getAdminSupplierSnapshot,
  getAdminSupplierFinancialAnomalies,
  notifySupplierPortal,
  resolveSupplierDocument,
  reviewAdminSupplierDelivery,
  reviewAdminSupplierBankChange,
  reviewAdminSupplierProduct,
  setAdminSupplierStatus,
  updateAdminSupplierPayable,
  uploadAdminSupplierPaymentProof,
} from '../../lib/supplierOperations';
import { navigate } from '../../routing/navigationService';
import { useAppLocation } from '../../routing/useAppLocation';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import type { AdminSupplierSnapshot } from '../../types/supplier';

type Tab = 'cadastros' | 'produtos' | 'pedidos' | 'entregas' | 'contas';
type ProductAction = 'aprovar' | 'ajuste' | 'rejeitar';
type DeliveryAction = 'aprovar' | 'ajuste' | 'rejeitar';

const EMPTY: AdminSupplierSnapshot = {
  suppliers: [],
  requests: [],
  supplier_products: [],
  orders: [],
  deliveries: [],
  payables: [],
  products: [],
};

const TABS: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
  { id: 'cadastros', label: 'Cadastros', icon: Building2 },
  { id: 'produtos', label: 'Produtos', icon: PackageCheck },
  { id: 'pedidos', label: 'Pedidos de compra', icon: ShoppingCart },
  { id: 'entregas', label: 'Entregas e NFs', icon: Truck },
  { id: 'contas', label: 'Contas a pagar', icon: WalletCards },
];

export function FornecedoresModule({ initialTab }: { initialTab?: string }) {
  const route = useAppLocation();
  const [tab, setTab] = useState<Tab>((TABS.some((item) => item.id === initialTab) ? initialTab : 'cadastros') as Tab);
  const [snapshot, setSnapshot] = useState<AdminSupplierSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [approval, setApproval] = useState<any | null>(null);
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [bankReason, setBankReason] = useState('');
  const [financialAnomalies, setFinancialAnomalies] = useState<Array<Record<string, any>>>([]);
  const [orderOpen, setOrderOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [orderItems, setOrderItems] = useState<Array<{ fornecedor_produto_id: string; quantidade: string; custo_unitario: string }>>([]);
  const [orderMeta, setOrderMeta] = useState({ previsao_entrega: '', vencimento_previsto: '', condicao_pagamento: '', observacoes: '' });
  const [productReview, setProductReview] = useState<{ request: any; action: ProductAction } | null>(null);
  const [productReason, setProductReason] = useState('');
  const [saleValue, setSaleValue] = useState('');
  const [deliveryReview, setDeliveryReview] = useState<{ delivery: any; action: DeliveryAction } | null>(null);
  const [deliveryReason, setDeliveryReason] = useState('');
  const [payment, setPayment] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialTab && TABS.some((item) => item.id === initialTab)) setTab(initialTab as Tab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSnapshot, anomalies] = await Promise.all([
        getAdminSupplierSnapshot(),
        getAdminSupplierFinancialAnomalies(),
      ]);
      setSnapshot(nextSnapshot);
      setFinancialAnomalies(anomalies || []);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar fornecedores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeSubscription([
    { table: 'fornecedores', onChange: load, debounceMs: 300 },
    { table: 'ordens_compra', onChange: load, debounceMs: 300 },
    { table: 'produto_fornecedor_config', onChange: load, debounceMs: 300 },
    { table: 'produtos', onChange: load, debounceMs: 300 },
    { table: 'fornecedor_produtos', onChange: load, debounceMs: 300 },
    { table: 'fornecedor_pedidos', onChange: load, debounceMs: 300 },
    { table: 'fornecedor_entregas', onChange: load, debounceMs: 300 },
    { table: 'fornecedor_documentos', onChange: load, debounceMs: 300 },
  ]);

  useEffect(() => {
    if (route.module !== 'fornecedores' || route.submodule !== 'cadastros' || !route.itemId || loading) return;
    const supplier = snapshot.suppliers.find((item) => item.id === route.itemId);
    if (supplier && approval?.id !== supplier.id) {
      setTab('cadastros');
      setApproval(supplier);
      setPin('');
      setReason('');
    }
  }, [approval?.id, loading, route.itemId, route.module, route.submodule, snapshot.suppliers]);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return snapshot.suppliers.filter((item) => !term || [item.razao_social, item.nome_fantasia, item.documento, item.codigo]
      .some((value) => String(value || '').toLowerCase().includes(term)));
  }, [search, snapshot.suppliers]);

  const activeSuppliers = snapshot.suppliers.filter((item) => item.status === 'ativo');
  const availableLinks = snapshot.supplier_products.filter((item) => item.fornecedor_id === supplierId && item.status === 'ativo');

  const changeSupplierStatus = async (status: string) => {
    if (!approval) return;
    if (status === 'ativo' && !/^\d{4}$/.test(pin)) return toast.error('Informe um PIN de quatro dígitos.');
    if (status !== 'ativo' && reason.trim().length < 3) return toast.error('Informe o motivo da alteração.');
    setSaving(true);
    try {
      await setAdminSupplierStatus(approval.id, status, reason, status === 'ativo' ? pin : undefined);
      toast.success(status === 'ativo' ? 'Fornecedor aprovado e acesso liberado.' : 'Status atualizado.');
      setApproval(null);
      setPin('');
      setReason('');
      navigate('/admin/fornecedores/cadastros');
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  const reviewBankChange = async (approve: boolean) => {
    if (!approval) return;
    if (!approve && bankReason.trim().length < 3) return toast.error('Informe o motivo da recusa.');
    setSaving(true);
    try {
      await reviewAdminSupplierBankChange(approval.id, approve, bankReason);
      toast.success(approve ? 'Dados bancários aprovados.' : 'Alteração bancária recusada.');
      setBankReason('');
      setApproval(null);
      await load();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível revisar os dados bancários.'); }
    finally { setSaving(false); }
  };

  const openProductReview = (request: any, action: ProductAction) => {
    setProductReview({ request, action });
    setProductReason('');
    setSaleValue(String(request.custo_unitario || 0));
  };

  const submitProductReview = async () => {
    if (!productReview) return;
    const { request, action } = productReview;
    if (action !== 'aprovar' && productReason.trim().length < 3) return toast.error('Informe o motivo.');
    if (action === 'aprovar' && request.tipo === 'novo' && (!saleValue.trim() || Number(saleValue.replace(',', '.')) < 0)) {
      return toast.error('Informe um valor de venda válido.');
    }
    setSaving(true);
    try {
      const payload = action === 'aprovar' && request.tipo === 'novo'
        ? { valor_venda: Number(saleValue.replace(',', '.')), visivel_na_loja: false }
        : {};
      await reviewAdminSupplierProduct(request.id, action, productReason, payload);
      await notifySupplierPortal(request.fornecedor_id);
      toast.success(action === 'aprovar' ? 'Produto aprovado.' : action === 'ajuste' ? 'Ajuste solicitado ao fornecedor.' : 'Produto reprovado.');
      setProductReview(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível analisar o produto.');
    } finally {
      setSaving(false);
    }
  };

  const openOrder = () => {
    setSupplierId(activeSuppliers[0]?.id || '');
    setOrderItems([]);
    setOrderMeta({ previsao_entrega: '', vencimento_previsto: '', condicao_pagamento: '', observacoes: '' });
    setOrderOpen(true);
  };

  const addOrderItem = () => {
    const first = availableLinks.find((link) => !orderItems.some((item) => item.fornecedor_produto_id === link.id));
    if (!first) return toast.error('Não há outro produto aprovado para adicionar.');
    setOrderItems((current) => [...current, {
      fornecedor_produto_id: first.id,
      quantidade: '1',
      custo_unitario: String(first.custo_unitario || 0),
    }]);
  };

  const createOrder = async () => {
    if (!supplierId || orderItems.length === 0) return toast.error('Selecione o fornecedor e ao menos um produto.');
    if (orderItems.some((item) => Number(item.quantidade) <= 0 || Number(item.custo_unitario) < 0)) return toast.error('Revise quantidades e custos.');
    setSaving(true);
    try {
      await createAdminSupplierOrder(generateUUID(), supplierId, {
        ...orderMeta,
        items: orderItems.map((item) => ({
          ...item,
          quantidade: Number(item.quantidade),
          custo_unitario: Number(item.custo_unitario),
        })),
      });
      toast.success('Pedido enviado ao portal do fornecedor.');
      setOrderOpen(false);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível criar o pedido.');
    } finally {
      setSaving(false);
    }
  };

  const openDeliveryReview = (delivery: any, action: DeliveryAction) => {
    setDeliveryReview({ delivery, action });
    setDeliveryReason('');
  };

  const submitDeliveryReview = async () => {
    if (!deliveryReview) return;
    const { delivery, action } = deliveryReview;
    if (action !== 'aprovar' && deliveryReason.trim().length < 3) return toast.error('Informe o motivo.');
    setSaving(true);
    try {
      const result: any = await reviewAdminSupplierDelivery(delivery.id, action, deliveryReason);
      await notifySupplierPortal(delivery.fornecedor_id);
      toast.success(
        result?.already_processed
          ? 'Esta entrega já havia sido aprovada.'
          : action === 'aprovar'
            ? 'NF aprovada, estoque liberado e conta a pagar criada.'
            : action === 'ajuste'
              ? 'Ajuste solicitado ao fornecedor.'
              : 'Entrega reprovada.',
      );
      setDeliveryReview(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível analisar a entrega.');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = async (reference: string) => {
    try {
      window.open(await resolveSupplierDocument(reference), '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o documento.');
    }
  };

  const openPayment = (payable: any) => {
    setPayment(payable);
    setPaymentMethod('PIX');
    setPaymentNotes('');
    setPaymentProof(null);
  };

  const submitPayment = async () => {
    if (!payment) return;
    if (paymentMethod.trim().length < 2) return toast.error('Informe a forma de pagamento.');
    if (!paymentProof) return toast.error('Anexe o comprovante do pagamento.');
    setSaving(true);
    try {
      const proofReference = await uploadAdminSupplierPaymentProof(paymentProof, payment.fornecedor_id, payment.id);
      await updateAdminSupplierPayable(payment.id, 'pagar', {
        forma_pagamento: paymentMethod.trim(),
        comprovante: proofReference,
        observacoes: paymentNotes.trim() || null,
      });
      await notifySupplierPortal(payment.fornecedor_id);
      toast.success('Pagamento confirmado e comprovante registrado.');
      setPayment(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível baixar a conta.');
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = snapshot.suppliers.filter((item) => ['pendente', 'em_analise', 'ajuste_solicitado'].includes(item.status)).length;
  const pendingDeliveries = snapshot.deliveries.filter((item) => ['em_analise', 'ajuste_solicitado'].includes(item.status)).length;
  const pendingPayables = snapshot.payables
    .filter((item) => ['pendente', 'vencido'].includes(item.status))
    .reduce((sum, item) => sum + Number(item.valor_pendente || 0), 0);

  const paymentSupplier = payment
    ? snapshot.suppliers.find((item) => item.id === payment.fornecedor_id)
    : null;
  const paymentBank = paymentSupplier?.dados_bancarios || {};

  return (
    <div className="space-y-6 pb-10">
      <header className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-xl">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">GSA Produtos</p>
            <h1 className="mt-2 text-3xl font-black">Fornecedores e abastecimento</h1>
            <p className="mt-2 text-sm text-white/60">Da aprovação cadastral à entrada auditada no estoque e contas a pagar.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="rounded-xl bg-white/10 p-3" aria-label="Atualizar"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={openOrder} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-neutral-950"><Plus className="h-4 w-4" />Novo pedido</button>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Cadastros pendentes" value={pendingCount} />
        <Metric label="NFs em análise" value={pendingDeliveries} />
        <Metric label="Contas pendentes" value={formatCurrency(pendingPayables)} />
      </div>

      {financialAnomalies.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-black">Conciliação financeira pendente</p>
          <p className="mt-1">${financialAnomalies.length} registro(s) histórico(s) possuem divergência entre pedido, itens, NF ou conta a pagar. Nenhum valor histórico foi alterado automaticamente.</p>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-neutral-100 p-1">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => { setTab(item.id); navigate(`/admin/fornecedores/${item.id}`); }}
              className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black ${tab === item.id ? 'bg-white text-neutral-950 shadow-sm' : 'text-neutral-500'}`}
            >
              <Icon className="h-4 w-4" />{item.label}
            </button>
          );
        })}
      </div>

      {tab === 'cadastros' && (
        <section className="space-y-4">
          <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar fornecedor, documento ou código" className="w-full rounded-xl border border-neutral-200 py-3 pl-11 pr-4" /></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredSuppliers.map((supplier) => (
              <article key={supplier.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <Status value={supplier.status} />
                    <h2 className="mt-3 font-black">{supplier.nome_fantasia || supplier.razao_social}</h2>
                    <p className="mt-1 text-sm text-neutral-500">{supplier.razao_social} · {supplier.documento}</p>
                    <p className="mt-1 text-xs text-neutral-400">{supplier.responsavel_nome} · {supplier.email}</p>
                    {supplier.motivo_status && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{supplier.motivo_status}</p>}
                    {supplier.dados_bancarios_pendentes && <p className="mt-2 rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs font-black text-purple-800">Dados bancários aguardando análise.</p>}
                  </div>
                  <Building2 className="h-8 w-8 text-neutral-200" />
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => { setApproval(supplier); setPin(''); setReason(''); navigate(`/admin/fornecedores/cadastros/${supplier.id}`); }} className="flex-1 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-black text-white">Analisar</button>
                  {supplier.status === 'ativo' && <button type="button" onClick={() => { setApproval(supplier); setPin(''); setReason(''); }} className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-700">Suspender</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'produtos' && (
        <ListEmpty loading={loading} empty={snapshot.requests.length === 0} message="Nenhuma solicitação de produto.">
          <div className="space-y-3">
            {snapshot.requests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-neutral-200 p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <Status value={request.status} />
                    <h2 className="mt-2 font-black">{request.tipo === 'existente' ? request.produto_existente_nome : request.nome}</h2>
                    <p className="text-sm text-neutral-500">{request.fornecedor_nome} · {request.tipo === 'novo' ? 'Novo produto' : 'Produto existente'} · custo {formatCurrency(Number(request.custo_unitario || 0))}</p>
                    {request.motivo_analise && <p className="mt-2 text-xs font-semibold text-amber-700">{request.motivo_analise}</p>}
                  </div>
                  {!['aprovado', 'reprovado'].includes(request.status) && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openProductReview(request, 'rejeitar')} className="rounded-xl bg-red-50 px-4 py-2 text-xs font-black text-red-700">Reprovar</button>
                      <button type="button" onClick={() => openProductReview(request, 'ajuste')} className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-black text-amber-900">Solicitar ajuste</button>
                      <button type="button" onClick={() => openProductReview(request, 'aprovar')} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Aprovar</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </ListEmpty>
      )}

      {tab === 'pedidos' && (
        <ListEmpty loading={loading} empty={snapshot.orders.length === 0} message="Nenhum pedido de compra.">
          <div className="space-y-3">
            {snapshot.orders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-neutral-200 p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row">
                  <div><Status value={order.status} /><h2 className="mt-2 font-black">{order.codigo} · {order.fornecedor_nome}</h2><p className="text-sm text-neutral-500">{order.items?.length || 0} produto(s) · previsto {formatCurrency(Number(order.valor_total_previsto || 0))}</p><p className="mt-1 text-xs text-neutral-400">Criado em {formatDateTime(order.created_at)}</p></div>
                  <div className="md:text-right"><p className="text-[10px] font-black uppercase text-neutral-400">Previsão</p><p className="font-bold">{order.previsao_entrega ? formatDate(order.previsao_entrega) : 'Não informada'}</p></div>
                </div>
              </article>
            ))}
          </div>
        </ListEmpty>
      )}

      {tab === 'entregas' && (
        <ListEmpty loading={loading} empty={snapshot.deliveries.length === 0} message="Nenhuma entrega informada.">
          <div className="space-y-3">
            {snapshot.deliveries.map((delivery) => (
              <article key={delivery.id} className="rounded-2xl border border-neutral-200 p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row">
                  <div>
                    <Status value={delivery.status} />
                    <h2 className="mt-2 font-black">NF {delivery.numero_nota} · {delivery.fornecedor_nome}</h2>
                    <p className="text-sm text-neutral-500">Pedido {delivery.pedido_codigo} · {formatCurrency(Number(delivery.valor_total_nota || 0))} · emissão {formatDate(delivery.data_emissao)}</p>
                    <p className="mt-1 text-xs text-neutral-400">{delivery.items?.length || 0} item(ns) · enviada {formatDateTime(delivery.created_at)}</p>
                    {delivery.motivo_analise && <p className="mt-2 text-xs font-semibold text-amber-700">{delivery.motivo_analise}</p>}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {delivery.arquivo_xml && <button type="button" onClick={() => void openDocument(delivery.arquivo_xml)} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">Abrir XML</button>}
                    {delivery.arquivo_pdf && <button type="button" onClick={() => void openDocument(delivery.arquivo_pdf)} className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">Abrir PDF</button>}
                    {['em_analise', 'ajuste_solicitado'].includes(delivery.status) && (
                      <>
                        <button type="button" onClick={() => openDeliveryReview(delivery, 'rejeitar')} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">Reprovar</button>
                        <button type="button" onClick={() => openDeliveryReview(delivery, 'ajuste')} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-900">Solicitar ajuste</button>
                        <button type="button" onClick={() => openDeliveryReview(delivery, 'aprovar')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Aprovar NF e estoque</button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </ListEmpty>
      )}

      {tab === 'contas' && (
        <ListEmpty loading={loading} empty={snapshot.payables.length === 0} message="Nenhuma conta a pagar de fornecedor.">
          <div className="overflow-x-auto rounded-2xl border border-neutral-200">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-400"><tr><th className="p-4">Documento</th><th className="p-4">Fornecedor</th><th className="p-4">Vencimento</th><th className="p-4">Valor</th><th className="p-4">Status</th><th className="p-4">Comprovante</th><th className="p-4"></th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {snapshot.payables.map((item) => (
                  <tr key={item.id}>
                    <td className="p-4 font-black">{item.numero_documento}</td>
                    <td className="p-4">{item.fornecedor_nome}</td>
                    <td className="p-4">{formatDate(item.data_vencimento)}</td>
                    <td className="p-4 font-black">{formatCurrency(Number(item.valor_pendente || item.valor_original || 0))}</td>
                    <td className="p-4"><Status value={item.status} /></td>
                    <td className="p-4">{item.comprovante ? <button type="button" onClick={() => void openDocument(item.comprovante)} className="font-black text-indigo-700">Abrir</button> : '—'}</td>
                    <td className="p-4">{!['pago', 'cancelado'].includes(item.status) && <button type="button" onClick={() => openPayment(item)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white">Confirmar pagamento</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListEmpty>
      )}

      <Modal isOpen={Boolean(approval)} onClose={() => { if (!saving) { setApproval(null); navigate('/admin/fornecedores/cadastros'); } }} title="Analisar cadastro do fornecedor" size="2xl">
        {approval && (() => {
          const isPj = approval.tipo_pessoa === 'pj';
          const formattedDoc = isPj ? maskCNPJ(approval.documento) : maskCPF(approval.documento);
          const bank = approval.dados_bancarios || {};
          const pendingBank = approval.dados_bancarios_pendentes || null;

          const statusBadge = {
            pendente: { bg: 'bg-amber-100 text-amber-900 border-amber-300', label: 'Pendente de Análise' },
            em_analise: { bg: 'bg-blue-100 text-blue-900 border-blue-300', label: 'Em Análise' },
            ajuste_solicitado: { bg: 'bg-orange-100 text-orange-900 border-orange-300', label: 'Ajuste Solicitado' },
            ativo: { bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', label: 'Ativo / Aprovado' },
            suspenso: { bg: 'bg-purple-100 text-purple-900 border-purple-300', label: 'Suspenso' },
            reprovado: { bg: 'bg-red-100 text-red-900 border-red-300', label: 'Reprovado' }
          }[approval.status as string] || { bg: 'bg-neutral-100 text-neutral-800 border-neutral-300', label: approval.status };

          return (
            <div className="space-y-6">
              {/* Banner Superior com Identificação Principal */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-black uppercase ${statusBadge.bg}`}>
                        {statusBadge.label}
                      </span>
                      {approval.id && (
                        <span className="text-xs font-semibold text-neutral-400">
                          ID: {approval.id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-xl font-black text-neutral-900">
                      {approval.razao_social || approval.nome_fantasia || 'Sem nome registrado'}
                    </h3>
                    {approval.nome_fantasia && approval.nome_fantasia !== approval.razao_social && (
                      <p className="text-sm font-medium text-neutral-600">
                        Nome Fantasia: <span className="font-bold text-neutral-800">{approval.nome_fantasia}</span>
                      </p>
                    )}
                  </div>

                  <div className="text-right text-xs text-neutral-500">
                    <p>Cadastrado em:</p>
                    <p className="font-bold text-neutral-800">{formatDateTime(approval.created_at)}</p>
                  </div>
                </div>
              </div>

              {/* Grid de Seções com Informações Cadastrais */}
              <div className="grid gap-4 md:grid-cols-2">

                {/* 1. Dados Identificadores & Empresa */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-neutral-100 pb-2.5">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">Dados da Empresa / Pessoa</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="block text-neutral-400 font-medium">Tipo de Pessoa</span>
                      <span className="font-black text-neutral-800 uppercase">{approval.tipo_pessoa === 'pj' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)'}</span>
                    </div>

                    <div>
                      <span className="block text-neutral-400 font-medium">{isPj ? 'CNPJ' : 'CPF'}</span>
                      <span className="font-black text-neutral-900">{formattedDoc || approval.documento || '—'}</span>
                    </div>

                    <div className="col-span-2">
                      <span className="block text-neutral-400 font-medium">Razão Social / Nome Completo</span>
                      <span className="font-bold text-neutral-900">{approval.razao_social || '—'}</span>
                    </div>

                    {approval.nome_fantasia && (
                      <div className="col-span-2">
                        <span className="block text-neutral-400 font-medium">Nome Fantasia</span>
                        <span className="font-bold text-neutral-900">{approval.nome_fantasia}</span>
                      </div>
                    )}

                    <div>
                      <span className="block text-neutral-400 font-medium">Inscrição Estadual</span>
                      <span className="font-bold text-neutral-900">{approval.inscricao_estadual || 'Não informada'}</span>
                    </div>

                    <div>
                      <span className="block text-neutral-400 font-medium">Responsável Legal</span>
                      <span className="font-bold text-neutral-900">{approval.responsavel_nome || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Contato & Endereço */}
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-neutral-100 pb-2.5">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">Contato & Localização</h4>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                      <div>
                        <span className="block text-[10px] text-neutral-400 font-medium">E-mail Principal</span>
                        <span className="font-bold text-neutral-900 select-all">{approval.email || '—'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                      <div>
                        <span className="block text-[10px] text-neutral-400 font-medium">Telefone / WhatsApp</span>
                        <span className="font-bold text-neutral-900">{maskPhone(approval.telefone) || '—'}</span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-neutral-100 grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-neutral-400 font-medium">CEP</span>
                        <span className="font-bold text-neutral-900">{maskCEP(approval.cep) || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-neutral-400 font-medium">Cidade / UF</span>
                        <span className="font-bold text-neutral-900">
                          {approval.cidade && approval.estado ? `${approval.cidade} / ${approval.estado}` : approval.cidade || approval.estado || '—'}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="block text-neutral-400 font-medium">Endereço</span>
                        <span className="font-bold text-neutral-900">
                          {approval.endereco ? `${approval.endereco}${approval.numero ? `, ${approval.numero}` : ''}${approval.complemento ? ` (${approval.complemento})` : ''}${approval.bairro ? ` - ${approval.bairro}` : ''}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Informações Complementares e Observações */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-2">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">Observações Comerciais & Informações Complementares</h4>
                </div>
                <p className="text-xs text-neutral-700 whitespace-pre-line leading-relaxed p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  {approval.observacoes || 'Nenhuma observação comercial informada pelo fornecedor.'}
                </p>
              </div>

              {/* 4. Dados Bancários (se cadastrados) */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-2.5">
                  <WalletCards className="h-4 w-4 text-purple-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-neutral-900">Dados Bancários para Recebimento</h4>
                </div>

                {bank && (bank.banco || bank.chave_pix || bank.conta) ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="block text-neutral-400 font-medium">Banco</span>
                      <span className="font-bold text-neutral-900">{bank.banco || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-neutral-400 font-medium">Agência</span>
                      <span className="font-bold text-neutral-900">{bank.agencia || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-neutral-400 font-medium">Conta / Tipo</span>
                      <span className="font-bold text-neutral-900">{bank.conta || '—'} {bank.tipo_conta ? `(${bank.tipo_conta})` : ''}</span>
                    </div>
                    <div>
                      <span className="block text-neutral-400 font-medium">Tipo Chave PIX</span>
                      <span className="font-bold text-neutral-900 uppercase">{bank.tipo_chave_pix || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-neutral-400 font-medium">Chave PIX</span>
                      <span className="font-bold text-neutral-900 select-all">{bank.chave_pix || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-neutral-400 font-medium">Titular da Conta / Doc</span>
                      <span className="font-bold text-neutral-900">
                        {bank.titular || '—'} {bank.documento_titular ? `(${maskCNPJ(bank.documento_titular) || maskCPF(bank.documento_titular)})` : ''}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 italic bg-neutral-50 p-3 rounded-xl border border-neutral-100">
                    O fornecedor ainda não cadastrou dados bancários no perfil.
                  </p>
                )}

                {pendingBank && (
                  <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-4 space-y-3">
                    <div><p className="text-xs font-black uppercase text-purple-900">Alteração bancária pendente</p><p className="mt-1 text-[11px] text-purple-700">Os dados atuais continuam válidos até esta análise ser concluída.</p></div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="block text-purple-500">Banco</span><b>{pendingBank.banco || '—'}</b></div>
                      <div><span className="block text-purple-500">Agência / Conta</span><b>{pendingBank.agencia || '—'} / {pendingBank.conta || '—'}</b></div>
                      <div><span className="block text-purple-500">PIX</span><b className="break-all">{pendingBank.chave_pix || '—'}</b></div>
                      <div><span className="block text-purple-500">Titular</span><b>{pendingBank.titular || '—'}</b></div>
                    </div>
                    <textarea rows={2} value={bankReason} onChange={(e) => setBankReason(e.target.value)} placeholder="Motivo obrigatório para recusa" className="w-full rounded-xl border border-purple-200 bg-white p-3 text-xs" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={saving} onClick={() => void reviewBankChange(false)} className="rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-black text-red-700 disabled:opacity-50">Recusar alteração</button>
                      <button type="button" disabled={saving} onClick={() => void reviewBankChange(true)} className="rounded-xl bg-purple-700 py-2.5 text-xs font-black text-white disabled:opacity-50">Aprovar dados bancários</button>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Painel de Parecer Administrativo & Ações */}
              <div className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  Parecer Administrativo e Decisão
                </h4>

                <label className="block text-xs font-bold text-neutral-800">
                  Motivo ou observação da análise
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white p-3 text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Descreva o motivo caso solicite ajustes ou reprove, ou insira observações internas da aprovação..."
                  />
                </label>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-neutral-800">
                    PIN inicial de 4 dígitos para aprovação
                    <input
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white p-3 text-center text-xl font-black tracking-[0.5em] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="0000"
                    />
                  </label>
                  <p className="rounded-xl bg-blue-50 p-3 text-[11px] font-semibold text-blue-900 border border-blue-100">
                    💡 Após aprovar, comunique este PIN de 4 dígitos ao fornecedor por canal seguro para o primeiro acesso ao Portal do Fornecedor.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeSupplierStatus('reprovado')}
                    className="rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 py-3 text-xs font-black text-red-700 transition-all disabled:opacity-50"
                  >
                    Reprovar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeSupplierStatus(approval.status === 'ativo' ? 'suspenso' : 'ajuste_solicitado')}
                    className="rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 py-3 text-xs font-black text-amber-800 transition-all disabled:opacity-50"
                  >
                    {approval.status === 'ativo' ? 'Suspender' : 'Pedir ajuste'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeSupplierStatus('ativo')}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-xs font-black text-white shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar fornecedor
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal isOpen={orderOpen} onClose={() => !saving && setOrderOpen(false)} title="Novo pedido de compra" size="wide">
        <div className="space-y-5">
          <label className="block text-sm font-bold">Fornecedor<select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setOrderItems([]); }} className="mt-2 w-full rounded-xl border border-neutral-200 p-3"><option value="">Selecione</option>{activeSuppliers.map((item) => <option key={item.id} value={item.id}>{item.nome_fantasia || item.razao_social}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Previsão de entrega" type="date" value={orderMeta.previsao_entrega} onChange={(value) => setOrderMeta({ ...orderMeta, previsao_entrega: value })} /><Field label="Vencimento previsto" type="date" value={orderMeta.vencimento_previsto} onChange={(value) => setOrderMeta({ ...orderMeta, vencimento_previsto: value })} /><Field label="Condição de pagamento" value={orderMeta.condicao_pagamento} onChange={(value) => setOrderMeta({ ...orderMeta, condicao_pagamento: value })} /></div>
          <div>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-black">Produtos</h3><button type="button" onClick={addOrderItem} className="rounded-xl bg-neutral-100 px-4 py-2 text-xs font-black">Adicionar produto</button></div>
            <div className="space-y-2">
              {orderItems.map((item, index) => (
                <div key={`${item.fornecedor_produto_id}-${index}`} className="grid gap-2 rounded-xl bg-neutral-50 p-3 sm:grid-cols-[1fr_110px_130px_40px]">
                  <select value={item.fornecedor_produto_id} onChange={(event) => { const link = availableLinks.find((entry) => entry.id === event.target.value); setOrderItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, fornecedor_produto_id: event.target.value, custo_unitario: String(link?.custo_unitario || 0) } : entry)); }} className="rounded-lg border border-neutral-200 p-2">{availableLinks.map((link) => <option key={link.id} value={link.id}>{link.produto_nome}</option>)}</select>
                  <input  type="number" min="1" value={item.quantidade} inputMode="numeric" onChange={(event) => setOrderItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantidade: event.target.value } : entry))} className="rounded-lg border border-neutral-200 p-2" placeholder="Quantidade" />
                  <input  type="number" min="0" step="0.01" value={item.custo_unitario} inputMode="numeric" onChange={(event) => setOrderItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, custo_unitario: event.target.value } : entry))} className="rounded-lg border border-neutral-200 p-2" placeholder="Custo" />
                  <button type="button" onClick={() => setOrderItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-red-600"><XCircle className="h-5 w-5" /></button>
                </div>
              ))}
              {orderItems.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 p-5 text-center text-sm text-neutral-400">Adicione produtos aprovados para este fornecedor.</p>}
            </div>
          </div>
          <label className="block text-sm font-bold">Observações<textarea rows={3} value={orderMeta.observacoes} onChange={(event) => setOrderMeta({ ...orderMeta, observacoes: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>
          <button type="button" disabled={saving} onClick={() => void createOrder()} className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white disabled:opacity-50">{saving ? 'Enviando...' : 'Enviar pedido ao fornecedor'}</button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(productReview)} onClose={() => !saving && setProductReview(null)} title="Analisar produto" size="sm">
        {productReview && (
          <div className="space-y-4">
            <div className="rounded-xl bg-neutral-50 p-4"><p className="font-black">{productReview.request.tipo === 'existente' ? productReview.request.produto_existente_nome : productReview.request.nome}</p><p className="text-sm text-neutral-500">{productReview.request.fornecedor_nome}</p></div>
            {productReview.action === 'aprovar' && productReview.request.tipo === 'novo' && <Field label="Valor de venda" type="number" value={saleValue} onChange={setSaleValue} />}
            {productReview.action !== 'aprovar' && <label className="block text-sm font-bold">Motivo<textarea rows={4} value={productReason} onChange={(event) => setProductReason(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>}
            <button type="button" disabled={saving} onClick={() => void submitProductReview()} className="w-full rounded-xl bg-neutral-950 py-3 font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : productReview.action === 'aprovar' ? 'Confirmar aprovação' : productReview.action === 'ajuste' ? 'Enviar solicitação de ajuste' : 'Confirmar reprovação'}</button>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(deliveryReview)} onClose={() => !saving && setDeliveryReview(null)} title="Analisar entrega e nota fiscal" size="sm">
        {deliveryReview && (
          <div className="space-y-4">
            <div className="rounded-xl bg-neutral-50 p-4"><p className="font-black">NF {deliveryReview.delivery.numero_nota}</p><p className="text-sm text-neutral-500">{deliveryReview.delivery.fornecedor_nome} · {formatCurrency(Number(deliveryReview.delivery.valor_total_nota || 0))}</p></div>
            <label className="block text-sm font-bold">{deliveryReview.action === 'aprovar' ? 'Observação da aprovação (opcional)' : 'Motivo'}<textarea rows={4} value={deliveryReason} onChange={(event) => setDeliveryReason(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>
            {deliveryReview.action === 'aprovar' && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">A aprovação atualizará o estoque, o histórico e criará a conta a pagar na mesma operação.</p>}
            <button type="button" disabled={saving} onClick={() => void submitDeliveryReview()} className="w-full rounded-xl bg-neutral-950 py-3 font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : deliveryReview.action === 'aprovar' ? 'Aprovar NF e liberar estoque' : deliveryReview.action === 'ajuste' ? 'Solicitar ajuste' : 'Reprovar entrega'}</button>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(payment)} onClose={() => !saving && setPayment(null)} title="Confirmar pagamento" size="sm">
        {payment && (
          <div className="space-y-4">
            <div className="rounded-xl bg-neutral-50 p-4"><p className="font-black">NF {payment.numero_documento}</p><p className="text-sm text-neutral-500">{payment.fornecedor_nome}</p><p className="mt-2 text-2xl font-black text-emerald-700">{formatCurrency(Number(payment.valor_pendente || payment.valor_original || 0))}</p></div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
              <p className="font-black">Dados de recebimento cadastrados</p>
              <p className="mt-2">Banco: {paymentBank.banco || 'não informado'} · Agência: {paymentBank.agencia || '—'} · Conta: {paymentBank.conta || '—'}</p>
              <p className="mt-1">PIX: {paymentBank.tipo_chave_pix || 'chave'} · {paymentBank.chave_pix || 'não informado'}</p>
              <p className="mt-1">Titular: {paymentBank.titular || paymentSupplier?.razao_social || 'não informado'}</p>
            </div>
            {!paymentBank.chave_pix && !paymentBank.conta && <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">O fornecedor ainda não cadastrou dados bancários. Confirme os dados antes de pagar.</p>}
            <Field label="Forma de pagamento" value={paymentMethod} onChange={setPaymentMethod} />
            <label className="block rounded-xl border border-dashed border-neutral-300 p-4 text-sm font-bold"><FileUp className="mb-2 h-5 w-5" />Comprovante obrigatório<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => setPaymentProof(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs" />{paymentProof && <span className="mt-2 block text-emerald-700">{paymentProof.name}</span>}</label>
            <label className="block text-sm font-bold">Observações<textarea rows={3} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>
            <button type="button" disabled={saving || !paymentProof} onClick={() => void submitPayment()} className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white disabled:opacity-50">{saving ? 'Confirmando...' : 'Confirmar pagamento integral'}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>; }
function Status({ value }: { value: string }) { const good = ['ativo', 'aprovado', 'pago', 'concluido'].includes(value); const bad = ['reprovado', 'cancelado', 'suspenso'].includes(value); return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${good ? 'bg-emerald-50 text-emerald-700' : bad ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{String(value || '').replaceAll('_', ' ')}</span>; }
function ListEmpty({ loading, empty, message, children }: { loading: boolean; empty: boolean; message: string; children: React.ReactNode }) { if (loading) return <div className="flex min-h-64 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin" /></div>; if (empty) return <div className="rounded-2xl border border-dashed border-neutral-200 p-14 text-center text-neutral-400"><FileText className="mx-auto mb-3 h-8 w-8" />{message}</div>; return <>{children}</>; }
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm font-bold">{label}<input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>; }

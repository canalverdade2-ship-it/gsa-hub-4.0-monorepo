import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  CreditCard,
  Eye,
  Package,
  RotateCcw,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { OrderReviewModal } from './OrderReviewModal';
import { Star } from 'lucide-react';

export interface StoreHubPurchasesProps {
  isPurchasesModalOpen: boolean;
  setIsPurchasesModalOpen: (open: boolean) => void;
  setSelectedOrderId: (id: string | null) => void;
  loading: boolean;
  allPurchases: any[];
  groupedPurchases: (purchases: any[]) => any[];
  handleCancelOrder: (order: any) => void;
  isProcessingPayment: boolean;
  handlePayOrder: (order: any) => void;
  setSelectedOrderDetail: (order: any) => void;
  setCancelRequestOrder: (order: any) => void;
  setSelectedOrderTimeline: (order: any) => void;
  onNavigate?: (path: string) => void;
}

type PurchaseTab = 'pendentes' | 'pagos' | 'cancelados';

type OrderPresentation = {
  status: string;
  label: string;
  tone: string;
  dot: string;
  isCredit: boolean;
  isSubscription: boolean;
  isPaid: boolean;
  isAwaiting: boolean;
  isExpired: boolean;
  canPay: boolean;
  canCancelPending: boolean;
  canRequestCancellation: boolean;
  hoursLeft: number;
  minutesLeft: number;
};

function getOrderStatus(order: any): string {
  let status = order.ordens_items?.[0]?.status || order.status || 'em_analise';
  const isSubscription = order.ordens_items?.[0]?.tipo === 'assinatura';
  if (isSubscription && order.ordens_items?.[0]?.faturas?.some((invoice: any) => invoice.status === 'pago')) {
    status = 'pago';
  }
  return status;
}

function getPresentation(order: any): OrderPresentation {
  const status = getOrderStatus(order);
  const isCredit = Boolean(
    order.forma_pagamento_loja === 'credito_loja' ||
    order.descricao_adicional?.includes('Credito GSA') ||
    order.descricao_adicional?.includes('Crédito GSA')
  );
  const isSubscription = order.ordens_items?.[0]?.tipo === 'assinatura';
  const createdAt = new Date(order.data_criacao);
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  const remainingMs = expiresAt.getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
  const minutesLeft = Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)));
  const expiredPending = !isCredit
    && remainingMs <= 0
    && ['aberto', 'em_analise'].includes(status);
  const isCancelled = status === 'cancelado';
  const isExpired = isCancelled || expiredPending;
  const isPaid = ['pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(status) || isCredit;
  const isAwaiting = ['aberto', 'em_analise'].includes(status) && !isCredit && !isExpired;

  let label = 'Em análise';
  let tone = 'border-amber-200 bg-amber-50 text-amber-800';
  let dot = 'bg-amber-500';

  if (isExpired) {
    label = 'Cancelado';
    tone = 'border-red-200 bg-red-50 text-red-700';
    dot = 'bg-red-500';
  } else if (status === 'concluido') {
    label = 'Entregue';
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    dot = 'bg-emerald-500';
  } else if (status === 'em_transporte') {
    label = 'Em transporte';
    tone = 'border-blue-200 bg-blue-50 text-blue-800';
    dot = 'bg-blue-500';
  } else if (status === 'em_expedicao') {
    label = 'Em preparação';
    tone = 'border-sky-200 bg-sky-50 text-sky-800';
    dot = 'bg-sky-500';
  } else if (isPaid) {
    label = isSubscription ? 'Assinatura ativa' : 'Pagamento aprovado';
    tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    dot = 'bg-emerald-500';
  } else if (isAwaiting) {
    label = 'Aguardando pagamento';
  }

  return {
    status,
    label,
    tone,
    dot,
    isCredit,
    isSubscription,
    isPaid,
    isAwaiting,
    isExpired,
    canPay: isAwaiting && Number(order.total || 0) > 0,
    canCancelPending: isAwaiting && Number(order.total || 0) > 0,
    canRequestCancellation: isPaid && ['aprovado', 'pago'].includes(status),
    hoursLeft,
    minutesLeft,
  };
}

function orderMatchesTab(order: any, tab: PurchaseTab): boolean {
  const presentation = getPresentation(order);
  if (tab === 'pendentes') return presentation.isAwaiting;
  if (tab === 'pagos') return presentation.isPaid && !presentation.isExpired;
  return presentation.isExpired;
}

function getOrderImage(order: any): string | undefined {
  return order.ordens_items?.[0]?.produtos?.imagem_url
    || order.ordens_items?.[0]?.assinaturas?.imagem_url;
}

export default function StoreHubPurchases({
  isPurchasesModalOpen,
  setIsPurchasesModalOpen,
  setSelectedOrderId,
  loading,
  allPurchases,
  groupedPurchases,
  handleCancelOrder,
  isProcessingPayment,
  handlePayOrder,
  setSelectedOrderDetail,
  setCancelRequestOrder,
  setSelectedOrderTimeline,
}: StoreHubPurchasesProps) {
  const [purchasesTab, setPurchasesTab] = useState<PurchaseTab>('pendentes');
  const [selectedOrderReview, setSelectedOrderReview] = useState<any>(null);

  const grouped = useMemo(() => groupedPurchases(allPurchases), [allPurchases, groupedPurchases]);
  const filtered = useMemo(
    () => grouped.filter((order) => orderMatchesTab(order, purchasesTab)),
    [grouped, purchasesTab],
  );
  const counts = useMemo(() => ({
    pendentes: grouped.filter((order) => orderMatchesTab(order, 'pendentes')).length,
    pagos: grouped.filter((order) => orderMatchesTab(order, 'pagos')).length,
    cancelados: grouped.filter((order) => orderMatchesTab(order, 'cancelados')).length,
  }), [grouped]);

  const close = () => {
    setIsPurchasesModalOpen(false);
    setSelectedOrderId(null);
  };

  return (
    <Modal isOpen={isPurchasesModalOpen} onClose={close} title="Meus pedidos" size="wide">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 rounded-[16px] border border-slate-200 bg-slate-50 p-1.5">
          {([
            { id: 'pendentes', label: 'Pendentes' },
            { id: 'pagos', label: 'Em andamento' },
            { id: 'cancelados', label: 'Cancelados' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPurchasesTab(tab.id)}
              aria-pressed={purchasesTab === tab.id}
              className={`min-h-11 rounded-xl px-2 text-xs font-extrabold transition ${
                purchasesTab === tab.id
                  ? 'bg-white text-[#17345f] shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="block sm:inline">{tab.label}</span>
              <span className={`ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] ${
                purchasesTab === tab.id ? 'bg-[#edf2f7] text-[#17345f]' : 'bg-slate-200 text-slate-600'
              }`}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3" role="status" aria-label="Carregando pedidos">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-40 animate-pulse rounded-[18px] border border-slate-200 bg-slate-100" />
            ))}
          </div>
        ) : allPurchases.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-slate-200 bg-white">
              <ShoppingBag className="h-7 w-7 text-slate-300" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-base font-extrabold text-slate-950">Você ainda não realizou compras</h3>
            <p className="mt-2 max-w-[320px] text-sm leading-6 text-slate-500">
              Seus pedidos, pagamentos e atualizações de entrega aparecerão neste espaço.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
            <Package className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <h3 className="mt-4 text-sm font-extrabold text-slate-800">Nenhum pedido nesta situação</h3>
            <p className="mt-1 text-xs text-slate-500">Escolha outra aba para consultar seu histórico.</p>
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {filtered.map((order) => {
              const presentation = getPresentation(order);
              const image = getOrderImage(order);
              const itemCount = order.ordens_items?.length || order.quantidade || 1;
              const code = order.codigo_orcamento?.startsWith('#')
                ? order.codigo_orcamento
                : `#${order.codigo_orcamento || order.codigo_ordem || 'PEDIDO'}`;

              return (
                <article key={code} className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:h-20 sm:w-20">
                        {image ? (
                          <img src={image} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <Package className="h-7 w-7 text-slate-300" aria-hidden="true" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">Pedido</p>
                            <h3 className="mt-0.5 text-lg font-black tracking-[-0.025em] text-slate-950">{code}</h3>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${presentation.tone}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} aria-hidden="true" />
                            {presentation.label}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatDate(order.data_criacao)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" aria-hidden="true" />
                            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                          </span>
                          {presentation.isAwaiting && (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                              Expira em {presentation.hoursLeft}h {presentation.minutesLeft}min
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-100 pt-4">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">Total</p>
                        <p className="mt-1 text-2xl font-black leading-none tracking-[-0.04em] text-[#17345f]">{formatCurrency(order.total || 0)}</p>
                      </div>

                      {presentation.status === 'em_transporte' && (
                        <div className="hidden items-center gap-2 text-xs font-bold text-blue-700 sm:flex">
                          <Truck className="h-4 w-4" aria-hidden="true" />
                          A caminho
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderDetail(order)}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 transition hover:bg-slate-100 sm:flex-none"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      Detalhes
                    </button>

                    {presentation.isPaid && (
                      <button
                        type="button"
                        onClick={() => setSelectedOrderTimeline(order)}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#cdd8e6] bg-[#edf2f7] px-3 text-xs font-extrabold text-[#17345f] transition hover:bg-[#e4ebf3] sm:flex-none"
                      >
                        <Truck className="h-4 w-4" aria-hidden="true" />
                        Acompanhar
                      </button>
                    )}

                    {presentation.status === 'concluido' && (
                      <button
                        type="button"
                        onClick={() => setSelectedOrderReview(order)}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-700 transition hover:bg-amber-100 sm:flex-none"
                      >
                        <Star className="h-4 w-4" aria-hidden="true" />
                        Avaliar
                      </button>
                    )}

                    {presentation.canPay && (
                      <button
                        type="button"
                        disabled={isProcessingPayment}
                        onClick={() => {
                          setIsPurchasesModalOpen(false);
                          handlePayOrder(order);
                        }}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#17345f] px-3 text-xs font-extrabold text-white transition hover:bg-[#102746] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                      >
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                        {isProcessingPayment ? 'Preparando...' : 'Pagar agora'}
                      </button>
                    )}

                    {presentation.isSubscription && presentation.isPaid && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPurchasesModalOpen(false);
                          handlePayOrder(order);
                        }}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#17345f] px-3 text-xs font-extrabold text-white transition hover:bg-[#102746] sm:flex-none"
                      >
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                        Mensalidades
                      </button>
                    )}

                    {presentation.canCancelPending && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order)}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-extrabold text-red-700 transition hover:bg-red-50 sm:flex-none"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Cancelar
                      </button>
                    )}

                    {presentation.canRequestCancellation && (
                      <button
                        type="button"
                        onClick={() => setCancelRequestOrder(order)}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-extrabold text-red-700 transition hover:bg-red-50 sm:flex-none"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Solicitar cancelamento
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {purchasesTab === 'cancelados' && filtered.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            Pedidos cancelados permanecem disponíveis para consulta e histórico.
          </div>
        )}

        <button
          type="button"
          onClick={close}
          className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
        >
          Fechar pedidos
        </button>
      </div>
      
      {/* Avaliação Modal (Fase 4.4) */}
      <OrderReviewModal 
        isOpen={!!selectedOrderReview}
        onClose={() => setSelectedOrderReview(null)}
        order={selectedOrderReview}
      />
    </Modal>
  );
}

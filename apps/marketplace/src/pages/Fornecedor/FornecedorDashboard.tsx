import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  FileCheck2,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Truck,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { LogoGSA } from '../../components/ui/LogoGSA';
import { UniversalNotificationBell, type StandardNotification } from '../../components/ui/UniversalNotificationBell';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime, generateUUID } from '../../lib/utils';
import { useWhatsAppDocument } from '../../hooks/useWhatsAppDocument';
import { generateExtratoPDF } from '../../lib/pdf';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { Send } from 'lucide-react';
import {
  getSupplierSnapshot,
  markAllSupplierNotificationsRead,
  markSupplierNotificationRead,
  markSupplierOrderSeen,
  requestSupplierProduct,
  submitSupplierDelivery,
  uploadSupplierInvoice,
  updateSupplierProfile,
} from '../../lib/supplierOperations';
import { navigate } from '../../routing/navigationService';
import { routes } from '../../routing/routeCatalog';
import { useAppLocation } from '../../routing/useAppLocation';
import type { SupplierOrder, SupplierSnapshot } from '../../types/supplier';

const EMPTY: SupplierSnapshot = {
  supplier: {},
  products: [],
  catalog: [],
  requests: [],
  orders: [],
  deliveries: [],
  payables: [],
  notifications: [],
};

const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: routes.supplier.dashboard() },
  { id: 'produtos', label: 'Produtos', icon: Package, path: routes.supplier.products() },
  { id: 'pedidos', label: 'Pedidos de compra', icon: ShoppingCart, path: routes.supplier.orders() },
  { id: 'entregas', label: 'Entregas e NFs', icon: Truck, path: routes.supplier.deliveries() },
  { id: 'financeiro', label: 'Financeiro', icon: WalletCards, path: routes.supplier.payables() },
  { id: 'perfil', label: 'Perfil e pagamento', icon: UserRound, path: '/fornecedor/perfil' },
];

export function FornecedorDashboard({ fornecedorId, onLogout }: { fornecedorId: string; onLogout: () => void }) {
  const route = useAppLocation();
  const active = MENU.some((item) => item.id === route.module) ? route.module : 'dashboard';
  const [snapshot, setSnapshot] = useState<SupplierSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productRequest, setProductRequest] = useState<Record<string, any> | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<SupplierOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const openingOrderRef = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setSnapshot(await getSupplierSnapshot());
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar o portal.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (['home', 'login', 'access'].includes(route.module)) {
      navigate(routes.supplier.dashboard());
    }
  }, [route.module]);

  useEffect(() => {
    const channel = supabase
      .channel(`supplier-sync:${fornecedorId}`)
      .on('broadcast', { event: 'refresh' }, () => void load(true))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fornecedorId, load]);

  const openOrder = useCallback(async (order: SupplierOrder) => {
    if (openingOrderRef.current === order.id) return;
    openingOrderRef.current = order.id;
    setDeliveryOrder(order);
    try {
      if (order.status === 'enviado') {
        await markSupplierOrderSeen(order.id);
        await load(true);
      }
    } catch {
      // A atualização visual do status não bloqueia o envio da entrega.
    } finally {
      openingOrderRef.current = null;
    }
  }, [load]);

  useEffect(() => {
    if (route.module === 'produtos' && route.itemId === 'novo') {
      setProductRequest(null);
      setProductOpen(true);
    }
  }, [route.itemId, route.module]);

  useEffect(() => {
    if (route.module !== 'pedidos' || !route.itemId || loading) return;
    const order = snapshot.orders.find((item) => item.id === route.itemId);
    if (order && deliveryOrder?.id !== order.id) void openOrder(order);
  }, [deliveryOrder?.id, loading, openOrder, route.itemId, route.module, snapshot.orders]);

  const formattedNotifications = useMemo<StandardNotification[]>(() => (
    (snapshot.notifications || []).map((notification) => ({
      id: String(notification.id || Math.random()),
      titulo: String(notification.titulo || notification.title || 'Notificação do Fornecedor'),
      mensagem: String(notification.mensagem || notification.message || ''),
      lida: Boolean(notification.lida),
      created_at: String(notification.created_at || new Date().toISOString()),
      modulo: notification.modulo,
      tab: notification.tab,
      item_id: notification.item_id,
    }))
  ), [snapshot.notifications]);

  const unread = formattedNotifications.filter((item) => !item.lida).length;
  const pendingOrders = snapshot.orders.filter((item) => !['concluido', 'cancelado'].includes(item.status)).length;
  const pendingDeliveries = snapshot.deliveries.filter((item) => ['em_analise', 'ajuste_solicitado'].includes(item.status)).length;
  const receivable = snapshot.payables
    .filter((item) => item.status !== 'cancelado')
    .reduce((sum, item) => sum + Number(item.valor_pendente || 0), 0);

  const handleMarkAsRead = async (id: string) => {
    setSnapshot((current) => ({
      ...current,
      notifications: current.notifications.map((item) => String(item.id) === id ? { ...item, lida: true } : item),
    }));
    try {
      await markSupplierNotificationRead(id);
    } catch (error) {
      console.error('Falha ao marcar notificação do fornecedor:', error);
      await load(true);
    }
  };

  const handleMarkAllAsRead = async () => {
    const previous = snapshot.notifications;
    setSnapshot((current) => ({
      ...current,
      notifications: current.notifications.map((item) => ({ ...item, lida: true })),
    }));
    try {
      await markAllSupplierNotificationsRead();
    } catch (error) {
      console.error('Falha ao marcar notificações do fornecedor:', error);
      setSnapshot((current) => ({ ...current, notifications: previous }));
      toast.error('Não foi possível atualizar as notificações.');
    }
  };

  const navigateNotification = (module?: string, _tab?: string, itemId?: string) => {
    if (module === 'pedidos' && itemId) navigate(routes.supplier.order(itemId));
    else if (module === 'produtos') navigate(routes.supplier.products());
    else if (module === 'entregas') navigate(routes.supplier.deliveries());
    else if (module === 'financeiro' || module === 'contas') navigate(routes.supplier.payables());
    else navigate(routes.supplier.dashboard());
  };

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-neutral-900">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-neutral-200 bg-white/95 px-4 backdrop-blur lg:px-8">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSidebar(true)} className="rounded-xl p-2 lg:hidden" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <LogoGSA size="sm" variant="dark" />
          <div>
            <p className="text-sm font-black">Portal do Fornecedor</p>
            <p className="max-w-48 truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {snapshot.supplier?.nome_fantasia || snapshot.supplier?.razao_social || 'GSA Produtos'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-200 p-2.5" aria-label="Atualizar portal">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <UniversalNotificationBell
            variant="client"
            notifications={formattedNotifications}
            unreadCount={unread}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onNavigate={navigateNotification}
          />
          <button type="button" onClick={onLogout} className="rounded-xl bg-neutral-950 p-2.5 text-white" aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-neutral-200 bg-white p-4 lg:block">
          <Navigation active={active} onNavigate={navigate} />
        </aside>
        <main className="min-w-0 flex-1 p-4 lg:p-8">
          {active === 'dashboard' && (
            <Dashboard
              snapshot={snapshot}
              pendingOrders={pendingOrders}
              pendingDeliveries={pendingDeliveries}
              receivable={receivable}
              onNavigate={navigate}
            />
          )}
          {active === 'produtos' && (
            <Products
              snapshot={snapshot}
              loading={loading}
              onNew={() => { setProductRequest(null); setProductOpen(true); }}
              onCorrect={(request) => { setProductRequest(request); setProductOpen(true); }}
            />
          )}
          {active === 'pedidos' && <Orders orders={snapshot.orders} loading={loading} onOpen={(order) => void openOrder(order)} />}
          {active === 'entregas' && <Deliveries deliveries={snapshot.deliveries} loading={loading} onGoToOrders={() => navigate(routes.supplier.orders())} />}
          {active === 'financeiro' && <Payables supplier={snapshot.supplier} payables={snapshot.payables} loading={loading} />}
          {active === 'perfil' && (
            <Profile
              supplier={snapshot.supplier}
              saving={saving}
              onSave={async (payload) => {
                setSaving(true);
                try {
                  await updateSupplierProfile(payload);
                  toast.success('Perfil e dados de pagamento atualizados.');
                  await load(true);
                } catch (error: any) {
                  toast.error(error?.message || 'Não foi possível atualizar o perfil.');
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}
        </main>
      </div>

      {sidebar && (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setSidebar(false)}>
          <aside className="h-full w-72 bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <p className="font-black">Menu</p>
              <button type="button" onClick={() => setSidebar(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
            </div>
            <Navigation active={active} onNavigate={(path) => { setSidebar(false); navigate(path); }} />
          </aside>
        </div>
      )}

      <ProductRequestModal
        isOpen={productOpen}
        snapshot={snapshot}
        request={productRequest}
        saving={saving}
        onClose={() => {
          setProductOpen(false);
          setProductRequest(null);
          if (route.itemId === 'novo') navigate(routes.supplier.products());
        }}
        onSubmit={async (payload) => {
          setSaving(true);
          try {
            await requestSupplierProduct(payload);
            toast.success(productRequest ? 'Correção reenviada para análise.' : 'Produto enviado para análise.');
            setProductOpen(false);
            setProductRequest(null);
            navigate(routes.supplier.products());
            await load(true);
          } catch (error: any) {
            toast.error(error?.message || 'Não foi possível enviar a solicitação.');
          } finally {
            setSaving(false);
          }
        }}
      />

      <DeliveryModal
        order={deliveryOrder}
        supplierId={fornecedorId}
        saving={saving}
        onClose={() => {
          setDeliveryOrder(null);
          if (route.module === 'pedidos' && route.itemId) navigate(routes.supplier.orders());
        }}
        onSubmit={async (requestId, payload, xml, pdf) => {
          if (!deliveryOrder) return;
          setSaving(true);
          try {
            const [xmlReference, pdfReference] = await Promise.all([
              xml ? uploadSupplierInvoice(xml, fornecedorId, deliveryOrder.id, requestId) : Promise.resolve(null),
              pdf ? uploadSupplierInvoice(pdf, fornecedorId, deliveryOrder.id, requestId) : Promise.resolve(null),
            ]);
            await submitSupplierDelivery(requestId, deliveryOrder.id, {
              ...payload,
              arquivo_xml: xmlReference,
              arquivo_pdf: pdfReference,
            });
            toast.success('Entrega e nota fiscal enviadas para análise.');
            setDeliveryOrder(null);
            navigate(routes.supplier.deliveries());
            await load(true);
          } catch (error: any) {
            toast.error(error?.message || 'Não foi possível enviar a entrega. Você pode tentar novamente sem duplicar a operação.');
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

function Navigation({ active, onNavigate }: { active: string; onNavigate: (path: string) => void }) {
  return (
    <nav className="space-y-1">
      {MENU.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onNavigate(item.path)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold ${active === item.id ? 'bg-neutral-950 text-white shadow-lg' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}
          >
            <Icon className="h-5 w-5" />{item.label}
          </button>
        );
      })}
    </nav>
  );
}

function Dashboard({ snapshot, pendingOrders, pendingDeliveries, receivable, onNavigate }: {
  snapshot: SupplierSnapshot;
  pendingOrders: number;
  pendingDeliveries: number;
  receivable: number;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-neutral-950 p-7 text-white">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Bem-vindo</p>
        <h1 className="mt-2 text-3xl font-black">{snapshot.supplier?.nome_fantasia || snapshot.supplier?.razao_social || 'Fornecedor'}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">Acompanhe produtos aprovados, pedidos de compra, entregas, notas fiscais e pagamentos.</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Produtos aprovados" value={snapshot.products.length} icon={Package} />
        <Metric label="Pedidos em aberto" value={pendingOrders} icon={ShoppingCart} />
        <Metric label="Entregas em análise" value={pendingDeliveries} icon={Truck} />
        <Metric label="Valores pendentes" value={formatCurrency(receivable)} icon={WalletCards} />
      </div>
      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-black">Pedidos recentes</h2>
          <button type="button" onClick={() => onNavigate(routes.supplier.orders())} className="text-xs font-black text-emerald-700">Ver todos</button>
        </div>
        <div className="mt-4 space-y-2">
          {snapshot.orders.slice(0, 5).map((order) => (
            <button type="button" key={order.id} onClick={() => onNavigate(routes.supplier.order(order.id))} className="flex w-full items-center justify-between rounded-xl bg-neutral-50 p-4 text-left">
              <div><p className="font-black">{order.codigo}</p><p className="text-xs text-neutral-500">{order.items?.length || 0} produto(s)</p></div>
              <Status value={order.status} />
            </button>
          ))}
          {snapshot.orders.length === 0 && <p className="py-8 text-center text-sm text-neutral-400">Nenhum pedido recebido.</p>}
        </div>
      </section>
    </div>
  );
}

function Products({ snapshot, loading, onNew, onCorrect }: {
  snapshot: SupplierSnapshot;
  loading: boolean;
  onNew: () => void;
  onCorrect: (request: Record<string, any>) => void;
}) {
  return (
    <Page
      title="Produtos fornecidos"
      description="Somente produtos aprovados podem ser incluídos em pedidos da GSA."
      action={<button type="button" onClick={onNew} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white"><Plus className="h-4 w-4" />Solicitar produto</button>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {snapshot.products.map((product) => (
          <article key={product.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex justify-between">
              <div>
                <Status value={product.status} />
                <h2 className="mt-3 font-black">{product.produto_nome}</h2>
                <p className="text-sm text-neutral-500">{product.codigo_produto || 'Sem código'} · custo {formatCurrency(Number(product.custo_unitario || 0))}</p>
              </div>
              <Package className="h-7 w-7 text-neutral-300" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Small label="Mínimo" value={product.quantidade_minima} />
              <Small label="Prazo" value={`${product.prazo_entrega_dias} dias`} />
              <Small label="Estoque GSA" value={product.estoque_disponivel || 0} />
            </div>
          </article>
        ))}
        {!loading && snapshot.products.length === 0 && <Empty text="Nenhum produto aprovado ainda." />}
      </div>
      <div className="mt-8">
        <h2 className="mb-3 font-black">Solicitações recentes</h2>
        <div className="space-y-2">
          {snapshot.requests.map((request) => (
            <div key={request.id} className="flex flex-col justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-bold">{request.nome || snapshot.catalog.find((item) => item.id === request.produto_id)?.nome || 'Produto existente'}</p>
                <p className="text-xs text-neutral-400">Enviado em {formatDateTime(request.created_at)}</p>
                {request.motivo_analise && <p className="mt-1 text-xs text-amber-700">{request.motivo_analise}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Status value={request.status} />
                {request.status === 'ajuste_solicitado' && (
                  <button type="button" onClick={() => onCorrect(request)} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-900">Corrigir e reenviar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}

function Orders({ orders, loading, onOpen }: { orders: SupplierOrder[]; loading: boolean; onOpen: (order: SupplierOrder) => void }) {
  return (
    <Page title="Pedidos de compra" description="Informe a entrega e a NF somente para os produtos e saldos deste pedido.">
      <div className="space-y-3">
        {orders.map((order) => {
          const remaining = (order.items || []).some((item) => item.quantidade_pedida > item.quantidade_aprovada);
          const available = remaining && !['concluido', 'cancelado'].includes(order.status);
          return (
            <button
              type="button"
              key={order.id}
              disabled={!available}
              onClick={() => onOpen(order)}
              className="w-full rounded-2xl border border-neutral-200 bg-white p-5 text-left hover:border-emerald-300 disabled:cursor-default disabled:opacity-70"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div>
                  <Status value={order.status} />
                  <h2 className="mt-2 text-lg font-black">{order.codigo}</h2>
                  <p className="text-sm text-neutral-500">{order.items?.length || 0} produto(s) · {formatCurrency(Number(order.valor_total_previsto || 0))}</p>
                </div>
                <div className="sm:text-right"><p className="text-[10px] font-black uppercase text-neutral-400">Previsão</p><p className="font-bold">{order.previsao_entrega ? formatDate(order.previsao_entrega) : 'Não informada'}</p></div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {order.items?.map((item) => (
                  <div key={item.id} className="rounded-xl bg-neutral-50 p-3 text-sm">
                    <p className="font-bold">{item.produto_nome_snapshot}</p>
                    <p className="text-xs text-neutral-500">Aprovado {item.quantidade_aprovada} de {item.quantidade_pedida}</p>
                  </div>
                ))}
              </div>
              {available && <p className="mt-4 text-xs font-black text-emerald-700">Abrir pedido e informar entrega</p>}
            </button>
          );
        })}
        {!loading && orders.length === 0 && <Empty text="Nenhum pedido de compra." />}
      </div>
    </Page>
  );
}

function Deliveries({ deliveries, loading, onGoToOrders }: { deliveries: Array<Record<string, any>>; loading: boolean; onGoToOrders: () => void }) {
  return (
    <Page title="Entregas e notas fiscais" description="Acompanhe a análise administrativa de cada entrega.">
      <div className="space-y-3">
        {deliveries.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex justify-between gap-4">
              <div>
                <Status value={item.status} />
                <h2 className="mt-2 font-black">NF {item.numero_nota}</h2>
                <p className="text-sm text-neutral-500">{formatCurrency(Number(item.valor_total_nota || 0))} · emissão {formatDate(item.data_emissao)}</p>
                {item.motivo_analise && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{item.motivo_analise}</p>}
                {item.status === 'ajuste_solicitado' && <button type="button" onClick={onGoToOrders} className="mt-3 rounded-xl bg-amber-100 px-4 py-2 text-xs font-black text-amber-900">Corrigir pelo pedido</button>}
              </div>
              <FileCheck2 className="h-8 w-8 text-neutral-300" />
            </div>
          </article>
        ))}
        {!loading && deliveries.length === 0 && <Empty text="Nenhuma entrega enviada." />}
      </div>
    </Page>
  );
}

function Payables({ supplier, payables, loading }: { supplier: Record<string, any>; payables: Array<Record<string, any>>; loading: boolean }) {
  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();
  
  return (
    <Page title="Financeiro" description="Contas criadas somente após a aprovação da entrega e da nota fiscal.">
      <div className="mb-6 flex justify-end">
        <button
          onClick={async () => {
            try {
              if (!supplier?.telefone) { toast.error("Telefone não encontrado."); return; }
              const supplierName = supplier.nome_fantasia || supplier.razao_social || 'Fornecedor';
              
              const formattedTransactions = payables.map(t => ({
                data: t.data_vencimento,
                descricao: `Pagamento NF ${t.numero_documento} (${t.status})`,
                tipo: 'entrada',
                valor: Math.abs(Number(t.valor_original || 0))
              }));
              
              const doc = await generateExtratoPDF(formattedTransactions as any, supplierName, { returnDoc: true }) as any;
              const pdfBase64 = doc.output('datauristring');
              
              const msg = whatsappNotificationService.gerarMensagemWhatsApp({
                tipo: 'extrato' as any,
                clienteNome: supplierName,
              });
              
              await sendToWhatsApp(supplier.telefone, msg, pdfBase64, `extrato_fornecedor_${new Date().getTime()}.pdf`);
            } catch (e) {
              console.error(e);
              toast.error("Erro ao gerar extrato financeiro.");
            }
          }}
          disabled={isSendingWhatsApp || payables.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-4 py-3 text-xs font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
        >
          {isSendingWhatsApp ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" /> : <Send className="h-4 w-4" />}
          Enviar Extrato via WhatsApp
        </button>
      </div>
      <div className="space-y-3">
        {payables.map((item) => (
          <article key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row">
              <div>
                <Status value={item.status} />
                <h2 className="mt-2 font-black">{item.codigo} · NF {item.numero_documento}</h2>
                <p className="text-sm text-neutral-500">Vencimento {formatDate(item.data_vencimento)}</p>
                {item.data_pagamento && <p className="mt-1 text-xs text-emerald-700">Pago em {formatDateTime(item.data_pagamento)} · {item.forma_pagamento || 'Forma não informada'}</p>}
              </div>
              <p className="text-2xl font-black text-emerald-700">{formatCurrency(Number(item.valor_pendente || item.valor_original || 0))}</p>
            </div>
          </article>
        ))}
        {!loading && payables.length === 0 && <Empty text="Nenhuma conta a pagar disponível." />}
      </div>
    </Page>
  );
}

function Profile({ supplier, saving, onSave }: {
  supplier: Record<string, any>;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const bank = supplier?.dados_bancarios || {};
  const [form, setForm] = useState({
    email: '', telefone: '', cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    banco: '', agencia: '', conta: '', tipo_conta: '', tipo_chave_pix: '', chave_pix: '', titular: '', documento_titular: '',
  });

  useEffect(() => {
    setForm({
      email: supplier?.email || '', telefone: supplier?.telefone || '', cep: supplier?.cep || '',
      endereco: supplier?.endereco || '', numero: supplier?.numero || '', complemento: supplier?.complemento || '',
      bairro: supplier?.bairro || '', cidade: supplier?.cidade || '', estado: supplier?.estado || '',
      banco: bank.banco || '', agencia: bank.agencia || '', conta: bank.conta || '', tipo_conta: bank.tipo_conta || '',
      tipo_chave_pix: bank.tipo_chave_pix || '', chave_pix: bank.chave_pix || '', titular: bank.titular || '',
      documento_titular: bank.documento_titular || '',
    });
  }, [supplier, bank.agencia, bank.banco, bank.chave_pix, bank.conta, bank.documento_titular, bank.tipo_chave_pix, bank.tipo_conta, bank.titular]);

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Page title="Perfil e dados de pagamento" description="Mantenha os dados de contato e recebimento atualizados para evitar atrasos no pagamento.">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="font-black">Contato e endereço</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="E-mail" value={form.email} onChange={(value) => set('email', value)} />
            <Field label="Telefone" value={form.telefone} onChange={(value) => set('telefone', value.replace(/\D/g, '').slice(0, 11))} />
            <Field label="CEP" value={form.cep} onChange={(value) => set('cep', value.replace(/\D/g, '').slice(0, 8))} />
            <Field label="Endereço" value={form.endereco} onChange={(value) => set('endereco', value)} />
            <Field label="Número" value={form.numero} onChange={(value) => set('numero', value)} />
            <Field label="Complemento" value={form.complemento} onChange={(value) => set('complemento', value)} />
            <Field label="Bairro" value={form.bairro} onChange={(value) => set('bairro', value)} />
            <Field label="Cidade" value={form.cidade} onChange={(value) => set('cidade', value)} />
            <Field label="UF" value={form.estado} onChange={(value) => set('estado', value.toUpperCase().slice(0, 2))} />
          </div>
        </section>
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="font-black">Dados bancários e PIX</h2>
          <p className="mt-1 text-xs text-neutral-500">Os pagamentos só devem ser feitos para os dados registrados neste perfil.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Banco" value={form.banco} onChange={(value) => set('banco', value)} />
            <Field label="Agência" value={form.agencia} onChange={(value) => set('agencia', value)} />
            <Field label="Conta" value={form.conta} onChange={(value) => set('conta', value)} />
            <Field label="Tipo de conta" value={form.tipo_conta} onChange={(value) => set('tipo_conta', value)} />
            <Field label="Tipo de chave PIX" value={form.tipo_chave_pix} onChange={(value) => set('tipo_chave_pix', value)} />
            <Field label="Chave PIX" value={form.chave_pix} onChange={(value) => set('chave_pix', value)} />
            <Field label="Titular" value={form.titular} onChange={(value) => set('titular', value)} />
            <Field label="CPF/CNPJ do titular" value={form.documento_titular} onChange={(value) => set('documento_titular', value.replace(/\D/g, '').slice(0, 14))} />
          </div>
        </section>
      </div>
      <button
        type="button"
        disabled={saving || !form.email.trim() || ![10, 11].includes(form.telefone.length)}
        onClick={() => void onSave({
          email: form.email.trim(), telefone: form.telefone, cep: form.cep, endereco: form.endereco, numero: form.numero,
          complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, estado: form.estado,
          dados_bancarios: {
            banco: form.banco, agencia: form.agencia, conta: form.conta, tipo_conta: form.tipo_conta,
            tipo_chave_pix: form.tipo_chave_pix, chave_pix: form.chave_pix, titular: form.titular,
            documento_titular: form.documento_titular,
          },
        })}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-black text-white disabled:opacity-50"
      >
        <Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar perfil'}
      </button>
    </Page>
  );
}

function ProductRequestModal({ isOpen, snapshot, request, saving, onClose, onSubmit }: {
  isOpen: boolean;
  snapshot: SupplierSnapshot;
  request: Record<string, any> | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [type, setType] = useState<'existente' | 'novo'>('existente');
  const [form, setForm] = useState({ produto_id: '', nome: '', descricao: '', codigo_barras: '', custo_unitario: '', quantidade_minima: '1', prazo_entrega_dias: '0', observacoes: '' });

  useEffect(() => {
    if (!isOpen) return;
    const nextType = request?.tipo === 'novo' ? 'novo' : 'existente';
    setType(nextType);
    setForm({
      produto_id: request?.produto_id || snapshot.catalog[0]?.id || '',
      nome: request?.nome || '',
      descricao: request?.descricao || '',
      codigo_barras: request?.codigo_barras || '',
      custo_unitario: String(request?.custo_unitario ?? ''),
      quantidade_minima: String(request?.quantidade_minima ?? 1),
      prazo_entrega_dias: String(request?.prazo_entrega_dias ?? 0),
      observacoes: request?.observacoes || '',
    });
  }, [isOpen, request, snapshot.catalog]);

  const valid = type === 'existente' ? Boolean(form.produto_id) : form.nome.trim().length >= 3;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={request ? 'Corrigir solicitação de produto' : 'Solicitar produto'} size="wide">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1">
          <button type="button" disabled={Boolean(request)} onClick={() => setType('existente')} className={`rounded-lg py-3 text-sm font-black ${type === 'existente' ? 'bg-white shadow' : 'text-neutral-500'} disabled:opacity-60`}>Produto existente</button>
          <button type="button" disabled={Boolean(request)} onClick={() => setType('novo')} className={`rounded-lg py-3 text-sm font-black ${type === 'novo' ? 'bg-white shadow' : 'text-neutral-500'} disabled:opacity-60`}>Novo produto</button>
        </div>
        {request?.motivo_analise && <p className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Ajuste solicitado: {request.motivo_analise}</p>}
        {type === 'existente' ? (
          <label className="block text-sm font-bold">Produto da loja
            <select value={form.produto_id} disabled={Boolean(request)} onChange={(event) => setForm({ ...form, produto_id: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 disabled:bg-neutral-100">
              {request?.produto_id && <option value={request.produto_id}>{request.produto_existente_nome || 'Produto selecionado'}</option>}
              {snapshot.catalog.map((item) => <option key={item.id} value={item.id}>{item.nome} · estoque {item.estoque_disponivel || 0}</option>)}
            </select>
          </label>
        ) : (
          <>
            <Field label="Nome do produto" value={form.nome} onChange={(value) => setForm({ ...form, nome: value })} />
            <label className="block text-sm font-bold">Descrição<textarea rows={3} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>
            <Field label="Código de barras" value={form.codigo_barras} onChange={(value) => setForm({ ...form, codigo_barras: value.replace(/\D/g, '') })} />
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Custo unitário" type="number" value={form.custo_unitario} onChange={(value) => setForm({ ...form, custo_unitario: value })} />
          <Field label="Quantidade mínima" type="number" value={form.quantidade_minima} onChange={(value) => setForm({ ...form, quantidade_minima: value })} />
          <Field label="Prazo em dias" type="number" value={form.prazo_entrega_dias} onChange={(value) => setForm({ ...form, prazo_entrega_dias: value })} />
        </div>
        <label className="block text-sm font-bold">Observações<textarea rows={3} value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>
        <button
          type="button"
          disabled={saving || !valid}
          onClick={() => void onSubmit({
            ...form,
            request_id: request?.id || null,
            tipo: type,
            custo_unitario: Number(form.custo_unitario || 0),
            quantidade_minima: Number(form.quantidade_minima || 1),
            prazo_entrega_dias: Number(form.prazo_entrega_dias || 0),
          })}
          className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white disabled:opacity-50"
        >
          {saving ? 'Enviando...' : request ? 'Reenviar correção' : 'Enviar para análise'}
        </button>
      </div>
    </Modal>
  );
}

function DeliveryModal({ order, supplierId, saving, onClose, onSubmit }: {
  order: SupplierOrder | null;
  supplierId: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (requestId: string, payload: Record<string, unknown>, xml: File | null, pdf: File | null) => Promise<void>;
}) {
  const [requestId, setRequestId] = useState(generateUUID());
  const [form, setForm] = useState({ numero_nota: '', serie_nota: '', chave_nfe: '', data_emissao: new Date().toISOString().slice(0, 10), valor_total_nota: '', vencimento: '', observacoes: '' });
  const [items, setItems] = useState<Array<Record<string, any>>>([]);
  const [xml, setXml] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);

  useEffect(() => {
    if (!order) return;
    setRequestId(generateUUID());
    setItems((order.items || [])
      .filter((item) => item.quantidade_pedida > item.quantidade_aprovada)
      .map((item) => ({
        pedido_item_id: item.id,
        nome: item.produto_nome_snapshot,
        quantidade_entregue: String(item.quantidade_pedida - item.quantidade_aprovada),
        max: item.quantidade_pedida - item.quantidade_aprovada,
        custo_unitario_nota: String(item.custo_unitario),
        lote: '',
        validade: '',
      })));
    setForm({
      numero_nota: '',
      serie_nota: '',
      chave_nfe: '',
      data_emissao: new Date().toISOString().slice(0, 10),
      valor_total_nota: '',
      vencimento: order.vencimento_previsto || '',
      observacoes: '',
    });
    setXml(null);
    setPdf(null);
  }, [order]);

  const total = Number(form.valor_total_nota);
  const keyValid = !form.chave_nfe || form.chave_nfe.length === 44;
  const itemsValid = items.some((item) => Number(item.quantidade_entregue) > 0)
    && items.every((item) => Number(item.quantidade_entregue) >= 0 && Number(item.quantidade_entregue) <= Number(item.max) && Number(item.custo_unitario_nota) >= 0);
  const valid = Boolean(form.numero_nota.trim())
    && Boolean(form.data_emissao)
    && form.valor_total_nota.trim() !== ''
    && Number.isFinite(total)
    && total >= 0
    && keyValid
    && Boolean(xml || pdf)
    && itemsValid;

  return (
    <Modal isOpen={Boolean(order)} onClose={onClose} title={`Informar entrega · ${order?.codigo || ''}`} size="wide">
      {order && (
        <div className="space-y-5">
          <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">O estoque e o pagamento só serão liberados após a conferência da GSA. Em caso de falha de rede, tente novamente: a operação possui proteção contra duplicidade.</p>
          <input type="hidden" value={supplierId} readOnly />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Número da NF" value={form.numero_nota} onChange={(value) => setForm({ ...form, numero_nota: value })} />
            <Field label="Série" value={form.serie_nota} onChange={(value) => setForm({ ...form, serie_nota: value })} />
            <Field label="Data de emissão" type="date" value={form.data_emissao} onChange={(value) => setForm({ ...form, data_emissao: value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chave NF-e (44 dígitos)" value={form.chave_nfe} onChange={(value) => setForm({ ...form, chave_nfe: value.replace(/\D/g, '').slice(0, 44) })} />
            <Field label="Valor total da nota" type="number" value={form.valor_total_nota} onChange={(value) => setForm({ ...form, valor_total_nota: value })} />
          </div>
          {!keyValid && <p className="text-xs font-semibold text-red-600">A chave da NF-e deve possuir exatamente 44 dígitos.</p>}
          <div>
            <h3 className="mb-2 font-black">Quantidades entregues</h3>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.pedido_item_id} className="grid gap-2 rounded-xl bg-neutral-50 p-3 sm:grid-cols-[1fr_110px_130px]">
                  <div><p className="text-sm font-bold">{item.nome}</p><p className="text-xs text-neutral-400">Saldo do pedido: {item.max}</p></div>
                  <input  type="number" min="0" max={item.max} value={item.quantidade_entregue} inputMode="numeric" onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantidade_entregue: event.target.value } : entry))} className="rounded-lg border border-neutral-200 p-2" />
                  <input  type="number" min="0" step="0.01" value={item.custo_unitario_nota} inputMode="numeric" onChange={(event) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, custo_unitario_nota: event.target.value } : entry))} className="rounded-lg border border-neutral-200 p-2" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm font-bold"><FileUp className="mb-2 h-5 w-5" />XML da nota<input type="file" accept=".xml,application/xml,text/xml" onChange={(event) => setXml(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs" />{xml && <span className="mt-1 block text-emerald-700">{xml.name}</span>}</label>
            <label className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm font-bold"><FileUp className="mb-2 h-5 w-5" />PDF da nota<input type="file" accept=".pdf,application/pdf" onChange={(event) => setPdf(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs" />{pdf && <span className="mt-1 block text-emerald-700">{pdf.name}</span>}</label>
          </div>
          <button
            type="button"
            disabled={saving || !valid}
            onClick={() => void onSubmit(requestId, {
              ...form,
              chave_nfe: form.chave_nfe || null,
              valor_total_nota: total,
              items: items
                .filter((item) => Number(item.quantidade_entregue) > 0)
                .map((item) => ({
                  pedido_item_id: item.pedido_item_id,
                  quantidade_entregue: Number(item.quantidade_entregue),
                  custo_unitario_nota: Number(item.custo_unitario_nota),
                })),
            }, xml, pdf)}
            className="w-full rounded-xl bg-emerald-600 py-3 font-black text-white disabled:opacity-50"
          >
            {saving ? 'Enviando...' : 'Enviar entrega e nota fiscal'}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Page({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="space-y-6"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-neutral-500">{description}</p></div>{action}</header>{children}</div>;
}
function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Package }) { return <article className="rounded-2xl border border-neutral-200 bg-white p-5"><div className="flex justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div><Icon className="h-6 w-6 text-emerald-600" /></div></article>; }
function Small({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-neutral-50 p-3"><p className="text-[9px] font-black uppercase text-neutral-400">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>; }
function Status({ value }: { value: string }) { const good = ['ativo', 'aprovado', 'pago', 'concluido'].includes(value); const bad = ['reprovado', 'cancelado', 'suspenso'].includes(value); return <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${good ? 'bg-emerald-50 text-emerald-700' : bad ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{String(value || '').replaceAll('_', ' ')}</span>; }
function Empty({ text }: { text: string }) { return <div className="col-span-full rounded-2xl border border-dashed border-neutral-200 p-12 text-center text-sm text-neutral-400">{text}</div>; }
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm font-bold">{label}<input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 p-3" /></label>; }

import crypto from 'node:crypto';
import { fail } from './domain.mjs';

const loopback = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const paymentUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['checkout.infinitepay.com.br', 'checkout.infinitepay.io', 'checkout.infinitepay.com'].includes(url.hostname)) throw new Error();
    return url.href;
  } catch { throw fail('A InfinitePay retornou um link de pagamento inválido.', 502); }
};

export function validateCoupon(coupon, subtotal, clientId, orders, invoiceCode, number, currentDay) {
  if (!coupon || coupon.status !== 'Ativo') throw fail('Cupom inválido ou suspenso.', 400);
  if (coupon.start && coupon.start > currentDay) throw fail('Este benefício ainda não está disponível.', 400);
  if (coupon.end && coupon.end < currentDay) throw fail('Este benefício está vencido.', 400);
  const code = coupon.code.trim().toUpperCase();
  const uses = orders.filter(o => o.clientId === String(clientId) && o.couponCode === code &&
    ['Pago', 'Pendente'].includes(o.status) && !(o.status === 'Pendente' && o.invoiceCode === invoiceCode && o.installmentNumber === number)).length;
  if (uses >= Number(coupon.maxUses || 1)) throw fail('Limite de utilizações deste benefício atingido para este cliente.', 400);
  const value = Number(String(coupon.value).replace('%', '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || (coupon.type === 'Percentual' && value > 100)) throw fail('Este benefício possui um valor inválido.', 400);
  let discount = coupon.type === 'Percentual' ? Math.round(subtotal * value / 100) : Math.round(value * 100);
  if (coupon.maxDiscount) {
    const limit = Math.round(Number(String(coupon.maxDiscount).replace(',', '.')) * 100);
    if (!Number.isSafeInteger(limit) || limit <= 0) throw fail('Limite de desconto inválido.', 400);
    discount = Math.min(discount, limit);
  }
  return Math.min(subtotal, discount);
}

// The existing portal has a local profile switcher. Demo invoices are kept for
// the client preview, while invoices emitted by the administrative portal are
// also included so both views exercise the same shared records.
const demoInvoices = () => [
  { id: 'demo-fat-1', clientId: '108', code: 'FAT-2024-00101', title: 'Honorários Profissionais — Abertura de Empresa (LTDA)', orderCode: 'OS105', total: 250000, due: '2026-10-05', status: 'Pendente', installments: [
    { number: 1, id: 1, due: '2026-10-05', amount: 125000, status: 'Pendente' },
    { number: 2, id: 2, due: '2026-11-05', amount: 125000, status: 'Pendente' }
  ] },
  { id: 'demo-fat-0', clientId: '108', code: 'FAT-2024-00089', title: 'Taxa Inicial de Abertura Cadastral & Consulta Prévia', total: 35000, due: '2026-09-20', status: 'Pago', installments: [{ number: 1, id: 1, due: '2026-09-20', amount: 35000, status: 'Pago' }] }
];

export function registerInfinitePay(app, deps) {
  const { all, put, transaction, now, auth, adminAuth, wrap, updateLocalEnv, broadcastEvent } = deps;
  const fetcher = deps.fetcher || fetch;
  const localDemo = process.env.NODE_ENV !== 'production';
  if (localDemo && !all('payment_setup').some(r => r.id === 'payment-setup-v1')) {
    transaction(() => {
      if (!all('payment_coupons').length) put('payment_coupons', { id: 'payment-coupon-BEMVINDO10', code: 'BEMVINDO10', type: 'Percentual', value: '10', status: 'Ativo', maxUses: 1 });
      put('payment_setup', { id: 'payment-setup-v1', initialized: true });
    });
  }
  const configuration = () => ({
    apiKey: String(process.env.INFINITEPAY_API_KEY || '').trim(),
    handle: String(process.env.INFINITEPAY_HANDLE || 'gsahub_solucoesdigital').trim(),
    enabled: process.env.INFINITEPAY_ENABLED === 'true',
    redirectUrl: process.env.INFINITEPAY_REDIRECT_URL || '',
    webhookUrl: process.env.INFINITEPAY_WEBHOOK_URL || ''
  });
  const safeConfig = () => {
    const { apiKey, ...rest } = configuration();
    return { ...rest, configured: Boolean(apiKey), demo: localDemo };
  };
  const access = (admin = false) => (req, res, next) => {
    // Origin validation also protects local credential writes from other sites.
    if (req.headers['sec-fetch-site'] === 'cross-site') return next(fail('Origem não autorizada.', 403));
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (localDemo ? !loopback(origin.hostname) : origin.host !== req.headers.host) return next(fail('Origem não autorizada.', 403));
      } catch { return next(fail('Origem inválida.', 403)); }
    }
    if (localDemo && !req.cookies.gsa_session) {
      req.paymentUser = { id: 'local-demo', clientId: '108', role: admin ? 'admin' : 'client' };
      return next();
    }
    try {
      auth(req, res, () => {
        if (admin) adminAuth(req, res, () => { req.paymentUser = req.user; next(); });
        else { req.paymentUser = req.user; next(); }
      });
    } catch (error) { next(error); }
  };
  const invoiceKind = user => user.id === 'local-demo' && user.role !== 'admin' ? 'demo_payment_invoices' : 'invoices';
  const invoicesFor = user => {
    const kind = invoiceKind(user);
    if (kind === 'demo_payment_invoices' && !all(kind).length) demoInvoices().forEach(invoice => put(kind, invoice));
    if (kind === 'demo_payment_invoices') {
      const demo = all(kind).map(invoice => ({ ...invoice, _kind: kind }));
      const shared = all('invoices')
        .filter(invoice => String(invoice.clientId) === String(user.clientId))
        .map(invoice => ({ ...invoice, _kind: 'invoices' }));
      return [...demo, ...shared];
    }
    return all(kind)
      .filter(invoice => user.role === 'admin' || String(invoice.clientId) === String(user.clientId))
      .map(invoice => ({ ...invoice, _kind: kind }));
  };
  const quote = (user, body) => {
    const invoice = invoicesFor(user).find(i => i.code === body.invoiceCode);
    if (!invoice) throw fail('Fatura não encontrada para este cliente.', 404);
    const number = Number(body.installmentNumber);
    const inst = invoice.installments.find(i => Number(i.number ?? i.id) === number);
    if (!inst) throw fail('Parcela não encontrada.', 404);
    if (inst.status === 'Pago') throw fail('Esta parcela já foi quitada.', 409);
    const subtotal = Number(inst.amount) - Number(inst.paidAmount || 0);
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw fail('Não há saldo pendente nesta parcela.', 400);
    const code = String(body.couponCode || '').trim().toUpperCase();
    const coupon = code ? all('payment_coupons').find(c => c.code === code) : null;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const discount = code ? validateCoupon(coupon, subtotal, invoice.clientId, all('infinitepay_orders'), invoice.code, number, day) : 0;
    return { invoice, inst, subtotal, discount, amount: subtotal - discount, couponCode: code, kind: invoice._kind || invoiceKind(user) };
  };
  async function request(endpoint, payload) {
    const config = configuration();
    if (!config.apiKey) throw fail('Configure a chave API da InfinitePay nas Regras Financeiras.', 503);
    let response;
    try {
      response = await fetcher(`https://api.checkout.infinitepay.io${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000), redirect: 'error'
      });
    } catch { throw fail('Não foi possível conectar à InfinitePay. Tente novamente.', 502); }
    const data = await response.json().catch(() => ({}));
    // Provider response bodies may contain credentials; never relay raw errors.
    if (!response.ok) throw fail(response.status === 401 || response.status === 403
      ? 'A InfinitePay recusou a autenticação. Verifique a chave e a habilitação do checkout.'
      : `A InfinitePay não concluiu a solicitação (${response.status}).`, 502);
    return data;
  }
  const normalizeUrl = (value, name) => {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.username || url.password || (url.protocol !== 'https:' && !(localDemo && url.protocol === 'http:' && loopback(url.hostname)))) throw new Error();
      if (name === 'webhook' && loopback(url.hostname)) throw new Error();
      return url.href;
    } catch { throw fail(name === 'webhook' ? 'O webhook precisa de uma URL HTTPS pública.' : 'Informe uma URL válida de retorno.', 400); }
  };
  const ordersInFlight = new Map();
  app.get('/api/infinitepay/status', access(), (req, res) => res.json(safeConfig()));
  app.post('/api/infinitepay/config', access(true), wrap((req, res) => {
    const body = req.body || {};
    const current = configuration();
    const key = String(body.apiKey || '').trim();
    const handle = String(body.handle || current.handle).replace(/^\$/, '').trim();
    if (key && !/^inchk_[a-zA-Z0-9_-]{20,200}$/.test(key)) throw fail('Formato da chave API inválido.', 400);
    if (!/^[a-zA-Z0-9._-]{2,100}$/.test(handle)) throw fail('InfiniteTag inválida.', 400);
    const config = {
      INFINITEPAY_HANDLE: handle,
      INFINITEPAY_ENABLED: String(body.enabled === undefined ? current.enabled : body.enabled === true),
      INFINITEPAY_REDIRECT_URL: normalizeUrl(body.redirectUrl ?? current.redirectUrl, 'redirect'),
      INFINITEPAY_WEBHOOK_URL: normalizeUrl(body.webhookUrl ?? current.webhookUrl, 'webhook'),
      ...(key ? { INFINITEPAY_API_KEY: key } : {})
    };
    updateLocalEnv(config);
    Object.assign(process.env, config);
    res.json({ ok: true, ...safeConfig() });
  }));

  app.get('/api/infinitepay/invoices', access(), (req, res) => res.json({ invoices: invoicesFor(req.paymentUser), demo: req.paymentUser.id === 'local-demo' }));
  app.get('/api/infinitepay/coupons', access(true), (req, res) => res.json(all('payment_coupons')));
  app.put('/api/infinitepay/coupons', access(true), wrap((req, res) => {
    const list = req.body.coupons;
    if (!Array.isArray(list) || list.length > 1000) throw fail('Lista de benefícios inválida.', 400);
    const codes = new Set();
    const items = list.map(c => {
      const code = String(c.code || '').trim().toUpperCase();
      const value = Number(String(c.value || '').replace('%', '').replace(',', '.'));
      if (!/^[A-Z0-9_-]{2,80}$/.test(code) || codes.has(code)) throw fail('Código inválido ou duplicado.', 400);
      if (!['Percentual', 'Valor fixo'].includes(c.type) || !Number.isFinite(value) || value <= 0 || (c.type === 'Percentual' && value > 100)) throw fail('Valor do benefício inválido.', 400);
      if (!Number.isInteger(Number(c.maxUses || 1)) || Number(c.maxUses || 1) < 1) throw fail('Limite de utilizações inválido.', 400);
      for (const day of [c.start, c.end].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw fail('Data inválida.', 400);
      if (c.start && c.end && c.start > c.end) throw fail('A data final deve ser posterior à inicial.', 400);
      if (c.maxDiscount && (!(Number(String(c.maxDiscount).replace(',', '.')) > 0))) throw fail('Desconto máximo inválido.', 400);
      codes.add(code);
      return { id: `payment-coupon-${code}`, code, value: String(value), type: c.type, status: c.status === 'Ativo' ? 'Ativo' : 'Suspenso', maxUses: Number(c.maxUses || 1), start: c.start || '', end: c.end || '', maxDiscount: c.maxDiscount || '' };
    });
    transaction(() => {
      all('payment_coupons').forEach(c => deps.remove('payment_coupons', c.id));
      items.forEach(c => put('payment_coupons', c));
    });
    res.json(items);
  }));
  app.post('/api/infinitepay/quote', access(), wrap((req, res) => {
    const q = quote(req.paymentUser, req.body || {});
    res.json({ subtotal: q.subtotal, discount: q.discount, amount: q.amount, couponCode: q.couponCode });
  }));
  app.post('/api/infinitepay/links', access(), wrap(async (req, res) => {
    const config = configuration();
    if (!config.enabled) throw fail('Ative a integração InfinitePay nas Regras Financeiras.', 503);
    const q = quote(req.paymentUser, req.body || {});
    if (q.amount <= 0) throw fail('Desconto integral: solicite a baixa administrativa desta parcela.', 400);
    const lock = `${q.kind}:${q.invoice.id}:${q.inst.number}`;
    if (ordersInFlight.has(lock)) throw fail('O checkout desta parcela está sendo gerado. Aguarde.', 409);
    const pending = all('infinitepay_orders').find(o => o.invoiceKind === q.kind && o.invoiceId === q.invoice.id && o.installmentNumber === q.inst.number && o.status === 'Pendente');
    if (pending) {
      if (pending.amount !== q.amount || pending.couponCode !== q.couponCode || pending.handle !== config.handle) throw fail('Esta parcela já tem um checkout em aberto. Conclua esse pagamento antes de alterar o cupom.', 409);
      return res.json({ url: pending.url, orderNsu: pending.orderNsu, subtotal: pending.subtotal, discount: pending.discount, amount: pending.amount });
    }
    ordersInFlight.set(lock, true);
    try {
      const orderNsu = `GSA-${crypto.randomUUID()}`;
      const payload = { handle: config.handle, order_nsu: orderNsu, items: [{ quantity: 1, price: q.amount, description: `${q.invoice.code} — ${q.invoice.title} — Parcela ${q.inst.number}`.slice(0, 250) }] };
      if (config.redirectUrl) payload.redirect_url = config.redirectUrl;
      if (config.webhookUrl) payload.webhook_url = config.webhookUrl;

      // Pre-fill customer data so the client doesn't have to type on InfinitePay's checkout
      const clientId = q.invoice.clientId;
      const client = clientId ? all('clients').find(c => String(c.id) === String(clientId)) : null;
      if (client) {
        const phone = String(client.whatsapp || client.phone || '').replace(/\D/g, '');
        const customer = { name: client.name };
        if (client.email) customer.email = client.email;
        if (phone.length >= 10) customer.phone_number = '+55' + phone;
        payload.customer = customer;
      }

      const result = await request('/links', payload);
      const url = paymentUrl(result.url || result.checkout_url || result.link);
      put('infinitepay_orders', { id: `infinitepay-${orderNsu}`, orderNsu, handle: config.handle, invoiceKind: q.kind, invoiceId: q.invoice.id, invoiceCode: q.invoice.code, clientId: String(q.invoice.clientId), installmentNumber: q.inst.number, subtotal: q.subtotal, discount: q.discount, amount: q.amount, couponCode: q.couponCode, status: 'Pendente', url });
      res.json({ url, orderNsu, subtotal: q.subtotal, discount: q.discount, amount: q.amount });
    } finally { ordersInFlight.delete(lock); }
  }));

  function settle(orderId, confirmed, transactionNsu, slug) {
    if (confirmed.success !== true || confirmed.paid !== true) return false;
    return transaction(() => {
      const order = all('infinitepay_orders').find(o => o.id === orderId);
      if (order.status === 'Pago') return true;
      if (!Number.isSafeInteger(confirmed.amount) || confirmed.amount !== order.amount || !Number.isSafeInteger(confirmed.paid_amount) || confirmed.paid_amount < order.amount) throw fail('O valor confirmado não corresponde ao pedido.', 409);
      if (all('infinitepay_orders').some(o => o.id !== order.id && o.transactionNsu === transactionNsu)) throw fail('Esta transação já foi registrada.', 409);
      const invoice = all(order.invoiceKind).find(i => i.id === order.invoiceId);
      const inst = invoice?.installments?.find(i => i.number === order.installmentNumber);
      if (!inst || inst.status === 'Pago' || Number(inst.amount) - Number(inst.paidAmount || 0) !== order.subtotal) throw fail('A parcela mudou desde a criação do checkout. Conciliação necessária.', 409);
      const method = confirmed.capture_method === 'credit_card' ? 'Cartão de Crédito' : confirmed.capture_method === 'pix' ? 'Pix' : 'InfinitePay';
      const at = now();
      const payment = { at, amount: order.amount, method, installments: Number(confirmed.installments) || 1, installment: inst.id ?? inst.number, transactionNsu, couponCode: order.couponCode, discount: order.discount };
      inst.status = 'Pago'; inst.paidAt = at; inst.paidAmount = order.subtotal; inst.paymentMethod = method;
      inst.checkoutAmount = order.amount; inst.couponDiscount = order.discount;
      invoice.payments = [...(invoice.payments || []), payment];
      invoice.paymentHistory = [...(invoice.paymentHistory || []), payment];
      invoice.status = invoice.installments.every(i => i.status === 'Pago') ? 'Pago' : 'Pendente';
      put(order.invoiceKind, invoice);
      put('infinitepay_orders', { ...order, status: 'Pago', paidAt: at, paidAmount: order.amount, providerPaidAmount: confirmed.paid_amount, captureMethod: confirmed.capture_method, transactionNsu, slug });
      deps.audit({ id: 'infinitepay', name: 'InfinitePay', role: 'system' }, 'invoices', invoice, `Pagamento confirmado — ${method} — ${invoice.code}, parcela ${inst.number}; recebido R$ ${(order.amount / 100).toFixed(2)}; desconto R$ ${(order.discount / 100).toFixed(2)}.`);
      return true;
    });
  }
  async function check(order, transactionNsu, slug) {
    if (!transactionNsu || !slug || typeof transactionNsu !== 'string' || typeof slug !== 'string' || transactionNsu.length > 200 || slug.length > 200) throw fail('Dados de confirmação incompletos.', 400);
    const result = await request('/payment_check', { handle: order.handle, order_nsu: order.orderNsu, transaction_nsu: transactionNsu, slug });
    const paid = settle(order.id, result, transactionNsu, slug);
    if (paid) broadcastEvent('reload');
    return paid;
  }
  const orderFor = user => orderNsu => {
    const order = all('infinitepay_orders').find(o => o.orderNsu === orderNsu);
    if (!order || (user.role !== 'admin' && String(order.clientId) !== String(user.clientId))) throw fail('Checkout não encontrado.', 404);
    if (user.id === 'local-demo' && !['demo_payment_invoices', 'invoices'].includes(order.invoiceKind)) throw fail('Checkout não encontrado.', 404);
    return order;
  };
  app.get('/api/infinitepay/orders/:orderNsu', access(), wrap((req, res) => {
    const order = orderFor(req.paymentUser)(req.params.orderNsu);
    res.json({ status: order.status, invoiceCode: order.invoiceCode, installmentNumber: order.installmentNumber });
  }));
  app.post('/api/infinitepay/payment-check', access(), wrap(async (req, res) => {
    const body = req.body || {};
    const order = orderFor(req.paymentUser)(body.orderNsu);
    const paid = await check(order, body.transactionNsu, body.slug);
    res.json({ paid, invoiceCode: order.invoiceCode, installmentNumber: order.installmentNumber });
  }));
  app.post('/api/infinitepay/webhook', wrap(async (req, res) => {
    const body = req.body || {};
    const order = all('infinitepay_orders').find(o => o.orderNsu === body.order_nsu);
    if (!order) return res.status(400).json({ success: false, message: 'Pedido não encontrado.' });
    // Treat webhook fields as a notification only. Settlement depends on a
    // provider-to-server lookup, even when the caller supplies a paid amount.
    try {
      const paid = await check(order, body.transaction_nsu, body.invoice_slug || body.slug);
      res.status(paid ? 200 : 400).json({ success: paid, message: paid ? null : 'Pagamento ainda não confirmado.' });
    } catch { res.status(400).json({ success: false, message: 'Não foi possível confirmar o pagamento.' }); }
  }));
}

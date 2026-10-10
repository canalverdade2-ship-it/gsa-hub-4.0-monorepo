import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5180',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function deriveKey() {
  const secret = Deno.env.get('PAYMENT_CONFIG_ENCRYPTION_KEY') || '';
  if (secret.length < 32) throw fail('Configure PAYMENT_CONFIG_ENCRYPTION_KEY nas variáveis da Edge Function.', 503);
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(text: string) {
  if (!text) return '';
  const key = await deriveKey(), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
}
async function decrypt(value: string) {
  if (!value) return '';
  const [ivText, dataText] = value.split('.');
  const bytes = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(ivText) }, await deriveKey(), bytes(dataText));
  return new TextDecoder().decode(decrypted);
}
const urlFor = (value: unknown, kind: 'redirect' | 'webhook') => {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw fail(kind === 'webhook' ? 'O webhook precisa ser uma URL HTTPS pública.' : 'Informe uma URL HTTPS válida de retorno.'); }
};
const providerUrl = (value: unknown) => {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || !['checkout.infinitepay.com.br','checkout.infinitepay.io','checkout.infinitepay.com'].includes(url.hostname)) throw new Error();
    return url.href;
  } catch { throw fail('A InfinitePay retornou um link inválido.', 502); }
};

export async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
  const path = String(body.path || new URL(request.url).searchParams.get('path') || '');
  const verb = String(body.method || request.method).toUpperCase();
  const action = String(body.action || path.replace(/^\/api\/infinitepay\//, '').replaceAll('/', '-'));
  const webhook = action === 'webhook' || (!token && Boolean(body.order_nsu));
  const privileged = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    let user: any = null;
    if (!webhook) {
      if (!token) throw fail('Sessão necessária.', 401);
      const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { data, error } = await caller.auth.getUser(token);
      if (error || !data.user) throw fail('Sessão inválida.', 401);
      const { data: profile, error: profileError } = await privileged.from('gsa_profiles').select('id,role,customer_id,active').eq('id', data.user.id).single();
      if (profileError || !profile?.active) throw fail('Este acesso está desativado.', 403);
      user = { ...profile, email: data.user.email };
      if (user.role === 'admin') {
        const module = action === 'status' ? 'settings' : action === 'coupons' ? 'coupons' : 'finance';
        const { data: allowed, error: permissionError } = await caller.rpc('gsa_admin_has_module', { p_module: module });
        if (permissionError || !allowed) throw fail('Seu usuário não tem acesso a este recurso.', 403);
      }
    }

    const [{ data: settingRow }, { data: customerRow }] = await Promise.all([
      privileged.from('gsa_private_settings').select('value').eq('key','infinitepay').maybeSingle(),
      user?.customer_id ? privileged.from('gsa_clients').select('legacy_id,name,email,phone,metadata').eq('id',user.customer_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    const saved = settingRow?.value || {};
    const apiKey = saved.apiKeyCiphertext ? await decrypt(saved.apiKeyCiphertext) : '';
    const config = {
      apiKey, handle: String(saved.handle || 'gsahub_solucoesdigital'), enabled: saved.enabled === true,
      redirectUrl: String(saved.redirectUrl || ''), webhookUrl: String(saved.webhookUrl || '')
    };
    const safeConfig = { configured: Boolean(apiKey), handle: config.handle, enabled: config.enabled, redirectUrl: config.redirectUrl, webhookUrl: config.webhookUrl, demo: false };
    const legacyClientId = String(customerRow?.legacy_id || '');
    const getRecords = async (kind: string) => {
      let query = privileged.from('gsa_legacy_records').select('id,kind,customer_id,payload').eq('kind',kind);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r.payload, id: r.payload?.id ?? r.id }));
    };
    const putRecord = async (kind: string, row: any) => {
      const customerId = row.clientId == null ? null : (await privileged.from('gsa_clients').select('id').eq('legacy_id',String(row.clientId)).maybeSingle()).data?.id || null;
      const { error } = await privileged.from('gsa_legacy_records').upsert({ kind, id: String(row.id), customer_id: customerId, payload: row, updated_at: new Date().toISOString() }, { onConflict: 'kind,id' });
      if (error) throw error;
    };
    const invoices = async () => {
      const rows = await getRecords('invoices');
      return rows.filter((invoice: any) => user?.role === 'admin' || String(invoice.clientId) === legacyClientId);
    };
    const requireAdmin = () => { if (user?.role !== 'admin') throw fail('Ação exclusiva da administração.', 403); };
    const requireClient = () => { if (user?.role !== 'client') throw fail('Ação exclusiva do cliente.', 403); };
    const makeQuote = async () => {
      requireClient();
      const list = await invoices();
      const invoice = list.find((row: any) => String(row.code) === String(body.invoiceCode));
      if (!invoice) throw fail('Fatura não encontrada para este cliente.', 404);
      const installmentNumber = Number(body.installmentNumber);
      const installment = (invoice.installments || []).find((row: any) => Number(row.number ?? row.id) === installmentNumber);
      if (!installment) throw fail('Parcela não encontrada.', 404);
      if (installment.status === 'Pago') throw fail('Esta parcela já foi quitada.', 409);
      const subtotal = Number(installment.amount) - Number(installment.paidAmount || 0);
      if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw fail('Não há saldo pendente nesta parcela.');
      const couponCode = String(body.couponCode || '').trim().toUpperCase();
      const coupons = couponCode ? await getRecords('payment_coupons') : [];
      const coupon = coupons.find((row: any) => String(row.code).toUpperCase() === couponCode && row.status === 'Ativo');
      let discount = 0;
      if (couponCode) {
        if (!coupon || (coupon.start && coupon.start > day()) || (coupon.end && coupon.end < day())) throw fail('Cupom inválido, suspenso ou fora da validade.');
        const orders = await getRecords('infinitepay_orders');
        const useCount = orders.filter((o: any) => String(o.clientId) === legacyClientId && o.couponCode === couponCode && ['Pago','Pendente'].includes(o.status) && !(o.status === 'Pendente' && o.invoiceCode === invoice.code && Number(o.installmentNumber) === installmentNumber)).length;
        if (useCount >= Number(coupon.maxUses || 1)) throw fail('Limite de utilizações deste benefício atingido para este cliente.');
        const value = Number(String(coupon.value).replace('%','').replace(',','.'));
        if (!Number.isFinite(value) || value <= 0) throw fail('Este benefício possui um valor inválido.');
        discount = coupon.type === 'Percentual' ? Math.round(subtotal * value / 100) : Math.round(value * 100);
        if (coupon.maxDiscount) discount = Math.min(discount, Math.round(Number(String(coupon.maxDiscount).replace(',','.')) * 100));
        discount = Math.min(subtotal, discount);
      }
      return { invoice, installment, subtotal, discount, amount: subtotal - discount, couponCode };
    };
    const providerRequest = async (endpoint: string, payload: any) => {
      if (!config.apiKey) throw fail('Configure a chave API da InfinitePay nas Regras Financeiras.', 503);
      let response: Response;
      try { response = await fetch(`https://api.checkout.infinitepay.io${endpoint}`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${config.apiKey}` }, body:JSON.stringify(payload), signal:AbortSignal.timeout(20000), redirect:'error' }); }
      catch { throw fail('Não foi possível conectar à InfinitePay. Tente novamente.', 502); }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw fail(response.status === 401 || response.status === 403 ? 'A InfinitePay recusou a autenticação. Confira a chave e o checkout.' : `A InfinitePay não concluiu a solicitação (${response.status}).`, 502);
      return result;
    };
    const findOrder = async (orderNsu: string) => {
      const list = await getRecords('infinitepay_orders');
      const order = list.find((row: any) => row.orderNsu === orderNsu);
      if (!order || (user?.role === 'client' && String(order.clientId) !== legacyClientId)) throw fail('Checkout não encontrado.', 404);
      return order;
    };
    const settle = async (order: any, confirmed: any, transactionNsu: string, slug: string) => {
      if (confirmed.success !== true || confirmed.paid !== true) return false;
      if (!Number.isSafeInteger(confirmed.amount) || confirmed.amount !== order.amount || !Number.isSafeInteger(confirmed.paid_amount) || confirmed.paid_amount < order.amount) throw fail('O valor confirmado não corresponde ao pedido.', 409);
      const orders = await getRecords('infinitepay_orders');
      if (orders.some((o: any) => o.id !== order.id && o.transactionNsu === transactionNsu)) throw fail('Esta transação já foi registrada.', 409);
      const invoiceList = await getRecords('invoices');
      const invoice = invoiceList.find((row: any) => String(row.id) === String(order.invoiceId));
      const installment = invoice?.installments?.find((row: any) => Number(row.number ?? row.id) === Number(order.installmentNumber));
      if (!invoice || !installment || installment.status === 'Pago' || Number(installment.amount) - Number(installment.paidAmount || 0) !== order.subtotal) throw fail('A parcela mudou desde o checkout. Conciliação administrativa necessária.', 409);
      const at = new Date().toISOString();
      const method = confirmed.capture_method === 'credit_card' ? 'Cartão de Crédito' : confirmed.capture_method === 'pix' ? 'Pix' : 'InfinitePay';
      const payment = { at, amount: order.amount, method, installments: Number(confirmed.installments) || 1, installment: installment.id ?? installment.number, transactionNsu, couponCode: order.couponCode, discount: order.discount };
      installment.status = 'Pago'; installment.paidAt = at; installment.paidAmount = order.subtotal; installment.paymentMethod = method; installment.checkoutAmount = order.amount; installment.couponDiscount = order.discount;
      invoice.payments = [...(invoice.payments || []), payment]; invoice.paymentHistory = [...(invoice.paymentHistory || []), payment];
      invoice.status = invoice.installments.every((item: any) => item.status === 'Pago') ? 'Pago' : 'Pendente';
      await putRecord(order.invoiceKind || 'invoices', invoice);
      await putRecord('infinitepay_orders', { ...order, status:'Pago', paidAt:at, paidAmount:order.amount, providerPaidAmount:confirmed.paid_amount, captureMethod:confirmed.capture_method, transactionNsu, slug });
      await privileged.from('gsa_legacy_records').upsert({ id:`pay-notice-${crypto.randomUUID()}`,kind:'notifications',customer_id:order.customerUuid,payload:{ id:crypto.randomUUID(),clientId:order.clientId,kind:'invoices',recordId:invoice.id,recordCode:invoice.code,audience:'client',read:false,message:`Pagamento confirmado para ${invoice.code}, parcela ${order.installmentNumber}.`,createdAt:at } }, { onConflict:'kind,id' });
      return true;
    };
    const confirm = async (order: any, transactionNsu: string, slug: string) => {
      if (!transactionNsu || !slug || transactionNsu.length > 200 || slug.length > 200) throw fail('Dados de confirmação incompletos.');
      const result = await providerRequest('/payment_check', { handle:order.handle, order_nsu:order.orderNsu, transaction_nsu:transactionNsu, slug });
      return settle(order, result, transactionNsu, slug);
    };

    if (action === 'status' && verb === 'GET') return json(safeConfig);
    if (action === 'config' && verb === 'POST') {
      requireAdmin();
      const handle = String(body.handle || config.handle).replace(/^\$/,'').trim();
      if (!/^[a-zA-Z0-9._-]{2,100}$/.test(handle)) throw fail('InfiniteTag inválida.');
      const suppliedKey = String(body.apiKey || '').trim();
      if (suppliedKey && !/^inchk_[a-zA-Z0-9_-]{20,200}$/.test(suppliedKey)) throw fail('Formato da chave API inválido.');
      const next = { apiKeyCiphertext: suppliedKey ? await encrypt(suppliedKey) : saved.apiKeyCiphertext || '', handle,
        enabled: body.enabled === undefined ? config.enabled : body.enabled === true,
        redirectUrl: urlFor(body.redirectUrl ?? config.redirectUrl,'redirect'), webhookUrl: urlFor(body.webhookUrl ?? config.webhookUrl,'webhook') };
      const { error } = await privileged.from('gsa_private_settings').upsert({ key:'infinitepay',value:next,updated_at:new Date().toISOString() });
      if (error) throw error;
      return json({ ok:true,configured:Boolean(next.apiKeyCiphertext),handle:next.handle,enabled:next.enabled,redirectUrl:next.redirectUrl,webhookUrl:next.webhookUrl });
    }
    if (action === 'invoices' && verb === 'GET') return json({ invoices: await invoices(), demo:false });
    if (action === 'coupons' && verb === 'GET') return json(await getRecords('payment_coupons'));
    if (action === 'coupons' && verb === 'PUT') {
      requireAdmin();
      if (!Array.isArray(body.coupons) || body.coupons.length > 1000) throw fail('Lista de benefícios inválida.');
      const codes = new Set<string>();
      const rows = body.coupons.map((coupon: any) => {
        const code = String(coupon.code || '').trim().toUpperCase(), value = Number(String(coupon.value || '').replace('%','').replace(',','.'));
        if (!/^[A-Z0-9_-]{2,80}$/.test(code) || codes.has(code) || !['Percentual','Valor fixo'].includes(coupon.type) || !Number.isFinite(value) || value <= 0 || (coupon.type === 'Percentual' && value > 100)) throw fail('Código ou valor do benefício inválido.');
        codes.add(code);
        return { id:`payment-coupon-${code}`,code,value:String(value),type:coupon.type,status:coupon.status === 'Ativo' ? 'Ativo' : 'Suspenso',maxUses:Math.max(1,Number(coupon.maxUses)||1),start:coupon.start||'',end:coupon.end||'',maxDiscount:coupon.maxDiscount||'' };
      });
      const { error: deleteError } = await privileged.from('gsa_legacy_records').delete().eq('kind','payment_coupons');
      if (deleteError) throw deleteError;
      for (const row of rows) await putRecord('payment_coupons',row);
      return json(rows);
    }
    if (action === 'quote' && verb === 'POST') {
      const q = await makeQuote();
      return json({ subtotal:q.subtotal,discount:q.discount,amount:q.amount,couponCode:q.couponCode });
    }
    if (action === 'links' && verb === 'POST') {
      const q = await makeQuote();
      if (!config.enabled) throw fail('Ative a integração InfinitePay nas Regras Financeiras.',503);
      if (q.amount <= 0) throw fail('Desconto integral: solicite a baixa administrativa desta parcela.');
      const orders = await getRecords('infinitepay_orders');
      const pending = orders.find((o: any) => o.invoiceId === q.invoice.id && Number(o.installmentNumber) === Number(q.installment.number) && o.status === 'Pendente');
      if (pending) {
        if (pending.amount !== q.amount || pending.couponCode !== q.couponCode || pending.handle !== config.handle) throw fail('Esta parcela já tem um checkout em aberto. Conclua-o antes de alterar o cupom.',409);
        return json({ url:pending.url,orderNsu:pending.orderNsu,subtotal:pending.subtotal,discount:pending.discount,amount:pending.amount });
      }
      const orderNsu = `GSA-${crypto.randomUUID()}`;
      const payload: any = { handle:config.handle,order_nsu:orderNsu,items:[{quantity:1,price:q.amount,description:`${q.invoice.code} — ${q.invoice.title} — Parcela ${q.installment.number}`.slice(0,250)}] };
      if (config.redirectUrl) payload.redirect_url=config.redirectUrl;
      if (config.webhookUrl) payload.webhook_url=config.webhookUrl;
      if (customerRow) {
        const phone = digits(customerRow.phone || customerRow.metadata?.whatsapp || '');
        payload.customer = { name:customerRow.name, ...(customerRow.email ? {email:customerRow.email}:{}), ...(phone.length >= 10 ? {phone_number:`+55${phone}`}:{}) };
      }
      const result = await providerRequest('/links',payload), checkout = providerUrl(result.url || result.checkout_url || result.link);
      const row = { id:`infinitepay-${orderNsu}`,orderNsu,handle:config.handle,invoiceKind:'invoices',invoiceId:q.invoice.id,invoiceCode:q.invoice.code,clientId:legacyClientId,customerUuid:user.customer_id,installmentNumber:q.installment.number,subtotal:q.subtotal,discount:q.discount,amount:q.amount,couponCode:q.couponCode,status:'Pendente',url:checkout };
      await putRecord('infinitepay_orders',row);
      return json({ url:checkout,orderNsu,subtotal:q.subtotal,discount:q.discount,amount:q.amount });
    }
    if (action.startsWith('orders-') && verb === 'GET') {
      const order = await findOrder(action.slice('orders-'.length));
      return json({ status:order.status,invoiceCode:order.invoiceCode,installmentNumber:order.installmentNumber });
    }
    if (action === 'payment-check' && verb === 'POST') {
      const order = await findOrder(String(body.orderNsu || ''));
      const paid = await confirm(order,String(body.transactionNsu || ''),String(body.slug || ''));
      return json({ paid,invoiceCode:order.invoiceCode,installmentNumber:order.installmentNumber });
    }
    if (webhook && verb === 'POST') {
      const order = await findOrder(String(body.order_nsu || ''));
      const paid = await confirm(order,String(body.transaction_nsu || ''),String(body.invoice_slug || body.slug || ''));
      return json({ success:paid,message:paid ? null : 'Pagamento ainda não confirmado.' },paid ? 200 : 400);
    }
    throw fail('Ação InfinitePay não suportada.',404);
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    return json({ error:error instanceof Error ? error.message : 'Falha na integração InfinitePay.' },status);
  }
}

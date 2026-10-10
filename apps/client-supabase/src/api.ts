import { currentPortalUser, signInPortal, signOutPortal } from './auth';
import { requireSupabase } from './lib/supabase';

export type Row = Record<string, any>;

// Demo data is intentionally disabled in the independent Supabase application.
export const isDemoMode = false;

const stateKeyByKind: Record<string, string> = {
  clients: 'clients', services: 'services', rps: 'rps', proposals: 'proposals',
  contracts: 'contracts', orders: 'orders', invoices: 'invoices', documents: 'documents',
  personal_documents: 'personalDocuments', tasks: 'tasks', calendar_events: 'calendarEvents',
  folders: 'folders', files: 'files', tickets: 'tickets',
  account_deletion_requests: 'accountDeletionRequests', notifications: 'notifications',
  history: 'history', audit: 'audit', internal_folders: 'internalFolders',
  internal_notes: 'internalNotes', wallet_entries: 'walletEntries',
  payment_coupons: 'paymentCoupons', infinitepay_coupons: 'coupons',
  infinitepay_orders: 'paymentOrders', payment_setup: 'paymentSetup', company: 'company'
};

const kindByResource: Record<string, string> = {
  clients: 'clients', services: 'services', rps: 'rps', proposals: 'proposals',
  contracts: 'contracts', orders: 'orders', invoices: 'invoices', documents: 'documents',
  'personal-documents': 'personal_documents', 'personal_documents': 'personal_documents',
  tasks: 'tasks', 'calendar-events': 'calendar_events', calendar_events: 'calendar_events',
  folders: 'folders', files: 'files', tickets: 'tickets', notifications: 'notifications',
  'account-deletion-requests': 'account_deletion_requests', wallet_entries: 'wallet_entries',
  'infinitepay/coupons': 'infinitepay_coupons', 'infinitepay/orders': 'infinitepay_orders'
};

const codeByKind: Record<string, { prefix: string; start: number }> = {
  clients: { prefix: 'CL', start: 101 }, services: { prefix: 'SRV', start: 101 },
  rps: { prefix: 'RPS', start: 101 }, proposals: { prefix: 'PROP', start: 1 },
  contracts: { prefix: 'CONT', start: 1 }, orders: { prefix: 'OS', start: 100 },
  invoices: { prefix: 'FAT', start: 1 }, documents: { prefix: 'DOC', start: 1 },
  tasks: { prefix: 'TAR', start: 1 }, tickets: { prefix: 'TCK', start: 1 }
};

function unwrap<T>(result: { data: T; error: any }): T {
  if (result.error) throw new Error(result.error.message || 'Não foi possível acessar o Supabase.');
  return result.data;
}

async function readKind(kind: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('gsa_legacy_records')
    .select('id, kind, customer_id, payload, imported_at, updated_at')
    .eq('kind', kind)
    .order('imported_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((record) => ({ ...record.payload, id: record.payload?.id ?? record.id }));
}

async function profile() {
  const client = requireSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!authData.user) throw new Error('Sessão encerrada. Entre novamente.');
  const { data, error } = await client.from('gsa_profiles')
    .select('id,role,admin_role,permissions,customer_id,full_name,active')
    .eq('id', authData.user.id).single();
  if (error) throw new Error(error.message);
  if (!data.active) throw new Error('Este acesso está desativado.');
  return {
    id: data.id, name: data.full_name || authData.user.email || 'Usuário',
    email: authData.user.email || '', role: data.role, clientId: data.customer_id, customerUuid: data.customer_id,
    adminRole: data.admin_role, permissions: data.permissions || []
  };
}

async function adminState() {
  const client = requireSupabase();
  const [user, { data, error }, { data: auditRows, error: auditError }] = await Promise.all([
    profile(),
    client.from('gsa_legacy_records')
      .select('id,kind,payload,imported_at')
      .order('imported_at', { ascending: false }),
    client.from('gsa_audit_log').select('id,actor_id,customer_id,action,entity_type,entity_id,before_data,after_data,created_at').order('created_at', { ascending: false }).limit(500)
  ]);
  if (error) throw new Error(error.message);
  if (auditError) throw new Error(auditError.message);
  const groups: Record<string, any[]> = {};
  for (const record of data || []) {
    (groups[record.kind] ||= []).push({ ...record.payload, id: record.payload?.id ?? record.id });
  }
  const company = groups.company?.[0] || null;
  return {
    user, company,
    clients: groups.clients || [], services: groups.services || [], rps: groups.rps || [],
    proposals: groups.proposals || [], contracts: groups.contracts || [], orders: groups.orders || [],
    invoices: groups.invoices || [], documents: groups.documents || [],
    personalDocuments: groups.personal_documents || [], tasks: groups.tasks || [],
    calendarEvents: groups.calendar_events || [], folders: groups.folders || [], files: groups.files || [],
    tickets: groups.tickets || [], accountDeletionRequests: groups.account_deletion_requests || [],
    notifications: groups.notifications || [], history: groups.history || [],
    audit: (auditRows || []).map((row) => ({ id: row.id, actorId: row.actor_id, clientId: row.customer_id, action: row.action, entity: row.entity_type, entityId: row.entity_id, before: row.before_data, after: row.after_data, at: row.created_at }))
  };
}

async function clientState() {
  const client = requireSupabase();
  const { data, error } = await client.rpc('gsa_client_portal_state');
  if (error) throw new Error(error.message);
  return data;
}

async function resolveCustomerId(legacyClientId: unknown) {
  if (legacyClientId == null || legacyClientId === '') return null;
  const client = requireSupabase();
  const key = String(legacyClientId);
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(key)) {
    const { data: byUuid, error: uuidError } = await client.from('gsa_clients').select('id').eq('id', key).maybeSingle();
    if (uuidError) throw new Error(uuidError.message);
    if (byUuid) return byUuid.id as string;
  }
  const { data: exact, error } = await client.from('gsa_clients').select('id').eq('legacy_id', key).maybeSingle();
  if (error) throw new Error(error.message);
  if (exact) return exact.id as string;
  // Existing screens sometimes pass the public client code instead of its numeric id.
  const clients = await readKind('clients');
  const match = clients.find((row) => String(row.id) === key || String(row.code) === key);
  if (match) {
    const { data, error: lookupError } = await client.from('gsa_clients').select('id').eq('legacy_id', String(match.id)).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    return data?.id || null;
  }
  return null;
}

async function saveRecord(kind: string, payload: Row, id?: string) {
  const client = requireSupabase();
  if (kind === 'clients' && !id && payload.id == null) {
    const { data, error } = await client.functions.invoke('client-provision', { body: payload });
    if (error) throw new Error(error.message);
    return data;
  }
  const spec = codeByKind[kind];
  const allocated = id ? null : spec
    ? unwrap(await client.rpc('gsa_next_business_id', { p_kind: kind, p_start: spec.start }))
    : Date.now();
  const recordId = String(id || payload.id || allocated);
  const next: Row = { ...payload, id: payload.id ?? (Number.isFinite(Number(recordId)) ? Number(recordId) : recordId) };
  if (spec && !next.code) {
    const yearly = ['proposals','contracts'].includes(kind) ? `${new Date().getFullYear()}-` : '';
    const padded = ['proposals','contracts'].includes(kind) ? String(recordId).padStart(kind === 'contracts' ? 5 : 4, '0') : recordId;
    next.code = `${spec.prefix}${yearly ? `-${yearly}${padded}` : padded}`;
  }

  if (kind === 'clients') {
    next.code ||= `CL${recordId}`;
    const taxDocument = String(next.taxDocument || next.cpfCnpj || next.tax || '').replace(/\D/g, '');
    const { data: customer, error: clientError } = await client.from('gsa_clients').upsert({
      legacy_id: recordId,
      person_type: taxDocument.length === 14 ? 'PJ' : 'PF',
      tax_document: taxDocument || `PENDING-${recordId}`,
      name: String(next.name || next.companyName || 'Novo cliente'),
      email: next.email || null,
      phone: next.phone || next.telephone || null,
      status: String(next.status || 'active').toLowerCase(),
      metadata: next
    }, { onConflict: 'legacy_id' }).select('id').single();
    if (clientError) throw new Error(clientError.message);
    next._supabaseCustomerId = customer.id;
  }

  const customerId = kind === 'clients' ? (next._supabaseCustomerId || null) : await resolveCustomerId(next.clientId ?? next.client_id);
  delete next._supabaseCustomerId;
  const result = await client.from('gsa_legacy_records').upsert({
    kind, id: recordId, customer_id: customerId, payload: next,
    imported_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }, { onConflict: 'kind,id' }).select('id,kind,customer_id,payload').single();
  if (result.error) throw new Error(result.error.message);
  return { ...result.data.payload, id: result.data.payload?.id ?? result.data.id };
}

async function deleteRecord(kind: string, id: string) {
  const client = requireSupabase();
  const { error } = await client.from('gsa_legacy_records').delete().eq('kind', kind).eq('id', id);
  if (error) throw new Error(error.message);
  if (kind === 'clients') {
    const { error: clientError } = await client.from('gsa_clients').delete().eq('legacy_id', id);
    if (clientError) throw new Error(clientError.message);
  }
  return { ok: true };
}

function errorMessage(error: any) {
  return error?.message || 'Não foi possível concluir a ação no Supabase.';
}

const toCents = (value: unknown) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Informe um valor válido.');
  return Math.round(amount * 100);
};

function commercial(data: Row, service: Row) {
  const base = data.base === undefined ? Number(service.price || 0) : toCents(data.base);
  const extra = toCents(data.extra || 0);
  const subtotal = base + extra;
  const discountInput = Number(data.discount || 0);
  const discount = data.discountType === 'percent'
    ? Math.round(subtotal * discountInput / 100)
    : toCents(discountInput);
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new Error('Desconto inválido.');
  return { base, extra, extraName: String(data.extraName || ''), subtotal, discount,
    discountType: data.discountType || 'fixed', discountInput, total: subtotal - discount };
}

function invoiceInstallments(total: number, count: number, first: string) {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Escolha de 1 a 60 parcelas.');
  const [year, month, day] = first.split('-').map(Number);
  if (!year || !month || !day) throw new Error('Informe a data do primeiro vencimento.');
  return Array.from({ length: count }, (_, index) => {
    const targetMonth = month - 1 + index;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    return { id: index + 1, number: index + 1,
      amount: Math.floor(total / count) + (index < total % count ? 1 : 0),
      due: new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10), status: 'Pendente' };
  });
}

/**
 * Compatibility-shaped data calls backed directly by Supabase Postgres/Auth/
 * Storage. This module deliberately makes no request to the old Express API.
 */
export async function api(path: string, data?: any, method?: string): Promise<any> {
  const client = requireSupabase();
  const verb = (method || (data ? 'POST' : 'GET')).toUpperCase();
  const cleanPath = decodeURIComponent(path.split('?')[0]).replace(/^\/api/, '').replace(/\/$/, '') || '/';
  const parts = cleanPath.split('/').filter(Boolean);

  try {
    if (cleanPath === '/login' && verb === 'POST') {
      const portal = parts.length && data?.email ? 'admin' : (cleanPath.startsWith('/cliente') ? 'client' : data?.email ? 'admin' : 'client');
      return signInPortal(portal === 'admin'
        ? { portal, email: data?.email, password: data?.password }
        : { portal, login: data?.login });
    }
    if (cleanPath === '/logout') return signOutPortal();
    if (cleanPath === '/me') return currentPortalUser();
    if (cleanPath === '/state') return adminState();
    if (cleanPath === '/client-state') return clientState();
    if (cleanPath === '/notifications') {
      const user = await profile();
      if (user.role === 'client') return (await clientState()).notifications || [];
      return readKind('notifications');
    }
    if (cleanPath === '/health') return { ok: true, provider: 'supabase' };
    if (cleanPath === '/me/password' && verb === 'PATCH') {
      const { error } = await client.auth.updateUser({ password: String(data?.newPassword || '') });
      if (error) throw error;
      return { ok: true };
    }
    if (cleanPath.startsWith('/infinitepay/')) {
      const action = cleanPath.slice('/infinitepay/'.length).split('/').join('-');
      const { data: result, error } = await client.functions.invoke('infinitepay', { body: { action, method: verb, path: cleanPath, data } });
      if (error) throw error;
      return result;
    }
    if (parts[0] === 'admin' && parts[1] === 'users') {
      const action = parts[3] === 'password' ? 'password' : parts[3] === 'access' ? 'permissions' : verb === 'POST' ? 'create' : 'list';
      const { data: result, error } = await client.functions.invoke('admin-users', {
        body: { action, userId: parts[2], ...(data || {}) }
      });
      if (error) throw error;
      return result;
    }
    if (cleanPath.startsWith('/govbr/')) {
      const { data: result, error } = await client.functions.invoke('govbr-signature', { body: { method: verb, path: cleanPath, contractId: parts.at(-1), ...(data || {}) } });
      if (error) throw error;
      return result;
    }
    if (cleanPath.startsWith('/cnpj/')) {
      const { data: result, error } = await client.functions.invoke('cnpj-lookup', { body: { cnpj: parts.at(-1) } });
      if (error) throw error;
      return result;
    }
    if (cleanPath.startsWith('/cep/')) {
      const cep = String(parts.at(-1) || '').replace(/\D/g, '');
      if (cep.length !== 8) throw new Error('CEP inválido.');
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Não foi possível consultar o CEP.');
      return response.json();
    }

    if (parts[0] === 'notifications' && parts[2] === 'read' && verb === 'PATCH') {
      const user = await profile();
      if (user.role === 'client') {
        const { error } = await client.rpc('gsa_client_mark_record_notification_read', { p_notification_id: parts[1] });
        if (error) throw error;
      } else {
        const { data: records, error: lookupError } = await client.from('gsa_legacy_records').select('id,payload').eq('kind','notifications');
        if (lookupError) throw lookupError;
        const record = (records || []).find((item) => String(item.payload?.id ?? item.id) === parts[1]);
        const notice = record?.payload;
        if (!notice) throw new Error('Notificação não encontrada.');
        await saveRecord('notifications', { ...notice, read: true, readAt: new Date().toISOString() }, String(record!.id));
      }
      return { ok: true };
    }
    if (parts[0] === 'proposals' && parts.length >= 3 && verb === 'PATCH' && ['accept', 'reject'].includes(parts[2])) {
      const { data: result, error } = await client.rpc('gsa_client_decide_proposal', {
        p_proposal_id: parts[1], p_decision: parts[2], p_reason: data?.reason || null
      });
      if (error) throw error;
      return result;
    }
    if (parts[0] === 'proposals' && parts[2] === 'counteroffer' && verb === 'PATCH') {
      const records = await readKind('proposals');
      const existing = records.find((item) => String(item.id) === parts[1] || String(item.code) === parts[1]);
      if (!existing) throw new Error('Proposta não encontrada.');
      return saveRecord('proposals', {
        ...existing,
        counteroffer: { ...data, createdAt: new Date().toISOString(), status: 'Aguardando análise' },
        status: 'Contraproposta enviada', updatedAt: new Date().toISOString()
      }, String(existing.id));
    }
    if (parts[0] === 'tickets' && parts.length === 1 && verb === 'POST') {
      const user = await profile();
      if (user.role === 'client') {
        const { data: ticket, error } = await client.rpc('gsa_client_create_ticket', {
          p_title: data?.title, p_message: data?.initialMessage, p_order_id: data?.orderId || null
        });
        if (error) throw error;
        return ticket;
      }
    }
    if (parts[0] === 'tickets' && parts[2] === 'message' && verb === 'POST') {
      const user = await profile();
      if (user.role === 'client') {
        let message = String(data?.text || '');
        const attachments: Row[] = [];
        if (data instanceof FormData) {
          message = String(data.get('text') || '');
          const fileValue = data.get('attachments');
          if (fileValue instanceof File) {
            const customerId = String(user.customerUuid || user.clientId || '');
            const objectPath = `${customerId}/tickets/${parts[1]}/${Date.now()}-${fileValue.name.replace(/[^\w.-]/g, '_')}`;
            const upload = await client.storage.from('gsa3-private').upload(objectPath, fileValue, { contentType: fileValue.type, upsert: false });
            if (upload.error) throw upload.error;
            attachments.push({ fileId: objectPath, name: fileValue.name, mimeType: fileValue.type, size: fileValue.size });
          }
        }
        const { data: result, error } = await client.rpc('gsa_client_send_ticket_message', {
          p_ticket_id: parts[1], p_message: message, p_attachments: attachments
        });
        if (error) {
          for (const attachment of attachments) await client.storage.from('gsa3-private').remove([attachment.fileId]);
          throw error;
        }
        return result;
      }
    }
    if (parts[0] === 'account-deletion-requests' && verb === 'POST') {
      const { data: result, error } = await client.rpc('gsa_client_request_account_deletion', { p_reason: data?.reason || '' });
      if (error) throw error;
      return { request: result };
    }

    if (parts[0] === 'account-deletion-requests' && parts[2] === 'approve' && verb === 'PATCH') {
      const request = (await readKind('account_deletion_requests')).find((row) => String(row.id) === parts[1]);
      if (!request) throw new Error('Solicitação de exclusão não encontrada.');
      if (request.status !== 'pending') throw new Error('Esta solicitação já foi processada.');
      await saveRecord('account_deletion_requests', { ...request, status: 'approved', approvedAt: new Date().toISOString() }, String(request.id));
      const clientRecord = (await readKind('clients')).find((row) => String(row.id) === String(request.clientId));
      if (clientRecord) {
        await saveRecord('clients', { ...clientRecord, status: 'inactive', active: false }, String(clientRecord.id));
        const { error } = await client.functions.invoke('admin-users', { body: { action: 'deactivate-client', clientId: String(clientRecord.id) } });
        if (error) throw error;
      }
      return { ok: true };
    }

    if (parts[0] === 'clients' && parts[2] === 'internal-info' && parts[3] === 'folders') {
      const folders = await readKind('internal_folders');
      const folderId = parts[4];
      if (verb === 'POST' && !folderId) {
        const folder = await saveRecord('internal_folders', { ...data, id: crypto.randomUUID(), clientId: parts[1], createdAt: new Date().toISOString() });
        return folder;
      }
      const existing = folders.find((row) => String(row.id) === String(folderId) && String(row.clientId) === parts[1]);
      if (!existing) throw new Error('Pasta interna não encontrada.');
      if (verb === 'DELETE') return deleteRecord('internal_folders', String(existing.id));
      if (verb === 'PATCH') return saveRecord('internal_folders', { ...existing, ...data, id: existing.id }, String(existing.id));
    }

    if (parts[0] === 'clients' && parts[2] === 'internal-info' && parts[3] === 'notes') {
      const notes = await readKind('internal_notes');
      const noteId = parts[4];
      if (verb === 'POST' && !noteId) return saveRecord('internal_notes', { ...data, id: crypto.randomUUID(), clientId: parts[1], createdAt: new Date().toISOString() });
      const existing = notes.find((row) => String(row.id) === String(noteId) && String(row.clientId) === parts[1]);
      if (!existing) throw new Error('Anotação interna não encontrada.');
      if (verb === 'DELETE') return deleteRecord('internal_notes', String(existing.id));
      if (verb === 'PATCH') return saveRecord('internal_notes', { ...existing, ...data, id: existing.id, updatedAt: new Date().toISOString() }, String(existing.id));
    }

    if (parts[0] === 'clients' && parts[2] === 'permanent' && verb === 'DELETE') {
      const { data: result, error } = await client.functions.invoke('admin-users', { body: { action: 'delete-client', clientId: parts[1] } });
      if (error) throw error;
      return result;
    }

    const clientRoute = parts[0] === 'clients' && parts[2] === 'personal-documents';
    const internalRoute = parts[0] === 'clients' && parts[2] === 'internal-info';
    if (verb === 'GET' && clientRoute) return readKind('personal_documents').then((rows) => rows.filter((row) => String(row.clientId) === parts[1]));
    if (verb === 'POST' && clientRoute) {
      return saveRecord('personal_documents', {
        ...data, id: data?.id || crypto.randomUUID(), clientId: parts[1],
        status: data?.status || 'Aguardando envio', createdAt: new Date().toISOString()
      });
    }
    if (verb === 'GET' && internalRoute) {
      const [folders, notes] = await Promise.all([readKind('internal_folders'), readKind('internal_notes')]);
      return { folders: folders.filter((row) => String(row.clientId) === parts[1]), notes: notes.filter((row) => String(row.clientId) === parts[1]) };
    }
    if (parts[0] === 'wallet' && verb === 'GET') {
      const entries = (await readKind('wallet_entries')).filter((row) => String(row.clientId) === parts[1]);
      return { clientId: parts[1], entries, balance: entries.reduce((n, row) => n + (row.type === 'Crédito' ? Number(row.amount) : -Number(row.amount)), 0) };
    }
    if (parts[0] === 'wallet' && verb === 'POST') {
      const entry = await saveRecord('wallet_entries', { ...data, clientId: parts[1], date: new Date().toISOString() });
      const entries = (await readKind('wallet_entries')).filter((row) => String(row.clientId) === parts[1]);
      return { ok: true, entry, balance: entries.reduce((n, row) => n + (row.type === 'Crédito' ? Number(row.amount) : -Number(row.amount)), 0) };
    }

    if (parts[0] === 'invoices' && parts[2] === 'pay' && verb === 'PATCH') {
      const invoices = await readKind('invoices');
      const invoice = invoices.find((row) => String(row.id) === parts[1] || String(row.code) === parts[1]);
      if (!invoice) throw new Error('Fatura não encontrada.');
      const installmentId = parts[3];
      const installments = Array.isArray(invoice.installments) ? invoice.installments : [];
      const installment = installments.find((row: Row) => String(row.id ?? row.number) === installmentId || String(row.number) === installmentId);
      if (!installment) throw new Error('Parcela não encontrada.');
      if (installment.status === 'Pago') throw new Error('Esta parcela já está paga.');
      const at = new Date().toISOString();
      const payment = { at, amount: Number(installment.amount) - Number(installment.paidAmount || 0), method: data?.method || 'Administrativo', note: data?.note || '' };
      const nextInstallments = installments.map((row: Row) => row === installment ? { ...row, status: 'Pago', paidAt: at, paidAmount: payment.amount, paymentMethod: payment.method } : row);
      const updated = { ...invoice, installments: nextInstallments, payments: [...(invoice.payments || []), payment], paymentHistory: [...(invoice.paymentHistory || []), payment], status: nextInstallments.every((row: Row) => row.status === 'Pago') ? 'Pago' : 'Pendente' };
      await saveRecord('invoices', updated, String(invoice.id));
      return { ok: true, invoice: updated };
    }

    if (parts[0] === 'invoices' && parts[2] === 'renegotiate' && verb === 'POST') {
      const invoices = await readKind('invoices');
      const invoice = invoices.find((row) => String(row.id) === parts[1] || String(row.code) === parts[1]);
      if (!invoice) throw new Error('Fatura não encontrada.');
      const interest = Number(data?.interest || 0), penalty = Number(data?.penalty || 0), discount = Number(data?.discount || 0);
      const total = Math.max(0, Number(invoice.total || 0) + interest + penalty - discount);
      const updated = { ...invoice, total, due: data?.due || invoice.due, renegotiation: { interest, penalty, discount, at: new Date().toISOString() } };
      await saveRecord('invoices', updated, String(invoice.id));
      return { ok: true, invoice: updated };
    }
    if (parts[0] === 'company' && verb === 'PATCH') {
      const current = (await readKind('company'))[0] || {};
      return saveRecord('company', { ...current, ...data, id: 'company' }, 'company');
    }

    const resource = parts[0] === 'infinitepay' ? `infinitepay/${parts[1]}` : parts[0];
    const kind = kindByResource[resource];
    if (!kind) throw new Error(`Ação ainda não foi migrada para o Supabase: ${verb} ${cleanPath}`);

    if (verb === 'GET') {
      const rows = await readKind(kind);
      if (parts.length === 1) return rows;
      const row = rows.find((item) => String(item.id) === String(parts[1]) || String(item.code) === String(parts[1]));
      if (!row) throw new Error('Registro não encontrado.');
      return row;
    }

    if (verb === 'DELETE' && kind === 'clients') {
      const existing = (await readKind('clients')).find((row) => String(row.id) === String(parts[1]) || String(row.code) === String(parts[1]));
      if (!existing) throw new Error('Cliente não encontrado.');
      const customerId = await resolveCustomerId(existing.id);
      await saveRecord('clients', { ...existing, active: false, status: 'inactive' }, String(existing.id));
      if (customerId) {
        const { error: profileError } = await client.functions.invoke('admin-users', { body: { action: 'deactivate-client', clientId: String(existing.id) } });
        if (profileError) throw new Error(profileError.message);
      }
      return { ok: true };
    }
    if (verb === 'DELETE' && kind === 'contracts') {
      const { data: result, error } = await client.rpc('gsa_admin_delete_contract', { p_contract_id:String(parts[1]) });
      if (error) throw error;
      return result;
    }
    if (verb === 'DELETE') return deleteRecord(kind, String(parts[1]));
    if (!['POST', 'PUT', 'PATCH'].includes(verb)) throw new Error(`Método não suportado: ${verb}`);

    if (kind === 'proposals' && parts[2] === 'convert' && verb === 'PATCH') {
      const { data: contract, error } = await client.rpc('gsa_admin_convert_proposal', {
        p_proposal_id: String(parts[1]), p_contract: data || {}
      });
      if (error) throw error;
      return contract;
    }

    if (kind === 'clients' && verb === 'POST' && parts.length === 1) {
      const { data: created, error } = await client.functions.invoke('client-provision', { body: data || {} });
      if (error) throw new Error(error.message);
      return created;
    }

    if (kind === 'services' && verb === 'POST' && parts.length === 1) {
      return saveRecord(kind, { ...data, price: toCents(data?.price), active: data?.active ?? true });
    }
    if (kind === 'services' && parts.length === 2 && ['PATCH','PUT'].includes(verb)) {
      const existing = (await readKind(kind)).find((item) => String(item.id) === parts[1] || String(item.code) === parts[1]);
      if (!existing) throw new Error('Serviço não encontrado.');
      return saveRecord(kind, { ...existing, ...data, ...(data?.price !== undefined ? { price: toCents(data.price) } : {}) }, String(existing.id));
    }

    if (kind === 'proposals' && verb === 'POST' && parts.length === 1) {
      const [services, clients] = await Promise.all([readKind('services'), readKind('clients')]);
      const service = services.find((item) => String(item.id) === String(data?.serviceId) || String(item.code) === String(data?.serviceId));
      const customer = clients.find((item) => String(item.id) === String(data?.clientId) || String(item.code) === String(data?.clientId));
      if (!service) throw new Error('Serviço não encontrado.');
      if (!customer) throw new Error('Cliente não encontrado.');
      const pricing = commercial(data || {}, service);
      return saveRecord(kind, { ...data, clientId: customer.id, clientName: customer.name,
        status: 'Aguardando aceite', created: new Date().toISOString(), updatedAt: new Date().toISOString(),
        title: data?.title || service.name, description: data?.description || service.description || '',
        service: { ...service }, ...pricing });
    }

    if (kind === 'proposals' && parts.length === 2 && ['PATCH','PUT'].includes(verb)) {
      const existing = (await readKind(kind)).find((item) => String(item.id) === parts[1] || String(item.code) === parts[1]);
      if (!existing) throw new Error('Proposta não encontrada.');
      const services = await readKind('services');
      const service = services.find((item) => String(item.id) === String(data?.serviceId ?? existing.serviceId)) || existing.service;
      if (!service) throw new Error('Serviço vinculado à proposta não foi encontrado.');
      const previousExtra = Number(existing.extra || 0);
      const requestedExtra = data?.extra === undefined ? previousExtra / 100 : Number(data.extra);
      const revisionBase = data?.base === undefined
        ? Math.max(0, Number(existing.total || 0) + toCents(requestedExtra) - previousExtra) / 100
        : Number(data.base);
      const pricing = commercial({ ...data, base: revisionBase, extra: requestedExtra }, service);
      return saveRecord(kind, { ...existing, ...data, serviceId: service.id, service: { ...service }, ...pricing,
        status: 'Aguardando aceite', acceptedAt: null, updatedAt: new Date().toISOString(),
        revision: Number(existing.revision || 0) + 1 }, String(existing.id));
    }

    if (kind === 'invoices' && verb === 'POST' && parts.length === 1) {
      const total = toCents(data?.total);
      const count = Number(data?.installments || 1);
      const due = data?.first || new Date().toISOString().slice(0, 10);
      return saveRecord(kind, { ...data, total, originalTotal: total, status: 'Pendente', created: new Date().toISOString(),
        installments: invoiceInstallments(total, count, due), payments: [], changes: [] });
    }

    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    if (isFormData) {
      const fields: Row = {};
      let file: File | null = null;
      data.forEach((value: FormDataEntryValue, key: string) => {
        if (value instanceof File) file = value;
        else fields[key] = value;
      });
      const user = await profile();
      const previousRows = await readKind(kind);
      const existing = previousRows.find((item) => String(item.id) === String(parts[1]) || String(item.code) === String(parts[1]));
      if (!file && kind === 'tickets' && existing && user.role === 'admin') {
        const message = { id: crypto.randomUUID(), author: user.name, role: user.role, text: String(fields.text || ''), internal: fields.internal === 'true', at: new Date().toISOString(), files: [] };
        return saveRecord(kind, { ...existing, messages: [...(existing.messages || []), message], updatedAt: new Date().toISOString() }, String(existing.id));
      }
      if (!file) throw new Error('Selecione um arquivo antes de enviar.');
      const customerId = await resolveCustomerId(fields.clientId || existing?.clientId || user.customerUuid || user.clientId);
      if (!customerId) throw new Error('Não foi possível localizar o cliente deste arquivo.');
      const objectPath = `${customerId}/${kind}/${Date.now()}-${(file as File).name.replace(/[^\w.-]/g, '_')}`;
      const upload = await client.storage.from('gsa3-private').upload(objectPath, file as File, { upsert: false, contentType: (file as File).type });
      if (upload.error) throw new Error(upload.error.message);
      if (user.role === 'client' && ['documents','personal_documents'].includes(kind)) {
        const { data: uploaded, error } = await client.rpc('gsa_client_upload_document', {
          p_kind: kind,
          p_request_id: String(parts[1]),
          p_object_path: objectPath,
          p_file_name: (file as File).name,
          p_mime_type: (file as File).type,
          p_size: (file as File).size
        });
        if (error) {
          await client.storage.from('gsa3-private').remove([objectPath]);
          throw error;
        }
        return uploaded;
      }
      if (user.role === 'client' && kind === 'contracts') {
        const { data: uploaded, error } = await client.rpc('gsa_client_upload_contract', {
          p_contract_id: String(parts[1]), p_object_path: objectPath,
          p_file_name: (file as File).name, p_mime_type: (file as File).type, p_size: (file as File).size
        });
        if (error) {
          await client.storage.from('gsa3-private').remove([objectPath]);
          throw error;
        }
        return uploaded;
      }
      if (kind === 'proposals') {
        return saveRecord(kind, { ...(existing || {}), ...fields, pdfFileId: objectPath, pdfFileName: (file as File).name, pdfMimeType: (file as File).type, pdfSize: (file as File).size, updatedAt: new Date().toISOString() }, String(existing?.id || parts[1]));
      }
      if (kind === 'contracts') {
        return saveRecord(kind, { ...(existing || {}), ...fields, fileId: objectPath, fileName: (file as File).name, mimeType: (file as File).type, fileSize: (file as File).size, status: existing?.status || 'Pendente', updatedAt: new Date().toISOString() }, String(existing?.id || parts[1]));
      }
      if (kind === 'tickets') {
        const message = { id: crypto.randomUUID(), author: user.name, role: user.role, text: String(fields.text || ''), internal: fields.internal === 'true', at: new Date().toISOString(), files: [{ id: objectPath, fileId: objectPath, name: (file as File).name, mimeType: (file as File).type, size: (file as File).size }] };
        return saveRecord(kind, { ...(existing || {}), messages: [...(existing?.messages || []), message], updatedAt: new Date().toISOString() }, String(existing?.id || parts[1]));
      }
      return saveRecord(kind, {
        ...(existing || {}), ...fields,
        uploadedFileId: objectPath,
        uploadedFileName: (file as File).name,
        uploadedMimeType: (file as File).type,
        uploadedSize: (file as File).size,
        status: 'Em análise',
        uploadedAt: new Date().toISOString()
      }, String(parts[1]));
    }

    if (verb === 'POST' && parts.length === 1) return saveRecord(kind, data || {});
    const recordId = String(parts[1] || data?.id || '');
    if (!recordId) throw new Error('Código do registro não informado.');
    const current = await readKind(kind);
    const existing = current.find((item) => String(item.id) === recordId || String(item.code) === recordId);
    if (!existing && verb !== 'PUT') throw new Error('Registro não encontrado.');
    const updated = { ...(existing || {}), ...(data || {}) };

    if (kind === 'clients' && existing) {
      const customerId = await resolveCustomerId(existing.id);
      if (!customerId) throw new Error('Cadastro Supabase deste cliente não encontrado.');
      const taxDocument = String(updated.taxDocument || updated.cpfCnpj || updated.tax || '').replace(/\D/g, '');
      const { error } = await client.from('gsa_clients').update({
        name: String(updated.name || updated.companyName || existing.name), email: updated.email || null,
        phone: updated.phone || updated.telephone || null, status: String(updated.status || 'active').toLowerCase(),
        ...(taxDocument.length === 11 || taxDocument.length === 14 ? { tax_document: taxDocument, person_type: taxDocument.length === 14 ? 'PJ' : 'PF' } : {}),
        metadata: updated
      }).eq('id', customerId);
      if (error) throw new Error(error.message);
    }

    if (kind === 'documents' && parts[2] === 'approve') updated.status = 'Aprovado';
    if (kind === 'documents' && parts[2] === 'reject') updated.status = 'Rejeitado';
    if (kind === 'personal_documents' && parts[2] === 'approve') updated.status = 'Aprovado';
    if (kind === 'personal_documents' && parts[2] === 'reject') { updated.status = 'Rejeitado'; updated.rejectionReason = data?.reason || ''; }
    if (kind === 'tickets' && parts.length === 2) updated.status = data?.status ?? updated.status;
    if (kind === 'contracts' && parts[2] === 'sign') { updated.status = 'Assinado'; updated.signedAt = new Date().toISOString(); }
    if (kind === 'proposals' && parts[2] === 'cancel') updated.status = 'Cancelada';
    return saveRecord(kind, updated, recordId);
  } catch (error: any) {
    throw new Error(errorMessage(error));
  }
}

export const money = (n: any) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0) / 100);

export const date = (v: any) =>
  v ? new Date(String(v).length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR') : '—';

export const when = (v: any) => v ? new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
}).format(new Date(v)) : '—';

export const dateTime = (v: any) => v ? when(v).replace(', ', ' às ') : '—';

export const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

export const initials = (name: string = '') => name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

import { supabase } from './supabase';
import { callAdminRpc } from './adminRpc';
import type { AdminSupplierSnapshot, SupplierSnapshot } from '../types/supplier';

const SUPPLIER_BUCKET = 'documentos_fornecedor';
const SUPPLIER_PREFIX = `storage://${SUPPLIER_BUCKET}/`;
const INVOICE_EXTENSIONS = new Set(['pdf', 'xml']);
const PAYMENT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function extensionOf(file: File) {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

function ensureFile(file: File, allowed: Set<string>, label: string) {
  const extension = extensionOf(file);
  if (!allowed.has(extension)) throw new Error(`Formato inválido para ${label}.`);
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('O arquivo deve possuir no máximo 10 MB.');
  return extension;
}

function supplierReference(path: string) {
  return `${SUPPLIER_PREFIX}${path}`;
}

export async function getSupplierSnapshot() {
  const { data, error } = await supabase.rpc('gsa_supplier_dashboard_snapshot');
  if (error) throw error;
  return data as SupplierSnapshot;
}

export async function requestSupplierProduct(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('gsa_supplier_request_product', { p_payload: payload });
  if (error) throw error;
  return data as any;
}

export async function updateSupplierProfile(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('gsa_supplier_update_profile', { p_payload: payload });
  if (error) throw error;
  return data as any;
}

export async function markSupplierOrderSeen(orderId: string) {
  const { data, error } = await supabase.rpc('gsa_supplier_mark_order_seen', { p_order_id: orderId });
  if (error) throw error;
  return data as any;
}

export async function markSupplierNotificationRead(notificationId: string) {
  const { data, error } = await supabase.rpc('gsa_supplier_mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return data as any;
}

export async function markAllSupplierNotificationsRead() {
  const { data, error } = await supabase.rpc('gsa_supplier_mark_notifications_read');
  if (error) throw error;
  return data as any;
}

export async function submitSupplierDelivery(requestId: string, orderId: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('gsa_supplier_submit_delivery', {
    p_request_id: requestId,
    p_order_id: orderId,
    p_payload: payload,
  });
  if (error) throw error;
  return data as any;
}

export async function uploadSupplierInvoice(
  file: File,
  supplierId: string,
  orderId: string,
  requestId: string = crypto.randomUUID(),
) {
  const extension = ensureFile(file, INVOICE_EXTENSIONS, 'a nota fiscal');
  const path = `${supplierId}/notas-fiscais/${orderId}/${requestId}.${extension}`;
  const { error } = await supabase.storage.from(SUPPLIER_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || (extension === 'xml' ? 'application/xml' : 'application/pdf'),
    upsert: true,
  });
  if (error) throw error;
  return supplierReference(path);
}

export async function uploadAdminSupplierPaymentProof(
  file: File,
  supplierId: string,
  payableId: string,
) {
  const extension = ensureFile(file, PAYMENT_EXTENSIONS, 'o comprovante de pagamento');
  const path = `${supplierId}/comprovantes-pagamento/${payableId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(SUPPLIER_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || (extension === 'pdf' ? 'application/pdf' : `image/${extension === 'jpg' ? 'jpeg' : extension}`),
    upsert: false,
  });
  if (error) throw error;
  return supplierReference(path);
}

export async function resolveSupplierDocument(reference: string, expiresInSeconds = 300) {
  if (!reference.startsWith(SUPPLIER_PREFIX)) throw new Error('Referência de documento inválida.');
  const path = reference.slice(SUPPLIER_PREFIX.length);
  const { data, error } = await supabase.storage.from(SUPPLIER_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw error || new Error('Não foi possível abrir o documento.');
  return data.signedUrl;
}

export async function notifySupplierPortal(supplierId: string) {
  if (!supplierId) return;
  const channel = supabase.channel(`supplier-sync:${supplierId}`);
  try {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 1_500);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });
    await channel.send({ type: 'broadcast', event: 'refresh', payload: { supplierId } });
  } catch (error) {
    console.warn('Não foi possível emitir a atualização instantânea do fornecedor:', error);
  } finally {
    await supabase.removeChannel(channel);
  }
}

export async function getAdminSupplierSnapshot() {
  return callAdminRpc<AdminSupplierSnapshot>('gsa_admin_supplier_snapshot');
}

export async function setAdminSupplierStatus(supplierId: string, status: string, reason?: string, pin?: string) {
  const result = await callAdminRpc('gsa_admin_supplier_set_status', {
    p_supplier_id: supplierId,
    p_status: status,
    p_reason: reason || null,
    p_pin: pin || null,
  });
  await notifySupplierPortal(supplierId);
  return result;
}

export async function reviewAdminSupplierProduct(requestId: string, action: string, reason?: string, productPayload: Record<string, unknown> = {}) {
  return callAdminRpc('gsa_admin_review_supplier_product', {
    p_request_id: requestId,
    p_action: action,
    p_reason: reason || null,
    p_product_payload: productPayload,
  });
}

export async function createAdminSupplierOrder(requestId: string, supplierId: string, payload: Record<string, unknown>) {
  const result = await callAdminRpc('gsa_admin_create_supplier_order', {
    p_request_id: requestId,
    p_supplier_id: supplierId,
    p_payload: payload,
  });
  await notifySupplierPortal(supplierId);
  return result;
}

export async function reviewAdminSupplierDelivery(deliveryId: string, action: string, reason?: string) {
  return callAdminRpc('gsa_admin_review_supplier_delivery', {
    p_delivery_id: deliveryId,
    p_action: action,
    p_reason: reason || null,
  });
}

export async function updateAdminSupplierPayable(payableId: string, action: string, payload: Record<string, unknown> = {}) {
  return callAdminRpc('gsa_admin_update_supplier_payable', {
    p_payable_id: payableId,
    p_action: action,
    p_payload: payload,
  });
}

export async function reviewAdminSupplierBankChange(
  supplierId: string,
  approve: boolean,
  reason?: string,
) {
  const result = await callAdminRpc('gsa_admin_review_supplier_bank_change', {
    p_supplier_id: supplierId,
    p_approve: approve,
    p_reason: reason?.trim() || null,
  });
  await notifySupplierPortal(supplierId);
  return result;
}

export async function getAdminSupplierFinancialAnomalies() {
  return callAdminRpc<Array<Record<string, any>>>('gsa_admin_supplier_financial_anomalies');
}

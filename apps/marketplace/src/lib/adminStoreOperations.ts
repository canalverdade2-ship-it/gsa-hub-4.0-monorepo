import { callAdminRpc } from './adminRpc';
import type { ProductVariationsPayload } from '../types/productVariations';

export type StoreOrderStatus = 'pago' | 'em_expedicao' | 'em_transporte' | 'concluido';

export async function adjustAdminProductStock(input: {
  requestId: string;
  produtoId: string;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  motivo: string;
}) {
  return callAdminRpc<any>('gsa_admin_adjust_product_stock', {
    p_request_id: input.requestId,
    p_produto_id: input.produtoId,
    p_tipo: input.tipo,
    p_quantidade: input.quantidade,
    p_motivo: input.motivo,
  });
}

export async function transitionAdminStoreOrder(input: {
  requestId: string;
  ordemId: string;
  status: StoreOrderStatus;
  tracking?: { rastreavel: boolean; codigo: string };
}) {
  return callAdminRpc<any>(input.tracking ? 'gsa_admin_ship_store_order' : 'gsa_admin_transition_store_order', {
    p_request_id: input.requestId,
    p_ordem_compra_id: input.ordemId,
    p_novo_status: input.status,
    ...(input.tracking ? { p_rastreavel: input.tracking.rastreavel, p_codigo_rastreio: input.tracking.codigo } : {}),
  });
}

export async function cancelAdminStoreOrder(input: {
  requestId: string;
  ordemId: string;
  motivo: string;
}) {
  return callAdminRpc<any>('gsa_admin_cancel_store_order', {
    p_request_id: input.requestId,
    p_ordem_compra_id: input.ordemId,
    p_motivo: input.motivo,
  });
}

export async function activateAdminSubscription(input: {
  requestId: string;
  ordemId: string;
}) {
  return callAdminRpc<any>('gsa_admin_activate_subscription', {
    p_request_id: input.requestId,
    p_ordem_assinatura_id: input.ordemId,
  });
}

export async function saveAdminProductCatalog(input: {
  produtoId?: string | null;
  payload: Record<string, unknown>;
  fornecedor?: Record<string, unknown> | null;
  variacoes?: ProductVariationsPayload | null;
}) {
  return callAdminRpc<any>('gsa_admin_save_product_catalog_v2', {
    p_produto_id: input.produtoId || null,
    p_payload: input.payload,
    p_fornecedor: input.fornecedor || null,
    p_variacoes: input.variacoes === undefined ? null : input.variacoes,
  });
}

export async function saveAdminSubscriptionCatalog(input: {
  assinaturaId?: string | null;
  payload: Record<string, unknown>;
}) {
  return callAdminRpc<any>('gsa_admin_save_subscription_catalog', {
    p_assinatura_id: input.assinaturaId || null,
    p_payload: input.payload,
  });
}

export async function archiveAdminCatalogItems(
  tipo: 'produto' | 'assinatura',
  ids: string[],
) {
  if (!ids || ids.length === 0) return { success: true, updated: 0 };
  const res = await callAdminRpc<any>('gsa_admin_archive_catalog_items', { p_tipo: tipo, p_ids: ids });
  return { success: true, updated: Number(res?.updated ?? ids.length) };
}

export async function deleteAdminProductsBulk(ids: string[]) {
  if (!ids || ids.length === 0) return { success: true, deleted: 0 };
  const res = await callAdminRpc<any>('gsa_admin_delete_products_bulk', { p_ids: ids });
  return { success: true, deleted: Number(res?.total ?? res?.deleted ?? ids.length) };
}

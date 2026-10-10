import { callAdminRpc } from './adminRpc';

export type ShopeeJobStatus =
  | 'fila'
  | 'reservado'
  | 'validando'
  | 'divergencia'
  | 'preparando_carrinho'
  | 'aguardando_pagamento'
  | 'comprado'
  | 'acompanhando'
  | 'enviado'
  | 'em_rota'
  | 'entregue'
  | 'falha'
  | 'cancelado';

export interface ShopeeQueueSummary {
  queue: number;
  attention: number;
  payment: number;
  tracking: number;
  done: number;
}

export interface ShopeeQueueJob {
  id: string;
  status: ShopeeJobStatus;
  priority: number;
  order_id: string;
  order_code: string;
  customer_name: string;
  total: number;
  items_count: number;
  worker_name?: string | null;
  lease_expires_at?: string | null;
  attempts: number;
  max_attempts: number;
  divergences?: unknown[];
  last_error?: string | null;
  shopee_order_sn?: string | null;
  shopee_status?: string | null;
  tracking_code?: string | null;
  carrier?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopeeQueueResponse {
  summary: ShopeeQueueSummary;
  jobs: ShopeeQueueJob[];
}

export interface ShopeeWorkerSummary {
  id: string;
  name: string;
  status: 'ativo' | 'pausado' | 'revogado';
  mode: 'assistido' | 'observacao';
  last_seen_at?: string | null;
  created_at: string;
  revoked_at?: string | null;
}

export function fetchAdminShopeeQueue(status?: string | null) {
  return callAdminRpc<ShopeeQueueResponse>('gsa_admin_shopee_queue', {
    p_status: status || null,
  });
}

export function fetchAdminShopeeJob(jobId: string) {
  return callAdminRpc<any>('gsa_admin_shopee_job', { p_job_id: jobId });
}

export function updateAdminShopeeJob(jobId: string, status: ShopeeJobStatus, note?: string) {
  return callAdminRpc<{ success: boolean; job_id: string; status: ShopeeJobStatus }>(
    'gsa_admin_shopee_update_job',
    { p_job_id: jobId, p_status: status, p_note: note || null },
  );
}

export function fetchAdminShopeeWorkers() {
  return callAdminRpc<ShopeeWorkerSummary[]>('gsa_admin_shopee_workers');
}

export function createAdminShopeeWorker(name: string) {
  return callAdminRpc<{ success: boolean; worker_id: string; token: string; warning: string }>(
    'gsa_admin_shopee_create_worker',
    { p_nome: name },
  );
}

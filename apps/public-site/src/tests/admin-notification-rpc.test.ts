import { describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('../lib/clientRpc', () => ({ callClientRpc: rpc }));
vi.mock('../lib/sessionService', () => ({ sessionService: { getCurrentSession: () => ({ atorTipo: 'cliente', atorId: 'test-client' }) } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { notificationService } from '../lib/notificationService';

describe('Admin notification RPC contract', () => {
 it('uses the deployed client-to-admin signature without unsupported parameters', async () => {
   await notificationService.notifyAdmin('Pedido recebido', 'Pedido registrado', 'vendas', 'checkout_loja', { itemId: 'order-1' });
   expect(rpc).toHaveBeenCalledWith('gsa_client_notify_admin', expect.objectContaining({ p_item_id: 'order-1', p_acao_origem: 'checkout_loja' }));
   expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('p_tipo');
 });
 it('does not silently report delivery when the server rejects it', async () => {
   const error = new Error('Notification unavailable');
   rpc.mockRejectedValueOnce(error);
   const log = vi.spyOn(console, 'error').mockImplementation(() => {});
   try { await expect(notificationService.notifyAdmin('Pedido', 'Registro', 'vendas', 'checkout_loja')).rejects.toThrow(error); }
   finally { log.mockRestore(); }
 });
});

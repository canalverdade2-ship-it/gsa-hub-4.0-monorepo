import {describe,it,expect,vi} from 'vitest';
const {rpc,session}=vi.hoisted(()=>({rpc:vi.fn().mockResolvedValue({success:true}),session:{atorTipo:'cliente',atorId:'client-1'}}));
vi.mock('../lib/clientRpc',()=>({callClientRpc:rpc}));
vi.mock('../lib/sessionService',()=>({sessionService:{getCurrentSession:()=>session}}));
vi.mock('../lib/supabase',()=>({supabase:{from:()=>{throw Error('Direct database insert forbidden');}}}));
import {createNotification} from '../lib/notifications';
describe('Legacy notifications with client session',()=>{
 it('sends administrative alerts through the authorized RPC',async()=>{
  await createNotification(null,'Contestação','Fatura contestada','financeiro');
  expect(rpc).toHaveBeenLastCalledWith('gsa_client_notify_admin',expect.objectContaining({p_modulo:'financeiro'}));
 });
 it('sends acknowledgements to the current client through the self RPC',async()=>{
  await createNotification('client-1','Indicação','Indicação registrada','produtos');
  expect(rpc).toHaveBeenLastCalledWith('gsa_client_notify_self',expect.objectContaining({p_tipo:'sistema'}));
 });
 it('propagates delivery errors',async()=>{
  rpc.mockRejectedValueOnce(Error('offline'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {await expect(createNotification(null,'Aviso','Falha','financeiro')).rejects.toThrow('offline');} finally {log.mockRestore();}
 });
});

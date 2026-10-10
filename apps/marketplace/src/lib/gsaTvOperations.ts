import { sessionService } from './sessionService';
import { callAdminRpc } from './adminRpc';
const API=String(import.meta.env.VITE_GSA_TV_API_URL||'https://api.147-15-43-141.nip.io/gsa-tv').replace(/\/$/,'');
function auth(){const s=sessionService.getCurrentSession();if(!s?.sessaoId||!s?.sessionToken)throw new Error('Sua sessão administrativa expirou.');return{'x-gsa-session-id':s.sessaoId,'x-gsa-session-token':s.sessionToken}}
async function request(path:string){const r=await fetch(`${API}${path}`,{headers:auth()});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.error||`Operação recusada (${r.status}).`);return b}
export const getGsaTvStorageStatus=()=>request('/storage/status');
export const getGsaTvOperations=()=>callAdminRpc<any>('gsa_admin_gsa_tv_operations_snapshot');
export const saveGsaTvAlertSettings=(payload:Record<string,unknown>)=>callAdminRpc('gsa_admin_gsa_tv_operations_mutate',{p_action:'save_alert_settings',p_payload:payload});

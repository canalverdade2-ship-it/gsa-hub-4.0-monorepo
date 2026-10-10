import { sessionService } from './sessionService';
const API_BASE=String(import.meta.env.VITE_GSA_TV_API_URL||'https://api.147-15-43-141.nip.io/gsa-tv').replace(/\/$/,'');
export async function updateGsaTvLiveSourceCredentials(sourceId:string,connectionUrl:string){
 const session=sessionService.getCurrentSession();
 if(!session?.sessaoId||!session?.sessionToken)throw new Error('Sua sessão administrativa expirou. Entre novamente.');
 const response=await fetch(`${API_BASE}/live-sources/${encodeURIComponent(sourceId)}/credentials`,{method:'PUT',headers:{'content-type':'application/json','x-gsa-session-id':session.sessaoId,'x-gsa-session-token':session.sessionToken},body:JSON.stringify({connection_url:connectionUrl.trim()})});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body?.error||`Não foi possível proteger a fonte ao vivo (${response.status}).`);
 return body as {success:true;source_id:string;connection_configured:true};
}

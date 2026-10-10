import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5180',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const siteReturn = (code: string, result: string) => {
  const target = Deno.env.get('CLIENT_CONTRACTS_URL') || `${Deno.env.get('APP_ORIGIN') || 'http://localhost:5180'}/gsa3-supabase/cliente/contratos`;
  const url = new URL(target);
  url.searchParams.set('govbr_signature',result);
  if (code) url.searchParams.set('contract',code);
  return url.toString();
};
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const privileged = createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  if (request.method === 'POST') {
    try {
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i,'');
      if (!token) throw new Error('Sessão do cliente necessária.');
      const caller = createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
      const {data:auth,error:authError}=await caller.auth.getUser(token);
      if(authError||!auth.user) throw new Error('Sessão inválida.');
      const {data:profile,error:profileError}=await privileged.from('gsa_profiles').select('id,role,customer_id,full_name,active').eq('id',auth.user.id).single();
      if(profileError||!profile?.active||profile.role!=='client') throw new Error('A assinatura Gov.br deve ser iniciada pelo cliente.');
      const {contractId}=await request.json().catch(()=>({}));
      const {data:rows,error:rowError}=await privileged.from('gsa_legacy_records').select('id,payload').eq('kind','contracts').eq('customer_id',profile.customer_id);
      if(rowError) throw rowError;
      const record=(rows||[]).find((row:any)=>String(row.id)===String(contractId)||String(row.payload?.id)===String(contractId)||String(row.payload?.code)===String(contractId));
      if(!record) throw new Error('Contrato não encontrado para este cliente.');
      if(record.payload.status==='Assinado'&&record.payload.signatureMethod==='gov.br') throw new Error('Este contrato já foi assinado digitalmente.');
      if(!record.payload.fileId) throw new Error('O contrato ainda não tem um PDF no Supabase Storage. Gere ou envie o documento antes de assinar.');
      const config={
        clientId:Deno.env.get('GOVBR_SIGNATURE_CLIENT_ID')||'',clientSecret:Deno.env.get('GOVBR_SIGNATURE_CLIENT_SECRET')||'',
        redirectUri:Deno.env.get('GOVBR_SIGNATURE_REDIRECT_URI')||'',
        authorizeUrl:Deno.env.get('GOVBR_SIGNATURE_AUTHORIZE_URL')||'https://cas.staging.iti.br/oauth2.0/authorize',
        tokenUrl:Deno.env.get('GOVBR_SIGNATURE_TOKEN_URL')||'https://cas.staging.iti.br/oauth2.0/token',
        apiBaseUrl:(Deno.env.get('GOVBR_SIGNATURE_API_BASE_URL')||'https://assinatura-api.staging.iti.br').replace(/\/$/,''),
        scope:Deno.env.get('GOVBR_SIGNATURE_SCOPE')||'sign govbr'
      };
      if(!config.clientId||!config.clientSecret||!config.redirectUri) throw Object.assign(new Error('Integração Gov.br não configurada nas Edge Function Secrets.'),{status:503});
      const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
      const nonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
      const customer=(await privileged.from('gsa_clients').select('legacy_id').eq('id',profile.customer_id).single()).data;
      const stateData={nonce,userId:profile.id,userName:profile.full_name,customerId:profile.customer_id,legacyClientId:customer?.legacy_id,contractId:record.id,contractCode:record.payload.code,createdAt:new Date().toISOString()};
      const {error:stateError}=await privileged.from('gsa_govbr_signature_states').insert({state,value:stateData,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
      if(stateError) throw stateError;
      const authorizationUrl=new URL(config.authorizeUrl);
      authorizationUrl.searchParams.set('response_type','code');authorizationUrl.searchParams.set('client_id',config.clientId);
      authorizationUrl.searchParams.set('scope',config.scope);authorizationUrl.searchParams.set('redirect_uri',config.redirectUri);
      authorizationUrl.searchParams.set('state',state);authorizationUrl.searchParams.set('nonce',nonce);
      return Response.json({authorizationUrl:authorizationUrl.toString()},{headers:corsHeaders});
    } catch(error) {
      return Response.json({error:error instanceof Error?error.message:'Não foi possível iniciar a assinatura.'},{status:Number((error as any)?.status||400),headers:corsHeaders});
    }
  }

  if (request.method === 'GET') {
    const incoming=new URL(request.url),state=incoming.searchParams.get('state')||'',code=incoming.searchParams.get('code')||'';
    let contractCode='';
    try {
      const {data:row,error:stateError}=await privileged.from('gsa_govbr_signature_states').select('state,value,expires_at').eq('state',state).maybeSingle();
      if(stateError||!row||new Date(row.expires_at).getTime()<Date.now()) throw new Error('A autorização Gov.br expirou ou não foi encontrada.');
      const {error:removeError}=await privileged.from('gsa_govbr_signature_states').delete().eq('state',state);
      if(removeError) throw removeError;
      const pending=row.value; contractCode=String(pending.contractCode||'');
      if(incoming.searchParams.has('error')) throw new Error('A autorização Gov.br foi cancelada.');
      if(!code) throw new Error('O retorno Gov.br não trouxe um código de autorização.');
      const config={clientId:Deno.env.get('GOVBR_SIGNATURE_CLIENT_ID')||'',clientSecret:Deno.env.get('GOVBR_SIGNATURE_CLIENT_SECRET')||'',redirectUri:Deno.env.get('GOVBR_SIGNATURE_REDIRECT_URI')||'',tokenUrl:Deno.env.get('GOVBR_SIGNATURE_TOKEN_URL')||'https://cas.staging.iti.br/oauth2.0/token',apiBaseUrl:(Deno.env.get('GOVBR_SIGNATURE_API_BASE_URL')||'https://assinatura-api.staging.iti.br').replace(/\/$/,'')};
      const tokenResponse=await fetch(config.tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri}),signal:AbortSignal.timeout(20000)});
      const tokenData=await tokenResponse.json().catch(()=>({}));
      if(!tokenResponse.ok||!tokenData.access_token) throw new Error('Não foi possível obter a autorização de assinatura Gov.br.');
      const certificate=await fetch(`${config.apiBaseUrl}/externo/v2/certificadoPublico`,{headers:{Authorization:`Bearer ${tokenData.access_token}`,Accept:'application/x-pem-file,text/plain'},signal:AbortSignal.timeout(20000)});
      const certificateText=await certificate.text();
      if(!certificate.ok||!certificateText.trim()) throw Object.assign(new Error('A API Gov.br não liberou o certificado. A conta pode precisar do nível prata ou ouro.'),{upgrade:certificate.status===403&&/(bronze|prata|ouro)/i.test(certificateText)});
      const {data:contract,error:contractError}=await privileged.from('gsa_legacy_records').select('id,customer_id,payload').eq('kind','contracts').eq('id',pending.contractId).eq('customer_id',pending.customerId).single();
      if(contractError||!contract) throw new Error('Contrato não pertence ao cliente autorizado.');
      const objectPath=String(contract.payload.fileId||'');
      if(!objectPath) throw new Error('PDF de contrato ausente no armazenamento privado.');
      const {data:signed,error:signedError}=await privileged.storage.from('gsa3-private').createSignedUrl(objectPath,60);
      if(signedError||!signed?.signedUrl) throw new Error('Não foi possível acessar o PDF do contrato.');
      const pdfResponse=await fetch(signed.signedUrl);if(!pdfResponse.ok)throw new Error('Não foi possível carregar o PDF para assinatura.');
      const pdfBytes=new Uint8Array(await pdfResponse.arrayBuffer());
      const hashBase64=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',pdfBytes)));
      const signatureResponse=await fetch(`${config.apiBaseUrl}/externo/v2/assinarPKCS7`,{method:'POST',headers:{Authorization:`Bearer ${tokenData.access_token}`,'Content-Type':'application/json',Accept:'application/octet-stream'},body:JSON.stringify({hashBase64}),signal:AbortSignal.timeout(30000)});
      const signatureBytes=new Uint8Array(await signatureResponse.arrayBuffer());
      if(!signatureResponse.ok||!signatureBytes.length) throw Object.assign(new Error('A API Gov.br não concluiu a assinatura.'),{upgrade:signatureResponse.status===403});
      let p7s=signatureBytes;
      if((signatureResponse.headers.get('content-type')||'').includes('application/json')){try{const parsed=JSON.parse(new TextDecoder().decode(signatureBytes));const encoded=parsed.signatureBase64||parsed.pkcs7Base64||parsed.data;if(encoded)p7s=Uint8Array.from(atob(encoded),(c)=>c.charCodeAt(0));}catch{}}
      const signaturePath=`${pending.customerId}/contracts/signatures/${crypto.randomUUID()}.p7s`;
      const {error:uploadError}=await privileged.storage.from('gsa3-private').upload(signaturePath,p7s,{contentType:'application/pkcs7-signature',upsert:false});
      if(uploadError) throw uploadError;
      const next={...contract.payload,fileId:objectPath,signedFileId:objectPath,signedFileName:contract.payload.fileName||`${contractCode}.pdf`,signedSignatureFileId:signaturePath,signedSignatureFileName:`${contractCode}.p7s`,signatureMethod:'gov.br',signatureType:'detached',signatureHashAlgorithm:'SHA-256',signatureHashBase64:hashBase64,signedAt:new Date().toISOString(),status:'Assinado'};
      const {error:updateError}=await privileged.from('gsa_legacy_records').update({payload:next,updated_at:new Date().toISOString()}).eq('kind','contracts').eq('id',contract.id);
      if(updateError) throw updateError;
      await privileged.from('gsa_legacy_records').insert({id:`notice-${crypto.randomUUID()}`,kind:'notifications',customer_id:pending.customerId,payload:{id:crypto.randomUUID(),clientId:pending.legacyClientId,kind:'contracts',recordId:contract.id,recordCode:contractCode,audience:'client',read:false,message:`O contrato ${contractCode} foi assinado digitalmente via Gov.br.`,createdAt:new Date().toISOString()}});
      return Response.redirect(siteReturn(contractCode,'success'),303);
    } catch(error) {
      return Response.redirect(siteReturn(contractCode,(error as any)?.upgrade?'upgrade':'error'),303);
    }
  }
  return new Response('Method not allowed',{status:405,headers:corsHeaders});
});

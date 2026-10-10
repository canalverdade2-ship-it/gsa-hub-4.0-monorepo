const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5180',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error:'Método não permitido.' },{status:405,headers:corsHeaders});
  try {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i,'');
    if (!token) throw new Error('Sessão necessária.');
    const login = String((await request.json().catch(() => ({}))).cnpj || '').replace(/\D/g,'');
    if (login.length !== 14) throw new Error('Informe um CNPJ com 14 dígitos.');
    const baseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.0');
    const caller = createClient(baseUrl,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const { data: auth, error: authError } = await caller.auth.getUser(token);
    if (authError || !auth.user) throw new Error('Sessão inválida.');
    const { data: profile, error: profileError } = await caller.from('gsa_profiles').select('role,active').eq('id',auth.user.id).single();
    if (profileError || !profile?.active || profile.role !== 'admin') throw new Error('Consulta disponível somente para a equipe administrativa.');
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${login}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 404 ? 'CNPJ não encontrado.' : 'Não foi possível consultar os dados cadastrais agora.');
    const address = result.cep ? `${result.logradouro || ''}${result.numero ? `, ${result.numero}` : ''}${result.complemento ? ` - ${result.complemento}` : ''}, ${result.bairro || ''}, ${result.municipio || ''}/${result.uf || ''}, CEP ${result.cep}` : '';
    return Response.json({name:result.razao_social || result.nome_fantasia,companyName:result.razao_social,tradeName:result.nome_fantasia,tax:result.cnpj,email:result.email || '',phone:result.ddd_telefone_1 || result.ddd_telefone_2 || '',cep:result.cep || '',street:result.logradouro || '',number:result.numero || '',extra:result.complemento || '',district:result.bairro || '',city:result.municipio || '',state:result.uf || '',address},{headers:corsHeaders});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Falha na consulta de CNPJ.'},{status:400,headers:corsHeaders});
  }
}

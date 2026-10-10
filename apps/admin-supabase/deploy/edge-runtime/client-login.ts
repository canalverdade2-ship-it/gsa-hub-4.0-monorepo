import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5180',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function handleRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: corsHeaders });

  try {
    const { login } = await request.json();
    const prefix = String(login || '').replace(/\D/g, '');
    if (![5, 6].includes(prefix.length)) throw new Error('Não foi possível entrar. Confira o código e tente novamente.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const callerIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const keyDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${callerIp}|${prefix}`)));
    const keyHash = Array.from(keyDigest, value => value.toString(16).padStart(2,'0')).join('');
    const { data: attemptCount, error: rateLimitError } = await admin.rpc('gsa_consume_client_login_attempt', { p_key_hash:keyHash });
    if (rateLimitError || Number(attemptCount) > 10) throw new Error('Muitas tentativas. Aguarde 15 minutos e tente novamente.');

    // Preserve the existing client login rule while creating a real Supabase
    // Auth session. Ambiguous prefixes fail closed instead of selecting a user.
    const { data: clients, error: clientError } = await admin.from('gsa_clients')
      .select('id,tax_document').like('tax_document', `${prefix}%`).eq('status', 'active').limit(2);
    if (clientError || clients?.length !== 1) throw new Error('Não foi possível entrar. Confira o código e tente novamente.');

    const { data: profile, error: profileError } = await admin.from('gsa_profiles')
      .select('id,active').eq('customer_id', clients[0].id).eq('role', 'client').eq('active', true).maybeSingle();
    if (profileError || !profile?.active) throw new Error('Não foi possível entrar. Confira o código e tente novamente.');

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
    if (authUserError || !authUser.user?.email) throw new Error('Não foi possível entrar. Confira o código e tente novamente.');

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink', email: authUser.user.email
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new Error('Não foi possível iniciar a sessão. Tente novamente.');

    return Response.json({ token_hash: tokenHash }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível entrar.' }, { status: 400, headers: corsHeaders });
  }
}

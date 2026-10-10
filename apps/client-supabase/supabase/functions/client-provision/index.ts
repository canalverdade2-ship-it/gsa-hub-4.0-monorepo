import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'http://localhost:5180',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Método não permitido.' }, { status: 405, headers: corsHeaders });

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  if (!accessToken) return Response.json({ error: 'Sessão administrativa necessária.' }, { status: 401, headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } });
  const privileged = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let authUserId: string | null = null;
  let clientId: string | null = null;
  try {
    const { data: actor, error: actorError } = await caller.auth.getUser(accessToken);
    if (actorError || !actor.user) throw new Error('Sessão administrativa inválida.');
    const { data: canManage, error: permissionError } = await caller.rpc('gsa_admin_has_module', { p_module: 'clients' });
    if (permissionError || !canManage) throw new Error('Seu usuário não tem permissão para cadastrar clientes.');

    const body = await request.json();
    const name = String(body?.name || body?.companyName || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const taxDocument = String(body?.taxDocument || body?.cpfCnpj || body?.tax || '').replace(/\D/g, '');
    if (!name || !email || ![11, 14].includes(taxDocument.length)) throw new Error('Preencha nome, e-mail e CPF/CNPJ válidos.');

    const { data: nextNumber, error: sequenceError } = await caller.rpc('gsa_next_business_id', { p_kind: 'clients', p_start: 111 });
    if (sequenceError) throw sequenceError;
    const legacyId = String(nextNumber);
    const publicCode = `CL${legacyId}`;

    const { data: createdUser, error: createUserError } = await privileged.auth.admin.createUser({
      email,
      password: `${crypto.randomUUID()}!aA1`,
      email_confirm: true,
      user_metadata: { full_name: name, portal_role: 'client' }
    });
    if (createUserError || !createdUser.user) throw new Error(createUserError?.message || 'Não foi possível criar o acesso do cliente.');
    authUserId = createdUser.user.id;

    const { data: customer, error: customerError } = await privileged.from('gsa_clients').insert({
      legacy_id: legacyId,
      person_type: taxDocument.length === 14 ? 'PJ' : 'PF',
      tax_document: taxDocument,
      name,
      email,
      phone: body?.phone || body?.telephone || null,
      status: 'active',
      metadata: { ...body, id: Number(legacyId), code: publicCode }
    }).select('id').single();
    if (customerError || !customer) throw new Error(customerError?.message || 'Não foi possível salvar o cliente.');
    clientId = customer.id;

    const { error: profileError } = await privileged.from('gsa_profiles').insert({
      id: authUserId,
      role: 'client',
      admin_role: 'Cliente',
      permissions: '[]',
      customer_id: customer.id,
      email,
      full_name: name,
      active: true
    });
    if (profileError) throw new Error(profileError.message);

    const payload = { ...body, id: Number(legacyId), code: publicCode, active: true, created: new Date().toISOString() };
    const { error: recordError } = await privileged.from('gsa_legacy_records').upsert({
      id: legacyId, kind: 'clients', customer_id: customer.id, payload
    }, { onConflict: 'kind,id' });
    if (recordError) throw new Error(recordError.message);

    const folderRows = ['Contratos', 'Notas fiscais'].map((name) => {
      const folderId = crypto.randomUUID();
      return {
      id: folderId, kind: 'folders', customer_id: customer.id,
      payload: { id: folderId, clientId: legacyId, name, parentId: null }
      };
    });
    const { error: folderError } = await privileged.from('gsa_legacy_records').upsert(folderRows, { onConflict: 'kind,id' });
    if (folderError) throw new Error(folderError.message);

    return Response.json({ id: legacyId, code: publicCode, customerId: clientId }, { headers: corsHeaders });
  } catch (error) {
    if (authUserId) await privileged.auth.admin.deleteUser(authUserId);
    if (clientId) await privileged.from('gsa_clients').delete().eq('id', clientId);
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível cadastrar o cliente.' }, { status: 400, headers: corsHeaders });
  }
});
